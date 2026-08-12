/**
 * AI Vision Message Builder
 *
 * Builds multi-modal message content arrays for vision-augmented AI calls.
 * The internal representation uses OpenAI's content-block format:
 *
 *   { type: "text", text: "..." }
 *   { type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } }
 *
 * Provider-specific mapping functions convert this to Anthropic and Gemini
 * formats. `stripImages` collapses a content array back to a plain string
 * for the text-only fallback path.
 *
 * Token estimation uses OpenAI's approximate vision formula:
 *   tiles = ceil(width/512) * ceil(height/512)
 *   tokens = tiles * 170 + 85
 */

/**
 * Build a multi-modal user message content array from a text prompt and
 * per-slide image collections.
 *
 * Each image is labeled with a flat 0-based index (Image 0, Image 1, …)
 * so downstream consumers (e.g. the reimagine outline AI's `keepImages`
 * field) can reference images by their position in the flattened list.
 *
 * @param {string} text — the text prompt (deck summary / outline)
 * @param {Array<Array<{src: string, dataUrl: string}>|null>} slideImages —
 *   for each slide, an array of `{ src, dataUrl }` entries (see
 *   `slide-image-extractor.js#extractAll`), or null/empty if the slide has
 *   no images. Images are inserted in order with a "Slide N images:" label
 *   before each slide's image blocks, and each image gets an
 *   "[Image K]" label where K is its 0-based flat index.
 * @returns {Array<{type: string, text?: string, image_url?: {url: string}}>}
 *   OpenAI-format content array.
 */
export function buildVisionMessage(text, slideImages) {
  const content = [{ type: "text", text }];

  let flatIdx = 0;
  for (let i = 0; i < slideImages.length; i++) {
    const images = slideImages[i];
    if (!images || images.length === 0) continue;
    content.push({ type: "text", text: `Slide ${i + 1} images:` });
    for (const entry of images) {
      const dims = entry.width && entry.height ? ` (${entry.width}x${entry.height}px)` : "";
      content.push({ type: "text", text: `[Image ${flatIdx}]${dims}` });
      content.push({ type: "image_url", image_url: { url: entry.dataUrl } });
      flatIdx++;
    }
  }

  return content;
}

/**
 * Build a multi-modal user message content array that appends an "image
 * library" — a flat collection of kept images from the original deck — to
 * the text prompt. Unlike `buildVisionMessage` which labels images per
 * slide, this labels them as a shared library so the AI understands these
 * images are available for insertion on any slide, not tied to a specific
 * source slide.
 *
 * @param {string} text — the text prompt (generate briefs + suffix)
 * @param {Array<{src: string, dataUrl: string}>} images — flat list of kept images
 * @returns {Array<{type: string, text?: string, image_url?: {url: string}}>}
 *   OpenAI-format content array.
 */
export function buildImageLibraryVisionMessage(text, images) {
  const content = [{ type: "text", text }];

  if (!images || images.length === 0) return content;

  // Defensive: callers sometimes nest the flat list in an extra array. The
  // expected shape is Array<{src, dataUrl}>; if we see Array<Array<...>>,
  // flatten once before processing.
  const flatImages =
    Array.isArray(images) && images.length > 0 && Array.isArray(images[0]) ? images.flat() : images;

  if (flatImages.length === 0) return content;

  content.push({
    type: "text",
    text: 'Kept images from the original deck (available for reuse on any slide). Use the exact src path in <img src="..."> when reusing. Dimensions are original pixel sizes — set width in the <img> style to fit the slide layout:',
  });
  for (let i = 0; i < flatImages.length; i++) {
    const dims =
      flatImages[i].width && flatImages[i].height
        ? ` (${flatImages[i].width}x${flatImages[i].height}px)`
        : "";
    content.push({ type: "text", text: `[Image ${i}] src: ${flatImages[i].src}${dims}` });
    content.push({ type: "image_url", image_url: { url: flatImages[i].dataUrl } });
  }

  return content;
}

/**
 * Extract the base64 data and MIME type from a data URI.
 * @param {string} dataUri — e.g. "data:image/jpeg;base64,/9j/4AAQ..."
 * @returns {{mimeType: string, data: string}|null} — null if not a data URI.
 */
export function extractBase64FromDataUri(dataUri) {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

/**
 * Map an OpenAI-format content array to Anthropic's message format.
 * Anthropic uses:
 *   { type: "text", text: "..." }
 *   { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "..." } }
 *
 * @param {Array|string} content — OpenAI content array or plain string
 * @returns {Array} Anthropic-format content blocks
 */
export function mapContentForAnthropic(content) {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  if (!Array.isArray(content)) return [];

  return content
    .map((block) => {
      if (block.type === "text") {
        return { type: "text", text: block.text };
      }
      if (block.type === "image_url") {
        const extracted = extractBase64FromDataUri(block.image_url.url);
        if (!extracted) return null; // skip non-data-URI images
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: extracted.mimeType,
            data: extracted.data,
          },
        };
      }
      return null;
    })
    .filter(Boolean);
}

/**
 * Map an OpenAI-format content array to Gemini's parts format.
 * Gemini uses:
 *   { text: "..." }
 *   { inline_data: { mime_type: "image/jpeg", data: "..." } }
 *
 * @param {Array|string} content — OpenAI content array or plain string
 * @returns {Array} Gemini-format parts
 */
export function mapContentForGemini(content) {
  if (typeof content === "string") {
    return [{ text: content }];
  }
  if (!Array.isArray(content)) return [];

  return content
    .map((block) => {
      if (block.type === "text") {
        return { text: block.text };
      }
      if (block.type === "image_url") {
        const extracted = extractBase64FromDataUri(block.image_url.url);
        if (!extracted) return null;
        return {
          inline_data: {
            mime_type: extracted.mimeType,
            data: extracted.data,
          },
        };
      }
      return null;
    })
    .filter(Boolean);
}

/**
 * Collapse a content array (or pass through a string) to a plain text string.
 * Used for the text-only fallback when a provider rejects images.
 * @param {Array|string} content
 * @returns {string}
 */
export function stripImages(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n");
}

/**
 * Estimate vision tokens for a single image using OpenAI's formula.
 * @param {number} width — image width in pixels
 * @param {number} height — image height in pixels
 * @returns {number} estimated token count
 */
export function estimateImageTokens(width, height) {
  const tiles = Math.ceil(width / 512) * Math.ceil(height / 512);
  return tiles * 170 + 85;
}

/**
 * Estimate total image tokens across all images in a deck.
 * Used by the modal for the pre-flight cost display (no fetch needed).
 *
 * Assumes images are compressed to max 768px width. If the image's aspect
 * ratio is unknown, assumes 4:3 (common for PPTX exports).
 *
 * @param {number} imageCount — number of content images in the deck
 * @param {number} [avgWidth=768] — assumed average width after compression
 * @param {number} [avgHeight] — assumed average height (defaults to 4:3 ratio)
 * @returns {number} estimated total image tokens
 */
export function estimateTotalImageTokens(imageCount, avgWidth = 768, avgHeight) {
  if (imageCount === 0) return 0;
  const h = avgHeight ?? Math.round((avgWidth * 3) / 4);
  return imageCount * estimateImageTokens(avgWidth, h);
}
