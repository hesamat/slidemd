/**
 * AI Prompt Builder
 *
 * Builds system and user messages for AI calls from reusable prompt fragments.
 * Provides deck summaries and batch message construction for whole-deck
 * operations.
 *
 * All prompt copy lives in `src/data/prompts/` fragments; this module owns
 * only the logic that chooses fragments and fills their placeholders.
 */

import { MarkdownParser } from "../markdown-parser.js";
import {
  composeMessages,
  extractVariant,
  getFragment,
  hasVariant,
  stripFrontmatter,
  buildVisualSystemBrief,
  buildVisualStylingNote,
  buildDensityBudgets,
} from "./ai-prompt-fragments.js";
import { replacePlaceholders } from "./ai-prompt-composer.js";
import { getIntentUserFragment } from "./ai-intent-registry.js";

export {
  getAllowedLayoutList,
  stripFrontmatter,
  stripThemeAndBackground,
} from "./ai-prompt-fragments.js";

/**
 * Build additional instructions suffix from user-provided generate options.
 * Appended to the user prompt so the AI sees the user's preferences.
 * The guidance copy comes from snippet fragments in `src/data/prompts/`.
 * @param {object} opts
 * @param {string} [opts.flow] — "story" | "technical" | "persuasive" | "instructional"
 * @param {string} [opts.mode] — "polish" | "remix" | "reimagine"
 * @param {boolean} [opts.addSpeakerNotes]
 * @param {boolean} [opts.preserveVisualIdentity]
 * @param {import("./visual-system-schema.js").VisualSystem|null} [opts.visualSystem]
 *   When present, a visual system brief + beat→treatment mapping is appended,
 *   overriding the generate prompt's generic "Pick ONE coherent visual theme"
 *   instruction with specific design-language guidance.
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
  if (opts.visualSystem) {
    parts.push(buildVisualSystemBrief(opts.visualSystem));
  }
  return parts.join("");
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
  const substitutions = { markdown: cleaned };
  if (mode !== "fix") {
    substitutions.visualStylingNote = buildVisualStylingNote(false);
    substitutions.densityBudgets = buildDensityBudgets("full");
  }
  return composeMessages(getFragment("system-prompt.md"), fragment, substitutions);
}

/**
 * Generate a lightweight deck summary for batch context.
 * @param {string} markdown - The original markdown.
 * @param {boolean} [includeFirstSlide=false] - When true, appends the full raw
 *   text of the first slide so the reimagine outline prompt can extract
 *   identifying information for the first slide's footer.
 * @returns {string}
 */
export function buildDeckSummary(markdown, includeFirstSlide = false) {
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
  // Include the full text of the first slide so the outline AI can preserve
  // identifying information (course code, week number, author, event name)
  // that may live in the footer or body rather than the title heading.
  if (includeFirstSlide && slides.length > 0) {
    parts.push("First slide (preserve its identifying info):", slides[0].trim());
  }
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
  hasVisualSystem = false,
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
  // prompt fragment. The fragment selection is owned by the intent registry.
  const isGenerateFragment = mode !== "fix" && batchMode !== "polish";
  const fragment =
    mode === "fix"
      ? getFragment(getIntentUserFragment("enhanceSlide"))
      : getFragment(getIntentUserFragment(batchMode === "polish" ? "polish" : "generate"));
  const substitutions = { markdown: contentForPrompt };
  // Only provide visualStylingNote for the generate fragment (which has the
  // {{visualStylingNote}} placeholder).
  if (isGenerateFragment) {
    substitutions.visualStylingNote = buildVisualStylingNote(hasVisualSystem);
    substitutions.densityBudgets = buildDensityBudgets("full");
  } else if (mode !== "fix" && batchMode === "polish") {
    substitutions.densityBudgets = buildDensityBudgets("compact");
  }
  const { system, user } = composeMessages(
    getFragment("system-prompt.md"),
    fragment,
    substitutions,
  );

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
    // The pagination instruction stands on its own after the input markdown;
    // the old inline strings began with "\n\n" and the separator must be
    // re-added here because variants are trimmed.
    user: userPrefix + user + "\n\n" + paginationInstruction,
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
