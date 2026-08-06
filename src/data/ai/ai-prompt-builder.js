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

const ALLOWED_AREAS = ["title", "header", "main", "media", "secondary", "sidebar", "footer"];

/**
 * Build additional instructions suffix from user-provided generate options.
 * Appended to the user prompt so the AI sees the user's preferences.
 * @param {object} opts
 * @param {string} [opts.tone]
 * @param {string} [opts.fidelity] — "polish" | "enhance" | "rewrite"
 * @returns {string}
 */
export function buildGenerateOptionsSuffix(opts = {}) {
  if (!opts) return "";
  const parts = [];
  if (opts.tone && opts.tone !== "default") {
    const toneMap = {
      formal: "Use a formal, professional tone.",
      casual: "Use a casual, conversational tone.",
      technical: "Use a technical, precise tone with domain-specific terminology.",
    };
    if (toneMap[opts.tone]) parts.push(`\n${toneMap[opts.tone]}`);
  }
  if (opts.fidelity) {
    const fidelityMap = {
      polish:
        "\nFidelity: TIDY UP. Fix formatting and layout choices only. Correct heading hierarchy, fix area markers, clean up spacing. Do not change wording, split, merge, or reorder slides. The output must have the same number of slides as the input.",
      enhance:
        "\nFidelity: RESTYLE. Rework text for clarity and conciseness, tighten formatting, and choose better layouts for each slide's content. Add speaker notes where helpful. Keep every slide's core topic and key points, but rephrase and reorganize within the slide freely. Do not reorder slides or change the overall narrative flow. The output must have the same number of slides as the input.",
      // "rewrite" is handled by the remix two-phase flow in AiOrchestrator,
      // not as a suffix — it must not reach this function. If it does, return
      // no suffix so the generate path doesn't append stale instructions.
    };
    if (fidelityMap[opts.fidelity]) parts.push(fidelityMap[opts.fidelity]);
  }
  return parts.join("");
}

function areaStatus(layout, area, allowedAreas) {
  if (!allowedAreas.includes(area)) return "no";
  if (area === "title") return "yes";
  if (area === "main") return "yes";
  if (area === "media" || area === "secondary" || area === "sidebar") return "yes";
  if (area === "header" || area === "footer") {
    return layout === "title-slide" && area === "footer" ? "yes" : "optional";
  }
  return "yes";
}

export function getAllowedLayoutList() {
  const layouts = LayoutData.getAllLayouts().filter((name) => LayoutData.hasLayout(name));
  const rows = ["| Layout | @title | @header | @main | @media | @secondary | @sidebar | @footer |"];
  rows.push("|---|---|---|---|---|---|---|---|");
  for (const layout of layouts) {
    const allowedAreas = LayoutData.getAreaNames(layout);
    const cells = [layout];
    for (const area of ALLOWED_AREAS) {
      cells.push(areaStatus(layout, area, allowedAreas));
    }
    rows.push(`| ${cells.join(" | ")} |`);
  }
  return rows.join("\n");
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
  const slides = markdown.split(/\n---\n/);
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
 * @returns {{ system: string, user: string, original: string }}
 */
export function buildBatchMessages(markdown, mode, startIdx, endIdx, totalSlides, deckSummary) {
  const cleaned = stripFrontmatter(markdown, mode);
  const allSlides = cleaned.split(/\n---\n/);
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

  const fragment = mode === "fix" ? fixPrompt : generatePrompt;
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
