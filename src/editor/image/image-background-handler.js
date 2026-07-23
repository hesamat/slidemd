/**
 * ImageBackgroundHandler
 *
 * Manages image uploads. Behavior adapts based on file type:
 * - .smd mode: file picker for local images, stored in memory
 * - .md mode: URL input only, inserts remote image URLs
 */

import { DeckLoader } from "../../data/deck-loader.js";
import { DraftManager } from "../../core/draft-manager.js";

export class ImageBackgroundHandler {
  /**
   * Whether local file upload is supported (true for .smd mode).
   * @returns {boolean}
   */
  get supportsLocalUpload() {
    return DeckLoader.isSmdMode;
  }

  /**
   * Upload an image file from disk. Only works in .smd mode.
   * Stores as blob URL in DeckLoader.smdImageCache.
   * @param {File} file
   * @returns {Promise<string>} Relative path (images/<filename>)
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

    // Persist to IndexedDB for crash recovery
    const md = localStorage.getItem("webdeck_local_file") || "";
    await DraftManager.saveDraft(md, DeckLoader.smdImageCache);

    return relativePath;
  }

  /**
   * Insert a remote image URL into the markdown.
   * Used in .md mode where images must be external URLs.
   * @param {string} url - The image URL (https://...)
   * @returns {string} The markdown image tag: ![image](url)
   */
  insertImageUrl(url) {
    const alt = url.split("/").pop()?.split("?")[0] || "image";
    return `![${alt}](${url})`;
  }
}
