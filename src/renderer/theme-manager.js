/**
 * ThemeManager
 * Manages theme state (light/dark mode), localStorage persistence, and system preference detection.
 */

export class ThemeManager {
  static THEME_KEY = "webdeck_theme";

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
   * @param {"light"|"dark"} theme - The theme to apply
   */
  static applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
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
