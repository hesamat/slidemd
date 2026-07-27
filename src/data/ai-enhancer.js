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
  // Try to strip ```markdown ... ```, ```slide ... ```, or ``` ... ``` wrapping
  const fenceMatch = trimmed.match(/^```(?:markdown|slide)?\s*\n([\s\S]*?)\n```$/);
  if (fenceMatch) return fenceMatch[1].trim();
  // If no fence match, check if content starts/ends with ``` and strip manually
  if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
    const lines = trimmed.split("\n");
    if (lines.length >= 3) {
      return lines.slice(1, -1).join("\n").trim();
    }
  }
  return trimmed;
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

IMPORTANT: Output ONLY the SlideMD markdown. Do NOT include any analysis, reasoning, explanations, or commentary. Just the markdown.

## SlideMD Syntax

**Basic Structure:**
- Slides separated by \`---\`
- Speaker notes: \`<!-- notes: ... -->\` (first line, before layout)
- Layout: \`layout: preset-name\` or \`layout: "grid" / columns\`
- Content areas: \`@title\`, \`@header\`, \`@main\`, \`@media\`, \`@sidebar\`, \`@footer\`

**Layouts:** title-slide, header-content, two-column, media-span, left-heavy, right-heavy, three-column

**CRITICAL RULES:**
- ALWAYS preserve existing \`layout:\` directives — do NOT change them
- ALWAYS preserve \`background:\` and \`theme:\` directives — do NOT remove them
- In \`two-column\` layout, the right column is ALWAYS \`@media\` (NOT \`@secondary\`)
- \`@secondary\` is ONLY used in \`three-column\` layout
- ALWAYS specify \`layout:\` before \`@area\` markers
- Keep slides self-contained
- No emojis
- Use \`##\` for headings, \`**bold**\` for key terms

**Diagrams:**
- Convert diagram text (marked \`[Diagram: ...]\`) to Mermaid code blocks
- Use \`flowchart TD\` for hierarchy, \`flowchart LR\` for processes`;

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

CRITICAL: You MUST convert ALL [Diagram: ...] markers into Mermaid code blocks. Here is how:

When you see: [Diagram: Item1, Item2, Item3]

Replace it with:
\`\`\`mermaid
flowchart LR
    A["Item1"] --> B["Item2"] --> C["Item3"]
\`\`\`

For hierarchical content use flowchart TD. For processes use flowchart LR.

CRITICAL RULES:
- Preserve ALL background: and theme: directives exactly
- In two-column layouts, right column is @media (NOT @secondary)
- NEVER remove layout:, background:, or theme: directives
- Output ONLY the SlideMD markdown

---

${markdown}`;
}
