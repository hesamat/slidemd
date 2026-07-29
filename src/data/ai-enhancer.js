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
 * Fix layouts in parsed slides (e.g., header-content → two-column when @media exists).
 * In "fix" mode, original layouts are preserved. In "generate" mode, AI-chosen layouts
 * are kept (only backgrounds/themes are preserved from the original).
 * @param {{ layout: string, background?: string, theme?: string, content: string }[]} slides
 * @param {{ layout: string, background: string, theme: string }[]} origDirectives
 * @param {"fix"|"generate"} mode
 * @returns {typeof slides}
 */
export function fixSlideLayouts(slides, origDirectives, mode = "fix") {
  return slides
    .map((slide, i) => ({ slide, origIdx: i }))
    .filter(({ slide }) => slide.content && slide.content.trim())
    .map(({ slide, origIdx }) => {
      const orig = origDirectives[origIdx] || {};
      const hasMedia = /^@media\b/m.test(slide.content);

      // Always preserve original background/theme when available
      const result = {
        ...slide,
        background: orig.background || slide.background || "",
        theme: orig.theme || slide.theme || "",
      };

      // In "fix" mode, prefer the original layout (AI may have mis-chosen)
      // In "generate" mode, keep the AI's layout choice (the whole point is reorganization)
      if (mode === "fix" && orig.layout) {
        result.layout = orig.layout;
      }

      // Fix wrong layouts: if slide has @media but layout is header-content
      if (hasMedia && (result.layout === "header-content" || result.layout === "content-sidebar")) {
        result.layout = "two-column";
      }

      return result;
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
 * Strip frontmatter directives (layout, theme, background, hidden) from markdown.
 * Only replaces directives outside fenced code blocks to avoid stripping
 * legitimate content that happens to match directive patterns.
 * @param {string} markdown
 * @returns {string}
 */
function stripFrontmatter(markdown) {
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
    if (/^(layout|theme|background|hidden):\s*.*$/.test(line)) {
      result.push("");
      continue;
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
 * @returns {{ system: string, user: string, original: string }}
 */
export function buildMessages(markdown, mode) {
  const cleaned = stripFrontmatter(markdown);
  return {
    system: systemPrompt,
    user:
      mode === "fix"
        ? fixPrompt.replace("{{markdown}}", cleaned)
        : generatePrompt.replace("{{markdown}}", cleaned),
    original: markdown,
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
