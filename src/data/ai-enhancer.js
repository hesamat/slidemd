/**
 * AI Enhancer
 *
 * Post-processes PPTX-imported markdown using AI.
 * Composes prompts from fragments and exposes the new stateless AI modules.
 */

import { LayoutData } from "./layout-data.js";
import { MarkdownParser } from "./markdown-parser.js";
import { AiPromptComposer } from "./ai/ai-prompt-composer.js";
import systemPrompt from "./prompts/system-prompt.md?raw";
import fixPrompt from "./prompts/fix-prompt.md?raw";
import generatePrompt from "./prompts/generate-prompt.md?raw";

export { AiProviderClient } from "./ai/ai-provider-client.js";
export { AiOutputValidator } from "./ai/ai-output-validator.js";
export { AiPromptComposer } from "./ai/ai-prompt-composer.js";
export { buildRepairMessage } from "./ai/ai-repair-message.js";

const ALLOWED_AREAS = ["title", "header", "main", "media", "secondary", "sidebar", "footer"];

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
 * Convert JSON slides back to SlideMD markdown.
 * @param {{ layout: string, background?: string, theme?: string, content: string }[]} slides
 * @returns {string}
 */
export function slidesToMarkdown(slides) {
  return slides
    .map((slide) => {
      const parts = [];
      if (slide.layout) parts.push(`layout: ${slide.layout}`);
      if (slide.background) parts.push(`background: ${slide.background}`);
      if (slide.theme) parts.push(`theme: ${slide.theme}`);
      parts.push("");
      // Strip SLIDE INDEX comments from content
      const content = (slide.content || "").replace(
        /<!-- SLIDE INDEX \d+ \(return this\) -->\n?/g,
        "",
      );
      parts.push(content);
      return parts.join("\n");
    })
    .join("\n\n---\n\n");
}

/**
 * Convert parsed deck slides (with `areas` objects) back to SlideMD markdown.
 * Used when re-serializing after restoreDirectives().
 * @param {{ layout: string, background?: string, theme?: string, areas: object }[]} slides
 * @returns {string}
 */
export function areasToMarkdown(slides) {
  return slides
    .map((slide) => {
      const parts = [];
      if (slide.layout) parts.push(`layout: ${slide.layout}`);
      if (slide.background) parts.push(`background: ${slide.background}`);
      if (slide.theme) parts.push(`theme: ${slide.theme}`);
      parts.push("");
      // Convert areas object back to markdown with area markers
      const areas = slide.areas || {};
      const areaNames = Object.keys(areas);
      if (areaNames.length === 0) {
        parts.push("");
      } else {
        for (const name of areaNames) {
          let html = areas[name];
          if (!html) continue;
          // Strip data-source-line attributes added by markdown parser
          html = html.replace(/\s*data-source-line="\d+"/g, "");
          parts.push(`@${name}`);
          parts.push(html);
          parts.push("");
        }
      }
      return parts
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    })
    .join("\n\n---\n\n");
}

/**
 * Restore original layout, backgrounds, and themes onto AI-produced slides.
 * In fix mode, the AI often changes layouts despite instructions — restore originals.
 * @param {{ layout: string, background?: string, theme?: string, content: string }[]} slides
 * @param {{ layout: string, background: string, theme: string }[]} origDirectives
 * @returns {typeof slides}
 */
export function restoreDirectives(slides, origDirectives) {
  return slides.map((slide, i) => {
    const orig = origDirectives[i] || {};
    return {
      ...slide,
      layout: orig.layout || slide.layout || "header-content",
      background: orig.background || slide.background || "",
      theme: orig.theme || slide.theme || "",
    };
  });
}

/**
 * Re-inject background and theme directives into AI-produced markdown.
 * AI output lacks these directives (they were stripped before sending).
 * This patches the markdown string to include them, so saved state preserves bg/theme.
 *
 * @param {string} markdown - AI-produced markdown (with layout: but no background:/theme:)
 * @param {{ layout: string, background: string, theme: string }[]} origDirectives
 * @returns {string} Markdown with background/theme directives re-injected
 */
export function injectDirectives(markdown, origDirectives) {
  const sections = markdown.split(/\n\n---\n\n/);
  const patched = sections.map((section, i) => {
    const orig = origDirectives[i];
    if (!orig) return section;

    const lines = section.split("\n");
    const layoutIdx = lines.findIndex((l) => /^layout:\s/.test(l));
    if (layoutIdx === -1) return section;

    const insertAfter = [];
    if (orig.background) insertAfter.push(`background: ${orig.background}`);
    if (orig.theme) insertAfter.push(`theme: ${orig.theme}`);

    if (insertAfter.length === 0) return section;

    lines.splice(layoutIdx + 1, 0, ...insertAfter);
    return lines.join("\n");
  });
  return patched.join("\n\n---\n\n");
}

/**
 * Extract per-slide directives (layout, background, theme) from original markdown.
 * @param {string} markdown
 * @returns {Array<{layout: string, background: string, theme: string}>}
 */
export function extractDirectives(markdown) {
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
function stripFrontmatter(markdown, mode) {
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

const BATCH_SIZE = 8;

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
export function splitSlides(markdown, mode) {
  const cleaned = stripFrontmatter(markdown, mode);
  // Use the fence-aware parser so code blocks containing `---` are not split.
  return new MarkdownParser().splitSlides(cleaned);
}

export { BATCH_SIZE };

/**
 * Estimate token count (rough: 1 token ≈ 4 chars for English).
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate appropriate max_tokens based on input size and mode.
 * @param {string} markdown - The original markdown.
 * @param {"fix"|"generate"} mode - Enhancement mode.
 * @param {object} [opts]
 * @param {number|null} [opts.modelMaxOutput] - Model's max completion tokens (from OpenRouter).
 * @param {boolean} [opts.useReasoning] - Whether extended thinking is enabled.
 * @returns {number}
 */
export function estimateMaxTokens(markdown, mode, opts) {
  const cleaned = stripFrontmatter(markdown, mode);
  const inputTokens = estimateTokens(cleaned);
  const multiplier = mode === "generate" ? 1.8 : 1.2;
  const reasoningMultiplier = opts?.useReasoning ? 3 : 1;
  const estimated = Math.ceil(inputTokens * multiplier * reasoningMultiplier);
  const floor = opts?.useReasoning ? 64000 : 16000;
  return Math.min(Math.max(floor, estimated), opts?.modelMaxOutput || 128000);
}

/**
 * Parse the AI's JSON response, handling common issues.
 * @param {string} text - Raw AI response.
 * @returns {{ slides: Array }|null}
 */
export function parseAiResponse(text) {
  const trimmed = text.trim();

  // Try direct JSON parse
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.slides && Array.isArray(parsed.slides)) return parsed;
  } catch {
    /* not valid JSON */
  }

  // Try extracting JSON from code fence
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1]);
      if (parsed.slides && Array.isArray(parsed.slides)) return parsed;
    } catch {
      /* not valid JSON */
    }
  }

  // Find JSON by locating "slides": — try last occurrence first (real JSON is usually at the end)
  let searchPos = trimmed.length;
  while (true) {
    const slidesIdx = trimmed.lastIndexOf('"slides":', searchPos);
    if (slidesIdx < 0) break;
    // Walk backwards to find the opening { (skip braces inside JSON strings)
    let start = slidesIdx;
    let inString = false;
    let escaped = false;
    while (start > 0) {
      start--;
      const ch = trimmed[start];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (!inString && ch === "{") break;
    }
    if (trimmed[start] === "{" && !inString) {
      // Walk forwards to find the matching closing }
      let depth = 0;
      let end = start;
      inString = false;
      escaped = false;
      for (; end < trimmed.length; end++) {
        const ch = trimmed[end];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      if (depth === 0) {
        try {
          const parsed = JSON.parse(trimmed.slice(start, end + 1));
          if (parsed.slides && Array.isArray(parsed.slides)) return parsed;
        } catch {
          /* not valid JSON */
        }
      }
    }
    // Try the next occurrence further back
    searchPos = slidesIdx - 1;
  }

  return null;
}

/**
 * Extract first heading from each slide in markdown.
 * @param {string} markdown
 * @returns {string[]}
 */
export function extractHeadings(markdown) {
  const slides = markdown.split(/\n---\n/);
  return slides.map((slide) => {
    const match = slide.match(/^##?\s+(.+)/m);
    return match?.[1]?.trim() || "";
  });
}
