/**
 * AI Directive Utils
 *
 * Extract, restore, and re-inject per-slide directives (layout, background,
 * theme) when round-tripping markdown through the AI. The AI never sees
 * background/theme in fix mode — these utilities preserve them so the
 * post-AI deck keeps its visual styling.
 */

import { splitSlides } from "../markdown-parser.js";

/**
 * Extract per-slide directives (layout, background, theme) from original markdown.
 *
 * Splitting is fence-aware (via `MarkdownParser.splitSlides`) so a `---` line
 * inside a code block does not create a phantom slide and shift every
 * directive after it. Callers that already have a fence-aware slide array
 * (e.g. `splitSlidesForAi`) can pass it via `slides` to avoid re-splitting.
 *
 * @param {string} markdown
 * @param {string[]} [slides] — pre-split fence-aware slide texts
 * @returns {Array<{layout: string, background: string, theme: string}>}
 */
export function extractDirectives(markdown, slides) {
  const sections = slides || splitSlides(markdown);
  return sections.map((slide) => {
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
 *
 * - `mode === "fix"` (default): the AI never sees background/theme, so any it
 *   echoed back are stripped and the originals are restored positionally. This
 *   is safe because fix mode is 1:1 per slide.
 * - `mode === "generate"`: the AI sees background/theme and may keep or change
 *   them. Originals are only injected when the AI dropped them (gap-fill), and
 *   any directive the AI chose is preserved. Both modes are fence-aware so a
 *   literal `background:` line inside a code block is left untouched.
 *
 * @param {string} markdown - AI-produced markdown
 * @param {{ layout: string, background: string, theme: string }[]} origDirectives
 * @param {"fix"|"generate"} [mode="fix"]
 * @returns {string} Markdown with background/theme directives re-injected
 */
export function injectDirectives(markdown, origDirectives, mode = "fix") {
  const sections = markdown.split(/\n\n---\n\n/);
  const patched = sections.map((section, i) => {
    const orig = origDirectives[i];
    if (!orig) return section;

    if (mode === "generate") {
      // Only fill in directives the AI dropped; keep any it chose.
      const lines = section.split("\n");
      const layoutIdx = findTopLevelDirectiveIdx(lines, "layout");
      if (layoutIdx === -1) return section;

      const insertAfter = [];
      if (orig.background && !hasTopLevelDirective(lines, "background")) {
        insertAfter.push(`background: ${orig.background}`);
      }
      if (orig.theme && !hasTopLevelDirective(lines, "theme")) {
        insertAfter.push(`theme: ${orig.theme}`);
      }
      if (insertAfter.length === 0) return section;

      lines.splice(layoutIdx + 1, 0, ...insertAfter);
      return lines.join("\n");
    }

    // fix mode: strip any background:/theme: the AI echoed back, then restore
    // the originals. Fence-aware so code-block contents are preserved.
    const lines = filterFenceAware(section.split("\n"), (l) => !/^(background|theme):\s/.test(l));
    const layoutIdx = lines.findIndex((l) => /^layout:\s/.test(l));
    if (layoutIdx === -1) return section;

    const insertAfter = [];
    if (orig.background) insertAfter.push(`background: ${orig.background}`);
    if (orig.theme) insertAfter.push(`theme: ${orig.theme}`);

    if (insertAfter.length === 0) return lines.join("\n");

    lines.splice(layoutIdx + 1, 0, ...insertAfter);
    return lines.join("\n");
  });
  return patched.join("\n\n---\n\n");
}

/**
 * Find the line index of a top-level (non-fenced) `name:` directive.
 * @param {string[]} lines
 * @param {string} name
 * @returns {number}
 */
function findTopLevelDirectiveIdx(lines, name) {
  let inFence = false;
  const re = new RegExp(`^${name}:\\s`);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (re.test(line)) return i;
  }
  return -1;
}

/**
 * Check whether a top-level (non-fenced) `name:` directive exists.
 * @param {string[]} lines
 * @param {string} name
 * @returns {boolean}
 */
function hasTopLevelDirective(lines, name) {
  return findTopLevelDirectiveIdx(lines, name) !== -1;
}

/**
 * Filter lines, keeping fence (``` blocks) intact and only applying the
 * predicate to lines outside fences.
 * @param {string[]} lines
 * @param {(line: string) => boolean} predicate — keep when true
 * @returns {string[]}
 */
function filterFenceAware(lines, predicate) {
  let inFence = false;
  const out = [];
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    if (predicate(line)) out.push(line);
  }
  return out;
}
