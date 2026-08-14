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
import { extractVisualSystemFromMarkdown } from "./visual-system-schema.js";

export {
  getAllowedLayoutList,
  stripFrontmatter,
  stripThemeAndBackground,
  stripVisualIdentity,
  applyVisualSystemIdentity,
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
 *   overriding the generate prompt's generic visual-styling note with
 *   specific design-language guidance.
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
 * @param {boolean} [enrichPerSlide=false] - When true, adds per-slide metadata
 *   (content line count, bullet count, code/image/diagram markers) to each
 *   outline entry. Used by the Remix plan phase so the planning AI has enough
 *   signal to make polish/rewrite/merge decisions without seeing full content.
 * @returns {string}
 */
export function buildDeckSummary(markdown, includeFirstSlide = false, enrichPerSlide = false) {
  // Fence-aware split so `---` inside code blocks doesn't create phantom
  // slides and misalign the outline (same fix as buildBatchMessages /
  // extractDirectives / injectDirectives).
  const { markdown: withoutComment } = extractVisualSystemFromMarkdown(markdown);
  const slides = new MarkdownParser().splitSlides(withoutComment);
  const titles = slides.map((slide, i) => {
    const layoutMatch = slide.match(/^\s*layout\s*:\s*(.+)$/im);
    const layout = layoutMatch?.[1]?.trim() || "header-content";
    const lines = slide.split("\n").filter((l) => l.trim());
    const titleLine = lines.find((l) => /^#{1,6}\s/.test(l)) || lines[0] || `Slide ${i + 1}`;
    const title = titleLine.replace(/^#+\s*/, "").trim();
    let entry = `${i + 1}. [${layout}] ${title}`;
    if (enrichPerSlide) {
      const meta = [];
      // Count non-empty content lines, excluding frontmatter directives, @area
      // markers, speaker notes, and code fence delimiters. Trim each line
      // before testing so indented markers and nested bullets are handled.
      // Only exclude known slide-level directive keys (matching the parser's
      // list in markdown-parser.js) — not any "word:" pattern, which would
      // wrongly drop body prose like "Example:" or "Output:".
      const contentLines = lines.filter((l) => {
        const t = l.trim();
        if (/^(@\w+|---)/.test(t)) return false;
        if (
          /^(layout|theme|background|hidden|hide|media-full-bleed|media-span|align|header-style|area-style(?:-[\w-]+)?|code-font-size)\s*:/i.test(
            t,
          )
        )
          return false;
        // Exclude speaker notes comments.
        if (/^<!--\s*notes:/.test(t)) return false;
        // Exclude code fence delimiters (``` or ~~~).
        if (/^(```|~~~)/.test(t)) return false;
        return true;
      });
      meta.push(`${contentLines.length} lines`);
      // Count list items — trim first so nested/indented items are counted.
      // Includes unordered (-, *, +) and ordered (1. 2. etc.) list markers.
      const bulletCount = contentLines.filter((l) => /^([-*+]|\d+\.)\s/.test(l.trim())).length;
      if (bulletCount > 0) meta.push(`${bulletCount} bullet${bulletCount > 1 ? "s" : ""}`);
      if (/```/.test(slide)) meta.push("code");
      if (/<img/.test(slide)) meta.push("image");
      if (/\[Diagram:/.test(slide)) meta.push("diagram");
      if (meta.length) entry += ` (${meta.join(", ")})`;
    }
    return entry;
  });

  const hasCode = slides.some((s) => /```/.test(s));
  const hasDiagrams = slides.some((s) => /\[Diagram:/.test(s));
  const hasImages = slides.some((s) => /<img/.test(s));
  const uniqueLayouts = [
    ...new Set(
      slides.map((s) => {
        const m = s.match(/^\s*layout\s*:\s*(.+)$/m);
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
 * @param {boolean} [hasVisualSystem=false] — when true, the visual system brief
 *   (options suffix) overrides the generic visual-styling note.
 * @param {boolean} [preserveVisualIdentity=false] — when true (remix preserve),
 *   the visual-styling note tells the model to keep the original theme/background/
 *   color directives instead of emitting neutral styling.
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
  preserveVisualIdentity = false,
) {
  if (mode === "fix" && batchMode === "polish") {
    throw new Error(
      'batchMode "polish" is only valid with mode "generate"; fix mode always uses the fix fragment',
    );
  }
  const cleaned = stripFrontmatter(markdown, mode);
  // Use the fence-aware split so `---` inside code blocks doesn't create
  // phantom slides and misalign indices with the orchestrator's slide list.
  const allSlides = new MarkdownParser().splitSlides(cleaned);
  const actualCount = allSlides.slice(startIdx, endIdx).length;

  // Add explicit indices to each slide in the chunk. In fix mode the model has
  // already seen these slides; in generate mode the index anchors the batch
  // prompt on exact slide count and ordering.
  const indexedSlides = allSlides.slice(startIdx, endIdx).map((slide, i) => {
    return `<!-- SLIDE INDEX ${startIdx + i} (return this) -->\n${slide}`;
  });
  const indexedChunk = indexedSlides.join("\n\n---\n\n");

  let contentForPrompt;
  if (mode === "fix") {
    const parts = [];
    if (startIdx > 0) {
      parts.push(
        `<!-- CONTEXT SLIDE — DO NOT INCLUDE IN OUTPUT (index ${startIdx - 1}) -->\n${allSlides[startIdx - 1]}`,
      );
    }
    parts.push(indexedChunk);
    if (endIdx < totalSlides) {
      parts.push(
        `<!-- CONTEXT SLIDE — DO NOT INCLUDE IN OUTPUT (index ${endIdx}) -->\n${allSlides[endIdx]}`,
      );
    }
    contentForPrompt = parts.join("\n\n---\n\n");
  } else {
    contentForPrompt = indexedChunk;
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
    substitutions.visualStylingNote = buildVisualStylingNote(
      hasVisualSystem,
      preserveVisualIdentity,
    );
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
