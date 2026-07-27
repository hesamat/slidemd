/**
 * image-position-presets
 *
 * Position/sizing computations for images within a slide area.
 * Each function reads DOM geometry from the img/area elements and
 * calls `applySettings` with the computed values.
 *
 * Imported by ImageInteractionHandler and any other code that needs
 * to programmatically position images (toolbar buttons, keyboard
 * shortcuts, automation, etc.).
 */
import { readImageSettings } from "./image-markdown-utils.js";

/**
 * Read the current stage scale factor from the DOM.
 * The stage uses a CSS transform matrix for letterboxing/pillarboxing;
 * this returns the scale (1.0 = no scaling).
 * @returns {number}
 */
export function getStageScale() {
  const stage = document.querySelector(".stage__inner");
  if (!stage) return 1;
  const transform = getComputedStyle(stage).transform;
  if (!transform || transform === "none") return 1;
  const match = transform.match(/matrix\(([^,]+),/);
  return match ? parseFloat(match[1]) : 1;
}

/**
 * Center the image horizontally within its area. Top stays unchanged.
 * @param {HTMLElement} img
 * @param {number} scale - Stage scale factor (design px → rendered px ratio)
 * @param {(settings: object) => void} applySettings
 */
export function centerOnSlide(img, scale, applySettings) {
  const area = img.closest(".slide__area");
  if (!area) return;

  const cs = getComputedStyle(area);
  const padLeft = parseFloat(cs.paddingLeft) || 0;
  const padRight = parseFloat(cs.paddingRight) || 0;
  const contentWidth = area.clientWidth - padLeft - padRight;
  const imgWidth = img.getBoundingClientRect().width / scale;

  applySettings({
    left: Math.round((contentWidth - imgWidth) / 2),
  });
}

/**
 * Align the image to the left edge of its area content box.
 * @param {HTMLElement} img
 * @param {number} scale - Stage scale factor
 * @param {(settings: object) => void} applySettings
 */
export function alignLeft(img, _scale, applySettings) {
  applySettings({ left: 0 });
}

/**
 * Align the image to the right edge of its area content box.
 * @param {HTMLElement} img
 * @param {number} scale - Stage scale factor
 * @param {(settings: object) => void} applySettings
 */
export function alignRight(img, scale, applySettings) {
  const area = img.closest(".slide__area");
  if (!area) return;

  const cs = getComputedStyle(area);
  const padLeft = parseFloat(cs.paddingLeft) || 0;
  const padRight = parseFloat(cs.paddingRight) || 0;
  const contentWidth = area.clientWidth - padLeft - padRight;
  const imgWidth = img.getBoundingClientRect().width / scale;

  applySettings({
    left: Math.round(contentWidth - imgWidth),
  });
}

/**
 * Fit the selected image within its containing `.slide__area`, using the
 * widest size that still keeps the full image inside the slide bounds.
 * @param {HTMLElement} img
 * @param {number} scale - Stage scale factor
 * @param {(settings: object) => void} applySettings
 */
export function fitToWidth(img, scale, applySettings) {
  const area = img.closest(".slide__area");
  if (!area) return;

  const areaRect = area.getBoundingClientRect();
  const imgRect = img.getBoundingClientRect();

  const cs = getComputedStyle(area);
  const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  const areaWidthDesign = (areaRect.width - padX) / scale;
  const areaHeightDesign = (areaRect.height - padY) / scale;
  const ratio =
    (img.naturalWidth || imgRect.width || 1) / (img.naturalHeight || imgRect.height || 1);
  const width = Math.min(areaWidthDesign, areaHeightDesign * ratio);
  const height = width / ratio;
  const top = (areaHeightDesign - height) / 2;

  applySettings({
    width: Math.round(width),
    height: Math.round(height),
    left: 0,
    top: Math.round(top),
  });
}

/**
 * Rotate the image by `delta` degrees (typically ±90).
 * For 90°/270° increments, swaps width/height so the bounding box stays
 * consistent.  Free rotation just adjusts the transform.
 * @param {HTMLElement} img
 * @param {number} delta - Degrees to rotate (e.g. -90, 90)
 * @param {(settings: object) => void} applySettings
 */
export function rotateBy(img, delta, applySettings) {
  const s = readImageSettings(img);
  const newRot = (((Math.round(s.rotation) + delta) % 360) + 360) % 360;

  const settings = { rotation: newRot };

  if (Math.abs(newRot) % 180 === 90 && s.height) {
    settings.width = s.height;
    settings.height = s.width;
  }

  applySettings(settings);
}
