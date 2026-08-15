/**
 * PPTX Diagram Cropper
 *
 * Renders a full PPTX slide using @aiden0z/pptx-renderer, then hides all
 * DOM elements that are NOT part of the diagram's `shapes`, clears the slide
 * background, and rasterizes the result.  The rasterized slide is cropped to
 * the diagram's bounding box (plus padding) to produce the final PNG.
 *
 * Unlike a per-shape rectangular mask, this approach captures text that
 * overflows shape boundaries (the renderer uses `overflow: visible` on shape
 * containers).
 *
 * Common Microsoft fonts that are not available on Linux/macOS browsers are
 * replaced in the rendered DOM with metrically-compatible Google Fonts so
 * text metrics match the original PPTX as closely as possible.
 */
import {
  PptxViewer,
  buildPresentation,
  parseZip,
  RECOMMENDED_ZIP_LIMITS,
} from "@aiden0z/pptx-renderer";
import { toCanvas } from "html-to-image";
import { Logger } from "../core/logger.js";

/** Points to CSS pixels (96 DPI).  The extractor stores the diagram bbox in
 * points while the renderer uses CSS pixels for slide geometry. */
const PT_TO_PX = 96 / 72;

/** Padding around the diagram bounding box in the output canvas (in points).
 * Ensures text ascenders, arrowheads, and borders are not clipped. */
const CROP_PADDING_PT = 15;

/** Tolerance (in CSS pixels) when matching a DOM element's position to a
 * diagram shape's position.  Accounts for rounding differences between the
 * extractor's point-based coordinates and the renderer's pixel-based ones. */
const POSITION_TOLERANCE_PX = 3;

/**
 * Mapping of common Microsoft / proprietary PPTX fonts to metrically-compatible
 * Google Fonts.  When the original font is not installed on the user's system,
 * the browser falls back to a generic sans-serif with different metrics,
 * causing text overflow.  After rendering, we walk the DOM and replace any
 * occurrence of the Microsoft font name with the Google Font equivalent.
 */
const FONT_REPLACEMENTS = {
  "tw cen mt": "Jost",
  "tw cen mt condensed": "Jost",
  "century gothic": "Jost",
  calibri: "Carlito",
  "calibri light": "Carlito",
  cambria: "Caladea",
  "cambria math": "Caladea",
  "segoe ui": "Open Sans",
  "segoe ui light": "Open Sans",
  "trebuchet ms": "Verdana",
  tahoma: "Verdana",
  // "Aptos" is the new Microsoft default; Carlito is metric-compatible with
  // Calibri which is close enough.
  aptos: "Carlito",
  "aptos display": "Carlito",
};

/** Google Fonts CSS URL for loading all replacement fonts in one request. */
const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?" +
  "family=Caladea:ital,wght@0,400;0,700;1,400&" +
  "family=Carlito:ital,wght@0,400;0,700;1,400;1,700&" +
  "family=Jost:wght@400;500;600;700&" +
  "family=Open+Sans:ital,wght@0,300;0,400;0,600;0,700;1,400&" +
  "family=Verdana:wght@400;700&display=swap";

/** Track whether the Google Fonts <link> has been injected. */
let fontsLinkInjected = false;

/**
 * Inject a `<link>` tag to load all replacement Google Fonts and wait for
 * them to be available in the browser's font cache.
 *
 * @returns {Promise<void>}
 */
async function loadReplacementFonts() {
  if (!fontsLinkInjected) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = GOOGLE_FONTS_URL;
    document.head.appendChild(link);
    fontsLinkInjected = true;
  }

  // Wait for the replacement fonts to load.  We load each one explicitly so
  // the browser fetches the woff2 files before we rasterize.
  if (document.fonts && document.fonts.load) {
    const googleFonts = [...new Set(Object.values(FONT_REPLACEMENTS))];
    const loadPromises = googleFonts.flatMap((font) => [
      document.fonts.load(`400 16px "${font}"`).catch(() => {}),
      document.fonts.load(`700 16px "${font}"`).catch(() => {}),
    ]);
    await Promise.all(loadPromises);
  }
}

/**
 * Walk the rendered DOM tree and replace any Microsoft font name in
 * `font-family` CSS properties with the corresponding Google Font.
 *
 * @param {HTMLElement} root - The root element to walk
 */
function replaceFontsInDOM(root) {
  /** @param {HTMLElement} el */
  function walk(el) {
    const ff = el.style.fontFamily;
    if (ff) {
      let replaced = ff;
      for (const [msName, googleName] of Object.entries(FONT_REPLACEMENTS)) {
        // Case-insensitive replacement of the quoted or unquoted font name.
        const re = new RegExp(
          `(["']?)${msName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(["']?)`,
          "gi",
        );
        replaced = replaced.replace(re, `"$googleName"`);
      }
      if (replaced !== ff) {
        el.style.fontFamily = replaced;
      }
    }
    for (const child of el.children) {
      walk(/** @type {HTMLElement} */ (child));
    }
  }
  walk(root);
}

/**
 * Recursively collect font-family values and positions from a rendered DOM
 * subtree.  Used only when a diagnostics object is passed.
 *
 * @param {HTMLElement} root
 * @returns {Array<{tag: string, text: string, left: number, top: number, fontFamily: string}>}
 */
function collectFontInfo(root) {
  /** @type {Array<{tag: string, text: string, left: number, top: number, fontFamily: string}>} */
  const out = [];
  /** @param {HTMLElement} el */
  function walk(el) {
    const ff = el.style.fontFamily || "";
    const text = (el.textContent || "").slice(0, 120);
    if (ff || text) {
      out.push({
        tag: el.tagName,
        text,
        left: parseFloat(el.style.left) || 0,
        top: parseFloat(el.style.top) || 0,
        fontFamily: ff,
      });
    }
    for (const child of el.children) {
      walk(/** @type {HTMLElement} */ (child));
    }
  }
  walk(root);
  return out;
}

/**
 * Render a single slide, hide non-diagram elements, then crop to the diagram
 * bounding box.  Returns a PNG data URL or null on failure.
 *
 * When a `diagnostics` object is passed, it is populated with intermediate
 * PNGs and metadata for debugging.  Its presence does not change the
 * returned value.
 *
 * @param {ArrayBuffer|Uint8Array} pptxBuffer
 * @param {number} slideIndex
 * @param {{left: number, top: number, width: number, height: number}} bbox - in points
 * @param {import('./pptx-extractor.js').ExtractedElement[]} [shapes]
 * @param {number} [scale=1] - render scale; 1 = 96 DPI
 * @param {Object} [diagnostics] - Optional object to fill with debug data.
 * @returns {Promise<string|null>} PNG data URL or null on failure
 */
export async function cropSlideToDiagram(
  pptxBuffer,
  slideIndex,
  bbox,
  shapes,
  scale = 1,
  diagnostics = null,
) {
  if (typeof document === "undefined") return null;

  const offscreen = document.createElement("div");
  offscreen.style.position = "fixed";
  offscreen.style.left = "-10000px";
  offscreen.style.top = "-10000px";
  offscreen.style.width = "1px";
  offscreen.style.height = "1px";
  offscreen.style.overflow = "hidden";
  document.body.appendChild(offscreen);

  let viewer = null;
  try {
    // Load replacement Google Fonts before rendering so the renderer's text
    // measurements use the correct fonts.
    await loadReplacementFonts();

    const parsed = await parseZip(pptxBuffer, RECOMMENDED_ZIP_LIMITS);
    const presentation = await buildPresentation(parsed);
    // presentation.width/height are already in CSS pixels (EMU → px).
    const widthPx = Math.round(presentation.width);
    const heightPx = Math.round(presentation.height);

    const slide = presentation.slides[slideIndex];
    if (slide) {
      // Hide master-slide shapes (footer, slide number, etc.).
      slide.showMasterSp = false;
    }

    viewer = new PptxViewer(offscreen, { fitMode: "none", zoomPercent: 100 });
    viewer.load(presentation);

    const handle = viewer.renderSlideToContainer(slideIndex, offscreen, scale);
    if (!handle) throw new Error("renderSlideToContainer returned null");
    await handle.ready;

    // Force layout so the browser has calculated all boxes before we read
    // styles or rasterize.
    handle.element.getBoundingClientRect();

    // Clear the slide background that the renderer painted on the container.
    handle.element.style.backgroundColor = "transparent";
    handle.element.style.background = "transparent";

    // Capture font info before replacement when running in diagnostic mode.
    /** @type {any} */
    const d = diagnostics;
    const fontInfoBefore = d ? collectFontInfo(handle.element) : null;

    // Replace Microsoft font names with Google Font equivalents in the
    // rendered DOM so text metrics match the original PPTX.
    replaceFontsInDOM(handle.element);

    // Force another layout + a frame so the browser recalculates text with the
    // replacement fonts before rasterization.
    handle.element.getBoundingClientRect();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // Build a set of expected positions (in CSS pixels at the render scale)
    // for each diagram shape.  We match DOM elements to shapes by position.
    const shapePositions = (shapes || []).map((s) => ({
      x: (s.left || 0) * PT_TO_PX * scale,
      y: (s.top || 0) * PT_TO_PX * scale,
      w: (s.width || 0) * PT_TO_PX * scale,
      h: (s.height || 0) * PT_TO_PX * scale,
      shape: s,
    }));

    // Capture an initial full-slide PNG before hiding elements (diagnostic).
    /** @type {string|null} */
    let fullBeforeHide = null;
    if (d) {
      fullBeforeHide = await toCanvas(handle.element, {
        pixelRatio: 1,
        backgroundColor: undefined,
        width: widthPx,
        height: heightPx,
        skipFonts: true,
      }).then((c) => c.toDataURL("image/png"));
    }

    // Hide every direct child of the slide element whose position does not
    // match any diagram shape.  This removes body text, titles, and other
    // non-diagram elements while keeping the diagram's own shapes (including
    // overflowing text, since shape containers use `overflow: visible`).
    /** @type {Array<any>} */
    const childMatches = [];
    const children = handle.element.children;
    for (const child of children) {
      const el = /** @type {HTMLElement} */ (child);
      const left = parseFloat(el.style.left) || 0;
      const top = parseFloat(el.style.top) || 0;
      const width = parseFloat(el.style.width) || 0;
      const height = parseFloat(el.style.height) || 0;

      const matchedShape = shapePositions.find(
        (sp) =>
          Math.abs(left - sp.x) <= POSITION_TOLERANCE_PX &&
          Math.abs(top - sp.y) <= POSITION_TOLERANCE_PX &&
          Math.abs(width - sp.w) <= POSITION_TOLERANCE_PX &&
          Math.abs(height - sp.h) <= POSITION_TOLERANCE_PX,
      );

      if (d) {
        childMatches.push({
          tag: el.tagName,
          left,
          top,
          width,
          height,
          text: (el.textContent || "").slice(0, 80),
          fontFamily: el.style.fontFamily || getComputedStyle(el).fontFamily || "",
          matched: !!matchedShape,
          matchedShape: matchedShape
            ? {
                type: matchedShape.shape.type,
                content: matchedShape.shape.content,
                shapType: matchedShape.shape.shapType,
                placeholderType: matchedShape.shape.placeholderType,
                left: matchedShape.shape.left,
                top: matchedShape.shape.top,
                width: matchedShape.shape.width,
                height: matchedShape.shape.height,
                fill: matchedShape.shape.fill,
                borderWidth: matchedShape.shape.borderWidth,
              }
            : null,
        });
      }

      if (!matchedShape) {
        el.style.display = "none";
      }
    }

    // Capture a full-slide PNG after hiding non-diagram elements (diagnostic).
    /** @type {string|null} */
    let fullAfterHide = null;
    if (d) {
      fullAfterHide = await toCanvas(handle.element, {
        pixelRatio: 1,
        backgroundColor: undefined,
        width: widthPx,
        height: heightPx,
        skipFonts: true,
      }).then((c) => c.toDataURL("image/png"));
    }

    // Rasterize the full slide (with non-diagram elements hidden).
    // skipFonts: true prevents html-to-image from trying to embed web fonts
    // (which would fetch and inline @font-face CSS).  The Google Fonts are
    // already loaded in the browser's font cache, so the canvas rendering
    // will use them correctly.
    const fullCanvas = await toCanvas(handle.element, {
      pixelRatio: 1,
      backgroundColor: undefined,
      width: widthPx,
      height: heightPx,
      skipFonts: true,
    });

    // Compute the crop rectangle in scaled CSS pixels.
    const padPx = Math.round(CROP_PADDING_PT * PT_TO_PX * scale);
    let cropX = Math.round(bbox.left * PT_TO_PX * scale) - padPx;
    let cropY = Math.round(bbox.top * PT_TO_PX * scale) - padPx;
    let cropW = Math.round(bbox.width * PT_TO_PX * scale) + 2 * padPx;
    let cropH = Math.round(bbox.height * PT_TO_PX * scale) + 2 * padPx;
    const fullW = Math.round(widthPx * scale);
    const fullH = Math.round(heightPx * scale);
    cropX = Math.max(0, Math.min(cropX, fullW - 1));
    cropY = Math.max(0, Math.min(cropY, fullH - 1));
    cropW = Math.max(1, Math.min(cropW, fullW - cropX));
    cropH = Math.max(1, Math.min(cropH, fullH - cropY));

    // Copy the diagram region onto a transparent output canvas.
    const crop = document.createElement("canvas");
    crop.width = cropW;
    crop.height = cropH;
    const ctx = crop.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(fullCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    const dataUrl = crop.toDataURL("image/png");

    if (d) {
      d.fullBeforeHide = fullBeforeHide;
      d.fullAfterHide = fullAfterHide;
      d.finalCrop = dataUrl;
      d.cropRect = { x: cropX, y: cropY, w: cropW, h: cropH };
      d.shapePositions = shapePositions.map((sp) => ({ x: sp.x, y: sp.y, w: sp.w, h: sp.h }));
      d.shapes = (shapes || []).map((s) => ({
        type: s.type,
        content: s.content,
        shapType: s.shapType,
        placeholderType: s.placeholderType,
        left: s.left,
        top: s.top,
        width: s.width,
        height: s.height,
        fill: s.fill,
        borderWidth: s.borderWidth,
      }));
      d.childMatches = childMatches;
      d.fontInfo = fontInfoBefore || [];
      d.presentationSize = { width: widthPx, height: heightPx };
    }

    if (typeof window !== "undefined" && window.__pptxCropCollectDiagnostics) {
      const diag = d || {};
      diag.fullBeforeHide = fullBeforeHide;
      diag.fullAfterHide = fullAfterHide;
      diag.finalCrop = dataUrl;
      diag.cropRect = { x: cropX, y: cropY, w: cropW, h: cropH };
      diag.shapePositions = shapePositions.map((sp) => ({ x: sp.x, y: sp.y, w: sp.w, h: sp.h }));
      diag.shapes = (shapes || []).map((s) => ({
        type: s.type,
        content: s.content,
        shapType: s.shapType,
        placeholderType: s.placeholderType,
        left: s.left,
        top: s.top,
        width: s.width,
        height: s.height,
        fill: s.fill,
        borderWidth: s.borderWidth,
      }));
      diag.childMatches = childMatches;
      diag.fontInfo = fontInfoBefore || [];
      diag.presentationSize = { width: widthPx, height: heightPx };
      if (!window.__pptxCropDiagnostics) window.__pptxCropDiagnostics = [];
      window.__pptxCropDiagnostics.push(diag);
    }

    return dataUrl;
  } catch (err) {
    Logger.warn("Diagram crop failed:", err);
    return null;
  } finally {
    if (viewer && typeof viewer.destroy === "function") viewer.destroy();
    if (offscreen.parentNode) offscreen.parentNode.removeChild(offscreen);
  }
}
