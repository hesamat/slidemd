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
  /** @param {import('./edit-controller.js').EditController} ctrl */
  constructor(ctrl) {
    this.ctrl = ctrl;
  }

  get originalMarkdown() {
    return this.ctrl.originalMarkdown;
  }
  get unsavedMarkdown() {
    return this.ctrl.unsavedMarkdown;
  }
  get deck() {
    return this.ctrl.deck;
  }
  get currentSlideIndex() {
    return this.ctrl.currentSlideIndex;
  }
  get markdownEditor() {
    return this.ctrl.markdownEditor;
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
    this.ctrl.hasUnsavedChanges = true;
    this.ctrl.updateSaveButton();

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
    });
    Notification.success("Style applied to all slides");
  }

  async pickImage(onSelect) {
    const { ImagePicker } = await import("../image/image-picker.js");
    const { DeckImagesResolver } = await import("../image/deck-images-resolver.js");
    const deckDirHandle = await this.ctrl.imageBg._resolveDeckDirectoryHandle();
    DeckImagesResolver.setDeckDir(deckDirHandle, this.ctrl.imageBg.deckDirMode);
    ImagePicker.show(
      (path) => {
        onSelect(path);
      },
      {
        deckDirHandle,
        deckDirMode: this.ctrl.imageBg.deckDirMode,
        pathOnly: true,
      },
    );
  }
}
