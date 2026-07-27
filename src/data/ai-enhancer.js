/**
 * AI Enhancer
 *
 * Post-processes PPTX-imported markdown using AI via OpenRouter.
 * Two modes: "fix" (cleanup) and "generate" (inspired deck with Mermaid diagrams).
 *
 * NOTE: The primary entry point is AiProcessingModal which handles streaming.
 * This module provides prompt builders and a non-streaming fallback.
 */

import { SettingsModal } from "../editor/settings-modal.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Extract markdown from AI response, stripping any wrapping code fences.
 * @param {string} text
 * @returns {string}
 */
export function extractMarkdown(text) {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:markdown|slide)?\s*\n([\s\S]*?)\n```$/);
  if (fenceMatch) return fenceMatch[1].trim();
  if (trimmed.startsWith("```")) {
    const firstNewline = trimmed.indexOf("\n");
    const lastFence = trimmed.lastIndexOf("```");
    if (lastFence > firstNewline) {
      return trimmed.slice(firstNewline + 1, lastFence).trim();
    }
  }
  const firstSlideIdx = trimmed.search(/^---$|^layout:\s*/m);
  if (firstSlideIdx > 0) {
    return trimmed.slice(firstSlideIdx).trim();
  }
  return trimmed;
}

/**
 * Extract per-slide directives (layout, background, theme) from markdown.
 * @param {string} markdown
 * @returns {Array<{layout: string, background: string, theme: string}>}
 */
function extractDirectives(markdown) {
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
 * Re-inject original backgrounds and layouts into AI response.
 * Also fixes incorrect layouts (e.g., header-content when @media exists).
 * @param {string} aiResponse - Cleaned AI markdown (no backgrounds/layouts).
 * @param {string} original - Original markdown with backgrounds/layouts.
 * @returns {string} Fixed markdown.
 */
export function reinjectDirectives(aiResponse, original) {
  const origDirectives = extractDirectives(original);
  const aiSlides = aiResponse.split(/\n---\n/);

  const result = aiSlides.map((slide, i) => {
    const orig = origDirectives[i] || {};
    const lines = slide.split("\n");
    const newLines = [];

    for (const line of lines) {
      // Skip existing layout/background/theme lines
      if (/^layout:\s/.test(line)) continue;
      if (/^background:\s/.test(line)) continue;
      if (/^theme:\s/.test(line)) continue;

      // Insert layout before first @area or first content
      if (orig.layout && !newLines.some((l) => /^layout:\s/.test(l))) {
        if (/^@\w+/.test(line) || (line.trim() && !/^@\w+/.test(line) && newLines.length > 0 && /^@\w+/.test(newLines[newLines.length - 1]))) {
          newLines.push(`layout: ${orig.layout}`);
        }
      }

      newLines.push(line);
    }

    // If layout wasn't inserted yet, add it at the top
    if (orig.layout && !newLines.some((l) => /^layout:\s/.test(l))) {
      newLines.unshift(`layout: ${orig.layout}`);
    }

    // Add background after layout
    if (orig.background) {
      const layoutIdx = newLines.findIndex((l) => /^layout:\s/.test(l));
      if (layoutIdx >= 0) {
        newLines.splice(layoutIdx + 1, 0, `background: ${orig.background}`);
      } else {
        newLines.unshift(`background: ${orig.background}`);
      }
    }

    // Add theme after background (or after layout)
    if (orig.theme) {
      const afterBg = orig.background
        ? newLines.findIndex((l) => /^background:\s/.test(l))
        : newLines.findIndex((l) => /^layout:\s/.test(l));
      if (afterBg >= 0) {
        newLines.splice(afterBg + 1, 0, `theme: ${orig.theme}`);
      }
    }

    // Fix wrong layouts: if slide has @media, layout should be two-column or media-span
    const hasMedia = newLines.some((l) => /^@media\b/.test(l));
    const currentLayout = newLines.find((l) => /^layout:\s/.test(l));
    if (hasMedia && currentLayout) {
      const layoutVal = currentLayout.replace(/^layout:\s*/, "");
      if (layoutVal === "header-content" || layoutVal === "content-sidebar") {
        const slideIdx = newLines.indexOf(currentLayout);
        newLines[slideIdx] = "layout: two-column";
      }
    }

    return newLines.join("\n");
  });

  return result.join("\n\n---\n\n");
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

/**
 * System prompt — SlideMD syntax reference. Sent once, shared across all calls.
 */
const SYSTEM_PROMPT = `You are a SlideMD markdown editor. You receive markdown and output improved markdown.

RULE 1: NEVER output any text before the markdown. No analysis, no thinking, no explanations, no "Here is..." preamble. Start DIRECTLY with the first line of markdown.
RULE 2: Output ONLY the markdown content. Nothing else.

## SlideMD Syntax

- Slides separated by \`---\`
- Speaker notes: \`<!-- notes: ... -->\` (first line, before layout)
- Layout: \`layout: preset-name\` (MUST be first line of each slide)
- Content areas: \`@title\`, \`@header\`, \`@main\`, \`@media\`, \`@sidebar\`, \`@footer\`
- Layouts: title-slide, header-content, two-column, media-span, left-heavy, right-heavy, three-column

## CRITICAL RULES
- NEVER change existing \`layout:\` directives
- NEVER remove \`background:\` or \`theme:\` directives
- In \`two-column\` layout, right column is \`@media\` (NOT \`@secondary\`)
- \`@secondary\` is ONLY used in \`three-column\` layout
- No emojis

## Converting [Diagram: ...] to Mermaid
When you see [Diagram: Item1, Item2, Item3], replace it with:
\`\`\`mermaid
flowchart LR
    A["Item1"] --> B["Item2"] --> C["Item3"]
\`\`\`
Use flowchart TD for hierarchy, flowchart LR for processes.`;

/**
 * Build the "fix issues" prompt.
 * @param {string} markdown - Cleaned markdown (images stripped, no frontmatter).
 * @returns {string}
 */
function buildFixPrompt(markdown) {
  return `Fix the following SlideMD markdown.

CRITICAL: Convert ALL [Diagram: ...] markers into Mermaid code blocks:
When you see [Diagram: Item1, Item2, Item3], replace with:
\`\`\`mermaid
flowchart LR
    A["Item1"] --> B["Item2"] --> C["Item3"]
\`\`\`

Also:
- Recover code block newlines lost during extraction
- Fix formatting: consistent spacing, lists, tables
- Ensure every slide has a layout: directive
- In two-column layouts, right column MUST be @media (NOT @secondary)
- Preserve ALL background: and theme: directives exactly as-is

Output ONLY the fixed markdown.

---

${markdown}`;
}

/**
 * Build the "generate inspired deck" prompt.
 * @param {string} markdown - Cleaned markdown (images stripped, no frontmatter).
 * @returns {string}
 */
function buildGeneratePrompt(markdown) {
  return `Create a new inspired SlideMD presentation from this content.

CRITICAL: Convert ALL [Diagram: ...] markers into creative Mermaid code blocks.

Here are examples of how to convert diagrams:

Input: [Diagram: Goal, Task1, Task2, Task3, Done]
Output:
\`\`\`mermaid
flowchart TD
    A["🎯 Goal"] --> B["Task 1"]
    A --> C["Task 2"]
    B --> D["Task 3"]
    C --> D
    D --> E["✅ Done"]
\`\`\`

Input: [Diagram: Client, Team, Supervisor, Customer]
Output:
\`\`\`mermaid
graph TD
    C["Client"] -->|provides requirements| T["Team"]
    T -->|reports progress| S["Supervisor"]
    S -->|approves| C
    C <-->|feedback| T
    T -->|delivers to| Cu["Customer"]
\`\`\`

Tips: Use different shapes (rectangles, diamonds, circles), varied arrow labels, and logical grouping. NOT just linear chains.

CRITICAL RULES:
- Preserve ALL background: and theme: directives exactly
- In two-column layouts, right column is @media (NOT @secondary)
- NEVER remove layout:, background:, or theme: directives
- Output ONLY the SlideMD markdown. No analysis, no preamble.

---

${markdown}`;
}
