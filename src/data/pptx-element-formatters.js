/**
 * PPTX Element Formatters
 *
 * Pure functions that convert PPTX elements to SlideMD markdown.
 * Extracted from pptx-to-slide-md.js for clarity and reuse.
 */
import { buildChartDataRows } from "./pptx-chart-data.js";
import { stripHtml, isDividerLine, isMarkerOnly } from "./pptx-html-to-markdown.js";
import { sanitizeCssColor } from "./pptx-color-utils.js";
import { CONVERSION, DEFAULTS, REGEX, MARKDOWN_TAGS } from "./pptx-slide-config.js";

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
 * @param {object} opts - Options: omitDimensions, fitColumn, objectFit, caption
 * @returns {string} HTML img tag
 */
export function formatImage(
  img,
  _deckName = DEFAULTS.DECK_NAME,
  { omitDimensions = false, fitColumn = false, objectFit = "contain", caption } = {},
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
  // absolute insets and object-fit; the inline style stays layout-agnostic
  // so the image renders naturally if the layout changes. objectFit lets a
  // full-bleed media image cover the column (fill) instead of containing it.
  const style = fitColumn ? ` style="width: 100%; height: auto; object-fit: ${objectFit};"` : "";

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
 * Format a table element as a markdown table.
 *
 * Tables always render as markdown tables — never as raw HTML. Cell colours
 * are not carried (markdown cannot express them); a large coloured backing
 * panel in the source is instead emitted as an `area-bg-*:` directive by the
 * slide converter, keeping the slide free of embedded HTML.
 *
 * Sizing is a markdown directive too: when the source table is narrower than
 * the slide, a `table {width: X%}` line precedes the table, which the app's
 * markdown renderer applies to the rendered <table> (no HTML in the source).
 *
 * @param {object} table - Table element with rows
 * @param {number} [slideWidth] - Slide width in points (for the width ratio).
 * @returns {string} Markdown table (with optional `table {width: X%}` prefix)
 */
export function formatTable(table, slideWidth, { noHeader = false } = {}) {
  if (!table.rows?.length) return "";

  const escapeCell = (text) =>
    (text || "")
      .replace(REGEX.NEWLINE_CRLF, "\n")
      .replace(REGEX.NEWLINE, "<br>")
      .replace(REGEX.PIPE, REGEX.ESCAPE_PIPE)
      .trim();
  const formatRow = (row) => row.map((cell) => escapeCell(cell.text)).join(" | ");

  // Detect whether the first row is a header. PowerPoint styles header
  // rows with a distinct fill color from the body rows. When fills are
  // absent or uniform, fall back to a text heuristic.
  if (!noHeader && table.rows.length > 1) {
    const firstFill = table.rows[0].map((c) => c.fillColor || null).join(",");
    const bodyFills = new Set(
      table.rows.slice(1).map((r) => r.map((c) => c.fillColor || null).join(",")),
    );
    const hasAnyFill = table.rows.some((r) => r.some((c) => c.fillColor));
    const hasDistinctHeaderFill = hasAnyFill && !bodyFills.has(firstFill);
    if (!hasDistinctHeaderFill) {
      // No distinct header fill — use text heuristic: a header row has
      // short label cells, while body rows have longer content. If the
      // first row has any cell longer than 20 chars, it's data, not a
      // label — the table is headerless. If all first-row cells are short
      // labels, default to treating the first row as a header (the common
      // case), unless body rows are not longer (ambiguous → keep header).
      const firstRowTexts = table.rows[0].map((c) => (c.text || "").trim());
      const isShortLabels = firstRowTexts.every(
        (t) => t.length <= 20 && !/[.!?]$/.test(t) && !t.includes("\n"),
      );
      if (!isShortLabels) {
        noHeader = true;
      }
    }
  }

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
  const colCount = table.rows[startRow].length;
  const separator = table.rows[startRow].map(() => "---").join(" | ");
  const parts = [];
  if (caption) parts.push(`**${escapeCell(caption)}**`);
  if (noHeader) {
    // Emit an empty header row so all data rows are treated as body,
    // not as a header. Required because markdown tables need a header
    // row + separator before the body rows.
    const emptyHeader = table.rows[startRow].map(() => "").join(" | ");
    parts.push(`| ${emptyHeader} |`);
    parts.push(`| ${separator} |`);
  } else {
    parts.push(`| ${rows[0]} |`);
    parts.push(`| ${separator} |`);
  }
  const dataStart = noHeader ? 0 : 1;
  for (let i = dataStart; i < rows.length; i++) {
    parts.push(`| ${rows[i]} |`);
  }
  const tableMd = parts.join("\n");

  // Build the table directive line: width sizing and/or no-header flag.
  // Width sizes the table to the source box when it is meaningfully narrower
  // than the slide (near-full-width tables keep the default styling).
  const widthPct =
    slideWidth > 0 && table.width > 0
      ? Math.min(100, Math.round((table.width / slideWidth) * 100))
      : 100;
  const directives = [];
  if (widthPct <= 85) directives.push(`width: ${widthPct}%`);
  if (noHeader) directives.push("no-header");
  if (directives.length > 0) {
    return `table {${directives.join("; ")}}\n\n${tableMd}`;
  }
  return tableMd;
}

/**
 * Build a CSS `background` value from a PPTX element's fill (solid color or
 * gradient), for use as an `area-bg-*:` directive. Returns "" when the element
 * has no usable fill — image fills and transparent fills are skipped.
 * @param {import('./pptx-extractor.js').ExtractedElement} el
 * @returns {string}
 */
export function formatElementFillBackground(el) {
  const fill = el.fillRaw || (el.fill ? { type: "color", value: el.fill } : null);
  if (!fill) return "";
  if (fill.type === "color" && fill.value) {
    let css = sanitizeCssColor(fill.value);
    // Preserve transparency: PowerPoint often bakes the alpha into the hex
    // ("#000000a8") or carries it in a separate opacity property. A backing
    // panel with a translucent fill must stay translucent as an area-bg.
    if (fill.opacity != null && css.startsWith("#") && css.length === 7) {
      const alpha = Math.max(0, Math.min(1, Number(fill.opacity)));
      const r = parseInt(css.slice(1, 3), 16);
      const g = parseInt(css.slice(3, 5), 16);
      const b = parseInt(css.slice(5, 7), 16);
      css = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return css;
  }
  if (fill.type === "gradient" && fill.value?.colors?.length) {
    const stops = fill.value.colors
      .map((c) => `${sanitizeCssColor(c.color)} ${c.pos}`.trim())
      .join(", ");
    return stops ? `linear-gradient(${stops})` : "";
  }
  return "";
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
