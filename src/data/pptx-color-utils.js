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
 * Normalize a hex color to 6 digits (expands 3-digit hex like `#abc` to
 * `#aabbcc`). Strips the leading `#` and any 2-digit alpha suffix.
 * @param {string} hex
 * @returns {string} 6-digit hex without `#`, or "" if invalid
 */
function normalizeHex(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  // Strip 2-digit alpha (e.g. #0f172aff → 0f172a)
  if (h.length === 8) h = h.slice(0, 6);
  return h.length === 6 ? h : "";
}

/**
 * Determine if a color is dark based on luminance.
 * Handles gradients by finding the darkest color.
 * Accepts 3-digit (#abc), 6-digit (#aabbcc), and 8-digit (#aabbccff) hex.
 * Also handles mixed values like `#0f172a url(images/hero.png) center/cover`
 * by extracting the first hex color.
 *
 * For CSS gradient strings with explicit stop positions (e.g. the
 * `linear-gradient(#96b23c 0%, #7e9632 69%, …)` backgrounds the PPTX
 * extractor emits), the DOMINANT colour decides darkness — a mostly-light
 * gradient must not force a dark theme just because its darkest stop is dark.
 * Stop luminance is weighted by the distance to the next stop, so a thin dark
 * edge at the end does not flip the result.
 *
 * @param {string} colorHex - Hex color, CSS gradient, or mixed background string
 * @returns {boolean}
 */
export function isColorDark(colorHex) {
  if (!colorHex) return false;

  // Extract all hex colors (3, 6, or 8 digit) from the string.
  // For solid colors this yields one match; for gradients and mixed
  // values (e.g. `#0f172a url(...) center/cover`) it yields all hex colors.
  const matches = String(colorHex).match(/#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g);
  if (!matches) {
    // No hex colors — a pure rgb()/rgba() fill can still be judged.
    const rgbMatch = String(colorHex).match(
      /rgba?\(\s*(\d{1,3})\s*[,/]\s*(\d{1,3})\s*[,/]\s*(\d{1,3})/i,
    );
    if (rgbMatch) {
      const lum =
        (Number(rgbMatch[1]) * LUMINANCE.RED_COEFF +
          Number(rgbMatch[2]) * LUMINANCE.GREEN_COEFF +
          Number(rgbMatch[3]) * LUMINANCE.BLUE_COEFF) /
        LUMINANCE.SCALE_DIVISOR;
      return lum < LUMINANCE.DARK_THRESHOLD;
    }
    return false;
  }

  // Gradient stops carry an explicit percentage position. When present, judge
  // by the position-weighted average luminance instead of the darkest stop.
  const stopRe = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b(?:\s+(\d+(?:\.\d+)?)%)?/g;
  const stops = [];
  let stopMatch;
  while ((stopMatch = stopRe.exec(String(colorHex))) !== null) {
    const h = normalizeHex(`#${stopMatch[1]}`);
    if (!h) continue;
    const lum = hexToLuminance(h);
    if (lum === Infinity) continue;
    stops.push({ lum, pos: stopMatch[2] != null ? parseFloat(stopMatch[2]) : null });
  }
  const gradientStops = stops.filter((s) => s.pos != null).sort((a, b) => a.pos - b.pos);
  if (gradientStops.length >= 2) {
    let weighted = 0;
    let totalWeight = 0;
    for (let i = 0; i < gradientStops.length - 1; i++) {
      const gap = gradientStops[i + 1].pos - gradientStops[i].pos;
      if (gap <= 0) continue;
      weighted += gradientStops[i].lum * gap;
      totalWeight += gap;
    }
    if (totalWeight > 0) {
      return weighted / totalWeight < LUMINANCE.DARK_THRESHOLD;
    }
  }

  let darkestLum = Infinity;
  for (const m of matches) {
    const h = normalizeHex(m);
    if (!h) continue;
    const lum = hexToLuminance(h);
    if (lum < darkestLum) darkestLum = lum;
  }
  if (darkestLum !== Infinity) {
    return darkestLum < LUMINANCE.DARK_THRESHOLD;
  }
  return false;
}
