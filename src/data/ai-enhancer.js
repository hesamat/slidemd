/**
 * AI Enhancer
 *
 * Post-processes PPTX-imported markdown using AI via OpenRouter.
 * Two modes: "fix" (cleanup) and "generate" (inspired deck with Mermaid diagrams).
 */

import { SettingsModal } from "../editor/settings-modal.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Enhance markdown using AI.
 * @param {string} markdown - Rule-based markdown output.
 * @param {"fix"|"generate"} mode - Enhancement mode.
 * @returns {Promise<string>} Enhanced markdown.
 * @throws {Error} If API key is not configured or API call fails.
 */
export async function enhanceWithAI(markdown, mode) {
  const apiKey = SettingsModal.getApiKey();
  const model = SettingsModal.getModel();

  if (!apiKey) {
    throw new Error("API key not configured. Open Settings to add your OpenRouter API key.");
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = mode === "fix" ? buildFixPrompt(markdown) : buildGeneratePrompt(markdown);

  const response = await callOpenRouter(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    apiKey,
    model,
  );

  return extractMarkdown(response);
}

/**
 * Call OpenRouter chat completion API.
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} apiKey
 * @param {string} model
 * @returns {Promise<string>} Assistant response text.
 */
async function callOpenRouter(messages, apiKey, model) {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 16000,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from AI");
  }
  return content;
}

/**
 * Extract markdown from AI response, stripping any wrapping code fences.
 * @param {string} text
 * @returns {string}
 */
export function extractMarkdown(text) {
  const trimmed = text.trim();
  // Strip ```markdown ... ``` or ``` ... ``` wrapping
  const match = trimmed.match(/^```(?:markdown)?\s*\n([\s\S]*?)\n```$/);
  return match ? match[1].trim() : trimmed;
}

/**
 * System prompt shared by both modes.
 * Includes SlideMD syntax reference from docs/prompt-template.md.
 * @returns {string}
 */
export function buildSystemPrompt() {
  return `You are an expert at converting presentation content into SlideMD markdown format.

## SlideMD Syntax

**Basic Structure:**
- Slides are separated by \`---\` (three dashes on a line by themselves)
- Speaker notes: \`<!-- notes: ... -->\` (first line of slide, before layout)
- Each slide begins with frontmatter: \`layout: preset-name\` or \`layout: "grid definition" / columns\`
- Content areas: \`@title\`, \`@header\`, \`@main\`, \`@media\`, \`@secondary\`, \`@sidebar\`, \`@footer\`
- Content before first \`@area\` flows into \`@main\`

**Layout Patterns:**
- \`layout: title-slide\` — centered title slide
- \`layout: header-content\` — header + main content
- \`layout: two-column\` — header + main + media
- \`layout: media-span\` — header + main + full-height media
- \`layout: left-heavy\` / \`layout: right-heavy\` — asymmetric columns
- \`layout: three-column\` — three equal columns
- Custom: \`layout: "header header" "main media" / 1fr 1fr\`

**Slide Options:**
- \`theme: dark\` or \`theme: light\`
- \`background: linear-gradient(...)\` or \`background: #color\`
- \`hidden: true\` — hidden by default

**Built-in Features:**
- Code highlighting: fenced blocks with language identifier
- Math: inline \`$x^2$\` or block \`$$\int$$\` (KaTeX)
- Diagrams: \`\`\`mermaid code blocks
- Markdown: bold, italic, lists, blockquotes, tables, links
- HTML: inline styles for custom formatting

**Rules:**
- ALWAYS specify \`layout:\` at the top of each slide before \`@area\` markers
- Place \`@area\` markers on their own lines
- Keep slides self-contained
- No emojis (causes PDF rendering issues)
- Use \`##\` for slide headings
- Use \`**bold**\` for key terms
- Use \`code font\` for syntax elements`;
}

/**
 * Build the "fix issues" prompt.
 * @param {string} markdown
 * @returns {string}
 */
export function buildFixPrompt(markdown) {
  return `Fix the following SlideMD markdown. Issues to address:

1. Recover code block newlines that may have been lost during extraction
2. Fix horizontal adjacency (image+text side-by-side should use two-column layout)
3. Remove decorative/template/logo images that don't carry content
4. Fix formatting: consistent spacing, proper list structure, table formatting
5. Ensure every slide has a \`layout:\` directive
6. Convert any diagram text (marked as \`[Diagram: ...]\`) into Mermaid flowcharts
   - Use \`flowchart TD\` or \`flowchart LR\` depending on the content structure
   - Each text item becomes a node
   - Connect nodes logically based on the content

Output ONLY the fixed markdown. No explanations.

---

${markdown}`;
}

/**
 * Build the "generate inspired deck" prompt.
 * @param {string} markdown
 * @returns {string}
 */
export function buildGeneratePrompt(markdown) {
  return `Create a new inspired SlideMD presentation based on the following imported content.

Guidelines:
1. Reorganize slides for better flow and pacing
2. Add or remove slides as needed for clarity
3. Convert ALL diagram text (marked as \`[Diagram: ...]\`) into Mermaid code blocks:
   - Use \`flowchart TD\` for hierarchical/top-down structures
   - Use \`flowchart LR\` for sequential/process flows
   - Use \`graph TD\` or \`graph LR\` for relationship diagrams
   - Each text item becomes a labeled node
   - Connect nodes logically based on the content
   - Add \`classDef\` styling for visual appeal when appropriate
4. Improve content structure, formatting, and layout
5. Suggest better visual hierarchy
6. Use varied layouts (not all the same)
7. Add speaker notes to key slides
8. Keep all substantive content from the original

Output ONLY the new SlideMD markdown. No explanations.

---

${markdown}`;
}
