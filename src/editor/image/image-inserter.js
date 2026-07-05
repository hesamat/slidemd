/**
 * ImageInserter
 *
 * Handles inserting images into slide markdown via the image picker,
 * drag-drop, and clipboard paste.
 */

import { ImagePicker } from "./image-picker.js";
import { DeckImagesResolver } from "./deck-images-resolver.js";

export class ImageInserter {
  /**
   * @param {object} opts
   * @param {() => object|null} opts.getMarkdownEditor
   * @param {() => boolean} opts.getIsEditMode
   * @param {() => number} opts.getCurrentSlideIndex
   * @param {() => HTMLElement|null} opts.getSlidesContainer
   * @param {(index: number) => HTMLElement|null} opts.getSlideElementByIndex
   * @param {() => object} opts.getImageBg
   * @param {() => object} opts.getAreaNav
   * @param {() => object} opts.getStageScale
   */
  constructor({
    getMarkdownEditor,
    getIsEditMode,
    getCurrentSlideIndex,
    getSlidesContainer,
    getSlideElementByIndex,
    getImageBg,
    getAreaNav,
    getStageScale,
  }) {
    this._getMarkdownEditor = getMarkdownEditor;
    this._getIsEditMode = getIsEditMode;
    this._getCurrentSlideIndex = getCurrentSlideIndex;
    this._getSlidesContainer = getSlidesContainer;
    this._getSlideElementByIndex = getSlideElementByIndex;
    this._getImageBg = getImageBg;
    this._getAreaNav = getAreaNav;
    this._getStageScale = getStageScale;
  }

  get markdownEditor() {
    return this._getMarkdownEditor();
  }
  get imageBg() {
    return this._getImageBg();
  }

  // ─── Image picker insertion ──────────────────────────────────

  async pickAndInsert() {
    if (!this.markdownEditor) return;

    const savedCursorPos = this.markdownEditor.view?.state?.selection?.main?.from ?? null;

    const deckDirHandle = await this.imageBg._resolveDeckDirectoryHandle();
    DeckImagesResolver.setDeckDir(deckDirHandle, this.imageBg.deckDirMode);

    ImagePicker.show(
      (snippet) => {
        const current = this.markdownEditor.getValue();
        const hasSavedPosition =
          savedCursorPos !== null && savedCursorPos >= 0 && savedCursorPos <= current.length;

        let insertPos;
        let afterSnippet;

        if (hasSavedPosition) {
          const pos = savedCursorPos;
          const isAtStart = pos === 0;
          const isAtEnd = pos >= current.length;
          const prevChar = isAtStart ? "\n" : current[pos - 1];
          const nextChar = isAtEnd ? "\n" : current[pos];

          const before = prevChar === "\n" ? "" : "\n\n";
          const after = isAtEnd ? "" : nextChar === "\n" ? "\n" : "\n\n";
          const leadTrim = isAtStart ? before.replace(/^\n+/, "") : before;

          insertPos = pos;
          afterSnippet = `${leadTrim}${snippet}${after}`;
        } else {
          const footerIdx = current.search(/^@footer\b/m);
          if (footerIdx > 0) {
            insertPos = footerIdx;
            afterSnippet = `${snippet}\n\n`;
          } else {
            insertPos = current.length;
            afterSnippet = `\n\n${snippet}\n`;
          }
        }

        this.markdownEditor.replaceRange(insertPos, insertPos, afterSnippet);
        this.markdownEditor.focus();
      },
      {
        deckDirHandle,
        deckDirMode: this.imageBg.deckDirMode,
        onChangeFolder: async () => {
          await this.imageBg.clearDeckDirectoryHandle();
          const next = await this.imageBg._resolveDeckDirectoryHandle();
          if (next) DeckImagesResolver.setDeckDir(next, this.imageBg.deckDirMode);
          return next ? { handle: next, mode: this.imageBg.deckDirMode } : null;
        },
      },
    );
  }

  // ─── Drag-drop and clipboard paste ───────────────────────────

  initDropAndPaste(slidesContainer) {
    slidesContainer.addEventListener("dragover", (e) => {
      if (!this._getIsEditMode()) return;
      const types = [...(e.dataTransfer?.types || [])];
      const items = [...(e.dataTransfer?.items || [])];
      const hasImagePath = types.includes("text/x-webdeck-image");
      const hasImageFile = items.some((i) => i.kind === "file" && i.type.startsWith("image/"));
      if (hasImagePath || hasImageFile) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    });

    slidesContainer.addEventListener("drop", async (e) => {
      if (!this._getIsEditMode()) return;
      e.preventDefault();
      e.stopPropagation();

      const dirHandle = await this.imageBg._resolveDeckDirectoryHandle();
      if (dirHandle) {
        DeckImagesResolver.setDeckDir(dirHandle, this.imageBg.deckDirMode);
      }

      let imgPath = e.dataTransfer.getData("text/x-webdeck-image");
      if (!imgPath) {
        const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
        if (file) {
          imgPath = await this.imageBg.uploadImage(file);
        }
      }
      if (!imgPath) return;

      this._insertImageAtDropPosition(imgPath, e.clientX, e.clientY, e.target);
    });

    slidesContainer.addEventListener("paste", async (e) => {
      if (!this._getIsEditMode()) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const dirHandle = await this.imageBg._resolveDeckDirectoryHandle();
            if (dirHandle) {
              DeckImagesResolver.setDeckDir(dirHandle, this.imageBg.deckDirMode);
            }
            const imgPath = await this.imageBg.uploadImage(file);
            if (imgPath) {
              const slideEl = this._getSlideElementByIndex(this._getCurrentSlideIndex());
              const grid = slideEl?.querySelector(".slide__grid");
              if (grid) {
                const rect = grid.getBoundingClientRect();
                this._insertImageAtDropPosition(
                  imgPath,
                  rect.left + rect.width / 2,
                  rect.top + rect.height / 2,
                  slideEl,
                );
              }
            }
          }
          return;
        }
      }
    });
  }

  /**
   * Insert an image at the given screen coordinates, computing
   * design-space position relative to the slide grid.
   */
  _insertImageAtDropPosition(imgPath, clientX, clientY, eventTarget) {
    const slideEl =
      eventTarget.closest?.(".slide") || this._getSlideElementByIndex(this._getCurrentSlideIndex());
    if (!slideEl) return;
    const grid = slideEl.querySelector(".slide__grid");
    if (!grid) return;

    const scale = this._getStageScale() || 1;
    const gridRect = grid.getBoundingClientRect();

    const dropGridX = (clientX - gridRect.left) / scale;
    const dropGridY = (clientY - gridRect.top) / scale;

    const areaEl = eventTarget.closest?.(".slide__area");
    const areaName = areaEl?.dataset.areaName || "main";

    let left = Math.round(dropGridX);
    let top = Math.round(dropGridY);
    if (areaEl) {
      const areaRect = areaEl.getBoundingClientRect();
      const areaStyle = getComputedStyle(areaEl);
      const padLeft = parseFloat(areaStyle.paddingLeft) || 0;
      const padTop = parseFloat(areaStyle.paddingTop) || 0;
      const areaContentLeft = (areaRect.left + padLeft - gridRect.left) / scale;
      const areaContentTop = (areaRect.top + padTop - gridRect.top) / scale;
      left = Math.round(dropGridX - areaContentLeft);
      top = Math.round(dropGridY - areaContentTop);
    }

    const alt =
      imgPath
        .split("/")
        .pop()
        .replace(/\.[^.]+$/, "")
        .replace(/^\d+[-_]?/, "") || "image";
    const snippet = `<img src="${imgPath}" alt="${alt}" style="position: relative; left: ${left}px; top: ${top}px; width: 480px; border: none; object-fit: contain; cursor: move;" />`;

    const markdown = this.markdownEditor?.getValue() ?? "";
    const range = this._getAreaNav().getAreaContentRange(markdown, areaName);
    const insertText = `${snippet}\n`;
    this.markdownEditor?.replaceRange(range.to, range.to, insertText);
  }
}
