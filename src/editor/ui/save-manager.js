/**
 * SaveManager
 *
 * Handles saving the deck to disk via the CLI dev server API,
 * with fallback to File System Access API or Blob download.
 */
import { MarkdownParser } from "../../data/markdown-parser.js";
import { Notification } from "../../renderer/notification.js";
import { waitForImageUpload } from "../../core/image-upload-promise.js";
import { DirectoryHandleStore } from "../../core/directory-handle-store.js";

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

/**
 * Sanitize a file name for use with the File System Access API. The API
 * rejects names containing path separators or control characters.
 * @param {string} name
 * @param {string} [fallback]
 * @returns {string}
 */
function sanitizeFileName(name, fallback = "deck.md") {
  const cleaned = String(name || "")
    .replace(/[\\/]/g, "")
    .split("")
    .filter((c) => c.charCodeAt(0) >= 0x20)
    .join("")
    .trim();
  return cleaned || fallback;
}

/**
 * Download the referenced images and write them into a directory handle.
 * Only the basename of each path is written, so image references can never
 * escape the target directory.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string[]} relPaths — relative paths like "images/foo.png"
 * @returns {Promise<{saved: number, failed: number}>}
 */
async function writeImagesToDir(dirHandle, relPaths) {
  let saved = 0;
  let failed = 0;
  for (const relPath of relPaths) {
    try {
      const res = await fetch(`/${relPath}`);
      if (!res.ok) {
        failed++;
        continue;
      }
      const blob = await res.blob();
      const imgName = relPath.split("/").pop();
      const imgHandle = await dirHandle.getFileHandle(imgName, { create: true });
      const imgWritable = await imgHandle.createWritable();
      await imgWritable.write(blob);
      await imgWritable.close();
      saved++;
    } catch {
      failed++;
    }
  }
  return { saved, failed };
}

export class SaveManager {
  /**
   * @param {object} opts
   * @param {() => object} opts.getDeck
   * @param {() => import('../../data/store/deck-store.js').DeckStore|null} opts.getDeckStore
   * @param {() => string} [opts.getSourceMarkdown]
   * @param {(markdown: string) => void} [opts.setSourceMarkdown]
   * @param {() => Map} opts.getUnsavedMarkdown
   * @param {() => boolean} opts.getHasUnsavedChanges
   * @param {(v: boolean) => void} opts.setHasUnsavedChanges
   * @param {() => void} [opts.onBeforeSave]
   * @param {() => void} [opts.onSaveStateReset]
   */
  constructor({
    getDeck,
    getDeckStore,
    getSourceMarkdown = null,
    setSourceMarkdown = null,
    getUnsavedMarkdown,
    getHasUnsavedChanges,
    setHasUnsavedChanges,
    onBeforeSave = null,
    onSaveStateReset = null,
  }) {
    this._getDeck = getDeck;
    this._getDeckStore = getDeckStore;
    this._getSourceMarkdown = getSourceMarkdown;
    this._setSourceMarkdown = setSourceMarkdown;
    this._getUnsavedMarkdown = getUnsavedMarkdown;
    this._getHasUnsavedChanges = getHasUnsavedChanges;
    this._setHasUnsavedChanges = setHasUnsavedChanges;
    this._onBeforeSave = onBeforeSave;
    this._onSaveStateReset = onSaveStateReset;
    this._unsavedEditorOverlays = new Map();
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

  /**
   * Update the save state. No-op — save is triggered from the main menu.
   */
  updateButton() {
    // no-op
  }

  /**
   * Store the current editor markdown for a given slide index.
   * @param {number} index
   * @param {string} markdown
   */
  setUnsavedEditorOverlay(index, markdown) {
    this._unsavedEditorOverlays.set(index, markdown);
  }

  /**
   * Remove the unsaved editor overlay for a given slide index.
   * @param {number} index
   */
  clearUnsavedEditorOverlay(index) {
    this._unsavedEditorOverlays.delete(index);
  }

  /**
   * Merge a DeckStore slide object with any unsaved editor overlay.
   * The overlay is the full markdown for a single slide and replaces
   * the slide's stored markdown while keeping the same object shape.
   * @param {number} index
   * @param {object} deckStoreSlide
   * @returns {object}
   */
  getFullSlide(index, deckStoreSlide) {
    const overlay = this._unsavedEditorOverlays.get(index) ?? this._getUnsavedMarkdown().get(index);
    if (overlay === undefined) return deckStoreSlide;
    return { ...deckStoreSlide, index, markdown: overlay };
  }

  /**
   * Return all deck slides with editor overlays applied.
   * When called with no arguments, fall back to the source markdown path.
   * @param {object[]} [deckStoreSlides]
   * @returns {object[]|string[]}
   */
  getFullSlides(deckStoreSlides) {
    if (deckStoreSlides === undefined) {
      const deckStore = this._getDeckStore?.();
      if (deckStore) {
        return deckStore
          .getSlides()
          .map((markdown, index) =>
            this.unsavedMarkdown.has(index) ? this.unsavedMarkdown.get(index) : markdown,
          );
      }

      const source = this._getSourceMarkdown?.() ?? "";
      if (!source) return [];
      const parser = new MarkdownParser();
      return parser
        .splitSlides(source)
        .map((markdown, index) =>
          this.unsavedMarkdown.has(index) ? this.unsavedMarkdown.get(index) : markdown,
        );
    }
    return deckStoreSlides.map((slide, index) => this.getFullSlide(index, slide));
  }

  /**
   * Return the full markdown for the provided deck slides.
   * When called with no arguments, fall back to the source markdown path.
   * @param {object[]} [deckStoreSlides]
   * @returns {string}
   */
  getFullMarkdown(deckStoreSlides) {
    return this.getFullSlides(deckStoreSlides)
      .map((s) => (typeof s === "string" ? s : (s.markdown ?? "")))
      .join("\n\n---\n\n");
  }

  /**
   * Check whether an unsaved editor overlay exists for a slide index.
   * @param {number} index
   * @returns {boolean}
   */
  hasUnsavedOverlay(index) {
    return this._unsavedEditorOverlays.has(index);
  }

  async _prepareSave() {
    await waitForImageUpload();
    this._onBeforeSave?.();

    const deckStore = this._getDeckStore?.();
    let fullMarkdown;
    if (deckStore) {
      const storeSlides = deckStore.getSlides().map((markdown, index) => ({ index, markdown }));
      fullMarkdown = this.getFullMarkdown(storeSlides);
    } else {
      fullMarkdown = this.getFullMarkdown();
    }

    // Warn if the markdown contains blob URLs — they can't persist to disk.
    const hasBlobUrls = /blob:/.test(fullMarkdown);
    if (hasBlobUrls) {
      Notification.warning(
        "This deck contains images loaded from a .textpack without a dev server. " +
          "Images won't be saved. Re-open the .textpack with the CLI server running to fix this.",
        8000,
      );
    }

    return { fullMarkdown };
  }

  /**
   * Record that a save succeeded: clear the dirty state and update the
   * source snapshot so the baseline matches what was written to disk.
   * @param {string} fullMarkdown
   */
  _markSaved(fullMarkdown) {
    this.unsavedMarkdown.clear();
    this.hasUnsavedChanges = false;
    this._onSaveStateReset?.();
    this._setSourceMarkdown?.(fullMarkdown);
    this.updateButton();
  }

  async _doMarkdownSave(fullMarkdown, skipServer = false) {
    // Don't write to the dev server for decks that were imported or opened
    // from the file picker — they are not bound to the server's source path.
    const fromPicker = localStorage.getItem("webdeck_opened_from_picker") === "1";
    const sourceUrl = localStorage.getItem("webdeck_source_url");
    if (
      !fromPicker &&
      !skipServer &&
      sourceUrl &&
      (sourceUrl === "/api/deck" || sourceUrl.includes("/"))
    ) {
      try {
        // The dev server knows which file it is serving; the server validates
        // the request origin instead of trusting a client-supplied source.
        const res = await fetch("/api/deck", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markdown: fullMarkdown }),
        });
        if (res.ok) {
          Notification.success("Deck saved to disk!");
          return true;
        }
      } catch {
        // No CLI server, or it doesn't support the endpoint — fall through
      }
    }

    // Fallback: save via file picker / download. Strip any existing
    // .md/.markdown extension before appending .md — the stored name
    // already includes it for decks opened from a markdown file (PPTX
    // imports and textpack opens don't have an extension).
    const rawName = localStorage.getItem("webdeck_local_file_name") || "deck";
    const suggestedName = rawName.replace(/\.(md|markdown)$/i, "");
    const saved = await this._saveMarkdownWithImages(fullMarkdown, `${suggestedName}.md`);
    if (saved) Notification.success("Deck saved!");
    return saved;
  }

  /**
   * Save the markdown file, plus its referenced images to an `images/`
   * sidecar folder. When the deck has images, a single directory picker
   * writes both the .md file and the images into the same chosen folder so
   * the relative `images/...` references resolve. Decks without images use
   * a single file picker.
   * @param {string} markdown
   * @param {string} fileName — suggested .md filename
   * @returns {Promise<boolean>} true if a file was actually written and the
   *   caller should report success; false if nothing was written (e.g. the
   *   user exported to .textpack instead — which reports its own success —
   *   or that export failed).
   */
  async _saveMarkdownWithImages(markdown, fileName) {
    const imagePaths = extractImagePaths(markdown);

    // Primary path when the deck has images: one directory picker writes
    // both the .md file and the images/ sidecar into the same chosen folder,
    // so the relative images/... references always resolve.
    if (imagePaths.length > 0 && window.showDirectoryPicker) {
      try {
        const dirHandle = await window.showDirectoryPicker({
          mode: "readwrite",
          id: "webdeck-save-deck",
          startIn: "documents",
        });

        const mdHandle = await dirHandle.getFileHandle(sanitizeFileName(fileName), {
          create: true,
        });
        const mdWritable = await mdHandle.createWritable();
        await mdWritable.write(markdown);
        await mdWritable.close();

        const sidecarDir = await dirHandle.getDirectoryHandle("images", { create: true });
        const { saved, failed } = await writeImagesToDir(sidecarDir, imagePaths);
        if (failed > 0) {
          Notification.warning(
            `Saved ${fileName} with ${saved} image(s). ${failed} image(s) could not be saved.`,
            6000,
          );
        }

        // Remember the deck folder so reopening the .md can render the
        // sibling images/ folder directly from disk.
        await DirectoryHandleStore.save(dirHandle, "parent", fileName);
        return true;
      } catch (e) {
        if (e.name === "AbortError") throw e;
        // Fall through to the modal warning + simple download below
      }
    }

    // Images could not be saved alongside the .md (the browser has no
    // directory picker, or it failed) — warn before saving .md only.
    if (imagePaths.length > 0) {
      const choice = await Notification.showModal({
        title: "Images will not be saved",
        message:
          `Images could not be saved alongside the .md file. ` +
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
        // A successful .textpack export is a valid save: clear the dirty state
        // so the editor doesn't keep warning about unsaved changes. Return false
        // so the caller doesn't also show the generic "Deck saved!" toast.
        if (ok) this._markSaved(markdown);
        return false;
      }
      // choice === "md" — fall through to the .md-only save below
    }

    // No images (or the user declined them): save the .md via a single file picker.
    if (window.showSaveFilePicker) {
      try {
        const mdHandle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: "Markdown",
              accept: { "text/markdown": [".md", ".markdown"] },
            },
          ],
        });
        const mdWritable = await mdHandle.createWritable();
        await mdWritable.write(markdown);
        await mdWritable.close();
        return true;
      } catch (e) {
        if (e.name === "AbortError") throw e;
        // Fall through to simple blob download
      }
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
    const { fullMarkdown } = await this._prepareSave();
    try {
      const saved = await this._doMarkdownSave(fullMarkdown);
      if (saved) this._markSaved(fullMarkdown);
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Failed to save file:", error);
        Notification.error("Failed to save file: " + (error.message || error));
      }
      // AbortError means the user cancelled — leave the dirty state in place
      // so the next save/reload prompt still works.
    }
  }
}
