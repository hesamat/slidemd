/**
 * SaveManager
 *
 * Handles saving the deck to disk via the CLI dev server API,
 * with fallback to File System Access API or Blob download.
 */
import { MarkdownParser } from "../../data/markdown-parser.js";
import { Notification } from "../../renderer/notification.js";
import { waitForImageUpload } from "../../core/image-upload-promise.js";
import { DirectoryHandleStore, findDeckFileInDir } from "../../core/directory-handle-store.js";
import { DeckImagesResolver } from "../image/deck-images-resolver.js";
import { DeckLoader } from "../../data/deck-loader.js";

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
    .filter((c) => c.charCodeAt(0) >= 0x20 && c.charCodeAt(0) !== 0x7f)
    .join("")
    .trim();
  return cleaned || fallback;
}

/**
 * Download the referenced images and write them into a directory handle.
 * Images loaded from the current deck's on-disk folder are read straight
 * from disk (the dev server does not know where a picker-opened deck
 * lives); anything else falls back to the server's `/images/*` route.
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
      let blob = await DeckImagesResolver.getImageFile(relPath);
      if (!blob) {
        const res = await fetch(`/${relPath}`);
        if (!res.ok) {
          failed++;
          continue;
        }
        blob = await res.blob();
      }
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

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|svg|avif)$/i;

/**
 * Open the deck-folder save picker. `showDirectoryPicker` requires
 * transient user activation, which a long background image upload may have
 * consumed; if Chromium rejects with a SecurityError, re-trigger the picker
 * from a modal button click (fresh activation).
 * @returns {Promise<FileSystemDirectoryHandle>}
 */
async function pickDeckSaveFolder() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await window.showDirectoryPicker({
        mode: "readwrite",
        id: "webdeck-save-deck",
        startIn: "documents",
      });
    } catch (e) {
      if (e.name !== "SecurityError") throw e;
      if (attempt === 1) throw e;
      const retry = await Notification.showModal({
        title: "Choose save folder",
        message: "Select the folder where the deck and its images should be saved.",
        type: "info",
        blockBackdrop: true,
        buttons: [
          { label: "Cancel", resolvesTo: "cancel" },
          { label: "Choose folder", isPrimary: true, resolvesTo: "ok" },
        ],
      });
      if (retry !== "ok") {
        throw new DOMException("Save cancelled", "AbortError");
      }
    }
  }
  throw new DOMException("Save cancelled", "AbortError");
}

/**
 * Remove the previous deck's image files from an images/ directory that the
 * newly saved deck no longer references. Only files referenced by the
 * overwritten .md are considered, so images belonging to other decks in the
 * same folder are never touched. Called only after the user confirmed
 * overwriting an existing .md file. Best-effort — cleanup failures never
 * fail the save.
 * @param {FileSystemDirectoryHandle} dirHandle — the images/ directory
 * @param {string[]} relPaths — relative paths written by the new deck
 * @param {Set<string>} oldImageNames — basenames referenced by the old .md
 * @returns {Promise<void>}
 */
export async function removeStaleImages(dirHandle, relPaths, oldImageNames) {
  const keepNames = new Set(relPaths.map((p) => p.split("/").pop()));
  // Collect the names first, then remove them — mutating a directory during
  // async iteration is not spec-defined and can skip entries in practice.
  const stale = [];
  try {
    for await (const [name, entry] of dirHandle.entries()) {
      if (entry.kind !== "file") continue;
      if (!IMAGE_EXT_RE.test(name)) continue;
      if (keepNames.has(name) || !oldImageNames.has(name)) continue;
      stale.push(name);
    }
    for (const name of stale) {
      await dirHandle.removeEntry(name);
    }
  } catch (err) {
    console.warn("Failed to remove stale deck images:", err);
  }
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
   * Restore the directory handle of a previously saved deck, when it is
   * still usable without a user gesture: the in-memory handle from the
   * current session, or the persisted IndexedDB handle when Chromium has
   * kept readwrite permission. Returns null when a picker is needed.
   * @param {string} fileName — the .md file name the handle is keyed by
   * @returns {Promise<FileSystemDirectoryHandle|null>}
   */
  async _restoreDeckDir(fileName) {
    const candidates = [fileName, fileName.replace(/\.(md|markdown)$/i, "")];
    const check = async (handle) => {
      if (!handle) return null;
      try {
        const perm =
          handle.queryPermission && (await handle.queryPermission({ mode: "readwrite" }));
        return perm === "granted" ? handle : null;
      } catch {
        return null;
      }
    };

    const inMemory = DeckImagesResolver.getDirectoryHandle();
    if (inMemory) {
      const usable = await check(inMemory);
      // The in-memory handle is trusted only when it actually contains the
      // deck file; a stale handle from a forgotten deck switch must not
      // silently create the file in the wrong folder.
      if (usable) {
        try {
          if (await findDeckFileInDir(usable, fileName)) return usable;
        } catch {
          // Permission or probe failure — fall through to the stored handle.
        }
      }
    }
    for (const name of candidates) {
      const stored = await DirectoryHandleStore.load(name);
      if (stored.handle) {
        const usable = await check(stored.handle);
        if (usable) return usable;
      }
    }
    return null;
  }

  /**
   * Prompt for the deck's .md file name. Used only when a save destination
   * picker is required (first save or a fresh destination).
   * @param {string} currentName
   * @returns {Promise<string>} the chosen name (sanitized); throws AbortError on cancel
   */
  async _promptFileName(currentName) {
    const chosen = await Notification.prompt(
      "Save deck as",
      "Choose a file name for the saved deck.",
      { defaultValue: currentName, placeholder: "deck.md" },
    );
    if (!chosen.ok || !chosen.value.trim()) {
      throw new DOMException("Save cancelled", "AbortError");
    }
    const cleaned = sanitizeFileName(chosen.value.trim(), currentName);
    return /\.(md|markdown)$/i.test(cleaned) ? cleaned : `${cleaned}.md`;
  }

  /**
   * Write the .md and its images into an already-picked directory handle
   * (silent re-save). The file already exists in this folder, so no
   * overwrite confirmation is needed.
   * @param {FileSystemDirectoryHandle} dirHandle
   * @param {string} safeFileName
   * @param {string} markdown
   * @param {string[]} imagePaths
   * @returns {Promise<void>}
   */
  async _writeDeckToDir(dirHandle, safeFileName, markdown, imagePaths) {
    // Capture the previous deck's image references before overwriting so
    // cleanup below only removes images this deck no longer uses (scoped to
    // the old .md's refs, leaving other decks sharing the folder untouched).
    let oldImageNames = new Set();
    try {
      const oldFile = await dirHandle.getFileHandle(safeFileName);
      const oldText = await (await oldFile.getFile()).text();
      oldImageNames = new Set(extractImagePaths(oldText).map((p) => p.split("/").pop()));
    } catch {
      /* new file — nothing to clean up */
    }

    const mdHandle = await dirHandle.getFileHandle(safeFileName, { create: true });
    const mdWritable = await mdHandle.createWritable();
    await mdWritable.write(markdown);
    await mdWritable.close();
    DeckLoader.fileHandleRegistry.set(safeFileName, mdHandle);
    DeckLoader.fileHandleRegistry.set(safeFileName.replace(/\.(md|markdown)$/i, ""), mdHandle);

    const sidecarDir = await dirHandle.getDirectoryHandle("images", { create: true });
    if (oldImageNames.size > 0) {
      await removeStaleImages(sidecarDir, imagePaths, oldImageNames);
    }
    const { saved, failed } = await writeImagesToDir(sidecarDir, imagePaths);
    if (failed > 0) {
      Notification.warning(
        `Saved ${safeFileName} with ${saved} image(s). ${failed} image(s) could not be saved.`,
        6000,
      );
    }
    this._recordSavedSession(dirHandle, safeFileName, imagePaths);
  }

  /**
   * Record the session state after a deck (and its images) were written to a
   * folder: point the deck name, picker flag, image resolver and reload
   * handle registry at the new location.
   * @param {FileSystemDirectoryHandle} dirHandle
   * @param {string} safeFileName
   * @param {string[]} imagePaths
   * @returns {Promise<void>}
   */
  async _recordSavedSession(dirHandle, safeFileName, imagePaths) {
    try {
      localStorage.setItem(
        "webdeck_local_file_name",
        safeFileName.replace(/\.(md|markdown)$/i, ""),
      );
      localStorage.setItem("webdeck_opened_from_picker", "1");
      DeckImagesResolver.setDirectoryHandle(dirHandle, imagePaths);
      await DirectoryHandleStore.save(dirHandle, "parent", safeFileName);
    } catch (err) {
      console.warn("Failed to update session state after save:", err);
    }
  }

  /**
   * Save the markdown file, plus its referenced images to an `images/`
   * sidecar folder. When the deck has images, a single directory picker
   * writes both the .md file and the images into the same chosen folder so
   * the relative `images/...` references resolve. Decks without images use
   * a single file picker.
   *
   * Re-saving a deck that already has a destination is silent: the previous
   * folder/file handles are reused and nothing is prompted. Only a fresh
   * save (or a changed destination) opens a picker, and the file name is
   * always offered for editing in that flow.
   * @param {string} markdown
   * @param {string} fileName — suggested .md filename
   * @returns {Promise<boolean>} true if a file was actually written and the
   *   caller should report success; false if nothing was written (e.g. the
   *   user exported to .textpack instead — which reports its own success —
   *   or that export failed).
   */
  async _saveMarkdownWithImages(markdown, fileName) {
    const imagePaths = extractImagePaths(markdown);
    const safeFileName = sanitizeFileName(fileName);
    // Hoisted so the .md-only fallback below reuses the name already chosen
    // in the directory flow instead of prompting twice.
    let chosenName = null;

    // Primary path when the deck has images: one directory picker writes
    // both the .md file and the images/ sidecar into the same chosen folder,
    // so the relative images/... references always resolve.
    if (imagePaths.length > 0 && window.showDirectoryPicker) {
      // Silent re-save: reuse the folder handle from the previous save.
      const savedDir = await this._restoreDeckDir(safeFileName);
      if (savedDir) {
        try {
          await this._writeDeckToDir(savedDir, safeFileName, markdown, imagePaths);
          return true;
        } catch (err) {
          // Handle lost or write failed — fall through to the picker flow.
          console.warn("Silent re-save failed, prompting for a folder:", err);
        }
      }

      // Fresh destination: let the user pick the file name before the folder.
      chosenName = await this._promptFileName(safeFileName);
      let dirHandle;
      let mdWritten = false;
      let exists = false;
      let oldImageNames = new Set();

      try {
        dirHandle = await pickDeckSaveFolder();

        // Restore the native overwrite confirmation the previous single-file
        // flow provided: if a file with the same name already exists, ask
        // before replacing it.
        try {
          await dirHandle.getFileHandle(chosenName);
          exists = true;
        } catch (err) {
          if (err?.name !== "NotFoundError") {
            console.warn("Failed to check for an existing deck file:", err);
          }
          /* new file */
        }
        if (exists) {
          // Remember which images the old deck referenced so cleanup below
          // only touches this deck's own files, never another deck's images
          // that happen to share the folder.
          try {
            const oldFile = await dirHandle.getFileHandle(chosenName);
            const oldText = await (await oldFile.getFile()).text();
            oldImageNames = new Set(extractImagePaths(oldText).map((p) => p.split("/").pop()));
          } catch {
            console.warn("Could not read the existing deck file to scope image cleanup.");
          }
          const overwrite = await Notification.showModal({
            title: "Overwrite existing file?",
            message:
              `A file named "${chosenName}" already exists in this folder. ` +
              `Overwriting replaces it and removes the previous deck's images that are no longer used.`,
            type: "warning",
            blockBackdrop: true,
            buttons: [
              { label: "Cancel", resolvesTo: "cancel" },
              { label: "Overwrite", isPrimary: true, resolvesTo: "ok" },
            ],
          });
          if (overwrite !== "ok") {
            throw new DOMException("Save cancelled", "AbortError");
          }
        }

        const mdHandle = await dirHandle.getFileHandle(chosenName, { create: true });
        const mdWritable = await mdHandle.createWritable();
        await mdWritable.write(markdown);
        await mdWritable.close();
        // Keep the reload file-handle registry aligned with the extension-
        // less stored deck name so reloads re-read from disk (freshness).
        DeckLoader.fileHandleRegistry.set(chosenName, mdHandle);
        DeckLoader.fileHandleRegistry.set(chosenName.replace(/\.(md|markdown)$/i, ""), mdHandle);
        mdWritten = true;
      } catch (e) {
        if (e.name === "AbortError") throw e;
        // Pre-write failure (picker or .md write) — fall through to the
        // modal warning + simple download below.
      }

      if (mdWritten) {
        // The .md is on disk, so the session must point at the new name and
        // folder even if saving images fails afterwards — otherwise a reload
        // cannot find the just-saved deck's folder.
        await this._recordSavedSession(dirHandle, chosenName, imagePaths);

        try {
          const sidecarDir = await dirHandle.getDirectoryHandle("images", { create: true });
          // Overwriting an existing deck: drop the previous deck's images
          // that this deck no longer uses (scoped to the old .md's refs so
          // other decks sharing the folder are untouched).
          if (exists) {
            await removeStaleImages(sidecarDir, imagePaths, oldImageNames);
          }
          const { saved, failed } = await writeImagesToDir(sidecarDir, imagePaths);
          if (failed > 0) {
            Notification.warning(
              `Saved ${chosenName} with ${saved} image(s). ${failed} image(s) could not be saved.`,
              6000,
            );
          }
        } catch (err) {
          // The .md was already written; report the missing images instead
          // of prompting for a second save dialog.
          console.warn("Failed to save images alongside the .md file:", err);
          Notification.warning(
            `${chosenName} was saved, but images could not be saved: ${err?.message || err}`,
            6000,
          );
        }
        return true;
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
        const { ok } = await TextpackExportManager.handleTextpackExport(markdown, this.deck, {
          filename: DeckLoader.getDisplayTitle(this.deck),
          readImage: (relPath) => DeckImagesResolver.getImageFile(relPath),
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

    // No images (or the user declined them): save the .md via a single file
    // picker. A previously saved deck re-saves silently through its existing
    // file handle.
    if (window.showSaveFilePicker) {
      const existingHandle =
        DeckLoader.fileHandleRegistry.get(safeFileName) ||
        DeckLoader.fileHandleRegistry.get(safeFileName.replace(/\.(md|markdown)$/i, ""));
      if (existingHandle) {
        try {
          const mdWritable = await existingHandle.createWritable();
          await mdWritable.write(markdown);
          await mdWritable.close();
          return true;
        } catch (err) {
          // Handle no longer writable — fall through to the picker.
          console.warn("Silent .md re-save failed, prompting for a file:", err);
        }
      }

      chosenName ??= await this._promptFileName(safeFileName);
      try {
        const mdHandle = await window.showSaveFilePicker({
          suggestedName: chosenName,
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
        // Remember the handle the native picker actually returned so the
        // next save re-writes it silently, and record the written file name
        // (the user may have renamed the file inside the picker).
        const writtenName = mdHandle.name;
        DeckLoader.fileHandleRegistry.set(writtenName, mdHandle);
        DeckLoader.fileHandleRegistry.set(writtenName.replace(/\.(md|markdown)$/i, ""), mdHandle);
        localStorage.setItem(
          "webdeck_local_file_name",
          writtenName.replace(/\.(md|markdown)$/i, ""),
        );
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
    a.download = safeFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  }

  save() {
    // Ctrl+S is a global shortcut (fires in every window and even while a
    // modal is open); dedupe so a second keystroke cannot open a second
    // file-name prompt or start a concurrent write. Concurrent callers get
    // the same in-flight promise so they observe the same result instead of
    // a silently dropped request.
    if (this._saveInFlight) return this._saveInFlight;
    this._saveInFlight = (async () => {
      try {
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
      } finally {
        this._saveInFlight = null;
      }
    })();
    return this._saveInFlight;
  }
}
