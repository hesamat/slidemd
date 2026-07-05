/**
 * ThemeManager
 *
 * Handles theme toggling (light/dark) for the current slide.
 * Extracted from EditController.
 */
import { MarkdownParser } from "../../data/markdown-parser.js";
import { updateThemeDirective } from "../core/directive-utils.js";

export class ThemeManager {
  /**
   * @param {object} opts
   * @param {() => object|null} opts.getMarkdownEditor
   * @param {() => object} opts.getDeck
   * @param {() => number} opts.getCurrentSlideIndex
   * @param {() => Promise<void>} opts.onPreviewUpdate
   */
  constructor({ getMarkdownEditor, getDeck, getCurrentSlideIndex, onPreviewUpdate }) {
    this._getMarkdownEditor = getMarkdownEditor;
    this._getDeck = getDeck;
    this._getCurrentSlideIndex = getCurrentSlideIndex;
    this._onPreviewUpdate = onPreviewUpdate;
  }

  get markdownEditor() {
    return this._getMarkdownEditor();
  }
  get deck() {
    return this._getDeck();
  }
  get currentSlideIndex() {
    return this._getCurrentSlideIndex();
  }

  toggle() {
    if (!this.markdownEditor) return;
    const markdown = this.markdownEditor.getValue();
    const parser = new MarkdownParser();
    const currentTheme = parser.extractDirective(markdown, "theme").value?.toLowerCase() || "";
    const next = currentTheme === "dark" ? "light" : "dark";
    const updated = updateThemeDirective(markdown, next);
    this.markdownEditor.setValue(updated, { suppressOnChange: true });
    this._onPreviewUpdate();
    this.deck.slides[this.currentSlideIndex].theme = next;
    this._syncMenuItemIcon(next);
  }

  _syncMenuItemIcon(theme) {
    const btn = document.getElementById("toggleThemeMenuItem");
    if (!btn) return;
    const sunIcon = btn.querySelector(".theme-icon-light");
    const moonIcon = btn.querySelector(".theme-icon-dark");
    if (sunIcon) sunIcon.style.display = theme === "dark" ? "" : "none";
    if (moonIcon) moonIcon.style.display = theme === "dark" ? "none" : "";
  }
}
