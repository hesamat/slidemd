/**
 * PPTX Element Formatters
 *
 * Pure functions that convert PPTX elements to SlideMD markdown.
 * Extracted from pptx-to-slide-md.js for clarity and reuse.
 */
import { buildChartDataRows } from "./pptx-chart-data.js";
import { stripHtml, escapeHtml, isDividerLine, isMarkerOnly } from "./pptx-html-to-markdown.js";
import { sanitizeCssColor, isColorDark } from "./pptx-color-utils.js";
import { CONVERSION, DEFAULTS, REGEX, CONFIG, MARKDOWN_TAGS } from "./pptx-slide-config.js";

/**
 * Format raw text content into clean markdown.
 * Handles bullets, numbered lists, bold headings, and fenced code blocks.
 *
 * @param {string} raw - Raw text content from PPTX
 * @returns {string} Formatted markdown
 */
export function formatTextElement(raw) {
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

    if (/^```/.test(trimmed)) {
      // Toggle on any fence line — bare or language-tagged ("```yaml").
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

    // Divider lines — three or more markers, adjacent or spaced ("---",
    // "- - -", "***", "* * *", "•••"). A raw "---" line would terminate the
    // slide in splitSlides, so emit "***" (which renders as a horizontal
    // rule) instead of the original markers. Shared with htmlToMarkdown so
    // the two modules cannot drift.
    if (isDividerLine(trimmed)) {
      result.push("***");
      continue;
    }

    // Marker-only residue — one or two markers, adjacent or spaced ("-",
    // "- -", "--", "• •") that PowerPoint leaves behind in empty sub-bullets.
    // These have no content, so drop the line instead of emitting a dangling
    // "- ".
    if (isMarkerOnly(trimmed)) continue;

    const isProperBullet = /^(\s*[-*•])\s+\S/.test(trimmed) && !/^(\s*[-*•]\s*){2,}/.test(trimmed);
    const isNumberedList = /^\s*\d+[.)]\s+\S/.test(trimmed);
    const isLetterList = /^[a-zA-Z][.)]\s+\S/.test(trimmed);

    if (isProperBullet || isNumberedList) {
      result.push(line);
    } else if (isLetterList) {
      const content = trimmed.replace(/^[a-zA-Z][.)]\s*/, "");
      result.push(`${prefix}  - ${content}`);
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

export function wrapLongLists(markdown) {
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
        result.push(`::: text-block { column-count=${cols} }`);
        result.push("");
        for (let j = groupStart; j < i; j++) result.push(lines[j]);
        result.push(":::");
        result.push("");
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

/**
 * Format an image element as an HTML img tag.
 *
 * @param {object} img - Image element with ref, blob, width, height
 * @param {string} _deckName - Deck name for image path
 * @param {object} opts - Options: omitDimensions, fitColumn, caption
 * @returns {string} HTML img tag
 */
export function formatImage(
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
  const altText = (caption || img.caption || `Slide image ${baseAlt}`).replace(/"/g, "&quot;");

  // fitColumn: media-span image — the media-span CSS fills the column via
  // absolute insets and object-fit: contain; the inline style stays
  // layout-agnostic so the image renders naturally if the layout changes.
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

/**
 * Format a table element as a markdown table or CSS grid.
 *
 * @param {object} table - Table element with rows
 * @param {number} slideWidth - Slide width in points
 * @param {number} slideHeight - Slide height in points
 * @returns {string} Markdown table or HTML grid
 */
export function formatTable(table, slideWidth, slideHeight) {
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
        // Cells with an explicit fill get a text color chosen for the fill so
        // the grid stays readable on both light and dark slides. Unfilled
        // cells inherit the slide's theme ink via CSS.
        const isDarkBg = isColorDark(bg);
        const textClass = isDarkBg
          ? " fullpage-grid__cell--on-color"
          : bg !== "transparent"
            ? " fullpage-grid__cell--on-light"
            : "";
        cells.push(
          `<div class="fullpage-grid__cell${textClass}" style="background:${bg}">${text}</div>`,
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

  // A leading row with a single filled cell is a merged title row (e.g. the
  // "Memory table" caption above a two-column value grid). Render it as a bold
  // caption instead of a two-column row with an empty cell.
  let startRow = 0;
  let caption = "";
  if (table.rows.length > 1) {
    const firstRow = table.rows[0];
    const filled = firstRow.filter((cell) => (cell.text || "").trim());
    if (filled.length === 1 && firstRow.length > 1) {
      caption = stripHtml(filled[0].text).trim();
      startRow = 1;
    }
  }

  const rows = table.rows.slice(startRow).map(formatRow);
  const separator = table.rows[startRow].map(() => "---").join(" | ");
  const parts = [];
  if (caption) parts.push(`**${escapeCell(caption)}**`);
  parts.push(`| ${rows[0]} |`);
  parts.push(`| ${separator} |`);
  for (let i = 1; i < rows.length; i++) {
    parts.push(`| ${rows[i]} |`);
  }
  return parts.join("\n");
}

/**
 * Format a chart element as a markdown table.
 *
 * @param {object} chart - Chart element with chartData
 * @returns {string} Markdown table
 */
export function formatChart(chart) {
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

/**
 * Format a diagram element as a [Diagram: ...] marker.
 *
 * The diagram's constituent shapes carry geometry, so when they are available
 * the shape texts are emitted in reading order (top-to-bottom, then
 * left-to-right) instead of pptxtojson's raw element order — a flow whose
 * boxes were authored out of sequence otherwise reads in a jumbled order.
 *
 * @param {object} diagram - Diagram element with content
 * @returns {string} Diagram marker or plain text
 */
export function formatDiagram(diagram) {
  if (!diagram.content) return "";

  // Prefer position-ordered shape texts; fall back to the raw comma-joined
  // content for diagrams without shape geometry (synthetic fixtures, etc.).
  // Shape content is markdown (headings, emphasis) — strip the markers so the
  // diagram marker reads as plain node labels.
  const cleanShapeText = (md) =>
    (md || "")
      .replace(/^#{1,3}\s+/gm, "")
      .replace(/`/g, "")
      .replace(/\*+/g, "")
      .trim();
  const shapeTexts = (diagram.shapes || [])
    .filter((s) => s.type === "text" && s.content?.trim())
    .sort((a, b) => a.top - b.top || a.left - b.left)
    .map((s) => cleanShapeText(s.content))
    .filter(Boolean);
  const rawItems = shapeTexts.length > 0 ? shapeTexts : diagram.content.split(", ");

  const items = rawItems
    .flatMap((item) => item.split("\n"))
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) return "";
  if (items.length === 1) return items[0];

  // Emit a marker that AI post-processing can replace with Mermaid.
  // If no AI mode is selected, the marker is converted back to bullets at import time.
  return `[Diagram: ${items.join(", ")}]`;
}
