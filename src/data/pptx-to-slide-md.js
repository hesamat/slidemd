/**
 * PptxToSlideMd
 *
 * Rule-based converter: transforms an ExtractionResult (from PptxExtractor)
 * directly into SlideMD markdown. Uses element positions and
 * sizes to infer layouts deterministically.
 *
 * @class
 */
import { isColorDark } from "./pptx-color-utils.js";
import {
  formatTextElement,
  wrapLongLists,
  formatImage,
  formatTable,
  formatChart,
  formatDiagram,
} from "./pptx-element-formatters.js";
import {
  getOverlapArea,
  filterMeaningfulElements,
  findDominantImages,
  inferLayout,
} from "./pptx-layout-inference.js";
import {
  LAYOUT,
  CONVERSION,
  DEFAULT_SLIDE_SIZE,
  DEFAULTS,
  ELEMENT_TYPES,
  MARKDOWN_TAGS,
  REGEX,
  CONFIG,
} from "./pptx-slide-config.js";

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
  // Exception: single wide code elements that span the slide — keep TWO_COLUMN
  // so the rendering can split them at the midpoint.
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
      // Keep TWO_COLUMN if there's a single wide element (merged code from PPTX)
      const hasWideElement = bodyElements.some((el) => (el.width || 0) > slideWidth * 0.8);
      if (!(bodyElements.length === 1 && hasWideElement)) {
        layout = LAYOUT.HEADER_CONTENT;
      }
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
    // If the position split leaves one side empty, check for a single wide element
    // that spans both columns (merged code from PPTX extraction). Split its content
    // at a safe boundary — not inside a fenced code block.
    if (leftEls.length === 0 || rightEls.length === 0) {
      const wideEl = bodyElements.find((el) => (el.width || 0) > slideWidth * 0.8);
      if (wideEl && bodyElements.length === 1) {
        const rawContent = wideEl.content || "";
        const lines = rawContent.split("\n");
        const mid = Math.ceil(lines.length / 2);

        // Find a safe split point: not inside a fenced code block (```).
        // Scan outward from mid to find the nearest blank line or fence boundary.
        let splitAt = mid;
        let inFence = false;
        for (let i = 0; i < lines.length; i++) {
          if (/^\s*```/.test(lines[i].trim())) inFence = !inFence;
        }
        // If mid is inside a fence, find the closing fence or next blank line
        inFence = false;
        for (let i = 0; i < mid; i++) {
          if (/^\s*```/.test(lines[i].trim())) inFence = !inFence;
        }
        if (inFence) {
          // Find the closing ``` after mid
          for (let i = mid; i < lines.length; i++) {
            if (/^\s*```/.test(lines[i].trim())) {
              splitAt = i + 1;
              break;
            }
          }
        }
        // Also prefer splitting at blank lines for cleaner output
        const searchRange = Math.min(lines.length, mid + 5);
        for (let i = mid; i < searchRange; i++) {
          if (lines[i].trim() === "") {
            splitAt = i + 1;
            break;
          }
        }

        const leftContent = lines.slice(0, splitAt).join("\n").trimEnd();
        const rightContent = lines.slice(splitAt).join("\n").trimStart();
        // If right side is empty after split, fall back to single-column rendering
        if (!rightContent) {
          // Replace the layout directive in parts (already pushed as two-column)
          const layoutIdx = parts.findIndex((p) => p.startsWith("layout:"));
          if (layoutIdx !== -1) parts[layoutIdx] = `layout: ${LAYOUT.HEADER_CONTENT.spec}`;
          parts.push("");
          if (isHeaderValid) {
            parts.push(MARKDOWN_TAGS.HEADER);
            parts.push("");
            parts.push(formatTextElement(header.content));
            parts.push("");
          }
          parts.push(MARKDOWN_TAGS.MAIN);
          parts.push("");
          parts.push(formatTextElement(leftContent));
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
          parts.push(formatTextElement(leftContent));
          parts.push("");
          parts.push(MARKDOWN_TAGS.MEDIA);
          parts.push("");
          parts.push(formatTextElement(rightContent));
        }
      } else {
        layout = LAYOUT.HEADER_CONTENT;
      }
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
