/**
 * PptxToSlideMd
 *
 * Rule-based converter: transforms an ExtractionResult (from PptxExtractor)
 * directly into SlideMD markdown. Uses element positions and
 * sizes to infer layouts deterministically.
 *
 * @class
 */
import { buildChartDataRows } from "./pptx-chart-data.js";

// Layout Definitions
const LAYOUT = {
  TITLE_SLIDE: { type: "title-slide", spec: "title-slide" },
  HEADER_CONTENT: { type: "header-content", spec: "header-content" },
  TWO_COLUMN: { type: "two-column", spec: "two-column" },
  THREE_COLUMN: { type: "three-column", spec: "three-column" },
};

// Conversion Ratios & Normalization Thresholds
const CONVERSION = {
  EMU_PER_POINT: 12700,
  EMU_THRESHOLD: 10000, // Value threshold above which numbers are treated as EMUs
  POINTS_TO_PX: 96 / 72, // DPI point-to-pixel scale ratio (72 points = 96 pixels)
  INDENT_DIVISOR: 2,
};

const DEFAULT_SLIDE_SIZE = {
  WIDTH_EMU: 9144000,
  HEIGHT_EMU: 5143500,
};

const DEFAULTS = {
  DECK_NAME: "presentation",
  IMAGE_FILENAME: "image.png",
  IMAGE_MIME_PNG: ".png",
  IMAGE_SUBDIR: "images/",
  NOTES_COMMENT_START: "<!-- notes: ",
  NOTES_COMMENT_END: " -->",
  CHART_COMMENT_PREFIX: "<!-- ",
  CHART_COMMENT_SUFFIX: " -->",
  CHART_PLACEHOLDER: "[Chart]",
};

const ELEMENT_TYPES = {
  FOOTER: "footer",
  TEXT: "text",
  IMAGE: "image",
  TABLE: "table",
  CHART: "chart",
  DIAGRAM: "diagram",
};

const MARKDOWN_TAGS = {
  TITLE: "@title",
  HEADER: "@header",
  MAIN: "@main",
  MEDIA: "@media",
  SECONDARY: "@secondary",
  FOOTER: "@footer",
};

const LUMINANCE = {
  RED_COEFF: 299,
  GREEN_COEFF: 587,
  BLUE_COEFF: 114,
  SCALE_DIVISOR: 1000,
  DARK_THRESHOLD: 128,
  HEX_MIN_LENGTH: 6,
};

const REGEX = {
  BULLET: /^(?:[\u2022\u2023\u25E6\u2043\u2219•-]\s*)+/,
  NUMBER: /^\d+[.)]\s*/,
  HEADING_MARKER: /^#{2,3}\s/,
  BULLET_LINE: /(?:^|\n)\s*[-*•]\s/,
  NUMBER_LINE: /(?:^|\n)\s*\d+[.)]\s/,
  CODE_BLOCK: /```/,
  BOLD_HEADING: /^\*\*[^*]+\*\*$/,
  HEADING_REPLACE: /^##\s+/,
  NOTES_HTML_COMMENT_START: /<!--/g,
  NOTES_HTML_COMMENT_END: /-->/g,
  NOTES_HTML_BR: /<br\s*\/?>/gi,
  NOTES_HTML_TAGS: /<[^>]+>/g,
  IMAGE_VECTOR_EXT: /\.(emf|wmf)$/i,
  DECK_NAME_SANITIZE: /[^a-zA-Z0-9_-]/g,
  FILE_EXTENSION: /\.[^.]+$/,
  HYPHEN_UNDERSCORE: /[-_]/g,
  NEWLINE_CRLF: /\r\n?/g,
  NEWLINE: /\n/g,
  PIPE: /\|/g,
  ESCAPE_PIPE: "\\|",
  DOUBLE_NEWLINE: "\n\n",
  TRIPLE_NEWLINE_OR_MORE: /\n{3,}/g,
};

const CONFIG = {
  bodyTopRatio: 0.22,
  rowMaxVerticalDiffRatio: 0.1,
  minColumnSpreadRatio: 0.15,
  maxTitleLength: 300,
  maxTitleElements: 3,
  headerThinRatio: 0.4,
  maxHeaderHeightRatio: 0.35,
  centerToleranceRatio: 0.1,
  minSubstantialBodyLength: 80,
  maxHeaderLength: 150,
  maxHeaderLengthShort: 80,
  minMediaAreaRatio: 0.005,
  maxMediaAreaRatio: 0.85,
  maxLogoAreaRatio: 0.015, // Max area of slide (1.5%) for header/footer logo filtering
  maxBackgroundCardRatio: 1.5, // Max area multiplier relative to text for background cards
  minDominantAreaRatio: 0.05,
  thinLineThresholdPoints: 15, // Max thickness in points for vertical/horizontal lines
  microNoiseThresholdPoints: 150, // Absolute minimum area in points for an image
  marginTopRatio: 0.1, // Top 10% of slide height
  marginBottomRatio: 0.9, // Bottom 10% of slide height
  aspectRatioUpperLimit: 8,
  aspectRatioLowerLimit: 0.125,
};

/**
 * Convert English Metric Units (EMUs) to standard slide points.
 * @param {number} val
 * @returns {number}
 */
function emuToPoints(val) {
  if (typeof val !== "number") return 0;
  return val >= CONVERSION.EMU_THRESHOLD ? val / CONVERSION.EMU_PER_POINT : val;
}

/**
 * Normalize all spatial properties of an element to Points.
 * @param {import('./pptx-extractor.js').ExtractedElement} el
 * @returns {import('./pptx-extractor.js').ExtractedElement}
 */
function normalizeElementUnits(el) {
  return {
    ...el,
    left: emuToPoints(el.left),
    top: emuToPoints(el.top),
    width: emuToPoints(el.width),
    height: emuToPoints(el.height),
  };
}

/**
 * Convert an extraction result to SlideMD markdown.
 * @static
 * @param {import('./pptx-extractor.js').ExtractionResult} extraction
 * @param {string} [deckName='presentation'] - Deck name for image path namespacing.
 * @param {object} [opts]
 * @param {boolean} [opts.importImages=true] - When false, images are excluded from layout detection so that
 *   image-based layouts (two-column, three-column) are never inferred.
 * @returns {string} Complete SlideMD markdown.
 */
export function convertToSlideMd(
  extraction,
  deckName = DEFAULTS.DECK_NAME,
  { importImages = true } = {},
) {
  const slideWidth = emuToPoints(extraction.size?.width || DEFAULT_SLIDE_SIZE.WIDTH_EMU);
  const slideHeight = emuToPoints(extraction.size?.height || DEFAULT_SLIDE_SIZE.HEIGHT_EMU);

  const slides = extraction.slides.map((slide) => {
    const normalizedSlide = {
      ...slide,
      elements: slide.elements.map(normalizeElementUnits),
    };
    return convertSlide(normalizedSlide, slideWidth, slideHeight, deckName, importImages);
  });

  return slides.join("\n\n---\n\n");
}

/**
 * Extracts, validates, and filters header and body contents from element sets.
 * @param {import('./pptx-extractor.js').ExtractedElement[]} textElements
 * @param {import('./pptx-extractor.js').ExtractedElement[]} allElements
 * @param {number} slideHeight
 * @param {boolean} [enforceLengthLimit=false]
 */
function extractHeader(textElements, allElements, slideHeight, enforceLengthLimit = false) {
  const isHeading = (el) => REGEX.HEADING_MARKER.test(el.content?.trim() || "");
  const isShortEnough = (el) => {
    if (!enforceLengthLimit) return true;
    const text = (el.content || "").replace(REGEX.HEADING_REPLACE, "").trim();
    return text.length <= CONFIG.maxHeaderLengthShort;
  };

  const header =
    textElements.find((el) => isHeading(el) && isShortEnough(el)) ||
    textElements.find((el) => el.top < slideHeight * CONFIG.bodyTopRatio && isShortEnough(el)) ||
    null;

  if (!header) {
    return { header: null, isHeaderValid: false, bodyElements: allElements };
  }

  const headerText = header.content || "";
  const hasBullets = REGEX.BULLET_LINE.test(headerText);
  const hasNumbers = REGEX.NUMBER_LINE.test(headerText);
  const hasCodeBlock = REGEX.CODE_BLOCK.test(headerText);
  const isHeaderValid = !hasBullets && !hasNumbers && !hasCodeBlock;
  const bodyElements = isHeaderValid ? allElements.filter((el) => el !== header) : allElements;

  return { header, isHeaderValid, bodyElements };
}

/**
 * Convert a single extracted slide to SlideMD markdown.
 * @param {import('./pptx-extractor.js').ExtractedSlide} slide
 * @param {number} slideWidth
 * @param {number} slideHeight
 * @param {string} deckName
 * @param {boolean} importImages
 * @returns {string}
 */
function convertSlide(slide, slideWidth, slideHeight, deckName, importImages = true) {
  const parts = [];

  // Speaker notes
  if (slide.notes) {
    const sanitized = slide.notes
      .replace(REGEX.NOTES_HTML_COMMENT_START, "< !--")
      .replace(REGEX.NOTES_HTML_COMMENT_END, "-- >")
      .replace(REGEX.NOTES_HTML_BR, "\n")
      .replace(REGEX.NOTES_HTML_TAGS, "");
    parts.push(`${DEFAULTS.NOTES_COMMENT_START}${sanitized}${DEFAULTS.NOTES_COMMENT_END}`);
  }

  // 1. Identify layout-defining images first to ensure they are never filtered out
  const dominantImagesCandidates = importImages
    ? findDominantImages(slide.elements, slideWidth, slideHeight)
    : [];

  // 2. Filter out decorative background/border/logo elements from the slide
  const meaningfulElements = filterMeaningfulElements(
    slide.elements,
    slideWidth,
    slideHeight,
    dominantImagesCandidates,
  );

  // 3. Separate structural footer elements from standard slide body elements
  const footerElements = slide.elements.filter((el) => el.placeholderType === ELEMENT_TYPES.FOOTER);

  const textElements = meaningfulElements.filter(
    (el) =>
      el.type === ELEMENT_TYPES.TEXT &&
      el.content?.trim() &&
      el.placeholderType !== ELEMENT_TYPES.FOOTER,
  );
  const allElements = meaningfulElements.filter(
    (el) =>
      el.placeholderType !== ELEMENT_TYPES.FOOTER &&
      ((el.type === ELEMENT_TYPES.TEXT && el.content?.trim()) ||
        (importImages && el.type === ELEMENT_TYPES.IMAGE && el.base64) ||
        (el.type === ELEMENT_TYPES.TABLE && el.rows?.length) ||
        el.type === ELEMENT_TYPES.CHART ||
        el.type === ELEMENT_TYPES.DIAGRAM),
  );

  const dominantImages = importImages
    ? findDominantImages(allElements, slideWidth, slideHeight)
    : [];
  const hasMedia = allElements.some((el) => el.type !== ELEMENT_TYPES.TEXT);

  let layout = inferLayout(
    textElements,
    slideWidth,
    slideHeight,
    hasMedia,
    allElements,
    dominantImages,
  );

  const formatSingleElement = (el) => {
    if (el.type === ELEMENT_TYPES.TEXT) return formatTextElement(el.content);
    if (el.type === ELEMENT_TYPES.IMAGE) return formatImage(el, deckName);
    if (el.type === ELEMENT_TYPES.TABLE) return formatTable(el);
    if (el.type === ELEMENT_TYPES.CHART) return formatChart(el);
    if (el.type === ELEMENT_TYPES.DIAGRAM) return formatDiagram(el);
    return "";
  };

  // --- SELF-HEALING ENGINE ---
  // If we inferred a two-column layout, pre-format both sides. If either side is completely
  // empty of renderable content, automatically downgrade to a single "header-content" column [1.1.4, 1.1.5].
  if (layout.type === LAYOUT.TWO_COLUMN.type) {
    const { bodyElements } = extractHeader(textElements, allElements, slideHeight, false);

    const hasDominantImages = dominantImages.length > 0;
    const mediaImage = hasDominantImages ? dominantImages[0] : null;
    const midX = slideWidth / 2;

    const leftEls = hasDominantImages
      ? bodyElements.filter((el) => el !== mediaImage)
      : bodyElements.filter((el) => el.left + el.width / 2 < midX);

    const rightEls = hasDominantImages
      ? [mediaImage]
      : bodyElements.filter((el) => el.left + el.width / 2 >= midX);

    const leftContent = leftEls
      .map(formatSingleElement)
      .filter(Boolean)
      .join(REGEX.DOUBLE_NEWLINE)
      .trim();
    const rightContent = rightEls
      .map(formatSingleElement)
      .filter(Boolean)
      .join(REGEX.DOUBLE_NEWLINE)
      .trim();

    if (!leftContent || !rightContent) {
      layout = { type: LAYOUT.HEADER_CONTENT.type, spec: LAYOUT.HEADER_CONTENT.spec };
    }
  }

  parts.push(`layout: ${layout.spec}`);

  if (slide.background) {
    parts.push(`background: ${slide.background}`);
    if (isColorDark(slide.background)) {
      parts.push("theme: dark");
    }
  }

  // --- RENDER SECTIONS ---
  if (layout.type === LAYOUT.TITLE_SLIDE.type) {
    parts.push("");
    parts.push(MARKDOWN_TAGS.TITLE);
    parts.push("");
    parts.push(allElements.map((el) => formatSingleElement(el)).join(REGEX.DOUBLE_NEWLINE));
  } else if (layout.type === LAYOUT.HEADER_CONTENT.type) {
    const { header, isHeaderValid, bodyElements } = extractHeader(
      textElements,
      allElements,
      slideHeight,
      true,
    );
    const singleImage =
      bodyElements.length === 1 &&
      bodyElements[0].type === ELEMENT_TYPES.IMAGE &&
      bodyElements[0].base64;
    parts.push("");
    if (isHeaderValid) {
      parts.push(MARKDOWN_TAGS.HEADER);
      parts.push("");
      parts.push(formatTextElement(header.content));
      parts.push("");
    }
    parts.push(MARKDOWN_TAGS.MAIN);
    parts.push("");
    if (singleImage) {
      parts.push(formatImage(bodyElements[0], deckName, { omitDimensions: true }));
    } else {
      parts.push(bodyElements.map((el) => formatSingleElement(el)).join(REGEX.DOUBLE_NEWLINE));
    }
  } else if (layout.type === LAYOUT.TWO_COLUMN.type) {
    const { header, isHeaderValid, bodyElements } = extractHeader(
      textElements,
      allElements,
      slideHeight,
      false,
    );
    parts.push("");
    if (isHeaderValid) {
      parts.push(MARKDOWN_TAGS.HEADER);
      parts.push("");
      parts.push(formatTextElement(header.content));
      parts.push("");
    }
    if (dominantImages.length > 0) {
      const mediaImage = dominantImages[0];
      const mainEls = bodyElements.filter((el) => el !== mediaImage);
      parts.push(MARKDOWN_TAGS.MAIN);
      parts.push("");
      parts.push(mainEls.map((el) => formatSingleElement(el)).join(REGEX.DOUBLE_NEWLINE));
      parts.push("");
      parts.push(MARKDOWN_TAGS.MEDIA);
      parts.push("");
      parts.push(formatSingleElement(mediaImage));
    } else {
      const midX = slideWidth / 2;
      const leftEls = bodyElements.filter((el) => el.left + el.width / 2 < midX);
      const rightEls = bodyElements.filter((el) => el.left + el.width / 2 >= midX);
      parts.push(MARKDOWN_TAGS.MAIN);
      parts.push("");
      parts.push(leftEls.map((el) => formatSingleElement(el)).join(REGEX.DOUBLE_NEWLINE));
      parts.push("");
      parts.push(MARKDOWN_TAGS.MEDIA);
      parts.push("");
      parts.push(rightEls.map((el) => formatSingleElement(el)).join(REGEX.DOUBLE_NEWLINE));
    }
  } else if (layout.type === LAYOUT.THREE_COLUMN.type) {
    const { header, isHeaderValid, bodyElements } = extractHeader(
      textElements,
      allElements,
      slideHeight,
      false,
    );
    const [mediaImage, secondaryImage] = dominantImages;
    if (!mediaImage || !secondaryImage) {
      parts.push("");
      if (isHeaderValid) {
        parts.push(MARKDOWN_TAGS.HEADER);
        parts.push("");
        parts.push(formatTextElement(header.content));
        parts.push("");
      }
      parts.push(MARKDOWN_TAGS.MAIN);
      parts.push("");
      parts.push(bodyElements.map((el) => formatSingleElement(el)).join(REGEX.DOUBLE_NEWLINE));
      return parts.join("\n");
    }
    const mainEls = bodyElements.filter((el) => el !== mediaImage && el !== secondaryImage);
    parts.push("");
    if (isHeaderValid) {
      parts.push(MARKDOWN_TAGS.HEADER);
      parts.push("");
      parts.push(formatTextElement(header.content));
      parts.push("");
    }
    parts.push(MARKDOWN_TAGS.MAIN);
    parts.push("");
    parts.push(mainEls.map((el) => formatSingleElement(el)).join(REGEX.DOUBLE_NEWLINE));
    parts.push("");
    parts.push(MARKDOWN_TAGS.MEDIA);
    parts.push("");
    parts.push(formatSingleElement(mediaImage));
    parts.push("");
    parts.push(MARKDOWN_TAGS.SECONDARY);
    parts.push("");
    parts.push(formatSingleElement(secondaryImage));
  } else {
    parts.push("");
    parts.push(MARKDOWN_TAGS.MAIN);
    parts.push("");
    parts.push(allElements.map((el) => formatSingleElement(el)).join(REGEX.DOUBLE_NEWLINE));
  }

  if (footerElements.length > 0) {
    const footerText = footerElements
      .map((el) => el.content?.trim())
      .filter(Boolean)
      .join(" ");
    if (footerText) {
      parts.push("");
      parts.push(MARKDOWN_TAGS.FOOTER);
      parts.push("");
      parts.push(footerText);
    }
  }

  return parts.join("\n");
}

/**
 * Filter out slide backgrounds, structural borders, tight frames, and template logos/footers.
 * @param {import('./pptx-extractor.js').ExtractedElement[]} elements
 * @param {number} slideWidth
 * @param {number} slideHeight
 * @param {import('./pptx-extractor.js').ExtractedElement[]} dominantImages
 * @returns {import('./pptx-extractor.js').ExtractedElement[]}
 */
function filterMeaningfulElements(elements, slideWidth, slideHeight, dominantImages = []) {
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
    if (aspectRatio > CONFIG.aspectRatioUpperLimit && h < CONFIG.thinLineThresholdPoints)
      return false; // Horizontal divider line
    if (aspectRatio < CONFIG.aspectRatioLowerLimit && w < CONFIG.thinLineThresholdPoints)
      return false; // Vertical divider line

    // 5. Margin Filter (Catches template logos, headers, and footers close to top/bottom edges)
    if (area < slideArea * CONFIG.maxLogoAreaRatio) {
      const isInTopMargin = el.top < slideHeight * CONFIG.marginTopRatio;
      const isInBottomMargin = el.top + h > slideHeight * CONFIG.marginBottomRatio;

      // Discard small elements placed inside either the top or bottom margin bounds
      if (isInTopMargin || isInBottomMargin) {
        return false;
      }
    }

    // 6. Text-Background / Border Overlap Filter
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

function getOverlapArea(a, b) {
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
 * Infer the layout type from element positions.
 * @param {import('./pptx-extractor.js').ExtractedElement[]} textEls
 * @param {number} slideWidth
 * @param {number} slideHeight
 * @returns {{ type: string, spec: string }}
 */
function inferLayout(
  textEls,
  slideWidth,
  slideHeight,
  hasMedia = false,
  allEls = textEls,
  dominantImages = findDominantImages(allEls, slideWidth, slideHeight),
) {
  const contentEls = textEls.filter((el) => el.content?.trim());

  if (contentEls.length === 0) {
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

    const text = el.content || "";
    const hasBullet = REGEX.BULLET.test(text) || REGEX.NUMBER.test(text);
    return text.length <= CONFIG.maxHeaderLength && !hasBullet;
  };

  const headerEl = contentEls.find(isHeader) || null;
  const hasHeader = !!headerEl;

  if (!hasMedia) {
    const maxRowDiff = slideHeight * CONFIG.rowMaxVerticalDiffRatio;
    const minSpread = slideWidth * CONFIG.minColumnSpreadRatio;

    const hasSpreadRow = contentEls.some((a) =>
      contentEls.some(
        (b) =>
          a !== b &&
          Math.abs(a.top - b.top) <= maxRowDiff &&
          Math.abs(a.left - b.left) >= minSpread,
      ),
    );

    if (hasSpreadRow) return LAYOUT.TWO_COLUMN;

    const hasBodyBelowHeader = contentEls.some((el) => el !== headerEl && el.top >= bodyThreshold);
    const totalLength = contentEls.reduce((sum, el) => sum + el.content.trim().length, 0);

    if (totalLength < CONFIG.maxTitleLength && contentEls.length <= CONFIG.maxTitleElements) {
      const hasBullet = contentEls.some(
        (el) => REGEX.BULLET.test(el.content || "") || REGEX.NUMBER.test(el.content || ""),
      );

      const titleBodyEls = contentEls.filter((el) => el !== headerEl);
      const headerHi = headerEl?.height || 0;
      const bodyHi = titleBodyEls.length ? Math.max(...titleBodyEls.map((e) => e.height || 0)) : 0;
      const isThinStripHeader =
        headerEl && bodyHi > 0 && headerHi < bodyHi * CONFIG.headerThinRatio;

      if (!hasBullet && (!headerEl || !isThinStripHeader)) {
        return LAYOUT.TITLE_SLIDE;
      }
    }

    if (hasHeader && hasBodyBelowHeader) return LAYOUT.HEADER_CONTENT;
    if (totalLength < CONFIG.maxTitleLength) return LAYOUT.TITLE_SLIDE;
  }

  const midX = slideWidth / 2;
  const centerTol = slideWidth * CONFIG.centerToleranceRatio;
  const isCentered = (el) => Math.abs(el.left + el.width / 2 - midX) < centerTol;

  const leftEls = allEls.filter(
    (el) => el !== headerEl && el.left + el.width / 2 < midX && !isCentered(el),
  );
  const rightEls = allEls.filter(
    (el) => el !== headerEl && el.left + el.width / 2 >= midX && !isCentered(el),
  );

  const hasTwoColumns = leftEls.length > 0 && rightEls.length > 0;
  const hasTextColumns =
    leftEls.some((el) => el.type === ELEMENT_TYPES.TEXT) ||
    rightEls.some((el) => el.type === ELEMENT_TYPES.TEXT);

  if (hasHeader && hasTwoColumns && hasTextColumns) return LAYOUT.TWO_COLUMN;

  if (!hasHeader && dominantImages.length >= 2 && contentEls.length > 0) {
    return LAYOUT.THREE_COLUMN;
  }

  const bodyEls = contentEls.filter((el) => el !== headerEl);
  const bodyLength = bodyEls.reduce((sum, el) => sum + el.content.trim().length, 0);

  const bodyRichEls = allEls.filter(
    (el) =>
      el !== headerEl &&
      el !== dominantImages[0] &&
      [ELEMENT_TYPES.TABLE, ELEMENT_TYPES.CHART, ELEMENT_TYPES.DIAGRAM].includes(el.type),
  );

  const hasSubstantialBody =
    bodyRichEls.length > 0 || (bodyEls.length >= 2 && bodyLength > CONFIG.minSubstantialBodyLength);

  if (dominantImages.length === 1 && hasSubstantialBody) return LAYOUT.TWO_COLUMN;
  if (hasHeader) return LAYOUT.HEADER_CONTENT;

  const hasTallColumn = bodyEls.some((e) => (e.height || 0) > slideHeight * 0.5);
  if (
    hasTwoColumns &&
    (hasTallColumn || (bodyEls.length >= 2 && bodyLength > CONFIG.minSubstantialBodyLength))
  ) {
    return LAYOUT.TWO_COLUMN;
  }

  return LAYOUT.HEADER_CONTENT;
}

function findDominantImages(allEls, slideWidth, slideHeight) {
  const slideArea = slideWidth * slideHeight;
  const images = allEls.filter((el) => el.type === ELEMENT_TYPES.IMAGE && el.base64);

  return images.filter((el) => {
    const w = el.width || 0;
    const h = el.height || 0;
    const area = w * h;

    return area >= slideArea * CONFIG.minDominantAreaRatio;
  });
}

function isColorDark(colorHex) {
  if (!colorHex || !colorHex.startsWith("#")) return false;
  const hex = colorHex.replace("#", "");
  if (hex.length < LUMINANCE.HEX_MIN_LENGTH) return false;
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return (
    (r * LUMINANCE.RED_COEFF + g * LUMINANCE.GREEN_COEFF + b * LUMINANCE.BLUE_COEFF) /
      LUMINANCE.SCALE_DIVISOR <
    LUMINANCE.DARK_THRESHOLD
  );
}

function formatTextElement(raw) {
  if (!raw) return "";
  const lines = raw.split("\n");
  const result = [];
  let inFencedCode = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      result.push("");
      continue;
    }

    if (trimmed === "```") {
      inFencedCode = !inFencedCode;
      result.push(trimmed);
      continue;
    }
    if (inFencedCode) {
      result.push(line);
      continue;
    }

    const indent = line.match(/^(\s*)/)[1];
    const indentLevel =
      indent.length > 0 ? Math.floor(indent.length / CONVERSION.INDENT_DIVISOR) : 0;
    const prefix = "  ".repeat(indentLevel);

    if (REGEX.BULLET.test(trimmed)) {
      const content = trimmed.replace(REGEX.BULLET, "");
      result.push(`${prefix}- ${content}`);
    } else if (REGEX.NUMBER.test(trimmed)) {
      const match = trimmed.match(REGEX.NUMBER);
      const content = trimmed.replace(REGEX.NUMBER, "");
      const number = match ? match[0].replace(/[.)]\s*/, "") : "1";
      result.push(`${prefix}${number}. ${content}`);
    } else if (REGEX.BOLD_HEADING.test(trimmed)) {
      result.push(`## ${trimmed.replace(/^\*\*|\*\*$/g, "")}`);
    } else {
      result.push(trimmed);
    }
  }

  return result.join("\n").replace(REGEX.TRIPLE_NEWLINE_OR_MORE, REGEX.DOUBLE_NEWLINE).trim();
}

function formatImage(img, deckName = DEFAULTS.DECK_NAME, { omitDimensions = false } = {}) {
  const rawName = (img.ref || DEFAULTS.IMAGE_FILENAME).split("/").pop();
  const filename = rawName.replace(REGEX.IMAGE_VECTOR_EXT, DEFAULTS.IMAGE_MIME_PNG);
  const safeName = deckName.replace(REGEX.DECK_NAME_SANITIZE, "_");

  const src = img.blob || `${DEFAULTS.IMAGE_SUBDIR}${safeName}_${filename}`;
  const altText = filename.replace(REGEX.FILE_EXTENSION, "").replace(REGEX.HYPHEN_UNDERSCORE, " ");

  if (!omitDimensions) {
    const w = Math.round(img.width * CONVERSION.POINTS_TO_PX) || null;
    const h = Math.round(img.height * CONVERSION.POINTS_TO_PX) || null;
    if (w && h) {
      return `<img src="${src}" width="${w}" height="${h}" alt="${altText}">`;
    }
  }
  return `<img src="${src}" alt="${altText}">`;
}

function formatTable(table) {
  if (!table.rows?.length) return "";
  const escapeCell = (text) =>
    (text || "")
      .replace(REGEX.NEWLINE_CRLF, "\n")
      .replace(REGEX.NEWLINE, "<br>")
      .replace(REGEX.PIPE, REGEX.ESCAPE_PIPE)
      .trim();
  const formatRow = (row) => row.map((cell) => escapeCell(cell.text)).join(" | ");
  const headerRow = table.rows[0];
  const separator = headerRow.map(() => "---").join(" | ");
  const rows = table.rows.map(formatRow);
  const parts = [];
  parts.push(`| ${rows[0]} |`);
  parts.push(`| ${separator} |`);
  for (let i = 1; i < rows.length; i++) {
    parts.push(`| ${rows[i]} |`);
  }
  return parts.join("\n");
}

function formatChart(chart) {
  if (!chart.chartData?.length) {
    return `${DEFAULTS.CHART_COMMENT_PREFIX}${chart.content || DEFAULTS.CHART_PLACEHOLDER}${DEFAULTS.CHART_COMMENT_SUFFIX}`;
  }

  const { headers, rows } = buildChartDataRows(chart.chartData);

  const escapeCell = (text) => text.replace(REGEX.PIPE, REGEX.ESCAPE_PIPE).trim();
  const separator = headers.map(() => "---").join(" | ");
  const parts = [];
  parts.push(`| ${headers.map(escapeCell).join(" | ")} |`);
  parts.push(`| ${separator} |`);
  for (const row of rows) {
    parts.push(`| ${row.map(escapeCell).join(" | ")} |`);
  }
  return parts.join("\n");
}

function formatDiagram(diagram) {
  if (!diagram.content) return "";

  const items = diagram.content
    .split(", ")
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) return "";
  if (items.length === 1) return items[0];

  const lines = [];
  for (const item of items) {
    const subItems = item.split("\n").filter((s) => s.trim());
    if (subItems.length === 1) {
      lines.push(`- ${subItems[0]}`);
    } else {
      lines.push(`- ${subItems[0]}`);
      for (let i = 1; i < subItems.length; i++) {
        lines.push(`  - ${subItems[i]}`);
      }
    }
  }
  return lines.join("\n");
}
