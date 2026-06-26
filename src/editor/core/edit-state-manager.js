/**
 * EditStateManager
 *
 * Manages the unsaved markdown cache and original markdown state.
 * Extracted from EditController.
 */
import { MarkdownParser } from "../data/markdown-parser.js";

export class EditStateManager {
  /** @param {import('./edit-controller.js').EditController} ctrl */
  constructor(ctrl) {
    this.ctrl = ctrl;
    this.originalMarkdown = this._cacheOriginalMarkdown();
    this.unsavedMarkdown = new Map();
  }

  /**
   * Cache original markdown from localStorage for all slides.
   */
  _cacheOriginalMarkdown() {
    const localFile = localStorage.getItem("webdeck_local_file");
    if (!localFile) return [];

    try {
      const parser = new MarkdownParser();
      return parser.splitSlides(localFile);
    } catch (error) {
      console.error("Failed to cache markdown:", error);
      return [];
    }
  }

  /**
   * Get the markdown for a slide, preferring unsaved changes.
   */
  getSlideMarkdown(slideIndex) {
    return this.unsavedMarkdown.get(slideIndex) ?? this.originalMarkdown[slideIndex] ?? "";
  }

  /**
   * Mark a slide as having unsaved changes.
   */
  setUnsaved(slideIndex, markdown) {
    this.unsavedMarkdown.set(slideIndex, markdown);
  }

  /**
   * Clear all unsaved changes.
   */
  clearUnsaved() {
    this.unsavedMarkdown.clear();
  }

  /**
   * Whether any slide has unsaved changes.
   */
  get hasUnsavedChanges() {
    return this.unsavedMarkdown.size > 0;
  }

  /**
   * Recache original markdown (e.g. after deck replacement).
   */
  recacheOriginal() {
    this.originalMarkdown = this._cacheOriginalMarkdown();
  }
}
