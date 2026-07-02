/**
 * PptxExtractor
 *
 * Parses PPTX files using pptxtojson and extracts structured content
 * (text, images, notes, tables) suitable for conversion to SlideMD.
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

    // Convert TIFF images to PNG (browsers can't display TIFF natively)
    await this.#convertTiffImages(slides, images);

    return {
      slides,
      themeColors: raw.themeColors || [],
      usedFonts: raw.usedFonts || [],
      size: raw.size || { width: 914400, height: 5143500 },
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

    // Flatten nested arrays from group elements
    const elements = raw.flat(Infinity);

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
   * Process a single element.
   * @static
   * @param {import('pptxtojson').Element} el
   * @param {number} slideIndex
   * @param {ExtractedImage[]} imagesAccum
   * @returns {ExtractedElement|null}
   */
  static #processElement(el, slideIndex, imagesAccum) {
    if (el.type === "group" && el.elements) {
      // Skip groups that contain only images (decorative backgrounds, theme art)
      if (!this.#hasTextContent(el)) {
        return null;
      }
      // Flatten group elements
      const results = [];
      for (const child of el.elements) {
        const r = this.#processElement(child, slideIndex, imagesAccum);
        if (r) results.push(r);
      }
      return results.length ? results : null;
    }

    const placeholderType = this.#detectPlaceholderType(el.name);

    // Skip auto-generated placeholders (date/time, slide numbers)
    if (placeholderType === "date" || placeholderType === "slideNumber") {
      return null;
    }

    if (el.type === "text" || el.type === "shape") {
      const content = this.#htmlToMarkdown(el.content || "");
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

      // Skip tiny images (likely decorative icons, bullets, or ornaments).
      // Uses AND: both dimensions must be small.  A thin separator line
      // (e.g. 5×500pt) is intentional content and should be kept.
      // Dimensions from pptxtojson are in points; threshold: ~15pt ≈ 20px
      const MIN_SIZE_PT = 15;
      if ((el.width || 0) < MIN_SIZE_PT && (el.height || 0) < MIN_SIZE_PT) {
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
   * Convert HTML to markdown using native DOM parsing.
   * Walks the DOM tree to convert elements to markdown, handling
   * inline formatting, lists, links, and block elements natively.
   * @static
   * @param {string} html
   * @returns {string}
   */
  static htmlToMarkdown(html) {
    return this.#htmlToMarkdown(html);
  }

  /**
   * @static
   * @param {string} html
   * @returns {string}
   */
  static #htmlToMarkdown(html) {
    if (!html) return "";

    // Detect CSS-based bullets: PowerPoint uses text-indent: -XXpt
    // (negative hanging indent) to create space for the bullet marker
    // without using <ul>/<li>.  A negative text-indent >= 10pt is a
    // reliable signal of bullet formatting, regardless of whether
    // margin-left is also present.
    const withBullets = html.replace(/<p\s+style="([^"]*)">([\s\S]*?)<\/p>/gi, (match, style) => {
      const m = style.match(/text-indent:\s*-(\d+)/);
      if (!m) return match;
      const indent = parseInt(m[1], 10);
      if (indent >= 10) return `<li>${match}</li>`;
      return match;
    });

    // DOMParser normalizes the HTML.  Existing <ul><li> structures are
    // preserved.  Standalone <li> tags (from CSS bullet detection) are
    // placed directly under <body> and handled by #processBlockNodes.
    const doc = new DOMParser().parseFromString(withBullets, "text/html");
    const body = doc.body;

    const result = [];
    this.#processBlockNodes(body.childNodes, result);
    let md = result.join("");
    md = md.replace(/\n{3,}/g, "\n\n");

    // Group consecutive backtick-wrapped lines into fenced code blocks.
    // A backtick-wrapped line looks like: `code here`
    // 2+ consecutive such lines become a fenced block.
    const lines = md.split("\n");
    const grouped = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const trimmedLine = line.trim();
      const isBacktickLine = /^`[^`]+`$/.test(trimmedLine);
      if (isBacktickLine) {
        const codeLines = [];
        while (i < lines.length) {
          const t = lines[i].trim();
          if (/^`[^`]+`$/.test(t)) {
            codeLines.push(t.replace(/^`|`$/g, ""));
            i++;
          } else if (t === "") {
            // Skip empty lines between backtick lines (from <p> separators)
            i++;
          } else {
            break;
          }
        }
        if (codeLines.length >= 2) {
          grouped.push("```\n" + codeLines.join("\n") + "\n```");
        } else if (codeLines.length === 1) {
          grouped.push(codeLines[0]);
        }
      } else {
        grouped.push(line);
        i++;
      }
    }
    md = grouped.join("\n");

    md = md.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return md.trim();
  }

  /**
   * Process block-level nodes and accumulate markdown output.
   * @static
   * @param {NodeList} nodes
   * @param {string[]} out
   */
  static #processBlockNodes(nodes, out) {
    for (const node of nodes) {
      if (node.nodeType === 3) {
        const text = node.textContent;
        if (text.trim()) out.push(text);
        continue;
      }
      if (node.nodeType !== 1) continue;

      const tag = node.tagName;

      if (tag === "UL" || tag === "OL") {
        this.#processList(node, 0, out);
        out.push("\n");
        continue;
      }

      // Standalone <li> (from CSS bullet detection) — treat as a list item
      if (tag === "LI") {
        const inline = [];
        this.#processInlineNodes(node.childNodes, inline);
        const merged = this.#mergeAdjacentMarkers(inline.join("").trim());
        if (merged) {
          out.push("- " + merged + "\n");
        }
        continue;
      }

      if (tag === "TABLE") {
        continue;
      }

      if (tag === "PRE") {
        const text = node.textContent || "";
        if (text.trim()) {
          out.push("```\n" + text + "\n```\n\n");
        }
        continue;
      }

      if (tag === "P" || tag === "DIV") {
        const inline = [];
        this.#processInlineNodes(node.childNodes, inline);
        const merged = this.#mergeAdjacentMarkers(inline.join(""));
        if (merged.trim()) {
          out.push(merged + "\n\n");
        }
        continue;
      }

      if (tag === "BR") {
        out.push("\n");
        continue;
      }

      const inline = [];
      this.#processInlineNodes(node.childNodes, inline);
      const merged = this.#mergeAdjacentMarkers(inline.join(""));
      if (merged.trim()) {
        out.push(merged + "\n\n");
      }
    }
  }

  /**
   * Process a list element and its children with proper indentation.
   * @static
   * @param {Element} listNode
   * @param {number} depth
   * @param {string[]} out
   */
  static #processList(listNode, depth, out) {
    for (const child of listNode.children) {
      if (child.tagName !== "LI") continue;

      const inline = [];
      const nestedLists = [];
      for (const cn of child.childNodes) {
        if (cn.nodeType === 1 && (cn.tagName === "UL" || cn.tagName === "OL")) {
          nestedLists.push(cn);
        } else {
          this.#processInlineNodes([cn], inline);
        }
      }
      const merged = this.#mergeAdjacentMarkers(inline.join("").trim());
      if (merged) {
        out.push("  ".repeat(depth) + "- " + merged + "\n");
      }
      for (const nl of nestedLists) {
        this.#processList(nl, depth + 1, out);
      }
    }
  }

  /**
   * Process inline-level nodes, accumulating markdown text and link references.
   * @static
   * @param {NodeList} nodes
   * @param {string[]} out
   */
  static #processInlineNodes(nodes, out) {
    for (const node of nodes) {
      if (node.nodeType === 3) {
        out.push(node.textContent.replace(/\u00a0/g, " "));
        continue;
      }
      if (node.nodeType !== 1) continue;

      const tag = node.tagName;

      if (tag === "STRONG" || tag === "B") {
        const inner = [];
        this.#processInlineNodes(node.childNodes, inner);
        const raw = inner.join("");
        const trimmed = raw.trim();
        if (trimmed) {
          out.push("**" + trimmed + "**");
        } else if (raw) {
          out.push(" ");
        }
        continue;
      }

      if (tag === "EM" || tag === "I") {
        const inner = [];
        this.#processInlineNodes(node.childNodes, inner);
        const raw = inner.join("");
        const trimmed = raw.trim();
        if (trimmed) {
          out.push("*" + trimmed + "*");
        } else if (raw) {
          out.push(" ");
        }
        continue;
      }

      if (tag === "SPAN") {
        const style = (node.getAttribute("style") || "").toLowerCase();
        const isBold = /font-weight:\s*(?:bold|[6-9]\d{2})/.test(style);
        const isItalic = /font-style:\s*italic/.test(style);
        const isMono =
          /font-family:\s*(?:consolas|courier\s*new|courier|lucida\s*console|monaco|monospace)/i.test(
            style,
          );

        const inner = [];
        this.#processInlineNodes(node.childNodes, inner);
        const raw = inner.join("");
        const trimmed = raw.trim();

        if (trimmed) {
          let text = trimmed;
          if (isMono) {
            text = "`" + text.replace(/`/g, "\\`") + "`";
          }
          if (isBold && isItalic) {
            out.push("***" + text + "***");
          } else if (isBold) {
            out.push("**" + text + "**");
          } else if (isItalic) {
            out.push("*" + text + "*");
          } else {
            out.push(text);
          }
        } else if (raw) {
          out.push(" ");
        }
        continue;
      }

      if (tag === "A") {
        const href = node.getAttribute("href") || "";
        const inner = [];
        this.#processInlineNodes(node.childNodes, inner);
        const text = inner.join("").trim();
        if (href) {
          out.push("[" + (text || href) + "](" + href + ")");
        } else if (text) {
          out.push(text);
        }
        continue;
      }

      if (tag === "BR") {
        out.push("\n");
        continue;
      }

      const inner = [];
      this.#processInlineNodes(node.childNodes, inner);
      out.push(inner.join(""));
    }
  }

  /**
   * Merge adjacent same-type markdown markers.
   * Converts "**a** **b**" → "**a b**" and "***a*** ***b***" → "***a b***".
   * Bold+italic is merged first so its triple-asterisk markers are not
   * broken up by the double-asterisk pass.
   * @static
   * @param {string} text
   * @returns {string}
   */
  static #mergeAdjacentMarkers(text) {
    let s = text;
    for (let i = 0; i < 10; i++) {
      const prev = s;
      s = s.replace(/\*\*\*([^*]+?)\*\*\*(\s*)\*\*\*(?!\*)/g, "***$1$2");
      if (s === prev) break;
    }
    for (let i = 0; i < 10; i++) {
      const prev = s;
      s = s.replace(/\*\*([^*]+?)\*\*(\s*)\*\*(?!\*)/g, "**$1$2");
      if (s === prev) break;
    }
    for (let i = 0; i < 10; i++) {
      const prev = s;
      s = s.replace(/(?<!\*)\*([^*]+?)\*(\s+)\*(?!\*)/g, "*$1$2");
      if (s === prev) break;
    }
    s = s.replace(/\*\*\s*\*\*/g, " ");
    s = s.replace(/(?<!\*)\*\s+\*(?!\*)/g, " ");
    return s;
  }

  /**
   * Strip all HTML tags, returning plain text only.
   * Used for plain-text preview (toPlainText) and table cells.
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
        let dataUrl = await convert(bytes.buffer, 1920, 1080);

        if (!dataUrl) {
          console.warn(
            `EMF conversion returned null for ${img.ref} (size: ${bytes.length} bytes) — browser may lack Canvas API or file is invalid`,
          );
          continue;
        }

        // EMF → PNG exports typically carry large transparent margins
        // (the EMF canvas is sized to the slide, not to the picture),
        // which makes the image element's bounding box much bigger
        // than the visible picture.  Trim those margins now so what
        // lands in the deck matches what the user sees in PowerPoint.
        dataUrl = (await this.#trimTransparentMargins(dataUrl)) ?? dataUrl;

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
   * Convert TIFF images to PNG data URLs using utif2.
   * Browsers cannot display TIFF natively, so we decode to RGBA and
   * render via Canvas to produce PNG data URLs.
   * @static
   * @param {ExtractedSlide[]} slides
   * @param {ExtractedImage[]} images
   * @returns {Promise<void>}
   */
  static async #convertTiffImages(slides, images) {
    let Utif;
    try {
      Utif = await import("utif2");
    } catch (err) {
      console.warn("utif2 not available, skipping TIFF conversion:", err);
      return;
    }

    for (const img of images) {
      if (img.mimeType !== "image/tiff") continue;
      try {
        const raw = img.base64.replace(/^data:[^;]+;base64,/, "");
        const binary = atob(raw);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        // Decode first page of TIFF
        const ifds = Utif.decode(bytes.buffer);
        if (!ifds || ifds.length === 0) {
          console.warn(`TIFF decode returned no pages for ${img.ref}`);
          continue;
        }
        const firstPage = ifds[0];
        Utif.decodeImage(bytes.buffer, firstPage);

        const w = firstPage.width;
        const h = firstPage.height;

        if (typeof document === "undefined" || !document.createElement) {
          console.warn("Canvas API not available, skipping TIFF conversion for", img.ref);
          continue;
        }

        // Render decoded RGBA to canvas → PNG data URL
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        const rgba = new Uint8Array(firstPage.data);
        const imageData = ctx.createImageData(w, h);
        // utif2 outputs RGBA already
        imageData.data.set(rgba);
        ctx.putImageData(imageData, 0, 0);

        const dataUrl = canvas.toDataURL("image/png");
        const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");

        img.base64 = base64;
        img.mimeType = "image/png";

        // Update corresponding elements in slides
        for (const slide of slides) {
          for (const el of slide.elements) {
            if (el.type === "image" && el.ref === img.ref && el.mimeType !== "image/png") {
              el.base64 = base64;
              el.mimeType = "image/png";
            }
          }
        }
      } catch (err) {
        console.warn(`Could not convert ${img.ref} from TIFF:`, err);
      }
    }
  }

  /**
   * Trim transparent margins around the visible content of a PNG data
   * URL.  EMF → PNG conversion produces a canvas sized to the slide
   * (typically 1920×1080) with the actual picture floating in the
   * middle and large transparent bands around it — most noticeably at
   * the bottom.  Returning a cropped data URL here means what lands in
   * the deck matches what the user sees in PowerPoint, without
   * requiring a manual 'Trim margins' click in the editor.
   *
   * Uses a small alpha threshold (10/255) so faint near-transparent
   * artifact pixels left at the canvas edges by the EMF converter are
   * treated as transparent and cropped away — a strict `alpha > 0`
   * test would treat those as content and keep the bottom band.
   *
   * Returns `null` when trimming cannot be performed (no Canvas API,
   * no transparent border, decode failure, no visible content) so the
   * caller can fall back to the original data URL.
   *
   * @static
   * @param {string} dataUrl - PNG data URL to trim.
   * @returns {Promise<string|null>}
   */
  static async #trimTransparentMargins(dataUrl) {
    if (typeof document === "undefined" || !document.createElement) return null;
    const ALPHA_THRESHOLD = 10; // out of 255 — ~4% opacity
    const PAD_THRESHOLD_PCT = 1; // require ≥1% transparent band on some side

    try {
      const bitmap = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = (e) => reject(new Error("decode failed: " + String(e)));
        image.src = dataUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      const { data, width: cw, height: ch } = ctx.getImageData(0, 0, canvas.width, canvas.height);

      let minX = cw;
      let minY = ch;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          if (data[(y * cw + x) * 4 + 3] >= ALPHA_THRESHOLD) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return null;

      const minPadX = Math.ceil(cw * (PAD_THRESHOLD_PCT / 100));
      const minPadY = Math.ceil(ch * (PAD_THRESHOLD_PCT / 100));
      const hasBorder =
        minX >= minPadX || minY >= minPadY || cw - 1 - maxX >= minPadX || ch - 1 - maxY >= minPadY;
      if (!hasBorder) return null;

      const trimmedW = maxX - minX + 1;
      const trimmedH = maxY - minY + 1;
      const cropped = document.createElement("canvas");
      cropped.width = trimmedW;
      cropped.height = trimmedH;
      cropped
        .getContext("2d")
        .drawImage(canvas, minX, minY, trimmedW, trimmedH, 0, 0, trimmedW, trimmedH);
      return cropped.toDataURL("image/png");
    } catch (err) {
      console.warn("trimTransparentMargins failed:", err);
      return null;
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
   * Detect placeholder type from the element's name attribute.
   * PowerPoint names footer placeholders "Footer Placeholder N",
   * date placeholders "Date and time placeholder N", and slide
   * number placeholders "Slide Number Placeholder N".
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
      tif: "image/tiff",
      tiff: "image/tiff",
    };
    return map[ext] || "image/png";
  }

  /**
   * Build structured chart data (headers + rows) from extracted chart data.
   * Shared by toPlainText and markdown chart formatting.
   * @static
   * @param {ChartData[]} chartData
   * @returns {{ headers: string[], rows: string[][] }}
   */
  static buildChartDataRows(chartData) {
    if (!chartData?.length) return { headers: [], rows: [] };

    const allXIndices = new Set();
    for (const series of chartData) {
      for (const point of series.values) {
        allXIndices.add(point.x);
      }
    }
    const sortedX = Array.from(allXIndices).sort((a, b) => a - b);

    const headers = ["Category", ...chartData.map((s) => String(s.key))];
    const rows = [];
    for (const x of sortedX) {
      const firstSeries = chartData[0];
      const category = firstSeries?.xlabels?.[x] ?? String(x);
      const values = chartData.map((s) => {
        const point = s.values.find((p) => p.x === x);
        return point?.y !== undefined ? String(point.y) : "";
      });
      rows.push([category, ...values]);
    }
    return { headers, rows };
  }

  /**
   * Convert extraction result to a plain-text representation suitable
   * for preview or external processing. Strips positioning data, keeps content.
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
            const { headers, rows } = this.buildChartDataRows(el.chartData);
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
            // Content is textList joined with ", " - split and display as list
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
