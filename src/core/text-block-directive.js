/**
 * Text block directive grammar
 *
 * Text blocks are stored in Markdown as container directives:
 *
 *   ::: text-block { x=120 y=450 rotate=15 color="#333" }
 *   Floating Text
 *   :::
 *
 * This module parses those directives, renders them to the HTML that the
 * slide renderer and editor expect, and serialises them back to the directive
 * form.  Keeping text blocks out of raw inline HTML keeps the source readable
 * for both humans and LLMs.
 */

import { escapeHtml } from "./utils.js";

const TEXT_BLOCK_RE = /^:::\s*text-block\s*\{([^}]*)\}\s*\r?\n([\s\S]*?)^:::\s*$/gim;

/**
 * Parse a string of attribute tokens from a directive opening line.
 * Tokens are either `key=value` pairs (value optionally quoted) or bare flag
 * names such as `float` or `bold`, which resolve to "true".
 * @param {string} attrString
 * @returns {Record<string, string>}
 */
function parseAttributes(attrString) {
  const attrs = {};
  const tokenRe = /([a-zA-Z][a-zA-Z0-9-]*)(?:\s*=\s*(?:"([^"]*)"|([^\s"]+)))?/g;
  let m;
  while ((m = tokenRe.exec(attrString)) !== null) {
    const key = m[1];
    attrs[key] = m[2] ?? m[3] ?? "true";
  }
  return attrs;
}

/**
 * Characters and constructs that must never reach an inline style declaration.
 */
const CSS_UNSAFE_RE = /[<>"'`;{}\\]|url\s*\(|expression\s*\(|javascript:|@import|\/\*/i;

/**
 * Sanitise a CSS value coming from a directive attribute.  Anything that could
 * terminate the declaration or smuggle in a resource load is dropped entirely.
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeCssValue(value) {
  const s = String(value ?? "").trim();
  if (!s || CSS_UNSAFE_RE.test(s)) return "";
  return s;
}

/**
 * Sanitise a text block identifier to a conservative token charset.
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeId(value) {
  return String(value ?? "").replace(/[^A-Za-z0-9_-]/g, "");
}

/**
 * Coerce a value to a finite number, or null when it is not numeric.
 * @param {unknown} value
 * @returns {number|null}
 */
function finiteNumber(value) {
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Convert a directive attribute value to a boolean.
 * @param {string} v
 * @returns {boolean}
 */
function toBool(v) {
  return v === "true" || v === "1" || v === "yes";
}

/**
 * Convert a directive attribute value to a number, defaulting to 0.
 * @param {string} v
 * @returns {number}
 */
function toNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Build the CSS style string for a text block from its settings.
 * @param {object} settings
 * @returns {string}
 */
function buildStyleString(settings) {
  const parts = [];
  const push = (prop, value) => {
    const safe = sanitizeCssValue(value);
    if (safe) parts.push(`${prop}:${safe}`);
  };
  const pushNum = (prop, value, suffix = "") => {
    const n = finiteNumber(value);
    if (n != null) parts.push(`${prop}:${n}${suffix}`);
  };

  if (settings.float) {
    parts.push("position:absolute");
    parts.push(`left:${Math.round(finiteNumber(settings.left) || 0)}px`);
    parts.push(`top:${Math.round(finiteNumber(settings.top) || 0)}px`);
  }
  if (settings.fontSize) pushNum("font-size", settings.fontSize, "px");
  push("color", settings.color);
  if (settings.backgroundColor && settings.backgroundColor !== "transparent") {
    push("background-color", settings.backgroundColor);
  }
  push("text-align", settings.textAlign);
  if (settings.opacity != null) pushNum("opacity", settings.opacity);
  if (settings.zIndex) pushNum("z-index", settings.zIndex);
  if (settings.rotation) {
    const n = finiteNumber(settings.rotation);
    if (n) parts.push(`transform:rotate(${n}deg)`);
  }
  push("font-weight", settings.fontWeight);
  push("font-style", settings.fontStyle);
  push("text-decoration", settings.textDecoration);
  if (settings.columnCount) {
    pushNum("column-count", settings.columnCount);
  } else {
    parts.push("white-space:pre-wrap");
  }
  return parts.join("; ");
}

/**
 * Render a text block as the HTML div the slide renderer and editor expect.
 * @param {object} settings
 * @param {string} content
 * @returns {string}
 */
export function buildTextBlockHtml(settings, content) {
  const isColumn = Boolean(settings.columnCount);
  const safeContent = isColumn ? content : escapeHtml(content).replace(/\n/g, "&#10;");
  const style = buildStyleString(settings);
  const cls = [
    "text-block",
    settings.float ? "text-block--float" : "",
    isColumn ? "text-block--multi-column" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const id = sanitizeId(settings.id);
  if (isColumn) {
    return `<div class="${cls}" data-id="${id}" style="${escapeHtml(style)}">\n\n${safeContent}\n\n</div>\n\n`;
  }
  return `<div class="${cls}" data-id="${id}" style="${escapeHtml(style)}">${safeContent}</div>\n\n`;
}

/**
 * Build the markdown directive representation of a text block.
 * @param {object} settings
 * @param {string} content
 * @returns {string}
 */
export function buildTextBlockDirective(settings, content) {
  const id = sanitizeId(settings.id);
  const color = sanitizeCssValue(settings.color);
  const backgroundColor = sanitizeCssValue(settings.backgroundColor);
  const textAlign = sanitizeCssValue(settings.textAlign);
  const attrs = [
    id ? `id="${id}"` : "",
    settings.float ? "float=true" : "",
    settings.float && settings.left ? `x=${Math.round(settings.left)}` : "",
    settings.float && settings.top ? `y=${Math.round(settings.top)}` : "",
    settings.fontSize && settings.fontSize !== 30 ? `fontSize=${settings.fontSize}` : "",
    color ? `color="${color}"` : "",
    backgroundColor && backgroundColor !== "transparent"
      ? `backgroundColor="${backgroundColor}"`
      : "",
    textAlign && textAlign !== "left" ? `align=${textAlign}` : "",
    settings.opacity != null && settings.opacity !== 1 ? `opacity=${settings.opacity}` : "",
    settings.zIndex ? `z=${settings.zIndex}` : "",
    settings.rotation ? `rotate=${settings.rotation}` : "",
    settings.columnCount ? `column-count=${Math.round(settings.columnCount)}` : "",
    settings.fontWeight === "bold" || settings.fontWeight === "700" ? "bold=true" : "",
    settings.fontStyle === "italic" ? "italic=true" : "",
    settings.textDecoration?.includes("underline") ? "underline=true" : "",
    settings.textDecoration?.includes("line-through") ? "strikethrough=true" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const open = attrs ? `::: text-block { ${attrs} }` : "::: text-block";
  const safeContent = content || "Text";
  return `${open}\n${safeContent}\n:::`;
}

/**
 * Parse all text-block directives in a markdown string.
 * @param {string} markdown
 * @returns {Array<{start:number,end:number,settings:object,content:string}>}
 */
export function parseTextBlockDirectives(markdown) {
  const results = [];
  let match;
  // Reset lastIndex in case of repeated calls
  TEXT_BLOCK_RE.lastIndex = 0;
  while ((match = TEXT_BLOCK_RE.exec(markdown)) !== null) {
    const attrs = parseAttributes(match[1]);
    const id = sanitizeId(attrs.id);
    const float = toBool(attrs.float);
    const left = toNum(attrs.x);
    const top = toNum(attrs.y);
    const fontSize = toNum(attrs.fontSize);
    const color = attrs.color || "";
    const backgroundColor = attrs.backgroundColor || attrs.background || "transparent";
    const textAlign = attrs.align || attrs.textAlign || "left";
    const opacity = toNum(attrs.opacity) || 1;
    const zIndex = toNum(attrs.z);
    const rotation = toNum(attrs.rotate);
    const columnCount = toNum(attrs.columnCount ?? attrs["column-count"]);
    const fontWeight = toBool(attrs.bold) ? "bold" : "";
    const fontStyle = toBool(attrs.italic) ? "italic" : "";
    const decorations = [];
    if (toBool(attrs.underline)) decorations.push("underline");
    if (toBool(attrs.strikethrough)) decorations.push("line-through");
    const textDecoration = decorations.join(" ") || "";

    const start = match.index;
    const end = match.index + match[0].length;
    const content = (match[2] ?? "").replace(/\r\n/g, "\n").replace(/\n$/, "");

    results.push({
      start,
      end,
      content,
      settings: {
        id,
        float,
        left,
        top,
        fontSize: fontSize || 30,
        color,
        backgroundColor,
        textAlign,
        opacity,
        zIndex,
        rotation,
        columnCount,
        fontWeight,
        fontStyle,
        textDecoration,
      },
    });
  }
  return results;
}

/**
 * Convert all text-block directives in a markdown string to inline HTML.
 * This lets the existing markdown-it renderer treat the body as escaped text
 * inside a div, matching the current visual editor contract.
 * @param {string} markdown
 * @returns {string}
 */
export function convertTextBlockDirectivesToHtml(markdown) {
  const blocks = parseTextBlockDirectives(markdown);
  if (!blocks.length) return markdown;
  let result = markdown;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const { start, end, settings, content } = blocks[i];
    const html = buildTextBlockHtml(settings, content);
    result = result.slice(0, start) + html + result.slice(end);
  }
  return result;
}

/**
 * Find a single text block directive by id and replace it with new settings/content.
 * @param {string} markdown
 * @param {string} id
 * @param {object} settings
 * @param {string} content
 * @returns {string|null} The updated markdown, or null if the block was not found.
 */
export function updateTextBlockDirective(markdown, id, settings, content) {
  if (!id) return null;
  const blocks = parseTextBlockDirectives(markdown);
  const block = blocks.find((b) => b.settings.id === id);
  if (!block) return null;
  const directive = buildTextBlockDirective(settings, content);
  return markdown.slice(0, block.start) + directive + markdown.slice(block.end);
}

/**
 * Find a single text block directive by id and remove it.
 * @param {string} markdown
 * @param {string} id
 * @returns {string|null} The updated markdown, or null if the block was not found.
 */
export function removeTextBlockDirective(markdown, id) {
  if (!id) return null;
  const blocks = parseTextBlockDirectives(markdown);
  const block = blocks.find((b) => b.settings.id === id);
  if (!block) return null;
  return markdown.slice(0, block.start) + markdown.slice(block.end);
}

/**
 * Build a legacy <div> text-block matcher by id.
 * @param {string} id
 * @returns {RegExp}
 */
function legacyTextBlockOpenRe(id) {
  return new RegExp(
    `<div\\b(?=[^>]*?\\bclass="[^"]*\\btext-block\\b[^"]*")(?=[^>]*?\\bdata-id="${id}")[^>]*>`,
    "i",
  );
}

/**
 * Replace a legacy inline-HTML text block with a directive.
 * @param {string} markdown
 * @param {string} id
 * @param {object} settings
 * @param {string} content
 * @returns {string|null}
 */
export function replaceLegacyTextBlock(markdown, id, settings, content) {
  const openMatch = markdown.match(legacyTextBlockOpenRe(id));
  if (!openMatch) return null;
  const start = openMatch.index;
  const end = markdown.indexOf("</div>", start + openMatch[0].length);
  if (end === -1) return null;
  return (
    markdown.slice(0, start) + buildTextBlockDirective(settings, content) + markdown.slice(end + 6)
  );
}

/**
 * Remove a legacy inline-HTML text block.
 * @param {string} markdown
 * @param {string} id
 * @returns {string|null}
 */
export function removeLegacyTextBlock(markdown, id) {
  const openMatch = markdown.match(legacyTextBlockOpenRe(id));
  if (!openMatch) return null;
  const end = markdown.indexOf("</div>", openMatch.index + openMatch[0].length);
  if (end === -1) return null;
  return markdown.slice(0, openMatch.index) + markdown.slice(end + 6);
}
