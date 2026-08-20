/**
 * Shared Mermaid configuration.
 * Single source of truth for mermaid init options used by:
 * - src/core/asset-loader.js (runtime initialization)
 * - src/renderer/html-export-manager.js (HTML export)
 * - tools/build.mjs (CLI build)
 */

export const MERMAID_INIT_OPTIONS = {
  startOnLoad: false,
  theme: "base",
  securityLevel: "loose",
  flowchart: {
    curve: "basis",
    nodeSpacing: 60,
    rankSpacing: 60,
    padding: 20,
  },
  themeVariables: {
    primaryColor: "#ffffff",
    primaryBorderColor: "#1f2937",
    primaryTextColor: "#1f2937",
    textColor: "#1f2937",
    lineColor: "#824cdf",
    secondaryColor: "#f3f4f6",
    secondaryBorderColor: "#374151",
    secondaryTextColor: "#1f2937",
    tertiaryColor: "#e5e7eb",
    tertiaryBorderColor: "#4b5563",
    tertiaryTextColor: "#1f2937",
    noteBkgColor: "#f9fafb",
    noteBorderColor: "#6b7280",
    edgeLabelBackground: "#ffffff",
    clusterBkg: "#f9fafb",
    clusterBorder: "#9ca3af",
    fontFamily: "Segoe UI, Roboto, sans-serif",
    fontSize: "18px",
    mainBkg: "#ffffff",
  },
};

/**
 * Builds a self-contained <script> tag that inlines the Mermaid IIFE bundle and
 * initializes it. The Mermaid JS is inlined directly (not loaded from a CDN) so
 * the exported HTML works offline.
 * @param {string} mermaidJs - The Mermaid IIFE bundle source (mermaid.min.js).
 * @param {string} [indent=''] - Optional whitespace prefix for formatting.
 * @returns {string} The complete <script> tags.
 */
export function buildInlinedMermaidScriptTag(mermaidJs, indent = "") {
  const opts = JSON.stringify(MERMAID_INIT_OPTIONS);
  const flagScript = `${indent}<script>window.__WEBDECK_HAS_MERMAID__ = true;</script>`;
  const bundleScript = `${indent}<script>\n${mermaidJs}\n    </script>`;
  const initScript = `${indent}<script>window.__WEBDECK_MERMAID__={mermaid:window.mermaid};if(window.mermaid)window.mermaid.initialize(${opts});</script>`;
  return `${flagScript}\n${bundleScript}\n${initScript}`;
}
