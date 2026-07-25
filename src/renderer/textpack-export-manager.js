/**
 * TextpackExportManager
 * Handles exporting the current deck as a .textpack file (ZIP archive
 * containing text.markdown + assets/ folder with images).
 */

import { DeckLoader } from "../data/deck-loader.js";
import { htmlToMarkdown } from "./textpack-sanitizer.js";

export class TextpackExportManager {
  static _isExporting = false;

  /**
   * Export the current deck as a .textpack file.
   * @param {Object} deck - The deck object containing metadata and slides
   * @param {Object} [options]
   * @param {string} [options.filename] - Output filename (default: auto-generated)
   * @returns {Promise<void>}
   */
  static async handleTextpackExport(deck, { filename = null } = {}) {
    if (TextpackExportManager._isExporting) return;
    TextpackExportManager._isExporting = true;

    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();

      // 1. Gather markdown from deck
      const markdown = TextpackExportManager._deckToMarkdown(deck);
      zip.file("text.markdown", markdown);

      // 2. Gather and embed images referenced in the deck
      const imagePaths = TextpackExportManager._extractImagePaths(deck);
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

      // 3. Generate ZIP with STORE compression (no compression for speed)
      const buf = await zip.generateAsync({ type: "blob", compression: "STORE" });

      // 4. Trigger download
      const outputFilename = filename || TextpackExportManager._generateFilename(deck);
      TextpackExportManager._downloadBlob(buf, outputFilename);
    } catch (e) {
      console.warn("Textpack export failed:", e);
      throw e;
    } finally {
      TextpackExportManager._isExporting = false;
    }
  }

  /**
   * Convert a deck object back to markdown with frontmatter.
   * @param {Object} deck
   * @returns {string}
   */
  static _deckToMarkdown(deck) {
    if (!deck?.slides) return "";

    return deck.slides
      .map((slide) => {
        const parts = [];

        // Speaker notes (must come before layout)
        if (slide.notes) {
          parts.push(`<!-- notes: ${slide.notes} -->`);
          parts.push("");
        }

        // Frontmatter
        const frontmatter = [];
        if (slide.layout) frontmatter.push(`layout: ${slide.layout}`);
        if (slide.theme) frontmatter.push(`theme: ${slide.theme}`);
        if (slide.background) frontmatter.push(`background: ${slide.background}`);
        if (slide.hidden) frontmatter.push("hidden: true");

        if (frontmatter.length > 0) {
          parts.push(frontmatter.join("\n"));
          parts.push("");
        }

        // Areas
        if (slide.areas) {
          const areaOrder = ["title", "header", "main", "media", "secondary", "footer"];
          for (const name of areaOrder) {
            const content = slide.areas[name];
            if (content !== undefined && content !== "") {
              parts.push(`@${name}`);
              parts.push("");
              parts.push(htmlToMarkdown(content));
              parts.push("");
            }
          }
        }

        return parts.join("\n").trimEnd();
      })
      .join("\n\n---\n\n");
  }

  /**
   * Extract all image paths referenced in the deck.
   * @param {Object} deck
   * @returns {string[]} Array of relative paths like "images/foo.png"
   */
  static _extractImagePaths(deck) {
    const paths = new Set();
    if (!deck?.slides) return [];

    for (const slide of deck.slides) {
      if (!slide.areas) continue;
      for (const content of Object.values(slide.areas)) {
        if (!content) continue;
        // Match img src="images/..." in HTML
        const htmlImgRe = /src=["']?(images\/[^"'\s>]+)["']?/gi;
        let m;
        while ((m = htmlImgRe.exec(content))) {
          paths.add(m[1]);
        }
        // Match url(images/...) in CSS
        const urlRe = /url\(\s*['"]?(images\/[^'")\s]+)['"]?\s*\)/gi;
        while ((m = urlRe.exec(content))) {
          paths.add(m[1]);
        }
      }
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
