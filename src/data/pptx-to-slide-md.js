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
import { stripHtml, escapeHtml } from "./pptx-html-to-markdown.js";

// Layout Definitions
const LAYOUT = {
  TITLE_SLIDE: { type: "title-slide", spec: "title-slide" },
  FOCUS: { type: "focus", spec: "focus" },
  HEADER_CONTENT: { type: "header-content", spec: "header-content" },
  TWO_COLUMN: { type: "two-column", spec: "two-column" },
  MEDIA_SPAN: { type: "media-span", spec: "media-span" },
  THREE_COLUMN: { type: "three-column", spec: "three-column" },
  FULL_IMAGE: { type: "full-image", spec: "full-image" },
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
  HEADING_MARKER: /^#{1,3}\s/,
  BULLET_LINE: /(?:^|\n)\s*[-*•]\s/,
  NUMBER_LINE: /(?:^|\n)\s*\d+[.)]\s/,
  CODE_BLOCK: /```/,
  BOLD_HEADING: /^\*\*[^*]+\*\*$/,
  HEADING_REPLACE: /^#{1,3}\s+/,
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
  overlapRatioThreshold: 0.5, // Minimum overlap ratio to consider image as text background/border
  dominantImageThreshold: 0.6, // Minimum area ratio for dominant image to become background
  backgroundOverlapThreshold: 0.1, // Minimum overlap ratio for background/content
  spreadOverlapThreshold: 0.5, // Minimum overlap ratio for two-column detection
  partitionMidTolerance: 0.05, // Tolerance for center vs left-edge partition
  tallColumnHeightRatio: 0.5, // Minimum height ratio for "tall" column detection
  fullScreenTableThreshold: 0.8, // Minimum area ratio for full-page table
  flexRowVerticalTolerance: 0.15, // Max top-position diff (ratio of slide height) for same row
  flexRowMinHorizontalGap: 0.1, // Min gap (ratio of slide width) between elements in a row
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
 * @param {boolean} [opts.importBackgrounds=true] - When false, background image CSS directives are omitted.
 * @returns {string} Complete SlideMD markdown.
 */
export function convertToSlideMd(
  extraction,
  deckName = DEFAULTS.DECK_NAME,
  { importImages = true, importBackgrounds = true } = {},
) {
  const slideWidth = emuToPoints(extraction.size?.width || DEFAULT_SLIDE_SIZE.WIDTH_EMU);
  const slideHeight = emuToPoints(extraction.size?.height || DEFAULT_SLIDE_SIZE.HEIGHT_EMU);

  const slides = extraction.slides.map((slide, index) => {
    const normalizedSlide = {
      ...slide,
      elements: slide.elements.map(normalizeElementUnits),
    };
    return convertSlide(
      normalizedSlide,
      slideWidth,
      slideHeight,
      deckName,
      importImages,
      importBackgrounds,
      index,
    );
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

  // 1. Prefer explicit heading markers (## / ###) — always a header
  // 2. Fallback: short text in the top portion of the slide
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
 * @param {boolean} importBackgrounds
 * @param {number} slideIndex
 * @returns {string}
 */
function convertSlide(
  slide,
  slideWidth,
  slideHeight,
  deckName,
  importImages = true,
  importBackgrounds = true,
  slideIndex = 0,
) {
  const parts = [];

  // Detect full-page background images BEFORE stripping images or filtering,
  // so they are always found regardless of the importImages setting.
  // Background images are always uploaded as files (never inlined as data URLs)
  // to keep the markdown lightweight.
  const slideArea = slideWidth * slideHeight;
  const bgCandidate = slide.elements.find((el) => {
    if (el.type !== ELEMENT_TYPES.IMAGE || !el.ref) return false;
    const imgArea = (el.width || 0) * (el.height || 0);
    // Image covers >= 80% of slide — always a background
    if (imgArea >= slideArea * 0.8) return true;
    // Image covers >= 60% of slide — background if it overlaps content
    if (imgArea < slideArea * CONFIG.dominantImageThreshold) return false;
    const contentEls = slide.elements.filter(
      (other) =>
        other !== el &&
        [
          ELEMENT_TYPES.TEXT,
          ELEMENT_TYPES.TABLE,
          ELEMENT_TYPES.CHART,
          ELEMENT_TYPES.DIAGRAM,
        ].includes(other.type),
    );
    return contentEls.some((cel) => {
      const overlap = getOverlapArea(el, cel);
      return overlap / imgArea > CONFIG.backgroundOverlapThreshold;
    });
  });

  // Detect full-image slides: single image covering > 50% with no text content.
  // These use the full-image layout instead of a CSS background.
  // Footer text is excluded — it's decorative, not content.
  const fullImageThreshold = 0.5;
  let fullImageCandidate = null;
  if (bgCandidate) {
    const imgArea = (bgCandidate.width || 0) * (bgCandidate.height || 0);
    const hasText = slide.elements.some(
      (el) =>
        el.type === ELEMENT_TYPES.TEXT &&
        el.content?.trim() &&
        el.placeholderType !== ELEMENT_TYPES.FOOTER,
    );
    if (imgArea >= slideArea * fullImageThreshold && !hasText) {
      fullImageCandidate = bgCandidate;
    }
  }

  // Drop non-background images when not importing so they don't affect layout inference.
  // The bgCandidate is always preserved so its file reference can be emitted.
  if (!importImages) {
    slide = {
      ...slide,
      elements: slide.elements.filter(
        (el) => el.type !== ELEMENT_TYPES.IMAGE || el === bgCandidate,
      ),
    };
  }

  // Speaker notes
  if (slide.notes) {
    const sanitized = slide.notes
      .replace(REGEX.NOTES_HTML_COMMENT_START, "< !--")
      .replace(REGEX.NOTES_HTML_COMMENT_END, "-- >")
      .replace(REGEX.NOTES_HTML_BR, "\n")
      .replace(REGEX.NOTES_HTML_TAGS, "")
      .trim();
    if (sanitized) {
      parts.push(`${DEFAULTS.NOTES_COMMENT_START}${sanitized}${DEFAULTS.NOTES_COMMENT_END}`);
      parts.push("");
    }
  }

  // 1. Identify layout-defining images first to ensure they are never filtered out
  let dominantImages = importImages
    ? findDominantImages(slide.elements, slideWidth, slideHeight)
    : [];

  // 2. Filter out decorative background/border/logo elements from the slide
  const meaningfulElements = filterMeaningfulElements(
    slide.elements,
    slideWidth,
    slideHeight,
    dominantImages,
  );

  // Rebuild dominantImages to only include images that survived filtering
  dominantImages = dominantImages.filter((dom) =>
    meaningfulElements.some(
      (el) =>
        el.type === ELEMENT_TYPES.IMAGE &&
        el.ref === dom.ref &&
        el.left === dom.left &&
        el.top === dom.top,
    ),
  );

  // Emit background image as a file reference (always uploaded, never inlined).
  // Skip if this is a full-image slide — the image will be emitted as an <img> tag instead.
  if (importBackgrounds && bgCandidate && !fullImageCandidate) {
    const rawName = (bgCandidate.ref || "").split("/").pop();
    const filename = rawName.replace(REGEX.IMAGE_VECTOR_EXT, DEFAULTS.IMAGE_MIME_PNG);
    slide.background = `linear-gradient(rgba(0,0,0,0.65),rgba(0,0,0,0.65)), url(${DEFAULTS.IMAGE_SUBDIR}${filename}) center / cover no-repeat`;
    // Remove the background image from dominant so it doesn't appear in @media
    dominantImages = dominantImages.filter(
      (el) =>
        !(el.ref === bgCandidate.ref && el.left === bgCandidate.left && el.top === bgCandidate.top),
    );
  }

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
      el !== bgCandidate &&
      el.placeholderType !== ELEMENT_TYPES.FOOTER &&
      ((el.type === ELEMENT_TYPES.TEXT && el.content?.trim()) ||
        (importImages && el.type === ELEMENT_TYPES.IMAGE && el.ref) ||
        (el.type === ELEMENT_TYPES.TABLE && el.rows?.length) ||
        el.type === ELEMENT_TYPES.CHART ||
        el.type === ELEMENT_TYPES.DIAGRAM),
  );

  const hasMedia = allElements.some((el) => el.type !== ELEMENT_TYPES.TEXT);

  // Prune slides with no content elements
  if (allElements.length === 0 && footerElements.length === 0) {
    return slide.notes ? parts.join("\n") : "";
  }

  let layout = inferLayout(
    textElements,
    slideWidth,
    slideHeight,
    hasMedia,
    allElements,
    dominantImages,
    slideIndex,
  );

  const formatSingleElement = (el) => {
    if (el.type === ELEMENT_TYPES.TEXT) return formatTextElement(el.content);
    if (el.type === ELEMENT_TYPES.IMAGE) return formatImage(el, deckName);
    if (el.type === ELEMENT_TYPES.TABLE) return formatTable(el, slideWidth, slideHeight);
    if (el.type === ELEMENT_TYPES.CHART) return formatChart(el);
    if (el.type === ELEMENT_TYPES.DIAGRAM) return formatDiagram(el);
    return "";
  };

  // --- MEDIA-SPAN UPGRADE ---
  // If we have a two-column layout and the right column contains exactly one
  // image, upgrade to media-span so the image spans the full slide height.
  if (layout.type === LAYOUT.TWO_COLUMN.type) {
    const { header, bodyElements } = extractHeader(textElements, allElements, slideHeight, false);
    const midX = slideWidth / 2;
    const centerTol = slideWidth * CONFIG.centerToleranceRatio;
    const isCentered = (el) => Math.abs(el.left + el.width / 2 - midX) < centerTol;

    const rightEls = bodyElements.filter((el) => {
      if (isCentered(el)) return false;
      if (header && el === header) return false;
      return (el.left || 0) + (el.width || 0) / 2 >= midX;
    });

    const singleImageOnRight =
      rightEls.length === 1 && rightEls[0].type === ELEMENT_TYPES.IMAGE && rightEls[0].ref;

    // Only upgrade to media-span if there's actual body content beyond the
    // header. Otherwise @main would be empty — header-content handles this.
    const hasBodyContent = bodyElements.some(
      (el) =>
        el !== header &&
        el.type !== ELEMENT_TYPES.IMAGE &&
        ((el.type === ELEMENT_TYPES.TEXT && el.content?.trim()) ||
          el.type === ELEMENT_TYPES.TABLE ||
          el.type === ELEMENT_TYPES.CHART ||
          el.type === ELEMENT_TYPES.DIAGRAM),
    );
    if (singleImageOnRight && hasBodyContent) {
      layout = { type: LAYOUT.MEDIA_SPAN.type, spec: LAYOUT.MEDIA_SPAN.spec };
    }
  }

  // Compute extractHeader once — reused by pre-check and all render branches.
  const { header, isHeaderValid, bodyElements } = extractHeader(
    textElements,
    allElements,
    slideHeight,
    false,
  );
  const midX = slideWidth / 2;

  // Pre-check: if two-column split would leave one side empty, downgrade now
  // so the layout spec matches the actual rendered content.
  if (layout.type === LAYOUT.TWO_COLUMN.type) {
    const leftEls = bodyElements.filter(
      (el) =>
        getOverlapArea(el, { left: 0, top: 0, width: midX, height: slideHeight }) >
        getOverlapArea(el, { left: midX, top: 0, width: midX, height: slideHeight }) * 1.5,
    );
    const rightEls = bodyElements.filter(
      (el) =>
        getOverlapArea(el, { left: midX, top: 0, width: midX, height: slideHeight }) >
        getOverlapArea(el, { left: 0, top: 0, width: midX, height: slideHeight }) * 1.5,
    );
    if (leftEls.length === 0 || rightEls.length === 0) {
      layout = LAYOUT.HEADER_CONTENT;
    }
  }

  parts.push(`layout: ${layout.spec}`);

  if (slide.background) {
    parts.push(`background: ${slide.background}`);
    if (bgCandidate || isColorDark(slide.background)) {
      parts.push("theme: dark");
    }
  }

  // --- FULL-IMAGE OVERRIDE ---
  // If a full-image candidate was detected, override the layout and render
  // the image as an <img> tag in @main instead of using CSS background.
  if (fullImageCandidate) {
    layout = LAYOUT.FULL_IMAGE;
    parts[0] = `layout: ${layout.spec}`;
    // Remove background/theme if they were set — not needed for full-image
    if (parts[1]?.startsWith("background:")) parts.splice(1, 1);
    if (parts[1] === "theme: dark") parts.splice(1, 1);
    parts.push("");
    parts.push(MARKDOWN_TAGS.MAIN);
    parts.push("");
    parts.push(formatImage(fullImageCandidate, deckName));
    return parts.join("\n");
  }

  // --- RENDER SECTIONS ---
  if (layout.type === LAYOUT.TITLE_SLIDE.type) {
    parts.push("");
    parts.push(MARKDOWN_TAGS.TITLE);
    parts.push("");
    parts.push(allElements.map((el) => formatSingleElement(el)).join(REGEX.DOUBLE_NEWLINE));
  } else if (layout.type === LAYOUT.HEADER_CONTENT.type) {
    const singleImage =
      bodyElements.length === 1 &&
      bodyElements[0].type === ELEMENT_TYPES.IMAGE &&
      bodyElements[0].ref;
    const hasBody = bodyElements.length > 0;
    parts.push("");
    if (isHeaderValid && hasBody) {
      parts.push(MARKDOWN_TAGS.HEADER);
      parts.push("");
      parts.push(formatTextElement(header.content));
      parts.push("");
    }
    parts.push(MARKDOWN_TAGS.MAIN);
    parts.push("");
    if (singleImage) {
      // Only omit dimensions for markdown images (no width/height properties).
      // Extracted PPTX images need explicit dimensions for the click/drag handler.
      const el = bodyElements[0];
      const hasExplicitDims = el.width && el.height;
      parts.push(formatImage(el, deckName, { omitDimensions: !hasExplicitDims }));
    } else if (hasBody) {
      parts.push(
        renderElementsWithFlex(
          bodyElements,
          slideWidth,
          slideHeight,
          deckName,
          formatSingleElement,
        ),
      );
    } else {
      // No distinct body — place header content in main area instead
      if (header) parts.push(formatTextElement(header.content));
    }
  } else if (layout.type === LAYOUT.TWO_COLUMN.type) {
    const leftEls = bodyElements.filter(
      (el) =>
        getOverlapArea(el, { left: 0, top: 0, width: midX, height: slideHeight }) >
        getOverlapArea(el, { left: midX, top: 0, width: midX, height: slideHeight }) * 1.5,
    );
    const rightEls = bodyElements.filter(
      (el) =>
        getOverlapArea(el, { left: midX, top: 0, width: midX, height: slideHeight }) >
        getOverlapArea(el, { left: 0, top: 0, width: midX, height: slideHeight }) * 1.5,
    );
    // If the position split leaves one side empty, this isn't really two-column.
    if (leftEls.length === 0 || rightEls.length === 0) {
      layout = LAYOUT.HEADER_CONTENT;
    } else {
      parts.push("");
      if (isHeaderValid) {
        parts.push(MARKDOWN_TAGS.HEADER);
        parts.push("");
        parts.push(formatTextElement(header.content));
        parts.push("");
      }
      parts.push(MARKDOWN_TAGS.MAIN);
      parts.push("");
      parts.push(
        renderElementsWithFlex(leftEls, slideWidth, slideHeight, deckName, formatSingleElement),
      );
      parts.push("");
      parts.push(MARKDOWN_TAGS.MEDIA);
      parts.push("");
      parts.push(rightEls.map((el) => formatSingleElement(el)).join(REGEX.DOUBLE_NEWLINE));
    }
  } else if (layout.type === LAYOUT.MEDIA_SPAN.type) {
    parts.push("");
    if (isHeaderValid) {
      parts.push(MARKDOWN_TAGS.HEADER);
      parts.push("");
      parts.push(formatTextElement(header.content));
      parts.push("");
    }
    const leftEls = bodyElements.filter(
      (el) =>
        getOverlapArea(el, { left: 0, top: 0, width: midX, height: slideHeight }) >
        getOverlapArea(el, { left: midX, top: 0, width: midX, height: slideHeight }) * 1.5,
    );
    const rightEls = bodyElements.filter(
      (el) =>
        getOverlapArea(el, { left: midX, top: 0, width: midX, height: slideHeight }) >
        getOverlapArea(el, { left: 0, top: 0, width: midX, height: slideHeight }) * 1.5,
    );
    // Wide elements that span the midpoint fail both 1.5x thresholds.
    // Default them to the left (main) column so they aren't silently dropped.
    const captured = new Set([...leftEls, ...rightEls]);
    const unclassified = bodyElements.filter((el) => !captured.has(el));
    leftEls.push(...unclassified);
    parts.push(MARKDOWN_TAGS.MAIN);
    parts.push("");
    parts.push(
      renderElementsWithFlex(leftEls, slideWidth, slideHeight, deckName, formatSingleElement),
    );
    parts.push("");
    parts.push(MARKDOWN_TAGS.MEDIA);
    parts.push("");
    if (rightEls.length === 1 && rightEls[0].type === ELEMENT_TYPES.IMAGE && rightEls[0].ref) {
      parts.push(formatImage(rightEls[0], deckName, { fitColumn: true }));
    } else {
      parts.push(rightEls.map((el) => formatSingleElement(el)).join(REGEX.DOUBLE_NEWLINE));
    }
  } else if (layout.type === LAYOUT.THREE_COLUMN.type) {
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
      parts.push(
        renderElementsWithFlex(
          bodyElements,
          slideWidth,
          slideHeight,
          deckName,
          formatSingleElement,
        ),
      );
      return wrapLongLists(parts.join("\n"));
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
    parts.push(
      renderElementsWithFlex(mainEls, slideWidth, slideHeight, deckName, formatSingleElement),
    );
    parts.push("");
    parts.push(MARKDOWN_TAGS.MEDIA);
    parts.push("");
    parts.push(formatSingleElement(mediaImage));
    parts.push("");
    parts.push(MARKDOWN_TAGS.SECONDARY);
    parts.push("");
    parts.push(formatSingleElement(secondaryImage));
  } else if (layout.type === LAYOUT.FOCUS.type) {
    // Focus layout: content-first, center stage — all elements in @main
    parts.push("");
    parts.push(MARKDOWN_TAGS.MAIN);
    parts.push("");
    parts.push(
      renderElementsWithFlex(allElements, slideWidth, slideHeight, deckName, formatSingleElement),
    );
  } else {
    parts.push("");
    parts.push(MARKDOWN_TAGS.MAIN);
    parts.push("");
    parts.push(
      renderElementsWithFlex(allElements, slideWidth, slideHeight, deckName, formatSingleElement),
    );
  }

  // If two-column was downgraded to header-content, render it now
  if (
    layout.type === LAYOUT.HEADER_CONTENT.type &&
    parts.length > 0 &&
    !parts.includes(MARKDOWN_TAGS.MAIN)
  ) {
    const { header, isHeaderValid, bodyElements } = extractHeader(
      textElements,
      allElements,
      slideHeight,
      false,
    );
    const singleImage =
      bodyElements.length === 1 &&
      bodyElements[0].type === ELEMENT_TYPES.IMAGE &&
      bodyElements[0].ref;
    if (isHeaderValid) {
      parts.push(MARKDOWN_TAGS.HEADER);
      parts.push("");
      parts.push(formatTextElement(header.content));
      parts.push("");
    }
    parts.push(MARKDOWN_TAGS.MAIN);
    parts.push("");
    if (singleImage) {
      const el = bodyElements[0];
      const hasExplicitDims = el.width && el.height;
      parts.push(formatImage(el, deckName, { omitDimensions: !hasExplicitDims }));
    } else {
      parts.push(
        renderElementsWithFlex(
          bodyElements,
          slideWidth,
          slideHeight,
          deckName,
          formatSingleElement,
        ),
      );
    }
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

  return wrapLongLists(parts.join("\n"));
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
 * @param {boolean} [hasMedia=false]
 * @param {import('./pptx-extractor.js').ExtractedElement[]} [allEls=textEls]
 * @param {import('./pptx-extractor.js').ExtractedElement[]} [dominantImages]
 * @param {number} [slideIndex=0]
 * @returns {{ type: string, spec: string }}
 */
function inferLayout(
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
      const isFirstSlide = slideIndex === 0;
      const looksLikeCode = contentEls.some((el) => {
        const text = el.content?.trim() || "";
        // Detect fenced code blocks
        if (/```[\s\S]*```/.test(text)) return true;
        const lines = text.split("\n");
        if (lines.length < 2) return false;
        const codeKeywords =
          /^\s*(def\s+\w|function\s+\w|class\s+\w|const\s+\w|let\s+\w|var\s+\w|import\s+[\w{#]|#include|for\s*\(|while\s*\(|if\s*\(|else\s|elif\s|return\s|try\s|catch\s|from\s+\w|async\s|await\s|void\s+\w|null\b|undefined\b|this\.|self\.|console\.|print\(|echo\s|\/\/|<!--)/;
        return lines.some((l) => codeKeywords.test(l));
      });
      if (looksLikeCode && !isFirstSlide) return LAYOUT.FOCUS;
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

  const hasSubstantialBody = bodyRichEls.length > 0 || bodyLength > CONFIG.minSubstantialBodyLength;

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

function findDominantImages(allEls, slideWidth, slideHeight) {
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
 * Group body elements into horizontal flex rows based on vertical proximity.
 * Elements with similar `top` positions that are horizontally separated
 * are grouped into rows that should be rendered side-by-side.
 *
 * @param {import('./pptx-extractor.js').ExtractedElement[]} elements
 * @param {number} slideWidth
 * @param {number} slideHeight
 * @returns {{ rows: Array<Array<import('./pptx-extractor.js').ExtractedElement[]>>, standalone: import('./pptx-extractor.js').ExtractedElement[] }}
 *   rows[i][j] is the j-th flex item (possibly multiple stacked elements) in row i.
 *   standalone are elements not part of any multi-item row.
 */
function groupIntoFlexRows(elements, slideWidth, slideHeight) {
  if (elements.length < 2) return { rows: [], standalone: [...elements] };

  const verticalTolerance = slideHeight * CONFIG.flexRowVerticalTolerance;
  const minGap = slideWidth * CONFIG.flexRowMinHorizontalGap;

  const sorted = [...elements].sort((a, b) => (a.top || 0) - (b.top || 0));

  const groups = [];
  let currentGroup = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const el = sorted[i];
    const groupCenter =
      currentGroup.reduce((sum, e) => sum + (e.top || 0), 0) / currentGroup.length;
    if (Math.abs((el.top || 0) - groupCenter) <= verticalTolerance) {
      currentGroup.push(el);
    } else {
      groups.push(currentGroup);
      currentGroup = [el];
    }
  }
  groups.push(currentGroup);

  const rows = [];
  const standalone = [];

  for (const group of groups) {
    if (group.length < 2) {
      standalone.push(...group);
      continue;
    }

    const hasImage = group.some((el) => el.type === ELEMENT_TYPES.IMAGE);
    const hasNonImage = group.some((el) => el.type !== ELEMENT_TYPES.IMAGE);
    if (!hasImage || !hasNonImage) {
      standalone.push(...group);
      continue;
    }

    const sortedByLeft = [...group].sort((a, b) => (a.left || 0) - (b.left || 0));

    let hasHorizontalGap = false;
    for (let i = 1; i < sortedByLeft.length; i++) {
      const prevRight = (sortedByLeft[i - 1].left || 0) + (sortedByLeft[i - 1].width || 0);
      const currLeft = sortedByLeft[i].left || 0;
      if (currLeft - prevRight >= minGap) {
        hasHorizontalGap = true;
        break;
      }
    }

    if (hasHorizontalGap) {
      rows.push(sortedByLeft.map((el) => [el]));
    } else {
      standalone.push(...group);
    }
  }

  return { rows, standalone };
}

/**
 * Render a single flex row as an HTML div with flex layout.
 * @param {Array<Array<import('./pptx-extractor.js').ExtractedElement>>} items - Each item is an array of stacked elements.
 * @param {string} deckName
 * @param {(el: import('./pptx-extractor.js').ExtractedElement) => string} formatSingleElement
 * @returns {string}
 */
function renderFlexRow(items, deckName, formatSingleElement) {
  const flexItems = items
    .map((stack) => {
      const content = stack.map((el) => formatSingleElement(el)).join("\n");
      return `<div style="flex: 1; min-width: 0;">${content}</div>`;
    })
    .join("\n");
  return `<div class="flex-row" style="display: flex; gap: 1em; align-items: start;">\n${flexItems}\n</div>`;
}

/**
 * Render a list of elements, wrapping horizontally adjacent groups in flex rows.
 * @param {import('./pptx-extractor.js').ExtractedElement[]} elements
 * @param {number} slideWidth
 * @param {number} slideHeight
 * @param {string} deckName
 * @param {(el: import('./pptx-extractor.js').ExtractedElement) => string} formatSingleElement
 * @returns {string}
 */
function renderElementsWithFlex(elements, slideWidth, slideHeight, deckName, formatSingleElement) {
  const { rows } = groupIntoFlexRows(elements, slideWidth, slideHeight);

  if (rows.length === 0) {
    return elements.map((el) => formatSingleElement(el)).join(REGEX.DOUBLE_NEWLINE);
  }

  const rendered = new Set();
  const parts = [];

  const sorted = [...elements].sort((a, b) => (a.top || 0) - (b.top || 0));

  for (const el of sorted) {
    if (rendered.has(el)) continue;

    const matchingRow = rows.find((row) => row.some((item) => item.some((e) => e === el)));
    if (matchingRow) {
      for (const item of matchingRow) {
        for (const e of item) rendered.add(e);
      }
      parts.push(renderFlexRow(matchingRow, deckName, formatSingleElement));
    } else {
      rendered.add(el);
      parts.push(formatSingleElement(el));
    }
  }

  return parts.join(REGEX.DOUBLE_NEWLINE);
}

function hexToLuminance(hex) {
  if (!hex || hex.length < LUMINANCE.HEX_MIN_LENGTH) return Infinity;
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return Infinity;
  return (
    (r * LUMINANCE.RED_COEFF + g * LUMINANCE.GREEN_COEFF + b * LUMINANCE.BLUE_COEFF) /
    LUMINANCE.SCALE_DIVISOR
  );
}

/**
 * Whitelist-safe CSS color sanitizer for untrusted PPTX fill colors.
 * Allows only hex colors, rgb()/rgba(), and named keyword colors that
 * are known-safe (transparent, white, black, etc.).
 * Returns "transparent" for anything that doesn't match.
 *
 * @param {string} color
 * @returns {string}
 */
function sanitizeCssColor(color) {
  if (!color || typeof color !== "string") return "transparent";
  let trimmed = color.trim();

  // Normalize hex colors without # prefix (common in PPTX: "003C68" → "#003C68")
  if (/^[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?$/.test(trimmed)) {
    trimmed = `#${trimmed}`;
  }

  // Named keywords we allow (non-exhaustive, safe list)
  const SAFE_KEYWORDS =
    /^(?:transparent|white|black|red|green|blue|yellow|gray|grey|orange|purple|pink|brown|cyan|magenta)$/i;
  if (SAFE_KEYWORDS.test(trimmed)) return trimmed;
  // Hex color: #RGB, #RRGGBB, #RRGGBBAA
  if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?$/.test(trimmed)) return trimmed;
  // rgb()/rgba() with comma-separated or space-separated values
  if (
    /^rgba?\s*\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i.test(
      trimmed,
    )
  )
    return trimmed;
  // rgb()/rgba() with space-separated values and optional alpha (e.g. rgb(255 0 0 / 0.5))
  if (
    /^rgba?\s*\(\s*\d{1,3}\s+[\d.]+%?\s+[\d.]+%?\s*(?:\/\s*(?:0|1|0?\.\d+)%?\s*)?\)$/i.test(trimmed)
  )
    return trimmed;
  return "transparent";
}

function isColorDark(colorHex) {
  if (!colorHex) return false;

  // Handle gradients: extract all hex colors, pick darkest
  if (!colorHex.startsWith("#")) {
    const matches = colorHex.match(/#[0-9a-fA-F]{6}/g);
    if (!matches) return false;
    // Find the color with lowest luminance (darkest)
    let darkestLum = Infinity;
    for (const m of matches) {
      const lum = hexToLuminance(m.replace("#", ""));
      if (lum < darkestLum) darkestLum = lum;
    }
    return darkestLum < LUMINANCE.DARK_THRESHOLD;
  }

  const hex = colorHex.replace("#", "");
  return hexToLuminance(hex) < LUMINANCE.DARK_THRESHOLD;
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

    const isProperBullet = /^(\s*[-*•])\s+\S/.test(trimmed) && !/^(\s*[-*•]\s*){2,}/.test(trimmed);
    const isNumberedList = /^\s*\d+[.)]\s+\S/.test(trimmed);

    if (isProperBullet || isNumberedList) {
      result.push(line);
    } else if (REGEX.BULLET.test(trimmed)) {
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

/**
 * Wrap consecutive list runs of MIN_LIST_ITEMS or more in a
 * <div class="multi-column-list"> so CSS columns split them visually.
 * Counts all items including nested sub-items towards the threshold.
 * Merges list runs separated by ≤MAX_GAP non-list lines.
 */
const MIN_LIST_ITEMS = 10;
const COL3_THRESHOLD = 27;
const MAX_GAP = 3;
const RE_ANY_LIST_ITEM = /^\s*(?:[-*•]|\d+[.)]|[a-z][.)])\s+\S/;
const AREA_MARKERS = new Set(Object.values(MARKDOWN_TAGS));

function wrapLongLists(markdown) {
  const lines = markdown.split("\n");
  const result = [];
  let i = 0;

  while (i < lines.length) {
    if (RE_ANY_LIST_ITEM.test(lines[i])) {
      // Collect a "group": list run + small gap + more list items, etc.
      const groupStart = i;
      let itemCount = 0;
      let gapLines = [];

      while (i < lines.length) {
        if (RE_ANY_LIST_ITEM.test(lines[i])) {
          // Flush any buffered gap — if it contains list-like items, merge
          if (gapLines.length > 0) {
            itemCount += gapLines.filter((l) => RE_ANY_LIST_ITEM.test(l)).length;
            gapLines = [];
          }
          itemCount++;
          i++;
        } else if (AREA_MARKERS.has(lines[i].trim())) {
          break;
        } else if (gapLines.length < MAX_GAP) {
          gapLines.push(lines[i]);
          i++;
        } else {
          break;
        }
      }

      // Check if there are list items right after the gap we stopped at
      // (the gap exceeded MAX_GAP, but the next run might still be close)
      if (gapLines.length > MAX_GAP) {
        // Rewind: put back the non-list lines that exceeded the gap
        const overshoot = gapLines.length - MAX_GAP;
        i -= overshoot;
        gapLines.length = MAX_GAP;
      }

      if (itemCount >= MIN_LIST_ITEMS) {
        const cols = itemCount >= COL3_THRESHOLD ? 3 : 2;
        result.push(`<div class="multi-column-list" style="column-count: ${cols};">`);
        result.push("");
        for (let j = groupStart; j < i; j++) result.push(lines[j]);
        result.push("");
        result.push("</div>");
      } else {
        for (let j = groupStart; j < i; j++) result.push(lines[j]);
      }
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  return result.join("\n");
}

function formatImage(
  img,
  _deckName = DEFAULTS.DECK_NAME,
  { omitDimensions = false, fitColumn = false, caption } = {},
) {
  const rawName = (img.ref || DEFAULTS.IMAGE_FILENAME).split("/").pop();
  const filename = rawName.replace(REGEX.IMAGE_VECTOR_EXT, DEFAULTS.IMAGE_MIME_PNG);

  const src = img.blob || `${DEFAULTS.IMAGE_SUBDIR}${filename}`;
  // Generate readable alt text from filename (e.g. "image1" -> "Slide image 1")
  const baseAlt = filename
    .replace(REGEX.FILE_EXTENSION, "")
    .replace(REGEX.HYPHEN_UNDERSCORE, " ")
    .replace(/(\d+)/g, " $1")
    .trim();
  const altText = caption || `Slide image ${baseAlt}`;

  const style = fitColumn ? ' style="width: 100%; height: auto;"' : "";

  if (!omitDimensions) {
    // Image dimensions are in points (normalised by emuToPoints); convert to pixels.
    const w = Math.round(img.width * CONVERSION.POINTS_TO_PX) || null;
    const h = Math.round(img.height * CONVERSION.POINTS_TO_PX) || null;
    if (w && h) {
      return `<img src="${src}" width="${w}" height="${h}" alt="${altText}"${style}>`;
    }
  }
  return `<img src="${src}" alt="${altText}"${style}>`;
}

function formatTable(table, slideWidth, slideHeight) {
  if (!table.rows?.length) return "";

  // Full-page tables (covering ≥80% of the slide) are visual layouts
  // (e.g., four-pillar grids, flowchart matrices). Render as CSS grid
  // to preserve the 2D visual structure.
  const tableArea = (table.width || 0) * (table.height || 0);
  const slideArea = (slideWidth || 960) * (slideHeight || 540);
  const isFullScreen = tableArea >= slideArea * CONFIG.fullScreenTableThreshold;

  if (isFullScreen) {
    const cols = table.rows[0].length;
    const rows = table.rows.length;
    const cells = [];
    for (const row of table.rows) {
      for (const cell of row) {
        // Strip HTML tags then escape to prevent XSS from entity-decoded content
        const text = escapeHtml(stripHtml(cell.text || "").trim());
        const bg = sanitizeCssColor(cell.fillColor);
        const isDarkBg = isColorDark(bg);
        cells.push(
          `<div class="fullpage-grid__cell${isDarkBg ? " fullpage-grid__cell--on-color" : ""}" style="background:${bg}">${text}</div>`,
        );
      }
    }
    return `<div class="fullpage-grid" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr)">${cells.join("")}</div>`;
  }

  const escapeCell = (text) =>
    (text || "")
      .replace(REGEX.NEWLINE_CRLF, "\n")
      .replace(REGEX.NEWLINE, "<br>")
      .replace(REGEX.PIPE, REGEX.ESCAPE_PIPE)
      .trim();
  const formatRow = (row) => row.map((cell) => escapeCell(cell.text)).join(" | ");
  const separator = table.rows[0].map(() => "---").join(" | ");
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

  // Emit a marker that AI post-processing can replace with Mermaid.
  // If no AI mode is selected, the marker is converted back to bullets at import time.
  return `[Diagram: ${items.join(", ")}]`;
}
