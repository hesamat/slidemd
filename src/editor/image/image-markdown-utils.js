/**
 * image-markdown-utils
 *
 * Pure and semi-pure functions for parsing and manipulating image tags
 * in slide markdown.  Extracted from ImageInteractionHandler to keep
 * that file focused on DOM interaction.
 */

import { parseAllImages } from "../../data/image-markdown-parser.js";

// Re-export for backward compatibility — editor consumers can continue
// importing parseAllImages from this module.
export { parseAllImages };

// ── Constants ────────────────────────────────────────────────────────────

const AREA_MARKER_RE = /^\s*@([a-zA-Z_][a-zA-Z0-9_-]*)\s*$/;
const ALT_ATTR_RE = /alt=["']([^"']*)["']/i;
const ALT_MD_RE = /!\[([^\]]*)\]/;
const ROTATION_RE = /rotate\(([-\d.]+)deg\)/i;
const SOURCE_LINE_ATTR = "sourceLine";
const MAX_TEXT_MATCH_LEN = 50;
const IMG_WIDTH_DEFAULT_PX = 320;
export const AREA_DEFAULT_W = 1920;
export const AREA_DEFAULT_H = 1080;

const FALLBACK_IMG_NATURAL_W = 320;
const FALLBACK_IMG_NATURAL_H = 240;

/**
 * Whether the image is the view-managed, full-column image in a media-span
 * area. Explicitly positioned images are editor-owned and remain editable.
 *
 * @param {HTMLElement|null} imgElement
 * @returns {boolean}
 */
export function isMediaSpanFillImage(imgElement) {
  if (!imgElement || imgElement.style?.position) return false;
  const area = imgElement.closest?.(".slide__area--media");
  const slide = area?.closest?.(".slide");
  if (!area || !slide?.dataset?.mediaFullBleed) return false;
  if (area.querySelectorAll("img").length !== 1) return false;

  const content = [...area.children].filter(
    (child) => !child.classList.contains("editor-area-label"),
  );
  const onlyImage =
    content[0] === imgElement ||
    (content[0]?.tagName === "P" &&
      content[0].children.length === 1 &&
      content[0].querySelector("img") === imgElement);
  return content.length === 1 && onlyImage;
}

// ── Image parsing ────────────────────────────────────────────────────────

// parseAllImages is now imported from ../../data/image-markdown-parser.js
// and re-exported above. The following functions depend on it.

/**
 * Find all image entries within a specific area of a slide markdown string.
 * Filters parseAllImages results to only include images whose positions
 * fall within the given area's content range.
 *
 * @param {string} markdown - Full slide markdown
 * @param {string} areaName - Area name (e.g. "main", "media")
 * @returns {Array} Filtered image entries with positions relative to the full markdown
 */
export function parseImagesInArea(markdown, areaName) {
  const allImages = parseAllImages(markdown);
  const range = getAreaContentRange(markdown, areaName);
  // If the area range is empty (no @area markers), return all images
  if (range.from === range.to && range.from === (markdown || "").length) {
    return allImages;
  }
  return allImages.filter((entry) => entry.start >= range.from && entry.start < range.to);
}

/**
 * Get the ordinal index of an `<img>` element among all images in its
 * parent area (0-based). Uses the area's data-area-name to scope the count.
 *
 * @param {HTMLElement} imgElement
 * @returns {number} Index, or -1 if not found in an area
 */
export function getImageOrdinalIndexInArea(imgElement) {
  const area = imgElement.closest(".slide__area");
  if (!area) return -1;
  return Array.from(area.querySelectorAll("img")).indexOf(imgElement);
}

/**
 * Get the ordinal index of an `<img>` element among all images in its
 * parent slide (0-based).
 *
 * @param {HTMLElement} imgElement
 * @returns {number} Index, or -1 if not found in a slide
 */
export function getImageOrdinalIndex(imgElement) {
  const slide = imgElement.closest(".slide");
  if (!slide) return -1;
  return Array.from(slide.querySelectorAll("img")).indexOf(imgElement);
}

/**
 * Extract alt text from a parsed image entry.
 *
 * @param {{type: string, fullMatch: string, fullTag: string}} imageEntry
 * @returns {string}
 */
export function extractAltText(imageEntry) {
  if (imageEntry.type === "html") {
    return imageEntry.fullTag.match(ALT_ATTR_RE)?.[1] || "";
  }
  return imageEntry.fullMatch.match(ALT_MD_RE)?.[1] || "";
}

// ── Area range ───────────────────────────────────────────────────────────

/**
 * Return the character range `{from, to}` for the content inside a named
 * `@area` block in the markdown source.
 *
 * @param {string} markdown
 * @param {string} areaName - The area name (e.g. "main", "media")
 * @returns {{from: number, to: number}}
 */
export function getAreaContentRange(markdown, areaName) {
  const normalized = String(markdown || "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const target = String(areaName || "main")
    .trim()
    .toLowerCase();

  let areaMarkerIdx = -1;
  let nextMarkerIdx = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const markerMatch = lines[i].match(AREA_MARKER_RE);
    if (!markerMatch) continue;
    if (markerMatch[1].toLowerCase() === target) {
      areaMarkerIdx = i;
    } else if (areaMarkerIdx >= 0 && i > areaMarkerIdx) {
      nextMarkerIdx = i;
      break;
    }
  }

  if (areaMarkerIdx < 0) {
    return { from: normalized.length, to: normalized.length };
  }

  const lineToCharOffset = (lineIndex) => {
    let pos = 0;
    for (let i = 0; i < lineIndex; i++) {
      pos += lines[i].length + 1; // +1 for newline
    }
    return pos;
  };

  return {
    from: lineToCharOffset(areaMarkerIdx + 1),
    to: lineToCharOffset(nextMarkerIdx),
  };
}

// ── DOM → markdown position ──────────────────────────────────────────────

/**
 * Find the markdown character position of a non-image DOM element.
 * Uses the `data-source-line` attribute when available (set by the
 * markdown parser); falls back to text-content matching.
 *
 * @param {string} markdown
 * @param {HTMLElement} element
 * @returns {number} Character offset in `markdown`, or -1 if not found
 */
export function findMarkdownPositionOfElement(markdown, element) {
  const area = element.closest(".slide__area");
  if (!area) return -1;

  const areaName = area.dataset.areaName || "main";
  const range = getAreaContentRange(markdown, areaName);

  // Prefer data-source-line attribute (set by markdown parser)
  const sourceLine = parseInt(element.dataset?.[SOURCE_LINE_ATTR], 10);
  if (!isNaN(sourceLine)) {
    const lines = markdown.slice(range.from, range.to).split("\n");
    let charOffset = 0;
    for (let i = 0; i < Math.min(sourceLine, lines.length); i++) {
      charOffset += lines[i].length + 1;
    }
    return range.from + charOffset;
  }

  // Fallback: find by text content
  const text = element.textContent?.trim();
  if (!text) return -1;

  const areaContent = markdown.slice(range.from, range.to);
  const lines = areaContent.split("\n");
  let charOffset = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && text.startsWith(trimmed.slice(0, MAX_TEXT_MATCH_LEN))) {
      return range.from + charOffset;
    }
    charOffset += line.length + 1;
  }

  return -1;
}

// ── Style building ───────────────────────────────────────────────────────

/**
 * Read the current style settings of an img element into a structured object.
 *
 * @param {HTMLElement} imgElement
 * @returns {{left: number, top: number, width: number, height: number|null, opacity: number, borderRadius: number, boxShadow: string, rotation: number, zIndex: number, alt: string}}
 */
export function readImageSettings(imgElement) {
  const style = imgElement.style;
  const transform = style.transform || "";
  const rotMatch = transform.match(ROTATION_RE);

  // Parse width: use explicit pixel value, fall back to HTML attribute
  // (PPTX imports set width/height attributes), then rendered dimensions
  // for percentage (e.g. "100%") or non-numeric values.
  let width = parseFloat(style.width);
  if (!Number.isFinite(width) || (style.width && style.width.includes("%"))) {
    const attrWidth = imgElement.getAttribute("width");
    width = attrWidth ? parseFloat(attrWidth) : imgElement.offsetWidth || IMG_WIDTH_DEFAULT_PX;
  }

  // Parse height: use explicit pixel value, fall back to HTML attribute
  // (PPTX imports set width/height attributes), then rendered dimensions
  // for percentage, "auto", or non-numeric values.
  let height = parseFloat(style.height);
  if (!Number.isFinite(height) || (style.height && style.height.includes("%"))) {
    const attrHeight = imgElement.getAttribute("height");
    height = attrHeight ? parseFloat(attrHeight) : imgElement.offsetHeight || null;
  }

  return {
    left: parseFloat(style.left) || 0,
    top: parseFloat(style.top) || 0,
    width,
    height,
    opacity: style.opacity !== "" ? parseFloat(style.opacity) : 1,
    borderRadius: parseFloat(style.borderRadius) || 0,
    boxShadow: style.boxShadow || "none",
    rotation: rotMatch ? parseFloat(rotMatch[1]) : 0,
    zIndex: parseInt(style.zIndex, 10) || 0,
    objectFit: style.objectFit || "contain",
    alt: imgElement.getAttribute("alt") || "",
  };
}

/**
 * Build the inline style string for an image from its current DOM state.
 * Preserves all supported style properties (rotation, opacity, etc.).
 *
 * @param {HTMLElement} imgElement
 * @returns {string}
 */
export function buildInlineStyleString(imgElement) {
  const s = readImageSettings(imgElement);
  const parts = [
    "position: relative",
    `left: ${Math.round(s.left)}px`,
    `top: ${Math.round(s.top)}px`,
    `width: ${Math.round(s.width)}px`,
    s.height ? `height: ${Math.round(s.height)}px` : "",
    s.opacity != null && s.opacity !== 1 ? `opacity: ${s.opacity}` : "",
    s.borderRadius ? `border-radius: ${s.borderRadius}px` : "",
    s.boxShadow && s.boxShadow !== "none" ? `box-shadow: ${s.boxShadow}` : "",
    s.rotation ? `transform: rotate(${Math.round(s.rotation)}deg)` : "",
    s.zIndex ? `z-index: ${Math.round(s.zIndex)}` : "",
    "border: none",
    `object-fit: ${s.objectFit || "contain"}`,
    "cursor: move",
  ];
  return parts.filter(Boolean).join("; ");
}

/**
 * Build supported visual styles without positioning an image. Used for
 * media-span fill images whose geometry is controlled by the layout CSS.
 * @param {HTMLElement} imgElement
 * @returns {string}
 */
export function buildMediaSpanStyleString(imgElement) {
  const s = readImageSettings(imgElement);
  return [
    s.opacity != null && s.opacity !== 1 ? `opacity: ${s.opacity}` : "",
    s.borderRadius ? `border-radius: ${s.borderRadius}px` : "",
    s.boxShadow && s.boxShadow !== "none" ? `box-shadow: ${s.boxShadow}` : "",
    s.rotation ? `transform: rotate(${Math.round(s.rotation)}deg)` : "",
    s.zIndex ? `z-index: ${Math.round(s.zIndex)}` : "",
    "border: none",
    `object-fit: ${s.objectFit || "contain"}`,
    "cursor: move",
  ]
    .filter(Boolean)
    .join("; ");
}

/**
 * Build an `<img>` tag string for repositioning an image.
 * Preserves all style properties from the current image (rotation,
 * opacity, border-radius, etc.) but resets left/top to 0 so the
 * image snaps to its flow position.
 *
 * @param {HTMLElement} imgElement - Current image (used to read existing styles)
 * @param {string} src
 * @param {string} alt
 * @param {number} width - Width in design pixels
 * @param {number|null} height - Height in design pixels, or null
 * @param {number} [left=0] - Left offset in design pixels
 * @param {number} [top=0] - Top offset in design pixels
 * @returns {string} The complete `<img ... />` tag
 */
export function buildRepositionedImgTag(imgElement, src, alt, width, height, left = 0, top = 0) {
  const s = readImageSettings(imgElement);
  const parts = [
    "position: relative",
    `left: ${Math.round(left)}px`,
    `top: ${Math.round(top)}px`,
    `width: ${width}px`,
    height ? `height: ${height}px` : "",
    s.opacity != null && s.opacity !== 1 ? `opacity: ${s.opacity}` : "",
    s.borderRadius ? `border-radius: ${s.borderRadius}px` : "",
    s.boxShadow && s.boxShadow !== "none" ? `box-shadow: ${s.boxShadow}` : "",
    s.rotation ? `transform: rotate(${Math.round(s.rotation)}deg)` : "",
    s.zIndex ? `z-index: ${Math.round(s.zIndex)}` : "",
    "border: none",
    `object-fit: ${s.objectFit || "contain"}`,
    "cursor: move",
  ];
  return `<img src="${src}" alt="${alt}" style="${parts.filter(Boolean).join("; ")}" />`;
}

// ── Image dimensions ─────────────────────────────────────────────────────

/**
 * Compute the natural (unconstrained) dimensions of an image element,
 * preferring explicit width/height attributes (PPTX imports) over
 * naturalWidth/naturalHeight.
 *
 * @param {HTMLElement} imgElement
 * @returns {{naturalWidth: number, naturalHeight: number}}
 */
export function getNaturalDimensions(imgElement) {
  const hasExplicitSize = imgElement.getAttribute("width") && imgElement.getAttribute("height");
  // Explicit attributes (PPTX imports) > naturalWidth/naturalHeight > offsetWidth/Height > fallback
  const w = hasExplicitSize
    ? parseInt(imgElement.getAttribute("width"), 10) ||
      imgElement.naturalWidth ||
      imgElement.offsetWidth ||
      FALLBACK_IMG_NATURAL_W
    : imgElement.naturalWidth || imgElement.offsetWidth || FALLBACK_IMG_NATURAL_W;
  const h = hasExplicitSize
    ? parseInt(imgElement.getAttribute("height"), 10) ||
      imgElement.naturalHeight ||
      imgElement.offsetHeight ||
      FALLBACK_IMG_NATURAL_H
    : imgElement.naturalHeight || imgElement.offsetHeight || FALLBACK_IMG_NATURAL_H;
  return { naturalWidth: w, naturalHeight: h };
}

/**
 * Clamp image dimensions to fit within an area, preserving aspect ratio.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} areaWidth
 * @param {number} areaHeight
 * @returns {{width: number, height: number}}
 */
export function clampToAreaDimensions(width, height, areaWidth, areaHeight) {
  let w = width;
  let h = height;
  if (w > areaWidth) {
    w = areaWidth;
    h = Math.round((w * height) / width);
  }
  if (h > areaHeight) {
    h = areaHeight;
    w = Math.round((h * width) / height);
  }
  return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
}
