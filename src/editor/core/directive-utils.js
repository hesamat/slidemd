/**
 * Directive Utilities
 *
 * Helper functions for reading and writing slide directives
 * (layout, background, etc.) in markdown source text.
 */

import { MarkdownParser } from "../../data/markdown-parser.js";

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
