/**
 * AI Directive Utils
 *
 * Extract, restore, and re-inject per-slide directives (layout, background,
 * theme) when round-tripping markdown through the AI. The AI never sees
 * background/theme in fix mode — these utilities preserve them so the
 * post-AI deck keeps its visual styling.
 */

import { splitSlides } from "../markdown-parser.js";
import { findFencedRanges } from "../image-markdown-parser.js";

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
 * @returns {Array<{layout: string, background: string, theme: string, mediaFullBleed: boolean, areaBg: Record<string,string>}>}
 */
export function extractDirectives(markdown, slides) {
  const sections = slides || splitSlides(markdown);
  return sections.map((slide) => {
    // Case-insensitive to match MarkdownParser.extractDirective's
    // `^\s*${name}\s*:` with the `i` flag — a capitalized `Theme: dark` must
    // be read here the same as `theme: dark`, or it is extracted as empty
    // and the original styling is lost on the AI round-trip.
    const layoutMatch = slide.match(/^\s*layout\s*:\s*(.+)$/im);
    const bgMatch = slide.match(/^\s*background\s*:\s*(.+)$/im);
    const themeMatch = slide.match(/^\s*theme\s*:\s*(.+)$/im);
    const mediaFullBleedMatch = slide.match(/^\s*media-full-bleed\s*:\s*(.+)$/im);
    const mediaSpanMatch = slide.match(/^\s*media-span\s*:\s*(.+)$/im);
    const mediaFullBleed =
      /^(true|1|yes|y|on)$/i.test(mediaFullBleedMatch?.[1]?.trim() || "") ||
      /^(left|right)$/i.test(mediaSpanMatch?.[1]?.trim() || "");

    // Extract per-area `area-bg-<name>:` backgrounds so they survive the AI
    // round-trip exactly like `background:` does — the AI is told to keep them,
    // but a conservative fix pass can drop them, and fix mode's strip-and-restore
    // must be able to put them back.
    const areaBg = {};
    const areaBgRe = /^\s*area-bg-([a-zA-Z0-9_-]+)\s*:\s*(.*)$/i;
    for (const line of slide.split("\n")) {
      const m = line.match(areaBgRe);
      if (m) areaBg[m[1].toLowerCase()] = m[2].trim();
    }

    return {
      layout: layoutMatch?.[1]?.trim() || "",
      background: bgMatch?.[1]?.trim() || "",
      theme: themeMatch?.[1]?.trim() || "",
      mediaFullBleed,
      areaBg,
    };
  });
}

/**
 * Restore original layout, backgrounds, and themes onto AI-produced slides.
 * In fix mode, the AI often changes layouts despite instructions — restore originals.
 * @param {{ layout: string, background?: string, theme?: string, mediaFullBleed?: boolean, content: string, areaBg?: Record<string,string> }[]} slides
 * @param {{ layout: string, background: string, theme: string, mediaFullBleed: boolean, areaBg?: Record<string,string> }[]} origDirectives
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
      mediaFullBleed: Boolean(orig.mediaFullBleed || slide.mediaFullBleed),
      areaBg: orig.areaBg || slide.areaBg || {},
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
 * @param {{ layout: string, background: string, theme: string, mediaFullBleed: boolean, areaBg?: Record<string,string> }[]} origDirectives
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
      if (
        orig.mediaFullBleed &&
        !hasTopLevelDirective(lines, "media-full-bleed") &&
        !hasTopLevelDirective(lines, "media-span")
      ) {
        insertAfter.push("media-full-bleed: true");
      }
      for (const [areaName, value] of Object.entries(orig.areaBg || {})) {
        if (value && !hasTopLevelDirective(lines, `area-bg-${areaName}`)) {
          insertAfter.push(`area-bg-${areaName}: ${value}`);
        }
      }
      if (insertAfter.length === 0) return section;

      lines.splice(layoutIdx + 1, 0, ...insertAfter);
      return lines.join("\n");
    }

    // fix mode: strip any background:/theme:/media-full-bleed:/media-span:/
    // area-bg-*: the AI echoed back from the leading directive block, then
    // restore the originals. Fence-aware so code-block contents are preserved.
    const lines = stripLeadingDirectives(section.split("\n"), [
      "background",
      "theme",
      "media-full-bleed",
      "media-span",
      "area-bg-",
    ]);
    const layoutIdx = findTopLevelDirectiveIdx(lines, "layout");

    const insertAfter = [];
    if (orig.background) insertAfter.push(`background: ${orig.background}`);
    if (orig.theme) insertAfter.push(`theme: ${orig.theme}`);
    if (orig.mediaFullBleed) insertAfter.push("media-full-bleed: true");
    for (const [areaName, value] of Object.entries(orig.areaBg || {})) {
      if (value) insertAfter.push(`area-bg-${areaName}: ${value}`);
    }

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
 * Find the line index of a top-level (non-fenced) `name:` directive, scanning
 * only the slide's leading directive block (the run of blank and
 * directive-like lines before the first body line — a heading, `@area`
 * marker, prose, or fenced code block). A mid-slide line that merely looks
 * like a directive (e.g. `Background: the story so far` in the body) is not
 * matched, preventing false suppression of generate-mode gap-fills.
 * @param {string[]} lines
 * @param {string} name
 * @returns {number}
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findTopLevelDirectiveIdx(lines, name) {
  const text = lines.join("\n");
  const fences = findFencedRanges(text);
  let inLeadingBlock = true;
  // Tolerate leading whitespace and whitespace before the colon so an
  // indented `  theme: dark` or `theme :dark` is recognized the same as
  // `theme: dark` — the markdown parser accepts both (`^\s*${name}\s*:` with
  // the `i` flag), so the AI round-trip must too.
  const re = new RegExp(`^\\s*${escapeRegExp(name)}\\s*:`, "i");
  const anyDirective = /^\s*[a-zA-Z][\w-]*\s*:/i;
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = offset;
    const lineEnd = offset + line.length + 1;
    const inFence = fences.some((r) => lineStart >= r.start && lineStart < r.end);

    // A fenced code block delimiter ends the leading directive block.
    if (inFence) {
      inLeadingBlock = false;
      offset = lineEnd;
      continue;
    }
    if (!inLeadingBlock) break;
    if (line.trim() === "") {
      offset = lineEnd;
      continue;
    }
    if (re.test(line)) return i;
    // Another directive (not the one we're looking for) stays in the
    // leading block.
    if (anyDirective.test(line)) {
      offset = lineEnd;
      continue;
    }
    // First non-blank, non-directive line ends the leading block.
    inLeadingBlock = false;
    offset = lineEnd;
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
 * A name ending in `-` is treated as a prefix: `"area-bg-"` strips any
 * leading directive whose name starts with `area-bg-` (e.g.
 * `area-bg-media:`, `area-bg-main:`), matching how the markdown parser
 * recognizes per-area directives.
 *
 * Restricting the strip to the leading block prevents removing lines that
 * merely *look* like a directive further down in the slide body (e.g. a
 * line of prose or an unfenced example reading `theme: dark`).
 *
 * @param {string[]} lines
 * @param {string[]} names — directive names to strip (e.g. ["background", "theme"]),
 *   with a trailing `-` meaning prefix match
 * @returns {string[]}
 */
export function stripLeadingDirectives(lines, names) {
  const prefixes = names.filter((n) => n.endsWith("-")).map((n) => n.toLowerCase());
  const exactNames = new Set(names.map((n) => n.toLowerCase()).filter((n) => !n.endsWith("-")));
  // Tolerate leading whitespace and whitespace before/after the colon so
  // `  theme : dark` is recognized the same as `theme: dark` — the markdown
  // parser accepts both (`^\s*${name}\s*:` with the `i` flag).
  const directiveLine = /^\s*([a-zA-Z][\w-]*)\s*:\s*(.*)$/i;
  const out = [];
  let inLeadingBlock = true;

  const text = lines.join("\n");
  const fences = findFencedRanges(text);
  let offset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = offset;
    const lineEnd = offset + line.length + 1;
    const inFence = fences.some((r) => lineStart >= r.start && lineStart < r.end);
    offset = lineEnd;

    if (inFence || line.match(/^\s*(```+|~~~+)/)) {
      // Fenced content (including the fence line) is kept verbatim and ends
      // the leading directive block.
      inLeadingBlock = false;
      out.push(line);
      continue;
    }

    if (!inLeadingBlock) {
      out.push(line);
      continue;
    }

    if (line.trim() === "") {
      out.push(line);
      continue;
    }
    const match = line.match(directiveLine);
    if (match) {
      // Case-insensitive name comparison — an echoed `Theme: light` must be
      // stripped the same as `theme: light`, or injectDirectives splices
      // the original after it and MarkdownParser.extractDirective (which
      // keeps the *last* match) picks the AI's value instead of the user's.
      const name = match[1].toLowerCase();
      const isPrefixMatch = prefixes.some((p) => name.startsWith(p));
      if (exactNames.has(name) || isPrefixMatch) continue; // strip
      out.push(line);
      continue;
    }
    // First non-blank, non-directive line ends the leading directive block.
    inLeadingBlock = false;
    out.push(line);
  }
  return out;
}
