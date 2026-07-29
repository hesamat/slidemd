/**
 * AI Enhancer
 *
 * Post-processes PPTX-imported markdown using AI via OpenRouter.
 * Uses JSON-structured output for reliable parsing.
 */

import systemPrompt from "./prompts/system-prompt.md?raw";
import fixPrompt from "./prompts/fix-prompt.md?raw";
import generatePrompt from "./prompts/generate-prompt.md?raw";

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
      parts.push(slide.content);
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
          const html = areas[name];
          if (!html) continue;
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
 * Restore original backgrounds and themes onto AI-produced slides.
 * Trusts the AI for layout choices.
 * @param {{ layout: string, background?: string, theme?: string, content: string }[]} slides
 * @param {{ layout: string, background: string, theme: string }[]} origDirectives
 * @returns {typeof slides}
 */
export function restoreDirectives(slides, origDirectives) {
  return slides.map((slide, i) => {
    const orig = origDirectives[i] || {};
    return {
      ...slide,
      background: orig.background || slide.background || "",
      theme: orig.theme || slide.theme || "",
    };
  });
}

/**
 * Extract per-slide directives (layout, background, theme) from original markdown.
 * @param {string} markdown
 * @returns {Array<{layout: string, background: string, theme: string}>}
 */
export function extractDirectives(markdown) {
  const slides = markdown.split(/\n---\n/);
  return slides.map((slide) => {
    const layoutMatch = slide.match(/^layout:\s*(.+)$/m);
    const bgMatch = slide.match(/^background:\s*(.+)$/m);
    const themeMatch = slide.match(/^theme:\s*(.+)$/m);
    return {
      layout: layoutMatch?.[1]?.trim() || "",
      background: bgMatch?.[1]?.trim() || "",
      theme: themeMatch?.[1]?.trim() || "",
    };
  });
}

/**
 * Strip frontmatter directives from markdown.
 * Only replaces directives outside fenced code blocks.
 *
 * Fix mode: strips layout, theme, background, hidden, code-font-size
 * Generate mode: strips layout, hidden, code-font-size — keeps background and theme
 *   so the AI can see the originals and make informed decisions.
 *
 * @param {string} markdown
 * @param {"fix"|"generate"} mode
 * @returns {string}
 */
function stripFrontmatter(markdown, mode) {
  const lines = markdown.split("\n");
  const result = [];
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      result.push(line);
      continue;
    }
    if (inFence) {
      result.push(line);
      continue;
    }
    if (mode === "generate") {
      // Generate mode: keep background and theme so AI sees the originals
      if (/^(layout|hidden|code-font-size):\s*.*$/.test(line)) {
        result.push("");
        continue;
      }
    } else {
      // Fix mode: strip all directives — originals are restored post-AI
      if (/^(layout|theme|background|hidden|code-font-size):\s*.*$/.test(line)) {
        result.push("");
        continue;
      }
    }
    result.push(line);
  }
  return result
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Build messages for the AI call.
 * @param {string} markdown - The original markdown (with backgrounds/layouts).
 * @param {"fix"|"generate"} mode - Enhancement mode.
 * @returns {{ system: string, user: string }}
 */
export function buildMessages(markdown, mode) {
  const cleaned = stripFrontmatter(markdown, mode);
  return {
    system: systemPrompt,
    user:
      mode === "fix"
        ? fixPrompt.replace("{{markdown}}", cleaned)
        : generatePrompt.replace("{{markdown}}", cleaned),
  };
}

/**
 * Estimate token count (rough: 1 token ≈ 4 chars for English).
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate appropriate max_tokens based on input size and mode.
 * @param {string} markdown - The original markdown.
 * @param {"fix"|"generate"} mode - Enhancement mode.
 * @returns {number}
 */
export function estimateMaxTokens(markdown, mode) {
  const cleaned = stripFrontmatter(markdown, mode);
  const inputTokens = estimateTokens(cleaned);
  const multiplier = mode === "generate" ? 1.8 : 1.2;
  const estimated = Math.ceil(inputTokens * multiplier);
  return Math.min(Math.max(16000, estimated), 128000);
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

  return null;
}
