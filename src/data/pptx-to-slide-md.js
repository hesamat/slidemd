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
 * @returns {string} Complete SlideMD markdown.
 */
export function convertToSlideMd(extraction) {
  const slideWidth = extraction.size?.width || 9144000;
  const slideHeight = extraction.size?.height || 5143500;

  const slides = extraction.slides.map((slide) => convertSlide(slide, slideWidth, slideHeight));

  return slides.join("\n\n---\n\n");
}

/**
 * Convert a single extracted slide to SlideMD markdown.
 * @param {import('./pptx-extractor.js').ExtractedSlide} slide
 * @param {number} slideWidth
 * @param {number} slideHeight
 * @returns {string}
 */
function convertSlide(slide, slideWidth, slideHeight) {
  const parts = [];

  // Speaker notes
  if (slide.notes) {
    parts.push(`<!-- notes: ${slide.notes} -->`);
  }

  const textElements = slide.elements.filter((el) => el.type === "text" && el.content?.trim());
  const imageElements = slide.elements.filter((el) => el.type === "image" && el.base64);
  const tableElements = slide.elements.filter((el) => el.type === "table" && el.rows?.length);
  const otherElements = slide.elements.filter(
    (el) =>
      el.type === "chart" ||
      el.type === "diagram" ||
      (el.type !== "text" && el.type !== "image" && el.type !== "table"),
  );

  const layout = inferLayout(textElements, imageElements, tableElements, slideWidth, slideHeight);
  parts.push(`layout: ${layout.spec}`);

  if (slide.background) {
    parts.push(`background: ${slide.background}`);
  }

  // Build areas based on layout type
  const formatContent = (els) => {
    if (els.length === 0) return "";
    return els.map((el) => formatTextElement(el.content, false)).join("\n\n");
  };

  if (layout.type === "title-slide") {
    parts.push("");
    parts.push("@title");
    parts.push("");
    parts.push(formatContent(textElements));
  } else if (layout.type === "header-content") {
    const { header, main } = splitHeaderMain(textElements, slideHeight);
    parts.push("");
    if (header) {
      parts.push("@header");
      parts.push("");
      parts.push(formatTextElement(header.content, true));
      parts.push("");
    }
    parts.push("@main");
    parts.push("");
    parts.push(formatContent(main));
    parts.push("");
    parts.push(formatMedia(imageElements, tableElements, otherElements));
  } else if (layout.type === "two-column") {
    const { left, right } = splitColumns(textElements, slideWidth);
    parts.push("");
    parts.push("@main");
    parts.push("");
    parts.push(formatContent(left));
    parts.push("");
    parts.push("@media");
    parts.push("");
    parts.push(formatContent(right));
    parts.push("");
    parts.push(formatMedia(imageElements, tableElements, otherElements));
  } else if (layout.type === "header-two-column") {
    const { header, left, right } = splitHeaderAndColumns(textElements, slideWidth, slideHeight);
    parts.push("");
    if (header) {
      parts.push("@header");
      parts.push("");
      parts.push(formatTextElement(header.content, true));
      parts.push("");
    }
    parts.push("@main");
    parts.push("");
    parts.push(formatContent(left));
    parts.push("");
    parts.push("@media");
    parts.push("");
    parts.push(formatContent(right));
    parts.push("");
    parts.push(formatMedia(imageElements, tableElements, otherElements));
  } else {
    parts.push("");
    parts.push("@main");
    parts.push("");
    parts.push(formatContent(textElements));
    parts.push("");
    parts.push(formatMedia(imageElements, tableElements, otherElements));
  }

  return parts.join("\n");
}

/**
 * Infer the layout type from element positions.
 * @param {import('./pptx-extractor.js').ExtractedElement[]} textEls
 * @param {import('./pptx-extractor.js').ExtractedElement[]} imageEls
 * @param {import('./pptx-extractor.js').ExtractedElement[]} tableEls
 * @param {number} slideWidth
 * @param {number} slideHeight
 * @returns {{ type: string, spec: string }}
 */
function inferLayout(textEls, imageEls, tableEls, slideWidth, slideHeight) {
  const contentEls = textEls.filter((el) => el.content?.trim());

  // No text content
  if (contentEls.length === 0) {
    if (imageEls.length > 0) {
      return { type: "header-content", spec: "header-content" };
    }
    return { type: "header-content", spec: "header-content" };
  }

  // Single short text element → title slide (only if no images/tables)
  if (contentEls.length === 1 && imageEls.length === 0 && tableEls.length === 0) {
    const text = contentEls[0].content.trim();
    const lineCount = text.split("\n").length;
    if (lineCount <= 4 && text.length < 200) {
      return { type: "title-slide", spec: "title-slide" };
    }
    return { type: "header-content", spec: "header-content" };
  }

  const headerThreshold = slideHeight * 0.22;
  const midX = slideWidth / 2;

  const hasHeader = contentEls.some((el) => el.top < headerThreshold);
  const leftEls = contentEls.filter(
    (el) => el.top >= headerThreshold && el.left + el.width / 2 < midX,
  );
  const rightEls = contentEls.filter(
    (el) => el.top >= headerThreshold && el.left + el.width / 2 >= midX,
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

/**
 * Split elements into header (top region) and main (rest).
 * @param {import('./pptx-extractor.js').ExtractedElement[]} elements
 * @param {number} slideHeight
 * @returns {{ header: import('./pptx-extractor.js').ExtractedElement|null, main: import('./pptx-extractor.js').ExtractedElement[] }}
 */
function splitHeaderMain(elements, slideHeight) {
  const threshold = slideHeight * 0.22;
  const header = elements.find((el) => el.top < threshold) || null;
  const main = elements.filter((el) => el.top >= threshold);
  return { header, main };
}

/**
 * Split elements into left and right columns (below header region).
 * @param {import('./pptx-extractor.js').ExtractedElement[]} elements
 * @param {number} slideWidth
 * @returns {{ left: import('./pptx-extractor.js').ExtractedElement[], right: import('./pptx-extractor.js').ExtractedElement[] }}
 */
function splitColumns(elements, slideWidth) {
  const midX = slideWidth / 2;
  const left = elements.filter((el) => el.left + el.width / 2 < midX);
  const right = elements.filter((el) => el.left + el.width / 2 >= midX);
  return { left, right };
}

/**
 * Split elements into header + left/right columns.
 * @param {import('./pptx-extractor.js').ExtractedElement[]} elements
 * @param {number} slideWidth
 * @param {number} slideHeight
 * @returns {{ header: import('./pptx-extractor.js').ExtractedElement|null, left: import('./pptx-extractor.js').ExtractedElement[], right: import('./pptx-extractor.js').ExtractedElement[] }}
 */
function splitHeaderAndColumns(elements, slideWidth, slideHeight) {
  const threshold = slideHeight * 0.22;
  const midX = slideWidth / 2;
  const header = elements.find((el) => el.top < threshold) || null;
  const body = elements.filter((el) => el.top >= threshold);
  const left = body.filter((el) => el.left + el.width / 2 < midX);
  const right = body.filter((el) => el.left + el.width / 2 >= midX);
  return { header, left, right };
}

const BULLET_RE = /^[\u2022\u2023\u25E6\u2043\u2219•\-*]\s*/;
const NUMBER_RE = /^\d+[.)]\s*/;

/**
 * Format a single text element's content:
 * - First line becomes ## heading (if isFirstElement)
 * - Bullet/number lines become markdown lists
 * - Indented lines become nested lists
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

    // First line of first element → heading
    if (i === 0 && isFirstElement) {
      result.push(`## ${trimmed}`);
      continue;
    }

    // Detect indentation (spaces or tabs at start)
    const indent = line.match(/^(\s*)/)[1];
    const indentLevel = indent.length > 0 ? Math.floor(indent.length / 2) : 0;
    const prefix = "  ".repeat(indentLevel);

    // Bullet or numbered list item
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
 * Format non-text elements (images, tables, charts) as markdown.
 * @param {import('./pptx-extractor.js').ExtractedElement[]} images
 * @param {import('./pptx-extractor.js').ExtractedElement[]} tables
 * @param {import('./pptx-extractor.js').ExtractedElement[]} others
 * @returns {string}
 */
function formatMedia(images, tables, others) {
  const parts = [];

  for (const img of images) {
    const filename = (img.ref || "image.png").split("/").pop();
    if (img.base64) {
      const raw = img.base64.replace(/^data:[^;]+;base64,/, "");
      const mime = img.mimeType || "image/png";
      parts.push(`![${filename}](data:${mime};base64,${raw})`);
    } else {
      parts.push(`![${filename}](images/${filename})`);
    }
    parts.push("");
  }

  for (const table of tables) {
    if (!table.rows?.length) continue;
    const headerRow = table.rows[0];
    const separator = headerRow.map(() => "---").join(" | ");
    const rows = table.rows.map((row) => row.map((cell) => cell.text || "").join(" | "));
    parts.push(`| ${rows[0]} |`);
    parts.push(`| ${separator} |`);
    for (let i = 1; i < rows.length; i++) {
      parts.push(`| ${rows[i]} |`);
    }
    parts.push("");
  }

  for (const el of others) {
    if (el.type === "chart") {
      parts.push(`<!-- ${el.content || "[Chart]"} -->`);
      parts.push("");
    } else if (el.type === "diagram") {
      parts.push(`<!-- [Diagram: ${el.content || ""}] -->`);
      parts.push("");
    }
  }

  return parts.join("\n").trim();
}
