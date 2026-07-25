/**
 * TextpackExportManager
 * Handles exporting the current deck as a .textpack file (ZIP archive
 * containing text.markdown + assets/ folder with images).
 */

import { DeckLoader } from "../data/deck-loader.js";
import { htmlToMarkdown } from "./textpack-sanitizer.js";
import { LayoutParser } from "../data/layout-parser.js";

const STANDARD_AREAS = ["title", "header", "main", "media", "secondary", "footer"];
const STANDARD_AREA_SET = new Set(STANDARD_AREAS);

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
   * Try to resolve a custom grid layout to the closest standard preset.
   * Returns both the resolved layout name and an area name mapping.
   * @param {string} layoutSpec - The layout specification (preset name or custom grid)
   * @param {Object} slideAreas - The slide's areas object
   * @returns {{ layout: string, areaMap: Object|null }} The resolved layout and optional area mapping
   */
  static _resolveLayout(layoutSpec, _slideAreas) {
    if (!layoutSpec) return { layout: "", areaMap: null };
    const spec = layoutSpec.trim();
    // If it's already a known preset name, no remapping needed
    if (LayoutParser.resolvePreset(spec) !== spec) return { layout: spec, areaMap: null };
    // Parse the custom grid to extract area names and structure
    const parsed = LayoutParser.parse(spec);
    const customAreas = parsed.orderedAreas || [];
    const cols = parsed.gridTemplateColumns || "1fr";
    if (customAreas.length === 0) return { layout: spec, areaMap: null };
    // Check if any custom area names are non-standard
    const hasCustomAreas = customAreas.some((a) => !STANDARD_AREA_SET.has(a));
    if (!hasCustomAreas) return { layout: spec, areaMap: null };
    // Try to match to a preset based on structure
    const isTwoCol = cols.split(/\s+/).length >= 2;
    const isThreeCol = cols.split(/\s+/).length >= 3;
    let resolvedLayout = spec;
    if (isThreeCol && customAreas.length >= 3) {
      resolvedLayout = "three-column";
    } else if (isTwoCol && customAreas.length >= 4) {
      const colParts = cols.split(/\s+/);
      const first = parseFloat(colParts[0]) || 1;
      const second = parseFloat(colParts[1]) || 1;
      if (first > second * 1.5) resolvedLayout = "left-heavy";
      else if (second > first * 1.5) resolvedLayout = "right-heavy";
      else resolvedLayout = "two-column";
    } else if (!isTwoCol && customAreas.length >= 2) {
      resolvedLayout = "header-content";
    }
    if (resolvedLayout === spec) return { layout: spec, areaMap: null };
    // Build area mapping: custom name → standard name (by grid position)
    const resolvedParsed = LayoutParser.parse(resolvedLayout);
    const standardAreas = resolvedParsed.orderedAreas || [];
    if (standardAreas.length === 0) return { layout: resolvedLayout, areaMap: null };
    // Map each custom area to the standard area at the same position
    const areaMap = {};
    for (let i = 0; i < customAreas.length; i++) {
      const customName = customAreas[i];
      const standardName = standardAreas[Math.min(i, standardAreas.length - 1)];
      if (customName !== standardName) {
        areaMap[customName] = standardName;
      }
    }
    return { layout: resolvedLayout, areaMap: Object.keys(areaMap).length > 0 ? areaMap : null };
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
        const { layout: resolvedLayout, areaMap } = this._resolveLayout(
          slide.layout || "",
          slide.areas,
        );
        if (resolvedLayout) frontmatter.push(`layout: ${resolvedLayout.trim()}`);
        if (slide.theme) frontmatter.push(`theme: ${slide.theme.trim()}`);
        if (slide.background) frontmatter.push(`background: ${slide.background.trim()}`);
        if (slide.hidden) frontmatter.push("hidden: true");

        if (frontmatter.length > 0) {
          parts.push(frontmatter.join("\n"));
          parts.push("");
        }

        // Areas — remap custom area names to standard names if layout was resolved
        if (slide.areas) {
          // Merge areas: remap custom names to standard names, combining content
          const mergedAreas = {};
          for (const [name, content] of Object.entries(slide.areas)) {
            if (!content) continue;
            const targetName = areaMap?.[name] || name;
            if (mergedAreas[targetName]) {
              mergedAreas[targetName] += "\n\n" + content;
            } else {
              mergedAreas[targetName] = content;
            }
          }
          const areaOrder = ["title", "header", "main", "media", "secondary", "footer"];
          const exported = new Set();
          for (const name of areaOrder) {
            if (exported.has(name)) continue;
            const content = mergedAreas[name];
            if (content !== undefined && content !== "") {
              parts.push(`@${name}`);
              parts.push("");
              parts.push(htmlToMarkdown(content));
              parts.push("");
              exported.add(name);
            }
          }
          // Export any remaining custom areas
          for (const [name, content] of Object.entries(mergedAreas)) {
            if (exported.has(name)) continue;
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
