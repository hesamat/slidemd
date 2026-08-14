/**
 * Visual System Schema
 *
 * Validates and normalizes the `visualSystem` field produced by the Outline AI.
 * The prompt asks for a minimal visual system — a 5-color palette and an
 * optional imagery mood. The schema still tolerates the older, fuller design
 * language fields (typography, composition, motifs, etc.) for backward
 * compatibility, but they are no longer required or used by the reimagine flow.
 *
 * Validation is best-effort: if the palette (the only hard requirement) is
 * missing or invalid, the entire DEFAULT_VISUAL_SYSTEM is used. If the palette
 * is valid but other fields are missing/malformed, those fields fall back to
 * the default while the parsed palette is preserved.
 */

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const MAX_MOTIFS = 3;
const MAX_CONTRAST_RULES = 3;
const MAX_STRING_LEN = 300;

const DENSITY_VALUES = ["compact", "medium", "spacious"];
const WHITESPACE_VALUES = ["restrained", "generous", "expansive"];
const ALIGNMENT_VALUES = ["left-dominant", "centered", "asymmetric"];

/**
 * @typedef {Object} VisualSystemPalette
 * @property {string} base
 * @property {string} surface
 * @property {string} accent
 * @property {string} contrast
 * @property {string} highlight
 */

/**
 * @typedef {Object} VisualSystemTypography
 * @property {string} character
 * @property {string} headline
 * @property {string} body
 */

/**
 * @typedef {Object} VisualSystemComposition
 * @property {('compact'|'medium'|'spacious')} density
 * @property {('restrained'|'generous'|'expansive')} whitespace
 * @property {('left-dominant'|'centered'|'asymmetric')} alignment
 */

/**
 * @typedef {Object} VisualSystemImagery
 * @property {string} role
 * @property {string} mood
 * @property {string} treatment
 */

/**
 * @typedef {Object} VisualSystem
 * @property {VisualSystemPalette} palette
 * @property {VisualSystemTypography} typography
 * @property {VisualSystemComposition} composition
 * @property {VisualSystemImagery} imagery
 * @property {string[]} motifs
 * @property {string[]} contrastRules
 */

/**
 * @type {VisualSystem}
 */
export const DEFAULT_VISUAL_SYSTEM = {
  palette: {
    base: "#0f172a",
    surface: "#1e293b",
    accent: "#06b6d4",
    contrast: "#f59e0b",
    highlight: "#ffffff",
  },
  typography: {
    character: "clean editorial",
    headline: "bold, high contrast, sans-serif",
    body: "clean, legible sans-serif",
  },
  composition: {
    density: "medium",
    whitespace: "generous",
    alignment: "left-dominant",
  },
  imagery: {
    role: "contextual supporting visual",
    mood: "professional, atmospheric",
    treatment: "subtle overlay or crisp container",
  },
  motifs: ["accent divider lines", "high-contrast focal points"],
  contrastRules: [
    "Use strong contrast for major takeaways",
    "Use visual breaks between major sections",
  ],
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
 * Clamp a string to a max length.
 * @param {unknown} v
 * @returns {string}
 */
function clampString(v) {
  if (typeof v !== "string") return "";
  return v.slice(0, MAX_STRING_LEN);
}

/**
 * Validate and clamp a string array to a max length and item count.
 * @param {unknown} v
 * @param {number} maxItems
 * @returns {string[]}
 */
function clampStringArray(v, maxItems) {
  if (!Array.isArray(v)) return [];
  return v
    .filter((item) => typeof item === "string" && item.trim().length > 0)
    .slice(0, maxItems)
    .map((item) => item.slice(0, MAX_STRING_LEN));
}

/**
 * Validate and clamp an enum value, falling back to the default if invalid.
 * @param {unknown} v
 * @param {readonly string[]} allowed
 * @param {string} fallback
 * @returns {string}
 */
function clampEnum(v, allowed, fallback) {
  return typeof v === "string" && allowed.includes(v) ? v : fallback;
}

/**
 * Validate the palette. All 5 colors must be valid hex.
 * @param {unknown} palette
 * @returns {boolean}
 */
function isValidPalette(palette) {
  if (typeof palette !== "object" || palette === null) return false;
  const { base, surface, accent, contrast, highlight } = palette;
  return (
    isValidHex(base) &&
    isValidHex(surface) &&
    isValidHex(accent) &&
    isValidHex(contrast) &&
    isValidHex(highlight)
  );
}

/**
 * Validate and normalize a visual system object from the Outline AI.
 *
 * Returns a normalized `VisualSystem` if valid, or `null` if the palette
 * (the hard requirement) is missing or invalid. Callers should fall back to
 * `DEFAULT_VISUAL_SYSTEM` when this returns `null`.
 *
 * If the palette is valid but other fields are missing/malformed, those
 * fields are filled from `DEFAULT_VISUAL_SYSTEM` while the parsed palette
 * is preserved.
 *
 * @param {unknown} obj
 * @returns {VisualSystem|null}
 */
export function validateVisualSystem(obj) {
  if (typeof obj !== "object" || obj === null) return null;
  if (!isValidPalette(obj.palette)) return null;

  const d = DEFAULT_VISUAL_SYSTEM;
  const palette = obj.palette;

  const typography =
    typeof obj.typography === "object" && obj.typography !== null
      ? {
          character: clampString(obj.typography.character) || d.typography.character,
          headline: clampString(obj.typography.headline) || d.typography.headline,
          body: clampString(obj.typography.body) || d.typography.body,
        }
      : d.typography;

  const composition =
    typeof obj.composition === "object" && obj.composition !== null
      ? {
          density: clampEnum(obj.composition.density, DENSITY_VALUES, d.composition.density),
          whitespace: clampEnum(
            obj.composition.whitespace,
            WHITESPACE_VALUES,
            d.composition.whitespace,
          ),
          alignment: clampEnum(
            obj.composition.alignment,
            ALIGNMENT_VALUES,
            d.composition.alignment,
          ),
        }
      : d.composition;

  const imagery =
    typeof obj.imagery === "object" && obj.imagery !== null
      ? {
          role: clampString(obj.imagery.role) || d.imagery.role,
          mood: clampString(obj.imagery.mood) || d.imagery.mood,
          treatment: clampString(obj.imagery.treatment) || d.imagery.treatment,
        }
      : d.imagery;

  const motifs = clampStringArray(obj.motifs, MAX_MOTIFS);
  const contrastRules = clampStringArray(obj.contrastRules, MAX_CONTRAST_RULES);

  return {
    palette: {
      base: palette.base,
      surface: palette.surface,
      accent: palette.accent,
      contrast: palette.contrast,
      highlight: palette.highlight,
    },
    typography,
    composition,
    imagery,
    motifs: motifs.length > 0 ? motifs : d.motifs,
    contrastRules: contrastRules.length > 0 ? contrastRules : d.contrastRules,
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
