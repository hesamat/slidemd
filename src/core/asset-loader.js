/**
 * AssetLoader
 * Utility class for loading and caching external assets (e.g., markdown-it, PrismJS, KaTeX, Mermaid).
 * Each asset is loaded at most once via dynamic import and exposed on `window` for downstream consumers.
 */

// Inlined from mermaid-config.js to avoid bundling issues with template literals
const MERMAID_INIT_OPTIONS = {
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

/** @class */
export class AssetLoader {
  /** @type {Map<string, Promise<void>>} */
  static _oncePromises = new Map();

  /**
   * Run `loader` exactly once for a given `key`. Subsequent calls return the cached promise.
   * @static
   * @param {string} key - Unique cache key for this asset.
   * @param {() => Promise<void>} loader - Async function that loads the asset.
   * @returns {Promise<void>}
   */
  static once(key, loader) {
    if (this._oncePromises.has(key)) return this._oncePromises.get(key);
    const p = (async () => loader())();
    this._oncePromises.set(key, p);
    return p;
  }

  /**
   * Ensure `window.markdownit` is available (loaded via dynamic import if needed).
   * @static
   * @returns {Promise<void>}
   */
  static async ensureMarkdownItLoaded() {
    if (typeof window.markdownit === "function") return;

    await this.once("markdown-it", async () => {
      const mod = await import("markdown-it");
      const MarkdownItCtor = mod?.default || mod;
      if (typeof MarkdownItCtor !== "function")
        throw new Error("markdown-it import did not return a constructor");
      window.markdownit = (opts) => new MarkdownItCtor(opts);
    });
  }

  /**
   * Ensure PrismJS and common language grammars are loaded on `window.Prism`.
   * @static
   * @returns {Promise<void>}
   */
  static async ensurePrismLoaded() {
    if (window.Prism && typeof window.Prism.highlightElement === "function") return;

    await this.once("prism", async () => {
      try {
        await import("prismjs/themes/prism.css");
      } catch {
        // ignore (theme is optional)
      }

      const prismMod = await import("prismjs");
      window.Prism = prismMod?.default || prismMod;

      // Best-effort language support (ignore failures)
      const loadLangs = [
        () => import("prismjs/components/prism-clike.js"),
        () => import("prismjs/components/prism-javascript.js"),
        () => import("prismjs/components/prism-typescript.js"),
        () => import("prismjs/components/prism-json.js"),
        () => import("prismjs/components/prism-bash.js"),
        () => import("prismjs/components/prism-powershell.js"),
        () => import("prismjs/components/prism-python.js"),
        () => import("prismjs/components/prism-java.js"),
        () => import("prismjs/components/prism-css.js"),
        () => import("prismjs/components/prism-markup.js"),
        () => import("prismjs/components/prism-yaml.js"),
        () => import("prismjs/components/prism-c.js"),
        () => import("prismjs/components/prism-cpp.js"),
        () => import("prismjs/components/prism-markdown.js"),
        () => import("prismjs/components/prism-makefile.js"),
        () => import("prismjs/components/prism-cmake.js"),
        () => import("prismjs/components/prism-sql.js"),
      ];

      for (const load of loadLangs) {
        try {
          await load();
        } catch {
          // ignore
        }
      }
    });
  }

  /**
   * Ensure KaTeX and its auto-render extension are loaded on `window.katex` / `window.renderMathInElement`.
   * @static
   * @returns {Promise<void>}
   */
  static async ensureKatexLoaded() {
    if (typeof window.renderMathInElement === "function") return;

    await this.once("katex", async () => {
      try {
        await import("katex/dist/katex.min.css");
      } catch {
        // ignore
      }

      const katexMod = await import("katex");
      window.katex = katexMod?.default || katexMod;

      const autoRenderMod = await import("katex/contrib/auto-render");
      const renderMathInElement =
        autoRenderMod?.renderMathInElement ||
        autoRenderMod?.default?.renderMathInElement ||
        autoRenderMod?.default;

      if (typeof renderMathInElement === "function") {
        window.renderMathInElement = renderMathInElement;
      } else {
        throw new Error("KaTeX auto-render not available");
      }
    });
  }

  /**
   * Ensure Mermaid is loaded and initialized on `window.mermaid`.
   * Uses a pre-bundled global if present (e.g. dist builds), otherwise dynamic-imports.
   * @static
   * @returns {Promise<void>}
   */
  static async ensureMermaidLoaded() {
    if (window.__WEBDECK_MERMAID__) return;

    const mermaidInitOptions = MERMAID_INIT_OPTIONS;

    // Use a preloaded global Mermaid if present (e.g., bundled in dist builds)
    if (window.mermaid && typeof window.mermaid.initialize === "function") {
      window.mermaid.initialize(mermaidInitOptions);
      window.__WEBDECK_MERMAID__ = { mermaid: window.mermaid };
      return;
    }

    await this.once("mermaid", async () => {
      const mermaidMod = await import("mermaid");
      const mermaid = mermaidMod?.default || mermaidMod;
      mermaid.initialize(mermaidInitOptions);
      window.mermaid = mermaid;
      window.__WEBDECK_MERMAID__ = { mermaid };
    });
  }

  /**
   * Preload all optional rich-text enhancers (Prism, KaTeX, Mermaid) in parallel.
   * Failures are silently ignored — the deck renders without them.
   * @static
   * @returns {Promise<void>}
   */
  static async ensureRichTextEnhancers() {
    // Never throw: the deck should still render without optional enhancers.
    await Promise.allSettled([
      this.ensurePrismLoaded(),
      this.ensureKatexLoaded(),
      // Mermaid is loaded lazily too, but preloading here keeps navigation snappy once you hit a Mermaid slide.
      this.ensureMermaidLoaded(),
    ]);
  }
}

// Expose for non-module consumers (exported HTML bundle)
if (typeof window !== "undefined") {
  window.AssetLoader = AssetLoader;
}
