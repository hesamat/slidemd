/**
 * AI Prompt Builder
 *
 * Builds system and user messages for AI calls from reusable prompt fragments.
 * Provides layout-list generation, frontmatter stripping, and batch message
 * construction for whole-deck operations.
 */

import { LayoutData } from "../layout-data.js";
import { MarkdownParser } from "../markdown-parser.js";
import { AiPromptComposer } from "./ai-prompt-composer.js";
import systemPrompt from "../prompts/system-prompt.md?raw";
import fixPrompt from "../prompts/fix-prompt.md?raw";
import generatePrompt from "../prompts/generate-prompt.md?raw";
import polishPrompt from "../prompts/polish-prompt.md?raw";

const ALLOWED_AREAS = ["title", "header", "main", "media", "secondary", "sidebar", "footer"];

/**
 * Build additional instructions suffix from user-provided generate options.
 * Appended to the user prompt so the AI sees the user's preferences.
 * @param {object} opts
 * @param {string} [opts.flow] — "story" | "technical" | "persuasive" | "instructional"
 * @param {string} [opts.mode] — "polish" | "remix" | "reimagine"
 * @param {boolean} [opts.addSpeakerNotes]
 * @param {boolean} [opts.preserveVisualIdentity]
 * @returns {string}
 */
export function buildGenerateOptionsSuffix(opts = {}) {
  if (!opts) return "";
  const parts = [];
  if (opts.flow) {
    const flowMap = {
      story:
        "Use a narrative, story-driven approach: emotional engagement, characters or examples, and a clear story arc.",
      technical:
        "Use a technical, logic-driven approach: build complexity step by step, lead with evidence and data.",
      persuasive:
        "Use a persuasive, argument-driven approach: problem, stakes, solution, benefits, call to action.",
      instructional:
        "Use an instructional, learning-driven approach: objectives, step-by-step guidance, examples, recap.",
    };
    if (flowMap[opts.flow]) parts.push(`\n${flowMap[opts.flow]}`);
  }
  if (opts.addSpeakerNotes) {
    parts.push(
      "\nAdd useful speaker notes at the end of each slide that does not already have them.",
    );
  } else if (opts.mode === "polish") {
    // The polish prompt asks to preserve notes unless asked to add them;
    // this suffix makes the default explicit when the checkbox is off.
    parts.push(
      "\nDo not add new speaker notes. Preserve existing notes, but do not create new ones.",
    );
  }
  if (opts.preserveVisualIdentity) {
    parts.push(
      "\nPreserve the original theme, colors, backgrounds, and visual language whenever possible. Keep each slide's existing `theme:` and `background:` directives unless they clearly do not fit the restructured content.",
    );
  } else if (opts.preserveVisualIdentity === false) {
    parts.push(
      "\nDo not preserve the original theme, colors, backgrounds, or visual language. You may introduce new `theme:` and `background:` directives that support the new direction, or omit them entirely.",
    );
  }
  return parts.join("");
}

/**
 * Build the layout list injected into the system prompt.
 *
 * Uses a per-layout line format (`layout: @area1, @area2, ...`) rather than a
 * wide cross-reference table. The table format (8 columns × 12 rows) was hard
 * for the AI to scan accurately — it frequently used `@secondary` for
 * `two-column` (which only has `@media`) or dropped `@main` from `media-span`.
 * The per-layout format makes each layout's allowed areas unambiguous.
 *
 * @returns {string}
 */
/**
 * Strip `theme:` and `background:` directives from markdown.
 * Only replaces directives outside fenced code blocks.
 *
 * @param {string} markdown
 * @returns {string}
 */
export function stripThemeAndBackground(markdown) {
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
    if (/^(theme|background):\s*.*$/.test(line)) {
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

export function getAllowedLayoutList() {
  const layouts = LayoutData.getAllLayouts().filter((name) => LayoutData.hasLayout(name));
  const lines = [];
  for (const layout of layouts) {
    const allowedAreas = LayoutData.getAreaNames(layout);
    const areaTags = ALLOWED_AREAS.filter((a) => allowedAreas.includes(a)).map((a) => `@${a}`);
    lines.push(`${layout}: ${areaTags.join(", ")}`);
  }
  return lines.join("\n");
}

/**
 * Strip frontmatter directives from markdown.
 * Only replaces directives outside fenced code blocks.
 *
 * Fix mode: keeps layout (so AI preserves it), strips theme/background/hidden/code-font-size
 *   (restored post-AI via injectDirectives/restoreDirectives).
 * Generate mode: strips layout, hidden, code-font-size — keeps background and theme
 *   so the AI can see the originals and make informed decisions.
 *
 * @param {string} markdown
 * @param {"fix"|"generate"} mode
 * @returns {string}
 */
export function stripFrontmatter(markdown, mode) {
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
      // Fix mode: keep layout so AI preserves it; strip theme/background/hidden/code-font-size
      if (/^(theme|background|hidden|code-font-size):\s*.*$/.test(line)) {
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
 * Build messages for the AI call (single-call path, used for ≤8 slides).
 * @param {string} markdown - The original markdown (with backgrounds/layouts).
 * @param {"fix"|"generate"} mode - Enhancement mode.
 * @returns {{ system: string, user: string }}
 */
export function buildMessages(markdown, mode) {
  const cleaned = stripFrontmatter(markdown, mode);
  const fragment = mode === "fix" ? fixPrompt : generatePrompt;
  const composer = new AiPromptComposer({
    systemFragment: systemPrompt,
    userFragment: fragment,
  });
  return composer.compose({ markdown: cleaned, layoutList: getAllowedLayoutList() });
}

/**
 * Generate a lightweight deck summary for batch context.
 * @param {string} markdown - The original markdown.
 * @returns {string}
 */
export function buildDeckSummary(markdown) {
  // Fence-aware split so `---` inside code blocks doesn't create phantom
  // slides and misalign the outline (same fix as buildBatchMessages /
  // extractDirectives / injectDirectives).
  const slides = new MarkdownParser().splitSlides(markdown);
  const titles = slides.map((slide, i) => {
    const layoutMatch = slide.match(/^layout:\s*(.+)$/m);
    const layout = layoutMatch?.[1]?.trim() || "header-content";
    const lines = slide.split("\n").filter((l) => l.trim());
    const titleLine = lines.find((l) => /^#{1,6}\s/.test(l)) || lines[0] || `Slide ${i + 1}`;
    const title = titleLine.replace(/^#+\s*/, "").trim();
    return `${i + 1}. [${layout}] ${title}`;
  });

  const hasCode = slides.some((s) => /```/.test(s));
  const hasDiagrams = slides.some((s) => /\[Diagram:/.test(s));
  const hasImages = slides.some((s) => /<img/.test(s));
  const uniqueLayouts = [
    ...new Set(
      slides.map((s) => {
        const m = s.match(/^layout:\s*(.+)$/m);
        return m?.[1]?.trim() || "header-content";
      }),
    ),
  ];

  const parts = [`Deck: ${slides.length} slides. Layouts: ${uniqueLayouts.join(", ")}.`];
  const features = [];
  if (hasCode) features.push("code blocks");
  if (hasDiagrams) features.push("diagrams");
  if (hasImages) features.push("images");
  if (features.length) parts.push(`Features: ${features.join(", ")}.`);
  parts.push("Outline:", titles.join("\n"));
  return parts.join("\n");
}

export const BATCH_SIZE = 8;

/**
 * Build messages for a batched AI call (returns a subset of slides).
 * @param {string} markdown - The original markdown.
 * @param {"fix"|"generate"} mode - Enhancement mode.
 * @param {number} startIdx - 0-based index of the first slide to return.
 * @param {number} endIdx - 0-based index of the last slide (exclusive).
 * @param {number} totalSlides - Total number of slides in the deck.
 * @param {string} [deckSummary] - Pre-generated deck summary (generate mode only).
 * @param {string} [batchMode] - "polish" | undefined. When "polish",
 *   uses polish-prompt.md (specific cleanup rules) instead of generate-prompt.md.
 * @returns {{ system: string, user: string, original: string }}
 */
export function buildBatchMessages(
  markdown,
  mode,
  startIdx,
  endIdx,
  totalSlides,
  deckSummary,
  batchMode,
) {
  const cleaned = stripFrontmatter(markdown, mode);
  // Use the fence-aware split so `---` inside code blocks doesn't create
  // phantom slides and misalign indices with the orchestrator's slide list.
  const allSlides = new MarkdownParser().splitSlides(cleaned);
  const chunk = allSlides.slice(startIdx, endIdx).join("\n\n---\n\n");
  const actualCount = allSlides.slice(startIdx, endIdx).length;

  // Add neighbor context slides for fix mode with explicit indices
  let contentForPrompt;
  if (mode === "fix") {
    const parts = [];
    if (startIdx > 0) {
      parts.push(
        `<!-- CONTEXT SLIDE — DO NOT INCLUDE IN OUTPUT (index ${startIdx - 1}) -->\n${allSlides[startIdx - 1]}`,
      );
    }
    // Add explicit indices to each slide in the chunk
    const indexedSlides = allSlides.slice(startIdx, endIdx).map((slide, i) => {
      return `<!-- SLIDE INDEX ${startIdx + i} (return this) -->\n${slide}`;
    });
    parts.push(indexedSlides.join("\n\n---\n\n"));
    if (endIdx < totalSlides) {
      parts.push(
        `<!-- CONTEXT SLIDE — DO NOT INCLUDE IN OUTPUT (index ${endIdx}) -->\n${allSlides[endIdx]}`,
      );
    }
    contentForPrompt = parts.join("\n\n---\n\n");
  } else {
    contentForPrompt = chunk;
  }

  // Polish mode uses polish-prompt.md (specific PPTX cleanup rules) even
  // in generate mode — the mode controls frontmatter stripping, not the
  // prompt fragment.
  const fragment = mode === "fix" || batchMode === "polish" ? polishPrompt : generatePrompt;
  const composer = new AiPromptComposer({
    systemFragment: systemPrompt,
    userFragment: fragment,
  });
  const { system, user } = composer.compose({
    markdown: contentForPrompt,
    layoutList: getAllowedLayoutList(),
  });

  const paginationInstruction =
    mode === "fix"
      ? `\n\nCRITICAL: You must return EXACTLY ${actualCount} slide(s) — one for each "SLIDE INDEX" comment in the input (indices ${startIdx} through ${endIdx - 1}). Do NOT return context slides. Each output slide must include the same "SLIDE INDEX" comment as its first line.`
      : `\n\nReturn exactly ${actualCount} slide(s) as JSON. Fix or organize these slides within the context of the full deck.`;

  const userPrefix =
    mode === "generate" && deckSummary ? `Deck Context:\n${deckSummary}\n\nInput markdown:\n` : "";

  return {
    system,
    user: userPrefix + user + paginationInstruction,
    original: markdown,
  };
}

/**
 * Split markdown into individual slides (stripped of frontmatter).
 * @param {string} markdown - The original markdown.
 * @param {"fix"|"generate"} mode - Enhancement mode.
 * @returns {string[]}
 */
export function splitSlidesForAi(markdown, mode) {
  const cleaned = stripFrontmatter(markdown, mode);
  // Use the fence-aware parser so code blocks containing `---` are not split.
  return new MarkdownParser().splitSlides(cleaned);
}
