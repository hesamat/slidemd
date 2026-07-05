/**
 * SaveManager
 *
 * Handles saving the deck to a file (File System Access API or Blob download).
 * Extracted from EditController.
 */
import { Notification } from "../../renderer/notification.js";

export class SaveManager {
  /**
   * @param {object} opts
   * @param {() => object} opts.getDeck
   * @param {() => Map} opts.getUnsavedMarkdown
   * @param {() => string[]} opts.getOriginalMarkdown
   * @param {() => boolean} opts.getHasUnsavedChanges
   * @param {(v: boolean) => void} opts.setHasUnsavedChanges
   */
  constructor({
    getDeck,
    getUnsavedMarkdown,
    getOriginalMarkdown,
    getHasUnsavedChanges,
    setHasUnsavedChanges,
  }) {
    this._getDeck = getDeck;
    this._getUnsavedMarkdown = getUnsavedMarkdown;
    this._getOriginalMarkdown = getOriginalMarkdown;
    this._getHasUnsavedChanges = getHasUnsavedChanges;
    this._setHasUnsavedChanges = setHasUnsavedChanges;
  }

  get deck() {
    return this._getDeck();
  }
  get hasUnsavedChanges() {
    return this._getHasUnsavedChanges();
  }
  set hasUnsavedChanges(v) {
    this._setHasUnsavedChanges(v);
  }
  get unsavedMarkdown() {
    return this._getUnsavedMarkdown();
  }
  get originalMarkdown() {
    return this._getOriginalMarkdown();
  }

  /**
   * Update the save state.  The save action is now triggered from the
   * main app menu (top-bar dropdown) rather than a button next to the
   * markdown editor, so this method is currently a no-op kept for API
   * compatibility.
   */
  updateButton() {
    // no-op (save button removed from editor body header; lives in main menu)
  }

  async save() {
    for (let i = 0; i < this.deck.slides.length; i++) {
      if (this.unsavedMarkdown.has(i)) {
        this.originalMarkdown[i] = this.unsavedMarkdown.get(i);
      }
    }

    this.unsavedMarkdown.clear();
    this.hasUnsavedChanges = false;
    this.updateButton();

    try {
      const fullMarkdown = this.originalMarkdown.join("\n\n---\n\n");

      if (window.showSaveFilePicker) {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: "deck.md",
          types: [
            {
              description: "Markdown file",
              accept: { "text/markdown": [".md"] },
            },
            {
              description: "Text file",
              accept: { "text/plain": [".txt"] },
            },
          ],
        });

        if (!fileHandle) return;

        const writable = await fileHandle.createWritable();
        await writable.write(fullMarkdown);
        await writable.close();

        Notification.success("Deck saved successfully!");
      } else {
        const blob = new Blob([fullMarkdown], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "deck.md";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Failed to save file:", error);
        Notification.error("Failed to save file: " + (error.message || error));
      }
    }
  }
}
