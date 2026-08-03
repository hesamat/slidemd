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
import { AssetLoader } from "../../core/asset-loader.js";
import { SlideRenderer } from "../../renderer/slide-renderer.js";
import { Notification } from "../../renderer/notification.js";

export class StyleApplier {
  /**
   * @param {object} opts
   * @param {() => string[]} opts.getOriginalMarkdown
   * @param {() => Map} opts.getUnsavedMarkdown
   * @param {(v: Map) => void} opts.setUnsavedMarkdown
   * @param {() => object} opts.getDeck
   * @param {() => number} opts.getCurrentSlideIndex
   * @param {() => object|null} opts.getMarkdownEditor
   * @param {(v: boolean) => void} opts.setHasUnsavedChanges
   * @param {() => void} opts.onUpdateSaveButton
   * @param {() => object} opts.getImageBg
   */
  constructor({
    getOriginalMarkdown,
    getUnsavedMarkdown,
    setUnsavedMarkdown,
    getDeck,
    getCurrentSlideIndex,
    getMarkdownEditor,
    setHasUnsavedChanges,
    onUpdateSaveButton,
    getImageBg,
  }) {
    this._getOriginalMarkdown = getOriginalMarkdown;
    this._getUnsavedMarkdown = getUnsavedMarkdown;
    this._setUnsavedMarkdown = setUnsavedMarkdown;
    this._getDeck = getDeck;
    this._getCurrentSlideIndex = getCurrentSlideIndex;
    this._getMarkdownEditor = getMarkdownEditor;
    this._setHasUnsavedChanges = setHasUnsavedChanges;
    this._onUpdateSaveButton = onUpdateSaveButton;
    this._getImageBg = getImageBg;
  }

  get originalMarkdown() {
    return this._getOriginalMarkdown();
  }
  get unsavedMarkdown() {
    return this._getUnsavedMarkdown();
  }
  set unsavedMarkdown(v) {
    this._setUnsavedMarkdown(v);
  }
  get deck() {
    return this._getDeck();
  }
  get currentSlideIndex() {
    return this._getCurrentSlideIndex();
  }
  get markdownEditor() {
    return this._getMarkdownEditor();
  }

  async applyToAll(cssString, headerStyle, background, theme) {
    const parser = new MarkdownParser();
    await AssetLoader.ensureMarkdownItLoaded();
    const total = this.originalMarkdown.length;
    for (let i = 0; i < total; i++) {
      const current = this.unsavedMarkdown.get(i) ?? this.originalMarkdown[i] ?? "";

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

      this.unsavedMarkdown.set(i, withoutTheme);
    }
    this._setHasUnsavedChanges(true);
    this._onUpdateSaveButton();

    const slidesContainer = document.getElementById("slidesContainer");
    if (slidesContainer) {
      const allSlideEls = slidesContainer.querySelectorAll(":scope > .slide");
      for (let i = 0; i < allSlideEls.length; i++) {
        const md = this.unsavedMarkdown.get(i) ?? this.originalMarkdown[i] ?? "";
        const fullDeckData = parser.parseDeckMarkdown(md);
        const slideData = fullDeckData.slides?.[0];
        if (!slideData) continue;
        this.deck.slides[i] = slideData;
        const wasActive = allSlideEls[i].classList.contains("active");
        const newEl = SlideRenderer.createSlideElement(this.deck, slideData, i, wasActive);
        allSlideEls[i].replaceWith(newEl);
      }
    }

    this.markdownEditor?.setValue(this.unsavedMarkdown.get(this.currentSlideIndex) ?? "", {
      suppressOnChange: true,
      recordHistory: false,
    });
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
