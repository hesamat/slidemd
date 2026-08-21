/**
 * Shared markdown manipulation helpers for block-level drag/move operations.
 */

export const AREA_MARKER_RE = /^\s*@([a-zA-Z_][a-zA-Z0-9_-]*)\s*$/;
const MAX_TEXT_MATCH_LEN = 50;

/**
 * Return the character range `{from, to}` for the content inside a named
 * `@area` block in the markdown source.
 *
 * @param {string} markdown
 * @param {string} areaName - The area name (e.g. "main", "media")
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
    if (firstMarkerIdx === lines.length) {
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
 * Find the markdown character position of a rendered element inside its
 * slide area.  Prefer the `data-source-line` attribute (set by the markdown
 * parser); fall back to matching the element's text content against the
 * area's markdown lines.
 *
 * @param {string} markdown
 * @param {HTMLElement} element
 * @param {object} [opts]
 * @param {boolean} [opts.preferSourceLine=true]
 * @returns {number} Character offset in `markdown`, or -1 if not found.
 */
export function findMarkdownPosition(markdown, element, { preferSourceLine = true } = {}) {
  const area = element?.closest?.(".slide__area");
  if (!area) return -1;

  const areaName = area.dataset.areaName || "main";
  const range = getAreaContentRange(markdown, areaName);

  if (preferSourceLine) {
    const sourceLine = parseInt(element.dataset?.sourceLine, 10);
    if (!isNaN(sourceLine)) {
      const lines = markdown.slice(range.from, range.to).split("\n");
      let charOffset = 0;
      for (let i = 0; i < Math.min(sourceLine, lines.length); i++) {
        charOffset += lines[i].length + 1;
      }
      return range.from + charOffset;
    }
  }

  const text = element.textContent?.trim();
  if (!text) return -1;

  const areaContent = markdown.slice(range.from, range.to);
  const lines = areaContent.split("\n");
  let charOffset = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && text.startsWith(trimmed.slice(0, MAX_TEXT_MATCH_LEN))) {
      return range.from + charOffset;
    }
    charOffset += line.length + 1;
  }
  return -1;
}

/**
 * Remove a block from markdown and re-insert it at a new character offset,
 * adding the appropriate leading/trailing newlines and collapsing runs of
 * three or more newlines.  The inserted text may differ from the original
 * block (e.g. an image tag with updated style attributes).
 *
 * @param {string} markdown
 * @param {{ start: number, end: number }} block
 * @param {number} insertAt - Character offset in the post-removal markdown.
 * @param {string} [blockText] - Text to insert; defaults to `block.fullTag`.
 * @returns {string}
 */
export function removeAndInsertBlock(markdown, block, insertAt, blockText) {
  const text = blockText ?? block.fullTag;
  const withoutBlock = markdown.slice(0, block.start) + markdown.slice(block.end);
  const before = withoutBlock.slice(0, insertAt);
  const after = withoutBlock.slice(insertAt);

  const leading =
    before.length === 0 ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";

  const trailing = after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";

  let updated = before + leading + text + trailing + after;
  updated = updated.replace(/\n{3,}/g, "\n\n");
  return updated;
}
