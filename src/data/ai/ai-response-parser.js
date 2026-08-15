/**
 * AI Response Parser
 *
 * Parses AI-generated JSON responses and converts slide objects back to
 * SlideMD markdown. Handles common LLM output issues (code fences, prose
 * around JSON, markdown fallback).
 */

import { MarkdownParser } from "../markdown-parser.js";

/**
 * Convert JSON slides back to SlideMD markdown.
 * @param {{ layout: string, background?: string, theme?: string, content: string }[]} slides
 * @returns {string}
 */
export function slidesToMarkdown(slides) {
  return slides
    .map((slide) => {
      const parts = [];
      if (slide.layout) parts.push(`layout: ${slide.layout}`);
      if (slide.background) parts.push(`background: ${slide.background}`);
      if (slide.theme) parts.push(`theme: ${slide.theme}`);
      if (slide.mediaFullBleed) parts.push("media-full-bleed: true");
      // Strip a leading SLIDE INDEX / SLIDE n marker comment from content.
      // Models often prepend this as a navigation aid; it is not part of the
      // slide body. Only strip the leading occurrence so legitimate comments
      // inside code examples are preserved.
      const slideCommentRe = /^<!--\s*SLIDE(?:\s+INDEX)?\s+\d+(?:\s*\([^)]*\))?\s*-->\n?/i;
      const content = (slide.content || "").replace(slideCommentRe, "");
      if (parts.length > 0) parts.push("");
      parts.push(content);
      return parts.join("\n");
    })
    .join("\n\n---\n\n");
}

/**
 * Convert parsed deck slides (with `areas` objects) back to SlideMD markdown.
 * Used when re-serializing after restoreDirectives().
 * @param {{ layout: string, background?: string, theme?: string, areas: object }[]} slides
 * @returns {string}
 */
export function areasToMarkdown(slides) {
  return slides
    .map((slide) => {
      const parts = [];
      if (slide.layout) parts.push(`layout: ${slide.layout}`);
      if (slide.background) parts.push(`background: ${slide.background}`);
      if (slide.theme) parts.push(`theme: ${slide.theme}`);
      if (slide.mediaFullBleed) parts.push("media-full-bleed: true");
      parts.push("");
      // Convert areas object back to markdown with area markers
      const areas = slide.areas || {};
      const areaNames = Object.keys(areas);
      if (areaNames.length === 0) {
        parts.push("");
      } else {
        for (const name of areaNames) {
          let html = areas[name];
          if (!html) continue;
          // Strip data-source-line attributes added by markdown parser
          html = html.replace(/\s*data-source-line="\d+"/g, "");
          parts.push(`@${name}`);
          parts.push(html);
          parts.push("");
        }
      }
      return parts
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    })
    .join("\n\n---\n\n");
}

/**
 * Remove trailing commas from JSON text. Models sometimes emit a trailing
 * comma after the last property of an object or array (e.g. after
 * `visualSystem`). `JSON.parse` rejects this, so we strip commas that
 * directly precede a closing `}` or `]` while outside of strings.
 *
 * @param {string} raw - JSON-ish text.
 * @returns {string}
 */
function stripTrailingCommas(raw) {
  const out = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) {
      out.push(ch);
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out.push(ch);
      escaped = true;
      continue;
    }
    if (ch === '"') {
      out.push(ch);
      inString = !inString;
      continue;
    }
    if (inString) {
      out.push(ch);
      continue;
    }
    if (ch === ",") {
      // Look ahead past whitespace for } or ]
      let j = i + 1;
      while (
        j < raw.length &&
        (raw[j] === " " || raw[j] === "\t" || raw[j] === "\n" || raw[j] === "\r")
      ) {
        j++;
      }
      if (raw[j] === "}" || raw[j] === "]") {
        // Skip the comma — don't push it
        continue;
      }
    }
    out.push(ch);
  }
  return out.join("");
}

/**
 * Escape literal newlines and carriage returns that appear unescaped inside
 * JSON strings. Models often emit raw line breaks inside "content" strings
 * instead of the required `\n` escape, which makes the JSON unparseable.
 *
 * Only modifies characters that are inside a string (between unescaped
 * double quotes), so structural line breaks and code-fence markers outside
 * strings are left untouched.
 *
 * @param {string} raw - A JSON-ish substring.
 * @returns {string}
 */
function escapeRawNewlinesInJson(raw) {
  const out = [];
  let inString = false;
  let escaped = false;
  for (const ch of raw) {
    if (escaped) {
      out.push(ch);
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out.push(ch);
      escaped = true;
      continue;
    }
    if (ch === '"') {
      out.push(ch);
      inString = !inString;
      continue;
    }
    if (inString && (ch === "\n" || ch === "\r")) {
      out.push("\\n");
      continue;
    }
    out.push(ch);
  }
  return out.join("");
}

/**
 * Try to parse a JSON string, first as-is and then with raw newlines escaped
 * inside strings. Returns the parsed object and (optionally) the raw substring
 * that successfully parsed.
 *
 * @param {string} raw - JSON source.
 * @param {function} ok - Validator to accept the parsed object.
 * @returns {{ parsed: object, raw: string }|null}
 */
function tryParseJson(raw, ok) {
  const attempts = [
    raw,
    escapeRawNewlinesInJson(raw),
    stripTrailingCommas(raw),
    stripTrailingCommas(escapeRawNewlinesInJson(raw)),
  ];
  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (ok(parsed)) return { parsed, raw: candidate };
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Extract a top-level JSON object from raw LLM text, robust to code fences,
 * prose wrappers, and stray braces in surrounding text.
 *
 * Tries in order:
 * 1. Direct JSON.parse of the trimmed text.
 * 2. Extract from a ```json code fence.
 * 3. Locate the top-level key (`key` param, e.g. "slides" or "chapters"),
 *    walk backwards to the enclosing `{` (tracking brace depth so sibling
 *    objects are skipped), then walk forwards with string-aware brace-depth
 *    tracking to find the matching `}`.
 *
 * @param {string} text - Raw AI response text.
 * @param {string} key - Top-level key to locate (e.g. "slides", "chapters").
 * @param {function} [validate] - Optional validator; if it returns false the
 *   search continues to an earlier occurrence of the key.
 * @returns {{ parsed: object, raw: string }|null} Parsed object and the raw
 *   JSON substring, or null if no valid JSON was found.
 */
export function extractJsonObject(text, key, validate) {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  const ok = (obj) => obj && typeof obj === "object" && key in obj && (!validate || validate(obj));

  // 1. Direct parse — only accept if the parsed object contains the key,
  // otherwise fall through to the brace walk (the key may be nested).
  const direct = tryParseJson(trimmed, ok);
  if (direct) return { parsed: direct.parsed, raw: direct.raw };

  // 2. Code fence — same guard: only accept if the key is present.
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    const inner = fenceMatch[1].trim();
    const fenced = tryParseJson(inner, ok);
    if (fenced) return { parsed: fenced.parsed, raw: fenced.raw };
  }

  // 3. Locate the key and walk braces to extract the enclosing object.
  // Try last occurrence first (the real JSON is usually at the end).
  let searchPos = trimmed.length;
  const keyNeedle = `"${key}"`;
  while (searchPos > 0) {
    const keyIdx = trimmed.lastIndexOf(keyNeedle, searchPos - 1);
    if (keyIdx < 0) break;

    // Walk backwards from the key to find the *enclosing* { — not just the
    // first { we see. We track brace depth: every } we pass increases depth,
    // every { decreases it. When depth goes negative, that { is the
    // enclosing one. This correctly skips sibling objects that appear before
    // the key (e.g. visualSystem.palette before "chapters" in an outline).
    let start = keyIdx;
    let depth = 0;
    let inString = false;
    while (start > 0) {
      start--;
      const ch = trimmed[start];
      if (inString) {
        // Count consecutive backslashes ending at this position to determine
        // whether the quote that follows (in backward order) is escaped.
        // In JSON, `\` escapes the *following* char, so when scanning
        // backwards we need to count how many backslashes precede a `"` to
        // know if that `"` is escaped.
        if (ch === '"') {
          let backslashes = 0;
          let p = start - 1;
          while (p >= 0 && trimmed[p] === "\\") {
            backslashes++;
            p--;
          }
          if (backslashes % 2 === 0) inString = false;
        }
        continue;
      }
      if (ch === '"') {
        let backslashes = 0;
        let p = start - 1;
        while (p >= 0 && trimmed[p] === "\\") {
          backslashes++;
          p--;
        }
        if (backslashes % 2 === 0) inString = true;
        continue;
      }
      if (ch === "}") depth++;
      else if (ch === "{") {
        depth--;
        if (depth < 0) break;
      }
    }
    if (trimmed[start] !== "{" || depth >= 0) {
      searchPos = keyIdx;
      continue;
    }

    // Walk forwards to find the matching closing }
    let braceDepth = 0;
    let end = start;
    inString = false;
    let escaped = false;
    for (; end < trimmed.length; end++) {
      const ch = trimmed[end];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") braceDepth++;
      else if (ch === "}") {
        braceDepth--;
        if (braceDepth === 0) break;
      }
    }
    if (braceDepth === 0) {
      const raw = trimmed.slice(start, end + 1);
      const result = tryParseJson(raw, ok);
      if (result) return { parsed: result.parsed, raw };
    }
    searchPos = keyIdx;
  }

  return null;
}

/**
 * Parse the AI's JSON response, handling common issues.
 * @param {string} text - Raw AI response.
 * @returns {{ slides: Array }|null}
 */
export function parseAiResponse(text) {
  const trimmed = text.trim();

  // Use the robust extractor with the "slides" key. Pass a validator so the
  // search continues to earlier occurrences when a matched object has a
  // non-array `slides` value (e.g. {"slides": "..."}).
  const extracted = extractJsonObject(trimmed, "slides", (obj) => Array.isArray(obj.slides));
  if (extracted) {
    return extracted.parsed;
  }

  // Final fallback: parse the response as SlideMD markdown.
  // This is essential for reasoning models that do not reliably emit
  // a JSON wrapper when `response_format: { type: "json_object" }` is not used.
  try {
    const parser = new MarkdownParser();
    const slideTexts = parser.splitSlides(trimmed);
    // Require at least one fragment to actually look like a slide (frontmatter
    // directive, @area marker, or heading). Plain prose with a stray `---` line
    // should not become a deck.
    const looksLikeSlide = slideTexts.some((text) => {
      const t = text.trim();
      return (
        /^(layout|media-full-bleed|media-span|background|theme|header-style|area-style|hidden|hide|code-font-size):/im.test(
          t,
        ) ||
        /^@\w+/m.test(t) ||
        /^#/m.test(t)
      );
    });
    if (slideTexts.length > 0 && looksLikeSlide) {
      const slides = slideTexts.map((raw) => {
        const { value: layout, markdown: withoutLayout } = parser.extractDirective(raw, "layout");
        const { value: background, markdown: withoutBackground } = parser.extractDirective(
          withoutLayout,
          "background",
        );
        const { value: theme, markdown: withoutTheme } = parser.extractDirective(
          withoutBackground,
          "theme",
        );
        const { value: mediaFullBleed, markdown: withoutMediaFullBleed } = parser.extractDirective(
          withoutTheme,
          "media-full-bleed",
        );
        const { value: legacyMediaSpan, markdown: withoutMediaSpan } = parser.extractDirective(
          withoutMediaFullBleed,
          "media-span",
        );
        const mediaFullBleedValue =
          parser.parseBooleanDirectiveValue(mediaFullBleed) === true ||
          /^(left|right)$/i.test(legacyMediaSpan);
        return {
          layout,
          background,
          theme,
          mediaFullBleed: mediaFullBleedValue,
          content: withoutMediaSpan,
        };
      });
      return { slides };
    }
  } catch {
    /* not parseable as Markdown */
  }

  return null;
}

/**
 * Extract first heading from each slide in markdown.
 * @param {string} markdown
 * @returns {string[]}
 */
export function extractHeadings(markdown) {
  const slides = markdown.split(/\n---\n/);
  return slides.map((slide) => {
    const match = slide.match(/^##?\s+(.+)/m);
    return match?.[1]?.trim() || "";
  });
}
