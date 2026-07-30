/**
 * PPTX Color Utilities
 *
 * Pure functions for color manipulation and validation.
 * Extracted from pptx-to-slide-md.js for reuse.
 */
import { LUMINANCE } from "./pptx-slide-config.js";

/**
 * Calculate luminance of a hex color (0-255 scale).
 * @param {string} hex - 6-character hex string without # prefix
 * @returns {number} Luminance value, or Infinity for invalid input
 */
export function hexToLuminance(hex) {
  if (!hex || hex.length < LUMINANCE.HEX_MIN_LENGTH) return Infinity;
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return Infinity;
  return (
    (r * LUMINANCE.RED_COEFF + g * LUMINANCE.GREEN_COEFF + b * LUMINANCE.BLUE_COEFF) /
    LUMINANCE.SCALE_DIVISOR
  );
}

/**
 * Whitelist-safe CSS color sanitizer for untrusted PPTX fill colors.
 * Allows only hex colors, rgb()/rgba(), and named keyword colors that
 * are known-safe (transparent, white, black, etc.).
 * Returns "transparent" for anything that doesn't match.
 *
 * @param {string} color
 * @returns {string}
 */
export function sanitizeCssColor(color) {
  if (!color || typeof color !== "string") return "transparent";
  let trimmed = color.trim();

  // Normalize hex colors without # prefix (common in PPTX: "003C68" → "#003C68")
  if (/^[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?$/.test(trimmed)) {
    trimmed = `#${trimmed}`;
  }

  // Named keywords we allow (non-exhaustive, safe list)
  const SAFE_KEYWORDS =
    /^(?:transparent|white|black|red|green|blue|yellow|gray|grey|orange|purple|pink|brown|cyan|magenta)$/i;
  if (SAFE_KEYWORDS.test(trimmed)) return trimmed;
  // Hex color: #RGB, #RRGGBB, #RRGGBBAA
  if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?$/.test(trimmed)) return trimmed;
  // rgb()/rgba() with comma-separated or space-separated values
  if (
    /^rgba?\s*\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i.test(
      trimmed,
    )
  )
    return trimmed;
  // rgb()/rgba() with space-separated values and optional alpha (e.g. rgb(255 0 0 / 0.5))
  if (
    /^rgba?\s*\(\s*\d{1,3}\s+[\d.]+%?\s+[\d.]+%?\s*(?:\/\s*(?:0|1|0?\.\d+)%?\s*)?\)$/i.test(trimmed)
  )
    return trimmed;
  return "transparent";
}

/**
 * Determine if a color is dark based on luminance.
 * Handles gradients by finding the darkest color.
 *
 * @param {string} colorHex - Hex color or CSS gradient string
 * @returns {boolean}
 */
export function isColorDark(colorHex) {
  if (!colorHex) return false;

  // Handle gradients: extract all hex colors, pick darkest
  if (!colorHex.startsWith("#")) {
    const matches = colorHex.match(/#[0-9a-fA-F]{6}/g);
    if (!matches) return false;
    // Find the color with lowest luminance (darkest)
    let darkestLum = Infinity;
    for (const m of matches) {
      const lum = hexToLuminance(m.replace("#", ""));
      if (lum < darkestLum) darkestLum = lum;
    }
    return darkestLum < LUMINANCE.DARK_THRESHOLD;
  }

  const hex = colorHex.replace("#", "");
  return hexToLuminance(hex) < LUMINANCE.DARK_THRESHOLD;
}
