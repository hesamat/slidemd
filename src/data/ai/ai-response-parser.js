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
      parts.push("");
      // Strip SLIDE INDEX comments from content
      const content = (slide.content || "").replace(
        /<!-- SLIDE INDEX \d+ \(return this\) -->\n?/g,
        "",
      );
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
 * Parse the AI's JSON response, handling common issues.
 * @param {string} text - Raw AI response.
 * @returns {{ slides: Array }|null}
 */
export function parseAiResponse(text) {
  const trimmed = text.trim();

  // Try direct JSON parse
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.slides && Array.isArray(parsed.slides)) return parsed;
  } catch {
    /* not valid JSON */
  }

  // Try extracting JSON from code fence
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1]);
      if (parsed.slides && Array.isArray(parsed.slides)) return parsed;
    } catch {
      /* not valid JSON */
    }
  }

  // Find JSON by locating "slides": — try last occurrence first (real JSON is usually at the end)
  let searchPos = trimmed.length;
  while (true) {
    const slidesIdx = trimmed.lastIndexOf('"slides":', searchPos);
    if (slidesIdx < 0) break;
    // Walk backwards to find the opening { (skip braces inside JSON strings)
    let start = slidesIdx;
    let inString = false;
    let escaped = false;
    while (start > 0) {
      start--;
      const ch = trimmed[start];
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
      if (!inString && ch === "{") break;
    }
    if (trimmed[start] === "{" && !inString) {
      // Walk forwards to find the matching closing }
      let depth = 0;
      let end = start;
      inString = false;
      escaped = false;
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
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      if (depth === 0) {
        try {
          const parsed = JSON.parse(trimmed.slice(start, end + 1));
          if (parsed.slides && Array.isArray(parsed.slides)) return parsed;
        } catch {
          /* not valid JSON */
        }
      }
    }
    // Try the next occurrence further back
    searchPos = slidesIdx - 1;
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
        /^(layout|background|theme|header-style|area-style|hidden|hide|code-font-size):/im.test(
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
        return { layout, background, theme, content: withoutTheme };
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
