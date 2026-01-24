/**
 * AssetLoader
 * Utility class for loading and caching external assets (e.g., markdown-it, PrismJS) for the slide deck application.
 * Provides methods to ensure assets are loaded only once and exposes them globally for use in rendering and enhancement.
 */
// Asset loading utilities (optional vendor enhancers)
export class AssetLoader {
    static _oncePromises = new Map();

    static once(key, loader) {
        if (this._oncePromises.has(key)) return this._oncePromises.get(key);
        const p = (async () => loader())();
        this._oncePromises.set(key, p);
        return p;
    }

    static async ensureMarkdownItLoaded() {
        if (typeof window.markdownit === "function") return;

        await this.once("markdown-it", async () => {
            const mod = await import("markdown-it");
            const MarkdownItCtor = mod?.default || mod;
            if (typeof MarkdownItCtor !== "function") throw new Error("markdown-it import did not return a constructor");
            window.markdownit = (opts) => new MarkdownItCtor(opts);
        });
    }

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

    static async ensureMermaidLoaded() {
        if (window.__WEBDECK_MERMAID__) return;

        // Use a preloaded global Mermaid if present (e.g., inlined in exported HTML)
        if (window.mermaid && typeof window.mermaid.initialize === "function") {
            window.mermaid.initialize({
                startOnLoad: false,
                theme: 'default',
                securityLevel: 'loose'
            });
            window.__WEBDECK_MERMAID__ = { mermaid: window.mermaid };
            return;
        }

        await this.once("mermaid", async () => {
            const mermaidMod = await import("mermaid");
            const mermaid = mermaidMod?.default || mermaidMod;
            // Initialize Mermaid with default config
            mermaid.initialize({
                startOnLoad: false,
                theme: 'default',
                securityLevel: 'loose'
            });
            window.__WEBDECK_MERMAID__ = { mermaid };
        });
    }

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
