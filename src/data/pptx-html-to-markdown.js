/**
 * HTML-to-Markdown converter for PPTX content.
 *
 * Converts HTML strings produced by pptxtojson into GitHub-flavored
 * Markdown. Handles inline formatting (bold, italic, monospace),
 * block elements (paragraphs, lists, pre blocks), CSS-based
 * bullet detection, and font-size-based heading detection.
 */

// Font-size thresholds for heading detection (in points).
// Maps font-size bands to markdown heading levels to preserve visual hierarchy.
// Based on typical PowerPoint default font sizes:
// Title: 36-46pt, Subtitle: 28-34pt, Body: 18-24pt, Small: 12-14pt
const HEADING_BANDS = [
  { min: 46, prefix: "# " },
  { min: 34, prefix: "## " },
  { min: 28, prefix: "### " },
];

// Monospace font-family pattern for detecting code content
const MONOSPACE_PATTERN =
  /font-family:\s*(?:consolas|courier\s*new|courier|lucida\s*console|monaco|monospace)/i;

// Heuristic for detecting a single code line. Used to prevent heading
// detection from swallowing code that happens to be rendered at a
// heading-sized font (common in PPTX code examples: 28-32pt is typical
// for a code block on a slide, which overlaps the ### band).
// Patterns are intentionally narrow — the check is gated by isAllMonospace,
// so false positives on natural language are unlikely (a monospace paragraph
// with `x = y` is almost certainly code, not a heading). The primary
// heading-vs-code signal is the PPTX placeholder type (title placeholders
// are always headings); this regex is only the fallback for non-title
// text boxes where font size alone is ambiguous.
// Covers C-style control flow (if/for/while with parens), Python REPL
// prompts (`>>>`, `...`), and traceback lines — all unambiguously code.
const CODE_LINE_PATTERN =
  /^\s*(>>>|\.\.\.|def\s+\w|function\s+\w|class\s+\w|const\s+\w|let\s+\w|var\s+\w|import\s+[\w{#]|#include|for\s*\(|while\s*\(|if\s*\(|elif\s|else\s|return\s|try\s|catch\s|from\s+\w|async\s|await\s|void\s+\w|print\s*\(|console\.|self\.|this\.|<\/?\w+>|f['"]|Traceback|File\s+"|\w+\s*[=:]\s*\S|\w+\.\w+\(|\w+\[)/;

// Bullet glyphs PowerPoint authors sometimes type as literal text runs.
// Matches a leading glyph followed by whitespace, end of line, or any other
// character — so "•item" (no space) normalizes to "- item" as well.
const BULLET_GLYPH_START = /^([•◦‣▪●○■])(?:\s+|$|(?=\S))/;

/**
 * Convert a leading bullet glyph ("• item") into a markdown bullet ("- item").
 * Used for plain paragraphs where the glyph is the only list signal.
 * @param {string} text
 * @returns {string}
 */
function normalizeBulletGlyphs(text) {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trimStart();
      const m = trimmed.match(BULLET_GLYPH_START);
      if (!m) return line;
      const indent = line.slice(0, line.length - trimmed.length);
      return indent + "- " + trimmed.slice(m[0].length);
    })
    .join("\n");
}

/**
 * Strip a leading bullet glyph from text that already carries a list marker
 * (used inside <li> items so "- • item" collapses to "- item").
 * @param {string} text
 * @returns {string}
 */
function stripBulletGlyphs(text) {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trimStart();
      const m = trimmed.match(BULLET_GLYPH_START);
      if (!m) return line;
      const indent = line.slice(0, line.length - trimmed.length);
      return indent + trimmed.slice(m[0].length);
    })
    .join("\n");
}

/**
 * True when the line contains only one or two bullet markers ("-", "- -",
 * "--", "• •") and no content. This is the residue of an empty text box or
 * sub-bullet. Divider lines (three or more markers) are preserved.
 * @param {string} text
 * @returns {boolean}
 */
export function isMarkerOnly(text) {
  return /^([-*•◦‣▪●○■](?:\s*[-*•◦‣▪●○■])?)\s*$/.test(text.trim());
}

/**
 * True when the line is a divider — three or more bullet markers, adjacent
 * or spaced ("---", "- - -", "***", "• • •"). formatTextElement converts it
 * to a markdown horizontal rule ("***").
 * @param {string} text
 * @returns {boolean}
 */
export function isDividerLine(text) {
  return /^([-*•◦‣▪●○■](?:\s*[-*•◦‣▪●○■]){2,})\s*$/.test(text.trim());
}

/**
 * True when a line starts with a bullet marker — used to keep heading
 * detection from turning bullet lines into headings. Numbered lines ("3.
 * Data Structures") are real headings when they are large-font titles.
 * @param {string} text
 * @returns {boolean}
 */
function isBulletLine(text) {
  return /^[-*•]\s/.test(text.trimStart());
}

/**
 * Drop the previous bullet's trailing blank line so a new bullet (or list)
 * joins it tightly. Handles both the single-entry form (paragraph ending in
 * "\n\n") and the split-entry form (<ul>/<ol> push their trailing
 * separator as a separate "\n" entry).
 * @param {string[]} out
 * @param {boolean} lastOutputWasBullet
 */
function tightenPreviousBullet(out, lastOutputWasBullet) {
  if (!lastOutputWasBullet) return;
  const last = out[out.length - 1];
  if (typeof last === "string" && last.endsWith("\n\n")) {
    out[out.length - 1] = last.slice(0, -2) + "\n";
  } else if (last === "\n") {
    out.pop();
  }
}

/**
 * Collapse duplicate whitespace (multiple spaces, tabs, nbsp) outside fenced
 * code blocks and backtick-wrapped inline code, and strip trailing spaces.
 * Leading indentation (nested list markers) is preserved.
 * @param {string} md
 * @returns {string}
 */
function collapseDuplicateWhitespace(md) {
  const lines = md.split("\n");
  let inFence = false;
  const collapseSegment = (segment) =>
    segment.replace(/(?<=\S)[ \t\u00a0]{2,}(?=\S)/g, " ").replace(/(?<=\S)\t(?=\S)/g, " ");
  return lines
    .map((line) => {
      // Fence lines (opening and closing) are returned untouched.
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      // Preserve inline code spans exactly; collapse whitespace only in the
      // plain-text segments between them. Trailing whitespace is stripped
      // once from the whole line, not per segment, so the space before an
      // inline code snippet survives.
      const parts = line.split(/(`[^`]+`)/);
      const collapsed = parts
        .map((part, i) => {
          if (i % 2 === 1) return part;
          // A whitespace-only segment between two inline-code spans (e.g.
          // "`a`    `b`") collapses to a single space so code stays
          // separated but not padded. Leading/trailing line whitespace is
          // not touched here.
          if (/^[ \t\u00a0]+$/.test(part) && i > 0 && i < parts.length - 1) return " ";
          return collapseSegment(part);
        })
        .join("");
      return collapsed.replace(/[ \t\u00a0]+$/g, "");
    })
    .join("\n");
}

/**
 * Extract the largest font size from a DOM element's child spans.
 * Returns 0 if no font-size is found.
 * @param {Element} element
 * @returns {number}
 */
function getLargestFontSize(element) {
  let maxSize = 0;
  const spans = element.querySelectorAll("span");
  for (const span of spans) {
    const style = span.getAttribute("style") || "";
    const match = style.match(/font-size:\s*(\d+(?:\.\d+)?)\s*pt/i);
    if (match) {
      const size = parseFloat(match[1]);
      if (size > maxSize) maxSize = size;
    }
  }
  return maxSize;
}

/**
 * True when the text consists only of markdown emphasis punctuation
 * (underscores, asterisks, tildes, backticks). Wrapping such content in
 * emphasis markers produces fragile adjacency like "**__**name**__**",
 * which the spacing fix below mangles into "**__** name** __**". A bold or
 * italic run containing only punctuation is almost always a highlight
 * artifact (e.g. the "__" halves of "__name__"), so emit it as plain text.
 * @param {string} text
 * @returns {boolean}
 */
function isEmphasisPunctuation(text) {
  return /^[\s*_~`()[\]{}]+$/.test(text);
}

/**
 * Check if all text content in a DOM element is monospace.
 * Returns true when the element contains at least one monospace span and every
 * non-whitespace text node / span / inline child is monospace. A paragraph
 * mixing prose with monospace runs is therefore not treated as code, while a
 * code line with highlighted runs (all monospace) is.
 * @param {Element} element
 * @returns {boolean}
 */
export function isAllMonospace(element) {
  let sawMono = false;
  const check = (node) => {
    if (node.nodeType === 3) {
      // Plain text outside a span breaks the code-only property, but
      // whitespace-only runs (e.g. blank spacer lines) are fine.
      return node.textContent.trim() === "";
    }
    if (node.nodeType !== 1) return true;
    if (node.tagName === "BR") return true;
    if (node.tagName === "SPAN") {
      const style = node.getAttribute("style") || "";
      if (!MONOSPACE_PATTERN.test(style)) {
        // Whitespace-only spacer runs (e.g. leading indentation styled with
        // the body font in PowerPoint) do not break the code-only property.
        if ((node.textContent || "").trim() === "") return true;
        return false;
      }
      sawMono = true;
      return true;
    }
    if (node.tagName === "A") return false;
    for (const child of node.childNodes) {
      if (!check(child)) return false;
    }
    return true;
  };
  for (const child of element.childNodes) {
    if (!check(child)) return false;
  }
  return sawMono;
}

/**
 * Render a single line of code as inline code, using double-backtick
 * delimiters when the text itself contains a backtick (so the span stays
 * valid markdown).
 * @param {string} text
 * @returns {string}
 */
function renderInlineCode(text) {
  return text.includes("`") ? "`` " + text + " ``" : "`" + text + "`";
}

/**
 * Join the parts produced by processBlockNodes into markdown. Parts are plain
 * strings (paragraphs, lists, headings) or `{ code: string }` objects emitted
 * for all-monospace paragraphs. Consecutive code parts are grouped into a
 * single fenced code block; a lone code part stays inline code unless it is
 * long enough to warrant a fence.
 * @param {Array<string | { code: string }>} parts
 * @returns {string}
 */
function assembleOutput(parts) {
  const out = [];
  let fence = null;
  const flushFence = () => {
    if (!fence) return;
    if (fence.length === 1) {
      const line = fence[0];
      if (line.length <= 80) {
        out.push(renderInlineCode(line) + "\n\n");
      } else {
        out.push("```\n" + line + "\n```\n\n");
      }
    } else {
      out.push("```\n" + fence.join("\n") + "\n```\n\n");
    }
    fence = null;
  };
  for (const part of parts) {
    if (part && typeof part === "object" && typeof part.code === "string") {
      if (!fence) fence = [];
      fence.push(part.code);
    } else {
      flushFence();
      out.push(part);
    }
  }
  flushFence();
  return out.join("");
}

/**
 * Convert HTML to Markdown using native DOM parsing.
 * @param {string} html
 * @param {object} [opts]
 * @param {string} [opts.placeholderType] - PPTX placeholder type from the
 *   element's name attribute ('title', 'footer', 'date', 'slideNumber').
 *   When 'title', heading detection is forced (a title placeholder is a
 *   heading regardless of font size or monospace content) so monospace
 *   code-like text in a title placeholder is still treated as a heading.
 * @returns {string}
 */
export function htmlToMarkdown(html, opts = {}) {
  if (!html) return "";

  // Detect CSS-based bullets: PowerPoint uses text-indent: -XXpt
  // (negative hanging indent) to create space for the bullet marker
  // without using <ul>/<li>.  A negative text-indent >= 10pt is a
  // reliable signal of bullet formatting, regardless of whether
  // margin-left is also present.
  const withBullets = html.replace(/<p\s+style="([^"]*)">([\s\S]*?)<\/p>/gi, (match, style) => {
    const m = style.match(/text-indent:\s*-(\d+)/);
    if (!m) return match;
    const indent = parseInt(m[1], 10);
    if (indent >= 10) return `<li>${match}</li>`;
    return match;
  });

  // DOMParser normalizes the HTML.  Existing <ul><li> structures are
  // preserved.  Standalone <li> tags (from CSS bullet detection) are
  // placed directly under <body> and handled by processBlockNodes.
  const doc = new DOMParser().parseFromString(withBullets, "text/html");
  const body = doc.body;

  const result = [];
  processBlockNodes(body.childNodes, result, { placeholderType: opts.placeholderType });
  let md = assembleOutput(result);
  // Collapse 3+ consecutive newlines to two, but preserve blank lines inside
  // fenced code blocks (a code block with intentional double blank lines
  // would otherwise be squashed).
  md = md
    .split(/(^```\n[\s\S]*?\n```)/m)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/\n{3,}/g, "\n\n")))
    .join("");

  // Collapse duplicate whitespace (trailing spaces, tabs, nbsp runs) outside
  // fenced code blocks and backtick-wrapped inline code.
  md = collapseDuplicateWhitespace(md);

  // Escape < characters so literal angle brackets in PPTX text (e.g. "a < b")
  // are not misread as HTML tags by markdown-it. > is escaped only at the start
  // of a line, where markdown would interpret it as a blockquote; elsewhere it
  // is left as-is to avoid ugly &gt; in the source. Content inside backticks
  // and fenced code blocks is preserved as-is.
  md = md
    .split(/(`[^`]+`|^```\n[\s\S]*?\n```)/m)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/</g, "&lt;").replace(/^>/gm, "&gt;")))
    .join("");
  return md.trim();
}

/**
 * Strip all HTML tags, returning plain text only.
 * @param {string} html
 * @returns {string}
 */
/**
 * Escape a string for safe inclusion inside inline HTML (e.g. when the
 * converter emits raw HTML elements). Escapes the five XML-significant
 * characters so user text can never break out of an attribute or tag.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return (text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Clean a list item's raw text: strip literal bullet glyphs the author
 * typed (the <li> already provides the marker), escape divider items'
 * markers so they aren't misread as horizontal rules, and merge adjacent
 * bullet markers. Returns empty string for marker-only residue.
 * @param {string} rawItem
 * @returns {string}
 */
function cleanListItemText(rawItem) {
  const merged = isDividerLine(rawItem)
    ? rawItem.replace(/[-*]/g, (m) => `\\${m}`)
    : stripBulletGlyphs(mergeAdjacentMarkers(rawItem));
  return isMarkerOnly(merged) ? "" : merged;
}

/**
 * Find all-monospace <p>/<div> nodes that are part of a run of 2+
 * consecutive monospace paragraphs. A run of consecutive monospace
 * paragraphs is almost certainly a code block, not a sequence of
 * headings. Title placeholders are excluded — a title is always a
 * single heading, never part of a code run.
 * @param {NodeList} nodes
 * @param {boolean} isTitlePlaceholder
 * @returns {Set<Node>}
 */
function findMonospaceRunNodes(nodes, isTitlePlaceholder) {
  const runNodes = new Set();
  if (isTitlePlaceholder) return runNodes;
  const blockNodes = [];
  for (const node of nodes) {
    if (
      node.nodeType === 1 &&
      (node.tagName === "P" || node.tagName === "DIV") &&
      isAllMonospace(node)
    ) {
      blockNodes.push(node);
    } else if (blockNodes.length > 0) {
      if (blockNodes.length >= 2) blockNodes.forEach((n) => runNodes.add(n));
      blockNodes.length = 0;
    }
  }
  if (blockNodes.length >= 2) blockNodes.forEach((n) => runNodes.add(n));
  return runNodes;
}

/**
 * Try to emit a heading from a <p>/<div> node. Returns true if a heading
 * was emitted, false if the node should fall through to code/inline handling.
 *
 * Heading detection uses three signals in priority order:
 * 1. Title placeholder — always a heading (structural ground truth).
 * 2. Monospace run membership — code, not a heading (skip).
 * 3. CODE_LINE_PATTERN — isolated monospace code line (skip).
 * @param {Element} node
 * @param {string[]} out
 * @param {object} ctx
 * @returns {boolean}
 */
function tryHeading(node, out, ctx) {
  const { isTitlePlaceholder, monospaceRunNodes } = ctx;
  const headingFontSize = getLargestFontSize(node);
  const headingBand = HEADING_BANDS.find((b) => headingFontSize >= b.min);
  if (!headingBand) return false;

  const inMonospaceRun = monospaceRunNodes.has(node);
  if (inMonospaceRun) return false;

  const looksLikeCodeLine =
    !isTitlePlaceholder && isAllMonospace(node) && CODE_LINE_PATTERN.test(node.textContent || "");
  if (looksLikeCodeLine) return false;

  const headingInline = [];
  // Code mode so monospace spans don't get backtick-wrapped.
  processInlineNodes(node.childNodes, headingInline, { code: true });
  const headingTrimmed = normalizeBulletGlyphs(mergeAdjacentMarkers(headingInline.join(""))).trim();
  if (!headingTrimmed || isBulletLine(headingTrimmed) || isMarkerOnly(headingTrimmed)) {
    return false;
  }
  if (headingTrimmed.length > 80) return false;

  out.push(`${headingBand.prefix}${headingTrimmed}\n\n`);
  return true;
}

/**
 * Emit an all-monospace paragraph as a code line (grouped into fences
 * by assembleOutput). Returns true if emitted, false if not monospace.
 * @param {Element} node
 * @param {string[]} out
 * @returns {boolean}
 */
function tryCodeLine(node, out) {
  if (!isAllMonospace(node)) return false;
  const codeInline = [];
  processInlineNodes(node.childNodes, codeInline, { code: true });
  const codeLine = codeInline.join("").replace(/[ \t\u00a0]+$/, "");
  if (codeLine) out.push({ code: codeLine });
  return true;
}

/**
 * Escape `#` at the start of lines so PPTX text like "# Print using..."
 * is preserved as literal text. Skips lines inside fenced code blocks
 * and lines starting with backticks (inline code).
 * @param {string} text
 * @returns {string}
 */
function escapeLeadingHash(text) {
  const lines = text.split("\n");
  let inCodeBlock = false;
  return lines
    .map((line) => {
      const t = line.trim();
      if (t === "```") {
        inCodeBlock = !inCodeBlock;
        return line;
      }
      if (inCodeBlock || /^`/.test(t)) return line;
      return line.replace(/^#/gm, "\\#");
    })
    .join("\n");
}

/**
 * Process a <p>/<div> node: heading, code, or inline paragraph.
 * @param {Element} node
 * @param {string[]} out
 * @param {object} ctx
 * @param {object} state
 * @returns {boolean} true if lastOutputWasBullet should be set
 */
function processParagraph(node, out, ctx, state) {
  if (tryHeading(node, out, ctx)) return false;
  if (tryCodeLine(node, out)) return false;

  const inline = [];
  processInlineNodes(node.childNodes, inline);
  const rawJoined = inline.join("");
  const isDivider = isDividerLine(rawJoined.trim());
  const merged = isDivider
    ? rawJoined.trim()
    : normalizeBulletGlyphs(mergeAdjacentMarkers(rawJoined));
  const trimmed = merged.trim();
  const isResidue = isMarkerOnly(trimmed) && !isDivider;
  if (!trimmed || isResidue) return state.lastOutputWasBullet;

  const escaped = escapeLeadingHash(merged);
  const isGlyphBullet = isBulletLine(trimmed) && !isDivider;
  if (isGlyphBullet) tightenPreviousBullet(out, state.lastOutputWasBullet);
  out.push(escaped + "\n\n");
  return isGlyphBullet;
}

/**
 * Process a standalone <li> (from CSS bullet detection).
 * @param {Element} node
 * @param {string[]} out
 * @param {object} state
 * @returns {boolean} true if lastOutputWasBullet should be set
 */
function processListItem(node, out, state) {
  const inline = [];
  processInlineNodes(node.childNodes, inline);
  const merged = cleanListItemText(inline.join("").trim());
  if (!merged) return state.lastOutputWasBullet;

  let indent = state.lastWasOl ? "   " : "";
  if (!indent) {
    const innerP = node.querySelector("p");
    if (innerP) {
      const pStyle = innerP.getAttribute("style") || "";
      const mlMatch = pStyle.match(/margin-left:\s*([\d.]+)pt/);
      if (mlMatch) {
        const ml = parseFloat(mlMatch[1]);
        if (ml < state.minMarginLeft) state.minMarginLeft = ml;
        if (state.minMarginLeft !== Infinity && ml > state.minMarginLeft + 5) {
          indent = "   ";
        }
      }
    }
  }
  tightenPreviousBullet(out, state.lastOutputWasBullet);
  out.push(indent + "- " + merged + "\n");
  return true;
}

/**
 * Process block-level nodes and accumulate markdown output.
 * @param {NodeList} nodes
 * @param {string[]} out
 * @param {object} [ctx]
 * @param {string} [ctx.placeholderType] - PPTX placeholder type. When
 *   'title', heading detection is forced.
 */
function processBlockNodes(nodes, out, ctx = {}) {
  const isTitlePlaceholder = ctx.placeholderType === "title";
  const monospaceRunNodes = findMonospaceRunNodes(nodes, isTitlePlaceholder);
  const headingCtx = { isTitlePlaceholder, monospaceRunNodes };

  const counters = {};
  const state = {
    lastListType: null,
    lastWasOl: false,
    minMarginLeft: Infinity,
    lastOutputWasBullet: false,
  };

  for (const node of nodes) {
    if (node.nodeType === 3) {
      if (node.textContent.trim()) {
        state.lastOutputWasBullet = false;
        out.push(node.textContent);
      }
      continue;
    }
    if (node.nodeType !== 1) continue;

    const tag = node.tagName;

    if (tag === "UL" || tag === "OL") {
      const reset = !(state.lastListType && state.lastListType === tag);
      tightenPreviousBullet(out, state.lastOutputWasBullet);
      processList(node, 0, out, counters, { reset });
      out.push("\n");
      state.lastOutputWasBullet = true;
      state.lastListType = tag;
      state.lastWasOl = tag === "OL";
      state.minMarginLeft = Infinity;
      continue;
    }
    // Non-list blocks break the list continuation chain.
    if (tag !== "P" && tag !== "DIV" && tag !== "LI") {
      state.lastListType = null;
      state.lastWasOl = false;
      state.minMarginLeft = Infinity;
    }

    if (tag === "LI") {
      state.lastOutputWasBullet = processListItem(node, out, state);
      continue;
    }

    if (tag === "TABLE") {
      state.lastOutputWasBullet = false;
      continue;
    }

    if (tag === "PRE") {
      const text = node.textContent || "";
      if (text.trim()) out.push("```\n" + text + "\n```\n\n");
      state.lastOutputWasBullet = false;
      continue;
    }

    if (tag === "P" || tag === "DIV") {
      state.lastOutputWasBullet = processParagraph(node, out, headingCtx, state);
      continue;
    }

    if (tag === "BR") {
      state.lastOutputWasBullet = false;
      out.push("\n");
      continue;
    }

    // Fallback: inline any other element.
    const inline = [];
    processInlineNodes(node.childNodes, inline);
    const merged = mergeAdjacentMarkers(inline.join(""));
    if (merged.trim()) {
      state.lastOutputWasBullet = false;
      out.push(merged + "\n\n");
    }
  }
}

/**
 * Convert a 1-based index to a lowercase alphabetic marker, Excel-style
 * (1 -> a, 26 -> z, 27 -> aa). Used for nested ordered-list items.
 * @param {number} n
 * @returns {string}
 */
function toLetter(n) {
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(97 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Process a list element and its children with proper indentation.
 *
 * Counters are shared across the whole text box so that adjacent lists of the
 * same type (which PowerPoint often splits into separate <ol>/<ul> blocks)
 * continue numbering instead of restarting. A list only resets its own depth
 * counter when `reset` is true — true for genuine sub-lists nested inside an
 * <li> (each parent item gets its own 1/a sequence) and for the first list of
 * a type, but false when this list is a continuation of a preceding sibling.
 *
 * @param {Element} listNode
 * @param {number} depth
 * @param {string[]} out
 * @param {Record<number, number>} counters
 * @param {{ reset?: boolean }} [opts]
 */
function processList(listNode, depth, out, counters, { reset = true } = {}) {
  if (!counters) counters = {};
  const isOrdered = listNode.tagName === "OL";
  if (reset || counters[depth] === undefined) {
    // Honour the HTML start attribute (e.g. <ol start="5">) so lists that
    // begin mid-sequence render with the correct first number. Only apply
    // when the attribute is actually present — omitting it means default 1.
    const rawStart = isOrdered ? listNode.getAttribute?.("start") : null;
    const start = rawStart != null && isFinite(Number(rawStart)) ? Number(rawStart) : 1;
    counters[depth] = start - 1;
  }

  // When every item in a top-level list has heading-sized fonts (>= 34pt,
  // the `##` band), the list is a visual heading sequence (e.g. "1. Sequence
  // / 2. Selection" rendered at 72pt). Emit each item as a heading with its
  // number prefix instead of a markdown list — headings inside <li> don't
  // render as headings, and plain list items lose the visual hierarchy.
  // The 34pt threshold excludes normal body text (28pt `###` band) which is
  // just slightly-larger body copy, not a heading sequence.
  const HEADING_LIST_MIN = HEADING_BANDS.find((b) => b.prefix === "## ").min;
  const liChildren = Array.from(listNode.children).filter((c) => c.tagName === "LI");
  const allHeadingSized =
    depth === 0 &&
    liChildren.length >= 2 &&
    liChildren.every((li) => {
      const fs = getLargestFontSize(li);
      return fs >= HEADING_LIST_MIN;
    });

  // Track the last emitted list item so a nested list that appears as a
  // direct child of this list (PowerPoint emits <ol> as a sibling of <li>,
  // not wrapped inside the <li>) is attached to the preceding item. Such a
  // nested list continues the parent's sequence, so it is not reset.
  let lastItemPushed = false;

  for (const child of listNode.children) {
    if (child.tagName === "UL" || child.tagName === "OL") {
      if (lastItemPushed) {
        processList(child, depth + 1, out, counters, { reset: false });
      }
      continue;
    }
    if (child.tagName !== "LI") continue;

    const inline = [];
    const nestedLists = [];
    for (const cn of child.childNodes) {
      if (cn.nodeType === 1 && (cn.tagName === "UL" || cn.tagName === "OL")) {
        nestedLists.push(cn);
      } else {
        processInlineNodes([cn], inline);
      }
    }
    // Clean the item text: strip literal glyphs, escape dividers, skip residue.
    const merged = cleanListItemText(inline.join("").trim());
    if (merged) {
      if (allHeadingSized) {
        counters[depth]++;
        const fontSize = getLargestFontSize(child);
        const band = HEADING_BANDS.find((b) => fontSize >= b.min) || HEADING_BANDS[0];
        const prefix = isOrdered ? `${counters[depth]}. ` : "";
        out.push(`${band.prefix}${prefix}${merged}\n\n`);
      } else if (isOrdered) {
        counters[depth]++;
        // Top-level ordered lists use numbers; nested ordered lists use
        // letters (a., b., c.) to match PowerPoint's outline convention.
        const marker = depth === 0 ? `${counters[depth]}.` : `${toLetter(counters[depth])}.`;
        out.push("  ".repeat(depth) + marker + " " + merged + "\n");
      } else {
        out.push("  ".repeat(depth) + "- " + merged + "\n");
      }
      lastItemPushed = true;
    }
    for (const nl of nestedLists) {
      processList(nl, depth + 1, out, counters, { reset: true });
    }
  }
}

/**
 * Process inline-level nodes, accumulating markdown text.
 * @param {NodeList} nodes
 * @param {string[]} out
 * @param {{ code?: boolean }} [opts] — When `code` is true, run text is
 *   preserved verbatim (no inline-code markers, no bold/italic emphasis) so
 *   all-monospace code paragraphs keep their exact text and indentation.
 */
function processInlineNodes(nodes, out, opts = {}) {
  for (const node of nodes) {
    if (node.nodeType === 3) {
      out.push(node.textContent.replace(/\u00a0/g, " "));
      continue;
    }
    if (node.nodeType !== 1) continue;

    const tag = node.tagName;

    if (opts.code) {
      // Code mode: span and emphasis tags carry no meaning in code — keep
      // their raw text (including whitespace-only runs and indentation).
      if (tag === "SPAN" || tag === "STRONG" || tag === "B" || tag === "EM" || tag === "I") {
        const inner = [];
        processInlineNodes(node.childNodes, inner, opts);
        out.push(inner.join(""));
        continue;
      }
    }

    if (tag === "STRONG" || tag === "B") {
      const inner = [];
      processInlineNodes(node.childNodes, inner);
      const raw = inner.join("");
      const trimmed = raw.trim();
      if (trimmed) {
        // Preserve trailing space outside the markers for proper spacing
        const suffix = raw.endsWith(" ") && !trimmed.endsWith(" ") ? " " : "";
        // A run containing only emphasis punctuation (e.g. the bold "__"
        // halves of "__name__" in a PPTX) must not get markers:
        // "**__**name**__**" is mangled by the spacing fix below into
        // "**__** name** __**". Emit the plain text instead.
        out.push(isEmphasisPunctuation(trimmed) ? raw : "**" + trimmed + "**" + suffix);
      } else if (raw) {
        out.push(" ");
      } else {
        out.push(raw);
      }
      continue;
    }

    if (tag === "EM" || tag === "I") {
      const inner = [];
      processInlineNodes(node.childNodes, inner);
      const raw = inner.join("");
      const trimmed = raw.trim();
      if (trimmed) {
        // Preserve trailing space outside the markers for proper spacing
        const suffix = raw.endsWith(" ") && !trimmed.endsWith(" ") ? " " : "";
        out.push(isEmphasisPunctuation(trimmed) ? raw : "*" + trimmed + "*" + suffix);
      } else if (raw) {
        out.push(" ");
      } else {
        out.push(raw);
      }
      continue;
    }

    if (tag === "SPAN") {
      const style = (node.getAttribute("style") || "").toLowerCase();
      const isBold = /font-weight:\s*(?:bold|[6-9]\d{2})/.test(style);
      const isItalic = /font-style:\s*italic/.test(style);
      const isMono =
        /font-family:\s*(?:consolas|courier\s*new|courier|lucida\s*console|monaco|monospace)/i.test(
          style,
        );

      const inner = [];
      processInlineNodes(node.childNodes, inner);
      const raw = inner.join("");
      const trimmed = raw.trim();

      if (trimmed) {
        let text = isMono ? raw : trimmed;
        // Preserve trailing space outside the markers for proper spacing
        const suffix = raw.endsWith(" ") && !trimmed.endsWith(" ") ? " " : "";
        if (isMono) {
          // Monospace text — use double backticks if text contains backtick
          if (text.includes("`")) {
            text = "`` " + text + " ``";
          } else {
            text = "`" + text + "`";
          }
          out.push(text);
        } else if (isBold && isItalic) {
          out.push(isEmphasisPunctuation(trimmed) ? raw : "***" + trimmed + "***" + suffix);
        } else if (isBold) {
          out.push(isEmphasisPunctuation(trimmed) ? raw : "**" + trimmed + "**" + suffix);
        } else if (isItalic) {
          out.push(isEmphasisPunctuation(trimmed) ? raw : "*" + trimmed + "*" + suffix);
        } else {
          // Plain text span — preserve original spacing
          out.push(raw);
        }
      } else if (raw) {
        // Whitespace-only span — preserve as a single space
        out.push(" ");
      }
      continue;
    }

    if (tag === "A") {
      const href = node.getAttribute("href") || "";
      const inner = [];
      processInlineNodes(node.childNodes, inner);
      const text = inner.join("").trim();
      if (href) {
        out.push("[" + (text || href) + "](" + href + ")");
      } else if (text) {
        out.push(text);
      }
      continue;
    }

    if (tag === "BR") {
      out.push("\n");
      continue;
    }

    const inner = [];
    processInlineNodes(node.childNodes, inner);
    out.push(inner.join(""));
  }
}

/**
 * Merge adjacent same-type markdown markers.
 * Converts "**a** **b**" → "**a b**" and "***a*** ***b***" → "***a b***".
 * @param {string} text
 * @returns {string}
 */
function mergeAdjacentMarkers(text) {
  let s = text;
  for (let i = 0; i < 10; i++) {
    const prev = s;
    // Adjacent emphasis spans with no separator ("*a**b*") render
    // ambiguously in markdown — insert a space so markdown-it sees two valid
    // emphasis spans. The leading lookbehind keeps this from firing inside a
    // bold run ("**bold** …"), whose closing half is also `*text**`.
    s = s.replace(/(?<!\*)\*([^*]+)\*\*(?!\*)([^*]+)\*/g, "*$1* *$2*");
    s = s.replace(/\*\*\*([^*]+?)\*\*\*(\s*)\*\*\*(?!\*)/g, "***$1$2");
    if (s === prev) break;
  }
  for (let i = 0; i < 10; i++) {
    const prev = s;
    s = s.replace(/\*\*([^*]+?)\*\*(\s*)\*\*(?!\*)/g, "**$1$2");
    if (s === prev) break;
  }
  for (let i = 0; i < 10; i++) {
    const prev = s;
    s = s.replace(/(?<!\*)\*([^*]+?)\*(\s+)\*(?!\*)/g, "*$1$2");
    if (s === prev) break;
  }
  s = s.replace(/\*\*\s*\*\*/g, " ");
  s = s.replace(/(?<!\*)\*\s+\*(?!\*)/g, " ");
  // Ensure a space after closing bold markers when followed by text
  // e.g. "**word**next" → "**word** next" but only for ** (not ***)
  s = s.replace(/(\S)\*\*(\S)/g, (match, before, after) => {
    // Don't add space if this is part of a *** (bold+italic) marker
    if (before === "*" || after === "*") return match;
    return `${before}** ${after}`;
  });
  return s;
}
