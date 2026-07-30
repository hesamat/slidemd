/**
 * TextpackExportManager
 * Handles exporting the current deck as a .textpack file (ZIP archive
 * containing text.markdown + assets/ folder with images).
 */

import { DeckLoader } from "../data/deck-loader.js";
import { Notification } from "./notification.js";

export class TextpackExportManager {
  static _isExporting = false;

  /**
   * Export the current deck as a .textpack file.
   * @param {string} markdownSource - The source markdown to embed
   * @param {Object} deck - The deck object (used for title/filename only)
   * @param {Object} [options]
   * @param {string} [options.filename] - Output filename (default: auto-generated)
   * @returns {Promise<{ok: boolean, cancelled: boolean}>} `ok` when the export
   *   completed; `cancelled` when the user aborted it (or an export was already
   *   in progress), so callers can skip fallbacks and error messaging.
   */
  static async handleTextpackExport(markdownSource, deck, { filename = null } = {}) {
    if (TextpackExportManager._isExporting) return { ok: false, cancelled: true };
    TextpackExportManager._isExporting = true;

    const controller = new AbortController();
    const loading = Notification.showLoadingModal("Preparing .textpack export...", {
      title: "Exporting .textpack",
      cancelLabel: "Cancel",
      cancelConfirmMessage: "Are you sure you want to cancel the .textpack export?",
      onCancel: () => controller.abort(),
    });

    let success = false;
    let cancelled = false;
    try {
      // Warn if the markdown contains blob URLs — images can't be fetched from them
      if (/blob:/.test(markdownSource)) {
        loading.updateMessage(
          "Some images are blob URLs and won't persist. Fetching server images...",
        );
      } else {
        loading.updateMessage("Fetching images...");
      }

      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();

      zip.file("text.markdown", markdownSource);

      const imagePaths = TextpackExportManager._extractImagePaths(markdownSource);
      const assetsFolder = zip.folder("assets");

      const total = imagePaths.length;
      let completed = 0;

      const fetchTasks = imagePaths.map(async (relPath) => {
        if (controller.signal.aborted) {
          throw new DOMException(".textpack export cancelled", "AbortError");
        }
        try {
          const url = `/${relPath}`;
          const res = await fetch(url, { signal: controller.signal });
          if (!res.ok) return;
          const blob = await res.blob();
          const name = relPath.split("/").pop();
          assetsFolder.file(name, blob);
        } catch (e) {
          if (e.name === "AbortError") throw e;
          // Skip images that can't be fetched
        } finally {
          completed++;
          if (total > 0) loading.updateProgress(Math.round((completed / total) * 80));
        }
      });

      await Promise.all(fetchTasks);

      if (controller.signal.aborted) {
        throw new DOMException(".textpack export cancelled", "AbortError");
      }

      loading.updateMessage("Building .textpack archive...");
      const buf = await zip.generateAsync({ type: "blob", compression: "STORE" });

      const outputFilename = filename || TextpackExportManager._generateFilename(deck);
      TextpackExportManager._downloadBlob(buf, outputFilename);

      success = true;
    } catch (e) {
      if (e.name === "AbortError") {
        cancelled = true;
        Notification.info(".textpack export cancelled");
      } else {
        console.error("Textpack export failed:", e);
        Notification.error("Textpack export failed: " + (e.message || e));
      }
    } finally {
      loading.dismiss();
      TextpackExportManager._isExporting = false;
    }

    return { ok: success, cancelled };
  }

  /**
   * Extract all image paths from markdown source.
   * @param {string} markdown
   * @returns {string[]} Array of relative paths like "images/foo.png"
   */
  static _extractImagePaths(markdown) {
    if (!markdown) return [];

    const paths = new Set();

    const mdRe = /!\[.*?\]\((images\/[^)\s]+)\)/gi;
    let m;
    while ((m = mdRe.exec(markdown))) {
      paths.add(m[1]);
    }

    const htmlRe = /<img[^>]*\s+src=["'](images\/[^"']+)["'][^>]*>/gi;
    while ((m = htmlRe.exec(markdown))) {
      paths.add(m[1]);
    }

    const cssRe = /url\(\s*['"]?(images\/[^'")\s]+)['"]?\s*\)/gi;
    while ((m = cssRe.exec(markdown))) {
      paths.add(m[1]);
    }

    return Array.from(paths);
  }

  /**
   * Generate a filename from the deck title.
   * @param {Object} deck
   * @returns {string}
   */
  static _generateFilename(deck) {
    const title = DeckLoader.getDisplayTitle(deck);
    return (
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "deck"
    );
  }

  /**
   * Download a blob as a file.
   * @param {Blob} blob
   * @param {string} filename
   */
  static _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.textpack`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
