/**
 * Visual System Schema
 *
 * Validates and normalizes the `visualSystem` field produced by the Outline AI.
 * The visual system is a single freeform `visualDirection` string that
 * describes the mood and rules of thumb for choosing backgrounds and layouts.
 *
 * Legacy shapes (`{mood, styleNotes}` and `{palette: {...}}`) are accepted for
 * backwards compatibility with older saved decks and converted into the new
 * single-field format.
 */

import { isColorDark } from "../pptx-color-utils.js";

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * @typedef {Object} VisualSystem
 * @property {string} visualDirection
 */

/**
 * @type {VisualSystem}
 */
export const DEFAULT_VISUAL_SYSTEM = {
  visualDirection:
    "Professional and readable. Vary backgrounds across the deck — mix dark, neutral, and light slides so no single background dominates. Use light or bright backgrounds for title, agenda, punctuation, and transition slides. Use neutral or dark backgrounds for code-heavy slides. Use kept images in full-image or media-span layouts for emotional or atmospheric beats. Always pair theme: with background: for readable contrast.",
};

/**
 * Check if a value is a valid hex color (3, 6, or 8 digits).
 * @param {unknown} v
 * @returns {boolean}
 */
function isValidHex(v) {
  return typeof v === "string" && HEX_RE.test(v);
}

/**
 * Validate and normalize a visual system object from the Outline AI.
 *
 * Accepts:
 * - New shape: `{ visualDirection: string }`
 * - Legacy shape: `{ mood: string, styleNotes: string }` (merged into one)
 * - Legacy palette: `{ palette: { base, accent, highlight } }` (converted)
 *
 * Returns `null` if the object is not a valid visual system. Callers should
 * fall back to `DEFAULT_VISUAL_SYSTEM` when this returns `null`.
 *
 * @param {unknown} obj
 * @returns {VisualSystem|null}
 */
export function validateVisualSystem(obj) {
  if (typeof obj !== "object" || obj === null) return null;

  // New single-field shape.
  if (typeof obj.visualDirection === "string") {
    const visualDirection = obj.visualDirection.trim();
    if (!visualDirection) return null;
    return { visualDirection };
  }

  // Legacy mood + styleNotes shape — merge into a single field.
  if (typeof obj.mood === "string" || typeof obj.styleNotes === "string") {
    const mood = String(obj.mood ?? "").trim();
    const styleNotes = String(obj.styleNotes ?? "").trim();
    if (!mood && !styleNotes) return null;
    const parts = [mood, styleNotes].filter(Boolean);
    return { visualDirection: parts.join(" ") };
  }

  // Legacy palette shape — convert to a visual direction string.
  // Do NOT forward specific hex colors to the generation AI; describe the
  // _kind_ of background (dark, light, accent) so the model picks its own
  // professional colors instead of reusing the stale palette verbatim.
  if (typeof obj.palette === "object" && obj.palette !== null) {
    const { base, accent, highlight } = obj.palette;
    const baseColor = isValidHex(base) ? base : "";
    const accentColor = isValidHex(accent) ? accent : "";
    const highlightColor = isValidHex(highlight) ? highlight : "";
    if (baseColor || accentColor || highlightColor) {
      const baseTone = baseColor ? (isColorDark(baseColor) ? "dark" : "light") : "neutral";
      const accentTone = accentColor ? (isColorDark(accentColor) ? "dark" : "bright") : "bright";
      const highlightTone = highlightColor
        ? isColorDark(highlightColor)
          ? "dark"
          : "light"
        : "light";
      return {
        visualDirection: `Professional and varied. Use ${baseTone} backgrounds for most content and continuation slides. Use ${accentTone} accent backgrounds for punctuation, transition, CTA, or high-energy moments. Use ${highlightTone} backgrounds for title and agenda slides. Vary backgrounds across the deck so no single color dominates. Always pair theme: with background: for readable contrast.`,
      };
    }
  }

  return null;
}

/**
 * Parse a visual system from an outline AI response, falling back to the
 * default if the field is missing or invalid.
 * @param {unknown} obj
 * @returns {VisualSystem}
 */
export function parseVisualSystem(obj) {
  return validateVisualSystem(obj) ?? DEFAULT_VISUAL_SYSTEM;
}

/**
 * Extract a visual system comment from the top of markdown.
 * Returns the parsed visual system and the markdown with the comment removed.
 * @param {string} markdown
 * @returns {{ visualSystem: VisualSystem|null, markdown: string }}
 */
export function extractVisualSystemFromMarkdown(markdown) {
  const trimmed = String(markdown || "").replace(/\r\n?/g, "\n");
  const match = trimmed.match(/^\s*<!--\s*visual-system:\s*([\s\S]*?)-->\s*/);
  if (!match) return { visualSystem: null, markdown };

  try {
    const parsed = JSON.parse(match[1].trim());
    const visualSystem = validateVisualSystem(parsed);
    if (!visualSystem) return { visualSystem: null, markdown };

    const withoutComment = trimmed.slice(match[0].length).replace(/^\n*/, "");
    return { visualSystem, markdown: withoutComment };
  } catch {
    return { visualSystem: null, markdown };
  }
}
