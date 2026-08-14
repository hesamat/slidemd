/**
 * Visual System Schema
 *
 * Validates and normalizes the `visualSystem` field produced by the Outline AI.
 * The visual system is now a set of freeform style notes (mood + styleNotes)
 * rather than a strict 3-color palette. Legacy `palette` objects are still
 * accepted for backwards compatibility with older saved decks.
 */

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * @typedef {Object} VisualSystem
 * @property {string} mood
 * @property {string} styleNotes
 */

/**
 * @type {VisualSystem}
 */
export const DEFAULT_VISUAL_SYSTEM = {
  mood: "Neutral, professional, and readable.",
  styleNotes:
    "Use a dark or neutral background for most continuation and content slides. Use a bright or light background sparingly for punctuation, transition, climax, and call-to-action moments. Use a light background for the title slide and agenda. Use kept images in full-image or media-span layouts for emotional/atmospheric beats.",
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
 * Accepts either the new descriptive shape (`mood` + `styleNotes`) or a legacy
 * `palette` object. Legacy palettes are converted into style notes so the rest
 * of the pipeline can treat them as a freeform direction.
 *
 * Returns `null` if the object is not a valid visual system. Callers should
 * fall back to `DEFAULT_VISUAL_SYSTEM` when this returns `null`.
 *
 * @param {unknown} obj
 * @returns {VisualSystem|null}
 */
export function validateVisualSystem(obj) {
  if (typeof obj !== "object" || obj === null) return null;

  // New descriptive shape.
  if (typeof obj.mood === "string" || typeof obj.styleNotes === "string") {
    const mood = String(obj.mood ?? "").trim();
    const styleNotes = String(obj.styleNotes ?? "").trim();
    if (!mood && !styleNotes) return null;
    return { mood, styleNotes };
  }

  // Legacy palette shape — convert to style notes but do not enforce.
  if (typeof obj.palette === "object" && obj.palette !== null) {
    const { base, accent, highlight } = obj.palette;
    const baseColor = isValidHex(base) ? base : "";
    const accentColor = isValidHex(accent) ? accent : "";
    const highlightColor = isValidHex(highlight) ? highlight : "";
    if (baseColor || accentColor || highlightColor) {
      return {
        mood: `Legacy palette: ${baseColor || "(none)"} base, ${accentColor || "(none)"} accent, ${highlightColor || "(none)"} highlight.`,
        styleNotes: `The source deck used a 3-color palette. Use ${baseColor || "dark/neutral backgrounds"} for continuation and content slides, ${accentColor || "bright accents"} for punctuation, transition, CTA, or high-energy moments, and ${highlightColor || "light backgrounds"} for title/agenda slides.`,
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
 * Serialize a visual system as a top-of-markdown HTML comment.
 * @param {VisualSystem} visualSystem
 * @returns {string}
 */
export function visualSystemToComment(visualSystem) {
  return `<!-- visual-system: ${JSON.stringify({
    mood: visualSystem.mood,
    styleNotes: visualSystem.styleNotes,
  })} -->`;
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
