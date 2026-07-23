/**
 * ImageBackgroundHandler
 *
 * Manages image uploads. Behavior adapts based on file type:
 * - .smd mode: file picker for local images, stored in memory
 * - .md mode: URL input only, inserts remote image URLs
 */

import { DirectoryHandleStore } from "../../core/directory-handle-store.js";
import { DeckLoader } from "../../data/deck-loader.js";
import { DraftManager } from "../../core/draft-manager.js";

export class ImageBackgroundHandler {
  constructor() {
    this.deckDirectoryHandle = null;
    this._deckDirMode = null;
  }

  /** Current mode of the directory handle ('parent' | 'images' | null). */
  get deckDirMode() {
    return this._deckDirMode || "parent";
  }

  /**
   * Whether local file upload is supported (true for .smd mode).
   * @returns {boolean}
   */
  get supportsLocalUpload() {
    return DeckLoader.isSmdMode;
  }

  /**
   * Upload an image file from disk. Only works in .smd mode.
   * @param {File} file
   * @returns {Promise<string|null>} Relative path (images/<filename>) or null
   */
  async uploadImage(file) {
    if (!DeckLoader.isSmdMode) {
      console.warn("uploadImage called in .md mode — use insertImageUrl instead");
      return null;
    }

    const ext = file.name.match(/\.[^.]+$/)?.[0] || ".png";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
    const relativePath = `images/${fileName}`;

    const blobUrl = URL.createObjectURL(file);
    DeckLoader.smdImageCache.set(relativePath, blobUrl);

    const md = localStorage.getItem("webdeck_local_file") || "";
    await DraftManager.saveDraft(md, DeckLoader.smdImageCache);

    return relativePath;
  }

  /**
   * Insert a remote image URL into the markdown.
   * @param {string} url
   * @returns {string} The markdown image tag
   */
  insertImageUrl(url) {
    const alt = url.split("/").pop()?.split("?")[0] || "image";
    return `![${alt}](${url})`;
  }

  async _resolveDeckDirectoryHandle() {
    if (this.deckDirectoryHandle) return this.deckDirectoryHandle;
    if (!window.showDirectoryPicker) return null;

    const fileName = localStorage.getItem("webdeck_local_file_name") || undefined;
    const { handle: stored, mode } = await DirectoryHandleStore.load(fileName);
    if (stored) {
      const perm = await stored.queryPermission({ mode: "readwrite" });
      if (
        perm === "granted" ||
        (await stored.requestPermission({ mode: "readwrite" })) === "granted"
      ) {
        this.deckDirectoryHandle = stored;
        this._deckDirMode = mode;
        return stored;
      }
    }

    let startInHint = "documents";
    try {
      const fileName = localStorage.getItem("webdeck_local_file_name");
      if (fileName) {
        const registry = window.__WEBDECK_FILE_HANDLE_REGISTRY__;
        const fileHandle = registry?.get(fileName);
        if (fileHandle) startInHint = fileHandle;
      }
    } catch (_) {
      /* ignore */
    }

    try {
      const picked = await window.showDirectoryPicker({
        id: "deck-images",
        mode: "readwrite",
        startIn: startInHint,
      });

      const detectedMode = await this._detectDeckDirMode(picked);
      const fileName = localStorage.getItem("webdeck_local_file_name") || undefined;
      await DirectoryHandleStore.save(picked, detectedMode, fileName);
      this.deckDirectoryHandle = picked;
      this._deckDirMode = detectedMode;
      return picked;
    } catch (err) {
      if (err.name !== "AbortError") {
        console.warn("Could not open deck directory:", err);
      }
      return null;
    }
  }

  async _detectDeckDirMode(dir) {
    const IMAGE_RE = /\.(jpe?g|png|gif|webp|svg|avif)$/i;
    try {
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === "directory" && name === "images") return "parent";
        if (handle.kind === "file" && IMAGE_RE.test(name)) return "images";
      }
    } catch (_) {
      /* ignore */
    }
    return "parent";
  }

  async clearDeckDirectoryHandle() {
    this.deckDirectoryHandle = null;
    this._deckDirMode = null;
    const fileName = localStorage.getItem("webdeck_local_file_name") || undefined;
    await DirectoryHandleStore.clear(fileName);
  }
}
