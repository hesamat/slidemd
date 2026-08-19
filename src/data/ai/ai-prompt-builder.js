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
import { parseAllImagesOutsideFences } from "../image-markdown-parser.js";
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
  } else if (opts.preserveVisualIdentity === false && !opts.visualSystem) {
    // When a visual system is present, the "present" visual-styling note
    // (injected into generate-prompt.md) and the visual system brief below
    // are the authority on the new visual identity. The "discard" fragment
    // would contradict them by ordering the AI to strip all theme/background
    // and introduce no new ones, so it must be skipped here. "discard" only
    // applies when the app falls back to its own neutral styling.
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
 *   Image markers carry alt text (`image: "alt1", "alt2"`) and diagram markers
 *   carry the `[Diagram: ...]` label (`diagram: "Step 1, Step 2"`) so the
 *   planning AI can reason about visual content in text-only mode.
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
          /^(layout|theme|background|hidden|hide|media-full-bleed|media-span|align|header-style|area-style|area-bg(?:-[\w-]+)?|code-font-size)\s*:/i.test(
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
      // Extract image alt text so the planning AI can reason about image
      // content without seeing the pixels. Only non-empty alt strings are
      // listed; images with no alt fall back to the bare "image" marker so
      // the model still knows an image is present without misleading it
      // with `image: ""`. Alt text is truncated to 60 chars to keep the
      // outline compact; double quotes are stripped (not escaped) so the
      // `image: "..."` envelope stays unambiguous — alt text is advisory
      // signal for planning, not a verbatim string the model must echo.
      // Use the fence-aware parser so `<img>`/`![alt](src)` inside fenced
      // code samples (common in technical decks) are not mistaken for real
      // slide visuals — the old fence-unaware `/<img/.test(slide)` check
      // could not distinguish them.
      const slideImages = parseAllImagesOutsideFences(slide);
      const imageAlts = slideImages
        .map((img) => {
          if (img.type === "html") {
            return img.fullTag.match(/alt=["']([^"']*)["']/i)?.[1] || "";
          }
          return img.fullMatch.match(/!\[([^\]]*)\]/)?.[1] || "";
        })
        // Collapse internal whitespace (including newlines from multiline
        // `<img>` tags) to a single space so the outline entry stays on
        // one line; strip double quotes and truncate to 60 chars.
        .map((a) => a.trim().replace(/\s+/g, " ").replace(/"/g, "").slice(0, 60))
        .filter((a) => a.length > 0);
      if (imageAlts.length > 0) {
        const quoted = imageAlts.map((a) => `"${a}"`).join(", ");
        meta.push(`image: ${quoted}`);
      } else if (slideImages.length > 0) {
        meta.push("image");
      }
      // Extract diagram labels from [Diagram: ...] markers so the planning
      // AI knows what the diagram depicts without seeing the rendered
      // visual. Truncate to 60 chars and strip double quotes for the same
      // reasons as image alt text above. The `\s*` after the colon accepts
      // the degenerate `[Diagram:]` (no label) — matched by the
      // `[^\]]*` (zero-or-more) capture — which falls back to the bare
      // `diagram` marker so the deck-level `Features: diagrams` line and
      // the per-slide marker stay consistent. A slide may contain more
      // than one diagram marker; the global regex collects all labels in
      // document order so none are silently dropped.
      const diagramMatches = [...slide.matchAll(/\[Diagram:\s*([^\]]*)\]/g)];
      if (diagramMatches.length > 0) {
        const diagramLabels = diagramMatches
          .map((m) => m[1].trim().replace(/\s+/g, " ").replace(/"/g, "").slice(0, 60))
          .filter((l) => l.length > 0);
        if (diagramLabels.length > 0) {
          const quoted = diagramLabels.map((l) => `"${l}"`).join(", ");
          meta.push(`diagram: ${quoted}`);
        } else {
          meta.push("diagram");
        }
      }
      if (meta.length) entry += ` (${meta.join(", ")})`;
    }
    return entry;
  });

  const hasCode = slides.some((s) => /```/.test(s));
  const hasDiagrams = slides.some((s) => /\[Diagram:/.test(s));
  // Detect both HTML `<img>` and markdown `![alt](src)` image syntax so a
  // deck with only markdown images is still flagged in the `Features:` line.
  // This is fence-unaware (consistent with the pre-existing `hasCode` and
  // `hasDiagrams` checks here) — the deck-level feature line is a rough
  // signal, not a precise count.
  const hasImages = slides.some((s) => /<img|!\[[^\]]*\]\([^)]*\)/.test(s));
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
