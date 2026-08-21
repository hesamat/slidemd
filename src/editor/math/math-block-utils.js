/**
 * math-block-utils
 *
 * Helpers for finding, removing, and re-inserting KaTeX display-math blocks
 * in slide markdown.  Display math is delimited by `$$...$$` or `\[...\]`.
 * Inline math (`$...$`, `\(...\)`) is not handled here.
 */
import {
  getAreaContentRange,
  removeAndInsertBlock,
  getFenceRanges,
} from "../core/markdown-utils.js";

// Matches `$$...$$` or `\[...\]` display math anywhere in the text.
const DISPLAY_MATH_RE = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\])/g;

/**
 * Find all display-math blocks in the full markdown string.
 *
 * Matches `$$...$$` and `\[...\]` anywhere, but skips matches that fall
 * inside fenced code blocks.
 *
 * @param {string} markdown
 * @returns {Array<{start: number, end: number, fullTag: string}>}
 */
export function parseAllDisplayMathBlocks(markdown) {
  const text = String(markdown || "");
  const blocks = [];
  const fenceRanges = getFenceRanges(text);

  let match;
  while ((match = DISPLAY_MATH_RE.exec(text)) !== null) {
    const start = match.index;
    const insideFence = fenceRanges.some((r) => start >= r.start && start < r.end);
    if (insideFence) continue;

    blocks.push({
      start,
      end: start + match[0].length,
      fullTag: match[1].trim(),
    });
  }

  return blocks;
}

/**
 * Find display-math blocks within a named area.
 *
 * @param {string} markdown
 * @param {string} areaName
 * @returns {Array<{start: number, end: number, fullTag: string}>}
 */
export function parseDisplayMathBlocksInArea(markdown, areaName) {
  const range = getAreaContentRange(markdown, areaName);
  if (range.from === range.to) {
    return [];
  }
  const areaText = markdown.slice(range.from, range.to);
  return parseAllDisplayMathBlocks(areaText).map((b) => ({
    ...b,
    start: b.start + range.from,
    end: b.end + range.from,
  }));
}

/**
 * Get the ordinal index of a `.katex-display` element among all draggable
 * display-math blocks in its parent area.
 *
 * @param {HTMLElement} el
 * @returns {number}
 */
export function getDisplayMathOrdinalIndexInArea(el) {
  const area = el.closest(".slide__area");
  if (!area) return -1;
  const all = Array.from(area.querySelectorAll(".katex-display"));
  return all.indexOf(el);
}

/**
 * Walk up from a DOM event target to the draggable display-math element,
 * or null if the target is inside an excluded container or inline math.
 *
 * @param {HTMLElement} target
 * @returns {HTMLElement|null}
 */
export function getDraggableDisplayMathElement(target) {
  if (!target?.closest) return null;
  if (target.closest(".editor-area-label, .editor-slide-warning, .text-block, .flex-row"))
    return null;
  const display = target.closest(".katex-display");
  if (!display) return null;
  return display;
}

/**
 * Remove a display-math block from markdown and collapse accidental runs of
 * 3+ newlines.
 *
 * @param {string} markdown
 * @param {{start: number, end: number, fullTag: string}} block
 * @returns {{markdown: string, removed: string}}
 */
export function removeDisplayMathBlock(markdown, block) {
  if (!block) return { markdown, removed: "" };
  const before = markdown.slice(0, block.start);
  const after = markdown.slice(block.end);
  let updated = before + after;
  updated = updated.replace(/\n{3,}/g, "\n\n");
  return { markdown: updated, removed: block.fullTag };
}

/**
 * Insert a display-math block at a character offset using the shared
 * newline-padding helper.
 *
 * @param {string} markdown
 * @param {number} insertAt
 * @param {string} blockText
 * @returns {string}
 */
export function insertDisplayMathBlockAt(markdown, insertAt, blockText) {
  return removeAndInsertBlock(
    markdown,
    { start: insertAt, end: insertAt, fullTag: blockText },
    insertAt,
    blockText,
  );
}
