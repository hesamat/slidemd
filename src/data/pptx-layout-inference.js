/**
 * PPTX Layout Inference
 *
 * Pure functions that determine slide layout based on element positions.
 * Extracted from pptx-to-slide-md.js for clarity and reuse.
 */
import { stripHtml } from "./pptx-html-to-markdown.js";
import { LAYOUT, ELEMENT_TYPES, REGEX, CONFIG } from "./pptx-slide-config.js";

/**
 * Calculate rectangle overlap area.
 * @param {object} a - First rectangle { left, top, width, height }
 * @param {object} b - Second rectangle { left, top, width, height }
 * @returns {number} Overlap area in square points
 */
export function getOverlapArea(a, b) {
  const xOverlap = Math.max(
    0,
    Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left),
  );
  const yOverlap = Math.max(
    0,
    Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top),
  );
  return xOverlap * yOverlap;
}

/**
 * Filter out slide backgrounds, structural borders, tight frames, and template logos/footers.
 * @param {import('./pptx-extractor.js').ExtractedElement[]} elements
 * @param {number} slideWidth
 * @param {number} slideHeight
 * @param {import('./pptx-extractor.js').ExtractedElement[]} dominantImages
 * @returns {import('./pptx-extractor.js').ExtractedElement[]}
 */
export function filterMeaningfulElements(elements, slideWidth, slideHeight, dominantImages = []) {
  const slideArea = slideWidth * slideHeight;
  const bodyThreshold = slideHeight * CONFIG.bodyTopRatio;
  const textElements = elements.filter((el) => el.type === "text" && el.content?.trim());

  return elements.filter((el) => {
    // 1. Always keep text and rich content types
    if (el.type === ELEMENT_TYPES.TEXT) {
      return !!el.content?.trim();
    }
    if ([ELEMENT_TYPES.TABLE, ELEMENT_TYPES.CHART, ELEMENT_TYPES.DIAGRAM].includes(el.type)) {
      return true;
    }

    if (el.type !== ELEMENT_TYPES.IMAGE) {
      return false; // Discard unrecognized shapes that do not hold text
    }

    const w = el.width || 0;
    const h = el.height || 0;
    const area = w * h;

    // RULE 0: Safety First. If there is absolutely no text on this slide, preserve
    // every image (except micro-noise) to prevent creating an empty slide.
    if (textElements.length === 0) {
      return area >= CONFIG.microNoiseThresholdPoints;
    }

    // RULE 1: Never filter out pre-identified dominant content images
    const isDominant = dominantImages.some(
      (dom) => dom.ref === el.ref || (dom.left === el.left && dom.top === el.top),
    );
    if (isDominant) {
      return true;
    }

    // 2. Filter out micro-noise
    if (area < CONFIG.microNoiseThresholdPoints) return false;

    // 3. Filter out massive background/watermark images ONLY if there is other
    // content (body paragraphs) or other images to display on the slide.
    if (area > slideArea * CONFIG.maxMediaAreaRatio) {
      const hasOtherImages = elements.some(
        (other) => el !== other && other.type === ELEMENT_TYPES.IMAGE,
      );
      const hasBodyText = textElements.some((textEl) => textEl.top >= bodyThreshold);

      if (!hasOtherImages && !hasBodyText) {
        return true; // Keep the full-bleed image because it is the sole visual content
      }
      return false; // Strip it because it's a template watermark behind actual content
    }

    // 4. Aspect Ratio Filter (Only catch thin lines, preserving panoramic banners)
    const aspectRatio = w / (h || 1);
    const isThinHorizontalLine =
      aspectRatio > CONFIG.aspectRatioUpperLimit && h < CONFIG.thinLineThresholdPoints;
    const isThinVerticalLine =
      aspectRatio < CONFIG.aspectRatioLowerLimit && w < CONFIG.thinLineThresholdPoints;
    if (isThinHorizontalLine || isThinVerticalLine) return false;

    const isSmallImage = area < slideArea * CONFIG.maxLogoAreaRatio;

    // 5. Margin Filter (Catches template logos, headers, and footers close to top/bottom edges)
    if (isSmallImage) {
      const isInTopMargin = el.top < slideHeight * CONFIG.marginTopRatio;
      const isInBottomMargin = el.top + h > slideHeight * CONFIG.marginBottomRatio;

      // Discard small elements placed inside either the top or bottom margin bounds
      if (isInTopMargin || isInBottomMargin) {
        return false;
      }
      // Small images not in margins are kept — they are likely icons, badges, or
      // inline decorations rather than background/border elements.
      return true;
    }

    // 6. Text-Background / Border Overlap Filter (only for non-small images)
    const isBackgroundOrBorder = textElements.some((textEl) => {
      const textW = textEl.width || 0;
      const textH = textEl.height || 0;
      const textArea = textW * textH;
      if (textArea === 0) return false;

      const overlap = getOverlapArea(el, textEl);
      const coversText = overlap / textArea > CONFIG.overlapRatioThreshold;

      const isCardSize = area / textArea < CONFIG.maxBackgroundCardRatio;
      const isTightBorder = overlap / area > CONFIG.overlapRatioThreshold;

      return (coversText && isCardSize) || isTightBorder;
    });

    return !isBackgroundOrBorder;
  });
}

/**
 * Find dominant content images (large enough to be significant).
 * @param {import('./pptx-extractor.js').ExtractedElement[]} allEls
 * @param {number} slideWidth
 * @param {number} slideHeight
 * @returns {import('./pptx-extractor.js').ExtractedElement[]}
 */
export function findDominantImages(allEls, slideWidth, slideHeight) {
  const slideArea = slideWidth * slideHeight;
  const images = allEls.filter((el) => el.type === ELEMENT_TYPES.IMAGE && el.ref);

  return images.filter((el) => {
    const w = el.width || 0;
    const h = el.height || 0;
    const area = w * h;

    return area >= slideArea * CONFIG.minDominantAreaRatio;
  });
}

/**
 * Infer the layout type from element positions.
 * @param {import('./pptx-extractor.js').ExtractedElement[]} textEls
 * @param {number} slideWidth
 * @param {number} slideHeight
 * @param {boolean} [hasMedia=false]
 * @param {import('./pptx-extractor.js').ExtractedElement[]} [allEls=textEls]
 * @param {import('./pptx-extractor.js').ExtractedElement[]} [dominantImages]
 * @param {number} [slideIndex=0]
 * @returns {{ type: string, spec: string }}
 */
export function inferLayout(
  textEls,
  slideWidth,
  slideHeight,
  hasMedia = false,
  allEls = textEls,
  dominantImages = findDominantImages(allEls, slideWidth, slideHeight),
  slideIndex = 0,
) {
  const contentEls = textEls.filter((el) => el.content?.trim());

  if (contentEls.length === 0) {
    // Image-only slide: determine layout from dominant images
    if (dominantImages.length >= 3) return LAYOUT.MEDIA_SPAN;
    if (dominantImages.length === 2) {
      // Check if images are truly side-by-side (horizontal overlap < 30%)
      const [img1, img2] = dominantImages;
      const horizontalOverlap = Math.max(
        0,
        Math.min(img1.left + img1.width, img2.left + img2.width) - Math.max(img1.left, img2.left),
      );
      if (horizontalOverlap < Math.min(img1.width, img2.width) * 0.5) {
        return LAYOUT.TWO_COLUMN;
      }
      return LAYOUT.HEADER_CONTENT;
    }
    return LAYOUT.HEADER_CONTENT;
  }

  const bodyThreshold = slideHeight * CONFIG.bodyTopRatio;
  const isHeadingMarker = (el) => REGEX.HEADING_MARKER.test(el.content?.trim() || "");

  const isHeader = (el) => {
    if (el.top >= bodyThreshold) return false;

    const isMassive = (el.height || 0) > slideHeight * CONFIG.maxHeaderHeightRatio;
    if (isMassive) {
      if (contentEls.length === 1 && allEls.length === 1 && isHeadingMarker(el)) {
        return true;
      }
      return false;
    }

    if (isHeadingMarker(el)) return true;

    // Extract plain text from HTML for length/bullet checks — raw HTML is
    // often much longer than the visible text due to inline styles.
    const text = stripHtml(el.content || "");
    const hasBullet = REGEX.BULLET.test(text) || REGEX.NUMBER.test(text);
    return text.length <= CONFIG.maxHeaderLength && !hasBullet;
  };

  const headerEl = contentEls.find(isHeader) || null;
  const hasHeader = !!headerEl;
  const midX = slideWidth / 2;
  const centerTol = slideWidth * CONFIG.centerToleranceRatio;
  const isCentered = (el) => Math.abs(el.left + el.width / 2 - midX) < centerTol;

  if (!hasMedia) {
    const minSpread = slideWidth * CONFIG.minColumnSpreadRatio;

    // Two elements are in a spread row if they are horizontally separated
    // AND have significant vertical overlap (not just close top positions).
    // Skip centered elements — they span both columns and should not trigger two-column.
    const hasSpreadRow = contentEls.some((a) =>
      contentEls.some((b) => {
        if (a === b) return false;
        if (isCentered(a) || isCentered(b)) return false;
        if (Math.abs(a.left - b.left) < minSpread) return false;
        // Check vertical overlap, not just top-position proximity
        const overlapTop = Math.max(a.top, b.top);
        const overlapBottom = Math.min(a.top + (a.height || 0), b.top + (b.height || 0));
        const overlap = overlapBottom - overlapTop;
        const minHeight = Math.min(a.height || 0, b.height || 0);
        return overlap > 0 && minHeight > 0 && overlap / minHeight > CONFIG.spreadOverlapThreshold;
      }),
    );

    if (hasSpreadRow) return LAYOUT.TWO_COLUMN;

    const hasBodyBelowHeader = contentEls.some((el) => el !== headerEl && el.top >= bodyThreshold);
    const totalLength = contentEls.reduce((sum, el) => sum + el.content.trim().length, 0);

    if (totalLength < CONFIG.maxTitleLength && contentEls.length <= CONFIG.maxTitleElements) {
      const titleBodyEls = contentEls.filter((el) => el !== headerEl);
      const hasBodyContent = titleBodyEls.some(
        (el) => REGEX.BULLET.test(el.content || "") || REGEX.NUMBER.test(el.content || ""),
      );
      const headerHi = headerEl?.height || 0;
      const bodyHi = titleBodyEls.length ? Math.max(...titleBodyEls.map((e) => e.height || 0)) : 0;
      const isThinStripHeader =
        headerEl && bodyHi > 0 && headerHi < bodyHi * CONFIG.headerThinRatio;

      if (!headerEl || !isThinStripHeader) {
        // First slide uses title-slide only if it has no body content (title/subtitle only)
        if (slideIndex === 0 && !hasBodyContent) return LAYOUT.TITLE_SLIDE;
        return LAYOUT.FOCUS;
      }
    }

    if (hasHeader && hasBodyBelowHeader) {
      // Use focus for slides where code or single-element content is the center stage
      let codeEl = null;
      const looksLikeCode = contentEls.some((el) => {
        const text = el.content?.trim() || "";
        // Detect fenced code blocks
        if (/```[\s\S]*```/.test(text)) {
          codeEl = el;
          return true;
        }
        const lines = text.split("\n");
        if (lines.length < 2) return false;
        const codeKeywords =
          /^\s*(def\s+\w|function\s+\w|class\s+\w|const\s+\w|let\s+\w|var\s+\w|import\s+[\w{#]|#include|for\s*\(|while\s*\(|if\s*\(|else\s|elif\s|return\s|try\s|catch\s|from\s+\w|async\s|await\s|void\s+\w|null\b|undefined\b|this\.|self\.|console\.|print\(|echo\s|\/\/|<!--|\w+\s*[=:]\s*[({[])/;
        const isCode = lines.some((l) => codeKeywords.test(l));
        if (isCode) codeEl = el;
        return isCode;
      });
      if (looksLikeCode) {
        // If the code element spans most of the slide width, it's likely merged
        // from two columns — use two-column layout so content can be distributed
        const codeWidth = codeEl?.width || 0;
        if (codeWidth > slideWidth * 0.8) return LAYOUT.TWO_COLUMN;
        return LAYOUT.FOCUS;
      }
      return LAYOUT.HEADER_CONTENT;
    }
    if (totalLength < CONFIG.maxTitleLength) {
      if (slideIndex === 0) {
        const hasBodyContent = contentEls.some(
          (el) => REGEX.BULLET.test(el.content || "") || REGEX.NUMBER.test(el.content || ""),
        );
        if (!hasBodyContent) return LAYOUT.TITLE_SLIDE;
      }
      return LAYOUT.FOCUS;
    }
  }

  // Partition elements into left vs right columns.
  // If the element's center is clearly on one side, use it directly.
  // If the center is near the midpoint (ambiguous), use the left edge — wide
  // text boxes in two-column PPTX slides commonly start on the left but extend
  // past center.
  // Use area-overlap analysis instead of center-point to handle wide elements
  // that straddle the midpoint.
  const partition = (el) => {
    if (el === headerEl || isCentered(el)) return null;
    const overlapLeft = getOverlapArea(el, {
      left: 0,
      top: 0,
      width: midX,
      height: slideHeight,
    });
    const overlapRight = getOverlapArea(el, {
      left: midX,
      top: 0,
      width: midX,
      height: slideHeight,
    });
    if (overlapLeft > overlapRight * 1.5) return "left";
    if (overlapRight > overlapLeft * 1.5) return "right";
    return null; // truly ambiguous — don't force
  };
  const leftEls = allEls.filter((el) => partition(el) === "left");
  const rightEls = allEls.filter((el) => partition(el) === "right");

  const hasTwoColumns = leftEls.length > 0 && rightEls.length > 0;
  const hasTextColumns =
    leftEls.some((el) => el.type === ELEMENT_TYPES.TEXT) ||
    rightEls.some((el) => el.type === ELEMENT_TYPES.TEXT);

  if (hasHeader && hasTwoColumns && hasTextColumns) {
    // When the right column has only images (no text), media-span is a
    // better fit — but only if there's actual body text beyond the header.
    const rightHasText = rightEls.some((el) => el.type === ELEMENT_TYPES.TEXT);
    const hasBodyText = leftEls.some(
      (el) =>
        el !== headerEl &&
        el.type !== ELEMENT_TYPES.IMAGE &&
        ((el.type === ELEMENT_TYPES.TEXT && el.content?.trim()) ||
          el.type === ELEMENT_TYPES.TABLE ||
          el.type === ELEMENT_TYPES.CHART ||
          el.type === ELEMENT_TYPES.DIAGRAM),
    );
    if (!rightHasText && hasBodyText) return LAYOUT.MEDIA_SPAN;
    return LAYOUT.TWO_COLUMN;
  }

  if (!hasHeader && dominantImages.length >= 2 && contentEls.length > 0) {
    // Validate images are truly side-by-side (horizontal overlap < 30%)
    const [img1, img2] = dominantImages;
    const horizontalOverlap = Math.max(
      0,
      Math.min(img1.left + img1.width, img2.left + img2.width) - Math.max(img1.left, img2.left),
    );
    if (horizontalOverlap < Math.min(img1.width, img2.width) * 0.3) {
      return LAYOUT.MEDIA_SPAN;
    }
    return LAYOUT.TWO_COLUMN;
  }

  const bodyEls = contentEls.filter((el) => el !== headerEl);
  const bodyLength = bodyEls.reduce((sum, el) => sum + el.content.trim().length, 0);

  const bodyRichEls = allEls.filter(
    (el) =>
      el !== headerEl &&
      el !== dominantImages[0] &&
      [ELEMENT_TYPES.TABLE, ELEMENT_TYPES.CHART, ELEMENT_TYPES.DIAGRAM].includes(el.type),
  );

  // Check if there are images in the body (not the dominant one)
  const bodyImages = allEls.filter(
    (el) => el !== headerEl && el !== dominantImages[0] && el.type === ELEMENT_TYPES.IMAGE,
  );

  const hasSubstantialBody =
    bodyRichEls.length > 0 ||
    bodyLength > CONFIG.minSubstantialBodyLength ||
    bodyImages.length > 0;

  if (dominantImages.length === 1 && hasSubstantialBody) return LAYOUT.TWO_COLUMN;
  if (hasHeader) return LAYOUT.HEADER_CONTENT;

  const hasTallColumn = bodyEls.some(
    (e) => (e.height || 0) > slideHeight * CONFIG.tallColumnHeightRatio,
  );
  if (
    hasTwoColumns &&
    (hasTallColumn || (bodyEls.length >= 2 && bodyLength > CONFIG.minSubstantialBodyLength))
  ) {
    return LAYOUT.TWO_COLUMN;
  }

  return LAYOUT.HEADER_CONTENT;
}
