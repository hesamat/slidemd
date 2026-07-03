/**
 * PptxExtractor
 *
 * Parses PPTX files using pptxtojson and extracts structured content
 * (text, images, notes, tables) suitable for conversion to SlideMD.
 *
 * @class
 */
import { parse } from "pptxtojson";
import { htmlToMarkdown, stripHtml } from "./pptx-html-to-markdown.js";
import { convertEmfImages, convertTiffImages } from "./pptx-image-converter.js";
import { buildChartDataRows } from "./pptx-chart-data.js";

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
 * @property {string} [chartType] - Chart type (e.g., 'barChart', 'lineChart').
 * @property {ChartData[]} [chartData] - Chart series data.
 * @property {string[]} [chartColors] - Chart series colors.
 * @property {number} order - PPTX element order (preserves slide author's arrangement).
 * @property {number} left - X position (EMU, relative to slide).
 * @property {number} top - Y position (EMU).
 * @property {number} width - Width in EMU.
 * @property {number} height - Height in EMU.
 * @property {'footer'|'date'|'slideNumber'|null} [placeholderType] - Detected placeholder type from PPTX name.
 */

/**
 * @typedef {Object} ChartData
 * @property {string|number} key - Series name.
 * @property {{x: number, y: number}[]} values - Data points.
 * @property {Object<string, string|number>} xlabels - Category labels.
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
   * Parse a PPTX file (as ArrayBuffer) and return structured extraction data.
   * @static
   * @param {ArrayBuffer} buffer - PPTX file contents.
   * @returns {Promise<ExtractionResult>}
   */
  static async extract(buffer) {
    const raw = await parse(buffer);

    const images = [];
    const slides = (raw.slides || []).map((slide, index) =>
      this.#processSlide(slide, index, images),
    );

    // Convert EMF/WMF images to PNG
    await convertEmfImages(slides, images);

    // Convert TIFF images to PNG (browsers can't display TIFF natively)
    await convertTiffImages(slides, images);

    return {
      slides,
      themeColors: raw.themeColors || [],
      usedFonts: raw.usedFonts || [],
      size: raw.size || { width: 914400, height: 5143500 },
      images,
    };
  }

  /**
   * Convert HTML to Markdown. Public wrapper for testing.
   * @static
   * @param {string} html
   * @returns {string}
   */
  static htmlToMarkdown(html) {
    return htmlToMarkdown(html);
  }

  /**
   * Process a single raw pptxtojson slide into an ExtractedSlide.
   * @static
   * @param {Object} slide
   * @param {number} index
   * @param {ExtractedImage[]} imagesAccum
   * @returns {ExtractedSlide}
   */
  static #processSlide(slide, index, imagesAccum) {
    // Process layout elements first (backgrounds, placeholders), then content
    const raw = [];
    for (const el of slide.layoutElements || []) {
      // Skip images from layout — they are theme decorations, not slide content
      if (el.type === "image") continue;
      const extracted = this.#processElement(el, index, imagesAccum);
      if (extracted) raw.push(extracted);
    }
    for (const el of slide.elements || []) {
      const extracted = this.#processElement(el, index, imagesAccum);
      if (extracted) raw.push(extracted);
    }

    // Sort by PPTX element order to preserve author's layout intent
    raw.sort((a, b) => a.order - b.order);

    const elements = raw.flat().filter(Boolean);

    return {
      index,
      title: this.#guessTitle(elements),
      notes: slide.note || "",
      elements,
      background: this.#extractBackground(slide.fill),
    };
  }

  /**
   * Check if an element tree contains any text content.
   * @static
   * @param {import('pptxtojson').Element} el
   * @returns {boolean}
   */
  static #hasTextContent(el) {
    if (el.type === "text" || el.type === "shape") {
      return !!(el.content && el.content.trim());
    }
    if (el.type === "table" || el.type === "chart" || el.type === "diagram") {
      return true;
    }
    if (el.type === "group" && el.elements) {
      return el.elements.some((child) => this.#hasTextContent(child));
    }
    return false;
  }

  /**
   * Check if an element tree contains any non-tiny images.
   * Tiny images (both dimensions < 15pt) are treated as decorative.
   * @static
   * @param {import('pptxtojson').Element} el
   * @returns {boolean}
   */
  static #hasSignificantImages(el) {
    if (el.type === "image") {
      const PT_TO_EMU = 12700;
      const MIN_SIZE_EMU = 15 * PT_TO_EMU;
      const w = (el.width || 0) * PT_TO_EMU;
      const h = (el.height || 0) * PT_TO_EMU;
      // A significant image has at least one dimension above the threshold.
      // Tiny square icons are decorative; thin separator lines are content.
      return w >= MIN_SIZE_EMU || h >= MIN_SIZE_EMU;
    }
    if (el.type === "group" && el.elements) {
      return el.elements.some((child) => this.#hasSignificantImages(child));
    }
    return false;
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
      // Skip groups that contain no renderable content — only tiny decorative
      // images, empty shapes, or unrecognized types.  Keep groups that have
      // text, tables, charts, diagrams, or any non-tiny image.
      if (!this.#hasTextContent(el) && !this.#hasSignificantImages(el)) {
        return null;
      }
      // Flatten group elements, adjusting positions to be slide-relative
      const results = [];
      for (const child of el.elements) {
        const r = this.#processElement(child, slideIndex, imagesAccum);
        if (r) {
          if (Array.isArray(r)) {
            for (const item of r) {
              item.left += el.left;
              item.top += el.top;
              results.push(item);
            }
          } else {
            r.left += el.left;
            r.top += el.top;
            results.push(r);
          }
        }
      }
      return results.length ? results : null;
    }

    const placeholderType = this.#detectPlaceholderType(el.name);

    // Skip auto-generated placeholders (date/time, slide numbers)
    if (placeholderType === "date" || placeholderType === "slideNumber") {
      return null;
    }

    if (el.type === "text" || el.type === "shape") {
      const content = htmlToMarkdown(el.content || "");
      if (!content.trim()) return null;
      return {
        type: "text",
        content,
        placeholderType,
        order: el.order,
        left: el.left,
        top: el.top,
        width: el.width,
        height: el.height,
      };
    }

    if (el.type === "image") {
      const mime = this.#inferMimeType(el.ref);

      // pptxtojson returns image dimensions in points while all other
      // element coordinates (left, top) are in EMU.  Normalise to EMU
      // so layout inference can compare image sizes against the slide
      // dimensions without unit-mismatch errors.
      // Conversion: 1 pt = 914400 / 72 = 12700 EMU.
      const PT_TO_EMU = 12700;
      const widthEmu = (el.width || 0) * PT_TO_EMU;
      const heightEmu = (el.height || 0) * PT_TO_EMU;

      // Skip tiny images (likely decorative icons, bullets, or ornaments).
      // Uses AND: both dimensions must be small.  A thin separator line
      // (e.g. 5×500pt) is intentional content and should be kept.
      // Threshold: ~15pt × 12700 = 190500 EMU ≈ 20px at 96 DPI.
      const MIN_SIZE_EMU = 15 * PT_TO_EMU;
      if (widthEmu < MIN_SIZE_EMU && heightEmu < MIN_SIZE_EMU) {
        return null;
      }

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
        blob: el.blob || "",
        mimeType: mime,
        ref: el.ref,
        placeholderType,
        order: el.order,
        left: el.left,
        top: el.top,
        width: widthEmu,
        height: heightEmu,
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
        placeholderType,
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
        chartType: el.chartType,
        chartData: el.data || [],
        chartColors: el.colors || [],
        placeholderType,
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
        placeholderType,
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
   * Detect placeholder type from the element's name attribute.
   * @static
   * @param {string} name
   * @returns {'footer'|'date'|'slideNumber'|null}
   */
  static #detectPlaceholderType(name) {
    if (!name) return null;
    const lower = name.toLowerCase();
    if (/\bfooter\b/.test(lower)) return "footer";
    if (/\bdate\b/.test(lower)) return "date";
    if (/\bslide\s*number\b/.test(lower) || /\bslidenum\b/.test(lower)) return "slideNumber";
    return null;
  }

  /**
   * Extract background CSS from a slide fill.
   * @static
   * @param {import('pptxtojson').Fill} fill
   * @returns {string}
   */
  static #extractBackground(fill) {
    if (!fill) return "";
    if (fill.type === "color" && fill.value) {
      let hex = fill.value.startsWith("#") ? fill.value : `#${fill.value}`;
      // Expand 3-digit hex (#FFF) to 6-digit (#FFFFFF)
      if (hex.length === 4) {
        hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
      }
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      if (r >= 240 && g >= 240 && b >= 240) return "";
      return fill.value;
    }
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
      tif: "image/tiff",
      tiff: "image/tiff",
    };
    return map[ext] || "image/png";
  }

  /**
   * Build structured chart data. Re-exports from pptx-chart-data.js.
   * @static
   * @param {ChartData[]} chartData
   * @returns {{ headers: string[], rows: string[][] }}
   */
  static buildChartDataRows(chartData) {
    return buildChartDataRows(chartData);
  }

  /**
   * Strip HTML tags. Re-exports from pptx-html-to-markdown.js.
   * @static
   * @param {string} html
   * @returns {string}
   */
  static #stripHtml(html) {
    return stripHtml(html);
  }

  /**
   * Convert extraction result to a plain-text representation suitable
   * for preview or external processing.
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
          if (el.chartData?.length) {
            lines.push(`[Chart: ${el.chartType || "unknown"}]`);
            const { headers, rows } = buildChartDataRows(el.chartData);
            lines.push(headers.join(" | "));
            lines.push("---".repeat(headers.length));
            for (const row of rows) {
              lines.push(row.join(" | "));
            }
            lines.push("");
          } else {
            lines.push(el.content || "[Chart]");
            lines.push("");
          }
        } else if (el.type === "diagram") {
          if (el.content) {
            const items = el.content.split(", ");
            for (const item of items) {
              lines.push(`- ${item}`);
            }
          }
          lines.push("");
        }
      }
      lines.push("---");
      lines.push("");
    }
    return lines.join("\n");
  }
}
