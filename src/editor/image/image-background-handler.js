/**
 * ImageBackgroundHandler
 *
 * Manages image uploads via the CLI dev server API.
 * All uploads go through POST /api/upload-image which saves to disk.
 */

import { Logger } from "../../core/logger.js";

export class ImageBackgroundHandler {
  /**
   * Whether local file upload is supported.
   * Always true — the CLI server handles uploads.
   * @returns {boolean}
   */
  get supportsLocalUpload() {
    return true;
  }

  /**
   * Upload an image file via the CLI dev server API.
   * @param {File} file
   * @returns {Promise<string|null>} Relative path (images/<filename>) or null on failure
   */
  async uploadImage(file) {
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/upload-image", { method: "POST", body: formData });
      if (!res.ok) {
        Logger.error("Upload failed:", res.status);
        return null;
      }
      const result = await res.json();
      return result.path || null;
    } catch (e) {
      Logger.error("Upload error:", e);
      return null;
    }
  }

  /**
   * Insert a remote image URL into the markdown.
   * @param {string} url - The image URL (https://...)
   * @returns {string} The markdown image tag: ![image](url)
   */
  insertImageUrl(url) {
    const alt = url.split("/").pop()?.split("?")[0] || "image";
    return `![${alt}](${url})`;
  }
}
