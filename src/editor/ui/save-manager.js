/**
 * SaveManager
 *
 * Handles saving the deck to disk via the CLI dev server API,
 * with fallback to File System Access API or Blob download.
 */
import { Notification } from "../../renderer/notification.js";
import { TextpackExportManager } from "../../renderer/textpack-export-manager.js";
import { DeckLoader } from "../../data/deck-loader.js";
import { MarkdownParser } from "../../data/markdown-parser.js";
import { waitForImageUpload } from "../../core/image-upload-promise.js";

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
    this.needsSaveAs = false;
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
   * Update the save state. No-op — save is triggered from the main menu.
   */
  updateButton() {
    // no-op
  }

  /**
   * Return the current full markdown, merging saved original and any unsaved edits.
   * @returns {string}
   */
  getFullMarkdown() {
    const merged = [...this.originalMarkdown];
    for (let i = 0; i < this.deck.slides.length; i++) {
      if (this.unsavedMarkdown.has(i)) {
        merged[i] = this.unsavedMarkdown.get(i);
      }
    }
    return merged.join("\n\n---\n\n");
  }

  async save() {
    await waitForImageUpload();
    const fullMarkdown = this.getFullMarkdown();

    this.originalMarkdown = new MarkdownParser().splitSlides(fullMarkdown);
    this.unsavedMarkdown.clear();
    this.hasUnsavedChanges = false;
    this.updateButton();

    try {
      // Warn if the markdown contains blob URLs — they can't persist to disk.
      const hasBlobUrls = /blob:/.test(fullMarkdown);
      if (hasBlobUrls) {
        Notification.warning(
          "This deck contains images loaded from a .textpack without a dev server. " +
            "Images won't be saved. Re-open the .textpack with the CLI server running to fix this.",
          8000,
        );
      }

      // Skip CLI API if the deck hasn't been saved to a file yet
      // (e.g. after PPTX import) — would overwrite the wrong file.
      if (this.needsSaveAs) {
        // Save as .textpack (includes images from the server)
        const { ok, cancelled } = await TextpackExportManager.handleTextpackExport(
          fullMarkdown,
          this.deck,
          { filename: DeckLoader.getDisplayTitle(this.deck) },
        );
        if (ok) {
          Notification.success("Deck exported as .textpack!");
          return;
        }
        // Cancelled by the user — the export manager already notified; stop here.
        if (cancelled) return;
        // Textpack export failed — fall through to .md save
        Notification.warning("Could not export as .textpack. Saving as .md only.");
      } else {
        try {
          const res = await fetch("/api/deck", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ markdown: fullMarkdown }),
          });
          if (res.ok) {
            Notification.success("Deck saved to disk!");
            return;
          }
        } catch {
          // No CLI server — fall through to file picker
        }
      }

      // Fallback: save via file picker / download
      const mdBlob = new Blob([fullMarkdown], { type: "text/markdown" });
      await this._saveBlob(mdBlob, "deck.md");
      this.needsSaveAs = false;
      Notification.success("Deck saved!");
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Failed to save file:", error);
        Notification.error("Failed to save file: " + (error.message || error));
      }
    }
  }

  async _saveBlob(blob, fileName) {
    if (window.showSaveFilePicker) {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: "Markdown file",
            accept: { "text/markdown": [".md"] },
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
