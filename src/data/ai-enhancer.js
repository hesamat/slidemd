/**
 * AI Enhancer
 *
 * Post-processes PPTX-imported markdown using AI via OpenRouter.
 * Uses JSON-structured output for reliable parsing.
 */

import { SettingsModal } from "../editor/settings-modal.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

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
 * @param {{ layout: string, background?: string, theme?: string, content: string }[]} slides
 * @param {{ layout: string, background: string, theme: string }[]} origDirectives
 * @returns {typeof slides}
 */
export function fixSlideLayouts(slides, origDirectives) {
  return slides.map((slide, i) => {
    const orig = origDirectives[i] || {};
    const hasMedia = /^@media\b/m.test(slide.content);

    // Preserve original background/theme
    const result = {
      ...slide,
      background: orig.background || slide.background || "",
      theme: orig.theme || slide.theme || "",
    };

    // If original had a layout, prefer it
    if (orig.layout) {
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
 * Strip frontmatter (layout, theme, background) from markdown.
 * @param {string} markdown
 * @returns {string}
 */
function stripFrontmatter(markdown) {
  return markdown
    .replace(/^layout:\s*.*$/gm, "")
    .replace(/^theme:\s*.*$/gm, "")
    .replace(/^background:\s*.*$/gm, "")
    .replace(/^hidden:\s*.*$/gm, "")
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
    system: SYSTEM_PROMPT,
    user: mode === "fix" ? buildFixPrompt(cleaned) : buildGeneratePrompt(cleaned),
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

const SYSTEM_PROMPT = `You are a SlideMD markdown editor. You receive markdown and output improved markdown as JSON.

## Output Format

You MUST respond with valid JSON only. No other text. No explanations. No markdown fences.

{
  "slides": [
    {
      "layout": "header-content",
      "content": "@header\\n## Title\\n\\n@main\\n- Point 1\\n- Point 2"
    }
  ]
}

Rules:
- "layout" must be one of: title-slide, header-content, two-column, media-span, left-heavy, right-heavy, three-column
- "background" is optional (keep the original if provided)
- "theme" is optional (keep the original if provided)
- "content" is the slide body (everything after layout/background/theme directives)
- Use \\n for newlines in the content string
- Each slide in the array corresponds to one slide separated by ---

## Converting [Diagram: ...] to Mermaid

In the "content" field, replace [Diagram: Item1, Item2, Item3] with a mermaid code block:

\`\`\`mermaid
flowchart LR
    A["Item1"] --> B["Item2"] --> C["Item3"]
\`\`\`

Use varied shapes and arrow labels. NOT just linear chains.

## SlideMD Areas

Content areas: @title, @header, @main, @media, @sidebar, @footer
In two-column layout, right column MUST be @media (NOT @secondary).
@secondary is ONLY for three-column layout.`;

function buildFixPrompt(markdown) {
  return `Fix this SlideMD markdown and return as JSON.

Issues to fix:
- Recover code block newlines lost during extraction
- Fix broken links (split URLs)
- Fix code with extra backticks or spaces
- Convert [Diagram: ...] markers to Mermaid code blocks

Input markdown:
${markdown}`;
}

function buildGeneratePrompt(markdown) {
  return `Create an inspired SlideMD presentation from this content and return as JSON.

Guidelines:
- Reorganize for better flow and pacing
- Convert ALL [Diagram: ...] to Mermaid code blocks with varied shapes
- Improve formatting, structure, and layout
- Add speaker notes to key slides
- Keep all substantive content

Input markdown:
${markdown}`;
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

  // Find JSON by locating "slides": (with colon — only in real JSON, not analysis)
  const slidesIdx = trimmed.indexOf('"slides":');
  if (slidesIdx >= 0) {
    // Walk backwards to find the opening {
    let start = slidesIdx;
    while (start > 0 && trimmed[start] !== "{") start--;
    if (trimmed[start] === "{") {
      // Walk forwards to find the matching closing }
      let depth = 0;
      let end = start;
      for (; end < trimmed.length; end++) {
        if (trimmed[end] === "{") depth++;
        else if (trimmed[end] === "}") {
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
  }

  return null;
}
