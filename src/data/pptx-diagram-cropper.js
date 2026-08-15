/**
 * PPTX Diagram Cropper
 *
 * Renders a full PPTX slide using @aiden0z/pptx-renderer, then builds the
 * diagram PNG by copying only the bounding boxes of the diagram's `shapes`
 * from the rendered slide canvas.  This means the final image contains only
 * the diagram's own shapes/connectors/labels; everything else on the slide
 * (footer, page number, body text, other shapes) is left white.
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

/** Padding around the output bounding box (in points). */
const CROP_PADDING_PT = 6;

/** Extra margin around each shape's box when copying from the slide.  Captures
 * connector arrowheads, thick borders, and text that slightly overhangs. */
const SHAPE_MARGIN_PT = 4;

/**
 * Render a single slide, then paint only the rectangular regions belonging to
 * `shapes` onto a new canvas.  Returns a PNG data URL or null on failure.
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
    const parsed = await parseZip(pptxBuffer, RECOMMENDED_ZIP_LIMITS);
    const presentation = await buildPresentation(parsed);
    // presentation.width/height are already in CSS pixels (EMU → px).
    const widthPx = Math.round(presentation.width);
    const heightPx = Math.round(presentation.height);

    // Render master-slide shapes (footer, slide number, etc.) too; they will
    // simply not be copied because they are not in the `shapes` list.
    const slide = presentation.slides[slideIndex];
    if (slide) slide.showMasterSp = false;

    // Compute the output canvas rectangle in unscaled CSS pixels.
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

    viewer = new PptxViewer(offscreen, { fitMode: "none", zoomPercent: 100 });
    viewer.load(presentation);

    const handle = viewer.renderSlideToContainer(slideIndex, offscreen, scale);
    if (!handle) throw new Error("renderSlideToContainer returned null");
    await handle.ready;

    // Rasterize the full slide.
    const fullCanvas = await toCanvas(handle.element, {
      pixelRatio: 1,
      backgroundColor: "#FFFFFF",
      width: widthPx,
      height: heightPx,
      skipFonts: true,
    });

    // Start with a white canvas sized to the output rectangle.
    const crop = document.createElement("canvas");
    crop.width = cropW;
    crop.height = cropH;
    const ctx = crop.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, cropW, cropH);

    // Copy each shape's rectangular region (plus a small margin for
    // arrowheads/borders) from the full slide onto the crop.  Only pixels
    // inside the diagram's shapes survive; everything else is the white fill.
    const marginPx = Math.round(SHAPE_MARGIN_PT * PT_TO_PX * scale);
    for (const s of shapes || []) {
      const rawSw = Math.round((s.width || 0) * PT_TO_PX * scale);
      const rawSh = Math.round((s.height || 0) * PT_TO_PX * scale);
      // Give zero-width or zero-height connectors a minimal thickness so the
      // mask actually captures thin lines and arrowheads.
      const sw = Math.max(rawSw, 2) + 2 * marginPx;
      const sh = Math.max(rawSh, 2) + 2 * marginPx;
      if (sw <= 0 || sh <= 0) continue;
      const sx = Math.round((s.left || 0) * PT_TO_PX * scale) - (sw - rawSw) / 2;
      const sy = Math.round((s.top || 0) * PT_TO_PX * scale) - (sh - rawSh) / 2;
      const dx = sx - cropX;
      const dy = sy - cropY;
      ctx.drawImage(fullCanvas, sx, sy, sw, sh, dx, dy, sw, sh);
    }

    return crop.toDataURL("image/png");
  } catch (err) {
    Logger.warn("Diagram crop failed:", err);
    return null;
  } finally {
    if (viewer && typeof viewer.destroy === "function") viewer.destroy();
    if (offscreen.parentNode) offscreen.parentNode.removeChild(offscreen);
  }
}
