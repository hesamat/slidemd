/**
 * ThemeManager
 * Manages theme state (light/dark mode) and color palette selection,
 * localStorage persistence, and system preference detection.
 *
 * The base theme is stored under "webdeck_theme" ("light" | "dark").
 * The palette is stored under "webdeck_palette"
 * ("warm-graphite" | "indigo" | "blue-slate"). The palette applies to
 * both light and dark themes — each palette defines accent colors and
 * surface tones for both modes.
 */

/**
 * @typedef {"warm-graphite" | "indigo" | "blue-slate"} Palette
 */

/** @type {Palette[]} */
export const PALETTES = ["warm-graphite", "indigo", "blue-slate"];

export const PALETTE_LABELS = {
  "warm-graphite": "Warm Graphite",
  indigo: "Cool Indigo",
  "blue-slate": "Blue Slate",
};

const DEFAULT_PALETTE = "warm-graphite";

export class ThemeManager {
  static THEME_KEY = "webdeck_theme";
  static PALETTE_KEY = "webdeck_palette";

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
   * Also ensures the palette attribute is set.
   * @param {"light"|"dark"} theme - The theme to apply
   */
  static applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    ThemeManager.applyPalette(ThemeManager.getPalette());
  }

  /**
   * Applies a palette by setting data-palette on the document element.
   * The palette applies to both light and dark themes.
   * @param {Palette} palette
   */
  static applyPalette(palette) {
    document.documentElement.setAttribute("data-palette", palette);
  }

  /**
   * Gets the persisted palette (or the default).
   * @returns {Palette}
   */
  static getPalette() {
    const stored = localStorage.getItem(ThemeManager.PALETTE_KEY);
    if (PALETTES.includes(/** @type {Palette} */ (stored))) {
      return /** @type {Palette} */ (stored);
    }
    return DEFAULT_PALETTE;
  }

  /**
   * Persists and applies a palette.
   * @param {Palette} palette
   */
  static setPalette(palette) {
    if (!PALETTES.includes(palette)) return;
    localStorage.setItem(ThemeManager.PALETTE_KEY, palette);
    ThemeManager.applyPalette(palette);
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
