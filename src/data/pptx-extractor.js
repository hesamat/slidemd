/**
 * PptxExtractor
 *
 * Parses PPTX files using pptxtojson and extracts structured content
 * (text, images, notes, tables) suitable for conversion to SlideMD.
 *
 * @class
 */
import { parse } from "pptxtojson";
import JSZip from "jszip";
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
 * @property {'text'|'image'|'table'|'shape'|'chart'|'diagram'|'connector'} type
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
 * @property {string} [shapType] - Preset shape type (e.g., 'rect', 'ellipse', 'triangle').
 * @property {string} [fill] - Fill color or gradient description.
 * @property {boolean} [strokeOnly] - Whether shape is stroke-only (arrows, lines).
 * @property {boolean} [hasConnector] - Whether this element is a connector/arrow.
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
  // pptxtojson returns image dimensions in points; all other coordinates are in EMU.
  // 1 pt = 914400 / 72 = 12700 EMU.
  static #PT_TO_EMU = 12700;
  // Images with both dimensions below this threshold (in EMU) are treated as
  // decorative icons, bullets, or ornaments.  ~15 pt ≈ 20 px at 96 DPI.
  static #MIN_SIZE_EMU = 15 * 12700;

  /**
   * Parse a PPTX file (as ArrayBuffer) and return structured extraction data.
   * @static
   * @param {ArrayBuffer} buffer - PPTX file contents.
   * @returns {Promise<ExtractionResult>}
   */
  static async extract(buffer) {
    const raw = await parse(buffer);

    // Extract ordered list start values from raw PPTX XML before pptxtojson
    // drops them from the generated HTML.
    // NOTE: This calls JSZip.loadAsync separately from pptxtojson.parse(),
    // so the ZIP is parsed twice. This is unavoidable because pptxtojson
    // only accepts ArrayBuffer and drops <ol start="X"> attributes.
    const olStartValues = await this.#extractOlStartValues(buffer);

    // pptxtojson sorts slides by filename (slide1.xml, slide2.xml, …), which
    // is usually but not always the same as the presentation order. PowerPoint
    // can reorder slides in the UI without renaming the XML files — the true
    // order is defined by <p:sldIdLst> in presentation.xml. Re-sort the parsed
    // slides to match the author's intended order.
    //
    // #extractSlideOrder returns { order, fileNumToIndex } where:
    //   order[i] = file number of the i-th slide in presentation order
    //   fileNumToIndex.get(fileNum) = index into raw.slides for that file
    // This handles gaps in file numbering (e.g. slide1, slide2, slide4 after
    // a deletion) — raw.slides is indexed by position in the sorted file list,
    // not by file number.
    const slideOrderInfo = await this.#extractSlideOrder(buffer);
    const orderedRawSlides = slideOrderInfo
      ? slideOrderInfo.order
          .map((fileNum) => raw.slides[slideOrderInfo.fileNumToIndex.get(fileNum)])
          .filter((s) => s != null)
      : raw.slides;

    // Build a fallback fileNum→index map for the OL start value lookup when
    // #extractSlideOrder returned null. This keeps the olKey consistent: the
    // OL start values are keyed by file number minus one, not array position,
    // so without this map a deck with file-number gaps would misalign OL starts
    // in the fallback path.
    let fallbackFileNums = null;
    if (!slideOrderInfo) {
      const zip = await JSZip.loadAsync(buffer);
      const slideFiles = Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name) && !zip.files[name].dir)
        .map((name) => Number(name.match(/slide(\d+)\.xml/)[1]))
        .sort((a, b) => a - b);
      fallbackFileNums = slideFiles;
    }

    const images = [];
    const slides = (orderedRawSlides || []).map((slide, index) => {
      // olStartValues is keyed by 0-based filename number (slideN → N-1).
      // When slides are reordered, look up by the original filename number,
      // not the new presentation position. In the fallback path, use the
      // file number from the sorted file list (not the array index) so that
      // file-number gaps don't misalign the lookup.
      const olKey = slideOrderInfo
        ? slideOrderInfo.order[index] - 1
        : (fallbackFileNums?.[index] ?? index + 1) - 1;
      return this.#processSlide(slide, index, images, olStartValues.get(olKey) || []);
    });

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
   * @param {number[]} [olStartValues] - Ordered list start values for this slide.
   * @returns {ExtractedSlide}
   */
  static #processSlide(slide, index, imagesAccum, olStartValues = []) {
    // Process layout elements first (backgrounds, placeholders), then content
    const raw = [];
    // Track which start values have been consumed so each <ol> gets the right one.
    let startIdx = 0;
    for (const el of slide.layoutElements || []) {
      // Skip images from layout — they are theme decorations, not slide content
      if (el.type === "image") continue;
      const extracted = this.#processElement(el, index, imagesAccum, olStartValues, {
        startIdxRef: { value: startIdx },
      });
      if (extracted) {
        // Update startIdx from the mutable ref after processing.
        startIdx = extracted._startIdx ?? startIdx;
        raw.push(extracted);
        delete extracted._startIdx;
      }
    }
    for (const el of slide.elements || []) {
      const extracted = this.#processElement(el, index, imagesAccum, olStartValues, {
        startIdxRef: { value: startIdx },
      });
      if (extracted) {
        startIdx = extracted._startIdx ?? startIdx;
        raw.push(extracted);
        delete extracted._startIdx;
      }
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
      const w = (el.width || 0) * this.#PT_TO_EMU;
      const h = (el.height || 0) * this.#PT_TO_EMU;
      // A significant image has at least one dimension above the threshold.
      // Tiny square icons are decorative; thin separator lines are content.
      return w >= this.#MIN_SIZE_EMU || h >= this.#MIN_SIZE_EMU;
    }
    if (el.type === "group" && el.elements) {
      return el.elements.some((child) => this.#hasSignificantImages(child));
    }
    return false;
  }

  /**
   * Determine whether a group contains only decorative images (no text).
   * Agenda slides and section openers often wrap background art and logos in a
   * group that has no text children.  If every child is an image and the images
   * together cover most of the group's bounding box, the group is decorative.
   *
   * Groups that contain shapes (borders, frames, callouts) alongside images are
   * treated as content — e.g. a code screenshot inside a rounded-rect border.
   * @static
   * @param {import('pptxtojson').Element} group
   * @returns {boolean}
   */
  static #isGroupDecorativeImages(group) {
    const children = group.elements || [];
    if (children.length === 0) return false;

    // Must have no text, tables, charts, or diagrams
    const hasTextualContent = children.some(
      (child) =>
        child.type === "text" ||
        child.type === "table" ||
        child.type === "chart" ||
        child.type === "diagram",
    );
    if (hasTextualContent) return false;

    // If the group contains shapes (borders, frames, callouts) alongside
    // images, it is content — e.g. a screenshot inside a styled border.
    const hasShapes = children.some((child) => child.type === "shape");
    if (hasShapes) return false;

    const images = children.filter((child) => child.type === "image");
    if (images.length === 0) return false;

    // Compute the group's bounding box from ALL children (including shapes).
    // Shapes intentionally expand the bounding box, diluting the image-to-group
    // area ratio.  This prevents a tiny image inside a large border from being
    // misclassified as decorative.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const child of children) {
      const cl = (child.left || 0) * this.#PT_TO_EMU;
      const ct = (child.top || 0) * this.#PT_TO_EMU;
      const cw = (child.width || 0) * this.#PT_TO_EMU;
      const ch = (child.height || 0) * this.#PT_TO_EMU;
      if (cl < minX) minX = cl;
      if (ct < minY) minY = ct;
      if (cl + cw > maxX) maxX = cl + cw;
      if (ct + ch > maxY) maxY = ct + ch;
    }
    const groupW = maxX - minX;
    const groupH = maxY - minY;
    const groupArea = groupW * groupH;
    if (groupArea === 0) return false;

    // Sum image areas, skipping tiny icons
    let totalImageArea = 0;
    for (const img of images) {
      const w = (img.width || 0) * this.#PT_TO_EMU;
      const h = (img.height || 0) * this.#PT_TO_EMU;
      if (w < this.#MIN_SIZE_EMU && h < this.#MIN_SIZE_EMU) continue;
      totalImageArea += w * h;
    }

    // Images must cover > 85% of the group's bounding box to be considered
    // a decorative background cluster.  A lower threshold (e.g. 50%) risks
    // dropping content groups such as multiple code-block screenshots that
    // have visible spacing between them.
    return totalImageArea / groupArea > 0.85;
  }

  /**
   * Process a single element.
   * @static
   * @param {import('pptxtojson').Element} el
   * @param {number} slideIndex
   * @param {ExtractedImage[]} imagesAccum
   * @param {number[]} [olStartValues] - Ordered list start values for this slide.
   * @param {{ startIdxRef: { value: number } }} [opts] - Mutable ref to track consumed start values.
   * @returns {ExtractedElement|null}
   */
  static #processElement(el, slideIndex, imagesAccum, olStartValues = [], opts) {
    if (el.type === "group" && el.elements) {
      // Skip groups that contain no renderable content — only tiny decorative
      // images, empty shapes, or unrecognized types.  Keep groups that have
      // text, tables, charts, diagrams, or any non-tiny image.
      if (!this.#hasTextContent(el) && !this.#hasSignificantImages(el)) {
        return null;
      }

      // Check if this group is a manually created diagram (shapes + connectors)
      const processedChildren = [];
      for (const child of el.elements) {
        const r = this.#processElement(child, slideIndex, imagesAccum, olStartValues, opts);
        if (r) {
          if (Array.isArray(r)) {
            for (const item of r) {
              item.left += el.left;
              item.top += el.top;
              processedChildren.push(item);
            }
          } else {
            r.left += el.left;
            r.top += el.top;
            processedChildren.push(r);
          }
        }
      }

      // If the group forms a manual diagram, convert it to a diagram element
      if (this.#isManualDiagram(processedChildren)) {
        return this.#shapesToDiagram(processedChildren, el.order || 0);
      }

      // Otherwise, flatten group elements as before
      // Skip all images in groups that are purely decorative
      const isDecorative = this.#isGroupDecorativeImages(el);
      const results = [];
      for (const child of el.elements) {
        if (isDecorative && child.type === "image") {
          continue;
        }
        const r = this.#processElement(child, slideIndex, imagesAccum, olStartValues, opts);
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
      let html = el.content || "";
      // Inject <ol start="X"> attributes from raw PPTX XML.
      // pptxtojson drops the start attribute, so we reconstruct it here.
      if (html.includes("<ol") && olStartValues.length > 0 && opts?.startIdxRef) {
        html = this.injectOlStartAttributes(html, olStartValues, opts.startIdxRef);
      }
      const content = htmlToMarkdown(html);

      // Preserve shape metadata for diagram detection
      const isConnector = !!el.headEnd || !!el.tailEnd;
      const shapType = el.shapType || null;
      const fill = el.fill?.type === "color" ? el.fill.value : null;
      const strokeOnly = !!el.strokeOnly;

      // Empty shapes with no text content: preserve if they have visual properties
      if (!content.trim()) {
        if (!shapType && !isConnector && !strokeOnly) return null;
        return {
          type: isConnector ? "connector" : "shape",
          content: "",
          shapType,
          fill,
          strokeOnly,
          hasConnector: isConnector,
          placeholderType,
          order: el.order,
          left: el.left,
          top: el.top,
          width: el.width,
          height: el.height,
        };
      }

      const result = {
        type: "text",
        content,
        shapType,
        fill,
        strokeOnly,
        hasConnector: isConnector,
        placeholderType,
        order: el.order,
        left: el.left,
        top: el.top,
        width: el.width,
        height: el.height,
      };
      // Propagate the updated startIdx back through the mutable ref.
      if (opts?.startIdxRef) {
        result._startIdx = opts.startIdxRef.value;
      }
      return result;
    }

    if (el.type === "image") {
      const mime = this.#inferMimeType(el.ref);

      // pptxtojson returns image dimensions in points while all other
      // element coordinates (left, top) are in EMU.  Normalise to EMU
      // so layout inference can compare image sizes against the slide
      // dimensions without unit-mismatch errors.
      const widthEmu = (el.width || 0) * this.#PT_TO_EMU;
      const heightEmu = (el.height || 0) * this.#PT_TO_EMU;

      // Skip tiny images (likely decorative icons, bullets, or ornaments).
      // Uses AND: both dimensions must be small.  A thin separator line
      // (e.g. 5×500pt) is intentional content and should be kept.
      if (widthEmu < this.#MIN_SIZE_EMU && heightEmu < this.#MIN_SIZE_EMU) {
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
          fillColor: cell.fillColor || null,
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
   * Extract the true slide order from presentation.xml.
   *
   * PowerPoint stores the author's intended slide order in `<p:sldIdLst>` in
   * `ppt/presentation.xml`. Each `<p:sldId>` entry has an `r:id` attribute that
   * maps to a slide file via `ppt/_rels/presentation.xml.rels`. The XML file
   * names (slide1.xml, slide2.xml, …) do NOT necessarily match this order —
   * PowerPoint can reorder slides in the UI without renaming the files, and
   * deletions can leave gaps in the numbering (e.g. slide1, slide2, slide4).
   *
   * `pptxtojson` sorts by filename, so `raw.slides[k]` is the k-th file in
   * sorted order, NOT `slide(k+1).xml`. This method returns both the
   * presentation order (as file numbers) and a mapping from file number to
   * array index, so the caller can correctly index into `raw.slides` even
   * when there are gaps.
   *
   * @static
   * @param {ArrayBuffer} buffer - PPTX file buffer.
   * @returns {Promise<{order: number[], fileNumToIndex: Map<number, number>}|null>}
   *   `order[i]` is the 1-based file number of the i-th slide in presentation
   *   order. `fileNumToIndex.get(fileNum)` is the index into `raw.slides` for
   *   that file. Returns null if the order could not be determined (in which
   *   case the caller should fall back to filename order).
   */
  static async #extractSlideOrder(buffer) {
    try {
      const zip = await JSZip.loadAsync(buffer);

      // 1. Read presentation.xml to get the <p:sldIdLst> order (rIds).
      const presXml = await zip.file("ppt/presentation.xml")?.async("text");
      if (!presXml) return null;

      // Extract r:id values from <p:sldIdLst> in document order.
      // The namespace prefix may vary (r:id, a:r:id, etc.), so match generically.
      const sldIdMatches = [...presXml.matchAll(/<p:sldId[^>]*\sr:id="([^"]+)"/gi)];
      if (sldIdMatches.length === 0) return null;
      const rIds = sldIdMatches.map((m) => m[1]);

      // 2. Read presentation.xml.rels to map rIds → slide file paths.
      const relsXml = await zip.file("ppt/_rels/presentation.xml.rels")?.async("text");
      if (!relsXml) return null;

      const relMap = new Map();
      const relMatches = [
        ...relsXml.matchAll(/<Relationship[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/gi),
      ];
      for (const rel of relMatches) {
        relMap.set(rel[1], rel[2]);
      }

      // 3. Map each rId to a slide number (extracted from the target filename).
      const order = [];
      for (const rId of rIds) {
        const target = relMap.get(rId);
        if (!target) continue;
        const numMatch = target.match(/slide(\d+)\.xml/i);
        if (numMatch) {
          order.push(Number(numMatch[1]));
        }
      }

      // 4. Validate: no duplicates, no empty list.
      if (order.length === 0) return null;
      const unique = new Set(order);
      if (unique.size !== order.length) return null; // duplicate slide numbers

      // 5. Build fileNum → arrayIndex mapping from the sorted slide files.
      //    pptxtojson sorts by filename, so raw.slides[k] is the k-th file in
      //    sorted order. We replicate that sort here to build the mapping.
      const slideFiles = Object.keys(zip.files).filter(
        (name) => /^ppt\/slides\/slide\d+\.xml$/.test(name) && !zip.files[name].dir,
      );
      slideFiles.sort((a, b) => {
        const na = Number(a.match(/slide(\d+)\.xml/)[1]);
        const nb = Number(b.match(/slide(\d+)\.xml/)[1]);
        return na - nb;
      });
      const fileNumToIndex = new Map();
      for (let i = 0; i < slideFiles.length; i++) {
        const num = Number(slideFiles[i].match(/slide(\d+)\.xml/)[1]);
        fileNumToIndex.set(num, i);
      }

      // 6. Validate: every file number in `order` must have a matching file.
      //    If any is missing, fall back to filename order.
      for (const fileNum of order) {
        if (!fileNumToIndex.has(fileNum)) return null;
      }

      return { order, fileNumToIndex };
    } catch {
      // If anything fails (corrupted ZIP, missing files, etc.), return null
      // so the caller falls back to pptxtojson's filename-sorted order.
      return null;
    }
  }

  /**
   * Extract ordered list start values from raw PPTX XML.
   * PptxToJSON drops <ol start="X"> attributes, so we read them directly.
   *
   * @static
   * @param {ArrayBuffer} buffer - PPTX file buffer.
   * @returns {Promise<Map<number, number[]>>} Slide index → array of start values.
   */
  static async #extractOlStartValues(buffer) {
    const startValues = new Map();
    try {
      const zip = await JSZip.loadAsync(buffer);
      const slideFiles = Object.keys(zip.files).filter(
        (name) => /^ppt\/slides\/slide\d+\.xml$/.test(name) && !zip.files[name].dir,
      );
      slideFiles.sort((a, b) => {
        const na = Number(a.match(/slide(\d+)\.xml/)[1]);
        const nb = Number(b.match(/slide(\d+)\.xml/)[1]);
        return na - nb;
      });

      for (const slideFile of slideFiles) {
        const match = slideFile.match(/slide(\d+)\.xml/);
        if (!match) continue;
        const slideIndex = Number(match[1]) - 1;

        const xml = await zip.files[slideFile].async("text");
        // Find <a:buAutoNum start="X"> elements in document order.
        // The start attribute indicates where numbering begins for that list.
        const starts = [];
        const re = /<a:buAutoNum[^>]*\s+start="(\d+)"[^>]*>/gi;
        let m;
        while ((m = re.exec(xml)) !== null) {
          starts.push(Number(m[1]));
        }
        if (starts.length > 0) {
          startValues.set(slideIndex, starts);
        }
      }
    } catch {
      // If ZIP parsing fails (corrupted file, etc.), silently return empty map.
      // The converter will fall back to default numbering.
    }
    return startValues;
  }

  /**
   * Inject <ol start="X"> attributes into HTML content.
   * PptxToJSON drops these attributes, so we reconstruct them from raw XML data.
   *
   * @static
   * @param {string} html - HTML content from pptxtojson.
   * @param {number[]} olStartValues - Start values for this slide's ordered lists.
   * @param {{ value: number }} startIdxRef - Mutable ref tracking the current position in olStartValues.
   * @returns {string} HTML with <ol start="X"> attributes injected.
   */
  static injectOlStartAttributes(html, olStartValues, startIdxRef) {
    // Match <ol> or <ol ...> tags.
    return html.replace(/<ol(\s[^>]*)?>/gi, (fullMatch, attrs) => {
      // If there's already a start attribute, leave it alone.
      if (attrs && /\bstart\s*=/i.test(attrs)) return fullMatch;
      // Get the next unused start value for this slide.
      const idx = startIdxRef.value;
      if (idx >= olStartValues.length) return fullMatch;
      const startVal = olStartValues[idx];
      startIdxRef.value = idx + 1;
      // Only inject if start != 1 (default is already 1).
      if (startVal <= 1) return fullMatch;
      return `<ol start="${startVal}"${attrs || ""}>`;
    });
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
   * Detect if a group of elements forms a manual diagram (shapes + connectors).
   * @static
   * @param {ExtractedElement[]} elements - Elements in the group.
   * @returns {boolean} True if the group looks like a diagram.
   */
  static #isManualDiagram(elements) {
    if (elements.length < 2) return false;

    // Count connectors (arrows, lines)
    const connectors = elements.filter((el) => el.type === "connector" || el.hasConnector);

    // Count shapes with visual properties (fills, borders)
    const filledShapes = elements.filter(
      (el) =>
        (el.type === "shape" || el.type === "text") && (el.fill || el.strokeOnly || el.shapType),
    );

    // Rule 1: Any connectors present → likely a diagram
    if (connectors.length > 0) return true;

    // Rule 2: 3+ filled shapes in close proximity → likely a diagram
    if (filledShapes.length >= 3) {
      // Check if shapes are in reasonable proximity (within 3x the average dimension)
      const avgDim =
        filledShapes.reduce((sum, el) => sum + (el.width || 0) + (el.height || 0), 0) /
        (filledShapes.length * 2);
      const maxDist = avgDim * 3;

      const minX = Math.min(...filledShapes.map((el) => el.left || 0));
      const maxX = Math.max(...filledShapes.map((el) => (el.left || 0) + (el.width || 0)));
      const minY = Math.min(...filledShapes.map((el) => el.top || 0));
      const maxY = Math.max(...filledShapes.map((el) => (el.top || 0) + (el.height || 0)));

      if (maxX - minX < maxDist && maxY - minY < maxDist) {
        return true;
      }
    }

    return false;
  }

  /**
   * Convert detected shape diagram elements to a diagram-type element.
   * @static
   * @param {ExtractedElement[]} elements - Shape elements forming a diagram.
   * @param {number} order - Element order for positioning.
   * @returns {ExtractedElement} A diagram element with text content.
   */
  static #shapesToDiagram(elements, order) {
    // Extract text from all shapes in the diagram
    const texts = elements
      .filter((el) => el.content && el.content.trim())
      .map((el) => el.content.trim());

    // If no text, create a descriptive label from shape types
    const content = texts.length > 0 ? texts.join(", ") : `[Diagram: ${elements.length} shapes]`;

    // Calculate bounding box
    const minX = Math.min(...elements.map((el) => el.left || 0));
    const minY = Math.min(...elements.map((el) => el.top || 0));
    const maxX = Math.max(...elements.map((el) => (el.left || 0) + (el.width || 0)));
    const maxY = Math.max(...elements.map((el) => (el.top || 0) + (el.height || 0)));

    return {
      type: "diagram",
      content,
      placeholderType: null,
      order,
      left: minX,
      top: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }
}
