/**
 * PptxToSlideMd
 *
 * Rule-based converter: transforms an ExtractionResult (from PptxExtractor)
 * directly into SlideMD markdown without AI. Uses element positions and
 * sizes to infer layouts deterministically.
 *
 * @class
 */

/**
 * Convert an extraction result to SlideMD markdown.
 * @static
 * @param {import('./pptx-extractor.js').ExtractionResult} extraction
 * @param {string} [deckName='presentation'] - Deck name for image path namespacing.
 * @returns {string} Complete SlideMD markdown.
 */
export function convertToSlideMd(extraction, deckName = "presentation") {
  const slideWidth = extraction.size?.width || 9144000;
  const slideHeight = extraction.size?.height || 5143500;

  const slides = extraction.slides.map((slide) =>
    convertSlide(slide, slideWidth, slideHeight, deckName),
  );

  return slides.join("\n\n---\n\n");
}

/**
 * Convert a single extracted slide to SlideMD markdown.
 * @param {import('./pptx-extractor.js').ExtractedSlide} slide
 * @param {number} slideWidth
 * @param {number} slideHeight
 * @returns {string}
 */
function convertSlide(slide, slideWidth, slideHeight, deckName) {
  const parts = [];

  // Speaker notes
  if (slide.notes) {
    parts.push(`<!-- notes: ${slide.notes} -->`);
  }

  const textElements = slide.elements.filter((el) => el.type === "text" && el.content?.trim());
  const allElements = slide.elements.filter(
    (el) =>
      (el.type === "text" && el.content?.trim()) ||
      (el.type === "image" && el.base64) ||
      (el.type === "table" && el.rows?.length) ||
      el.type === "chart" ||
      el.type === "diagram",
  );

  const hasMedia = allElements.some((el) => el.type !== "text");
  const layout = inferLayout(textElements, slideWidth, slideHeight, hasMedia);
  parts.push(`layout: ${layout.spec}`);

  if (slide.background) {
    parts.push(`background: ${slide.background}`);
  }

  const formatSingleElement = (el, isFirst) => {
    if (el.type === "text") return formatTextElement(el.content, isFirst);
    if (el.type === "image") return formatImage(el, deckName);
    if (el.type === "table") return formatTable(el);
    if (el.type === "chart") return `<!-- ${el.content || "[Chart]"} -->`;
    if (el.type === "diagram") return `<!-- [Diagram: ${el.content || ""}] -->`;
    return "";
  };

  if (layout.type === "title-slide") {
    parts.push("");
    parts.push("@title");
    parts.push("");
    parts.push(allElements.map((el) => formatSingleElement(el, false)).join("\n\n"));
  } else if (layout.type === "header-content") {
    const header = textElements.find((el) => el.top < slideHeight * 0.22) || null;
    const bodyElements = header ? allElements.filter((el) => el !== header) : allElements;
    parts.push("");
    if (header) {
      parts.push("@header");
      parts.push("");
      parts.push(formatTextElement(header.content, true));
      parts.push("");
    }
    parts.push("@main");
    parts.push("");
    parts.push(bodyElements.map((el) => formatSingleElement(el, false)).join("\n\n"));
  } else if (layout.type === "two-column") {
    const midX = slideWidth / 2;
    const leftEls = allElements.filter((el) => el.left + el.width / 2 < midX);
    const rightEls = allElements.filter((el) => el.left + el.width / 2 >= midX);
    parts.push("");
    parts.push("@main");
    parts.push("");
    parts.push(leftEls.map((el) => formatSingleElement(el, false)).join("\n\n"));
    parts.push("");
    parts.push("@media");
    parts.push("");
    parts.push(rightEls.map((el) => formatSingleElement(el, false)).join("\n\n"));
  } else if (layout.type === "header-two-column") {
    const header = textElements.find((el) => el.top < slideHeight * 0.22) || null;
    const midX = slideWidth / 2;
    const bodyElements = header ? allElements.filter((el) => el !== header) : allElements;
    const leftEls = bodyElements.filter((el) => el.left + el.width / 2 < midX);
    const rightEls = bodyElements.filter((el) => el.left + el.width / 2 >= midX);
    parts.push("");
    if (header) {
      parts.push("@header");
      parts.push("");
      parts.push(formatTextElement(header.content, true));
      parts.push("");
    }
    parts.push("@main");
    parts.push("");
    parts.push(leftEls.map((el) => formatSingleElement(el, false)).join("\n\n"));
    parts.push("");
    parts.push("@media");
    parts.push("");
    parts.push(rightEls.map((el) => formatSingleElement(el, false)).join("\n\n"));
  } else {
    parts.push("");
    parts.push("@main");
    parts.push("");
    parts.push(allElements.map((el) => formatSingleElement(el, false)).join("\n\n"));
  }

  return parts.join("\n");
}

/**
 * Infer the layout type from element positions.
 * @param {import('./pptx-extractor.js').ExtractedElement[]} textEls
 * @param {number} slideWidth
 * @param {number} slideHeight
 * @returns {{ type: string, spec: string }}
 */
function inferLayout(textEls, slideWidth, slideHeight, hasMedia = false) {
  const contentEls = textEls.filter((el) => el.content?.trim());

  // No text content
  if (contentEls.length === 0) {
    return { type: "header-content", spec: "header-content" };
  }

  // Slides with images, tables, or charts are not title slides
  const bodyThreshold = slideHeight * 0.22;
  const hasHeader = contentEls.some((el) => el.top < bodyThreshold);

  if (!hasMedia) {
    // Check if elements are at similar vertical positions but spread
    // horizontally — that's a multi-column layout, not a title slide.
    const rows = {};
    for (const el of contentEls) {
      const rowKey = Math.round(el.top / (slideHeight * 0.08));
      if (!rows[rowKey]) rows[rowKey] = [];
      rows[rowKey].push(el);
    }
    const spreadRow = Object.values(rows).find(
      (group) =>
        group.length >= 2 &&
        group.some((a) =>
          group.some((b) => a !== b && Math.abs(a.left - b.left) > slideWidth * 0.25),
        ),
    );
    if (spreadRow && hasHeader) {
      return {
        type: "header-two-column",
        spec: '"header header" "main media" / 1fr 1fr',
      };
    }
    if (spreadRow) {
      return { type: "two-column", spec: "two-column" };
    }

    const hasBodyBelowHeader = contentEls.some((el) => el.top >= bodyThreshold);
    const totalLength = contentEls.reduce((sum, el) => sum + el.content.trim().length, 0);

    if (hasHeader && hasBodyBelowHeader) {
      return { type: "header-content", spec: "header-content" };
    }

    if (totalLength < 300) {
      return { type: "title-slide", spec: "title-slide" };
    }
  }

  const leftEls = contentEls.filter(
    (el) => el.top >= bodyThreshold && el.left + el.width / 2 < slideWidth / 2,
  );
  const rightEls = contentEls.filter(
    (el) => el.top >= bodyThreshold && el.left + el.width / 2 >= slideWidth / 2,
  );

  const hasTwoColumns = leftEls.length > 0 && rightEls.length > 0;

  if (hasHeader && hasTwoColumns) {
    return {
      type: "header-two-column",
      spec: '"header header" "main media" / 1fr 1fr',
    };
  }

  if (hasHeader) {
    return { type: "header-content", spec: "header-content" };
  }

  if (hasTwoColumns) {
    return { type: "two-column", spec: "two-column" };
  }

  return { type: "header-content", spec: "header-content" };
}

const BULLET_RE = /^[\u2022\u2023\u25E6\u2043\u2219•\-*]\s*/;
const NUMBER_RE = /^\d+[.)]\s*/;

/**
 * Format a single text element's content.
 * @param {string} raw
 * @param {boolean} isFirstElement
 * @returns {string}
 */
function formatTextElement(raw, isFirstElement) {
  if (!raw) return "";
  const lines = raw.split("\n");
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      result.push("");
      continue;
    }

    if (i === 0 && isFirstElement) {
      result.push(`## ${trimmed}`);
      continue;
    }

    const indent = line.match(/^(\s*)/)[1];
    const indentLevel = indent.length > 0 ? Math.floor(indent.length / 2) : 0;
    const prefix = "  ".repeat(indentLevel);

    if (BULLET_RE.test(trimmed)) {
      const content = trimmed.replace(BULLET_RE, "");
      result.push(`${prefix}- ${content}`);
    } else if (NUMBER_RE.test(trimmed)) {
      const content = trimmed.replace(NUMBER_RE, "");
      result.push(`${prefix}- ${content}`);
    } else {
      result.push(trimmed);
    }
  }

  return result
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Format a single image element.
 * @param {import('./pptx-extractor.js').ExtractedElement} img
 * @returns {string}
 */
function formatImage(img, deckName = "presentation") {
  const filename = (img.ref || "image.png").split("/").pop();
  const safeName = deckName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const w = Math.round(img.width / 4763) || null;
  const h = Math.round(img.height / 4763) || null;
  if (w && h) {
    return `<img src="images/${safeName}/${filename}" width="${w}" height="${h}" alt="${filename}">`;
  }
  return `<img src="images/${safeName}/${filename}" alt="${filename}">`;
}

/**
 * Format a single table element.
 * @param {import('./pptx-extractor.js').ExtractedElement} table
 * @returns {string}
 */
function formatTable(table) {
  if (!table.rows?.length) return "";
  const headerRow = table.rows[0];
  const separator = headerRow.map(() => "---").join(" | ");
  const rows = table.rows.map((row) => row.map((cell) => cell.text || "").join(" | "));
  const parts = [];
  parts.push(`| ${rows[0]} |`);
  parts.push(`| ${separator} |`);
  for (let i = 1; i < rows.length; i++) {
    parts.push(`| ${rows[i]} |`);
  }
  return parts.join("\n");
}
