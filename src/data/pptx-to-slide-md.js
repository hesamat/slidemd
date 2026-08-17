/**
 * PptxToSlideMd
 *
 * Rule-based converter: transforms an ExtractionResult (from PptxExtractor)
 * directly into SlideMD markdown. Uses element positions and
 * sizes to infer layouts deterministically.
 *
 * Strategy and edge cases → docs/pptx-layout-detection.md
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
  formatElementFillBackground,
} from "./pptx-element-formatters.js";
import {
  getOverlapArea,
  filterMeaningfulElements,
  findDominantImages,
  inferLayout,
  partitionByAreaOverlap,
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
 * Rewrite the layout directive already pushed into parts, wherever it sits
 * (speaker notes may precede it). No-op when the directive has not been
 * pushed yet.
 * @param {string[]} parts
 * @param {{ spec: string }} layout
 */
function setLayoutDirective(parts, layout) {
  const idx = parts.findIndex((p) => p.startsWith("layout:"));
  if (idx !== -1) parts[idx] = `layout: ${layout.spec}`;
}

/**
 * Derive a CSS background-position for a full-slide background image from its
 * placement in the source slide. All element geometry and the slide size are
 * in points here (normalised by convertToSlideMd). Edges flush with the slide
 * anchor the image (left/right/top/bottom; 2% tolerance); an image flush on
 * both horizontal (or vertical) edges spans that dimension and centres there.
 * @param {import('./pptx-extractor.js').ExtractedElement} el
 * @param {number} slideWidth - Slide width in points.
 * @param {number} slideHeight - Slide height in points.
 * @returns {string}
 */
function cssBackgroundPosition(el, slideWidth, slideHeight) {
  const l = el.left || 0;
  const t = el.top || 0;
  const r = l + (el.width || 0);
  const b = t + (el.height || 0);
  const tol = Math.min(slideWidth, slideHeight) * 0.02;
  const xs = [];
  if (l <= tol) xs.push("left");
  if (r >= slideWidth - tol) xs.push("right");
  if (xs.length === 0) xs.push("center");
  const x = xs.length === 2 ? "center" : xs[0];
  const ys = [];
  if (t <= tol) ys.push("top");
  if (b >= slideHeight - tol) ys.push("bottom");
  if (ys.length === 0) ys.push("center");
  const y = ys.length === 2 ? "center" : ys[0];
  return x === "center" && y === "center" ? "center" : `${x} ${y}`;
}

/**
 * Estimate whether the body content of a slide overflows the vertical space
 * available to a single column. Line heights and the available area are
 * constants calibrated to the fixed 1920x1080 render geometry, so the result
 * does not depend on the source deck's page size. Long lines (body and
 * headings) are assumed to wrap. Only text elements are measured — tables,
 * charts, diagrams, and images size themselves.
 * @param {import('./pptx-extractor.js').ExtractedElement[]} bodyElements
 * @returns {boolean}
 */
function estimateBodyOverflow(bodyElements) {
  const available = CONFIG.overflowBodyAreaHeight;
  let required = 0;
  for (const el of bodyElements) {
    if (el.type !== ELEMENT_TYPES.TEXT || !el.content) continue;
    for (const line of el.content.split("\n")) {
      const t = line.trim();
      if (!t) {
        required += CONFIG.overflowLineHeightBlank;
      } else if (t === "```") {
        required += CONFIG.overflowLineHeightCode;
      } else if (/^#{1,3}\s/.test(t)) {
        const wrappedLines = Math.max(1, Math.ceil(line.length / CONFIG.overflowWrapLength));
        required += CONFIG.overflowLineHeightHeading * wrappedLines;
      } else {
        const wrappedLines = Math.max(1, Math.ceil(line.length / CONFIG.overflowWrapLength));
        required += CONFIG.overflowLineHeightBody * wrappedLines;
      }
    }
  }
  return required > available;
}

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
  // A full-height text panel (taller than the header limit) is only a header
  // when its stripped text is short — a tall panel with many lines of heading-
  // marked content (e.g. a 5-item criteria list) is body content, not a title.
  const isMassivePanel = (el) => (el.height || 0) > slideHeight * CONFIG.maxHeaderHeightRatio;
  const strippedLen = (el) =>
    (el.content || "")
      .replace(/<[^>]+>/g, "")
      .replace(/#{1,3}\s/g, "")
      .trim().length;

  // 1. Prefer explicit heading markers (## / ###) — always a header,
  //    unless the element is a massive panel with long content.
  // 2. Fallback: short text in the top portion of the slide
  let header =
    textElements.find(
      (el) =>
        isHeading(el) &&
        isShortEnough(el) &&
        !(isMassivePanel(el) && strippedLen(el) > CONFIG.maxHeaderLength),
    ) ||
    textElements.find(
      (el) =>
        el.top < slideHeight * CONFIG.bodyTopRatio &&
        isShortEnough(el) &&
        !(isMassivePanel(el) && strippedLen(el) > CONFIG.maxHeaderLength),
    ) ||
    null;

  if (!header) {
    return { header: null, isHeaderValid: false, bodyElements: allElements };
  }

  const headerText = header.content || "";
  const hasBullets = REGEX.BULLET_LINE.test(headerText);
  const hasNumbers = REGEX.NUMBER_LINE.test(headerText);
  const hasCodeBlock = REGEX.CODE_BLOCK.test(headerText);
  // When the header element starts with a heading marker but also contains
  // body content (bullets, numbers, code), split it: the heading portion
  // goes in @header, the rest becomes a synthetic body element for @main.
  // This handles PPTX text panels that combine a title with a bullet list.
  const firstLine = headerText.trim().split("\n")[0].trim();
  const startsWithHeading = REGEX.HEADING_MARKER.test(firstLine);
  let isHeaderValid = !hasBullets && !hasNumbers && !hasCodeBlock;
  let splitBody = null;
  // Keep a reference to the original element so it can be filtered out of
  // bodyElements even after `header` is reassigned to a split copy.
  const originalHeader = header;
  if (!isHeaderValid && startsWithHeading) {
    // Find where the heading ends (first blank line or first non-heading line)
    const lines = headerText.split("\n");
    let splitAt = 1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "") {
        splitAt = i + 1;
        break;
      }
      if (!REGEX.HEADING_MARKER.test(lines[i].trim())) {
        splitAt = i;
        break;
      }
      splitAt = i + 1;
    }
    const headingPart = lines.slice(0, splitAt).join("\n").trim();
    const bodyPart = lines.slice(splitAt).join("\n").trim();
    if (bodyPart) {
      header = { ...originalHeader, content: headingPart };
      splitBody = { ...originalHeader, content: bodyPart };
      isHeaderValid = true;
    }
  }
  const bodyElements = isHeaderValid
    ? [...allElements.filter((el) => el !== originalHeader), ...(splitBody ? [splitBody] : [])]
    : allElements;

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

  // Deduplicate identical images within a slide. PowerPoint authors paste the
  // same icon multiple times (e.g. one warning icon per error line) at slightly
  // different offsets; in the flow-based layouts those render as a stack of
  // identical images. Keep the first occurrence of each (ref, size) pair.
  {
    const seenImages = new Set();
    const deduped = [];
    for (const el of slide.elements) {
      if (el.type === ELEMENT_TYPES.IMAGE && el.ref) {
        const key = `${el.ref}|${el.width}|${el.height}`;
        if (seenImages.has(key)) continue;
        seenImages.add(key);
      }
      deduped.push(el);
    }
    slide = { ...slide, elements: deduped };
  }

  // Detect full-page background images BEFORE stripping images or filtering,
  // so they are always found regardless of the importImages setting.
  // Background images are always uploaded as files (never inlined as data URLs)
  // to keep the markdown lightweight.
  const slideArea = slideWidth * slideHeight;
  // When multiple images qualify as background (e.g. two full-slide photos
  // stacked in z-order), pick the LAST one — PowerPoint's element order is
  // back-to-front, so the last match is the visible (top) image.
  const bgCandidate = [...slide.elements].reverse().find((el) => {
    if (el.type !== ELEMENT_TYPES.IMAGE || !el.ref) return false;
    const imgArea = (el.width || 0) * (el.height || 0);
    // A header-like text panel beside the image means the image is body
    // content (header-content layout), not a background — regardless of
    // how large the image is. Check this before the area thresholds.
    // Only applies when the text panel has NO fill AND there is no other
    // filled panel on the slide — a filled panel is a content surface
    // (sidebar), and the image beside it is a background.
    const hasFilledPanel = slide.elements.some(
      (other) =>
        other !== el &&
        other.type === ELEMENT_TYPES.TEXT &&
        (other.fillRaw || other.fill) &&
        (other.content || "").trim(),
    );
    const hasHeaderPanel =
      !hasFilledPanel &&
      slide.elements.some((other) => {
        if (other === el || other.type !== ELEMENT_TYPES.TEXT) return false;
        if (other.fillRaw || other.fill) return false;
        // The panel must be a side panel (narrow, not full-width)
        if ((other.width || 0) >= slideWidth * 0.6) return false;
        const text = (other.content || "").trim();
        // Check only the first line — the panel may have a heading followed
        // by bullet points, but the heading is what makes it header-like.
        const firstLine = text.split("\n")[0].trim();
        if (!REGEX.HEADING_MARKER.test(firstLine) || firstLine.length > CONFIG.maxHeaderLength)
          return false;
        // The panel must not significantly overlap the image
        const overlap = getOverlapArea(other, el);
        const panelArea = (other.width || 0) * (other.height || 0);
        return panelArea > 0 && overlap / panelArea < 0.2;
      });
    if (hasHeaderPanel) return false;
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
    if (
      contentEls.some((cel) => {
        const overlap = getOverlapArea(el, cel);
        return overlap / imgArea > CONFIG.backgroundOverlapThreshold;
      })
    ) {
      return true;
    }
    // A large image with no content overlap is still a background when the
    // slide's content sits on a large filled backing panel on the opposite
    // side (e.g. a red sidebar panel on the left with a photo filling the
    // rest of the slide). The panel is the content surface; the photo is the
    // backdrop. Without a panel the image is a genuine media column and must
    // stay in @media.
    //
    // Exception: when the panel's text is header-like (short, carries a
    // heading marker), the panel is a title and the image is the body
    // content — not a background. The slide should use header-content with
    // the text in @header and the image in @main.
    const imgCenterX = (el.left || 0) + (el.width || 0) / 2;
    return slide.elements.some((other) => {
      if (other === el) return false;
      const isPanel =
        other.type === "shape"
          ? !(other.content || "").trim()
          : other.type === "text" &&
            !!(other.fillRaw || other.fill) &&
            !!(other.content || "").trim();
      if (!isPanel) return false;
      // Header-like panel → image is content, not background
      const panelText = (other.content || "").trim();
      if (REGEX.HEADING_MARKER.test(panelText) && panelText.length <= CONFIG.maxHeaderLength) {
        return false;
      }
      const w = other.width || 0;
      const h = other.height || 0;
      if (w * h < slideArea * 0.25) return false;
      const otherCenterX = (other.left || 0) + w / 2;
      return otherCenterX < imgCenterX !== imgCenterX < slideWidth / 2;
    });
  });

  // Detect full-image slides: single image covering > 50% with no content.
  // These use the full-image layout instead of a CSS background.
  // Footer text is excluded — it's decorative, not content.
  const fullImageThreshold = 0.5;
  let fullImageCandidate = null;
  if (bgCandidate) {
    const imgArea = (bgCandidate.width || 0) * (bgCandidate.height || 0);
    // Check if there are any non-image, non-footer elements besides the bgCandidate
    const hasNonImageContent = slide.elements.some(
      (el) =>
        el !== bgCandidate &&
        el.type !== ELEMENT_TYPES.IMAGE &&
        el.placeholderType !== ELEMENT_TYPES.FOOTER,
    );
    // Also check if there are other images besides the bgCandidate
    const hasOtherImages = slide.elements.some(
      (el) => el !== bgCandidate && el.type === ELEMENT_TYPES.IMAGE && el.ref,
    );
    if (imgArea >= slideArea * fullImageThreshold && !hasNonImageContent && !hasOtherImages) {
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
    const pos = cssBackgroundPosition(bgCandidate, slideWidth, slideHeight);
    // Background images keep their source box: a partial photo strip (e.g.
    // the right 75% of the slide) must render at its own size/position
    // (`contain`) instead of being zoomed to cover the whole slide. Only a
    // truly full-slide image uses `cover`.
    const wPct = Math.min(100, Math.round(((bgCandidate.width || 0) / slideWidth) * 100));
    const hPct = Math.min(100, Math.round(((bgCandidate.height || 0) / slideHeight) * 100));
    const isFullSlide = wPct >= 85 && hPct >= 85;
    const size = isFullSlide ? "cover" : "contain";
    // The dark scrim keeps light slide text readable over the photo. It is
    // sized to the image's box (position + width/height percentages) so a
    // partial background only darkens the photo, not the panels around it
    // (e.g. a red sidebar must stay bright). Full-slide images scrim the
    // whole slide.
    const scrim =
      CONFIG.bgScrimAlpha > 0
        ? isFullSlide
          ? `linear-gradient(rgba(0,0,0,${CONFIG.bgScrimAlpha}),rgba(0,0,0,${CONFIG.bgScrimAlpha})) ${pos} / cover, `
          : `linear-gradient(rgba(0,0,0,${CONFIG.bgScrimAlpha}),rgba(0,0,0,${CONFIG.bgScrimAlpha})) ${pos} / ${wPct}% ${hPct}%, `
        : "";
    slide.background = `${scrim}url(${DEFAULTS.IMAGE_SUBDIR}${filename}) ${pos} / ${size} no-repeat`;
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

  // Compute extractHeader once — reused by pre-check and all render branches.
  const { header, isHeaderValid, bodyElements } = extractHeader(
    textElements,
    allElements,
    slideHeight,
    false,
  );
  const midX = slideWidth / 2;
  const centerTol = slideWidth * CONFIG.centerToleranceRatio;

  // Overflow upgrade: a single-column slide whose body needs more vertical
  // space than the area provides is redistributed into two columns.
  // NOTE: only a single body element can be content-split (see the pre-check
  // and renderer below), so multi-element bodies that overflow are upgraded
  // and then downgraded back to header-content — the heuristic does not fix
  // multi-box overflow, it only avoids regressing it.
  const bodyOverflows = estimateBodyOverflow(bodyElements);
  // A table with 8+ rows is a splittable body — upgrade to two-column so
  // the table can be split at the row midpoint into side-by-side tables.
  const hasSplittableTableBody =
    bodyElements.length === 1 &&
    bodyElements[0].type === ELEMENT_TYPES.TABLE &&
    (bodyElements[0].rows?.length || 0) >= 8;
  if (
    (bodyOverflows || hasSplittableTableBody) &&
    bodyElements.length > 0 &&
    layout.type === LAYOUT.HEADER_CONTENT.type
  ) {
    layout = { type: LAYOUT.TWO_COLUMN.type, spec: LAYOUT.TWO_COLUMN.spec };
  }

  // Pre-check: if two-column split would leave one side empty, downgrade now
  // so the layout spec matches the actual rendered content.
  // Use 1.2x threshold (less aggressive than 1.5x) to avoid false positives
  // on centered or right-side elements.
  if (layout.type === LAYOUT.TWO_COLUMN.type) {
    const leftEls = bodyElements.filter(
      (el) =>
        getOverlapArea(el, { left: 0, top: 0, width: midX, height: slideHeight }) >
        getOverlapArea(el, { left: midX, top: 0, width: midX, height: slideHeight }) * 1.2,
    );
    const rightEls = bodyElements.filter(
      (el) =>
        getOverlapArea(el, { left: midX, top: 0, width: midX, height: slideHeight }) >
        getOverlapArea(el, { left: 0, top: 0, width: midX, height: slideHeight }) * 1.2,
    );
    // Catch unclassified elements that straddle the midpoint — assign to
    // the column whose center is closer.  Without this, a wide image that
    // spans both columns causes a false downgrade to header-content.
    const classified = new Set([...leftEls, ...rightEls]);
    for (const el of bodyElements) {
      if (classified.has(el)) continue;
      const elCenterX = (el.left || 0) + (el.width || 0) / 2;
      if (elCenterX < midX) leftEls.push(el);
      else rightEls.push(el);
    }
    if (leftEls.length === 0 || rightEls.length === 0) {
      // Keep TWO_COLUMN if there's a single element that can be content-split:
      // a wide element (merged code from PPTX), an overflowing body, or a
      // table with 8+ rows that can be split at the row midpoint.
      const hasWideElement = bodyElements.some((el) => (el.width || 0) > slideWidth * 0.8);
      const hasSplittableTable =
        bodyElements.length === 1 &&
        bodyElements[0].type === ELEMENT_TYPES.TABLE &&
        (bodyElements[0].rows?.length || 0) >= 8;
      if (!(bodyElements.length === 1 && (hasWideElement || bodyOverflows || hasSplittableTable))) {
        layout = LAYOUT.HEADER_CONTENT;
      }
    }
  }

  // Pick the media-span variant from the media-only column — the column that
  // holds dominant images and no body text — so the rendered media column
  // matches the source slide (image-left slides keep the image on the left).
  // The text column may itself contain a dominant image (e.g. an illustration
  // beside the body), so the first dominant image is not a reliable signal.
  // Centered elements and the header are excluded from the TEXT partition
  // (mirroring inferLayout); images are partitioned with the bare area rule,
  // consistent with the @media population below. When no column qualifies,
  // default to the right — the historical behavior.
  if (layout.type === LAYOUT.MEDIA_SPAN.type) {
    const isTextLike = (el) =>
      (el.type === ELEMENT_TYPES.TEXT && el.content?.trim()) ||
      [ELEMENT_TYPES.TABLE, ELEMENT_TYPES.CHART, ELEMENT_TYPES.DIAGRAM].includes(el.type);
    const isBodyElement = (el) => {
      if (Math.abs((el.left || 0) + (el.width || 0) / 2 - midX) < centerTol) return false;
      if (header && el === header) return false;
      return true;
    };
    const onSide = (side) => (el) => partitionByAreaOverlap(el, slideWidth, slideHeight) === side;
    const leftHasText = bodyElements.some(
      (el) => isTextLike(el) && isBodyElement(el) && onSide("left")(el),
    );
    const rightHasText = bodyElements.some(
      (el) => isTextLike(el) && isBodyElement(el) && onSide("right")(el),
    );
    const leftHasDominant = dominantImages.some(onSide("left"));
    const rightHasDominant = dominantImages.some(onSide("right"));
    if (!leftHasText && leftHasDominant) {
      layout = LAYOUT.MEDIA_SPAN_LEFT;
    } else if (!rightHasText && rightHasDominant) {
      layout = LAYOUT.MEDIA_SPAN_RIGHT;
    } else {
      layout = LAYOUT.MEDIA_SPAN_RIGHT; // default: historical behavior
    }
  }

  // area-bg-*: a filled backing panel (a shape with no text) covering a large
  // part of the main/media region becomes that region's background, so colored
  // cards and sidebars survive the conversion. Coloured header bands are
  // deliberately ignored: the app's header area is padded and fixed-height,
  // so it cannot reproduce a full-bleed variable-height title bar.
  // Edge sidebar panels are injected into the slide's `background:` directive
  // (not `area-bg-main:`) because the @main area is inset by grid gutters and
  // cannot reach the slide's edge where the original sidebar was.
  // Computed before the theme directive — a dark area-bg also flips the slide
  // to dark (light text must stay readable on the dark panel).
  const areaBg = {};
  let slidePanelBg = null; // edge panel color, prepended to slide.background
  if (layout.type !== LAYOUT.TITLE_SLIDE.type) {
    const mediaSide =
      layout.type === LAYOUT.MEDIA_SPAN.type
        ? layout.spec === LAYOUT.MEDIA_SPAN_LEFT.spec
          ? "left"
          : "right"
        : layout.type === LAYOUT.TWO_COLUMN.type
          ? "right"
          : null;
    const bodyTop = slideHeight * CONFIG.bodyTopRatio;
    for (const el of slide.elements) {
      // Backing panels are bare shapes, OR text placeholders whose fill IS
      // the panel (PowerPoint fills the title/content placeholders with a
      // translucent colour instead of drawing a separate rectangle). Shapes
      // that carry text are diagram labels, not panels.
      const isPanel =
        el.type === "shape"
          ? !(el.content || "").trim()
          : el.type === "text" && !!(el.fillRaw || el.fill) && !!(el.content || "").trim();
      if (!isPanel) continue;
      if (el === bgCandidate) continue;
      // Header-like panel text → the panel is a title, not a backing
      // panel. Don't emit its fill as an area-bg or edge sidebar.
      // Check only the first line — the panel may have a heading followed
      // by bullets, but the heading is what makes it header-like.
      const panelText = (el.content || "").trim();
      const panelFirstLine = panelText.split("\n")[0].trim();
      if (
        REGEX.HEADING_MARKER.test(panelFirstLine) &&
        panelFirstLine.length <= CONFIG.maxHeaderLength
      ) {
        continue;
      }
      const w = el.width || 0;
      const h = el.height || 0;
      // Full-height panels are significant even when narrow (a translucent
      // content card covering 20% of the slide width but the full height
      // is still the content surface). Use a lower area threshold for them.
      const isFullHeight = h >= slideHeight * 0.85;
      const minArea = isFullHeight ? slideArea * 0.15 : slideArea * 0.25;
      if (w * h < minArea) continue;
      const css = formatElementFillBackground(el);
      if (!css || css === "transparent") continue;
      const centerX = (el.left || 0) + w / 2;
      const centerY = (el.top || 0) + h / 2;
      if (centerY < bodyTop) continue;
      // A panel flush to an edge and narrower than ~40% of the slide is a
      // sidebar. Paint it as a slide-level background layer (hard-stop
      // gradient positioned relative to the slide) so it reaches the slide
      // edge, which the @main area cannot do because of grid gutters.
      const isEdgePanel =
        (el.left || 0) <= slideWidth * 0.02 || (el.left || 0) + w >= slideWidth * 0.98;
      if (w < slideWidth * 0.4 && isEdgePanel) {
        const start = Math.max(0, Math.round(((el.left || 0) / slideWidth) * 1000) / 10);
        const end = Math.min(100, Math.round((((el.left || 0) + w) / slideWidth) * 1000) / 10);
        const before = start > 0 ? `transparent 0%, transparent ${start}%, ` : "";
        const after = end < 100 ? `, transparent ${end}%, transparent 100%` : "";
        slidePanelBg = `linear-gradient(90deg, ${before}${css} ${start}%, ${css} ${end}%${after})`;
        continue;
      }
      if (mediaSide === "left" && centerX < midX) {
        areaBg.media = css;
      } else if (mediaSide === "right" && centerX >= midX) {
        areaBg.media = css;
      } else {
        areaBg.main = css;
      }
    }
  }

  // Prepend edge panel color to the slide background so it paints at the
  // slide level (reaching the slide edge), on top of the scrim and photo.
  if (slidePanelBg) {
    slide.background = slide.background ? `${slidePanelBg}, ${slide.background}` : slidePanelBg;
  }

  parts.push(`layout: ${layout.spec}`);

  if (slide.background) {
    parts.push(`background: ${slide.background}`);
  }
  // Dark theme whenever the slide needs light text: a dark photo background,
  // a dark area-bg panel, or a dark edge sidebar (light text must stay
  // readable on the panel). Evaluated even without a `background:` directive
  // — an area-bg panel can be the only dark surface on the slide.
  // Exception: when area-bg-main is light, the main content needs dark text
  // to be readable on the light panel — don't force theme: dark even if the
  // slide background is dark. The header may be less readable, but the main
  // content (the bulk of the slide) takes priority.
  const hasLightMain = areaBg.main && !isColorDark(areaBg.main);
  if (
    !hasLightMain &&
    (bgCandidate ||
      isColorDark(slide.background) ||
      Object.values(areaBg).some(isColorDark) ||
      (slidePanelBg && isColorDark(slidePanelBg)))
  ) {
    parts.push("theme: dark");
  }

  // --- FULL-IMAGE OVERRIDE ---
  // If a full-image candidate was detected, override the layout and render
  // the image as an <img> tag in @main instead of using CSS background.
  if (fullImageCandidate) {
    layout = LAYOUT.FULL_IMAGE;
    setLayoutDirective(parts, layout);
    // Remove background/theme if they were set — not needed for full-image.
    // Locate them by content: speaker notes may precede the directives.
    const bgIdx = parts.findIndex((p) => p.startsWith("background:"));
    if (bgIdx !== -1) parts.splice(bgIdx, 1);
    const themeIdx = parts.findIndex((p) => p === "theme: dark");
    if (themeIdx !== -1) parts.splice(themeIdx, 1);
    parts.push("");
    parts.push(MARKDOWN_TAGS.MAIN);
    parts.push("");
    parts.push(formatImage(fullImageCandidate, deckName));
    return parts.join("\n");
  }

  // --- media-full-bleed ---
  // The app supports `media-full-bleed:` (edge-to-edge media column). Emit it
  // when the source slide's media column is genuinely edge-to-edge, so
  // media-span slides keep their full-height edge image. The directive is
  // only pushed once the final layout is known: the media-span render branch
  // can downgrade to header-content (empty @main) below, which would leave a
  // media directive in the markdown for a layout that has no media area.
  const directiveIndex = parts.length;
  let mediaFullBleed = false;
  if (layout.type === LAYOUT.MEDIA_SPAN.type) {
    const mediaSide = layout.spec === LAYOUT.MEDIA_SPAN_LEFT.spec ? "left" : "right";
    // Mirror the @media population exactly (see the media-span render branch)
    // so full-bleed is judged from the image that actually lands in @media.
    let mediaEls = dominantImages.filter(
      (el) => partitionByAreaOverlap(el, slideWidth, slideHeight) === mediaSide,
    );
    if (mediaEls.length === 0) {
      mediaEls = dominantImages.filter(
        (el) => bodyElements.includes(el) || el === dominantImages[0],
      );
    }
    const mediaImage = mediaEls[0] || null;
    // Full-bleed: the @media image touches the slide's outer edge and spans
    // (nearly) the full height, so the source column is edge-to-edge. A
    // single image is required — the render branch only applies the fill
    // styles to a lone media image, so a multi-image media column would
    // carry a directive with no visual effect.
    if (mediaEls.length === 1 && mediaImage.type === ELEMENT_TYPES.IMAGE) {
      const l = mediaImage.left || 0;
      const w = mediaImage.width || 0;
      const h = mediaImage.height || 0;
      const touchesOuterEdge = mediaSide === "left" ? l <= 2 : l + w >= slideWidth - 2;
      if (touchesOuterEdge && h >= slideHeight * 0.95) {
        mediaFullBleed = true;
      }
    }
  }

  // --- RENDER SECTIONS ---
  // INVARIANT: every branch below pushes an area marker (usually @main) or
  // returns early. There is no late fallback anymore — a future downgrade
  // added after the dispatch must render its content inline itself.
  if (layout.type === LAYOUT.TITLE_SLIDE.type) {
    parts.push("");
    parts.push(MARKDOWN_TAGS.TITLE);
    parts.push("");
    parts.push(allElements.map((el) => formatSingleElement(el)).join(REGEX.DOUBLE_NEWLINE));
  } else if (layout.type === LAYOUT.HEADER_CONTENT.type) {
    // No valid header → downgrade to focus so the layout name matches the
    // actual render (everything in @main, no @header area).
    if (!isHeaderValid || !header) {
      layout = LAYOUT.FOCUS;
      setLayoutDirective(parts, layout);
    }
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
      // fitColumn adds object-fit: contain so the image scales without stretching.
      const el = bodyElements[0];
      const hasExplicitDims = el.width && el.height;
      parts.push(formatImage(el, deckName, { omitDimensions: !hasExplicitDims, fitColumn: true }));
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
        getOverlapArea(el, { left: midX, top: 0, width: midX, height: slideHeight }) * 1.2,
    );
    const rightEls = bodyElements.filter(
      (el) =>
        getOverlapArea(el, { left: midX, top: 0, width: midX, height: slideHeight }) >
        getOverlapArea(el, { left: 0, top: 0, width: midX, height: slideHeight }) * 1.2,
    );

    // Catch unclassified elements (e.g. an image straddling the midpoint)
    // that don't clear the 1.2x threshold for either side. Assign to the
    // column whose center is closer to the element's center.
    const classified = new Set([...leftEls, ...rightEls]);
    for (const el of bodyElements) {
      if (classified.has(el)) continue;
      const elCenterX = (el.left || 0) + (el.width || 0) / 2;
      if (elCenterX < midX) leftEls.push(el);
      else rightEls.push(el);
    }
    // If the position split leaves one side empty, check for a single element
    // that spans both columns (merged code from PPTX extraction) or overflows
    // the column area. Split its content at a safe boundary — not inside a
    // fenced code block.
    if (leftEls.length === 0 || rightEls.length === 0) {
      const wideEl = bodyElements.find((el) => (el.width || 0) > slideWidth * 0.8);
      // A single TEXT element can be content-split at line boundaries.
      // A single TABLE element with many rows can be split at the row
      // midpoint into two side-by-side tables.
      const splitEl =
        bodyElements.length === 1 &&
        bodyElements[0].type === ELEMENT_TYPES.TEXT &&
        (wideEl || bodyOverflows)
          ? bodyElements[0]
          : null;
      const splitTable =
        bodyElements.length === 1 &&
        bodyElements[0].type === ELEMENT_TYPES.TABLE &&
        (bodyElements[0].rows?.length || 0) >= 8
          ? bodyElements[0]
          : null;
      if (splitEl) {
        const rawContent = splitEl.content || "";
        const lines = rawContent.split("\n");
        const mid = Math.ceil(lines.length / 2);

        // Find a safe split point: not inside a fenced code block (```).
        // Scan outward from mid to find the nearest blank line or fence boundary.
        let splitAt = mid;
        let inFence = false;
        let fenceAdjusted = false;
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
              fenceAdjusted = true;
              break;
            }
          }
        }
        // Also prefer splitting at blank lines for cleaner output — but never
        // override a fence-adjusted split: a blank line inside the fence
        // would leave an unterminated ``` in @main.
        if (!fenceAdjusted) {
          const searchRange = Math.min(lines.length, mid + 5);
          for (let i = mid; i < searchRange; i++) {
            if (lines[i].trim() === "") {
              splitAt = i + 1;
              break;
            }
          }
        }

        const leftContent = lines.slice(0, splitAt).join("\n").trimEnd();
        const rightContent = lines.slice(splitAt).join("\n").trimStart();
        // If right side is empty after split, fall back to single-column rendering
        if (!rightContent) {
          // Replace the layout directive in parts (already pushed as two-column)
          setLayoutDirective(parts, LAYOUT.HEADER_CONTENT);
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
      } else if (splitTable) {
        // Split a wide table at the row midpoint into two side-by-side tables.
        // Each half fills its own column, so override the source width to
        // make each table 100% of its column.
        const allRows = splitTable.rows || [];
        const mid = Math.ceil(allRows.length / 2);
        const leftTable = { ...splitTable, rows: allRows.slice(0, mid), width: 0 };
        const rightTable = { ...splitTable, rows: allRows.slice(mid), width: 0 };
        parts.push("");
        if (isHeaderValid) {
          parts.push(MARKDOWN_TAGS.HEADER);
          parts.push("");
          parts.push(formatTextElement(header.content));
          parts.push("");
        }
        parts.push(MARKDOWN_TAGS.MAIN);
        parts.push("");
        parts.push(formatTable(leftTable, 0));
        parts.push("");
        parts.push(MARKDOWN_TAGS.MEDIA);
        parts.push("");
        parts.push(formatTable(rightTable, 0));
      } else {
        // No single element to content-split (multiple body elements landed
        // on one side). Downgrade to header-content and render the body
        // immediately — the late fallback must not be the only renderer.
        layout = LAYOUT.HEADER_CONTENT;
        setLayoutDirective(parts, layout);
        const singleImage =
          bodyElements.length === 1 &&
          bodyElements[0].type === ELEMENT_TYPES.IMAGE &&
          bodyElements[0].ref;
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
          // Mirror the late fallback's single-image handling so the two
          // downgrade paths cannot drift.
          const el = bodyElements[0];
          const hasExplicitDims = el.width && el.height;
          parts.push(
            formatImage(el, deckName, { omitDimensions: !hasExplicitDims, fitColumn: true }),
          );
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
    } else {
      // Overlap-based split
      const leftEls = bodyElements.filter(
        (el) =>
          getOverlapArea(el, { left: 0, top: 0, width: midX, height: slideHeight }) >
          getOverlapArea(el, { left: midX, top: 0, width: midX, height: slideHeight }) * 1.2,
      );
      const rightEls = bodyElements.filter(
        (el) =>
          getOverlapArea(el, { left: midX, top: 0, width: midX, height: slideHeight }) >
          getOverlapArea(el, { left: 0, top: 0, width: midX, height: slideHeight }) * 1.2,
      );

      // Catch unclassified elements (e.g. middle image straddling the midpoint)
      // that don't clear the 1.2x threshold for either side. Assign to the
      // column whose center is closer to the element's center.
      const classified = new Set([...leftEls, ...rightEls]);
      for (const el of bodyElements) {
        if (classified.has(el)) continue;
        const elCenterX = (el.left || 0) + (el.width || 0) / 2;
        if (elCenterX < midX) leftEls.push(el);
        else rightEls.push(el);
      }

      if (rightEls.length === 0) {
        // No elements on the right — downgrade to header-content
        layout = LAYOUT.HEADER_CONTENT;
        setLayoutDirective(parts, layout);
        // The downgraded layout has no media area — drop the media directive
        // computed for the two-column layout (area-bg-main stays valid).
        delete areaBg.media;
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
    }
  } else if (layout.type === LAYOUT.MEDIA_SPAN.type) {
    // Only the dominant images on the media-only column go to @media;
    // dominant images inside the text column (illustrations beside the body)
    // stay in @main with the text they belong to. The media side is the
    // variant chosen above; images are partitioned without the centered/header
    // exclusions (those apply to text). Compute first so we can guard against
    // empty @main BEFORE any rendering.
    const mediaSide = layout.spec === LAYOUT.MEDIA_SPAN_LEFT.spec ? "left" : "right";
    let mediaEls = dominantImages.filter(
      (el) => partitionByAreaOverlap(el, slideWidth, slideHeight) === mediaSide,
    );
    // Fallback: when no dominant image lands on the media side (ambiguous
    // placement), keep the images that would otherwise render with @main
    // empty.
    if (mediaEls.length === 0) {
      mediaEls = dominantImages.filter(
        (el) => bodyElements.includes(el) || el === dominantImages[0],
      );
    }
    const leftEls = bodyElements.filter((el) => !mediaEls.includes(el));

    // Guard: if no non-media body elements, @main would be empty.
    // Downgrade to header-content and put the image(s) in @main instead.
    if (leftEls.length === 0) {
      layout = LAYOUT.HEADER_CONTENT;
      setLayoutDirective(parts, layout);
      // The downgraded layout has no media area — drop the media directives
      // that were computed for the media-span layout. area-bg-main survives:
      // the main area exists in every layout.
      mediaFullBleed = false;
      delete areaBg.media;
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
        mediaEls.length === 1 && mediaEls[0].type === ELEMENT_TYPES.IMAGE && mediaEls[0].ref
          ? formatImage(mediaEls[0], deckName, { omitDimensions: false, fitColumn: true })
          : renderElementsWithFlex(
              mediaEls,
              slideWidth,
              slideHeight,
              deckName,
              formatSingleElement,
            ),
      );
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
      if (mediaEls.length === 1 && mediaEls[0].type === ELEMENT_TYPES.IMAGE && mediaEls[0].ref) {
        parts.push(
          formatImage(mediaEls[0], deckName, {
            fitColumn: true,
            objectFit: mediaFullBleed ? "cover" : "contain",
          }),
        );
      } else {
        parts.push(mediaEls.map((el) => formatSingleElement(el)).join(REGEX.DOUBLE_NEWLINE));
      }
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

  // Emit the media-full-bleed / area-bg directives now that the layout is
  // final (downgrade branches above may have cleared them). Inserted after
  // the layout/background/theme directives and before the content sections.
  const extraDirectives = [];
  if (mediaFullBleed) {
    extraDirectives.push("media-full-bleed: true");
  }
  for (const [area, css] of Object.entries(areaBg)) {
    extraDirectives.push(`area-bg-${area}: ${css}`);
  }
  if (extraDirectives.length > 0) {
    parts.splice(directiveIndex, 0, ...extraDirectives);
  }

  if (footerElements.length > 0) {
    // Deduplicate identical footer texts — a slide can carry the same footer
    // placeholder twice (slide layout + slide), which would otherwise repeat.
    const footerText = [
      ...new Set(footerElements.map((el) => el.content?.trim()).filter(Boolean)),
    ].join(" ");
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
