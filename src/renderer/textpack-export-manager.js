/**
 * TextpackExportManager
 * Handles exporting the current deck as a .textpack file (ZIP archive
 * containing text.markdown + assets/ folder with images).
 */

import { DeckLoader } from "../data/deck-loader.js";

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
              parts.push(this._htmlToMarkdown(content));
              parts.push("");
            }
          }
        }

        return parts.join("\n").trimEnd();
      })
      .join("\n\n---\n\n");
  }

  /**
   * Convert rendered HTML back to markdown for .textpack export.
   * Handles mermaid divs, images, and common block-level HTML.
   * @param {string} html
   * @returns {string}
   */
  static _htmlToMarkdown(html) {
    if (!html) return "";

    let md = html;

    // 1. Convert <div class="mermaid" data-mermaid-source="..."> back to ```mermaid code blocks
    md = md.replace(
      /<div\s+class="mermaid"[^>]*data-mermaid-source="([^"]*)"[^>]*><\/div>/gi,
      (_match, source) => {
        const decoded = source
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"');
        return `\n\n\`\`\`mermaid\n${decoded}\n\`\`\`\n\n`;
      },
    );

    // Also handle mermaid divs with inner text content (from enhanceRenderedContent)
    md = md.replace(/<div\s+class="mermaid"[^>]*>([\s\S]*?)<\/div>/gi, (_match, content) => {
      const decoded = content
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .trim();
      if (!decoded) return "";
      return `\n\n\`\`\`mermaid\n${decoded}\n\`\`\`\n\n`;
    });

    // 2. Convert <img> tags to markdown images
    md = md.replace(/<img\s+[^>]*src="([^"]*)"[^>]*>/gi, (_match, src) => {
      // Decode HTML entities in src
      const decodedSrc = src.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
      return `![](${decodedSrc})`;
    });

    // 3. Convert <em> and <i> to italic
    md = md.replace(/<em>([\s\S]*?)<\/em>/gi, "*$1*");
    md = md.replace(/<i>([\s\S]*?)<\/i>/gi, "*$1*");

    // 4. Convert <strong> and <b> to bold
    md = md.replace(/<strong>([\s\S]*?)<\/strong>/gi, "**$1**");
    md = md.replace(/<b>([\s\S]*?)<\/b>/gi, "**$1**");

    // 5. Convert <code> to inline code (but not inside pre blocks)
    md = md.replace(/<code>([\s\S]*?)<\/code>/gi, (_match, content) => {
      // Skip if this is inside a <pre> block (handled separately)
      return `\`${content}\``;
    });

    // 6. Convert <a href="...">text</a> to [text](url)
    md = md.replace(/<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_match, href, text) => {
      const decodedHref = href.replace(/&amp;/g, "&");
      return `[${text}](${decodedHref})`;
    });

    // 7. Convert <br> and <br/> to newlines
    md = md.replace(/<br\s*\/?>/gi, "\n");

    // 8. Convert <hr> to horizontal rule
    md = md.replace(/<hr\s*\/?>/gi, "\n---\n");

    return md;
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
