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
   * @returns {Promise<void>}
   */
  static async handleTextpackExport(markdownSource, deck, { filename = null } = {}) {
    if (TextpackExportManager._isExporting) return;
    TextpackExportManager._isExporting = true;

    try {
      // Warn if the markdown contains blob URLs — images can't be fetched from them
      if (/blob:/.test(markdownSource)) {
        Notification.warning(
          "This deck contains images loaded without a dev server. " +
            "Some images may not be included in the export.",
          6000,
        );
      }

      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();

      zip.file("text.markdown", markdownSource);

      const imagePaths = TextpackExportManager._extractImagePaths(markdownSource);
      const assetsFolder = zip.folder("assets");

      const fetchTasks = imagePaths.map(async (relPath) => {
        try {
          const url = `/${relPath}`;
          const res = await fetch(url);
          if (!res.ok) return;
          const blob = await res.blob();
          const name = relPath.split("/").pop();
          assetsFolder.file(name, blob);
        } catch {
          // Skip images that can't be fetched
        }
      });

      await Promise.all(fetchTasks);

      const buf = await zip.generateAsync({ type: "blob", compression: "STORE" });

      const outputFilename = filename || TextpackExportManager._generateFilename(deck);
      TextpackExportManager._downloadBlob(buf, outputFilename);
    } finally {
      TextpackExportManager._isExporting = false;
    }
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
