/**
 * Visual System Schema
 *
 * Validates and normalizes the `visualSystem` field produced by the Outline AI.
 * The prompt asks for a minimal 3-color palette: `base`, `accent`, `highlight`.
 */

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * @typedef {Object} VisualSystemPalette
 * @property {string} base
 * @property {string} accent
 * @property {string} highlight
 */

/**
 * @typedef {Object} VisualSystem
 * @property {VisualSystemPalette} palette
 */

/**
 * @type {VisualSystem}
 */
export const DEFAULT_VISUAL_SYSTEM = {
  palette: {
    base: "#0f172a",
    accent: "#06b6d4",
    highlight: "#ffffff",
  },
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
 * Validate the palette. All 3 colors must be valid hex.
 * @param {unknown} palette
 * @returns {boolean}
 */
function isValidPalette(palette) {
  if (typeof palette !== "object" || palette === null) return false;
  const { base, accent, highlight } = palette;
  return isValidHex(base) && isValidHex(accent) && isValidHex(highlight);
}

/**
 * Validate and normalize a visual system object from the Outline AI.
 *
 * Returns a normalized `VisualSystem` if valid, or `null` if the palette
 * is missing or invalid. Callers should fall back to `DEFAULT_VISUAL_SYSTEM`
 * when this returns `null`.
 *
 * @param {unknown} obj
 * @returns {VisualSystem|null}
 */
export function validateVisualSystem(obj) {
  if (typeof obj !== "object" || obj === null) return null;
  if (!isValidPalette(obj.palette)) return null;

  return {
    palette: {
      base: obj.palette.base,
      accent: obj.palette.accent,
      highlight: obj.palette.highlight,
    },
  };
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
