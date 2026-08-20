/**
 * PPTX Shape & Diagram Renderer
 *
 * Renders shape groups and diagrams (detected by PptxExtractor.#isManualDiagram)
 * to PNG screenshots. Replaces the text-only `[Diagram: ...]` marker with an
 * embedded image so diagrams survive import as visuals rather than flattening
 * to bullet lists.
 *
 * Phase 14.9 (#117). Reuses the Canvas infrastructure in pptx-image-converter.js.
 *
 * Architecture:
 *   - `buildShapeSvg()` is a pure function that turns shape elements into an
 *     SVG string. Unit-tested without a canvas.
 *   - `renderSvgToPng()` draws the SVG to a canvas and returns a PNG data URL.
 *     Returns null when the canvas API is unavailable (jsdom, SSR).
 *   - `renderDiagramsToPng()` is the post-pass called by PptxExtractor after
 *     extraction. It finds `diagram` elements carrying a `shapes` array and
 *     renders each. It first tries the high-fidelity slide-crop path
 *     (`cropSlideToDiagram`), then falls back to this module's SVG builder.
 *     On success the diagram element is replaced by an `image` element whose
 *     `caption` (the diagram's shape labels) becomes the image alt text, so
 *     the labels remain searchable/accessible without dumping them into the
 *     slide body.
 */
import { Logger } from "../core/logger.js";
import { trimTransparentMargins } from "./pptx-image-converter.js";
import { sanitizeCssColor } from "./pptx-color-utils.js";
import { cropSlideToDiagram, parsePresentation } from "./pptx-diagram-cropper.js";

/** Detect WebKit-based Safari (macOS / iOS).  Excludes Chrome/Edge on those platforms. */
const isSafari =
  typeof navigator !== "undefined" && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

/** Points-to-pixels scale (72 points = 96 pixels at 96 DPI). */
const PT_TO_PX = 96 / 72;

/** Minimum dimension (points) for a rendered diagram image — avoids 1×1 noise. */
const MIN_RENDER_SIZE_PT = 5;

/** Escape a value for safe interpolation into an XML/SVG attribute. */
function escAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build an SVG string from a group of shape elements.
 *
 * Each element is mapped to an SVG element:
 *   - `path` data present  → `<path d="...">` scaled from pathViewBox
 *   - preset `shapType`    → primitive (`rect`, `ellipse`, etc.) from bbox
 *   - connector            → `<line>` or `<path>` for arrow connectors
 *
 * @param {import('./pptx-extractor.js').ExtractedElement[]} shapes
 * @param {{left: number, top: number, width: number, height: number}} groupBbox - Bounding box in EMU (absolute slide coords).
 * @returns {string} SVG string, or "" if no renderable shapes.
 */
export function buildShapeSvg(shapes, groupBbox) {
  const renderable = shapes.filter((s) => isRenderable(s));
  if (renderable.length === 0) return "";

  const w = Math.max(groupBbox.width, 1);
  const h = Math.max(groupBbox.height, 1);
  // Shapes carry absolute slide coordinates; offset by the group's origin so
  // the SVG viewBox (0,0 → w,h) contains every shape.
  const originX = groupBbox.left || 0;
  const originY = groupBbox.top || 0;

  const hasConnector = renderable.some((shape) => shape.type === "connector" || shape.hasConnector);
  // Arrowhead marker for connector lines.
  const markerDef = hasConnector
    ? `<defs><marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><polygon points="0,0 6,3 0,6" fill="#333"/></marker></defs>`
    : "";
  const parts = renderable.map((shape) => shapeToSvg(shape, originX, originY));
  // Transparent background so the PNG sits on any slide theme — consistent
  // with the crop path (which clears the slide fill to transparent).
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${markerDef}${parts.join("")}</svg>`;
}

/**
 * Determine if a shape element has enough data to render.
 * @param {import('./pptx-extractor.js').ExtractedElement} shape
 * @returns {boolean}
 */
function isRenderable(shape) {
  if (shape.type === "connector" || shape.hasConnector) return true;
  if (shape.path) return true;
  if (shape.shapType) return true;
  if (shape.fillRaw || shape.fill) return true;
  // Text elements with content are renderable as <text> in the SVG
  if (shape.content && shape.content.trim()) return true;
  return false;
}

/**
 * Render shape text as SVG <text> elements.  Strips HTML, splits on newlines,
 * and centres the text block inside the bounding box.
 * @param {string} content - Raw text content (may contain HTML from pptxtojson).
 * @param {number} left
 * @param {number} top
 * @param {number} width
 * @param {number} height
 * @returns {string} SVG text markup, or "" when empty.
 */
function buildShapeTextSvg(content, left, top, width, height) {
  const textContent = content.replace(/<[^>]+>/g, "").trim();
  const lines = textContent ? textContent.split(/\n+/) : [];
  if (lines.length === 0) return "";
  // Use ~80% of the box height across all lines, but never smaller than 9pt
  // and never larger than 18pt so it stays readable and fits comfortably.
  const fontSize = Math.max(9, Math.min((height / Math.max(lines.length, 1)) * 0.75, 18));
  const lineHeight = fontSize * 1.3;
  const totalTextHeight = lines.length * lineHeight;
  const startY = top + (height - totalTextHeight) / 2 + fontSize * 0.8;
  return lines
    .map((line, i) => {
      const y = startY + i * lineHeight;
      const escaped = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `<text x="${left + width / 2}" y="${y}" font-size="${fontSize}" font-family="sans-serif" text-anchor="middle" fill="#222" dominant-baseline="middle">${escaped}</text>`;
    })
    .join("");
}

/**
 * Convert a single shape element to its SVG representation.
 * @param {import('./pptx-extractor.js').ExtractedElement} shape
 * @param {number} originX - Group origin X (EMU) to subtract from shape coords.
 * @param {number} originY - Group origin Y (EMU) to subtract from shape coords.
 * @returns {string}
 */
function shapeToSvg(shape, originX = 0, originY = 0) {
  const left = (shape.left || 0) - originX;
  const top = (shape.top || 0) - originY;
  const width = Math.max(shape.width || 0, 1);
  const height = Math.max(shape.height || 0, 1);

  const fillAttr = buildFillAttr(
    shape.fillRaw || (shape.fill ? { type: "color", value: shape.fill } : null),
  );
  const strokeAttr = buildStrokeAttr(shape);
  const transform = buildTransform(shape, left, top, width, height);

  // Connectors (arrows, lines) — render as a line along the longer axis.
  // Vertical connectors (height > width) go top→bottom; horizontal go left→right.
  if (shape.type === "connector" || shape.hasConnector) {
    const arrow = shape.tailEnd ? ' marker-end="url(#arrowhead)"' : "";
    if (height >= width) {
      // Vertical connector — draw from top to bottom with arrow at the end.
      const cx = left + width / 2;
      return `<line x1="${cx}" y1="${top}" x2="${cx}" y2="${top + height}"${strokeAttr}${arrow}${transform}/>`;
    }
    // Horizontal connector
    const cy = top + height / 2;
    return `<line x1="${left}" y1="${cy}" x2="${left + width}" y2="${cy}"${strokeAttr}${arrow}${transform}/>`;
  }

  // Custom path geometry — scale from pathViewBox to the shape's coordinates
  if (shape.path) {
    const vb = shape.pathViewBox;
    const d = escAttr(shape.path);
    if (vb && vb.width > 0 && vb.height > 0) {
      const scaleX = width / vb.width;
      const scaleY = height / vb.height;
      const transformStr = `transform="translate(${left},${top}) scale(${scaleX},${scaleY})"`;
      return `<path d="${d}" ${transformStr}${fillAttr}${strokeAttr}/>`;
    }
    // No viewBox — use path as-is (assumes already in slide coordinates)
    return `<path d="${d}"${fillAttr}${strokeAttr}${transform}/>`;
  }

  // Text elements with content but no shape geometry → render as SVG <text>
  if (shape.content && shape.content.trim() && !shape.shapType && !shape.path) {
    return buildShapeTextSvg(shape.content, left, top, width, height);
  }

  // Preset shape types → SVG primitives (with text if present)
  const shapType = (shape.shapType || "").toLowerCase();
  let shapeSvg;
  switch (shapType) {
    case "ellipse":
    case "oval":
      shapeSvg = `<ellipse cx="${left + width / 2}" cy="${top + height / 2}" rx="${width / 2}" ry="${height / 2}"${fillAttr}${strokeAttr}${transform}/>`;
      break;
    case "roundrect":
    case "roundRectangle":
      shapeSvg = `<rect x="${left}" y="${top}" width="${width}" height="${height}" rx="${Math.min(width, height) * 0.1}" ry="${Math.min(width, height) * 0.1}"${fillAttr}${strokeAttr}${transform}/>`;
      break;
    case "triangle":
    case "isocelesTriangle":
      shapeSvg = `<polygon points="${left},${top + height} ${left + width / 2},${top} ${left + width},${top + height}"${fillAttr}${strokeAttr}${transform}/>`;
      break;
    case "rtTriangle":
    case "rightTriangle":
      shapeSvg = `<polygon points="${left},${top} ${left},${top + height} ${left + width},${top + height}"${fillAttr}${strokeAttr}${transform}/>`;
      break;
    case "diamond":
      shapeSvg = `<polygon points="${left + width / 2},${top} ${left + width},${top + height / 2} ${left + width / 2},${top + height} ${left},${top + height / 2}"${fillAttr}${strokeAttr}${transform}/>`;
      break;
    case "chevron":
      shapeSvg = `<polygon points="${left},${top} ${left + width * 0.7},${top} ${left + width},${top + height / 2} ${left + width * 0.7},${top + height} ${left},${top + height} ${left + width * 0.3},${top + height / 2}"${fillAttr}${strokeAttr}${transform}/>`;
      break;
    case "line":
      shapeSvg = `<line x1="${left}" y1="${top + height / 2}" x2="${left + width}" y2="${top + height / 2}"${strokeAttr}${transform}/>`;
      break;
    default:
      // rect or unknown → rectangle (the most common PPTX shape)
      shapeSvg = `<rect x="${left}" y="${top}" width="${width}" height="${height}"${fillAttr}${strokeAttr}${transform}/>`;
  }
  if (shape.content && shape.content.trim()) {
    shapeSvg += buildShapeTextSvg(shape.content, left, top, width, height);
  }
  return shapeSvg;
}

/**
 * Build the SVG `fill` attribute from a pptxtojson Fill object.
 * @param {object | null} fill
 * @returns {string}
 */
function buildFillAttr(fill) {
  if (!fill) return ' fill="none"';
  if (fill.type === "color") {
    const color = sanitizeCssColor(fill.value);
    return color === "transparent" ? ' fill="none"' : ` fill="${color}"`;
  }
  if (fill.type === "gradient" && fill.value?.colors?.length) {
    // Approximate gradient with the first color — full gradient stops would
    // require SVG <defs>/<linearGradient>, which adds complexity for marginal
    // visual gain in a screenshot fallback.
    const first = fill.value.colors[0]?.color;
    const color = sanitizeCssColor(first);
    return color === "transparent" ? ' fill="none"' : ` fill="${color}"`;
  }
  if (fill.type === "pattern") {
    const color = sanitizeCssColor(fill.value?.foregroundColor);
    return color === "transparent" ? ' fill="none"' : ` fill="${color}"`;
  }
  if (fill.type === "image") {
    // Image fills are handled by the caller (the image is already extracted);
    // for the screenshot we use the image as a fill via <image> element.
    return ' fill="none"';
  }
  return ' fill="none"';
}

/**
 * Build the SVG `stroke` attributes from border properties.
 * @param {import('./pptx-extractor.js').ExtractedElement} shape
 * @returns {string}
 */
function buildStrokeAttr(shape) {
  // Connectors are lines — their line color comes from `fill` (pptxtojson
  // stores the line color there) or `fillRaw`.  Non-connectors use the
  // explicit border color, if set.
  const strokeColor =
    shape.type === "connector" || shape.hasConnector
      ? shape.fill || shape.fillRaw?.value || shape.borderColor
      : shape.borderColor;
  if (!strokeColor) return "";
  const color = sanitizeCssColor(strokeColor);
  if (color === "transparent") return "";
  const width = shape.borderWidth || (shape.type === "connector" || shape.hasConnector ? 2 : 1);
  const dasharray =
    shape.borderType === "dashed"
      ? ` stroke-dasharray="${width * 3},${width * 2}"`
      : shape.borderType === "dotted"
        ? ` stroke-dasharray="${width},${width * 2}"`
        : "";
  return ` stroke="${color}" stroke-width="${width}"${dasharray}`;
}

/**
 * Build an SVG transform for rotation and flipping.
 * @param {import('./pptx-extractor.js').ExtractedElement} shape
 * @param {number} left
 * @param {number} top
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
function buildTransform(shape, left, top, width, height) {
  const cx = left + width / 2;
  const cy = top + height / 2;
  const parts = [];
  if (shape.rotate) parts.push(`rotate(${shape.rotate} ${cx} ${cy})`);
  if (shape.isFlipH || shape.isFlipV) {
    const sx = shape.isFlipH ? -1 : 1;
    const sy = shape.isFlipV ? -1 : 1;
    parts.push(`translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})`);
  }
  return parts.length ? ` transform="${parts.join(" ")}"` : "";
}

/**
 * Build + render a single diagram element via the hand-coded SVG path.
 * Kept as a fallback for headless/jsdom environments where the full PPTX
 * slide renderer cannot run.
 * @param {import('./pptx-extractor.js').ExtractedElement} el
 * @returns {Promise<string|null>}
 */
export async function renderDiagramToSvgPng(el) {
  const renderable = (el.shapes || []).filter(isRenderable);
  if (renderable.length === 0) return null;

  const groupBbox = {
    left: el.left || 0,
    top: el.top || 0,
    width: Math.max(el.width || 0, 1),
    height: Math.max(el.height || 0, 1),
  };
  if (groupBbox.width < MIN_RENDER_SIZE_PT && groupBbox.height < MIN_RENDER_SIZE_PT) {
    return null;
  }

  const svg = buildShapeSvg(el.shapes, groupBbox);
  if (!svg) return null;

  const widthPx = Math.max(Math.round(groupBbox.width * PT_TO_PX), 1);
  const heightPx = Math.max(Math.round(groupBbox.height * PT_TO_PX), 1);

  try {
    return await renderSvgToPng(svg, widthPx, heightPx);
  } catch (err) {
    Logger.warn("Shape diagram render failed:", err);
    return null;
  }
}

/**
 * Render an SVG string to a PNG data URL via canvas.
 * Returns null when the canvas API is unavailable (jsdom, SSR, non-browser).
 * @param {string} svg
 * @param {number} widthPx
 * @param {number} heightPx
 * @returns {Promise<string|null>}
 */
export async function renderSvgToPng(svg, widthPx, heightPx) {
  if (typeof document === "undefined" || !document.createElement) return null;

  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Use a Blob URL instead of a data URL — some browsers block SVG data URLs
  // in Image() due to security restrictions.  Blob URLs are same-origin and
  // load reliably.
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(new Error("SVG image load failed: " + String(e)));
      img.src = url;
    });
    ctx.drawImage(img, 0, 0, widthPx, heightPx);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Post-pass: render diagram elements (carrying a `shapes` array) to PNG images.
 *
 * For each diagram element:
 *   1. Try the high-fidelity slide-crop path (`cropSlideToDiagram`).  The
 *      presentation is parsed and built ONCE per import and shared across all
 *      diagrams (zip parsing is the dominant cost).
 *   2. Fall back to the SVG builder (`renderDiagramToSvgPng`) when the crop
 *      path is unavailable or fails (including blank crops).
 *   3. On success: replace the diagram element with an `image` element whose
 *      `caption` carries the diagram labels (used as image alt text).
 *   4. On failure (no canvas, no renderable shapes): leave the diagram element
 *      unchanged so the `[Diagram: ...]` marker is preserved for AI Mermaid conversion.
 *
 * Grouped diagrams (`el.fromGroup`, produced from `<p:grpSp>`) skip the crop
 * path: `@aiden0z/pptx-renderer` lays out group children relative to the group
 * container, so the cropper's absolute-position matcher cannot see them and
 * would produce a blank crop.  The SVG builder handles their (absolute)
 * coordinates correctly.
 *
 * @param {import('./pptx-extractor.js').ExtractedSlide[]} slides
 * @param {import('./pptx-extractor.js').ExtractedImage[]} imagesAccum
 * @param {ArrayBuffer} [pptxBuffer] - Optional original PPTX bytes. When
 *   provided, the high-fidelity slide-crop path is used; otherwise the SVG
 *   builder is used.
 * @returns {Promise<void>}
 */
export async function renderDiagramsToPng(slides, imagesAccum, pptxBuffer) {
  if (typeof document === "undefined" || !document.createElement) return;

  // Parse the presentation once for the whole import instead of once per
  // diagram.  If parsing fails, every diagram falls back to the SVG path.
  let presentationPromise = null;
  let presentationFailed = false;
  const getPresentation = () => {
    if (presentationFailed) return null;
    if (!presentationPromise) {
      presentationPromise = parsePresentation(pptxBuffer).catch((err) => {
        Logger.warn("PPTX presentation parse failed, using SVG fallback for all diagrams:", err);
        presentationPromise = null;
        presentationFailed = true;
        throw err;
      });
    }
    return presentationPromise;
  };

  for (const slide of slides) {
    const newElements = [];
    let diagramCounter = 0;

    for (const el of slide.elements) {
      if (el.type !== "diagram" || !el.shapes || el.shapes.length === 0) {
        newElements.push(el);
        continue;
      }

      let dataUrl = null;
      // Safari's WebKit can hang inside html-to-image when rasterizing slides
      // that contain image-filled shapes, so we skip the high-fidelity crop
      // path there and use the SVG builder instead.
      const canCrop =
        !isSafari && pptxBuffer && !el.fromGroup && el.width != null && el.height != null;
      if (canCrop) {
        try {
          const presentation = await getPresentation();
          if (presentation) {
            dataUrl = await cropSlideToDiagram(
              pptxBuffer,
              slide.index,
              {
                left: el.left || 0,
                top: el.top || 0,
                width: el.width,
                height: el.height,
              },
              el.shapes,
              1,
              null,
              presentation,
            );
          }
        } catch (err) {
          Logger.warn("Diagram crop render failed, falling back to SVG:", err);
        }
      }

      if (!dataUrl) {
        dataUrl = await renderDiagramToSvgPng(el);
      }

      if (!dataUrl) {
        newElements.push(el);
        continue;
      }

      dataUrl = (await trimTransparentMargins(dataUrl)) ?? dataUrl;
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");

      diagramCounter += 1;
      const ref = `diagram-${slide.index}-${diagramCounter}.png`;

      // Register the image so export/save paths can find it.
      imagesAccum.push({
        ref,
        base64,
        mimeType: "image/png",
        slideIndex: slide.index,
      });

      // Replace the diagram element with an image element at the same bbox.
      // Carry the diagram's label text as caption so it becomes the image's
      // alt text (searchable, accessible) rather than a separate text element.
      // The `origin: "diagram"` tag preserves provenance so downstream heuristics
      // (background detection, watermark filter, importImages stripping) treat
      // the image as content, not as a decorative photo.
      const labelText = (el.content || "").trim();
      newElements.push({
        type: "image",
        origin: "diagram",
        base64,
        mimeType: "image/png",
        ref,
        caption: labelText || undefined,
        placeholderType: null,
        order: el.order,
        left: el.left,
        top: el.top,
        width: el.width,
        height: el.height,
      });
    }

    slide.elements = newElements;
  }
}
