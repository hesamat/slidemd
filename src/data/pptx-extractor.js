/**
 * PptxExtractor
 *
 * Parses PPTX files using pptxtojson and extracts structured content
 * (text, images, notes, tables) suitable for AI-powered conversion to SlideMD.
 *
 * @class
 */
import { parse } from "pptxtojson";

/**
 * @typedef {Object} ExtractedSlide
 * @property {number} index - 0-based slide index.
 * @property {string} title - Best-guess title (first heading or first text).
 * @property {string} notes - Speaker notes text.
 * @property {ExtractedElement[]} elements - All content elements on the slide.
 * @property {string} background - CSS background if the slide has a fill.
 */

/**
 * @typedef {Object} ExtractedElement
 * @property {'text'|'image'|'table'|'shape'|'chart'|'diagram'} type
 * @property {string} [content] - Text content (for text/shape elements).
 * @property {string} [base64] - Base64-encoded image data.
 * @property {string} [mimeType] - Image MIME type inferred from ref extension.
 * @property {string} [ref] - Original image reference name.
 * @property {ExtractedTableCell[][]} [rows] - Table data.
 * @property {number} order - PPTX element order (preserves slide author's arrangement).
 * @property {number} left - X position (EMU, relative to slide).
 * @property {number} top - Y position (EMU).
 * @property {number} width - Width in EMU.
 * @property {number} height - Height in EMU.
 */

/**
 * @typedef {Object} ExtractedTableCell
 * @property {string} text
 * @property {number} [rowSpan]
 * @property {number} [colSpan]
 */

/**
 * @typedef {Object} ExtractionResult
 * @property {ExtractedSlide[]} slides
 * @property {string[]} themeColors - Theme color palette from the PPTX.
 * @property {string[]} usedFonts - Fonts used in the presentation.
 * @property {{ width: number, height: number }} size - Slide dimensions in EMU.
 * @property {ExtractedImage[]} images - All extracted images with metadata.
 */

/**
 * @typedef {Object} ExtractedImage
 * @property {string} ref - Original reference name (e.g. "image1.png").
 * @property {string} base64 - Base64-encoded image data.
 * @property {string} [mimeType] - MIME type inferred from extension.
 * @property {number} slideIndex - Which slide this image came from.
 */

/** @class */
export class PptxExtractor {
  /**
   * Parse a PPTX file (ArrayBuffer) and extract structured content.
   * @static
   * @param {ArrayBuffer} buffer - The PPTX file contents.
   * @returns {Promise<ExtractionResult>}
   */
  static async extract(buffer) {
    const raw = await parse(buffer, {
      imageMode: "base64",
      videoMode: "none",
      audioMode: "none",
    });

    const images = [];
    const slides = raw.slides.map((slide, index) => this.#processSlide(slide, index, images));

    return {
      slides,
      themeColors: raw.themeColors || [],
      usedFonts: raw.usedFonts || [],
      size: raw.size || { width: 914400, height: 5143500 / 914400 },
      images,
    };
  }

  /**
   * Process a single slide from pptxtojson into our extracted format.
   * @static
   * @param {import('pptxtojson').Slide} slide
   * @param {number} index
   * @param {ExtractedImage[]} imagesAccum
   * @returns {ExtractedSlide}
   */
  static #processSlide(slide, index, imagesAccum) {
    // Process layout elements first (backgrounds, placeholders), then content
    const elements = [];
    for (const el of slide.layoutElements || []) {
      const extracted = this.#processElement(el, index, imagesAccum);
      if (extracted) elements.push(extracted);
    }
    for (const el of slide.elements || []) {
      const extracted = this.#processElement(el, index, imagesAccum);
      if (extracted) elements.push(extracted);
    }

    // Sort by PPTX element order within each group (layout first, then content)
    elements.sort((a, b) => a.order - b.order);

    const title = this.#guessTitle(elements);
    const background = this.#extractBackground(slide.fill);

    return {
      index,
      title,
      notes: slide.note || "",
      elements,
      background,
    };
  }

  /**
   * Process a single element.
   * @static
   * @param {import('pptxtojson').Element} el
   * @param {number} slideIndex
   * @param {ExtractedImage[]} imagesAccum
   * @returns {ExtractedElement|null}
   */
  static #processElement(el, slideIndex, imagesAccum) {
    if (el.type === "group" && el.elements) {
      // Flatten group elements
      const results = [];
      for (const child of el.elements) {
        const r = this.#processElement(child, slideIndex, imagesAccum);
        if (r) results.push(r);
      }
      return results.length ? results : null;
    }

    if (el.type === "text" || el.type === "shape") {
      const content = this.#htmlToMarkdown(el.content || "");
      if (!content.trim()) return null;
      return {
        type: "text",
        content,
        order: el.order,
        left: el.left,
        top: el.top,
        width: el.width,
        height: el.height,
      };
    }

    if (el.type === "image") {
      if (el.base64) {
        const mimeType = this.#inferMimeType(el.ref);
        imagesAccum.push({
          ref: el.ref,
          base64: el.base64,
          mimeType,
          slideIndex,
        });
      }
      return {
        type: "image",
        base64: el.base64 || "",
        mimeType: this.#inferMimeType(el.ref),
        ref: el.ref,
        order: el.order,
        left: el.left,
        top: el.top,
        width: el.width,
        height: el.height,
      };
    }

    if (el.type === "table") {
      const rows = (el.data || []).map((row) =>
        row.map((cell) => ({
          text: this.#stripHtml(cell.text || ""),
          rowSpan: cell.rowSpan,
          colSpan: cell.colSpan,
        })),
      );
      return {
        type: "table",
        rows,
        order: el.order,
        left: el.left,
        top: el.top,
        width: el.width,
        height: el.height,
      };
    }

    if (el.type === "chart") {
      return {
        type: "chart",
        content: `[Chart: ${el.chartType}]`,
        order: el.order,
        left: el.left,
        top: el.top,
        width: el.width,
        height: el.height,
      };
    }

    if (el.type === "diagram") {
      const text = (el.textList || []).join(", ");
      return {
        type: "diagram",
        content: text || "[Diagram]",
        order: el.order,
        left: el.left,
        top: el.top,
        width: el.width,
        height: el.height,
      };
    }

    return null;
  }

  /**
   * Convert HTML to markdown, preserving structural elements.
   * @static
   * @param {string} html
   * @returns {string}
   */
  static #htmlToMarkdown(html) {
    if (!html) return "";
    let s = html;

    // Inline formatting (before stripping tags)
    s = s.replace(/<\/?strong>/gi, "**");
    s = s.replace(/<\/?b>/gi, "**");
    s = s.replace(/<\/?em>/gi, "*");
    s = s.replace(/<\/?i>/gi, "*");

    // Block elements
    s = s.replace(/<br\s*\/?>/gi, "\n");
    s = s.replace(/<\/p>/gi, "\n");

    // Track list nesting: replace list tags with markers
    s = s.replace(/<ol[^>]*>/gi, "%%LIST_OPEN%%");
    s = s.replace(/<\/ol>/gi, "%%LIST_CLOSE%%");
    s = s.replace(/<ul[^>]*>/gi, "%%LIST_OPEN%%");
    s = s.replace(/<\/ul>/gi, "%%LIST_CLOSE%%");
    s = s.replace(/<li[^>]*>/gi, "%%LI%%");

    // Strip remaining tags
    s = s.replace(/<[^>]+>/g, "");

    // Decode entities
    s = s.replace(/&amp;/g, "&");
    s = s.replace(/&lt;/g, "<");
    s = s.replace(/&gt;/g, ">");
    s = s.replace(/&quot;/g, '"');
    s = s.replace(/&#39;/g, "'");
    s = s.replace(/&nbsp;/g, " ");

    // Process list markers: convert to indented markdown lists.
    // Walk the string token by token so %%LI%% gets the correct
    // depth for any %%LIST_OPEN%% / %%LIST_CLOSE%% that precedes it.
    let depth = 0;
    let result = "";
    const reg = /%%(LIST_OPEN|LIST_CLOSE|LI)%%/g;
    let last = 0;
    let m;
    while ((m = reg.exec(s)) !== null) {
      // Text before this marker
      const text = s.slice(last, m.index);
      if (text.trim()) result += text;
      last = m.index + m[0].length;

      switch (m[1]) {
        case "LIST_OPEN":
          depth++;
          break;
        case "LIST_CLOSE":
          depth = Math.max(0, depth - 1);
          break;
        case "LI":
          result += "  ".repeat(Math.max(0, depth - 1)) + "- ";
          break;
      }
    }
    // Any text after the last marker
    const remaining = s.slice(last).trim();
    if (remaining) result += "\n" + remaining;

    s = result;
    s = s.replace(/\n{3,}/g, "\n\n");
    return s.trim();
  }

  /**
   * Strip all HTML tags, returning plain text only.
   * Used for AI consumption (toPlainText) and table cells.
   * @static
   * @param {string} html
   * @returns {string}
   */
  static #stripHtml(html) {
    if (!html) return "";
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<\/?[a-z][^>]*>/gi, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Guess the slide title from its elements.
   * @static
   * @param {ExtractedElement[]} elements
   * @returns {string}
   */
  static #guessTitle(elements) {
    // Look for the first text element with short content (likely a heading)
    for (const el of elements) {
      if (el.type === "text" && el.content) {
        const firstLine = el.content.split("\n")[0].trim();
        if (firstLine.length > 0 && firstLine.length < 100) {
          return firstLine;
        }
      }
    }
    return "";
  }

  /**
   * Extract background CSS from a slide fill.
   * @static
   * @param {import('pptxtojson').Fill} fill
   * @returns {string}
   */
  static #extractBackground(fill) {
    if (!fill) return "";
    if (fill.type === "color" && fill.value) return fill.value;
    if (fill.type === "gradient" && fill.value?.colors?.length) {
      const stops = fill.value.colors.map((c) => `${c.color} ${c.pos}`).join(", ");
      return `linear-gradient(${stops})`;
    }
    return "";
  }

  /**
   * Infer MIME type from image reference filename.
   * @static
   * @param {string} ref
   * @returns {string}
   */
  static #inferMimeType(ref) {
    if (!ref) return "image/png";
    const ext = ref.split(".").pop().toLowerCase();
    const map = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      svg: "image/svg+xml",
      webp: "image/webp",
      bmp: "image/bmp",
      emf: "image/emf",
      wmf: "image/wmf",
    };
    return map[ext] || "image/png";
  }

  /**
   * Convert extraction result to a plain-text representation suitable
   * for sending to an AI model. Strips positioning data, keeps content.
   * @static
   * @param {ExtractionResult} result
   * @returns {string}
   */
  static toPlainText(result) {
    const lines = [];
    for (const slide of result.slides) {
      lines.push(`--- Slide ${slide.index + 1} ---`);
      if (slide.title) lines.push(`Title: ${slide.title}`);
      if (slide.background) lines.push(`Background: ${slide.background}`);
      if (slide.notes) lines.push(`Notes: ${this.#stripHtml(slide.notes)}`);
      lines.push("");

      for (const el of slide.elements) {
        if (el.type === "text") {
          lines.push(el.content);
          lines.push("");
        } else if (el.type === "table" && el.rows) {
          for (const row of el.rows) {
            lines.push(row.map((c) => c.text).join(" | "));
          }
          lines.push("");
        } else if (el.type === "image") {
          lines.push(`[Image: ${el.ref || "unknown"}]`);
          lines.push("");
        } else if (el.type === "chart") {
          lines.push(el.content || "[Chart]");
          lines.push("");
        } else if (el.type === "diagram") {
          lines.push(`[Diagram: ${el.content || ""}]`);
          lines.push("");
        }
      }
      lines.push("---");
      lines.push("");
    }
    return lines.join("\n");
  }
}
