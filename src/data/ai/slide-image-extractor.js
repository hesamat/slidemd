/**
 * Slide Image Extractor
 *
 * Extracts content images (not background images) from slide markdown,
 * fetches them, and compresses to <40KB JPEG data URLs for vision-augmented
 * AI calls. Also provides a fast `countContentImages` for the modal's
 * pre-flight token estimate (no fetch needed).
 */

import { splitSlides } from "../markdown-parser.js";
import { parseAllImages } from "../../editor/image/image-markdown-utils.js";
import { DeckImagesResolver } from "../../editor/image/deck-images-resolver.js";
import { estimateTotalImageTokens } from "./ai-vision-message.js";

/**
 * Extract background image URLs from a slide's `background:` directive.
 * Matches `url(...)` inside the background value.
 * @param {string} slideMarkdown
 * @returns {Set<string>} set of URL strings found in background directives
 */
function extractBackgroundUrls(slideMarkdown) {
  const urls = new Set();
  const bgMatch = slideMarkdown.match(/^background:\s*(.+)$/m);
  if (!bgMatch) return urls;
  const bgValue = bgMatch[1];
  // Match url(...) patterns — may be inside linear-gradient() etc.
  const urlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
  let m;
  while ((m = urlRe.exec(bgValue)) !== null) {
    urls.add(m[1]);
  }
  return urls;
}

/**
 * Extract content image srcs from a single slide, excluding background images.
 * @param {string} slideMarkdown
 * @returns {string[]} array of image src strings (in document order)
 */
export function extractSlideImageSrcs(slideMarkdown) {
  const bgUrls = extractBackgroundUrls(slideMarkdown);
  const allImages = parseAllImages(slideMarkdown);
  return allImages.map((img) => img.src).filter((src) => {
    // Drop background images and data: URIs that are SVG placeholders
    if (bgUrls.has(src)) return false;
    if (src.startsWith("data:image/svg+xml")) return false;
    return true;
  });
}

/**
 * Extract content image srcs from each slide in a deck.
 * @param {string} markdown — full deck markdown
 * @returns {Array<string[]>} per-slide array of image src strings
 */
export function extractAllImageSrcs(markdown) {
  const slides = splitSlides(markdown);
  return slides.map(extractSlideImageSrcs);
}

/**
 * Count content images across the deck and estimate vision tokens.
 * Fast — no fetch needed. Used by the modal for the pre-flight cost display.
 * @param {string} markdown
 * @returns {{ count: number, estimatedTokens: number }}
 */
export function countContentImages(markdown) {
  const perSlide = extractAllImageSrcs(markdown);
  const count = perSlide.reduce((sum, srcs) => sum + srcs.length, 0);
  return { count, estimatedTokens: estimateTotalImageTokens(count) };
}

/**
 * Compress an image (given as a fetchable URL or data URI) to a JPEG data URL
 * under `maxBytes` base64 size.
 *
 * Steps:
 * 1. Fetch → Blob → Image (via createObjectURL for blobs, direct for data URIs)
 * 2. Draw to canvas at max `maxWidth` (preserve aspect ratio)
 * 3. toDataURL("image/jpeg", quality) — try 0.85, 0.7, 0.5, 0.3
 * 4. If still > maxBytes, halve width and repeat
 *
 * @param {string} src — image URL or data URI
 * @param {number} [maxBytes=40000] — max base64 size of the output data URL
 * @param {number} [maxWidth=768] — max width in pixels
 * @returns {Promise<string|null>} compressed JPEG data URL, or null on failure
 */
export async function compressImage(src, maxBytes = 40000, maxWidth = 768) {
  try {
    const img = await loadImage(src);
    if (!img || !img.width || !img.height) return null;

    let width = Math.min(img.naturalWidth || img.width, maxWidth);
    let height = Math.round((width / (img.naturalWidth || img.width)) * (img.naturalHeight || img.height));

    const qualities = [0.85, 0.7, 0.5, 0.3];

    // eslint-disable-next-line no-constant-condition
    while (true) {
      for (const quality of qualities) {
        const dataUrl = drawToDataUrl(img, width, height, quality);
        if (dataUrl && dataUrl.length <= maxBytes) return dataUrl;
      }
      // Reduce width and retry
      if (width <= 256) return drawToDataUrl(img, width, height, 0.3); // last resort
      width = Math.round(width / 2);
      height = Math.round((width / (img.naturalWidth || img.width)) * (img.naturalHeight || img.height));
    }
  } catch {
    return null;
  }
}

/**
 * Load an Image from a URL or data URI.
 * @param {string} src
 * @returns {Promise<HTMLImageElement|null>}
 */
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    // For data URIs, set src directly. For other URLs, the browser handles CORS.
    img.src = src;
  });
}

/**
 * Draw an image to a canvas and return a JPEG data URL.
 * @param {HTMLImageElement} img
 * @param {number} width
 * @param {number} height
 * @param {number} quality
 * @returns {string|null}
 */
function drawToDataUrl(img, width, height, quality) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}

/**
 * Extract, fetch, and compress all content images from a deck.
 * Returns per-slide arrays of compressed JPEG data URLs (or null for slides
 * with no images or failed fetches).
 *
 * @param {string} markdown — full deck markdown
 * @returns {Promise<Array<string[]|null>>} per-slide image data URLs
 */
export async function extractAll(markdown) {
  const perSlideSrcs = extractAllImageSrcs(markdown);
  const results = await Promise.all(
    perSlideSrcs.map(async (srcs) => {
      if (!srcs || srcs.length === 0) return null;
      const compressed = await Promise.all(
        srcs.map(async (src) => {
          // Resolve images/ paths to URLs the browser can fetch
          const resolved = await DeckImagesResolver.resolvePreviewSrc(src);
          return compressImage(resolved);
        }),
      );
      const valid = compressed.filter((url) => url !== null);
      return valid.length > 0 ? valid : null;
    }),
  );
  return results;
}
