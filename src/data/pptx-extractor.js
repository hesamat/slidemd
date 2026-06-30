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

    // --- Merge split bullets + nest sub-lists ---
    // pptxtojson sometimes wraps only part of a bullet's text in
    // <li>…</li></ul>, then puts the rest in a loose <p>…</p>, and
    // then opens a new <ul> for sub-bullets.  Without this pre-
    // processing the output would be:
    //   - first half
    //   second half                 ← plain text, not a bullet
    //   - sub bullet 1              ← sibling, not nested
    //   - sub bullet 2
    // After merge:
    //   - first half second half
    //     - sub bullet 1            ← nested under the first bullet
    //     - sub bullet 2
    // We restructure the HTML so the continuation <p> text joins the
    // <li> content and the following <ul> nests inside it.  The
    // existing %%LIST_OPEN%% / %%LI%% / %%LIST_CLOSE%% token walk
    // then naturally produces the correct depth.
    s = s.replace(
      /<ul[^>]*>\s*<li[^>]*>\s*(<p[^>]*>)?\s*([\s\S]*?)\s*(<\/p>)?\s*<\/li>\s*<\/ul>\s*<p[^>]*>([\s\S]*?)<\/p>\s*(?=<ul[^>]*>|<ol[^>]*>)/gi,
      (_m, pOpen, part1, pClose, part2) => {
        // Re-open and leave the </li></ul> to be matched by the
        // sub-list's closing tags at the end.
        return `<ul><li><p>${part1} ${part2}</p>`;
      },
    );

    // Inline formatting from semantic HTML tags
    s = s.replace(/<\/?strong>/gi, "**");
    s = s.replace(/<\/?b>/gi, "**");
    s = s.replace(/<\/?em>/gi, "*");
    s = s.replace(/<\/?i>/gi, "*");

    // Decode entities BEFORE merging so &nbsp; becomes a real space
    // that the merge regex can match, and so link label text captured
    // below is already decoded (pptxtojson keeps &lt;button&gt; as
    // entities inside <a>...</a>).
    s = s.replace(/&amp;/g, "&");
    s = s.replace(/&lt;/g, "<");
    s = s.replace(/&gt;/g, ">");
    s = s.replace(/&quot;/g, '"');
    s = s.replace(/&#39;/g, "'");
    s = s.replace(/&apos;/g, "'");
    s = s.replace(/&nbsp;/g, " ");

    // --- Links ---
    // pptxtojson emits hyperlinks as <a href="...">text</a>.  Convert
    // to markdown inline-link syntax [text](href) so the URL is
    // preserved in the slide markdown.  Run AFTER entity decoding so
    // the captured label text is already decoded (e.g. &lt;button&gt;
    // becomes <button>).  When the visible text is empty, fall back
    // to the href as the label so the link isn't dropped silently.
    s = s.replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, text) => {
      const label = text.trim() || href;
      return `[${label}](${href})`;
    });
    // Bare <a>…</a> without href (rare) — just keep the inner text.
    s = s.replace(/<a\s[^>]*>([\s\S]*?)<\/a>/gi, "$1");

    // Clean up whitespace-only formatting markers BEFORE merging.
    // pptxtojson emits <span bold>&nbsp;</span> between words and
    // <span bold+italic>&nbsp;</span> between bold+italic words.
    // After CSS formatting + entity decoding these become "** **"
    // (bold space) and "*** ***" (bold+italic space).  These markers
    // break the adjacent-marker merge by sitting between what should
    // be a single continuous run: "**word1** ** ** **word2**" can't
    // be merged cleanly because the merge regex consumes the closing
    // ** of the space marker and leaves the word markers orphaned.
    //
    // Collapse any whitespace-only marker pair to a plain space first.
    // After cleanup "**word1** ** ** **word2**" becomes
    // "**word1** **word2**" and the merge regex handles it cleanly.
    // triple-asterisk (bold+italic space)
    s = s.replace(/\*\*\*([ \t\n\r\f]*)\*\*\*/g, (m, content) =>
      /^[\s\u00a0]*$/.test(content) ? " " : m,
    );
    // double-asterisk (bold space)
    s = s.replace(/\*\*([ \t\n\r\f]*)\*\*/g, (m, content) =>
      /^[\s\u00a0]*$/.test(content) ? " " : m,
    );
    // single-asterisk (italic space)
    s = s.replace(/(?<!\*)\*([ \t\n\r\f]*)\*(?!\*)/g, (m, content) =>
      /^[\s\u00a0]*$/.test(content) ? " " : m,
    );

    // Merge adjacent same-type bold/italic markers.
    // pptxtojson splits bold text into separate spans per word,
    // producing "**word1** **word2**" instead of "**word1 word2**".
    // Bold+italic (***word***) is merged first so its triple-asterisk
    // markers aren't broken up by the ** pass.
    for (let i = 0; i < 10; i++) {
      const prev = s;
      s = s.replace(/\*\*\*([^*]+?)\*\*\*(\s*)\*\*\*/g, "***$1$2");
      if (s === prev) break;
    }
    for (let i = 0; i < 10; i++) {
      const prev = s;
      s = s.replace(/\*\*([^*]+?)\*\*(\s*)\*\*/g, "**$1$2");
      if (s === prev) break;
    }
    // Same for italic (single *)
    for (let i = 0; i < 10; i++) {
      const prev = s;
      s = s.replace(/(?<!\*)\*([^*]+?)\*(\s*)\*(?!\*)/g, "*$1$2");
      if (s === prev) break;
    }

    // Clean up any remaining empty bold/italic markers
    s = s.replace(/\*\*\s*\*\*/g, " ");
    s = s.replace(/(?<!\*)\*\s*\*(?!\*)/g, " ");

    // Block elements
    s = s.replace(/<br\s*\/?>/gi, "\n");
    s = s.replace(/<\/p>/gi, "\n");

    // Track list nesting: replace list tags with markers
    s = s.replace(/<ol[^>]*>/gi, "%%LIST_OPEN%%");
    s = s.replace(/<\/ol>/gi, "%%LIST_CLOSE%%");
    s = s.replace(/<ul[^>]*>/gi, "%%LIST_OPEN%%");
    s = s.replace(/<\/ul>/gi, "%%LIST_CLOSE%%");
    s = s.replace(/<li[^>]*>/gi, "%%LI%%");

    // Drop empty list items (e.g. "<li><p>&nbsp;</p></li>" — pptxtojson
    // emits these as spacer rows).  After the tag→marker conversion an
    // empty <li> becomes "%%LI%%" sandwiched between markers; collapse
    // any %%LI%% whose following text up to the next %% marker is only
    // whitespace so the token walk doesn't emit a bare "- " bullet
    // with no content.
    s = s.replace(/%%LI%%(?=\s*(?=%%|$))/g, "");

    // Strip remaining tags
    s = s.replace(/<[^>]+>/g, "");

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
    // pptxtojson wraps EACH WORD in its own <span>, so a 15-word
    // heading produces 15 sibling spans. The old 10-iteration cap
    // left trailing words un-converted, dropping their bold/italic
    // formatting entirely. Use a generous cap that covers long
    // sentences while protecting against pathological inputs.
    //
    // ORDERING: combined bold+italic MUST run before the single-
    // property bold and italic passes. The single-property regexes
    // accept any style attribute that includes `font-weight: bold`
    // (or `font-style: italic`) regardless of what *else* is in the
    // same style attribute, so running them first would convert a
    // `<span style="font-weight: bold; font-style: italic;">` span
    // to `**class=btn**` and lose the italic half of the styling.
    // Running combined first leaves only single-property spans for
    // the single-property passes.

    // Bold + italic: font-weight: bold AND font-style: italic
    // (handles spans like the `class=btn` run which is both bold
    // and italic in the same span).
    for (let i = 0; i < 500; i++) {
      const match = s.match(
        /<span\s+style="[^"]*font-weight:\s*(?:bold|[6-9]\d\d)[^"]*font-style:\s*italic[^"]*">((?:(?!<span|<\/span>).)*)<\/span>/i,
      );
      if (!match) break;
      s =
        s.slice(0, match.index) +
        "***" +
        match[1].trimEnd() +
        "***" +
        s.slice(match.index + match[0].length);
    }
    // Bold + italic (italic-first ordering in style attribute)
    for (let i = 0; i < 500; i++) {
      const match = s.match(
        /<span\s+style="[^"]*font-style:\s*italic[^"]*font-weight:\s*(?:bold|[6-9]\d\d)[^"]*">((?:(?!<span|<\/span>).)*)<\/span>/i,
      );
      if (!match) break;
      s =
        s.slice(0, match.index) +
        "***" +
        match[1].trimEnd() +
        "***" +
        s.slice(match.index + match[0].length);
    }
    // Bold: font-weight: bold or font-weight: 700+
    for (let i = 0; i < 500; i++) {
      const match = s.match(
        /<span\s+style="[^"]*font-weight:\s*(?:bold|[6-9]\d\d)[^"]*">((?:(?!<span|<\/span>).)*)<\/span>/i,
      );
      if (!match) break;
      s =
        s.slice(0, match.index) +
        "**" +
        match[1].trimEnd() +
        "**" +
        s.slice(match.index + match[0].length);
    }
    // Italic: font-style: italic
    for (let i = 0; i < 500; i++) {
      const match = s.match(
        /<span\s+style="[^"]*font-style:\s*italic[^"]*">((?:(?!<span|<\/span>).)*)<\/span>/i,
      );
      if (!match) break;
      s =
        s.slice(0, match.index) +
        "*" +
        match[1].trimEnd() +
        "*" +
        s.slice(match.index + match[0].length);
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
