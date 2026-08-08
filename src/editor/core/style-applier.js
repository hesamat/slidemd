/**
 * StyleApplier
 *
 * Applies style directives (area-style, header-style, background, theme)
 * to all slides in the deck, and provides image picking for the style panel.
 *
 * Extracted from EditController._applySlideStyleToAll() and
 * EditController._pickImageForStylePanel().
 */

import { MarkdownParser } from "../../data/markdown-parser.js";
import { Notification } from "../../renderer/notification.js";
import { createEditPatch } from "../../data/store/slide-patch.js";

export class StyleApplier {
  /**
   * @param {object} opts
   * @param {() => object} opts.getSaveManager
   * @param {() => import('../../data/store/deck-store.js').DeckStore|null} opts.getDeckStore
   * @param {() => Map} opts.getUnsavedMarkdown
   * @param {(v: Map) => void} opts.setUnsavedMarkdown
   * @param {(v: boolean) => void} opts.setHasUnsavedChanges
   * @param {() => void} opts.onUpdateSaveButton
   * @param {() => object} opts.getImageBg
   * @param {() => void} [opts.prepareStoreOperation]
   */
  constructor({
    getSaveManager,
    getDeckStore,
    getUnsavedMarkdown,
    setUnsavedMarkdown,
    setHasUnsavedChanges,
    onUpdateSaveButton,
    getImageBg,
    prepareStoreOperation = null,
  }) {
    this._getSaveManager = getSaveManager;
    this._getDeckStore = getDeckStore;
    this._getUnsavedMarkdown = getUnsavedMarkdown;
    this._setUnsavedMarkdown = setUnsavedMarkdown;
    this._setHasUnsavedChanges = setHasUnsavedChanges;
    this._onUpdateSaveButton = onUpdateSaveButton;
    this._getImageBg = getImageBg;
    this._prepareStoreOperation = prepareStoreOperation;
  }

  get saveManager() {
    return this._getSaveManager();
  }
  get deckStore() {
    return this._getDeckStore();
  }
  get unsavedMarkdown() {
    return this._getUnsavedMarkdown();
  }
  set unsavedMarkdown(v) {
    this._setUnsavedMarkdown(v);
  }

  _applyStyleToMarkdown(current, cssString, headerStyle, background, theme) {
    const parser = new MarkdownParser();
    const { value: layout } = parser.extractDirective(current, "layout");
    const isTitleSlide = layout === "title-slide";

    // Skip area-style for title slides — they don't have grid areas
    let { markdown: stripped } = parser.extractDirective(current, "area-style");
    const trimmedCss = String(cssString || "").trim();
    if (trimmedCss && !isTitleSlide) {
      stripped = `area-style: ${trimmedCss}\n${stripped}`;
    }

    let { markdown: withoutHeaderStyle } = parser.extractDirective(stripped, "header-style");
    const trimmedHeaderStyle = String(headerStyle || "")
      .trim()
      .toLowerCase();
    if (trimmedHeaderStyle && trimmedHeaderStyle !== "line") {
      withoutHeaderStyle = `header-style: ${trimmedHeaderStyle}\n${withoutHeaderStyle}`;
    }

    let { markdown: withoutBg } = parser.extractDirective(withoutHeaderStyle, "background");
    const trimmedBg = String(background || "").trim();
    if (trimmedBg) {
      // Multi-line values (gradients, layered backgrounds) should keep working.
      const indented = trimmedBg
        .split("\n")
        .map((line, i) => (i === 0 ? line : `  ${line}`))
        .join("\n");
      withoutBg = `background: ${indented}\n${withoutBg}`;
    }

    let { markdown: withoutTheme } = parser.extractDirective(withoutBg, "theme");
    const trimmedTheme = String(theme || "")
      .trim()
      .toLowerCase();
    if (trimmedTheme) {
      withoutTheme = `theme: ${trimmedTheme}\n${withoutTheme}`;
    }

    return withoutTheme;
  }

  async applyToAll(cssString, headerStyle, background, theme) {
    this._prepareStoreOperation?.();

    const storeSlides = this.deckStore.getSlides().map((markdown, index) => ({
      index,
      markdown,
    }));
    const fullSlides = this.saveManager.getFullSlides(storeSlides);

    const patches = [];
    for (let i = 0; i < fullSlides.length; i++) {
      const current = fullSlides[i].markdown ?? "";
      const next = this._applyStyleToMarkdown(current, cssString, headerStyle, background, theme);
      if (next !== current) {
        patches.push(createEditPatch(i, current, next, "user"));
      }
    }

    if (patches.length === 0) {
      Notification.info("No style changes to apply");
      return;
    }

    const result = this.deckStore.applyPatches(patches);
    if (!result || (typeof result === "object" && result.success === false)) {
      Notification.warning("Style changes could not be applied. Please try again.");
      return;
    }

    this.unsavedMarkdown.clear();
    this._setHasUnsavedChanges(true);
    this._onUpdateSaveButton();
    Notification.success("Style applied to all slides");
  }

  async pickImage(onSelect) {
    // Use native file picker, upload via API
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      // Upload via CLI server API
      try {
        const formData = new FormData();
        formData.append("image", file);
        const res = await fetch("/api/upload-image", { method: "POST", body: formData });
        if (res.ok) {
          const result = await res.json();
          if (result.path) {
            onSelect(result.path);
            return;
          }
        }
      } catch {
        // Fall through to blob URL fallback
      }

      // Fallback: blob URL (for browser-only mode without CLI server)
      const blobUrl = URL.createObjectURL(file);
      onSelect(blobUrl);
    };
    input.click();
  }
}
