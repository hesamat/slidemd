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
  // Strip ```markdown ... ```, ```slide ... ```, or ``` ... ``` wrapping
  const match = trimmed.match(/^```(?:markdown|slide)?\s*\n([\s\S]*?)\n```$/);
  return match ? match[1].trim() : trimmed;
}

/**
 * Strip frontmatter (layout, theme, background) from markdown before sending to AI.
 * The AI should infer these from context, not copy them verbatim.
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
 * @param {string} markdown
 * @param {"fix"|"generate"} mode
 * @returns {{ system: string, user: string }}
 */
export function buildMessages(markdown, mode) {
  const cleaned = stripFrontmatter(markdown);
  return {
    system: SYSTEM_PROMPT,
    user: mode === "fix" ? buildFixPrompt(cleaned) : buildGeneratePrompt(cleaned),
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
const SYSTEM_PROMPT = `You are an expert at converting presentation content into SlideMD markdown format.

## SlideMD Syntax

**Basic Structure:**
- Slides separated by \`---\` (three dashes on their own line, one blank line before and after)
- Speaker notes: \`<!-- notes: ... -->\` (first line, before layout)
- Layout: \`layout: preset-name\` or \`layout: "grid" / columns\`
- Content areas: \`@title\`, \`@header\`, \`@main\`, \`@media\`, \`@secondary\`, \`@sidebar\`, \`@footer\`

**Layouts:** title-slide, header-content, two-column, media-span, left-heavy, right-heavy, three-column

**Rules:**
- ALWAYS specify \`layout:\` before \`@area\` markers
- Keep slides self-contained
- No emojis
- Use \`##\` for headings, \`**bold**\` for key terms

**Diagrams:**
- Convert diagram text (marked \`[Diagram: ...]\`) to Mermaid code blocks
- Use \`flowchart TD\` for hierarchy, \`flowchart LR\` for processes
- Each text item becomes a node, connect logically`;

/**
 * Build the "fix issues" prompt.
 * @param {string} markdown - Cleaned markdown (images stripped, no frontmatter).
 * @returns {string}
 */
function buildFixPrompt(markdown) {
  return `Fix the following SlideMD markdown:

1. Recover code block newlines lost during extraction
2. Fix horizontal adjacency (image+text → two-column layout)
3. Fix formatting: consistent spacing, lists, tables
4. Ensure every slide has a \`layout:\` directive
5. Convert \`[Diagram: ...]\` markers to Mermaid flowcharts

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

Guidelines:
1. Reorganize for better flow and pacing
2. Add/remove slides as needed
3. Convert ALL \`[Diagram: ...]\` to Mermaid code blocks
4. Improve structure, formatting, layout
5. Use varied layouts
6. Add speaker notes to key slides
7. Keep all substantive content

Output ONLY the SlideMD markdown.

---

${markdown}`;
}
