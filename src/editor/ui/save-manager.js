/**
 * SaveManager
 *
 * Handles saving the deck to disk via the CLI dev server API,
 * with fallback to File System Access API or Blob download.
 */
import { Notification } from "../../renderer/notification.js";
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
   * @param {() => void} [opts.onSaveStateReset]
   */
  constructor({
    getDeck,
    getUnsavedMarkdown,
    getOriginalMarkdown,
    setOriginalMarkdown,
    getHasUnsavedChanges,
    setHasUnsavedChanges,
    onBeforeSave = null,
    onSaveStateReset = null,
  }) {
    this._getDeck = getDeck;
    this._getUnsavedMarkdown = getUnsavedMarkdown;
    this._getOriginalMarkdown = getOriginalMarkdown;
    this._setOriginalMarkdown = setOriginalMarkdown;
    this._getHasUnsavedChanges = getHasUnsavedChanges;
    this._setHasUnsavedChanges = setHasUnsavedChanges;
    this._onBeforeSave = onBeforeSave;
    this._onSaveStateReset = onSaveStateReset;
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
   * Return the current slide markdown strings, merging saved original and any unsaved edits.
   * @returns {string[]}
   */
  getFullSlides() {
    const merged = [...this.originalMarkdown];
    for (let i = 0; i < this.deck.slides.length; i++) {
      if (this.unsavedMarkdown.has(i)) {
        merged[i] = this.unsavedMarkdown.get(i);
      }
    }
    return merged;
  }

  /**
   * Return the current full markdown, joining the merged slide strings.
   * @returns {string}
   */
  getFullMarkdown() {
    return this.getFullSlides().join("\n\n---\n\n");
  }

  async _prepareSave() {
    await waitForImageUpload();
    this._onBeforeSave?.();
    const fullMarkdown = this.getFullMarkdown();
    const fullSlides = this.getFullSlides();

    this._setOriginalMarkdown(fullSlides);
    this.unsavedMarkdown.clear();
    this.hasUnsavedChanges = false;
    this._onSaveStateReset?.();
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
    // Only use the server save endpoint when the deck was actually loaded
    // from the server (source_url === "/api/deck"). Otherwise the server's
    // "current deck" is still the originally-served file (e.g.
    // docs/example/slides.md) and POST /api/deck would overwrite it instead
    // of saving the imported/refined deck.
    const sourceUrl = localStorage.getItem("webdeck_source_url");
    const canUseServer = !skipServer && sourceUrl === "/api/deck";

    if (canUseServer) {
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
    const suggestedName = localStorage.getItem("webdeck_local_file_name") || "deck";
    await this._saveBlob(mdBlob, `${suggestedName}.md`);
    this.needsSaveAs = false;
    Notification.success("Deck saved!");
  }

  async save() {
    const fullMarkdown = await this._prepareSave();
    try {
      await this._doMarkdownSave(fullMarkdown);
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
