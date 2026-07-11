/**
 * Directive Utilities
 *
 * Helper functions for reading and writing slide directives
 * (layout, background, etc.) in markdown source text.
 */

import { MarkdownParser } from "../../data/markdown-parser.js";
import { LayoutParser } from "../../data/layout-parser.js";

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

  const newAreas = newRows.map((row) => `"${row.join(" ")}"`).join(" ");
  const newLayout = `${newAreas} / ${layout.gridTemplateColumns}`;

  return updateLayoutDirective(stripped, newLayout);
}

/**
 * Remove an area from the slide's layout directive by switching to the
 * appropriate standard preset.
 *
 * - 3+ content columns → switch to "two-column"
 * - 2 content columns  → switch to "header-content"
 * - 1 content column   → no change (main area cannot be deleted)
 *
 * @param {string} markdown  — slide markdown source
 * @param {string} areaName  — area to remove (e.g. "media", "secondary")
 * @returns {string} updated markdown
 */
export function removeAreaFromLayout(markdown, areaName) {
  const name = String(areaName || "")
    .trim()
    .toLowerCase();
  if (!name) return markdown;

  const parser = new MarkdownParser();
  const { value: layoutValue, markdown: stripped } = parser.extractDirective(markdown, "layout");
  if (!layoutValue) return markdown;

  const resolved = LayoutParser.resolvePreset(layoutValue);
  const layout = LayoutParser.parse(resolved);
  const contentAreas = (layout.orderedAreas || []).filter(
    (a) => a !== "header" && a !== "footer" && a !== "title",
  );

  // How many content areas remain after removing the deleted one?
  const remaining = contentAreas.filter((a) => a !== name).length;

  let newLayout;
  if (remaining >= 2) {
    newLayout = "two-column";
  } else {
    newLayout = "header-content";
  }

  return updateLayoutDirective(stripped, newLayout);
}
