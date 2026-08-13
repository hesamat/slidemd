/**
 * Pure markdown image parsing utilities.
 *
 * These functions parse image tags (HTML `<img>` and markdown `![alt](src)`)
 * from markdown strings without touching the DOM. They live in the data
 * layer so AI and other non-editor code can use them without an upward
 * dependency on the editor layer.
 */

const HTML_IMG_RE = /<img\b([^>]*?)>/gi;
const MD_IMG_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

/**
 * Find all image entries (HTML `<img>` and markdown `![alt](src)`) in a
 * markdown string, sorted by position.
 *
 * The HTML `<img>` pattern accepts newlines inside the tag (the `[^>]*?`
 * body has no `s` flag but `[^>]` already matches newlines), so a
 * multiline tag like
 *   <img\n   src="..."\n   alt="...">
 * is recognised as a single image.
 *
 * @param {string} markdown
 * @returns {Array<{type: 'html'|'md', src: string, fullMatch: string, fullTag: string, start: number, end: number}>}
 */
export function parseAllImages(markdown) {
  const results = [];

  // Reset lastIndex for global regexes
  HTML_IMG_RE.lastIndex = 0;
  MD_IMG_RE.lastIndex = 0;

  let match;
  while ((match = HTML_IMG_RE.exec(markdown)) !== null) {
    const srcMatch = match[1].match(/src=["']([^"']*)["']/i);
    if (!srcMatch) continue;
    results.push({
      type: "html",
      src: srcMatch[1],
      fullMatch: match[0],
      fullTag: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  while ((match = MD_IMG_RE.exec(markdown)) !== null) {
    results.push({
      type: "md",
      src: match[2],
      fullMatch: match[0],
      fullTag: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  results.sort((a, b) => a.start - b.start);
  return results;
}

/**
 * Find fenced code block ranges in a markdown string.
 *
 * A fence opens with a line whose first non-whitespace is ``` (or ~~~) and
 * closes with a matching fence line. Unclosed fences run to the end of the
 * document. Returns ranges as `[start, end)` byte offsets into the markdown.
 *
 * @param {string} markdown
 * @returns {Array<{start: number, end: number}>}
 */
export function findFencedRanges(markdown) {
  const ranges = [];
  const lines = markdown.split("\n");
  let inFence = false;
  let fenceStart = 0;
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = offset;
    const lineEnd = offset + line.length + (i < lines.length - 1 ? 1 : 0);
    if (/^\s*(```|~~~)/.test(line)) {
      if (!inFence) {
        inFence = true;
        fenceStart = lineStart;
      } else {
        ranges.push({ start: fenceStart, end: lineEnd });
        inFence = false;
      }
    }
    offset = lineEnd;
  }
  if (inFence) ranges.push({ start: fenceStart, end: markdown.length });
  return ranges;
}

/**
 * Find all image entries outside fenced code blocks, sorted by position.
 * Fenced code samples may legitimately illustrate `<img>` tags, so callers
 * that strip or validate image references must ignore them. This is the
 * fence-aware counterpart to `parseAllImages`.
 *
 * @param {string} markdown
 * @returns {Array<{type: 'html'|'md', src: string, fullMatch: string, fullTag: string, start: number, end: number}>}
 */
export function parseAllImagesOutsideFences(markdown) {
  const fences = findFencedRanges(markdown);
  if (fences.length === 0) return parseAllImages(markdown);
  const inFence = (offset) => fences.some((r) => offset >= r.start && offset < r.end);
  return parseAllImages(markdown).filter((img) => !inFence(img.start));
}
