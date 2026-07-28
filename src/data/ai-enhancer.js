/**
 * AI Enhancer
 *
 * Post-processes PPTX-imported markdown using AI via OpenRouter.
 * Uses JSON-structured output for reliable parsing.
 */

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
    .filter((slide) => slide.content && slide.content.trim())
    .map((slide, i) => {
      const orig = origDirectives[i] || {};
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
- Every slide MUST have non-empty "content" with actual slide body text

## Formatting Rules (STRICT)
- Area markers (@header, @main, @media, @footer) MUST have a blank line BEFORE and AFTER them
- Example: "@header\\n## Title\\n\\n@main\\n\\n- Point 1\\n- Point 2" (note \\n\\n before @main)
- Code blocks MUST have a blank line before and after the triple backticks
- Lists MUST have a blank line before and after them
- Tables MUST have a blank line before and after them
- Headers inside @main MUST have a blank line before them
- Speaker notes (<!-- notes: ... -->) go at the very end, with a blank line before them

Wrong: "@header\\n## Title\\n@main\\n- Point 1" (missing blank lines)
Right: "@header\\n## Title\\n\\n@main\\n\\n- Point 1"

Wrong: "@main\\n- Item 1\\n- Item 2\\n@media" (missing blank line before @media)
Right: "@main\\n\\n- Item 1\\n- Item 2\\n\\n@media"

## Header Hierarchy (IMPORTANT)
- title-slide: # for main title, ## for subtitle
- ALL other slides: ## for slide titles in @header. Never use ### or #### for slide titles
- Inside @main: NEVER use ## for sub-sections. Use ### only if truly needed for major breaks
- Remove **bold** wrapping from headers (write "## AGENDA", not "### **AGENDA**")

## Slide Structure
- Every slide MUST have both @header and @main (or @media for media-span)
- Two-column: @header, @main (left), @media (right). If right is empty, use header-content
- Media-span: MUST have @media with content

## Converting [Diagram: ...] to Mermaid

In the "content" field, replace [Diagram: Item1, Item2, Item3] with a mermaid code block.

Mermaid orientation depends on the slide layout:
- Single-column layouts (header-content, media-span): use flowchart LR (horizontal) — wide content area suits left-to-right flow
- Multi-column layouts (two-column, three-column): use flowchart TD (vertical) — narrow columns suit top-to-bottom flow
- Use varied shapes and arrow labels. NOT just linear chains.

Example for header-content layout:
\`\`\`mermaid
flowchart LR
    A["Item1"] --> B["Item2"] --> C["Item3"]
\`\`\`

Example for two-column layout:
\`\`\`mermaid
flowchart TD
    A["Item1"] --> B["Item2"] --> C["Item3"]
\`\`\`

## SlideMD Areas

Content areas: @title, @header, @main, @media, @sidebar, @footer
In two-column layout, right column MUST be @media (NOT @secondary).
@secondary is ONLY for three-column layout.

Do NOT use @notes — it is not a valid area marker and will be silently dropped.
To add speaker notes, use HTML comments: <!-- notes: Your note text here -->

## HTML Tags in Content

When HTML tag names appear in instructional content (e.g., "<button>", "<input>", "<script>"),
ALWAYS wrap them in backticks so they render as literal text: \`<button>\`, \`<input>\`.
Never write bare HTML tags in slide content — they will be rendered as actual DOM elements.`;

function buildFixPrompt(markdown) {
  return `Fix this SlideMD markdown and return as JSON.

## Core Principle: Be Conservative
Fix formatting and structural problems. Do NOT restructure slides that already work.
Do NOT invent content (headers, text, lists) that doesn't exist in the original.
Do NOT change a layout unless it is genuinely broken.

## What to Fix
- Header levels: # for title-slide only, ## for all other slide titles
- Remove **bold** wrapping from headers (e.g. "### **AGENDA**" → "## AGENDA")
- Recover code block newlines lost during extraction
- Fix broken links (URLs split across lines)
- Fix code with extra backticks, missing language tags, or wrong indentation
- Fix broken list formatting (missing dashes, wrong indentation)
- Fix tables with misaligned columns or missing header rows
- Remove duplicate blank lines and trailing whitespace
- Convert [Diagram: ...] markers to Mermaid code blocks

## What NOT to Do
- Do NOT change a slide's layout unless it is truly broken (e.g. two-column with empty right column)
- Do NOT add @header to a slide that only has @main — that's valid
- Do NOT add content that doesn't exist in the original (no fake headers, no invented lists)
- Do NOT split or merge slides
- Do NOT change image references or paths

## Slide Structure
- A slide with @main only is valid — leave it alone
- A slide with @header and @main is valid — leave it alone
- Two-column with empty @media → change to header-content (remove the empty @media)
- Media-span without @media → that's broken, add @media or change layout

Input markdown:
${markdown}`;
}

function buildGeneratePrompt(markdown) {
  return `Create an inspired SlideMD presentation from this content and return as JSON.

Your goal is to go ABOVE AND BEYOND the original slides. Do not just reorganize — redesign, enhance, and elevate.

## Creative Guidelines
- Reorganize for better flow, pacing, and storytelling
- Break up dense slides into focused, digestible slides (one idea per slide)
- Add transition slides between major sections to improve narrative flow
- Create summary or key takeaway slides at the end of sections
- Enhance bullet points with better phrasing, stronger verbs, and clearer structure
- Convert ALL [Diagram: ...] to Mermaid code blocks with varied shapes
- Use a mix of layouts (two-column, header-content, media-span) for visual variety
- Add speaker notes to key slides using: <!-- notes: Your note text here -->
- Improve the title slide to be more visually impactful

## Content Strategy
- Keep all substantive content but reorganize it for maximum clarity
- Split overloaded slides — if a slide has more than ~10 bullet points or ~15 lines of code, split it
- Combine related micro-content into cohesive slides
- Add section dividers or overview slides when transitioning between topics
- Every slide MUST have meaningful content in the appropriate area markers

## Formatting Rules (STRICT)
- Area markers (@header, @main, @media, @footer) MUST have a blank line BEFORE and AFTER them
- Example: "@header\\n## Title\\n\\n@main\\n\\n- Point 1\\n- Point 2" (note \\n\\n before @main)
- Code blocks MUST have a blank line before and after the triple backticks
- Lists MUST have a blank line before and after them
- Tables MUST have a blank line before and after them
- Headers inside @main MUST have a blank line before them
- Speaker notes (<!-- notes: ... -->) go at the very end, with a blank line before them
- Do NOT use @notes — it is not a valid area marker. Use <!-- notes: ... --> instead

## Header Rules
- Title slide: # for main title, ## for subtitle/author
- All other slides: ## for slide titles in @header
- Inside @main: NEVER use ## for sub-sections. Use ### only if truly needed
- Remove **bold** wrapping from headers

## Images (IMPORTANT)
- Do NOT assume what an image shows based on its filename or position
- If you are unsure what an image is about, DELETE the <img> tag
- Only keep images if you are confident about what they depict and they add value

## Mermaid Diagrams
- Use flowchart LR (horizontal) for single-column layouts (header-content, media-span)
- Use flowchart TD (vertical) for multi-column layouts (two-column, three-column)
- Use varied shapes and arrow labels. NOT just linear chains.

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
  }

  return null;
}
