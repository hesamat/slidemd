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
 * Builds a self-contained <script> tag that loads Mermaid from CDN and initializes it.
 * @param {string} version - Installed Mermaid version to request from the CDN.
 * @param {string} [indent=''] - Optional whitespace prefix for formatting.
 * @returns {string} The complete <script> tag.
 */
export function buildMermaidScriptTag(version, indent = "") {
  const cdnUrl = `https://cdn.jsdelivr.net/npm/mermaid@${version}/dist/mermaid.esm.min.mjs`;
  const opts = JSON.stringify(MERMAID_INIT_OPTIONS);
  return `${indent}<script type="module">import mermaid from "${cdnUrl}";window.mermaid=mermaid;mermaid.initialize(${opts});</script>`;
}
