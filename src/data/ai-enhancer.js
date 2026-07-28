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
  return slides.map((slide, i) => {
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
- Every slide MUST have non-empty "content" with actual slide body text

## Header Hierarchy (IMPORTANT)
- title-slide: # for main title, ## for subtitle
- ALL other slides: ## for slide titles in @header. Never use ### or #### for slide titles
- Remove **bold** wrapping from headers (write "## AGENDA", not "### **AGENDA**")

## Slide Structure
- Every slide MUST have both @header and @main (or @media for media-span)
- Two-column: @header, @main (left), @media (right). If right is empty, use header-content
- Media-span: MUST have @media with content

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
  return `Fix this SlideMD markdown and return as JSON. Be thorough — fix ALL issues.

## Header Rules (STRICT)
- Title slide (layout: title-slide): use # for the main title, ## for subtitle/author
- ALL other slides: use ## for slide titles. Never use ### or #### for slide titles
- Remove **bold** wrapping from headers (e.g. "### **AGENDA**" must become "## AGENDA")
- Inside @main content, you may use ### for sub-sections if truly needed, but prefer ##

## Slide Structure Rules (STRICT)
- Every slide MUST have both @header and @main (or @media for media-span layout)
- Two-column layout: MUST have @header, @main (left column), and @media (right column). If the right column is empty, use header-content layout instead
- Media-span layout: MUST have @media with content. Add @header if there's a title
- A slide with ONLY @media and no header/main is broken — fix it by either adding @header/@main or changing the layout
- If a slide has content but no area markers, add @main (or @header + @main if there's a heading)

## Other Fixes
- Recover code block newlines lost during extraction (code blocks may appear as single lines)
- Fix broken links (URLs split across lines)
- Fix code with extra backticks, missing language tags, or wrong indentation
- Fix broken list formatting (missing dashes, wrong indentation, items merged onto one line)
- Fix tables with misaligned columns or missing header rows
- Remove duplicate blank lines and trailing whitespace
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
- Every slide MUST have meaningful content in the appropriate area markers (@header, @main, etc.)

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
