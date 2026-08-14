/**
 * ThemeManager
 * Manages theme state (light/dark mode) and dark-mode palette variants,
 * localStorage persistence, and system preference detection.
 *
 * The base theme is stored under "webdeck_theme" ("light" | "dark").
 * The dark palette variant is stored under "webdeck_dark_variant"
 * ("indigo-gray" | "blue-slate" | "warm-graphite"). The variant only
 * applies when the base theme is "dark"; it is ignored in light mode.
 */

/**
 * @typedef {"indigo-gray" | "blue-slate" | "warm-graphite"} DarkVariant
 */

/** @type {DarkVariant[]} */
export const DARK_VARIANTS = ["indigo-gray", "blue-slate", "warm-graphite"];

export const DARK_VARIANT_LABELS = {
  "indigo-gray": "Cool Indigo-Gray",
  "blue-slate": "Blue Slate",
  "warm-graphite": "Warm Graphite",
};

const DEFAULT_DARK_VARIANT = "warm-graphite";

export class ThemeManager {
  static THEME_KEY = "webdeck_theme";
  static DARK_VARIANT_KEY = "webdeck_dark_variant";

  /**
   * Initializes the theme on application startup.
   * Checks localStorage first, then falls back to system preference.
   */
  static initTheme() {
    const stored = localStorage.getItem(ThemeManager.THEME_KEY);
    if (stored === "light" || stored === "dark") {
      ThemeManager.applyTheme(stored);
    } else {
      // Respect system preference
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      ThemeManager.applyTheme(prefersDark ? "dark" : "light");
    }
  }

  /**
   * Applies the specified theme to the document.
   * When applying "dark", also sets the persisted dark variant.
   * @param {"light"|"dark"} theme - The theme to apply
   */
  static applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    if (theme === "dark") {
      ThemeManager.applyDarkVariant(ThemeManager.getDarkVariant());
    } else {
      // Remove variant attribute in light mode so it has no effect.
      document.documentElement.removeAttribute("data-dark-variant");
    }
  }

  /**
   * Applies a dark palette variant by setting data-dark-variant.
   * No-op if the current theme is not dark.
   * @param {DarkVariant} variant
   */
  static applyDarkVariant(variant) {
    if (document.documentElement.getAttribute("data-theme") !== "dark") return;
    document.documentElement.setAttribute("data-dark-variant", variant);
  }

  /**
   * Gets the persisted dark variant (or the default).
   * @returns {DarkVariant}
   */
  static getDarkVariant() {
    const stored = localStorage.getItem(ThemeManager.DARK_VARIANT_KEY);
    if (DARK_VARIANTS.includes(/** @type {DarkVariant} */ (stored))) {
      return /** @type {DarkVariant} */ (stored);
    }
    return DEFAULT_DARK_VARIANT;
  }

  /**
   * Persists and applies a dark palette variant.
   * @param {DarkVariant} variant
   */
  static setDarkVariant(variant) {
    if (!DARK_VARIANTS.includes(variant)) return;
    localStorage.setItem(ThemeManager.DARK_VARIANT_KEY, variant);
    ThemeManager.applyDarkVariant(variant);
  }

  /**
   * Toggles between light and dark themes.
   * Persists the new theme to localStorage.
   */
  static toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const newTheme = current === "dark" ? "light" : "dark";
    localStorage.setItem(ThemeManager.THEME_KEY, newTheme);
    ThemeManager.applyTheme(newTheme);
  }

  /**
   * Gets the current active theme.
   * @returns {"light"|"dark"} The current theme
   */
  static getCurrentTheme() {
    return document.documentElement.getAttribute("data-theme") || "light";
  }
}
