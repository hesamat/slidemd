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

  // Speaker notes — sanitize to prevent HTML comment injection.
  // Preserve <br> as newlines before stripping other HTML tags.
  if (slide.notes) {
    const sanitized = slide.notes
      .replace(/<!--/g, "< !--")
      .replace(/-->/g, "-- >")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "");
    parts.push(`<!-- notes: ${sanitized} -->`);
  }

  // Separate footer elements from content elements
  const footerElements = slide.elements.filter((el) => el.placeholderType === "footer");

  const textElements = slide.elements.filter(
    (el) => el.type === "text" && el.content?.trim() && el.placeholderType !== "footer",
  );
  const allElements = slide.elements.filter(
    (el) =>
      el.placeholderType !== "footer" &&
      ((el.type === "text" && el.content?.trim()) ||
        (el.type === "image" && el.base64) ||
        (el.type === "table" && el.rows?.length) ||
        el.type === "chart" ||
        el.type === "diagram"),
  );

  const dominantImages = findDominantImages(allElements, slideWidth, slideHeight);
  const hasMedia = allElements.some((el) => el.type !== "text");
  const layout = inferLayout(
    textElements,
    slideWidth,
    slideHeight,
    hasMedia,
    allElements,
    dominantImages,
  );
  parts.push(`layout: ${layout.spec}`);

  if (slide.background) {
    parts.push(`background: ${slide.background}`);
    if (isColorDark(slide.background)) {
      parts.push("theme: dark");
    }
  }

  const formatSingleElement = (el) => {
    if (el.type === "text") return formatTextElement(el.content);
    if (el.type === "image") return formatImage(el, deckName);
    if (el.type === "table") return formatTable(el);
    if (el.type === "chart") return formatChart(el);
    if (el.type === "diagram") return formatDiagram(el);
    return "";
  };

  if (layout.type === "title-slide") {
    parts.push("");
    parts.push("@title");
    parts.push("");
    // Headings are detected by font-size in the HTML-to-markdown stage,
    // so the title will automatically get ## if it has a large font size.
    parts.push(allElements.map((el) => formatSingleElement(el)).join("\n\n"));
  } else if (layout.type === "header-content") {
    const header = textElements.find((el) => el.top < slideHeight * 0.22) || null;
    // Don't treat bullet lists, numbered lists, or code blocks as headers.
    const hasBullets = /(?:^|\n)\s*[-*•]\s/.test(header?.content || "");
    const hasNumbers = /(?:^|\n)\s*\d+[.)]\s/.test(header?.content || "");
    const hasCodeBlock = /```/.test(header?.content || "");
    const isHeaderValid = header && !hasBullets && !hasNumbers && !hasCodeBlock;
    const bodyElements = isHeaderValid ? allElements.filter((el) => el !== header) : allElements;
    parts.push("");
    if (isHeaderValid) {
      parts.push("@header");
      parts.push("");
      parts.push(formatTextElement(header.content));
      parts.push("");
    }
    parts.push("@main");
    parts.push("");
    parts.push(bodyElements.map((el) => formatSingleElement(el, false)).join("\n\n"));
  } else if (layout.type === "two-column") {
    const header = textElements.find((el) => el.top < slideHeight * 0.22) || null;
    // Don't treat bullet lists, numbered lists, or code blocks as headers.
    const hasBullets = /(?:^|\n)\s*[-*•]\s/.test(header?.content || "");
    const hasNumbers = /(?:^|\n)\s*\d+[.)]\s/.test(header?.content || "");
    const hasCodeBlock = /```/.test(header?.content || "");
    const isHeaderValid = header && !hasBullets && !hasNumbers && !hasCodeBlock;
    const bodyElements = isHeaderValid ? allElements.filter((el) => el !== header) : allElements;
    parts.push("");
    if (isHeaderValid) {
      parts.push("@header");
      parts.push("");
      parts.push(formatTextElement(header.content));
      parts.push("");
    }
    if (dominantImages.length > 0) {
      const mediaImage = dominantImages[0];
      const mainEls = bodyElements.filter((el) => el !== mediaImage);
      parts.push("@main");
      parts.push("");
      parts.push(mainEls.map((el) => formatSingleElement(el, false)).join("\n\n"));
      parts.push("");
      parts.push("@media");
      parts.push("");
      parts.push(formatSingleElement(mediaImage, false));
    } else {
      const midX = slideWidth / 2;
      const leftEls = bodyElements.filter((el) => el.left + el.width / 2 < midX);
      const rightEls = bodyElements.filter((el) => el.left + el.width / 2 >= midX);
      parts.push("@main");
      parts.push("");
      parts.push(leftEls.map((el) => formatSingleElement(el, false)).join("\n\n"));
      parts.push("");
      parts.push("@media");
      parts.push("");
      parts.push(rightEls.map((el) => formatSingleElement(el, false)).join("\n\n"));
    }
  } else if (layout.type === "three-column") {
    const header = textElements.find((el) => el.top < slideHeight * 0.22) || null;
    // Don't treat bullet lists, numbered lists, or code blocks as headers.
    const hasBullets = /(?:^|\n)\s*[-*•]\s/.test(header?.content || "");
    const hasNumbers = /(?:^|\n)\s*\d+[.)]\s/.test(header?.content || "");
    const hasCodeBlock = /```/.test(header?.content || "");
    const isHeaderValid = header && !hasBullets && !hasNumbers && !hasCodeBlock;
    const bodyElements = isHeaderValid ? allElements.filter((el) => el !== header) : allElements;
    const [mediaImage, secondaryImage] = dominantImages;
    if (!mediaImage || !secondaryImage) {
      parts.push("");
      if (isHeaderValid) {
        parts.push("@header");
        parts.push("");
        parts.push(formatTextElement(header.content));
        parts.push("");
      }
      parts.push("@main");
      parts.push("");
      parts.push(bodyElements.map((el) => formatSingleElement(el, false)).join("\n\n"));
      return parts.join("\n");
    }
    const mainEls = bodyElements.filter((el) => el !== mediaImage && el !== secondaryImage);
    parts.push("");
    if (isHeaderValid) {
      parts.push("@header");
      parts.push("");
      parts.push(formatTextElement(header.content));
      parts.push("");
    }
    parts.push("@main");
    parts.push("");
    parts.push(mainEls.map((el) => formatSingleElement(el, false)).join("\n\n"));
    parts.push("");
    parts.push("@media");
    parts.push("");
    parts.push(formatSingleElement(mediaImage, false));
    parts.push("");
    parts.push("@secondary");
    parts.push("");
    parts.push(formatSingleElement(secondaryImage, false));
  } else {
    parts.push("");
    parts.push("@main");
    parts.push("");
    parts.push(allElements.map((el) => formatSingleElement(el, false)).join("\n\n"));
  }

  // Emit footer area if footer elements were detected
  if (footerElements.length > 0) {
    const footerText = footerElements
      .map((el) => el.content?.trim())
      .filter(Boolean)
      .join(" ");
    if (footerText) {
      parts.push("");
      parts.push("@footer");
      parts.push("");
      parts.push(footerText);
    }
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
function inferLayout(
  textEls,
  slideWidth,
  slideHeight,
  hasMedia = false,
  allEls = textEls,
  dominantImages = findDominantImages(allEls, slideWidth, slideHeight),
) {
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
      return { type: "two-column", spec: "two-column" };
    }
    if (spreadRow) {
      return { type: "two-column", spec: "two-column" };
    }

    const hasBodyBelowHeader = contentEls.some((el) => el.top >= bodyThreshold);
    const totalLength = contentEls.reduce((sum, el) => sum + el.content.trim().length, 0);

    // Title-slide heuristic.
    // PowerPoint title slides typically have a prominent title (often
    // near the top, which trips `hasHeader`) and a one-line subtitle
    // below — visually those look like header+body, but they are
    // really a centred cluster of two short text blocks.  A real
    // header-content slide has a *thin header strip* on top with a
    // substantially taller body area beneath.  We use the box-height
    // ratio between the topmost ("header") element and the tallest
    // body element to tell them apart: if the header is not a thin
    // strip relative to the body, AND the total content is short and
    // has no bullet markers, the slide is a title slide.
    if (totalLength < 300 && contentEls.length <= 3) {
      const hasBullet = contentEls.some(
        (el) => BULLET_RE.test(el.content || "") || NUMBER_RE.test(el.content || ""),
      );
      const headerEl = contentEls.find((el) => el.top < bodyThreshold) || null;
      const bodyEls = contentEls.filter((el) => el !== headerEl);
      const headerHi = headerEl?.height || 0;
      const bodyHi = bodyEls.length ? Math.max(...bodyEls.map((e) => e.height || 0)) : 0;
      const isThinStripHeader = headerEl && bodyHi > 0 && headerHi < bodyHi * 0.4;
      if (!hasBullet && (!headerEl || !isThinStripHeader)) {
        return { type: "title-slide", spec: "title-slide" };
      }
    }

    if (hasHeader && hasBodyBelowHeader) {
      return { type: "header-content", spec: "header-content" };
    }

    if (totalLength < 300) {
      return { type: "title-slide", spec: "title-slide" };
    }
  }

  // Use ALL elements (text + images + tables) for column detection
  // so that images positioned on the right side trigger two-column layout.
  // Exclude centered/full-width elements (their center is near the slide
  // midpoint) so they don't falsely trigger column detection.
  const midX = slideWidth / 2;
  const centerTol = slideWidth * 0.1;
  const isCentered = (el) => Math.abs(el.left + el.width / 2 - midX) < centerTol;
  const leftEls = allEls.filter(
    (el) => el.top >= bodyThreshold && el.left + el.width / 2 < midX && !isCentered(el),
  );
  const rightEls = allEls.filter(
    (el) => el.top >= bodyThreshold && el.left + el.width / 2 >= midX && !isCentered(el),
  );

  const hasTwoColumns = leftEls.length > 0 && rightEls.length > 0;

  // Only use two-column when there is actual body text on both sides,
  // not just images.  A header + a single image should be header-content.
  const leftText = leftEls.filter((el) => el.type === "text");
  const rightText = rightEls.filter((el) => el.type === "text");
  const hasTextColumns = leftText.length > 0 && rightText.length > 0;

  if (hasHeader && hasTextColumns) {
    return { type: "two-column", spec: "two-column" };
  }

  if (dominantImages.length >= 2 && contentEls.length > 0) {
    return { type: "three-column", spec: "three-column" };
  }
  // Only use two-column for dominant images when there is substantial body
  // text below the header — a single short line is not enough.
  const bodyEls = contentEls.filter((el) => el.top >= bodyThreshold);
  const bodyLength = bodyEls.reduce((sum, el) => sum + el.content.trim().length, 0);
  if (dominantImages.length === 1 && bodyEls.length >= 2 && bodyLength > 80) {
    return { type: "two-column", spec: "two-column" };
  }

  if (hasHeader) {
    return { type: "header-content", spec: "header-content" };
  }

  // Only use two-column for horizontal spread when there is substantial
  // content — a header + image alone should be header-content.
  if (hasTwoColumns && bodyEls.length >= 2 && bodyLength > 80) {
    return { type: "two-column", spec: "two-column" };
  }

  return { type: "header-content", spec: "header-content" };
}

function findDominantImages(allEls, slideWidth, slideHeight) {
  const slideArea = slideWidth * slideHeight;
  const images = allEls.filter((el) => el.type === "image" && el.base64);

  const dominant = images.filter((el) => {
    // Treat images as dominant when they occupy a large share of the slide,
    // matching the PPTX conversion rule for auto-switching to multi-column
    // layouts: width > 40%, height > 60%, or area > 25% of the slide.
    const widthRatio = el.width / slideWidth;
    const heightRatio = el.height / slideHeight;
    const areaRatio = (el.width * el.height) / slideArea;
    return widthRatio > 0.4 || heightRatio > 0.6 || areaRatio > 0.25;
  });

  return dominant.slice(0, 2);
}

// Match one OR MORE leading bullet/dash markers + optional trailing
// whitespace.  pptxtojson sometimes includes the PPTX bullet glyph as a
// literal text run AND wraps the line in <li>; #htmlToMarkdown then
// prepends "- " for the <li>, yielding a leading "- - text" or
// "• - text".  A single-char regex only strips one marker and the
// re-added "- " prefix produces a visible double dash.  The (?:...\s*)+
// group consumes every consecutive bullet-or-dash + whitespace pair so
// "- - Understand" collapses to "Understand" before we re-add one "- ".
const BULLET_RE = /^(?:[\u2022\u2023\u25E6\u2043\u2219•-]\s*)+/;
const NUMBER_RE = /^\d+[.)]\s*/;

/**
 * Check if a hex color is dark (luminance-based).
 * @param {string} hex
 * @returns {boolean}
 */
function isColorDark(hex) {
  if (!hex || !hex.startsWith("#")) return false;
  const c = hex.replace("#", "");
  if (c.length < 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

/**
 * Format a single text element's content.
 * Headings are detected by font-size in the HTML-to-markdown stage,
 * so this function only handles bullets, numbered lists, and bold sub-headings.
 * @param {string} raw
 * @returns {string}
 */
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

    // Preserve indentation inside fenced code blocks
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
    const indentLevel = indent.length > 0 ? Math.floor(indent.length / 2) : 0;
    const prefix = "  ".repeat(indentLevel);

    if (BULLET_RE.test(trimmed)) {
      const content = trimmed.replace(BULLET_RE, "");
      result.push(`${prefix}- ${content}`);
    } else if (NUMBER_RE.test(trimmed)) {
      const match = trimmed.match(NUMBER_RE);
      const content = trimmed.replace(NUMBER_RE, "");
      const number = match ? match[0].replace(/[.)]\s*/, "") : "1";
      result.push(`${prefix}${number}. ${content}`);
    } else if (/^\*\*[^*]+\*\*$/.test(trimmed)) {
      result.push(`### ${trimmed.replace(/^\*\*|\*\*$/g, "")}`);
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
  const rawName = (img.ref || "image.png").split("/").pop();
  const filename = rawName.replace(/\.(emf|wmf)$/i, ".png");
  const safeName = deckName.replace(/[^a-zA-Z0-9_-]/g, "_");

  // Convert points → pixels at 96 DPI: px = pt × (96/72) = pt × 1.333
  const w = Math.round(img.width * 1.333) || null;
  const h = Math.round(img.height * 1.333) || null;

  const src = img.blob || `images/${safeName}_${filename}`;

  // Use filename (without extension) as alt text for better accessibility
  const altText = filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");

  if (w && h) {
    return `<img src="${src}" width="${w}" height="${h}" alt="${altText}">`;
  }
  return `<img src="${src}" alt="${altText}">`;
}

/**
 * Format a single table element.
 * @param {import('./pptx-extractor.js').ExtractedElement} table
 * @returns {string}
 */
function formatTable(table) {
  if (!table.rows?.length) return "";
  // A single cell's text may contain newlines (e.g. from <br> in the
  // PPTX source, preserved by #stripHtml).  A raw newline would start
  // a new markdown table row, splitting one cell across rows.  Escape
  // intra-cell newlines to <br> so the cell stays a single logical
  // entry; markdown table renderers typically interpret <br> as a
  // soft line break within a cell.  Also collapse padding whitespace
  // so the row layout isn't disturbed.
  const escapeCell = (text) =>
    (text || "").replace(/\r\n?/g, "\n").replace(/\n/g, "<br>").replace(/\|/g, "\\|").trim();
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

/**
 * Format chart data as a markdown table.
 * @param {import('./pptx-extractor.js').ExtractedElement} chart
 * @returns {string}
 */
function formatChart(chart) {
  if (!chart.chartData?.length) {
    return `<!-- ${chart.content || "[Chart]"} -->`;
  }

  const { headers, rows } = buildChartDataRows(chart.chartData);

  // Format as markdown table
  const escapeCell = (text) => text.replace(/\|/g, "\\|").trim();
  const separator = headers.map(() => "---").join(" | ");
  const parts = [];
  parts.push(`| ${headers.map(escapeCell).join(" | ")} |`);
  parts.push(`| ${separator} |`);
  for (const row of rows) {
    parts.push(`| ${row.map(escapeCell).join(" | ")} |`);
  }
  return parts.join("\n");
}

/**
 * Format a diagram element as a markdown list.
 * Diagrams from PowerPoint SmartArt contain structured text that
 * is best represented as a bulleted list.
 * @param {import('./pptx-extractor.js').ExtractedElement} diagram
 * @returns {string}
 */
function formatDiagram(diagram) {
  if (!diagram.content) return "";

  // Content is textList joined with ", " in the extractor
  // Split by ", " to get individual items, then handle newlines within items
  const items = diagram.content
    .split(", ")
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) return "";

  // If only one item, just return it as text
  if (items.length === 1) {
    return items[0];
  }

  // Multiple items: render as a bulleted list
  // Handle newlines within items by treating them as separate sub-items
  const lines = [];
  for (const item of items) {
    const subItems = item.split("\n").filter((s) => s.trim());
    if (subItems.length === 1) {
      lines.push(`- ${subItems[0]}`);
    } else {
      // Multiple lines within one diagram item: use indented sub-bullets
      lines.push(`- ${subItems[0]}`);
      for (let i = 1; i < subItems.length; i++) {
        lines.push(`  - ${subItems[i]}`);
      }
    }
  }
  return lines.join("\n");
}
