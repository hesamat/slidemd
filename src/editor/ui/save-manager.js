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
   * @param {(v: string[]) => void} opts.setOriginalMarkdown
   * @param {() => boolean} opts.getHasUnsavedChanges
   * @param {(v: boolean) => void} opts.setHasUnsavedChanges
   * @param {() => void} [opts.onBeforeSave]
   */
  constructor({
    getDeck,
    getUnsavedMarkdown,
    getOriginalMarkdown,
    setOriginalMarkdown,
    getHasUnsavedChanges,
    setHasUnsavedChanges,
    onBeforeSave = null,
  }) {
    this._getDeck = getDeck;
    this._getUnsavedMarkdown = getUnsavedMarkdown;
    this._getOriginalMarkdown = getOriginalMarkdown;
    this._setOriginalMarkdown = setOriginalMarkdown;
    this._getHasUnsavedChanges = getHasUnsavedChanges;
    this._setHasUnsavedChanges = setHasUnsavedChanges;
    this._onBeforeSave = onBeforeSave;
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

  async _prepareSave() {
    this._onBeforeSave?.();
    await waitForImageUpload();
    const fullMarkdown = this.getFullMarkdown();

    this._setOriginalMarkdown(new MarkdownParser().splitSlides(fullMarkdown));
    this.unsavedMarkdown.clear();
    this.hasUnsavedChanges = false;
    this.updateButton();

    // Warn if the markdown contains blob URLs — they can't persist to disk.
    const hasBlobUrls = /blob:/.test(fullMarkdown);
    if (hasBlobUrls) {
      Notification.warning(
        "This deck contains images loaded from a .textpack without a dev server. " +
          "Images won't be saved. Re-open the .textpack with the CLI server running to fix this.",
        8000,
      );
    }

    return fullMarkdown;
  }

  async _doMarkdownSave(fullMarkdown, skipServer = false) {
    if (!skipServer) {
      try {
        const res = await fetch("/api/deck", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markdown: fullMarkdown }),
        });
        if (res.ok) {
          Notification.success("Deck saved to disk!");
          this.needsSaveAs = false;
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
  }

  async _doTextpackExport(fullMarkdown) {
    const { ok, cancelled } = await TextpackExportManager.handleTextpackExport(
      fullMarkdown,
      this.deck,
      { filename: DeckLoader.getDisplayTitle(this.deck) },
    );
    if (ok) {
      Notification.success("Deck exported as .textpack!");
      this.needsSaveAs = false;
      return;
    }
    if (cancelled) return;
    Notification.warning("Could not export as .textpack. Saving as .md only.");
    await this._doMarkdownSave(fullMarkdown, this.needsSaveAs);
  }

  async save() {
    const fullMarkdown = await this._prepareSave();
    try {
      if (this.needsSaveAs) {
        await this._doTextpackExport(fullMarkdown);
      } else {
        await this._doMarkdownSave(fullMarkdown);
      }
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
