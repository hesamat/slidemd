/**
 * ContentEnhancer
 * Provides static methods for enhancing slide content, including diagram rendering (D2), syntax highlighting (Prism), and math typesetting (KaTeX).
 */
import { normalizeCodeLanguage, escapeHtml } from "./utils.js";

export class ContentEnhancer {
    static d2Initialized = false;
    static d2Instance = null;

    /**
     * Extracts HTML text from a deck for scanning purposes.
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
     */
    static needsEnhancers(text) {
        if (!text) return false;
        return (
            /<pre\b[\s\S]*?<code\b/i.test(text) ||
            /\$\$|\$|\\\(|\\\[|\\begin\{/.test(text) ||
            /class=["'][^"']*\bd2\b[^"']*["']/i.test(text)
        );
    }

    static async renderD2Diagrams(rootEl, options = {}) {
        if (!rootEl) return;
        const D2Ctor = window.__WEBDECK_D2__?.D2;
        if (!D2Ctor) return;

        // 1. Initialize or Reset D2 Instance
        if (!this.d2Initialized || !this.d2Instance) {
            try {
                if (this.d2Instance?.destroy) await this.d2Instance.destroy();
                this.d2Instance = new D2Ctor();
                this.d2Initialized = true;
            } catch (e) {
                console.error("Failed to initialize D2:", e);
                this.d2Initialized = false;
                return;
            }
        }

        const d2 = this.d2Instance;
        const { renderAllSlides = false } = options;

        // 2. Filter Nodes
        const nodes = Array.from(rootEl.querySelectorAll(".d2"))
            .filter((n) => n instanceof HTMLElement && n.dataset.d2Processed !== "1")
            .filter((el) => {
                const slide = el.closest?.(".slide");
                return !slide || renderAllSlides || slide.classList.contains("active");
            });

        // 3. Serial Execution Loop
        for (const [i, el] of nodes.entries()) {
            if (el.querySelector("svg")) {
                el.dataset.d2Processed = "1";
                continue;
            }

            const source = (el.textContent || el.dataset.d2Source || "").trim();
            if (!source) {
                el.dataset.d2Processed = "1";
                continue;
            }

            const salt = `webdeck_d2_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`;
            const maxRetries = 2;
            let success = false;
            let attempts = 0;

            while (!success && attempts <= maxRetries) {
                try {
                    const compiled = await d2.compile(source, { pad: 24, center: true, salt });
                    const response = await d2.render(compiled.diagram, {
                        ...(compiled.renderOptions || {}),
                        pad: 24,
                        center: true,
                        salt,
                    });

                    let svg = "";
                    if (typeof response === "string") svg = response;
                    else if (typeof response?.svg === "string") svg = response.svg;
                    else if (typeof response?.result === "string") svg = response.result;

                    el.innerHTML = svg;
                    el.dataset.d2Processed = "1";

                    const insertedSvg = el.querySelector("svg");
                    if (insertedSvg) {
                        insertedSvg.style.maxWidth = "100%";
                        insertedSvg.style.maxHeight = "100%";
                    }
                    success = true;
                } catch (e) {
                    attempts++;
                    if (attempts > maxRetries) {
                        console.error("D2 Final Failure:", e);
                        el.innerHTML = `<div style="color: #dc2626; padding: 1rem; border: 1px solid #fca5a5; border-radius: 8px; background: #fef2f2;">
                            <strong>D2 Render Error:</strong><br/>
                            <code style="white-space: pre-wrap; font-size: 0.875em;">${escapeHtml(String(e))}</code>
                        </div>`;
                        this.d2Initialized = false;
                    } else {
                        await new Promise((r) => setTimeout(r, 100 * attempts));
                    }
                }
            }
        }
    }

    static async enhanceRenderedContent(rootEl, options = {}) {
        if (!rootEl) return;
        const { renderAllSlides = false } = options;

        // --- 0. ENSURE DEPENDENCIES LOADED ---
        // If Prism or KaTeX are missing, try to load them on the fly
        if (!window.Prism || (!window.renderMathInElement && /\$\$|\$|\\\(|\\\[|\\begin\{/.test(rootEl.textContent || ""))) {
            try {
                const { AssetLoader } = await import("./asset-loader.js");
                await AssetLoader.ensureRichTextEnhancers();
            } catch (e) {
                console.warn("Could not load rich text enhancers:", e);
            }
        }

        // --- 1. PREPARE D2 BLOCKS ---
        const d2CodeNodes = rootEl.querySelectorAll("pre code.language-d2, pre code.lang-d2");
        for (const codeEl of d2CodeNodes) {
            const pre = codeEl.parentElement;
            if (pre && pre.tagName === "PRE") {
                const div = document.createElement("div");
                div.className = "d2";
                div.textContent = codeEl.textContent || "";
                pre.replaceWith(div);
            }
        }

        // --- 2. RENDER D2 ---
        const d2Blocks = rootEl.querySelectorAll(".d2");
        if (d2Blocks.length > 0) {
            // Ensure D2 loaded
            if (!window.__WEBDECK_D2__) {
                try {
                    const { AssetLoader } = await import("./asset-loader.js");
                    await AssetLoader.ensureD2Loaded();
                } catch (e) {
                    console.error("Failed to load D2 module:", e);
                }
            }

            d2Blocks.forEach((el) => el.closest(".slide__area")?.classList.add("media"));

            try {
                await this.renderD2Diagrams(rootEl, { renderAllSlides });
            } catch (e) {
                console.error("Failed to render D2 diagrams:", e);
                this.d2Initialized = false;
            }
        }

        // --- 3. PRISM SYNTAX HIGHLIGHTING ---
        if (window.Prism && typeof window.Prism.highlightElement === "function") {
            const codeNodes = Array.from(rootEl.querySelectorAll("pre code"));

            if (codeNodes.length > 0) {
                for (const codeEl of codeNodes) {
                    // Extract language from class (e.g., "language-js" or "lang-js")
                    const match = codeEl.className.match(/(?:lang|language)-(\S+)/);
                    let lang = match ? match[1] : "none";

                    // Normalize (e.g., 'js' -> 'javascript')
                    if (typeof normalizeCodeLanguage === 'function') {
                        lang = normalizeCodeLanguage(lang);
                    }

                    // Apply canonical class for Prism
                    codeEl.className = `language-${lang}`;
                }

                if (typeof window.Prism.highlightAllUnder === "function") {
                    window.Prism.highlightAllUnder(rootEl);
                } else {
                    codeNodes.forEach((codeEl) => window.Prism.highlightElement(codeEl));
                }
            }
        }

        // --- 4. KATEX MATH RENDERING ---
        if (typeof window.renderMathInElement === "function") {
            const text = rootEl.textContent || "";
            if (/\$\$|\$|\\\(|\\\[|\\begin\{/.test(text)) {
                try {
                    window.renderMathInElement(rootEl, {
                        delimiters: [
                            { left: "$$", right: "$$", display: true },
                            { left: "$", right: "$", display: false },
                            { left: "\\(", right: "\\)", display: false },
                            { left: "\\[", right: "\\]", display: true }
                        ],
                        throwOnError: false,
                    });
                } catch (e) {
                    console.warn("KaTeX rendering failed:", e);
                }
            }
        }
    }
}