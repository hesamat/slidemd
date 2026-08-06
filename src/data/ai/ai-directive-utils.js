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
  // Fence-aware split so a `\n\n---\n\n` sequence inside a code block does not
  // shift every subsequent slide's directives — must match the split used to
  // compute slide counts elsewhere (splitSlidesForAi / extractDirectives).
  const sections = splitSlides(markdown);
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

    // fix mode: strip any background:/theme: the AI echoed back from the
    // leading directive block, then restore the originals. Fence-aware so
    // code-block contents are preserved.
    const lines = stripLeadingDirectives(section.split("\n"), ["background", "theme"]);
    const layoutIdx = findTopLevelDirectiveIdx(lines, "layout");

    const insertAfter = [];
    if (orig.background) insertAfter.push(`background: ${orig.background}`);
    if (orig.theme) insertAfter.push(`theme: ${orig.theme}`);

    if (insertAfter.length === 0) return lines.join("\n");

    if (layoutIdx === -1) {
      // No layout line — prepend directives at the top of the section so the
      // slide keeps its styling even when the AI omitted the layout directive.
      lines.unshift(...insertAfter);
      return lines.join("\n");
    }

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
  // No space required after the colon so `layout:two-column` and
  // `background:red` are recognized the same as `layout: two-column`.
  const re = new RegExp(`^${name}:\\s*`);
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
 * Strip named `directive: value` lines, but only from the slide's leading
 * directive block (the run of blank/directive lines before the first body
 * line — a heading, `@area` marker, prose, or fenced code block).
 *
 * Restricting the strip to the leading block prevents removing lines that
 * merely *look* like a directive further down in the slide body (e.g. a
 * line of prose or an unfenced example reading `theme: dark`).
 *
 * @param {string[]} lines
 * @param {string[]} names — directive names to strip (e.g. ["background", "theme"])
 * @returns {string[]}
 */
function stripLeadingDirectives(lines, names) {
  const namesSet = new Set(names);
  // No space required before/after the colon so `theme:dark` is recognized
  // the same as `theme: dark`.
  const directiveLine = /^([a-zA-Z][\w-]*):\s*(.*)$/;
  const out = [];
  let inLeadingBlock = true;
  for (const line of lines) {
    if (inLeadingBlock) {
      if (line.trim() === "") {
        out.push(line);
        continue;
      }
      const match = line.match(directiveLine);
      if (match) {
        if (namesSet.has(match[1])) continue; // strip
        out.push(line);
        continue;
      }
      // First non-blank, non-directive line ends the leading directive block.
      inLeadingBlock = false;
    }
    out.push(line);
  }
  return out;
}
