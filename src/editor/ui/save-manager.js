/**
 * SaveManager
 *
 * Handles saving the deck to disk via the CLI dev server API,
 * with fallback to File System Access API or Blob download.
 */
import { Notification } from "../../renderer/notification.js";
import { waitForImageUpload } from "../../core/image-upload-promise.js";

/**
 * Extract relative image paths (images/...) from markdown.
 * @param {string} markdown
 * @returns {string[]}
 */
function extractImagePaths(markdown) {
  if (!markdown) return [];
  const paths = new Set();
  const mdRe = /!\[.*?\]\((images\/[^)\s]+)\)/gi;
  let m;
  while ((m = mdRe.exec(markdown))) paths.add(m[1]);
  const htmlRe = /<img[^>]*\s+src=["'](images\/[^"']+)["'][^>]*>/gi;
  while ((m = htmlRe.exec(markdown))) paths.add(m[1]);
  const cssRe = /url\(\s*['"]?(images\/[^'")\s]+)['"]?\s*\)/gi;
  while ((m = cssRe.exec(markdown))) paths.add(m[1]);
  return Array.from(paths);
}

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

    // Fallback: save via file picker / download. Strip any existing
    // .md/.markdown extension before appending .md — the stored name
    // already includes it for decks opened from a markdown file (PPTX
    // imports and textpack opens don't have an extension).
    const rawName = localStorage.getItem("webdeck_local_file_name") || "deck";
    const suggestedName = rawName.replace(/\.(md|markdown)$/i, "");
    const saved = await this._saveMarkdownWithImages(fullMarkdown, `${suggestedName}.md`);
    this.needsSaveAs = false;
    if (saved) Notification.success("Deck saved!");
  }

  /**
   * Save the markdown file via the browser's save dialog, and when the
   * File System Access API is available, also save referenced images to
   * an `images/` folder next to the .md file.
   * @param {string} markdown
   * @param {string} fileName — suggested .md filename
   * @returns {Promise<boolean>} true if a file was actually written and the
   *   caller should report success; false if nothing was written (e.g. the
   *   user exported to .textpack instead — which reports its own success —
   *   or that export failed).
   */
  async _saveMarkdownWithImages(markdown, fileName) {
    // When the File System Access API is available, use a directory picker
    // so we can write both the .md file and its images/ folder.
    if (window.showDirectoryPicker) {
      try {
        const dirHandle = await window.showDirectoryPicker({
          mode: "readwrite",
          id: "webdeck-save",
          startIn: "documents",
        });

        // Write the .md file
        const mdHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const mdWritable = await mdHandle.createWritable();
        await mdWritable.write(markdown);
        await mdWritable.close();

        // Write images to an images/ subfolder
        const imagePaths = extractImagePaths(markdown);
        if (imagePaths.length > 0) {
          let imagesDir = dirHandle;
          // Navigate/create the images/ subfolder
          for (const part of "images".split("/")) {
            imagesDir = await imagesDir.getDirectoryHandle(part, { create: true });
          }
          let saved = 0;
          let failed = 0;
          for (const relPath of imagePaths) {
            try {
              const res = await fetch(`/${relPath}`);
              if (!res.ok) {
                failed++;
                continue;
              }
              const blob = await res.blob();
              const imgName = relPath.split("/").pop();
              const imgHandle = await imagesDir.getFileHandle(imgName, { create: true });
              const imgWritable = await imgHandle.createWritable();
              await imgWritable.write(blob);
              await imgWritable.close();
              saved++;
            } catch {
              failed++;
            }
          }
          if (failed > 0) {
            Notification.warning(
              `Saved ${fileName} with ${saved} image(s). ${failed} image(s) could not be saved.`,
              6000,
            );
          }
        }
        return true;
      } catch (e) {
        if (e.name === "AbortError") throw e;
        // Fall through to simple blob download
      }
    }

    // Fallback: no File System Access API — show a modal so the user
    // understands images won't be saved and can choose .textpack instead.
    const imagePaths = extractImagePaths(markdown);
    if (imagePaths.length > 0) {
      const choice = await Notification.showModal({
        title: "Images will not be saved",
        message:
          `This browser cannot save images alongside the .md file. ` +
          `${imagePaths.length} image(s) will be lost.\n\n` +
          `Export as .textpack to keep everything in a single archive, ` +
          `or continue to save .md only.`,
        type: "warning",
        blockBackdrop: true,
        buttons: [
          { label: "Cancel", resolvesTo: "cancel" },
          { label: "Save .md only", resolvesTo: "md" },
          { label: "Export as .textpack", isPrimary: true, resolvesTo: "textpack" },
        ],
      });

      if (choice === "cancel" || !choice) {
        throw new DOMException("Save cancelled", "AbortError");
      }
      if (choice === "textpack") {
        const { TextpackExportManager } = await import("../../renderer/textpack-export-manager.js");
        const { DeckLoader } = await import("../../data/deck-loader.js");
        const { ok } = await TextpackExportManager.handleTextpackExport(markdown, this.deck, {
          filename: DeckLoader.getDisplayTitle(this.deck),
        });
        if (ok) {
          Notification.success("Deck exported as .textpack!");
        } else {
          Notification.error("Textpack export failed or was cancelled. Nothing was saved.");
        }
        // This path reports its own success/failure — the caller must not
        // also announce "Deck saved!" (that would be wrong on failure, and
        // a duplicate/confusing toast on success).
        return false;
      }
      // choice === "md" — fall through to blob download below
    }

    const mdBlob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(mdBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
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
}
