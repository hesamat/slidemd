/**
 * Directive Utilities
 *
 * Helper functions for reading and writing slide directives
 * (layout, background, etc.) in markdown source text.
 */

import { MarkdownParser } from "../../data/markdown-parser.js";
import { LayoutParser } from "../../data/layout-parser.js";
import { LayoutData } from "../../data/layout-data.js";

/**
 * Replace (or insert) the `layout:` directive in a slide's markdown text.
 *
 * @param {string} markdown       - The slide's full markdown source.
 * @param {string} newLayoutValue - The new layout value (spec string or preset name).
 * @returns {string} Updated markdown with the `layout:` line replaced/inserted.
 */
export function updateLayoutDirective(markdown, newLayoutValue) {
  const parser = new MarkdownParser();
  const { markdown: stripped } = parser.extractDirective(markdown, "layout");
  return `layout: ${newLayoutValue}\n${stripped}`;
}

/**
 * Replace (or insert) the `background:` directive in a slide's markdown.
 *
 * @param {string} markdown         - Slide markdown source.
 * @param {string} newBackgroundCss - New CSS background value.  Empty string
 *                                    removes the directive entirely.
 * @returns {string} Updated markdown.
 */
export function updateBackgroundDirective(markdown, newBackgroundCss) {
  const parser = new MarkdownParser();
  const { markdown: stripped } = parser.extractDirective(markdown, "background");
  const trimmed = String(newBackgroundCss || "").trim();
  if (!trimmed) return stripped;
  // Multi-line values (gradients, layered backgrounds) should keep working.
  // Indent continuation lines so the parser doesn't treat them as new directives.
  const indented = trimmed
    .split("\n")
    .map((line, i) => (i === 0 ? line : `  ${line}`))
    .join("\n");
  return `background: ${indented}\n${stripped}`;
}

/**
 * Replace (or insert) the `theme:` directive in a slide's markdown.
 *
 * @param {string} markdown    - Slide markdown source.
 * @param {string} themeValue  - New theme value ('dark', 'light', or '' to remove).
 * @returns {string} Updated markdown.
 */
export function updateThemeDirective(markdown, themeValue) {
  const parser = new MarkdownParser();
  const { markdown: stripped } = parser.extractDirective(markdown, "theme");
  const trimmed = String(themeValue || "")
    .trim()
    .toLowerCase();
  if (!trimmed) return stripped;
  return `theme: ${trimmed}\n${stripped}`;
}

/**
 * Replace (or insert) the `area-style:` directive in a slide's markdown.
 * The value is a plain CSS string applied to all areas uniformly.
 *
 * @param {string} markdown       - Slide markdown source.
 * @param {string} cssText        - CSS declaration string (e.g. "border: 2px solid red; padding: 12px").
 *                                  Empty string removes the directive entirely.
 * @returns {string} Updated markdown.
 */
export function updateAreaStyleDirective(markdown, cssText) {
  const parser = new MarkdownParser();
  const { markdown: stripped } = parser.extractDirective(markdown, "area-style");
  const trimmed = String(cssText || "").trim();
  if (!trimmed) return stripped;
  return `area-style: ${trimmed}\n${stripped}`;
}

/**
 * Replace (or insert) the `area-style-<areaName>:` directive in a slide's markdown.
 * The value is a plain CSS string applied only to the named area.
 *
 * @param {string} markdown       - Slide markdown source.
 * @param {string} areaName       - Target area name (e.g. "media").
 * @param {string} cssText        - CSS declaration string (e.g. "background: #f1f5f9").
 *                                  Empty string removes the directive entirely.
 * @returns {string} Updated markdown.
 */
/**
 * Merge CSS declarations, with later declarations overriding earlier ones
 * by property name. Preserves the property name casing of the last write.
 * @param {string} base
 * @param {string} override
 * @returns {string}
 */
function mergeCssDeclarations(base, override) {
  const map = new Map();
  for (const source of [base, override]) {
    for (const decl of String(source || "").split(";")) {
      const d = decl.trim();
      if (!d) continue;
      const idx = d.indexOf(":");
      if (idx === -1) continue;
      const prop = d.slice(0, idx).trim();
      const value = d.slice(idx + 1).trim();
      map.set(prop.toLowerCase(), { prop, value });
    }
  }
  return [...map.values()].map(({ prop, value }) => `${prop}: ${value}`).join("; ");
}

export function updateAreaStyleForAreaDirective(markdown, areaName, cssText) {
  const parser = new MarkdownParser();
  const directive = `area-style-${String(areaName || "").toLowerCase()}`;
  const { markdown: stripped, value: existing } = parser.extractDirective(markdown, directive);
  const trimmed = String(cssText || "").trim();
  if (!trimmed) return stripped;
  const merged = mergeCssDeclarations(existing, trimmed);
  return `${directive}: ${merged}\n${stripped}`;
}

/**
 * Replace (or insert) the `header-style:` directive in a slide's markdown.
 *
 * @param {string} markdown      - Slide markdown source.
 * @param {string} headerStyle   - Header style value ('line', 'full', 'thick', 'none', or '' to remove).
 * @returns {string} Updated markdown.
 */
export function updateHeaderStyleDirective(markdown, headerStyle) {
  const parser = new MarkdownParser();
  const { markdown: stripped } = parser.extractDirective(markdown, "header-style");
  const trimmed = String(headerStyle || "")
    .trim()
    .toLowerCase();
  if (!trimmed || trimmed === "line") return stripped;
  return `header-style: ${trimmed}\n${stripped}`;
}

/**
 * Parse a CSS background string and return a friendly preview description.
 * Returns `{ type, value, preview }` where `preview` is a CSS string suitable
 * for inline `style="background: ..."`.
 *
 * @param {string} css
 */
export function describeBackground(css) {
  const value = String(css || "").trim();
  if (!value) return { type: "none", value: "", preview: "" };

  let type = "color";
  if (/gradient\s*\(/i.test(value)) type = "gradient";
  else if (/^url\(/i.test(value)) type = "image";

  return { type, value, preview: value };
}

/**
 * Make an area span all rows by rewriting the layout to a custom grid.
 * The target area is placed in the last column of every row, keeping
 * header/footer in column 1 only.
 *
 * @param {string} markdown  — slide markdown source
 * @param {string} areaName  — area to make full-height (e.g. "media")
 * @returns {string} updated markdown with custom layout grid
 */
export function makeAreaFullHeight(markdown, areaName) {
  const name = String(areaName || "")
    .trim()
    .toLowerCase();
  if (!name) return markdown;

  const parser = new MarkdownParser();
  const { value: layoutValue, markdown: stripped } = parser.extractDirective(markdown, "layout");
  if (!layoutValue) return markdown;

  const resolved = LayoutParser.resolvePreset(layoutValue);
  const layout = LayoutParser.parse(resolved);

  // Parse grid-template-areas into rows of cell names
  const rowMatches = layout.gridTemplateAreas.match(/"[^"]*"|'[^']*'/g) || [];
  if (rowMatches.length === 0) return markdown;

  const rows = rowMatches.map((q) => q.slice(1, -1).split(/\s+/).filter(Boolean));

  // Find which column the target area occupies (from the content row)
  const contentRow = rows.find((row) => row.includes(name));
  if (!contentRow) return markdown;
  const colIdx = contentRow.indexOf(name);

  // Rebuild every row: put the target in colIdx, others shifted left
  const newRows = rows.map((row) => {
    if (row.includes(name)) return row;
    const otherCells = row.filter((c) => c !== name);
    const result = [];
    for (let i = 0; i < row.length; i++) {
      if (i === colIdx) {
        result.push(name);
      } else {
        const cellIdx = i < colIdx ? i : i - 1;
        result.push(otherCells[cellIdx] || ".");
      }
    }
    return result;
  });

  const parts = [];
  for (let i = 0; i < newRows.length; i++) {
    parts.push(`"${newRows[i].join(" ")}"`);
    if (layout.hasExplicitRowSizes && i < layout.rowSizes.length) {
      parts.push(layout.rowSizes[i]);
    }
  }
  const newLayout = `${parts.join(" ")} / ${layout.gridTemplateColumns}`;

  return updateLayoutDirective(stripped, newLayout);
}

/**
 * Split a CSS grid track list into individual track tokens without
 * breaking on spaces inside functional notations (minmax, repeat, etc.).
 */
function _splitTrackList(columns) {
  const tracks = [];
  let current = "";
  let depth = 0;
  for (const ch of String(columns || "").trim()) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (current.trim()) tracks.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) tracks.push(current.trim());
  return tracks;
}

/**
 * Remove an area from the slide's layout directive by rebuilding the grid.
 * The target area's cells are replaced with empty cells (.), any row
 * that becomes entirely empty is removed, and any column that becomes
 * entirely empty is also dropped. This preserves a custom grid instead
 * of collapsing to a standard preset.
 *
 * @param {string} markdown  — slide markdown source
 * @param {string} areaName  — area to remove (e.g. "media", "secondary")
 * @returns {string} updated markdown
 */
export function removeAreaFromLayout(markdown, areaName) {
  const name = String(areaName || "")
    .trim()
    .toLowerCase();
  if (!name || name === "main") return markdown;

  const parser = new MarkdownParser();
  const { value: layoutValue, markdown: stripped } = parser.extractDirective(markdown, "layout");
  if (!layoutValue) return markdown;

  const resolved = LayoutParser.resolvePreset(layoutValue);
  const layout = LayoutParser.parse(resolved);
  if (!layout.orderedAreas.includes(name)) return markdown;

  const rowMatches = layout.gridTemplateAreas.match(/"[^"]*"|'[^']*'/g) || [];
  if (rowMatches.length === 0) return markdown;

  const colCount = Math.max(
    ...rowMatches.map((m) => m.slice(1, -1).split(/\s+/).filter(Boolean).length),
  );

  const replacedRows = [];
  const rowData = [];
  for (let i = 0; i < rowMatches.length; i++) {
    const cells = rowMatches[i].slice(1, -1).split(/\s+/).filter(Boolean);
    const replaced = cells.map((c) => (c === name ? "." : c));
    replacedRows.push(replaced);
    if (replaced.some((c) => c !== ".")) {
      rowData.push({ index: i, cells: replaced, size: layout.rowSizes[i] || "minmax(0, 1fr)" });
    }
  }

  if (rowData.length === 0) {
    return updateLayoutDirective(stripped, "header-content");
  }

  // Drop columns that are entirely dots or only duplicate content already
  // present in a kept column to the left (common for spanning header/footer).
  const keepCol = new Array(colCount).fill(false);
  for (let j = 0; j < colCount; j++) {
    for (let i = 0; i < replacedRows.length; i++) {
      const cell = replacedRows[i][j];
      if (cell === "." || cell === undefined) continue;
      const seenLeft = keepCol.some((keep, k) => keep && replacedRows[i][k] === cell);
      if (!seenLeft) {
        keepCol[j] = true;
        break;
      }
    }
  }

  const newRows = rowData.map(({ cells }) => {
    const kept = cells.filter((_, j) => keepCol[j]);
    return `"${kept.join(" ") || "."}"`;
  });
  const newRowSizes = rowData.map(({ size }) => size);

  let newCols = layout.gridTemplateColumns;
  const tracks = _splitTrackList(layout.gridTemplateColumns);
  if (tracks.length === colCount) {
    const keptTracks = tracks.filter((_, i) => keepCol[i]);
    newCols = keptTracks.join(" ") || "1fr";
  }

  const parts = [];
  for (let i = 0; i < newRows.length; i++) {
    parts.push(newRows[i]);
    if (layout.hasExplicitRowSizes && i < newRowSizes.length) {
      parts.push(newRowSizes[i]);
    }
  }
  const newLayout = `${parts.join(" ")} / ${newCols}`;
  return updateLayoutDirective(stripped, newLayout);
}

/**
 * Build a custom single-column grid layout with a resizable/alignable main column.
 * Header and footer span all columns; main is placed left/center/right.
 *
 * @param {string} baseLayout - One of: header-content, focus, default, full-image.
 * @param {number} width - Main column width percentage (0-100).
 * @param {string} align - "left", "center", or "right".
 * @returns {string|null} Preset name at 100% centered width, otherwise a grid spec.
 */
export function buildSingleColumnCustomLayout(baseLayout, width, align, rowSizes = "") {
  const base = String(baseLayout || "")
    .trim()
    .toLowerCase();
  const gridTemplate = LayoutData.getGridTemplate(base);
  if (!gridTemplate) return null;

  let w = Math.min(100, Math.max(0, Number(width) || 0)) / 100;
  if (w >= 1) {
    if (align === "center") return base;
    // A left/right aligned full-width main column would look unchanged,
    // so default to an actual side-by-side split.
    w = 0.5;
  }

  const sep = gridTemplate.lastIndexOf(" / ");
  const areasPart = sep >= 0 ? gridTemplate.slice(0, sep) : gridTemplate;

  const rowRe = /"([^"]+)"\s*([^"]*)/g;
  const rows = [];
  let m;
  while ((m = rowRe.exec(areasPart))) {
    rows.push({
      cells: m[1].trim().split(/\s+/).filter(Boolean),
      size: m[2].trim(),
    });
  }

  let mainIdx = 1;
  let numCols = 3;
  if (align === "left") {
    mainIdx = 0;
    numCols = 2;
  } else if (align === "right") {
    mainIdx = 1;
    numCols = 2;
  }

  let mainFr;
  if (w >= 1) {
    mainFr = 999;
  } else if (numCols === 2) {
    mainFr = w / (1 - w);
  } else {
    mainFr = (2 * w) / (1 - w);
  }
  const mainFrStr = mainFr.toFixed(4);

  const newCols =
    align === "left"
      ? `${mainFrStr}fr 1fr`
      : align === "right"
        ? `1fr ${mainFrStr}fr`
        : `1fr ${mainFrStr}fr 1fr`;

  const rowSizeTokens = _splitTrackString(rowSizes);
  const useRowSizes = rowSizeTokens.length === rows.length;
  const newRows = rows.map((row, i) => {
    const token = row.cells[0];
    let newCells;
    if (token === "main") {
      if (numCols === 2) {
        newCells = align === "left" ? ["main", "."] : [".", "main"];
      } else {
        const cells = [".", ".", "."];
        cells[mainIdx] = "main";
        newCells = cells;
      }
    } else {
      newCells = Array(numCols).fill(token);
    }
    const sizeToken = useRowSizes ? rowSizeTokens[i] : row.size;
    const sizeStr = sizeToken ? ` ${sizeToken}` : "";
    return `"${newCells.join(" ")}"${sizeStr}`;
  });

  return `${newRows.join(" ")} / ${newCols}`;
}

/**
 * Parse a single-column custom grid (or known preset) to recover base, width, and align.
 *
 * @param {string} layoutValue
 * @returns {{base: string, width: number, align: string}|null}
 */
export function parseSingleColumnLayout(layoutValue) {
  const raw = String(layoutValue || "").trim();
  const key = raw.toLowerCase();

  if (!raw) {
    return { base: "default", width: 100, align: "center" };
  }
  if (["header-content", "focus", "default", "full-image"].includes(key)) {
    return { base: key, width: 100, align: "center" };
  }

  const sep = raw.lastIndexOf(" / ");
  if (sep === -1) return null;
  const areasPart = raw.slice(0, sep);
  const colsPart = raw.slice(sep + 3).trim();

  const rowRe = /"([^"]+)"\s*([^"]*)/g;
  const rows = [];
  let mm;
  while ((mm = rowRe.exec(areasPart))) {
    rows.push({
      cells: mm[1].trim().split(/\s+/).filter(Boolean),
      size: mm[2].trim(),
    });
  }

  const mainRow = rows.find((r) => r.cells.includes("main"));
  if (!mainRow) return null;
  const mainIdx = mainRow.cells.indexOf("main");
  const numCols = mainRow.cells.length;
  if (numCols > 3 || mainIdx < 0 || mainIdx > 2) return null;

  // Single-column layout: the main row may only contain 'main' and '.' fillers.
  for (let i = 0; i < mainRow.cells.length; i++) {
    if (i === mainIdx && mainRow.cells[i] !== "main") return null;
    if (i !== mainIdx && mainRow.cells[i] !== ".") return null;
  }

  const colTokens = _splitTrackString(colsPart);
  if (colTokens.length !== numCols || rows.some((row) => row.cells.length !== numCols)) return null;

  const mainTrack = colTokens[mainIdx];
  const frMatch = mainTrack.match(/^([\d.]+)fr$/i);
  const mainFr = frMatch ? parseFloat(frMatch[1]) : 1;
  const totalFr = colTokens.reduce((sum, t) => {
    const m = t.match(/^([\d.]+)fr$/i);
    return sum + (m ? parseFloat(m[1]) : 0);
  }, 0);
  let width = totalFr > 0 ? Math.round((mainFr / totalFr) * 100) : 100;
  if (width < 1) width = 100;

  let align;
  if (numCols === 1) {
    align = "center";
  } else if (numCols === 2 && mainIdx === 0) {
    align = "left";
  } else if (numCols === 2 && mainIdx === 1) {
    align = "right";
  } else if (numCols === 3 && mainIdx === 1) {
    align = "center";
  } else {
    return null;
  }

  const allCells = rows.flatMap((r) => r.cells);
  const uniqueAreas = new Set(allCells);
  uniqueAreas.delete(".");
  const areaArray = [...uniqueAreas];
  if (!areaArray.includes("main")) return null;

  // Reject title-slide and other non-standard single-column grids.
  if (areaArray.includes("title")) return null;

  let base;
  if (areaArray.includes("header") && areaArray.includes("footer")) {
    base = raw.includes("0.08fr") ? "focus" : "header-content";
  } else if (areaArray.length === 1 && areaArray[0] === "main") {
    base = "full-image";
  } else {
    return null;
  }

  return { base, width, align };
}

function _splitTrackString(trackStr) {
  const tokens = [];
  let depth = 0;
  let current = "";
  for (const ch of String(trackStr || "").trim()) {
    if (ch === "(") {
      depth++;
      current += ch;
    } else if (ch === ")") {
      depth--;
      current += ch;
    } else if (ch === " " && depth === 0) {
      if (current.trim()) tokens.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}
