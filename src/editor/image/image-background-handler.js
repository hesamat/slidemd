/**
 * ImageBackgroundHandler
 *
 * FS Access API and image-picker integration
 * extracted from EditController.  Manages the deck directory handle,
 * image insertion, background selection, and file uploads.
 */

import { DirectoryHandleStore } from "../../core/directory-handle-store.js";

export class ImageBackgroundHandler {
  constructor() {
    this.deckDirectoryHandle = null;
    this._deckDirMode = null;
  }

  /** Current mode of the directory handle ('parent' | 'images' | null). */
  get deckDirMode() {
    return this._deckDirMode || "parent";
  }

  async uploadImage(file) {
    let serverPath = null;
    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch("/api/upload-image", { method: "POST", body: formData });
      if (response.ok) {
        const result = await response.json();
        serverPath = result.path;
      }
    } catch (_) {
      /* server unavailable */
    }

    const relativePath =
      serverPath ||
      `images/${Date.now()}-${Math.random().toString(36).slice(2, 10)}${file.name.match(/\.[^.]+$/)?.[0] || ".png"}`;

    try {
      const dirHandle = await this._resolveDeckDirectoryHandle();
      if (dirHandle) {
        const imagesDir = await dirHandle.getDirectoryHandle("images", { create: true });
        const fileName = relativePath.split("/").pop();
        const fh = await imagesDir.getFileHandle(fileName, { create: true });
        const writable = await fh.createWritable();
        await writable.write(file);
        await writable.close();
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.warn("Could not save image next to deck file:", err);
      }
    }

    return relativePath;
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
