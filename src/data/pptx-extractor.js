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

    // Convert EMF/WMF images to PNG
    await this.#convertEmfImages(slides, images);

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
      const mime = this.#inferMimeType(el.ref);

      if (el.base64) {
        imagesAccum.push({
          ref: el.ref,
          base64: el.base64,
          mimeType: mime,
          slideIndex,
        });
      }
      return {
        type: "image",
        base64: el.base64 || "",
        mimeType: mime,
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

    // Convert CSS-based formatting spans to markdown.
    // pptxtojson uses <span style="font-weight: bold;"> etc.
    // Use iterative string search to handle nested spans correctly.
    s = this.#convertCssFormatting(s);

    // Inline formatting from semantic HTML tags
    s = s.replace(/<\/?strong>/gi, "**");
    s = s.replace(/<\/?b>/gi, "**");
    s = s.replace(/<\/?em>/gi, "*");
    s = s.replace(/<\/?i>/gi, "*");

    // Merge adjacent same-type bold/italic markers.
    // pptxtojson splits bold text into separate spans per word,
    // producing "**word1**** ****word2**" instead of "**word1 word2**".
    // Pattern: closing ** then optional whitespace then opening **
    s = s.replace(/\*\*\s*\*\*/g, "**");
    // Same for italic: closing * then optional whitespace then opening *
    // But avoid matching ** (bold) — only match single *
    s = s.replace(/(?<!\*)\*(?!\*)\s*(?<!\*)\*(?!\*)/g, "*");

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
   * Convert CSS-based formatting spans to markdown.
   * Uses iterative search to handle nested spans correctly:
   * finds innermost spans first, converts them, then works outward.
   * @static
   * @param {string} html
   * @returns {string}
   */
  static #convertCssFormatting(html) {
    let s = html;
    // Bold: font-weight: bold or font-weight: 700+
    for (let i = 0; i < 10; i++) {
      const match = s.match(
        /<span\s+style="[^"]*font-weight:\s*(?:bold|[6-9]\d\d)[^"]*">((?:(?!<span|<\/span>).)*)<\/span>/i,
      );
      if (!match) break;
      s = s.slice(0, match.index) + "**" + match[1] + "**" + s.slice(match.index + match[0].length);
    }
    // Italic: font-style: italic
    for (let i = 0; i < 10; i++) {
      const match = s.match(
        /<span\s+style="[^"]*font-style:\s*italic[^"]*">((?:(?!<span|<\/span>).)*)<\/span>/i,
      );
      if (!match) break;
      s = s.slice(0, match.index) + "*" + match[1] + "*" + s.slice(match.index + match[0].length);
    }
    // Clean up remaining empty/style spans
    s = s.replace(/<span\s*>\s*/g, "");
    s = s.replace(/<\/span>/g, "");
    return s;
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
   * Convert EMF/WMF images to PNG data URLs using emf-converter.
   * Modifies slides and images arrays in place.
   * @static
   * @param {ExtractedSlide[]} slides
   * @param {ExtractedImage[]} images
   * @returns {Promise<void>}
   */
  static async #convertEmfImages(slides, images) {
    let emfConverter;
    try {
      emfConverter = await import("emf-converter");
    } catch (err) {
      console.warn("emf-converter not available, skipping EMF conversion:", err);
      return;
    }

    const { convertEmfToDataUrl, convertWmfToDataUrl } = emfConverter;

    for (const img of images) {
      if (img.mimeType !== "image/emf" && img.mimeType !== "image/wmf") continue;
      try {
        // Handle possible data URI prefix in base64
        const raw = img.base64.replace(/^data:[^;]+;base64,/, "");
        const binary = atob(raw);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const convert = img.mimeType === "image/emf" ? convertEmfToDataUrl : convertWmfToDataUrl;
        const dataUrl = await convert(bytes.buffer, 1920, 1080);

        if (!dataUrl) {
          console.warn(
            `EMF conversion returned null for ${img.ref} (size: ${bytes.length} bytes) — browser may lack Canvas API or file is invalid`,
          );
          continue;
        }

        // Extract base64 from data URL (data:image/png;base64,...)
        const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
        img.base64 = base64;
        img.mimeType = "image/png";

        // Update the corresponding element in slides (match by ref, not mimeType
        // since we just changed img.mimeType)
        for (const slide of slides) {
          for (const el of slide.elements) {
            if (el.type === "image" && el.ref === img.ref && el.mimeType !== "image/png") {
              el.base64 = base64;
              el.mimeType = "image/png";
            }
          }
        }
      } catch (err) {
        console.warn(`Could not convert ${img.ref} from ${img.mimeType}:`, err);
      }
    }
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
