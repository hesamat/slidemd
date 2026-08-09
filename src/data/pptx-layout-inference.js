/**
 * PPTX Layout Inference
 *
 * Pure functions that determine slide layout based on element positions.
 * Extracted from pptx-to-slide-md.js for clarity and reuse.
 *
 * Strategy and edge cases → docs/pptx-layout-detection.md
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

  // The header band rule (below) only applies when the slide actually has a
  // heading in the header region — a short, non-list text element near the
  // top. Without one, small images higher up are content, not title icons.
  const hasHeaderLikeText = textElements.some((el) =>
    isHeaderLikeTextElement(el, slideHeight, slideWidth),
  );

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
      // Any small image starting inside the top strip is a template logo.
      const isInTopStrip = el.top < slideHeight * CONFIG.marginTopRatio;
      // Small images fully contained in the wider header band are decorative
      // icons beside titles — but only when a heading is actually present.
      const isInTopBand =
        hasHeaderLikeText && el.top + (h || 0) <= slideHeight * CONFIG.maxHeaderBandRatio;
      const isInBottomMargin = el.top + h > slideHeight * CONFIG.marginBottomRatio;

      // Discard small elements placed inside either the top (header strip or
      // band) or bottom margin bounds — they are decorative icons/logos
      // beside titles, or footer ornaments, rather than content.
      if (isInTopStrip || isInTopBand || isInBottomMargin) {
        return false;
      }
      // Small images not in the bands are kept — they are likely icons, badges,
      // or inline decorations rather than background/border elements.
      return true;
    }

    // 6. Text-Background / Border Overlap Filter (only for non-small images).
    // Dominant content images are never backgrounds — skip this check for them.
    if (isDominant) return true;
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
 * Partition an element into the left or right half of the slide using
 * area-overlap analysis. Elements that straddle the midpoint (no side has
 * 1.5x more overlap than the other) are ambiguous and return null.
 * Used by inferLayout's column partitioning; the two-column renderer keeps
 * its own thresholds on top of this rule.
 * @param {import('./pptx-extractor.js').ExtractedElement} el
 * @param {number} slideWidth
 * @param {number} slideHeight
 * @returns {'left'|'right'|null}
 */
export function partitionByAreaOverlap(el, slideWidth, slideHeight) {
  const midX = slideWidth / 2;
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
}

/**
 * True when a text element looks like a heading: it sits in the header
 * region (top of the slide) and either carries a markdown heading marker or
 * is a wide, short, non-list element (a real title — not a slide number,
 * date placeholder, or decorative label). Shared by filterMeaningfulElements
 * (the header-band icon rule) and inferLayout (header detection) so the two
 * predicates cannot drift apart.
 * @param {import('./pptx-extractor.js').ExtractedElement} el
 * @param {number} slideHeight
 * @param {number} [slideWidth] - Required for the plain-title path; when
 *   omitted, only the heading-marker path applies.
 * @returns {boolean}
 */
export function isHeaderLikeTextElement(el, slideHeight, slideWidth) {
  if (!el || el.top >= slideHeight * CONFIG.bodyTopRatio) return false;
  if (REGEX.HEADING_MARKER.test((el.content || "").trim())) return true;
  if (!slideWidth || el.placeholderType === ELEMENT_TYPES.FOOTER) return false;
  // Extract plain text from HTML for length/bullet checks — raw HTML is
  // often much longer than the visible text due to inline styles.
  const text = stripHtml(el.content || "");
  const hasBullet = REGEX.BULLET.test(text) || REGEX.NUMBER.test(text);
  const isWideEnough = (el.width || 0) >= slideWidth * CONFIG.minTitleWidthRatio;
  return text.length <= CONFIG.maxHeaderLength && !hasBullet && isWideEnough;
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

    // A box taller than the header limit is a body container; it only counts
    // as a header when it is the slide's sole element and carries a marker.
    const isMassive = (el.height || 0) > slideHeight * CONFIG.maxHeaderHeightRatio;
    if (isMassive) {
      if (contentEls.length === 1 && allEls.length === 1 && isHeadingMarker(el)) {
        return true;
      }
      return false;
    }

    return isHeaderLikeTextElement(el, slideHeight, slideWidth);
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
        const codeLineCount = lines.filter((l) => codeKeywords.test(l)).length;
        const isCode = codeLineCount >= 2;
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
    return partitionByAreaOverlap(el, slideWidth, slideHeight);
  };
  const leftEls = allEls.filter((el) => partition(el) === "left");
  const rightEls = allEls.filter((el) => partition(el) === "right");

  const hasTwoColumns = leftEls.length > 0 && rightEls.length > 0;
  const hasTextColumns =
    leftEls.some((el) => el.type === ELEMENT_TYPES.TEXT) ||
    rightEls.some((el) => el.type === ELEMENT_TYPES.TEXT);

  if (hasHeader && hasTwoColumns && hasTextColumns) {
    // MEDIA_SPAN is a better fit when one column holds only images and the
    // other holds text — regardless of which physical side each column is on.
    // The header never lands in either column list, so a text-only column
    // always contains real body content.
    const isTextLike = (el) =>
      (el.type === ELEMENT_TYPES.TEXT && el.content?.trim()) ||
      [ELEMENT_TYPES.TABLE, ELEMENT_TYPES.CHART, ELEMENT_TYPES.DIAGRAM].includes(el.type);
    const leftHasText = leftEls.some(isTextLike);
    const rightHasText = rightEls.some(isTextLike);
    // The media-only column must contain a dominant image: the MEDIA_SPAN
    // render branch fills @media exclusively from dominantImages, so without
    // one the layout would emit an empty @media.
    const mediaOnlySideHasDominant =
      (!leftHasText && leftEls.some((el) => dominantImages.includes(el))) ||
      (!rightHasText && rightEls.some((el) => dominantImages.includes(el)));
    const oneSideIsMediaOnly =
      leftHasText !== rightHasText &&
      leftEls.length > 0 &&
      rightEls.length > 0 &&
      mediaOnlySideHasDominant;
    if (oneSideIsMediaOnly) return LAYOUT.MEDIA_SPAN;
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

  const bodyEls = allEls.filter((el) => el !== headerEl && !dominantImages.includes(el));

  // Check for text/table/chart content in body (not just images)
  const hasTextBody = bodyEls.some(
    (el) =>
      el.type === ELEMENT_TYPES.TEXT ||
      el.type === ELEMENT_TYPES.TABLE ||
      el.type === ELEMENT_TYPES.CHART,
  );

  // Header + dominant image + text body → media-span (image spans right, text on left)
  if (dominantImages.length === 1 && hasTextBody) return LAYOUT.MEDIA_SPAN;
  if (hasHeader) return LAYOUT.HEADER_CONTENT;

  const hasTallColumn = bodyEls.some(
    (e) => (e.height || 0) > slideHeight * CONFIG.tallColumnHeightRatio,
  );
  if (hasTwoColumns && (hasTallColumn || bodyEls.length >= 2)) {
    return LAYOUT.TWO_COLUMN;
  }

  return LAYOUT.HEADER_CONTENT;
}
