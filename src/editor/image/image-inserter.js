/**
 * ImageInserter
 *
 * Handles inserting images into slide markdown via the image picker,
 * drag-drop, and clipboard paste.
 * Uses AbortController for clean teardown of drag/drop/paste listeners.
 */

import { ImagePicker } from "./image-picker.js";

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
    this._abortController = null;
  }

  get markdownEditor() {
    return this._getMarkdownEditor();
  }
  get imageBg() {
    return this._getImageBg();
  }

  // ─── Image insertion ──────────────────────────────────────

  async pickAndInsert() {
    if (!this.markdownEditor) return;

    const savedCursorPos = this.markdownEditor.view?.state?.selection?.main?.from ?? null;

    ImagePicker.show((snippet, areaName) => {
      const current = this.markdownEditor.getValue();
      const range = this._getAreaNav().getAreaContentRange(current, areaName);

      let insertPos;
      let afterSnippet;

      const posInArea =
        savedCursorPos !== null && savedCursorPos >= range.from && savedCursorPos <= range.to;

      if (posInArea) {
        // Cursor is inside the target area — insert at the cursor.
        const pos = savedCursorPos;
        const isAtEnd = pos >= current.length;
        const prevChar = pos === 0 ? "\n" : current[pos - 1];
        const nextChar = isAtEnd ? "\n" : current[pos];

        const before = prevChar === "\n" ? "" : "\n\n";
        const after = isAtEnd ? "" : nextChar === "\n" ? "\n" : "\n\n";

        insertPos = pos;
        afterSnippet = `${before}${snippet}${after}`;
      } else {
        // Cursor is outside the target area (or missing). Insert at the end of
        // the area so the image ends up in the right section instead of the
        // frontmatter or the top of the deck.
        insertPos = range.to;
        const isAtEnd = insertPos >= current.length;
        afterSnippet = isAtEnd ? `\n\n${snippet}\n` : `\n\n${snippet}\n\n`;
      }

      this.markdownEditor.replaceRange(insertPos, insertPos, afterSnippet);
      this.markdownEditor.focus();
    });
  }

  /**
   * Insert a markdown snippet at the correct cursor position.
   * @param {string} snippet
   */
  _insertSnippet(snippet) {
    const current = this.markdownEditor.getValue();
    const savedCursorPos = this.markdownEditor.view?.state?.selection?.main?.from ?? null;
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
  }

  // ─── Drag-drop and clipboard paste ───────────────────────────

  initDropAndPaste(slidesContainer) {
    this._abortController = new AbortController();
    const { signal } = this._abortController;

    slidesContainer.addEventListener(
      "dragover",
      (e) => {
        if (!this._getIsEditMode()) return;
        const types = [...(e.dataTransfer?.types || [])];
        const items = [...(e.dataTransfer?.items || [])];
        const hasImagePath = types.includes("text/x-webdeck-image");
        const hasImageFile = items.some((i) => i.kind === "file" && i.type.startsWith("image/"));
        if (hasImagePath || hasImageFile) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      },
      { signal },
    );

    slidesContainer.addEventListener(
      "drop",
      async (e) => {
        if (!this._getIsEditMode()) return;
        e.preventDefault();
        e.stopPropagation();

        let imgPath = e.dataTransfer.getData("text/x-webdeck-image");
        if (!imgPath) {
          const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
          if (file) {
            imgPath = await this.imageBg.uploadImage(file);
          }
        }
        if (!imgPath) return;

        this._insertImageAtDropPosition(imgPath, e.clientX, e.clientY, e.target);
      },
      { signal },
    );

    slidesContainer.addEventListener(
      "paste",
      async (e) => {
        if (!this._getIsEditMode()) return;
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
          if (item.type.startsWith("image/")) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) {
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
      },
      { signal },
    );
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

    const areaEl = eventTarget.closest?.(".slide__area");
    const areaName = areaEl?.dataset.areaName || "main";

    const targetArea = areaEl || slideEl.querySelector(".slide__area[data-area-name='main']");
    const targetCs = targetArea ? getComputedStyle(targetArea) : null;
    const areaWidth = targetArea
      ? (targetArea.getBoundingClientRect().width -
          (parseFloat(targetCs.paddingLeft) || 0) -
          (parseFloat(targetCs.paddingRight) || 0)) /
        scale
      : 480;
    const width = Math.round(areaWidth);

    const areaHeight = targetArea
      ? (targetArea.getBoundingClientRect().height -
          (parseFloat(targetCs.paddingTop) || 0) -
          (parseFloat(targetCs.paddingBottom) || 0)) /
        scale
      : 480;
    const maxHeight = Math.round(areaHeight);

    const alt =
      imgPath
        .split("/")
        .pop()
        .replace(/\.[^.]+$/, "")
        .replace(/^\d+[-_]?/, "") || "image";
    const snippet = `<img class="img-positioned" src="${imgPath}" alt="${alt}" style="position: relative; left: 0px; top: 0px; width: ${width}px; max-height: ${maxHeight}px; border: none; object-fit: contain; cursor: move;" />`;

    const markdown = this.markdownEditor?.getValue() ?? "";
    const range = this._getAreaNav().getAreaContentRange(markdown, areaName);
    const insertText = `${snippet}\n`;
    this.markdownEditor?.replaceRange(range.to, range.to, insertText);
  }

  destroy() {
    this._abortController?.abort();
    this._abortController = null;
  }
}
