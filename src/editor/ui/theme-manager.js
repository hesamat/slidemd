/**
 * ThemeManager
 *
 * Handles theme toggling (light/dark) for the current slide.
 * Extracted from EditController.
 */
import { MarkdownParser } from "../../data/markdown-parser.js";
import { updateThemeDirective } from "../core/directive-utils.js";

export class ThemeManager {
  /** @param {import('./edit-controller.js').EditController} ctrl */
  constructor(ctrl) {
    this.ctrl = ctrl;
  }

  get markdownEditor() {
    return this.ctrl.markdownEditor;
  }
  get deck() {
    return this.ctrl.deck;
  }
  get currentSlideIndex() {
    return this.ctrl.currentSlideIndex;
  }

  toggle() {
    if (!this.markdownEditor) return;
    const markdown = this.markdownEditor.getValue();
    const parser = new MarkdownParser();
    const currentTheme = parser.extractDirective(markdown, "theme").value?.toLowerCase() || "";
    const next = currentTheme === "dark" ? "light" : "dark";
    const updated = updateThemeDirective(markdown, next);
    this.markdownEditor.setValue(updated, { suppressOnChange: false });
    this.ctrl.updatePreview();
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
