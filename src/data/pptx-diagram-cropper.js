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
 * aliased to metrically-compatible Google Fonts via injected `@font-face`
 * rules so text metrics match the original PPTX as closely as possible.
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
 * causing text overflow.  We inject `@font-face` rules that alias the original
 * font name to the Google Font's woff2 files so text metrics are preserved.
 *
 * The Google Font CSS API URLs are used to fetch the actual font file URLs.
 */
const FONT_ALIASES = {
  "Tw Cen MT": { googleName: "Jost", weights: [400, 500, 600, 700] },
  "Tw Cen MT Condensed": { googleName: "Jost", weights: [400, 500, 600, 700] },
  "Century Gothic": { googleName: "Jost", weights: [400, 500, 600, 700] },
  Calibri: { googleName: "Carlito", weights: [400, 700] },
  "Calibri Light": { googleName: "Carlito", weights: [300] },
  Cambria: { googleName: "Caladea", weights: [400, 700] },
  "Cambria Math": { googleName: "Caladea", weights: [400] },
  "Segoe UI": { googleName: "Open Sans", weights: [400, 600, 700] },
  "Segoe UI Light": { googleName: "Open Sans", weights: [300] },
  "Trebuchet MS": { googleName: "Verdana", weights: [400, 700] },
  Verdana: { googleName: "Verdana", weights: [400, 700] },
  Tahoma: { googleName: "Verdana", weights: [400, 700] },
};

/** Cache of already-loaded font alias CSS so we don't re-fetch Google Fonts
 * for every diagram on the same slide deck. */
let fontAliasCache = null;

/**
 * Fetch the Google Fonts CSS for a given font, extract the woff2 URLs, and
 * build `@font-face` rules that alias the original Microsoft font name to
 * those files.
 *
 * @returns {Promise<string>} CSS text with @font-face rules
 */
async function getFontAliasCSS() {
  if (fontAliasCache) return fontAliasCache;

  const rules = [];
  for (const [msName, { googleName, weights }] of Object.entries(FONT_ALIASES)) {
    for (const weight of weights) {
      const italic = false;
      const cssUrl = `https://fonts.googleapis.com/css2?family=${googleName}:wght@${weight}&display=swap`;
      try {
        const resp = await fetch(cssUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36" },
        });
        if (!resp.ok) continue;
        const css = await resp.text();
        // Extract the woff2 URL from the @font-face block
        const woff2Match = css.match(/src:\s*url\((https:\/\/[^)]+\.woff2)\)/);
        if (!woff2Match) continue;
        const woff2Url = woff2Match[1];
        rules.push(`@font-face {
  font-family: "${msName}";
  font-weight: ${weight};
  font-style: ${italic ? "italic" : "normal"};
  font-display: block;
  src: url(${woff2Url}) format("woff2");
}`);
      } catch {
        // Skip this font if Google Fonts is unreachable
      }
    }
  }

  fontAliasCache = rules.join("\n");
  return fontAliasCache;
}

/**
 * Inject `@font-face` alias rules into the document head and explicitly load
 * each aliased font so the browser fetches the woff2 files before we
 * rasterize.  Without this, fonts load on-demand (only when text using them
 * is painted), which means the first rasterization would still use the
 * fallback font.
 *
 * @returns {Promise<void>}
 */
async function injectFontAliases() {
  const css = await getFontAliasCSS();
  if (!css) return;

  // Inject into <head> so the rules are available to html-to-image's clone.
  const style = document.createElement("style");
  style.setAttribute("data-pptx-font-aliases", "");
  style.textContent = css;
  document.head.appendChild(style);

  // Explicitly trigger font loading for each alias so the woff2 files are
  // fetched before rasterization.  document.fonts.load() resolves when the
  // font face is loaded (or fails).
  if (document.fonts && document.fonts.load) {
    const loadPromises = Object.keys(FONT_ALIASES).map((msName) => {
      const weights = FONT_ALIASES[msName].weights;
      return Promise.all(
        weights.map((w) =>
          document.fonts.load(`${w} 16px "${msName}"`).catch(() => {
            // Font load failed — continue with fallback
          }),
        ),
      );
    });
    await Promise.all(loadPromises);
  }
}

/**
 * Render a single slide, hide non-diagram elements, then crop to the diagram
 * bounding box.  Returns a PNG data URL or null on failure.
 *
 * @param {ArrayBuffer|Uint8Array} pptxBuffer
 * @param {number} slideIndex
 * @param {{left: number, top: number, width: number, height: number}} bbox - in points
 * @param {import('./pptx-extractor.js').ExtractedElement[]} [shapes]
 * @param {number} [scale=1] - render scale; 1 = 96 DPI
 * @returns {Promise<string|null>} PNG data URL or null on failure
 */
export async function cropSlideToDiagram(pptxBuffer, slideIndex, bbox, shapes, scale = 1) {
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
    // Inject font aliases before rendering so the renderer's text
    // measurements use the correct fonts.
    await injectFontAliases();

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

    // Clear the slide background that the renderer painted on the container.
    handle.element.style.backgroundColor = "transparent";
    handle.element.style.background = "transparent";

    // Build a set of expected positions (in CSS pixels at the render scale)
    // for each diagram shape.  We match DOM elements to shapes by position.
    const shapePositions = (shapes || []).map((s) => ({
      x: (s.left || 0) * PT_TO_PX * scale,
      y: (s.top || 0) * PT_TO_PX * scale,
      w: (s.width || 0) * PT_TO_PX * scale,
      h: (s.height || 0) * PT_TO_PX * scale,
    }));

    // Hide every direct child of the slide element whose position does not
    // match any diagram shape.  This removes body text, titles, and other
    // non-diagram elements while keeping the diagram's own shapes (including
    // overflowing text, since shape containers use `overflow: visible`).
    const children = handle.element.children;
    for (const child of children) {
      const el = /** @type {HTMLElement} */ (child);
      const left = parseFloat(el.style.left) || 0;
      const top = parseFloat(el.style.top) || 0;
      const width = parseFloat(el.style.width) || 0;
      const height = parseFloat(el.style.height) || 0;

      const matches = shapePositions.some(
        (sp) =>
          Math.abs(left - sp.x) <= POSITION_TOLERANCE_PX &&
          Math.abs(top - sp.y) <= POSITION_TOLERANCE_PX &&
          Math.abs(width - sp.w) <= POSITION_TOLERANCE_PX &&
          Math.abs(height - sp.h) <= POSITION_TOLERANCE_PX,
      );

      if (!matches) {
        el.style.display = "none";
      }
    }

    // Rasterize the full slide (with non-diagram elements hidden).
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

    return crop.toDataURL("image/png");
  } catch (err) {
    Logger.warn("Diagram crop failed:", err);
    return null;
  } finally {
    if (viewer && typeof viewer.destroy === "function") viewer.destroy();
    if (offscreen.parentNode) offscreen.parentNode.removeChild(offscreen);
  }
}
