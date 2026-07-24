/**
 * SaveManager
 *
 * Handles saving the deck to a file (File System Access API or Blob download).
 * Extracted from EditController.
 */
import { Notification } from "../../renderer/notification.js";
import { DeckLoader } from "../../data/deck-loader.js";
import { SmdHandler } from "../../core/smd-handler.js";
import { DraftManager } from "../../core/draft-manager.js";

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

      // Try CLI dev server API first
      if (await DeckLoader.isApiAvailable()) {
        const res = await fetch("/api/deck", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markdown: fullMarkdown }),
        });
        if (res.ok) {
          await DraftManager.clearDraft();
          Notification.success("Deck saved to disk!");
          return;
        }
      }

      // Fallback: save via file picker / download
      const hasLocalImages = DeckLoader.smdImageCache.size > 0;

      if (hasLocalImages) {
        const zipBlob = await SmdHandler.buildSmd(fullMarkdown, DeckLoader.smdImageCache);
        await this._saveBlob(zipBlob, "presentation.smd", "application/octet-stream");
      } else {
        const mdBlob = new Blob([fullMarkdown], { type: "text/markdown" });
        await this._saveBlob(mdBlob, "deck.md", "text/markdown");
      }

      await DraftManager.clearDraft();
      Notification.success("Deck saved successfully!");
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Failed to save file:", error);
        Notification.error("Failed to save file: " + (error.message || error));
      }
    }
  }

  async _saveBlob(blob, fileName, mimeType) {
    if (window.showSaveFilePicker) {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: fileName.endsWith(".smd") ? "SlideMD Presentation" : "Markdown file",
            accept: { [mimeType]: [`.${fileName.split(".").pop()}`] },
          },
        ],
      });

      if (!fileHandle) return;

      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }
}
