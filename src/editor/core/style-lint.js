/**
 * Style Lint
 *
 * Advisory checks for slide style directives. Warns when hardcoded values
 * have corresponding CSS custom-property tokens (design tokens in
 * styles/slides.css). Never blocks rendering — purely advisory.
 *
 * Tokens checked:
 * - --radius-sm (6px), --radius-md (10px), --radius-lg (14px)
 * - --spacing-xs (6px), --spacing-sm (10px), --spacing-md (16px),
 *   --spacing-lg (24px), --spacing-xl (32px)
 * - --border-color (rgba(148, 163, 184, 0.2))
 */

const RADIUS_TOKENS = new Map([
  ["6px", "--radius-sm"],
  ["10px", "--radius-md"],
  ["14px", "--radius-lg"],
]);

const SPACING_TOKENS = new Map([
  ["6px", "--spacing-xs"],
  ["10px", "--spacing-sm"],
  ["16px", "--spacing-md"],
  ["24px", "--spacing-lg"],
  ["32px", "--spacing-xl"],
]);

// Border-color token values (from slides.css). We check both the raw hex
// and the rgba form since authors may write either.
const BORDER_COLOR_VALUES = new Set([
  "rgba(148,163,184,0.2)",
  "rgba(148, 163, 184, 0.2)",
  "#94a3b8",
  "#64748b",
]);

/**
 * Extract style directive values from slide markdown.
 * Returns an array of { directive, value } pairs.
 * @param {string} markdown
 * @returns {{ directive: string, value: string }[]}
 */
export function extractStyleDirectives(markdown) {
  if (!markdown) return [];
  const results = [];
  const lines = markdown.split("\n");
  // Match: area-style:, background:, area-bg-<name>:
  const re = /^\s*(area-style|background|area-bg-[a-zA-Z0-9_-]+)\s*:\s*(.+)$/;
  for (const line of lines) {
    const m = line.match(re);
    if (m) results.push({ directive: m[1], value: m[2].trim() });
  }
  return results;
}

/**
 * Lint a single CSS declaration string (e.g. "border: 2px solid #94a3b8; border-radius: 10px").
 * Returns an array of advisory messages.
 * @param {string} css
 * @returns {string[]}
 */
export function lintCssString(css) {
  const messages = [];
  if (!css) return messages;

  // Split into declarations
  const decls = css
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean);
  for (const decl of decls) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim();

    // Check border-radius for token matches
    if (prop === "border-radius") {
      const token = RADIUS_TOKENS.get(val.toLowerCase());
      if (token) {
        messages.push(`border-radius: ${val} → use ${token}`);
      }
    }

    // Check padding for token matches
    if (prop === "padding") {
      const token = SPACING_TOKENS.get(val.toLowerCase());
      if (token) {
        messages.push(`padding: ${val} → use ${token}`);
      }
    }

    // Check border color
    if (prop === "border") {
      const parts = val.split(/\s+/);
      // border: <width> <style> <color>
      if (parts.length >= 3) {
        const color = parts.slice(2).join(" ");
        if (BORDER_COLOR_VALUES.has(color.toLowerCase())) {
          messages.push(`border color ${color} → use var(--border-color)`);
        }
      }
    }
  }
  return messages;
}

/**
 * Lint all style directives in slide markdown.
 * Returns an array of advisory messages.
 * @param {string} markdown
 * @returns {string[]}
 */
export function lintSlideStyles(markdown) {
  const directives = extractStyleDirectives(markdown);
  if (directives.length === 0) return [];
  const messages = [];
  for (const { directive, value } of directives) {
    // background: and area-bg-<name>: accept a CSS background value.
    // area-style: accepts a full CSS declaration string.
    const msgs = lintCssString(value);
    for (const msg of msgs) {
      messages.push(`${directive}: ${msg}`);
    }
  }
  return messages;
}
