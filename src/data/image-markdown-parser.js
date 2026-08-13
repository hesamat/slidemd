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
  let fenceMarker = "";
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = offset;
    const lineEnd = offset + line.length + (i < lines.length - 1 ? 1 : 0);
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!inFence) {
        inFence = true;
        fenceStart = lineStart;
        fenceMarker = marker;
      } else if (marker.startsWith(fenceMarker)) {
        ranges.push({ start: fenceStart, end: lineEnd });
        inFence = false;
        fenceMarker = "";
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

// Background-shorthand tokens that describe positioning/sizing/repetition/
// attachment rather than color — e.g. `background: url(a.png) center/cover`.
// Excluded from the "color" classification in `splitBackgroundValue` so they
// travel with the image part instead of being mistaken for a color the user
// or model introduced.
const BG_LAYOUT_KEYWORD_RE =
  /^(repeat-x|repeat-y|no-repeat|repeat|round|space|cover|contain|center|top|bottom|left|right|fixed|local|scroll|border-box|padding-box|content-box|auto|none|initial|inherit|unset)$/i;
const BG_NUMERIC_RE = /^[\d.]+(%|px|em|rem|vh|vw)?$/i;

/**
 * Normalize an image src for allowlist comparison — strip a leading `./` and
 * decode percent-encoding. Allowlists (`collectImageSources`,
 * `keptImageSrcs`, etc.) are built from exact source strings, so a model
 * that reuses a real deck image but writes it slightly differently —
 * `./images/a.png` vs `images/a.png`, or a URL-encoded space — would
 * otherwise fail a literal comparison: flagged as fabricated by validation,
 * then silently deleted by the mechanical strip backstop, leaving a media
 * area or `full-image` slide with no visual and no visible explanation.
 * @param {string} src
 * @returns {string}
 */
export function normalizeImageSrc(src) {
  const stripped = src.trim().replace(/^\.\//, "");
  try {
    return decodeURI(stripped);
  } catch {
    // Malformed percent-encoding — compare on the un-decoded string rather
    // than throwing.
    return stripped;
  }
}

/**
 * Split a CSS `background` shorthand value into its color/gradient part and
 * its image (`url(...)`) part.
 *
 * A single background layer can legitimately mix a color with an image —
 * `background: #fff url(images/hero.png) center/cover` renders the color
 * behind the (possibly transparent) image. Classifying the whole value as
 * "image" merely because it contains `url(` — as every call site did before
 * this helper existed — lets a color/gradient smuggled in alongside a
 * legitimate image url bypass identity checks and survive the discard-mode
 * strip, contradicting both preserve mode's dropped/added detection and
 * discard mode's "no stale visual directives" guarantee.
 *
 * This is a token-level split, not a full CSS parser: `url(...)` occurrences
 * and recognized layout keywords/units/tokens containing `/` (position or
 * position/size shorthand) are treated as the image part; every other token
 * is treated as color/gradient content. Good enough for the solid-color,
 * gradient, and single-image values this app's directives actually contain.
 *
 * @param {string} value — the text after `background:` (trimmed by caller)
 * @returns {{ colorPart: string, imagePart: string, hasImage: boolean }}
 */
export function splitBackgroundValue(value) {
  // Tokenize on whitespace and top-level commas, treating function calls
  // (`url(...)`, `linear-gradient(...)`, `rgba(...)`, …) as atomic units —
  // splitting a gradient on its internal commas/spaces would fragment it
  // into stray numerics and keywords that then leak into the image part.
  // The inner `(?:[^()]|\([^)]*\))*` handles one level of nesting (e.g.
  // `linear-gradient(rgba(0,0,0,.5), transparent)`) — sufficient for the
  // CSS background values this app's directives contain.
  const tokens = value.match(/[a-z-]+\((?:[^()]|\([^)]*\))*\)|[^\s,]+/gi) || [];
  const colorTokens = [];
  const otherTokens = [];
  for (const token of tokens) {
    if (
      /^url\(/i.test(token) ||
      token.includes("/") ||
      BG_LAYOUT_KEYWORD_RE.test(token) ||
      BG_NUMERIC_RE.test(token)
    ) {
      otherTokens.push(token);
    } else {
      colorTokens.push(token);
    }
  }
  return {
    colorPart: colorTokens.join(" ").trim(),
    imagePart: otherTokens.join(" ").trim(),
    hasImage: otherTokens.some((t) => /^url\(/i.test(t)),
  };
}
