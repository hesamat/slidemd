/**
 * Table directive grammar
 *
 * Tables are stored in Markdown as container directives that wrap a standard
 * markdown table:
 *
 *   ::: table { width=60 align=center fontSize=24 columns=2,1,3 borders=false striped=false }
 *   | A | B |
 *   | --- | --- |
 *   | 1 | 2 |
 *   :::
 *
 * This mirrors the `text-block` directive grammar: attributes use
 * `key=value` / bare-flag syntax inside `{ }` braces (NOT CSS-style
 * `key: value`). Unknown attributes are surfaced via `unknownAttrs` so the
 * AI validator can flag them instead of silently dropping them.
 *
 * Supported attributes:
 *   width           — table width as a percentage of the area (1–100)
 *   align           — left | center | right (default: center)
 *   fontSize        — table font size in px
 *   columns         — relative column weights, comma-separated (e.g. 2,1,3)
 *   borders         — true|false; false removes the table border (default: true)
 *   striped         — true|false; false disables zebra striping (default: true)
 *   no-header       — bare flag; hides the thead (for headerless tables)
 *
 * The legacy single-line `table {width: X%}` and `table {no-header}` forms
 * (colon-style) are still accepted by the markdown-it renderer for backwards
 * compatibility, but the PPTX converter and AI now emit the container form.
 */

const TABLE_DIRECTIVE_RE = /^:::\s*table\s*\{([^}]*)\}[ \t]*\r?\n([\s\S]*?)^:::[ \t]*$/gim;

/**
 * Canonical table attribute names — the curated list shown to humans and the
 * AI validator. Each entry is a single concept; aliases would go in
 * `TABLE_ATTRIBUTE_ALIASES` (currently empty).
 */
export const CANONICAL_TABLE_ATTRIBUTES = [
  "width",
  "align",
  "fontSize",
  "columns",
  "borders",
  "striped",
  "headerColor",
  "no-header",
];

const TABLE_ATTRIBUTE_ALIASES = [];

/**
 * Set of recognised table attribute names (lowercase), including aliases. Used
 * for case-insensitive lookup so the AI validator can flag unknown attributes.
 * `CANONICAL_TABLE_ATTRIBUTES` keeps the display names (camelCase); this set
 * holds their lowercase forms for parser lookups.
 */
export const KNOWN_TABLE_ATTRIBUTES = new Set([
  ...CANONICAL_TABLE_ATTRIBUTES.map((a) => a.toLowerCase()),
  ...TABLE_ATTRIBUTE_ALIASES.map((a) => a.toLowerCase()),
]);

/**
 * Parse a string of attribute tokens from a directive opening line.
 * Top-level tokens are either `key=value` pairs (value optionally quoted) or
 * bare flag names such as `no-header`, which resolve to "true".
 * Colon-style declarations (`key: value`) are unsupported: the key is
 * recorded as unknown and the value is skipped.
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
  const skipColonValue = () => {
    skipSpaces();
    if (i < s.length && s[i] === '"') {
      readQuoted();
      return;
    }
    i = s.length;
  };

  while (true) {
    const rawKey = readKey();
    if (rawKey === null) {
      if (i >= s.length) break;
      i++;
      continue;
    }
    // Lowercase keys for case-insensitive matching, consistent with the
    // marker-form tokenizer in `parseTableDirectiveAttrs`.
    const key = rawKey.toLowerCase();
    skipSpaces();
    if (i < s.length && s[i] === "=") {
      i++;
      skipSpaces();
      const value = i < s.length && s[i] === '"' ? readQuoted() : readUnquoted();
      attrs[key] = value;
      if (!KNOWN_TABLE_ATTRIBUTES.has(key)) unknown.push(key);
    } else if (i < s.length && s[i] === ":") {
      unknown.push(key);
      i++;
      skipColonValue();
    } else {
      attrs[key] = "true";
      if (!KNOWN_TABLE_ATTRIBUTES.has(key)) unknown.push(key);
    }
  }

  return { attrs, unknown };
}

/**
 * Characters and constructs that must never reach an inline style declaration.
 */
const CSS_UNSAFE_RE = /[<>"'`;{}\\]|url\s*\(|expression\s*\(|javascript:|@import|\/\*/i;

/**
 * Sanitise a CSS color value from a directive attribute. Accepts hex (`#rgb`,
 * `#rgba`, `#rrggbb`, `#rrggbbaa`), `rgb()`, `rgba()`, `hsl()`, `hsla()`. Named
 * colors and anything that could break out of the declaration are rejected.
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeCssColor(value) {
  const s = String(value ?? "").trim();
  if (!s || CSS_UNSAFE_RE.test(s)) return "";
  // Accept hex colors and rgb/rgba/hsl/hsla functions only.
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return s.toLowerCase();
  if (/^rgba?\([^)]*\)$/i.test(s)) return s;
  if (/^hsla?\([^)]*\)$/i.test(s)) return s;
  return "";
}

/**
 * Coerce a value to a finite number, or null when not numeric.
 * @param {unknown} value
 * @returns {number|null}
 */
function finiteNumber(value) {
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Convert a directive attribute value to a boolean. Defaults to true for bare
 * flags and "true"/"1"/"yes"; explicit "false"/"0"/"no" → false.
 * @param {string} v
 * @param {boolean} [defaultForBare=true]
 * @returns {boolean}
 */
function toBool(v, defaultForBare = true) {
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return defaultForBare;
}

/**
 * Normalise parsed attributes into a settings object.
 * @param {Record<string, string>} attrs
 * @returns {object}
 */
function attrsToSettings(attrs) {
  const width = finiteNumber(attrs.width);
  const fontSize = finiteNumber(attrs.fontsize);
  const columnsRaw = String(attrs.columns || "").trim();
  const columns =
    columnsRaw && /^[\d,.\s]+$/.test(columnsRaw)
      ? columnsRaw
          .split(",")
          .map((w) => parseFloat(w.trim()))
          .filter((w) => Number.isFinite(w) && w > 0)
      : null;
  const align = String(attrs.align || "")
    .trim()
    .toLowerCase();
  const headerColor = sanitizeCssColor(attrs.headercolor);
  return {
    width: width != null ? Math.max(1, Math.min(100, width)) : null,
    align: ["left", "center", "right"].includes(align) ? align : null,
    fontSize: fontSize != null ? Math.max(1, fontSize) : null,
    columns: columns && columns.length > 0 ? columns : null,
    borders: attrs["borders"] != null ? toBool(attrs["borders"], true) : null,
    striped: attrs["striped"] != null ? toBool(attrs["striped"], true) : null,
    headerColor: headerColor || null,
    noHeader: attrs["no-header"] != null ? toBool(attrs["no-header"], true) : false,
  };
}

/**
 * Parse all `::: table { ... }` container directives in a markdown string.
 * @param {string} markdown
 * @returns {Array<{start:number,end:number,settings:object,content:string,unknownAttrs:string[]}>}
 */
export function parseTableDirectives(markdown) {
  const results = [];
  let match;
  TABLE_DIRECTIVE_RE.lastIndex = 0;
  while ((match = TABLE_DIRECTIVE_RE.exec(markdown)) !== null) {
    const { attrs, unknown } = parseAttributes(match[1]);
    const start = match.index;
    const end = match.index + match[0].length;
    const content = (match[2] ?? "").replace(/\r\n/g, "\n").replace(/\n$/, "");
    results.push({
      start,
      end,
      content,
      unknownAttrs: unknown,
      settings: attrsToSettings(attrs),
    });
  }
  return results;
}

/**
 * Build the markdown container directive representation of a styled table.
 * Omits attributes that are null or at their default values.
 * @param {object} settings
 * @param {string} content — the markdown table (and optional caption) inside
 * @returns {string}
 */
export function buildTableDirective(settings, content) {
  const attrs = [];
  if (settings.width != null) attrs.push(`width=${settings.width}`);
  if (settings.align) attrs.push(`align=${settings.align}`);
  if (settings.fontSize != null) attrs.push(`fontSize=${settings.fontSize}`);
  if (settings.columns && settings.columns.length > 0) {
    attrs.push(`columns=${settings.columns.join(",")}`);
  }
  if (settings.borders === false) attrs.push("borders=false");
  if (settings.striped === false) attrs.push("striped=false");
  if (settings.headerColor) attrs.push(`headerColor="${settings.headerColor}"`);
  if (settings.noHeader) attrs.push("no-header");

  const open = attrs.length > 0 ? `::: table { ${attrs.join(" ")} }` : "::: table { }";
  const safeContent = content || "|  |\n| --- |\n";
  return `${open}\n${safeContent}\n:::`;
}

/**
 * Convert all `::: table { ... }` container directives in a markdown string
 * to a single-line marker that the markdown-it `table_style_directive` core
 * rule consumes. The marker uses `key=value` syntax (matching the container
 * grammar) so the renderer can apply all supported attributes.
 *
 * The marker line is emitted directly before the table content, replacing the
 * container wrapper. Tables without a directive are left untouched.
 * @param {string} markdown
 * @returns {string}
 */
export function convertTableDirectivesToMarkers(markdown) {
  const blocks = parseTableDirectives(markdown);
  if (!blocks.length) return markdown;
  let result = markdown;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const { start, end, settings, content } = blocks[i];
    const markerParts = [];
    if (settings.width != null) markerParts.push(`width=${settings.width}`);
    if (settings.align) markerParts.push(`align=${settings.align}`);
    if (settings.fontSize != null) markerParts.push(`fontSize=${settings.fontSize}`);
    if (settings.columns && settings.columns.length > 0) {
      markerParts.push(`columns=${settings.columns.join(",")}`);
    }
    if (settings.borders === false) markerParts.push("borders=false");
    if (settings.striped === false) markerParts.push("striped=false");
    if (settings.headerColor)
      markerParts.push(`headerColor=${quoteIfSpaced(settings.headerColor)}`);
    if (settings.noHeader) markerParts.push("no-header");

    const marker = markerParts.length > 0 ? `table {${markerParts.join(" ")}}\n\n` : "";
    const replacement = marker + content.trim();
    result = result.slice(0, start) + replacement + result.slice(end);
  }
  return result;
}

/**
 * Tokenize a `table { ... }` attribute string into top-level tokens, respecting
 * double-quoted values that may contain spaces (e.g. `headerColor="rgb(0, 0, 0)"`
 * or `columns="2, 1, 3"`). Whitespace outside quotes separates tokens.
 * @param {string} s
 * @returns {string[]}
 */
function tokenizeAttrString(s) {
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    let tok = "";
    while (i < s.length && !/\s/.test(s[i])) {
      if (s[i] === '"') {
        tok += s[i++];
        while (i < s.length && s[i] !== '"') tok += s[i++];
        if (i < s.length) tok += s[i++]; // closing quote
      } else {
        tok += s[i++];
      }
    }
    if (tok) tokens.push(tok);
  }
  return tokens;
}

/**
 * Quote a marker attribute value if it contains whitespace, so values like
 * `rgb(0, 0, 0)` or `2, 1, 3` survive the whitespace-separated marker
 * tokenizer.
 * @param {string} value
 * @returns {string}
 */
function quoteIfSpaced(value) {
  return /\s/.test(value) ? `"${value}"` : value;
}

/**
 * Parse a `table { ... }` directive attribute string into the meta fields
 * consumed by a markdown-it `table_open` renderer. Accepts both `key=value`
 * syntax (preferred, from the container form) and legacy `key: value` syntax
 * (for `width: X%` and `no-header` backwards compat). Returns null when no
 * recognised attributes are present (so the line stays plain text).
 *
 * Values containing spaces (e.g. `headerColor="rgb(0, 0, 0)"`) must be
 * double-quoted; the tokenizer is quote-aware and will not split inside quotes.
 *
 * Shared between `MarkdownParser.ensureMarkdownIt()` (runtime) and
 * `tools/md-to-deck.mjs` (build-time) so both rendering paths apply the same
 * table styling.
 * @param {string} attrString
 * @returns {object|null}
 */
export function parseTableDirectiveAttrs(attrString) {
  const s = String(attrString ?? "").trim();
  if (!s) return null;

  const result = {};
  let hasAny = false;

  const set = (key, value) => {
    result[key] = value;
    hasAny = true;
  };

  // Legacy colon-style: `width: 40%` and `no-header` (separated by `;`).
  // Always run this first so the new key=value tokenizer can override/extend.
  const widthColonMatch = /(?:^|;)\s*width\s*:\s*(\d+(?:\.\d+)?)\s*%\s*(?:;|$)/i.exec(s);
  const noHeaderColonMatch = /(?:^|;)\s*no-header\s*(?:;|$)/i.test(s);
  if (widthColonMatch) set("tableWidth", Math.max(1, Math.min(100, Number(widthColonMatch[1]))));
  if (noHeaderColonMatch) set("tableNoHeader", true);

  // New key=value / bare-flag tokenizer: handles `width=60 align=center
  // fontSize=24 columns=2,1,3 borders=false striped=false no-header`.
  // Quote-aware: double-quoted values may contain spaces (e.g.
  // headerColor="rgb(0, 0, 0)" or columns="2, 1, 3").
  const tokens = tokenizeAttrString(s);
  for (const tok of tokens) {
    const eqIdx = tok.indexOf("=");
    if (eqIdx > 0) {
      const key = tok.slice(0, eqIdx).toLowerCase();
      const value = tok.slice(eqIdx + 1).replace(/^"|"$/g, "");
      if (key === "width") {
        const n = parseFloat(value);
        if (Number.isFinite(n)) set("tableWidth", Math.max(1, Math.min(100, n)));
      } else if (key === "fontsize") {
        const n = parseFloat(value);
        if (Number.isFinite(n) && n > 0) set("tableFontSize", n);
      } else if (key === "align") {
        const v = value.toLowerCase();
        if (["left", "center", "right"].includes(v)) set("tableAlign", v);
      } else if (key === "columns") {
        const cols = value
          .split(",")
          .map((w) => parseFloat(w.trim()))
          .filter((w) => Number.isFinite(w) && w > 0);
        if (cols.length > 0) set("tableColumns", cols);
      } else if (key === "borders") {
        set("tableBorders", !(value === "false" || value === "0" || value === "no"));
      } else if (key === "striped") {
        set("tableStriped", !(value === "false" || value === "0" || value === "no"));
      } else if (key === "headercolor") {
        const safe = sanitizeCssColor(value);
        if (safe) set("tableHeaderColor", safe);
      } else if (key === "no-header") {
        set("tableNoHeader", !(value === "false" || value === "0" || value === "no"));
      }
      // Unknown keys are silently ignored here; the AI validator flags them.
    } else if (tok.toLowerCase() === "no-header") {
      set("tableNoHeader", true);
    }
  }

  return hasAny ? result : null;
}

/**
 * Apply a parsed table directive meta to a markdown-it instance. Installs:
 *   - a `table_style_directive` core rule that consumes `table { ... }` lines
 *     and attaches the parsed settings to the following `table_open` token.
 *   - a `table_open` renderer rule that applies the settings as inline style
 *     and class attributes, and injects a `<colgroup>` for column weights.
 *
 * Shared between `MarkdownParser.ensureMarkdownIt()` (runtime) and
 * `tools/md-to-deck.mjs` (build-time) so both rendering paths apply the same
 * table styling.
 * @param {import("markdown-it")} md
 */
export function applyTableDirectiveRenderer(md) {
  md.core.ruler.push("table_style_directive", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "inline") continue;
      const match = /^\s*table\s*\{([^}]*)\}\s*$/.exec(tokens[i].content || "");
      if (!match) continue;
      const parsed = parseTableDirectiveAttrs(match[1]);
      if (!parsed) continue;
      const prev = tokens[i - 1];
      const next = tokens[i + 1];
      if (prev?.type !== "paragraph_open" || next?.type !== "paragraph_close") continue;
      const tableOpen = tokens[i + 2];
      if (tableOpen?.type !== "table_open") continue;
      tokens.splice(i - 1, 3);
      i -= 2;
      if (!tableOpen.meta) tableOpen.meta = {};
      Object.assign(tableOpen.meta, parsed);
    }
  });

  const originalTableOpen = md.renderer.rules.table_open;
  md.renderer.rules.table_open = function (tokens, idx, options, env, slf) {
    const html = originalTableOpen
      ? originalTableOpen(tokens, idx, options, env, slf)
      : slf.renderToken(tokens, idx, options);
    const meta = tokens[idx]?.meta;
    if (!meta) return html;
    const styleParts = [];
    const classes = [];
    if (meta.tableWidth != null) styleParts.push(`width:${meta.tableWidth}%`);
    if (meta.tableFontSize != null) styleParts.push(`font-size:${meta.tableFontSize}px`);
    if (meta.tableAlign) {
      if (meta.tableAlign === "center") styleParts.push("margin-left:auto", "margin-right:auto");
      else if (meta.tableAlign === "left") styleParts.push("margin-left:0", "margin-right:auto");
      else if (meta.tableAlign === "right") styleParts.push("margin-left:auto", "margin-right:0");
    }
    if (meta.tableNoHeader) classes.push("table-no-header");
    if (meta.tableBorders === false) classes.push("table-borderless");
    if (meta.tableStriped === false) classes.push("table-no-stripes");
    if (meta.tableHeaderColor) styleParts.push(`--table-header-color:${meta.tableHeaderColor}`);
    const classAttr = classes.length ? ` class="${classes.join(" ")}"` : "";
    const styleAttr = styleParts.length ? ` style="${styleParts.join(";")}"` : "";
    let out = html;
    if (classAttr || styleAttr) {
      out = out.replace(/^<table/, `<table${classAttr}${styleAttr}`);
    }
    const cols = meta.tableColumns;
    if (cols && cols.length > 0) {
      const total = cols.reduce((a, b) => a + b, 0);
      const colgroup =
        `<colgroup>` +
        cols.map((w) => `<col style="width:${((w / total) * 100).toFixed(2)}%">`).join("") +
        `</colgroup>`;
      out = out.replace(/^<table[^>]*>/, (m) => m + colgroup);
    }
    return out;
  };
}
