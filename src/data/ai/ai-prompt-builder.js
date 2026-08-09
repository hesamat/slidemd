/**
 * AI Prompt Builder
 *
 * Builds system and user messages for AI calls from reusable prompt fragments.
 * Provides frontmatter stripping, deck summaries, and batch message
 * construction for whole-deck operations.
 *
 * All prompt copy lives in `src/data/prompts/` fragments; this module owns
 * only the logic that chooses fragments and fills their placeholders.
 */

import { MarkdownParser } from "../markdown-parser.js";
import { composeMessages, extractVariant, getFragment, hasVariant } from "./ai-prompt-fragments.js";
import { replacePlaceholders } from "./ai-prompt-composer.js";

export { getAllowedLayoutList } from "./ai-prompt-fragments.js";

/**
 * Build additional instructions suffix from user-provided generate options.
 * Appended to the user prompt so the AI sees the user's preferences.
 * The guidance copy comes from snippet fragments in `src/data/prompts/`.
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
  if (opts.flow && opts.mode !== "polish") {
    const flowGuidance = getFragment("flow-guidance.md");
    if (hasVariant(flowGuidance, opts.flow)) {
      parts.push(`\n${extractVariant(flowGuidance, opts.flow)}`);
    }
  }
  const speakerNotesGuidance = getFragment("speaker-notes-guidance.md");
  if (opts.addSpeakerNotes) {
    parts.push(`\n${extractVariant(speakerNotesGuidance, "add")}`);
  } else if (opts.mode === "polish") {
    // The polish prompt asks to preserve notes unless asked to add them;
    // this suffix makes the default explicit when the checkbox is off.
    parts.push(`\n${extractVariant(speakerNotesGuidance, "preserve")}`);
  }
  const visualIdentityGuidance = getFragment("visual-identity-guidance.md");
  if (opts.preserveVisualIdentity) {
    parts.push(`\n${extractVariant(visualIdentityGuidance, "preserve")}`);
  } else if (opts.preserveVisualIdentity === false) {
    parts.push(`\n${extractVariant(visualIdentityGuidance, "discard")}`);
  }
  return parts.join("");
}

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
  const fragment =
    mode === "fix" ? getFragment("fix-prompt.md") : getFragment("generate-prompt.md");
  return composeMessages(getFragment("system-prompt.md"), fragment, { markdown: cleaned });
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
  const fragment =
    mode === "fix"
      ? getFragment("fix-prompt.md")
      : batchMode === "polish"
        ? getFragment("polish-prompt.md")
        : getFragment("generate-prompt.md");
  const { system, user } = composeMessages(getFragment("system-prompt.md"), fragment, {
    markdown: contentForPrompt,
  });

  const pagination = getFragment("batch-pagination.md");
  const paginationVariant = mode === "fix" ? "fix" : "generate";
  const paginationInstruction = replacePlaceholders(
    extractVariant(pagination, paginationVariant),
    {
      actualCount: actualCount.toString(),
      startIdx: startIdx.toString(),
      endIdx: (endIdx - 1).toString(),
    },
    { strict: true },
  );

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
