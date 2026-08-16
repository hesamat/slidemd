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
import { renderDiagramsToPng } from "./pptx-shape-renderer.js";
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
 * @property {Object} [headEnd] - Arrow head at the start of a connector.
 * @property {Object} [tailEnd] - Arrow head at the end of a connector.
 * @property {string} [path] - SVG path data for custom geometry (from pptxtojson).
 * @property {{x: number, y: number, width: number, height: number}} [pathViewBox] - ViewBox for the path data.
 * @property {string} [borderColor] - Shape border color.
 * @property {number} [borderWidth] - Shape border width (pt).
 * @property {'solid'|'dashed'|'dotted'} [borderType] - Shape border style.
 * @property {number} [rotate] - Rotation in degrees.
 * @property {boolean} [isFlipV] - Whether the shape is flipped vertically.
 * @property {boolean} [isFlipH] - Whether the shape is flipped horizontally.
 * @property {{h: number, v: number, blur: number, color: string}} [shadow] - Shadow definition.
 * @property {import('pptxtojson').Fill} [fillRaw] - Full fill object (color/gradient/pattern/image) for rendering.
 * @property {ExtractedElement[]} [shapes] - Constituent shapes for a diagram element (used by the shape-renderer post-pass).
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
   * @param {number} [limit] - If set, only process the first `limit` slides.
   * @returns {Promise<ExtractionResult>}
   */
  static async extract(buffer, limit = undefined) {
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
    let orderedRawSlides = slideOrderInfo
      ? slideOrderInfo.order
          .map((fileNum) => raw.slides[slideOrderInfo.fileNumToIndex.get(fileNum)])
          .filter((s) => s != null)
      : raw.slides;

    if (limit != null && limit > 0) {
      orderedRawSlides = orderedRawSlides.slice(0, limit);
    }

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

    // Render shape/diagram groups to PNG screenshots (Phase 14.9, #117).
    // First try the high-fidelity slide-crop path; fall back to the SVG
    // builder if the cropper is unavailable or fails.
    await renderDiagramsToPng(slides, images, buffer);

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
   * Test-only wrapper for the private #detectTopLevelDiagrams method.
   * @static
   * @param {ExtractedElement[]} elements
   * @returns {ExtractedElement[]}
   */
  static detectTopLevelDiagramsForTest(elements) {
    return this.#detectTopLevelDiagrams(elements);
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

    let elements = raw.flat().filter(Boolean);

    // Detect top-level diagrams: shapes + connectors placed directly on the
    // slide (not wrapped in a <p:grpSp> group).  This catches flowcharts
    // created from ungrouped shapes, while the strict text filter inside
    // #detectTopLevelDiagrams keeps body text and code outside the group.
    elements = this.#detectTopLevelDiagrams(elements);

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

      // Preserve shape metadata for diagram detection and PNG rendering.
      // `fill` stays a plain color string for backwards compatibility with
      // layout inference / diagram detection; `fillRaw` carries the full
      // pptxtojson Fill object (gradient/pattern/image) needed by the
      // shape-renderer post-pass.
      const isConnector = !!el.headEnd || !!el.tailEnd;
      const shapType = el.shapType || null;
      const fill = el.fill?.type === "color" ? el.fill.value : null;
      const fillRaw = el.fill || null;
      const strokeOnly = !!el.strokeOnly;
      const geometry = {
        path: el.path || null,
        pathViewBox: el.pathViewBox || null,
        borderColor: el.borderColor || null,
        borderWidth: el.borderWidth || 0,
        borderType: el.borderType || null,
        rotate: el.rotate || 0,
        isFlipV: !!el.isFlipV,
        isFlipH: !!el.isFlipH,
        shadow: el.shadow || null,
        headEnd: el.headEnd || null,
        tailEnd: el.tailEnd || null,
      };

      // Empty shapes with no text content: preserve if they have visual properties
      if (!content.trim()) {
        if (!shapType && !isConnector && !strokeOnly) return null;
        return {
          type: isConnector ? "connector" : "shape",
          content: "",
          shapType,
          fill,
          fillRaw,
          strokeOnly,
          hasConnector: isConnector,
          placeholderType,
          order: el.order,
          left: el.left,
          top: el.top,
          width: el.width,
          height: el.height,
          ...geometry,
        };
      }

      const result = {
        type: "text",
        content,
        shapType,
        fill,
        fillRaw,
        strokeOnly,
        hasConnector: isConnector,
        placeholderType,
        order: el.order,
        left: el.left,
        top: el.top,
        width: el.width,
        height: el.height,
        ...geometry,
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
      // Process the diagram's child shapes so the shape-renderer post-pass
      // can screenshot them.  Each child is a Shape or Text with geometry
      // (path, fill, border, etc.) — process them the same way as top-level
      // shapes to preserve all rendering data.
      const childShapes = (el.elements || [])
        .map((child) => this.#processElement(child, slideIndex, imagesAccum, olStartValues, opts))
        .flat()
        .filter(Boolean);
      return {
        type: "diagram",
        content: text || "[Diagram]",
        placeholderType,
        order: el.order,
        left: el.left,
        top: el.top,
        width: el.width,
        height: el.height,
        shapes: childShapes.length > 0 ? childShapes : undefined,
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
   * Detect top-level diagrams: connectors and shape-like elements placed
   * directly on the slide (not inside a <p:grpSp> group). Groups adjacent
   * connectors + nearby shapes/text into a diagram element so the
   * shape-renderer post-pass can screenshot them.
   *
   * Strategy:
   * 1. Find all connectors (type=connector or hasConnector).
   * 2. If none, return elements unchanged.
   * 3. Compute the bounding box of all connectors, expanded by a fixed
   *    padding to capture nearby text boxes and shapes.
   * 4. Partition elements into "near" candidates (center in the expanded
   *    box and not obviously a slide title or long body text).
   * 5. Split the "near" candidates into connected components using edge
   *    distance (< 5 pt). This prevents one large connector bbox from
   *    swallowing unrelated, nearby clusters.
   * 6. For each component, keep plain text only if it is within 5 pt of a
   *    non-connector shape-like element (an actual box, not an arrow) in
   *    that component.
   * 7. Convert each remaining component that passes #isManualDiagram into
   *    a diagram element, leaving all other elements unchanged.
   *
   * @static
   * @param {ExtractedElement[]} elements
   * @returns {ExtractedElement[]}
   */
  static #detectTopLevelDiagrams(elements) {
    const connectors = elements.filter((el) => el.type === "connector" || el.hasConnector);

    // Shape-like elements: actual shapes (not text placeholders) with visual
    // properties like fills or borders.  These seed the candidate set even
    // when there are no connectors (e.g. Venn diagrams with nested ovals).
    const shapeLike = elements.filter(
      (el) =>
        !el.placeholderType &&
        (el.type === "shape" ||
          el.type === "connector" ||
          el.hasConnector ||
          el.shapType ||
          el.strokeOnly ||
          (el.type === "text" && (el.borderWidth || 0) > 0)),
    );

    if (connectors.length === 0 && shapeLike.length < 2) return elements;

    // Connector-based clusters should be tight (arrows point between shapes).
    // Shape-only clusters (e.g. concept maps with scattered ovals, Venn diagrams)
    // can be much looser; without this, diagrams like the COMP 1510 "Raw strings"
    // slide — four ovals across the top and one on the right — are never linked.
    const CLUSTER_GAP_PT = connectors.length > 0 ? 5 : 120;

    // Bounding box of all connectors (or shape-like elements if no connectors)
    const seeds = connectors.length > 0 ? connectors : shapeLike;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const c of seeds) {
      const cl = c.left || 0;
      const ct = c.top || 0;
      const cw = c.width || 0;
      const ch = c.height || 0;
      if (cl < minX) minX = cl;
      if (ct < minY) minY = ct;
      if (cl + cw > maxX) maxX = cl + cw;
      if (ct + ch > maxY) maxY = ct + ch;
    }
    // Expand the connector bounding box by a small fixed amount to catch the
    // text boxes / shapes that sit immediately next to the connectors.  We
    // deliberately avoid using connector length as the expansion factor because
    // long loop-back arrows (e.g. right-hand side of a flowchart) would blow
    // up the box and swallow unrelated slide text.  Colinear connectors get the
    // same fixed padding because diagram labels are typically centered on the
    // arrow axis and fall within this small margin.
    // NOTE: pptxtojson returns top-level element coordinates in points (not EMU).
    const EXPAND_X_PT = 50;
    const EXPAND_Y_PT = 40;
    const expandedMinX = minX - EXPAND_X_PT;
    const expandedMinY = minY - EXPAND_Y_PT;
    const expandedMaxX = maxX + EXPAND_X_PT;
    const expandedMaxY = maxY + EXPAND_Y_PT;

    // Compute the slide's max Y from all elements to determine the header
    // band threshold.  pptxtojson returns points, so this works regardless
    // of whether the elements are in points or EMU.
    const slideMaxY = elements.reduce((max, el) => {
      const bottom = (el.top || 0) + (el.height || 0);
      return bottom > max ? bottom : max;
    }, 0);
    const headerBandThreshold = slideMaxY * 0.22;

    // Candidate set: connectors + shapes/short text whose center is in the
    // expanded connector bounding box. Long body text, multi-paragraph text,
    // and the slide title stay out of the candidate set.
    const near = [];
    for (const el of elements) {
      const isShapeLike =
        el.type === "connector" ||
        el.hasConnector ||
        el.type === "shape" ||
        el.shapType ||
        el.strokeOnly ||
        // Bordered text boxes are effectively shapes (e.g. flowchart boxes).
        (el.type === "text" && (el.borderWidth || 0) > 0);
      const cx = (el.left || 0) + (el.width || 0) / 2;
      const cy = (el.top || 0) + (el.height || 0) / 2;
      const inBox =
        cx >= expandedMinX && cx <= expandedMaxX && cy >= expandedMinY && cy <= expandedMaxY;

      if (!inBox) continue;

      // Never include photographic / pre-rendered images as diagram candidates.
      // pptxtojson sometimes rasterizes complex shapes (e.g. multi-line code
      // blocks) as `type: "image"`; those must not be swallowed by the diagram.
      if (el.type === "image" && !isShapeLike) continue;

      // Code blocks disguised as bordered shapes (e.g. a roundRect with
      // `print(...)` examples) are not diagram labels; keep them out of the
      // diagram group so they render as slide body text instead of being
      // cropped into the diagram image.
      if (isShapeLike && this.#isCodeBlockLike(el)) continue;

      // Text elements inside the box: only include if they're short (diagram
      // labels are typically a few words) and not in the header band (which
      // is likely the slide title).  Long body text, code blocks, and titles
      // stay outside even if they're within the X range.
      if (el.type === "text" && !isShapeLike) {
        const text = (el.content || "").trim();
        // Only drop long body text / code.  Multi-line diagram labels
        // (e.g. a flowchart box with three lines) are still short, and the
        // textGapPt proximity filter will keep body paragraphs out.
        if (text.length > 80) {
          continue;
        }
        // Drop stray single letters / punctuation (e.g. footer fragments)
        // but keep single-digit numeric labels like "1" or "100".
        if (text.length === 1 && !/\d/.test(text)) {
          continue;
        }
        // Exclude text in the top 22% of the slide (header band) — it's
        // likely the slide title, not a diagram label.
        if (cy < headerBandThreshold) {
          continue;
        }
      }

      near.push(el);
    }

    if (near.length === 0) return elements;

    // Split the candidates into connected components based on edge distance.
    // Each component is a maximal set where every element is within CLUSTER_GAP_PT
    // of at least one other element in the same component.
    const components = [];
    const seen = new Set();
    for (const start of near) {
      if (seen.has(start)) continue;
      const component = [];
      const stack = [start];
      seen.add(start);
      while (stack.length > 0) {
        const cur = stack.pop();
        component.push(cur);
        for (const other of near) {
          if (seen.has(other)) continue;
          if (this.#bboxEdgeDistance(cur, other) < CLUSTER_GAP_PT) {
            seen.add(other);
            stack.push(other);
          }
        }
      }
      components.push(component);
    }

    // For each component, keep plain text only when it is within 15 pt of a
    // non-connector shape-like element (a real box, not an arrow). Bordered
    // text boxes and shapType text are treated as boxes themselves.
    const textGapPt = 15;
    const diagrams = [];
    const consumed = new Set();
    for (const component of components) {
      const boxLike = component.filter(
        (el) =>
          !el.hasConnector &&
          el.type !== "connector" &&
          (el.type === "shape" || el.shapType || (el.type === "text" && (el.borderWidth || 0) > 0)),
      );
      const kept = [];
      for (const el of component) {
        if (el.type === "text" && !el.shapType && (el.borderWidth || 0) === 0) {
          if (boxLike.length === 0) continue;
          const closest = boxLike.reduce((min, box) => {
            const d = this.#bboxEdgeDistance(el, box);
            return d < min ? d : min;
          }, Infinity);
          if (closest > textGapPt) continue;
        }
        kept.push(el);
      }

      if (!this.#isManualDiagram(kept)) continue;

      const order = Math.min(...kept.map((el) => el.order || 0));
      diagrams.push(this.#shapesToDiagram(kept, order));
      for (const el of kept) {
        consumed.add(el);
      }
    }

    if (diagrams.length === 0) return elements;

    const result = elements.filter((el) => !consumed.has(el)).concat(diagrams);
    result.sort((a, b) => (a.order || 0) - (b.order || 0));
    return result;
  }

  /**
   * Minimum gap between the edges of two bounding boxes, in points.
   * Returns 0 for overlapping boxes and a positive value when separated.
   * @static
   * @param {ExtractedElement} a
   * @param {ExtractedElement} b
   * @returns {number}
   */
  static #bboxEdgeDistance(a, b) {
    const aLeft = a.left || 0;
    const aTop = a.top || 0;
    const aRight = aLeft + (a.width || 0);
    const aBottom = aTop + (a.height || 0);
    const bLeft = b.left || 0;
    const bTop = b.top || 0;
    const bRight = bLeft + (b.width || 0);
    const bBottom = bTop + (b.height || 0);
    const dx = Math.max(0, Math.max(aLeft - bRight, bLeft - aRight));
    const dy = Math.max(0, Math.max(aTop - bBottom, bTop - aBottom));
    return Math.hypot(dx, dy);
  }

  /**
   * Heuristic to detect shapes that are really code blocks, not diagram labels.
   * @static
   * @param {ExtractedElement} el
   * @returns {boolean}
   */
  static #isCodeBlockLike(el) {
    if (!el.content) return false;
    const text = el.content;
    // Triple-backtick fenced code blocks.
    if (/```/s.test(text)) return true;
    // Numbered list items that are mostly inline code, e.g.:
    //   1. `print("Hello\\nworld")`
    if (/^\s*\d+\.\s*(?:`[^`]+`|\*[^*]+\*).*/s.test(text)) return true;
    // Fallback: a lot of backticks relative to total length (code snippets).
    const backticks = (text.match(/`/g) || []).length;
    if (backticks >= 4 && backticks / text.length > 0.02) return true;
    return false;
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

    // Rule 2: 2+ filled shapes that overlap or are nested → likely a diagram
    // (e.g. Venn diagrams with nested ovals)
    if (filledShapes.length >= 2) {
      const overlap = filledShapes.some((a, i) =>
        filledShapes.some((b, j) => {
          if (i >= j) return false;
          return this.#bboxEdgeDistance(a, b) === 0;
        }),
      );
      if (overlap) return true;
    }

    // Rule 3: 3+ filled shapes in close proximity → likely a diagram
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
    // Do not dump the diagram's labels into the Markdown body.  The rendered
    // PNG image is the canonical representation; the text is already visible
    // in the image.  Keep a short non-intrusive alt marker for debugging.
    const content = `[Diagram: ${elements.length} shapes]`;

    // Calculate the bounding box from the visible body shapes plus a capped
    // contribution from the connectors.  Connectors can extend far outside the
    // actual diagram (e.g. an arrow coming from a slide title or a long loop
    // arrow), and including their full length swallows unrelated content.  We
    // include each connector's bbox but clamp it to 60pt beyond the body boxes
    // so internal arrowheads/tails are visible without letting external tails
    // blow up the crop.
    const bodyEls = elements.filter((el) => el.type !== "connector" && !el.hasConnector);
    const bbs = bodyEls.length > 0 ? bodyEls : elements;
    const bodyMinX = Math.min(...bbs.map((el) => el.left || 0));
    const bodyMinY = Math.min(...bbs.map((el) => el.top || 0));
    const bodyMaxX = Math.max(...bbs.map((el) => (el.left || 0) + (el.width || 0)));
    const bodyMaxY = Math.max(...bbs.map((el) => (el.top || 0) + (el.height || 0)));
    const CONNECTOR_MARGIN_PT = 60;
    const cMinX = Math.min(...elements.map((el) => el.left || 0));
    const cMinY = Math.min(...elements.map((el) => el.top || 0));
    const cMaxX = Math.max(...elements.map((el) => (el.left || 0) + (el.width || 0)));
    const cMaxY = Math.max(...elements.map((el) => (el.top || 0) + (el.height || 0)));
    const minX = Math.max(cMinX, bodyMinX - CONNECTOR_MARGIN_PT);
    const minY = Math.max(cMinY, bodyMinY - CONNECTOR_MARGIN_PT);
    const maxX = Math.min(cMaxX, bodyMaxX + CONNECTOR_MARGIN_PT);
    const maxY = Math.min(cMaxY, bodyMaxY + CONNECTOR_MARGIN_PT);

    return {
      type: "diagram",
      content,
      placeholderType: null,
      order,
      left: minX,
      top: minY,
      width: maxX - minX,
      height: maxY - minY,
      // Stash the constituent shapes so the shape-renderer post-pass can
      // render the group to a PNG.  Carried alongside the text content so
      // Task C (text fallback) can emit both the image and the text.
      shapes: elements,
    };
  }
}
