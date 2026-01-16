// Content enhancement (D2, Prism, KaTeX)
/**
 * ContentEnhancer
 * Provides static methods for enhancing slide content, including diagram rendering (D2), syntax highlighting (Prism), and math typesetting (KaTeX).
 * Supports concurrency for batch processing and integrates with global asset loaders.
 */
import { normalizeCodeLanguage, escapeHtml } from "./utils.js";

export class ContentEnhancer {
    static d2Initialized = false;
    static d2Instance = null;

    /**
     * Extracts HTML text from a deck for scanning purposes.
     * @param {Object} deck - The deck object containing slides
     * @returns {string} Concatenated HTML content from all slides
     */
    static deckHtmlText(deck) {
        if (!deck || !Array.isArray(deck.slides)) return "";
        const parts = [];
        for (const s of deck.slides) {
            if (!s || typeof s !== "object") continue;
            if (s.areas && typeof s.areas === "object") {
                for (const v of Object.values(s.areas)) {
                    if (typeof v === "string" && v) parts.push(v);
                }
            }
            if (typeof s.notes === "string" && s.notes) parts.push(s.notes);
            if (typeof s.background === "string" && s.background) parts.push(s.background);
        }
        return parts.join("\n");
    }

    /**
     * Checks if text contains patterns that require rich text enhancers.
     * @param {string} text - Text to scan
     * @returns {boolean} True if enhancers are needed
     */
    static needsEnhancers(text) {
        if (!text) return false;
        // Prism: code blocks, KaTeX: math delimiters, D2: .d2 blocks
        return (
            /<pre\b[\s\S]*?<code\b/i.test(text) ||
            /\$\$|\$|\\\(|\\\[|\\begin\{/.test(text) ||
            /class=["'][^"']*\bd2\b[^"']*["']/i.test(text)
        );
    }

    static async runWithConcurrency(tasks, limit = 4) {
        if (!Array.isArray(tasks) || tasks.length === 0) return;
        const concurrency = Math.max(1, Math.min(limit, tasks.length));
        let index = 0;

        const workers = Array.from({ length: concurrency }, async () => {
            while (index < tasks.length) {
                const current = index++;
                const fn = tasks[current];
                try {
                    await fn();
                } catch {
                    // ignore individual task failure
                }
            }
        });

        await Promise.all(workers);
    }

    static async renderD2Diagrams(rootEl) {
        if (!rootEl) return;
        const D2Ctor = window.__WEBDECK_D2__?.D2;
        if (!D2Ctor) return;

        if (!this.d2Initialized) {
            try {
                this.d2Instance = new D2Ctor();
                this.d2Initialized = true;
            } catch (e) {
                console.error("Failed to initialize D2:", e);
                return;
            }
        }

        const d2 = this.d2Instance;
        if (!d2) return;

        const nodes = Array.from(rootEl.querySelectorAll(".d2"))
            .filter((n) => n instanceof HTMLElement)
            .filter((el) => el.dataset.d2Processed !== "1")
            // Avoid rendering diagrams in non-active slides (often display:none), which can break some renderers.
            .filter((el) => {
                const slide = el.closest?.(".slide");
                return !slide || slide.classList.contains("active");
            });

        const tasks = nodes.map((el, i) => async () => {
            // If already rendered, mark processed.
            if (el.querySelector?.("svg")) {
                el.dataset.d2Processed = "1";
                return;
            }

            const source = (el.textContent || el.dataset.d2Source || "").trim();
            if (!source) {
                el.dataset.d2Processed = "1";
                return;
            }

            const salt = `webdeck_d2_${Date.now()}_${i}`;

            try {
                const compiled = await d2.compile(source, {
                    // Keep padding reasonable for slides
                    pad: 24,
                    center: true,
                    noXMLTag: true,
                    salt,
                });

                const svg = await d2.render(compiled.diagram, {
                    ...(compiled.renderOptions || {}),
                    pad: 24,
                    center: true,
                    noXMLTag: true,
                    salt,
                });

                el.innerHTML = svg || "";
                el.dataset.d2Processed = "1";

                const insertedSvg = el.querySelector("svg");
                if (insertedSvg) {
                    insertedSvg.style.maxWidth = "100%";
                    insertedSvg.style.maxHeight = "100%";
                }
            } catch (e) {
                el.innerHTML = `<div style="color: #dc2626; padding: 1rem; border: 1px solid #fca5a5; border-radius: 8px; background: #fef2f2;">
                    <strong>D2 Render Error:</strong><br/>
                    <code style="white-space: pre-wrap; font-size: 0.875em;">${escapeHtml(String(e))}</code>
                </div>`;
                el.dataset.d2Processed = "1";
            }
        });

        await this.runWithConcurrency(tasks, 2);
    }

    static async enhanceRenderedContent(rootEl) {
        if (!rootEl) return;

        // Convert D2 code blocks to diagrams
        const d2CodeNodes = rootEl.querySelectorAll("pre code.language-d2, pre code.lang-d2");
        if (d2CodeNodes.length > 0) {
            d2CodeNodes.forEach((codeEl) => {
                const pre = codeEl.parentElement;
                if (!pre || pre.tagName !== "PRE") return;

                const div = document.createElement("div");
                div.className = "d2";
                div.textContent = codeEl.textContent || "";
                pre.replaceWith(div);
            });
        }

        // Render D2 diagrams from any .d2 blocks (either converted above or produced by markdown parsing).
        const d2Blocks = rootEl.querySelectorAll(".d2");
        if (d2Blocks.length > 0) {
            // Ensure D2 module is loaded
            if (!window.__WEBDECK_D2__) {
                try {
                    const { AssetLoader } = await import("./asset-loader.js");
                    await AssetLoader.ensureD2Loaded();
                } catch {
                    // ignore
                }
            }

            d2Blocks.forEach((el) => {
                const slideArea = el.closest?.(".slide__area");
                if (slideArea) slideArea.classList.add("media");
            });

            try {
                await this.renderD2Diagrams(rootEl);
            } catch (e) {
                console.error("Failed to render D2 diagrams:", e);
            }
        }

        // Syntax highlighting
        if (window.Prism && typeof window.Prism.highlightElement === "function") {
            const nodes = Array.from(rootEl.querySelectorAll("pre code"));
            if (nodes.length > 0) {
                nodes.forEach((codeEl) => {
                    const match = codeEl.className.match(/(?:lang|language)-(\S+)/);
                    const lang = match ? normalizeCodeLanguage(match[1]) : "none";
                    codeEl.className = `language-${lang}`;
                });

                if (typeof window.Prism.highlightAllUnder === "function") {
                    window.Prism.highlightAllUnder(rootEl);
                } else {
                    nodes.forEach((codeEl) => window.Prism.highlightElement(codeEl));
                }
            }
        }

        // KaTeX math rendering
        if (typeof window.renderMathInElement === "function") {
            try {
                // Cheap early-exit: skip KaTeX if there's no sign of math delimiters.
                const text = rootEl.textContent || "";
                if (!/\$\$|\$|\\\(|\\\[|\\begin\{/.test(text)) return;
                window.renderMathInElement(rootEl, {
                    delimiters: [
                        { left: "$$", right: "$$", display: true },
                        { left: "$", right: "$", display: false },
                    ],
                    throwOnError: false,
                });
            } catch {
                // ignore
            }
        }
    }
}
