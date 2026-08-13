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
 *
 * Supported attributes (key=value or key="value", NOT key: value):
 *   id, float, x, y, fontSize, color, backgroundColor (alias: background),
 *   align (alias: textAlign), opacity, z, rotate, column-count (alias: columnCount),
 *   markdown, bold, italic, underline, strikethrough
 *
 * Freeform CSS (style, padding, margin, etc.) is NOT supported — use the
 * attributes above.  Unknown attributes are surfaced via `unknownAttrs` on
 * parsed blocks so the AI validator can flag them.
 */

import MarkdownIt from "markdown-it";
import { escapeHtml } from "./utils.js";

const textBlockMd = new MarkdownIt({ html: false });

// Source-map plugin: add data-source-line to block-level opening tags so
// clicking inside a pre-rendered multi-column text block still jumps to the
// correct source line. token.map[0] is the 0-indexed line within the content;
// buildTextBlockHtml offsets it by the directive's starting line.
const originalRenderToken = textBlockMd.renderer.renderToken.bind(textBlockMd.renderer);
textBlockMd.renderer.renderToken = function (tokens, idx, options, env) {
  const token = tokens[idx];
  if (token.map && token.type.endsWith("_open") && env?.sourceLine != null) {
    const line = env.sourceLine + 1 + token.map[0];
    token.attrPush(["data-source-line", String(line)]);
  }
  return originalRenderToken(tokens, idx, options, env);
};

const blockRules = ["fence", "code_block", "hr"];
for (const ruleName of blockRules) {
  const originalRule = textBlockMd.renderer.rules[ruleName];
  if (!originalRule) continue;
  textBlockMd.renderer.rules[ruleName] = function (tokens, idx, options, env, slf) {
    const token = tokens[idx];
    if (token.map && env?.sourceLine != null) {
      const line = env.sourceLine + 1 + token.map[0];
      token.attrPush(["data-source-line", String(line)]);
    }
    return originalRule(tokens, idx, options, env, slf);
  };
}

const TEXT_BLOCK_RE = /^:::\s*text-block\s*\{([^}]*)\}[ \t]*\r?\n([\s\S]*?)^:::\s*$/gim;

/**
 * Canonical text-block attribute names, one entry per concept — this is
 * what should be shown to humans or the AI (e.g. the validator's
 * "unsupported attribute" message) so the list doesn't read as ~20 near-
 * duplicate names. `background`, `textAlign`, and `columnCount` below are
 * accepted aliases for `backgroundColor`, `align`, and `column-count`
 * respectively; they're recognised by the parser (via KNOWN_TEXT_BLOCK_ATTRIBUTES)
 * but intentionally omitted here to keep the display list curated.
 */
export const CANONICAL_TEXT_BLOCK_ATTRIBUTES = [
  "id",
  "float",
  "x",
  "y",
  "fontSize",
  "color",
  "backgroundColor",
  "align",
  "opacity",
  "z",
  "rotate",
  "column-count",
  "markdown",
  "bold",
  "italic",
  "underline",
  "strikethrough",
];

const TEXT_BLOCK_ATTRIBUTE_ALIASES = ["background", "textAlign", "columnCount"];

/**
 * Set of recognised text-block attribute names, including aliases (after
 * alias normalisation the parser accepts either spelling). Used to detect
 * unknown attributes so the AI validator can flag them instead of silently
 * dropping the intended styling. Derived from CANONICAL_TEXT_BLOCK_ATTRIBUTES
 * so the two lists can't drift apart.
 */
export const KNOWN_TEXT_BLOCK_ATTRIBUTES = new Set([
  ...CANONICAL_TEXT_BLOCK_ATTRIBUTES,
  ...TEXT_BLOCK_ATTRIBUTE_ALIASES,
]);

/**
 * Parse a string of attribute tokens from a directive opening line.
 * Top-level tokens are either `key=value` pairs (value optionally quoted) or
 * bare flag names such as `float` or `bold`, which resolve to "true".
 * Colon-style declarations (`key: value`) are unsupported: the key is recorded
 * as unknown and the value is skipped so value fragments do not pollute the
 * attribute list.
 * @param {string} attrString
 * @returns {{attrs: Record<string, string>, unknown: string[]}}
 */
function parseAttributes(attrString) {
  const attrs = {};
  const unknown = [];
  const s = String(attrString ?? "").trim();

  let i = 0;
  const skipSpaces = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
  };
  const readKey = () => {
    skipSpaces();
    if (i >= s.length || !/[a-zA-Z]/.test(s[i])) return null;
    const start = i;
    i++;
    while (i < s.length && /[a-zA-Z0-9-]/.test(s[i])) i++;
    return s.slice(start, i);
  };
  const readQuoted = () => {
    let value = "";
    i++; // opening quote
    while (i < s.length && s[i] !== '"') {
      value += s[i];
      i++;
    }
    if (i < s.length) i++; // closing quote
    return value;
  };
  const readUnquoted = () => {
    let value = "";
    while (i < s.length && !/\s/.test(s[i])) value += s[i++];
    return value;
  };

  /**
   * Skip a colon-style value. For quoted values, the quoted string is
   * consumed and parsing continues. For unquoted values, the syntax is
   * ambiguous (CSS property names like `background` collide with known
   * text-block attribute names), so we skip to the end of the attribute
   * string. This means subsequent valid `key=value` attributes after an
   * unquoted colon-style value are not parsed — but colon-style is an
   * error case flagged for repair, so losing them is acceptable.
   */
  const skipColonValue = () => {
    skipSpaces();
    if (i < s.length && s[i] === '"') {
      readQuoted();
      return;
    }
    // Skip to end of attribute string — unquoted colon-style values
    // are ambiguous and unsupported.
    i = s.length;
  };

  while (true) {
    const key = readKey();
    if (key === null) {
      // Skip unexpected characters (e.g. commas between attributes) and
      // continue parsing instead of breaking, so `{ bold, italic }` or
      // `{ x=10, y=20 }` don't silently lose attributes after the separator.
      if (i >= s.length) break;
      i++;
      continue;
    }
    skipSpaces();
    if (i < s.length && s[i] === "=") {
      i++;
      skipSpaces();
      const value = i < s.length && s[i] === '"' ? readQuoted() : readUnquoted();
      attrs[key] = value;
      if (!KNOWN_TEXT_BLOCK_ATTRIBUTES.has(key)) unknown.push(key);
    } else if (i < s.length && s[i] === ":") {
      // Colon-style is unsupported; record only the key and ignore the value.
      unknown.push(key);
      i++;
      skipColonValue();
    } else {
      attrs[key] = "true";
      if (!KNOWN_TEXT_BLOCK_ATTRIBUTES.has(key)) unknown.push(key);
    }
  }

  return { attrs, unknown };
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
  } else if (!settings.markdown) {
    // Only apply pre-wrap for escaped plain-text mode.  Markdown-rendered
    // blocks contain block-level HTML (<p>, <ul>, etc.) where pre-wrap
    // would break normal flow.
    parts.push("white-space:pre-wrap");
  }
  return parts.join("; ");
}

/**
 * Render a text block as the HTML div the slide renderer and editor expect.
 *
 * Content is markdown-rendered when `columnCount` is set (multi-column flow)
 * or when `markdown` is explicitly enabled.  Otherwise the content is escaped
 * and shown as plain text with `white-space:pre-wrap` — this is the mode the
 * editor's inline `contenteditable` editing relies on.
 * @param {object} settings
 * @param {string} content
 * @param {number} [sourceLine=0] - 0-indexed line of the directive within the area.
 * @returns {string}
 */
export function buildTextBlockHtml(settings, content, sourceLine = 0) {
  const isColumn = Boolean(settings.columnCount);
  const renderMarkdown = isColumn || Boolean(settings.markdown);
  const safeContent = renderMarkdown
    ? textBlockMd.render(content, { sourceLine })
    : escapeHtml(content).replace(/\n/g, "&#10;");
  const style = buildStyleString(settings);
  const cls = [
    "text-block",
    settings.float ? "text-block--float" : "",
    isColumn ? "text-block--multi-column" : "",
    settings.markdown ? "text-block--markdown" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const id = sanitizeId(settings.id);
  return `<div class="${cls}" data-id="${id}" data-source-line="${sourceLine}" style="${escapeHtml(style)}">${safeContent}</div>\n\n`;
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
    settings.markdown ? "markdown=true" : "",
    settings.fontWeight === "bold" || settings.fontWeight === "700" ? "bold=true" : "",
    settings.fontStyle === "italic" ? "italic=true" : "",
    settings.textDecoration?.includes("underline") ? "underline=true" : "",
    settings.textDecoration?.includes("line-through") ? "strikethrough=true" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const open = attrs ? `::: text-block { ${attrs} }` : "::: text-block { }";
  const safeContent = content || "Text";
  return `${open}\n${safeContent}\n:::`;
}

/**
 * Parse all text-block directives in a markdown string.
 * @param {string} markdown
 * @returns {Array<{start:number,end:number,settings:object,content:string,unknownAttrs:string[]}>}
 */
export function parseTextBlockDirectives(markdown) {
  const results = [];
  let match;
  // Reset lastIndex in case of repeated calls
  TEXT_BLOCK_RE.lastIndex = 0;
  while ((match = TEXT_BLOCK_RE.exec(markdown)) !== null) {
    const { attrs, unknown } = parseAttributes(match[1]);
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
    const markdownFlag = toBool(attrs.markdown);
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
      unknownAttrs: unknown,
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
        markdown: markdownFlag,
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
    const sourceLine = markdown.slice(0, start).split("\n").length - 1;
    const html = buildTextBlockHtml(settings, content, sourceLine);
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
