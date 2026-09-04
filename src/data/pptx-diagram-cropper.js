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

/** Depth limit for the group-aware element match: 1 = slide children, 2 =
 * shapes inside one group, 3 = nested groups.  Bounds the walk so a deep
 * non-diagram DOM subtree cannot blow up matching time. */
const MAX_MATCH_DEPTH = 4;

/** How long to wait for html-to-image rasterization before falling back to SVG. */
const RASTER_TIMEOUT_MS = 3_000;

/** A pixel counts as opaque content when its alpha is above this value. */
const MIN_OPAQUE_ALPHA = 32;

/** Minimum fraction of opaque pixels a crop must contain to be considered a
 * real diagram render.  Below this the crop is blank (e.g. shapes rendered
 * off-layout so the position matcher hid everything) and the caller falls
 * back to the SVG renderer instead of emitting an empty image. */
const MIN_OPAQUE_RATIO = 0.002;

/**
 * Mapping of common Microsoft / proprietary PPTX fonts to metrically-compatible
 * Google Fonts.  When the original font is not installed on the user's system,
 * the browser falls back to a generic sans-serif with different metrics,
 * causing text overflow.  After rendering, we walk the DOM and replace any
 * occurrence of the Microsoft font name with the Google Font equivalent.
 */
const FONT_REPLACEMENTS = {
  "tw cen mt": "League Spartan",
  "tw cen mt condensed": "League Spartan",
  "century gothic": "League Spartan",
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
  "family=League+Spartan:wght@400;500;600;700&" +
  "family=Open+Sans:ital,wght@0,300;0,400;0,600;0,700;1,400&" +
  "family=Verdana:wght@400;700&display=swap";

/** Track whether the Google Fonts <link> has been injected. */
let fontsLinkInjected = false;
/** Cached font-loading promise so we only wait once even if multiple diagrams
 * are rendered.  Without this, each diagram re-awaits the font-load timeout
 * when the CDN is slow or unreachable. */
let fontsLoadedPromise = null;

/**
 * Inject a `<link>` tag to load all replacement Google Fonts and wait for
 * them to be available in the browser's font cache.
 *
 * NOTE (offline-first deviation): this is the one runtime network dependency
 * in the PPTX import path.  It exists so shape text is measured with the
 * metric-compatible replacement fonts rather than a generic fallback.  It is
 * deliberately non-fatal: the load is skipped entirely when the browser
 * reports offline or when every replacement font is already installed locally
 * (e.g. LibreOffice ships Carlito/Caladea), and a short timeout prevents a
 * slow/unreachable CDN from stalling the import.  Text may overflow when the
 * fonts are unavailable, but the import always completes.
 *
 * @returns {Promise<void>}
 */
function withTimeout(promise, ms, makeError) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(makeError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function loadReplacementFonts() {
  if (typeof document === "undefined") return;

  // Fast path: every replacement font is already available locally (installed
  // or previously loaded) — no network needed, no waiting.
  if (document.fonts && document.fonts.check) {
    const allLocal = Object.values(FONT_REPLACEMENTS).every((font) =>
      document.fonts.check(`16px "${font}"`),
    );
    if (allLocal) return;
  }

  // Skip entirely when offline — the CDN is unreachable and waiting would
  // block the import with no benefit.  The browser's default sans-serif
  // fallback will be used; text may overflow but the import completes.
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  // Return the cached promise so concurrent/per-diagram calls share a single
  // wait instead of each starting a new timeout race.
  if (fontsLoadedPromise) return fontsLoadedPromise;

  if (!fontsLinkInjected) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = GOOGLE_FONTS_URL;
    document.head.appendChild(link);
    fontsLinkInjected = true;
  }

  // Wait for the replacement fonts to load.  We load each one explicitly so
  // the browser fetches the woff2 files before we rasterize.  A short timeout
  // prevents hanging if the CDN is unreachable.
  const FONT_LOAD_TIMEOUT_MS = 2000;
  if (document.fonts && document.fonts.load) {
    const googleFonts = [...new Set(Object.values(FONT_REPLACEMENTS))];
    const weights = [400, 500, 600, 700];
    const loadPromises = googleFonts.flatMap((font) =>
      weights.map((w) => document.fonts.load(`${w} 16px "${font}"`).catch(() => {})),
    );
    fontsLoadedPromise = Promise.race([
      Promise.all(loadPromises),
      new Promise((resolve) => setTimeout(resolve, FONT_LOAD_TIMEOUT_MS)),
    ]);
  } else {
    fontsLoadedPromise = Promise.resolve();
  }
  return fontsLoadedPromise;
}

/** Pre-compiled regexes for each Microsoft font name (avoids recompiling
 * inside the DOM walk loop).  Sorted longest-first so multi-word names
 * (e.g. "Calibri Light") are matched before their shorter prefixes
 * ("Calibri") — the shorter regex would otherwise match inside the longer
 * name and produce invalid CSS like `"Carlito" Light"`.  Each name is only
 * matched when preceded/followed by a quote, whitespace, or comma, so it
 * never matches inside an unrelated family name (e.g. "MyCalibri"). */
const FONT_REPLACEMENT_REGEXES = Object.entries(FONT_REPLACEMENTS)
  .sort(([a], [b]) => b.length - a.length)
  .map(([msName, googleName]) => ({
    re: new RegExp(
      `(^|[\\s,"'])${msName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[\\s,"'])`,
      "gi",
    ),
    googleName,
  }));

/**
 * Walk the rendered DOM tree and replace any Microsoft font name in
 * `font-family` CSS properties with the corresponding Google Font.
 *
 * @param {HTMLElement} root - The root element to walk
 */
export function replaceFontsInDOM(root) {
  /** @param {HTMLElement} el */
  function walk(el) {
    const ff = el.style.fontFamily;
    if (ff) {
      let replaced = ff;
      for (const { re, googleName } of FONT_REPLACEMENT_REGEXES) {
        // Use a function replacement to avoid $-substitution in the string
        // (e.g. "$googleName" would be treated literally by .replace()).
        // A quoted match keeps its original quote character: the opening
        // quote is part of the match but the closing quote is not consumed,
        // so only the name is emitted here — emitting another closing quote
        // would double it (`"Carlito""`) and make the setter reject the
        // value.  Unquoted names become double-quoted.
        replaced = replaced.replace(re, (match, prefix) => {
          if (prefix === '"' || prefix === "'") return `${prefix}${googleName}`;
          return `${prefix}"${googleName}"`;
        });
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
 * Read an element's slide-absolute box, accumulated through its ancestors.
 * Returns `measurable: false` when the element's own dimensions are not
 * explicit pixel values (`width: 100%`, `height: auto`, …) — the renderer
 * always sizes real shape containers in px, while inner text wrappers use
 * percentage/auto sizes whose parseFloat() values (100, 0) can accidentally
 * align with a shape's box or edge and must never match.
 *
 * @param {HTMLElement} el
 * @param {number} originX - Accumulated parent offset X in CSS pixels.
 * @param {number} originY - Accumulated parent offset Y in CSS pixels.
 * @returns {{left: number, top: number, width: number, height: number, measurable: boolean}}
 */
function readElementBox(el, originX, originY) {
  const left = originX + (parseFloat(el.style.left) || 0);
  const top = originY + (parseFloat(el.style.top) || 0);
  const wRaw = el.style.width || "";
  const hRaw = el.style.height || "";
  const wNum = parseFloat(wRaw);
  const hNum = parseFloat(hRaw);
  const measurable =
    wRaw !== "" &&
    hRaw !== "" &&
    !wRaw.includes("%") &&
    !hRaw.includes("%") &&
    Number.isFinite(wNum) &&
    Number.isFinite(hNum);
  return {
    left,
    top,
    width: wNum || 0,
    height: hNum || 0,
    measurable,
  };
}

/**
 * Find the rendered element for a diagram shape by its slide-absolute box.
 * The walk accumulates parent offsets so shapes inside a group container
 * (positioned at the group's slide offset, children group-relative) are found
 * the same as top-level shapes.  Descends at most MAX_MATCH_DEPTH levels and
 * never into an element once it matches, so a shape's own internals are not
 * candidates.
 *
 * @param {HTMLElement} root - The rendered slide element.
 * @param {number} x - Target box X in CSS pixels at the render scale.
 * @param {number} y - Target box Y in CSS pixels at the render scale.
 * @param {number} w - Target box width in CSS pixels at the render scale.
 * @param {number} h - Target box height in CSS pixels at the render scale.
 * @returns {HTMLElement|null} The matching element, or null.
 */
export function findRenderedShapeElement(root, x, y, w, h) {
  const walk = (parent, originX, originY, depth) => {
    for (const child of parent.children) {
      const el = /** @type {HTMLElement} */ (child);
      const box = readElementBox(el, originX, originY);
      if (
        box.measurable &&
        Math.abs(box.left - x) <= POSITION_TOLERANCE_PX &&
        Math.abs(box.top - y) <= POSITION_TOLERANCE_PX &&
        Math.abs(box.width - w) <= POSITION_TOLERANCE_PX &&
        Math.abs(box.height - h) <= POSITION_TOLERANCE_PX
      ) {
        return el;
      }
      if (depth < MAX_MATCH_DEPTH) {
        const found = walk(el, box.left, box.top, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(root, 0, 0, 1);
}

/**
 * Shrink text inside ellipse shapes so it fits within the ellipse's curved
 * edges.  The PptxViewer renders text in a rectangular flex container, so a
 * wide line near the top or bottom of the shape extends past the curve.  We
 * measure the rendered text block and reduce font-size proportionally until
 * the widest line fits the ellipse width at the block's vertical extent
 * (w·√(1 − (th/h)²)), keeping the text inside the curve.
 *
 * Both single-line and multi-line (wrapping) text are handled.  The shrink is
 * proportional to the measured overshoot, so a wrapping multi-line block is
 * scaled gently and keeps its line structure — it never collapses to a tiny
 * single line — and text that already fits is left untouched.
 *
 * Only applies to ellipse and roundRect shapes (which have curved edges).
 *
 * @param {HTMLElement} root - The rendered slide element.
 * @param {Array} shapes - The diagram shapes with geometry info.
 * @param {number} scale - The render scale.
 */
export function shrinkTextToFit(root, shapes, scale) {
  if (!shapes || shapes.length === 0) return;

  // Smallest font (pt) we allow while shrinking — below this the text becomes
  // illegible and further shrinking provides little visual benefit.
  const MIN_FONT_PT = 7;

  for (const s of shapes) {
    // Only shrink text for curved shapes (ellipse, roundRect).
    if (s.shapType !== "ellipse" && s.shapType !== "roundRect") continue;

    const shapeX = (s.left || 0) * PT_TO_PX * scale;
    const shapeY = (s.top || 0) * PT_TO_PX * scale;
    const shapeW = (s.width || 0) * PT_TO_PX * scale;
    const shapeH = (s.height || 0) * PT_TO_PX * scale;

    // Find the text container div inside this shape.
    // The shape's outer div is at (shapeX, shapeY) with size (shapeW, shapeH).
    // Inside it there's an SVG (the ellipse) and a div with the text.
    // Grouped shapes live inside a group container laid out group-relatively,
    // so the search accumulates parent offsets (see the hide-others walk).
    const el = findRenderedShapeElement(root, shapeX, shapeY, shapeW, shapeH);
    if (!el) continue;
    // Find the text content div inside the shape.
    // Structure: <div shape> > <svg> + <div text-container> > <div text-line> > <span>
    // The font-size is on the text-line div (the one with overflow-wrap).
    const textContainer = el.querySelector("[style*='overflow-wrap']");
    if (!textContainer) continue;

    // Nudge the text down slightly inside the shape.  PptxViewer renders
    // text with justify-content: flex-start when the PPTX text anchor is
    // "top", but for ellipse shapes the text looks better with a modest
    // offset from the top (~20% of the way toward center).
    const flexContainer = el.querySelector("[style*='flex-direction']");
    if (flexContainer) {
      const nudge = shapeH * 0.1; // ~20% of top→center distance
      flexContainer.style.paddingTop = `${nudge}px`;
    }

    // Measure the text block.  The widest rendered line comes from the
    // per-line boxes of a Range; the block height from the container rect
    // (the container fills the shape's full width, so its own width is not
    // a useful measure).
    const measureText = () => {
      const range = document.createRange();
      range.selectNodeContents(textContainer);
      const rects = Array.from(range.getClientRects());
      const box = textContainer.getBoundingClientRect();
      if (rects.length === 0) return null;
      return {
        width: Math.max(...rects.map((r) => r.width)),
        height: box.height,
        top: Math.min(...rects.map((r) => r.top)),
        bottom: Math.max(...rects.map((r) => r.bottom)),
      };
    };

    // The ellipse's width at the vertical edge of a centered text block of
    // height `th` is w·√(1 − (th/h)²).  A block that reaches that width is
    // tangent to the curve; wider lines poke out.  Use this as the lenient
    // width target — a wrapping multi-line block keeps its lines inside the
    // curve without being forced to the strict inscribed rectangle (w/√2).
    const fitScale = (m) => {
      const thRatio = Math.min(m.height / shapeH, 0.99);
      const limitW = shapeW * Math.sqrt(Math.max(0, 1 - thRatio * thRatio));
      let s = 1;
      if (m.width > limitW) s = Math.min(s, limitW / m.width);
      if (m.height > shapeH) s = Math.min(s, shapeH / m.height);
      return s;
    };

    // Collect the text spans and their original font sizes so the shrink
    // preserves the relative sizes between runs (e.g. a 32pt lead-in word
    // beside 20pt body text).
    const spans = Array.from(textContainer.querySelectorAll("span"));
    const origSizes = spans.map(
      (sp) => parseFloat((sp.style.fontSize || "").replace("pt", "")) || 12,
    );
    const fontMatch = (textContainer.style.fontSize || "").match(/([\d.]+)pt/);
    const fontSizePt = fontMatch ? parseFloat(fontMatch[1]) : 12;

    // Shrink proportionally until the text fits.  Each iteration scales by
    // the measured overshoot (limitW/width, h/height) rather than a fixed
    // 0.9× step, so a mildly-overflowing block shrinks only slightly and a
    // wrapping multi-line block keeps its line structure — it never collapses
    // to a tiny single line.  Bounded by MIN_FONT_PT and a few iterations.
    const initial = measureText();
    let scaleFactor = 1;
    const steps = [{ scaleFactor: 1, width: initial?.width, height: initial?.height }];
    for (let i = 0; i < 6; i++) {
      const measure = measureText();
      if (!measure) break;
      const s = fitScale(measure);
      if (s >= 0.999) break;
      // Apply the shrink, clamped to the legibility floor (MIN_FONT_PT).
      // If the clamp kicks in the text still gets the floor size so it
      // doesn't stay at an arbitrary pre-clamp size.
      const nextScale = scaleFactor * s;
      const clamped = Math.max(nextScale, MIN_FONT_PT / fontSizePt);
      scaleFactor = clamped;
      textContainer.style.fontSize = `${(fontSizePt * scaleFactor).toFixed(1)}pt`;
      spans.forEach((sp, idx) => {
        sp.style.fontSize = `${(origSizes[idx] * scaleFactor).toFixed(1)}pt`;
      });
      if (clamped > nextScale) break; // Hit the floor — stop shrinking.
      const next = measureText();
      steps.push({
        scaleFactor: +scaleFactor.toFixed(3),
        width: next?.width,
        height: next?.height,
      });
    }
    // Record the before/after fit for diagnostics (crop debugging).
    if (typeof window !== "undefined" && window.__pptxCropCollectDiagnostics) {
      const after = measureText();
      (window.__pptxTextFit = window.__pptxTextFit || []).push({
        shapType: s.shapType,
        left: s.left,
        top: s.top,
        width: s.width,
        height: s.height,
        before: initial,
        after,
        inscribedW: shapeW * 0.707,
        inscribedH: shapeH * 0.707,
        scaleFactor,
        shrunk: scaleFactor < 0.999,
        steps,
      });
    }
  }
}

/**
 * Determine whether a 2D canvas context contains enough opaque content to be
 * considered a real diagram render.  A crop with almost no opaque pixels is
 * blank (e.g. the renderer failed to lay out the shapes, so the position
 * matcher hid everything) and should fall back to the SVG renderer instead of
 * emitting an empty image.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width - Crop width in pixels.
 * @param {number} height - Crop height in pixels.
 * @returns {boolean} True when the crop is blank.
 */
export function cropIsBlank(ctx, width, height) {
  try {
    const { data } = ctx.getImageData(0, 0, width, height);
    let opaquePixels = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > MIN_OPAQUE_ALPHA) opaquePixels += 1;
    }
    const total = width * height;
    return total > 0 && opaquePixels / total < MIN_OPAQUE_RATIO;
  } catch (err) {
    // getImageData can throw on a tainted canvas; treat as non-fatal and keep
    // the rendered crop.
    Logger.warn("Diagram crop blank-check failed:", err);
    return false;
  }
}

/**
 * Parse and build a PPTX presentation once, so it can be shared across all
 * diagram crops in a single import (zip parsing is the dominant cost).
 *
 * @param {ArrayBuffer|Uint8Array} pptxBuffer
 * @returns {Promise<object>} Parsed PPTX presentation (vendor type mapped at boundary).
 */
export async function parsePresentation(pptxBuffer) {
  const parsed = await parseZip(pptxBuffer, RECOMMENDED_ZIP_LIMITS);
  return buildPresentation(parsed);
}

/**
 * Render a single slide, hide non-diagram elements, then crop to the diagram
 * bounding box.  Returns a PNG data URL or null on failure.
 *
 * When a `diagnostics` object is passed, it is populated with intermediate
 * PNGs and metadata for debugging.  Its presence does not change the
 * returned value.
 *
 * A `presentation` returned by `parsePresentation()` may be passed in to avoid
 * re-parsing the PPTX for every diagram; it is built lazily when omitted.
 *
 * @param {ArrayBuffer|Uint8Array} pptxBuffer
 * @param {number} slideIndex
 * @param {{left: number, top: number, width: number, height: number}} bbox - in points
 * @param {import('./pptx-extractor.js').ExtractedElement[]} [shapes]
 * @param {number} [scale=1] - render scale; 1 = 96 DPI
 * @param {Object} [diagnostics] - Optional object to fill with debug data.
 * @param {Object} [presentation] - Optional pre-built presentation to reuse.
 * @returns {Promise<string|null>} PNG data URL or null on failure
 */
export async function cropSlideToDiagram(
  pptxBuffer,
  slideIndex,
  bbox,
  shapes,
  scale = 1,
  diagnostics = null,
  presentation = null,
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

    // Reuse the caller's presentation (built once per import) when available,
    // otherwise parse this buffer.  No store, no cache beyond this module.
    let resolved = presentation;
    if (!resolved) {
      const parsed = await parseZip(pptxBuffer, RECOMMENDED_ZIP_LIMITS);
      resolved = await buildPresentation(parsed);
    }
    // presentation.width/height are already in CSS pixels (EMU → px).
    const widthPx = Math.round(resolved.width);
    const heightPx = Math.round(resolved.height);
    // Rendered pixel dimensions at the requested scale.  The slide element is
    // scaled with `transform: scale(scale)`, so the canvas must match the
    // transformed size for scale != 1 to be coherent.
    const fullW = Math.round(widthPx * scale);
    const fullH = Math.round(heightPx * scale);

    const slide = resolved.slides[slideIndex];
    if (!slide) return null;
    // Hide master-slide shapes (footer, slide number, etc.).
    slide.showMasterSp = false;

    viewer = new PptxViewer(offscreen, { fitMode: "none", zoomPercent: 100 });
    viewer.load(resolved);

    const handle = viewer.renderSlideToContainer(slideIndex, offscreen, scale);
    if (!handle) throw new Error("renderSlideToContainer returned null");
    await handle.ready;

    // Force layout so the browser has calculated all boxes before we read
    // styles or rasterize.
    handle.element.getBoundingClientRect();

    // Clear the slide background that the renderer painted on the container so
    // the cropped diagram has a transparent background and sits on any slide
    // theme.
    handle.element.style.backgroundColor = "transparent";
    handle.element.style.background = "transparent";

    // Capture font info before replacement when running in diagnostic mode.
    /** @type {any} */
    const d = diagnostics;
    const collectDiag =
      !!d || (typeof window !== "undefined" && window.__pptxCropCollectDiagnostics);
    const fontInfoBefore = collectDiag ? collectFontInfo(handle.element) : null;

    // Replace Microsoft font names with Google Font equivalents in the
    // rendered DOM so text metrics match the original PPTX.
    replaceFontsInDOM(handle.element);

    // Force another layout + a frame so the browser recalculates text with the
    // replacement fonts before rasterization.
    handle.element.getBoundingClientRect();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // Collect font info after replacement to verify it worked.
    const fontInfoAfter = collectDiag ? collectFontInfo(handle.element) : null;

    // Shrink text inside ellipse/roundRect shapes so it fits within the
    // inscribed ellipse area rather than the rectangular bounding box.
    // The PptxViewer renders text in a rectangular flex container, so text
    // near the corners extends past the ellipse's curved edges.
    shrinkTextToFit(handle.element, shapes, scale);

    // Force layout after text shrinking.
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
    if (collectDiag) {
      fullBeforeHide = await toCanvas(handle.element, {
        pixelRatio: 1,
        backgroundColor: undefined,
        width: fullW,
        height: fullH,
        skipFonts: true,
      }).then((c) => c.toDataURL("image/png"));
    }

    // Hide every rendered element that does not belong to the diagram.  The
    // walk covers the whole element tree, not just direct children: the
    // renderer positions a shape group (`<p:grpSp>`) as a container at the
    // group's slide offset and lays its children out group-relatively, so
    // matching accumulates parent offsets to recover slide-absolute
    // coordinates.  An element is hidden only when neither it nor any
    // descendant matches — group containers stay visible while non-diagram
    // decorations inside them are pruned, and a matched shape's internals
    // (text runs, fills) are never touched.
    /** @type {Array<any>} */
    const childMatches = [];

    const matchSubtree = (parent, originX, originY, depth) => {
      let anyMatched = false;
      for (const child of parent.children) {
        const el = /** @type {HTMLElement} */ (child);
        const box = readElementBox(el, originX, originY);
        const { left, top, width, height } = box;

        // Only explicit-px elements can match a shape — inner text wrappers
        // sized in %/auto have degenerate parseFloat boxes that would
        // otherwise align with shape edges by accident.
        const matchedShape = box.measurable
          ? shapePositions.find(
              (sp) =>
                Math.abs(left - sp.x) <= POSITION_TOLERANCE_PX &&
                Math.abs(top - sp.y) <= POSITION_TOLERANCE_PX &&
                Math.abs(width - sp.w) <= POSITION_TOLERANCE_PX &&
                Math.abs(height - sp.h) <= POSITION_TOLERANCE_PX,
            )
          : undefined;

        // Some shape borders/edges are not extracted as shapes (e.g. the left
        // border of a flowchart process box).  Keep thin line/edge elements
        // that lie flush against any matched shape — they are part of the
        // diagram.
        //
        // The check is deliberately strict: the element must (a) overlap the
        // shape's projected row or column and (b) be thin and sit flush
        // against a shape edge.  A body-text box that merely shares a top/left
        // coordinate with a shape is NOT kept.
        const isThinEdge = box.measurable && (width <= 3 || height <= 3);
        const EDGE_TOLERANCE_PX = 3 + POSITION_TOLERANCE_PX;
        const isAdjacentToShape = matchedShape
          ? false
          : shapePositions.some((sp) => {
              const spRight = sp.x + sp.w;
              const spBottom = sp.y + sp.h;
              const elRight = left + width;
              const elBottom = top + height;
              const hOverlap = top < spBottom && elBottom > sp.y;
              const vOverlap = left < spRight && elRight > sp.x;
              if (!isThinEdge || (!hOverlap && !vOverlap)) return false;
              return (
                Math.abs(left - sp.x) <= EDGE_TOLERANCE_PX ||
                Math.abs(left - spRight) <= EDGE_TOLERANCE_PX ||
                Math.abs(top - sp.y) <= EDGE_TOLERANCE_PX ||
                Math.abs(top - spBottom) <= EDGE_TOLERANCE_PX
              );
            });

        const matched = !!matchedShape || isAdjacentToShape;

        // A matched element's subtree is the shape's own content — keep all
        // of it and do not descend.  Only unmatched containers can contribute
        // further matches deeper in the tree.
        let subtreeMatched = matched;
        if (!matched && depth < MAX_MATCH_DEPTH) {
          subtreeMatched = matchSubtree(el, left, top, depth + 1) || subtreeMatched;
        }
        anyMatched = anyMatched || subtreeMatched;

        if (collectDiag) {
          childMatches.push({
            tag: el.tagName,
            depth,
            left,
            top,
            width,
            height,
            text: (el.textContent || "").slice(0, 80),
            fontFamily: el.style.fontFamily || getComputedStyle(el).fontFamily || "",
            matched,
            subtreeMatched,
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

        if (!subtreeMatched) {
          el.style.display = "none";
        }
      }
      return anyMatched;
    };
    matchSubtree(handle.element, 0, 0, 1);

    // Capture a full-slide PNG after hiding non-diagram elements (diagnostic).
    /** @type {string|null} */
    let fullAfterHide = null;
    if (collectDiag) {
      fullAfterHide = await toCanvas(handle.element, {
        pixelRatio: 1,
        backgroundColor: undefined,
        width: fullW,
        height: fullH,
        skipFonts: true,
      }).then((c) => c.toDataURL("image/png"));
    }

    // Rasterize the full slide (with non-diagram elements hidden).
    // skipFonts: true prevents html-to-image from trying to embed web fonts
    // (which would fetch and inline @font-face CSS).  The Google Fonts are
    // already loaded in the browser's font cache, so the canvas rendering
    // will use them correctly.  A short timeout prevents Safari from hanging
    // on image-filled diagrams (html-to-image can stall on those); the caller
    // falls back to the SVG renderer if this times out.
    const fullCanvas = await withTimeout(
      toCanvas(handle.element, {
        pixelRatio: 1,
        backgroundColor: undefined,
        width: fullW,
        height: fullH,
        skipFonts: true,
      }),
      RASTER_TIMEOUT_MS,
      () =>
        new Error(
          `html-to-image rasterization timed out after ${RASTER_TIMEOUT_MS}ms for slide ${slideIndex}`,
        ),
    );

    // Compute the crop rectangle in scaled CSS pixels.
    const padPx = Math.round(CROP_PADDING_PT * PT_TO_PX * scale);
    let cropX = Math.round(bbox.left * PT_TO_PX * scale) - padPx;
    let cropY = Math.round(bbox.top * PT_TO_PX * scale) - padPx;
    let cropW = Math.round(bbox.width * PT_TO_PX * scale) + 2 * padPx;
    let cropH = Math.round(bbox.height * PT_TO_PX * scale) + 2 * padPx;
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

    // Guard against blank crops.  If nothing meaningful was rendered into the
    // diagram region (e.g. the slide's group structure placed its shapes at
    // offsets this position matcher cannot see, so everything was hidden), a
    // transparent PNG is worse than the SVG fallback — signal failure instead.
    if (cropIsBlank(ctx, cropW, cropH)) {
      Logger.warn("Diagram crop is blank — falling back to SVG renderer");
      return null;
    }

    const dataUrl = crop.toDataURL("image/png");

    // Populate diagnostics (dedicated object and/or window-level collector).
    const diagTarget = collectDiag ? d || {} : null;
    if (diagTarget) {
      diagTarget.fullBeforeHide = fullBeforeHide;
      diagTarget.fullAfterHide = fullAfterHide;
      diagTarget.finalCrop = dataUrl;
      diagTarget.cropRect = { x: cropX, y: cropY, w: cropW, h: cropH };
      diagTarget.shapePositions = shapePositions.map((sp) => ({
        x: sp.x,
        y: sp.y,
        w: sp.w,
        h: sp.h,
      }));
      diagTarget.shapes = (shapes || []).map((s) => ({
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
      diagTarget.childMatches = childMatches;
      diagTarget.fontInfo = fontInfoBefore || [];
      diagTarget.fontInfoAfter = fontInfoAfter || [];
      diagTarget.presentationSize = { width: widthPx, height: heightPx };
    }

    if (
      typeof window !== "undefined" &&
      window.__pptxCropCollectDiagnostics &&
      diagTarget &&
      diagTarget !== d
    ) {
      if (!window.__pptxCropDiagnostics) window.__pptxCropDiagnostics = [];
      window.__pptxCropDiagnostics.push(diagTarget);
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
