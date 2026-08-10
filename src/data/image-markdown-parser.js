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
