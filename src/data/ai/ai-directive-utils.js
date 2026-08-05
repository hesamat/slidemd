/**
 * AI Directive Utils
 *
 * Extract, restore, and re-inject per-slide directives (layout, background,
 * theme) when round-tripping markdown through the AI. The AI never sees
 * background/theme in fix mode — these utilities preserve them so the
 * post-AI deck keeps its visual styling.
 */

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
