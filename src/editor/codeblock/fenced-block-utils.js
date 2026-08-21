/**
 * fenced-block-utils
 *
 * Pure functions for parsing and manipulating fenced code blocks (including
 * Mermaid diagrams) in slide markdown.  Fenced blocks are the markdown
 * construct shared by both regular code blocks (```lang ... ```) and Mermaid
 * diagrams (```mermaid ... ```), so a single set of utilities serves both.
 *
 * These functions operate on a single slide's markdown string (the segment
 * between `---` slide separators) and understand `@area` markers the same way
 * `image-markdown-utils` does.
 */

const AREA_MARKER_RE = /^\s*@([a-zA-Z_][a-zA-Z0-9_-]*)\s*$/;
const FENCE_OPEN_RE = /^\s*(```+|~~~+)\s*([^\n]*)$/;

/**
 * @typedef {Object} FencedBlock
 * @property {number} start          - Character offset of the opening fence line start.
 * @property {number} end            - Character offset *after* the closing fence line's newline.
 * @property {string} fullTag        - The exact fenced block text (opening fence through closing fence).
 * @property {string} lang           - The info string's first token (language), lower-cased. May be "".
 * @property {string} infoString     - The full info string after the fence marker, trimmed.
 * @property {string} fenceMarker    - The fence character run (e.g. "```" or "~~~").
 * @property {boolean} isMermaid     - True when lang === "mermaid".
 */

/**
 * Scan a markdown string and return every fenced code block.
 *
 * Respects nested fences (a ``` block cannot be closed by a ~~~ block) and
 * ignores fence markers that appear inside an already-open fence of a
 * different marker.  Unterminated fences (no closing marker before EOF) are
 * treated as ending at EOF so callers can still locate them.
 *
 * @param {string} markdown
 * @returns {FencedBlock[]}
 */
export function parseFencedBlocks(markdown) {
  const text = String(markdown || "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const blocks = [];

  let i = 0;
  while (i < lines.length) {
    const openMatch = lines[i].match(FENCE_OPEN_RE);
    if (!openMatch) {
      i++;
      continue;
    }
    const fenceMarker = openMatch[1];
    const infoString = openMatch[2].trim();
    const lang = infoString.split(/\s+/)[0] || "";
    const startLine = i;

    // Find the matching closing fence: a line whose leading fence run is the
    // same character and at least as long as the opening run, with only
    // whitespace around it.
    let closeLine = -1;
    const closeRe = new RegExp(`^\\s*(${fenceMarker[0].repeat(fenceMarker.length)}+)\\s*$`);
    for (let j = i + 1; j < lines.length; j++) {
      if (closeRe.test(lines[j])) {
        closeLine = j;
        break;
      }
    }
    const endLine = closeLine >= 0 ? closeLine : lines.length - 1;

    const lineToChar = (lineIndex) => {
      let pos = 0;
      for (let k = 0; k < lineIndex; k++) pos += lines[k].length + 1;
      if (lineIndex === lines.length && lines[lines.length - 1] !== "") pos -= 1;
      return pos;
    };

    const start = lineToChar(startLine);
    // end = char offset *after* the closing fence line, including its newline
    // (or EOF).  This makes block.fullTag a clean slice(start, end).
    const end = closeLine >= 0 ? lineToChar(endLine + 1) : text.length;

    blocks.push({
      start,
      end,
      fullTag: text.slice(start, end),
      lang: lang.toLowerCase(),
      infoString,
      fenceMarker,
      isMermaid: lang.toLowerCase() === "mermaid",
    });

    i = endLine + 1;
  }
  return blocks;
}

/**
 * Return the character range `{from, to}` for the content inside a named
 * `@area` block in the markdown source.  Mirrors the implementation in
 * `image-markdown-utils` so this module stays self-contained.
 *
 * @param {string} markdown
 * @param {string} areaName
 * @returns {{from: number, to: number}}
 */
export function getAreaContentRange(markdown, areaName) {
  const normalized = String(markdown || "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const target = String(areaName || "main")
    .trim()
    .toLowerCase();

  const lineToCharOffset = (lineIndex) => {
    let pos = 0;
    for (let i = 0; i < lineIndex; i++) pos += lines[i].length + 1;
    if (lineIndex === lines.length && lines[lines.length - 1] !== "") pos -= 1;
    return pos;
  };

  let areaMarkerIdx = -1;
  let firstMarkerIdx = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const markerMatch = lines[i].match(AREA_MARKER_RE);
    if (!markerMatch) continue;
    if (areaMarkerIdx < 0 && firstMarkerIdx === lines.length) {
      firstMarkerIdx = i;
    }
    if (markerMatch[1].toLowerCase() === target) {
      areaMarkerIdx = i;
      break;
    }
  }

  if (areaMarkerIdx < 0) {
    if (target === "main") {
      // Content before the first explicit @area marker belongs to @main by
      // project convention (see MarkdownParser.parseAreas).
      return { from: 0, to: lineToCharOffset(firstMarkerIdx) };
    }
    return { from: normalized.length, to: normalized.length };
  }

  let nextMarkerIdx = lines.length;
  for (let i = areaMarkerIdx + 1; i < lines.length; i++) {
    const markerMatch = lines[i].match(AREA_MARKER_RE);
    if (markerMatch) {
      nextMarkerIdx = i;
      break;
    }
  }

  return {
    from: lineToCharOffset(areaMarkerIdx + 1),
    to: lineToCharOffset(nextMarkerIdx),
  };
}

/**
 * Return all fenced blocks whose opening fence falls within the named area.
 *
 * @param {string} markdown
 * @param {string} areaName
 * @returns {FencedBlock[]}
 */
export function parseFencedBlocksInArea(markdown, areaName) {
  const all = parseFencedBlocks(markdown);
  const range = getAreaContentRange(markdown, areaName);
  if (range.from === range.to && range.from === (markdown || "").length) {
    return all;
  }
  return all.filter((b) => b.start >= range.from && b.start < range.to);
}

/**
 * Locate the fenced block whose opening fence line (area-relative) equals
 * `sourceLine`.  This is the precise match used after a click on a rendered
 * `.mermaid` div or `<pre>`: the source-map plugin tags the opening fence
 * line, so an exact line match identifies the block.
 *
 * @param {string} markdown
 * @param {string} areaName
 * @param {number} sourceLine
 * @returns {FencedBlock|null}
 */
const DIRECTIVE_RE =
  /^\s*(layout|media-full-bleed|media-span|background|theme|hidden|hide|align|header-style|area-style|area-bg(?:-[a-zA-Z0-9_-]+)?|code-font-size)\s*:/i;

function getAreaStartLine(markdown, areaName) {
  const lines = String(markdown || "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const target = String(areaName || "main")
    .trim()
    .toLowerCase();
  const isDirective = (line) => DIRECTIVE_RE.test(line);
  let current = "main";
  let inHtmlComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const startsComment = /^\s*<!--/.test(line);
    const endsComment = /-->\s*$/.test(line);
    if (startsComment) inHtmlComment = true;

    const markerMatch = line.match(AREA_MARKER_RE);
    if (!inHtmlComment && markerMatch) {
      current = markerMatch[1].toLowerCase();
      if (current === target) return i + 1;
    } else if (current === target && !inHtmlComment && line.trim() !== "" && !isDirective(line)) {
      // Default main area: the rendered area string begins at the first
      // non-directive, non-comment, non-blank line.
      return i;
    }

    if (endsComment) inHtmlComment = false;
  }

  if (target === "main") return 0;
  return undefined;
}

export function findFencedBlockAtOpeningLine(markdown, areaName, sourceLine) {
  const md = String(markdown || "");
  if (!md) return null;

  // `data-source-line` is relative to the rendered area markdown (cleaned of
  // directives).  Find the raw editor line where that area's content begins,
  // then locate the fence whose opening line is `areaStart + sourceLine`.
  let areaStart = getAreaStartLine(md, areaName);
  if (areaStart === undefined) {
    // @title / @header alias handling.
    if (areaName === "title") {
      areaStart = getAreaStartLine(md, "header");
    } else if (areaName === "header") {
      areaStart = getAreaStartLine(md, "title");
    }
  }
  if (areaStart === undefined) return null;

  const rawLine = areaStart + sourceLine;
  const blocks = parseFencedBlocksInArea(md, areaName);
  for (const block of blocks) {
    const blockLine = md.slice(0, block.start).split("\n").length - 1;
    if (blockLine === rawLine) return block;
  }
  return null;
}

/**
 * Remove a fenced block from `markdown` and return the result plus the
 * removed block text.  Collapses runs of 3+ newlines left behind so repeated
 * removals don't grow blank gaps.
 *
 * @param {string} markdown
 * @param {FencedBlock} block
 * @returns {{markdown: string, removed: string}}
 */
export function removeFencedBlock(markdown, block) {
  if (!block) return { markdown, removed: "" };
  const before = markdown.slice(0, block.start);
  const after = markdown.slice(block.end);
  let updated = before + after;
  updated = updated.replace(/\n{3,}/g, "\n\n");
  return { markdown: updated, removed: block.fullTag };
}

/**
 * Insert a fenced block's text into a target area at a given character
 * offset, with blank-line padding so markdown-it renders it as a separate
 * block.
 *
 * @param {string} markdown
 * @param {number} insertAt - Absolute character offset in `markdown`.
 * @param {string} blockText - The fenced block text to insert.
 * @returns {string}
 */
export function insertFencedBlockAt(markdown, insertAt, blockText) {
  const before = markdown.slice(0, insertAt);
  const after = markdown.slice(insertAt);

  const leading =
    before.length === 0 ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";

  const trailing = after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";

  let updated = before + leading + blockText + trailing + after;
  updated = updated.replace(/\n{3,}/g, "\n\n");
  return updated;
}

/**
 * Move a fenced block from one area to another, optionally inserting before a
 * given absolute character offset in the (post-removal) markdown.
 *
 * @param {string} markdown
 * @param {FencedBlock} block - The block to move (from the source area).
 * @param {string} toAreaName
 * @param {number|null} [insertAtAbs=null] - Absolute offset in the
 *   post-removal markdown, or null to append at the end of the target area.
 * @returns {string|null} The updated markdown, or null if the move failed.
 */
export function moveFencedBlock(markdown, block, toAreaName, insertAtAbs = null) {
  if (!block) return null;
  const { markdown: withoutBlock } = removeFencedBlock(markdown, block);
  const targetRange = getAreaContentRange(withoutBlock, toAreaName);
  if (targetRange.from === targetRange.to && targetRange.from === withoutBlock.length) {
    return null;
  }
  const insertAt =
    insertAtAbs != null && insertAtAbs >= targetRange.from && insertAtAbs <= targetRange.to
      ? insertAtAbs
      : targetRange.to;
  return insertFencedBlockAt(withoutBlock, insertAt, block.fullTag);
}

/**
 * Reorder a fenced block within its own area by removing it and reinserting at
 * a target absolute character offset (in the post-removal markdown).
 *
 * @param {string} markdown
 * @param {FencedBlock} block
 * @param {number|null} insertAtAbs - Absolute offset in post-removal markdown,
 *   or null to append at the end of the block's area.
 * @returns {string|null}
 */
export function reorderFencedBlock(markdown, block, insertAtAbs) {
  if (!block) return null;
  const areaName = findAreaNameForOffset(markdown, block.start);
  if (!areaName) return null;
  const { markdown: withoutBlock } = removeFencedBlock(markdown, block);
  const range = getAreaContentRange(withoutBlock, areaName);
  if (range.from === range.to && range.from === withoutBlock.length) {
    return null;
  }
  const insertAt =
    insertAtAbs != null && insertAtAbs >= range.from && insertAtAbs <= range.to
      ? insertAtAbs
      : range.to;
  return insertFencedBlockAt(withoutBlock, insertAt, block.fullTag);
}

/**
 * Determine which area a character offset falls into.
 *
 * @param {string} markdown
 * @param {number} offset
 * @returns {string|null}
 */
export function findAreaNameForOffset(markdown, offset) {
  const normalized = String(markdown || "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const lineToCharOffset = (lineIndex) => {
    let pos = 0;
    for (let i = 0; i < lineIndex; i++) pos += lines[i].length + 1;
    if (lineIndex === lines.length && lines[lines.length - 1] !== "") pos -= 1;
    return pos;
  };

  // Content before the first explicit @area marker belongs to @main.
  let currentArea = "main";
  for (let i = 0; i < lines.length; i++) {
    const markerMatch = lines[i].match(AREA_MARKER_RE);
    if (markerMatch) {
      currentArea = markerMatch[1].toLowerCase();
      continue;
    }
    const lineStart = lineToCharOffset(i);
    const lineEnd = lineToCharOffset(i + 1);
    if (offset >= lineStart && offset < lineEnd) {
      return currentArea;
    }
  }
  // Offset at EOF: return the last area seen.
  if (offset >= normalized.length) return currentArea;
  return currentArea;
}

/**
 * Get the ordinal index of a fenced-block element among all draggable fenced
 * blocks (`.mermaid` divs and content `<pre>`) in its parent area.  Mirrors
 * `getImageOrdinalIndexInArea` so blocks can be matched to their markdown
 * entries by DOM position instead of source-line numbers (which are relative
 * to the rendered area markdown and drift with directives/edits).
 *
 * @param {HTMLElement} el
 * @returns {number} Index, or -1 if not found in an area.
 */
export function getFencedBlockOrdinalIndexInArea(el) {
  const area = el.closest(".slide__area");
  if (!area) return -1;
  return Array.from(area.querySelectorAll(".mermaid, pre")).indexOf(el);
}

/**
 * Walk up from a DOM event target to the draggable fenced-block element
 * (a `.mermaid` div or a content `<pre>`), or null if the target is inside a
 * non-draggable container (text-block layout wrappers, flex rows, editor
 * chrome).
 *
 * @param {HTMLElement} target
 * @returns {HTMLElement|null}
 */
export function getDraggableFencedBlockElement(target) {
  if (!target?.closest) return null;

  // Skip editor chrome and layout wrappers that happen to contain <pre>.
  if (target.closest(".editor-area-label, .editor-slide-warning")) return null;
  if (target.closest(".text-block")) return null; // text-block has its own handler
  if (target.closest(".flex-row")) return null; // mirrors image drag ignore rule

  const mermaid = target.closest(".mermaid");
  if (mermaid) {
    // Only drag rendered diagrams; un-rendered .mermaid has no SVG yet.
    if (!mermaid.dataset.mermaidProcessed) return null;
    return mermaid;
  }

  const pre = target.closest("pre");
  if (pre) {
    // Skip <pre> that are inside a text-block (handled by TextBlockHandler)
    // or inside a flex-row (inline code layout).  The closest() checks above
    // already guard these, but be defensive.
    if (pre.closest(".text-block, .flex-row")) return null;
    return pre;
  }
  return null;
}
