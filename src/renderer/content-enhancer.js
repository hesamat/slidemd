/**
 * ContentEnhancer
 * Provides static methods for enhancing slide content, including diagram rendering (Mermaid), syntax highlighting (Prism), and math typesetting (KaTeX).
 */
import { normalizeCodeLanguage, escapeHtml } from "../core/utils.js";

export class ContentEnhancer {
    /**
     * Scans the deck to see what enhancers are needed.
     */
    static scanDeck(deck) {
        let hasMermaid = false;
        let hasMath = false;
        let hasCode = false;

        const checkText = (text) => {
            if (!text) return;
            if (!hasMermaid && /class=["'][^"']*\bmermaid\b[^"']*["']/.test(text)) hasMermaid = true;
            if (!hasMermaid && /(```|~~~)\s*mermaid/.test(text)) hasMermaid = true;
            if (!hasMath && /\$\$|\$|\\\(|\\\[|\\begin\{/.test(text)) hasMath = true;
            if (!hasCode && /<pre\b[\s\S]*?<code\b/i.test(text)) hasCode = true;
        };

        for (const slide of deck.slides) {
            if (hasMermaid && hasMath && hasCode) break;
            if (slide.notes) checkText(slide.notes);
            if (slide.areas) {
                for (const area of Object.values(slide.areas)) checkText(area);
            }
        }
        return { hasMermaid, hasMath, hasCode };
    }

    /**
     * Initializes and returns the Mermaid instance.
     */
    static async initializeMermaid() {
        if (window.__WEBDECK_MERMAID__) return window.__WEBDECK_MERMAID__;

        // Prefer global AssetLoader when available (exported HTML bundles it)
        const loader = window.AssetLoader || (await import("../core/asset-loader.js")).AssetLoader;
        await loader.ensureMermaidLoaded();
        return window.__WEBDECK_MERMAID__;
    }

    // add somewhere in ContentEnhancer
    static getMermaidSandbox() {
        let box = document.getElementById("mermaid-sandbox");
        if (!box) {
            box = document.createElement("div");
            box.id = "mermaid-sandbox";
            box.setAttribute("aria-hidden", "true");
            box.style.cssText = `
      position: fixed;
      left: -10000px;
      top: 0;
      width: 0;
      height: 0;
      overflow: hidden;
      pointer-events: none;
      contain: layout paint style;
    `;
            document.body.appendChild(box);
        }
        return box;
    }

    /**
     * Renders Mermaid diagrams.
     */
    static async renderMermaidDiagrams(rootEl, options = {}) {
        const mermaidBlocks = rootEl?.querySelectorAll(".mermaid:not([data-mermaid-processed])") || [];
        if (mermaidBlocks.length === 0) return true;

        const { renderAllSlides = false } = options;
        const { mermaid } = await this.initializeMermaid();
        if (!mermaid) return false;

        for (const el of mermaidBlocks) {
            const slide = el.closest(".slide");
            if (slide && !renderAllSlides && !slide.classList.contains("active")) continue;

            const source = el.dataset.mermaidSource;
            if (!source) {
                el.dataset.mermaidProcessed = "1";
                continue;
            }

            try {
                const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const sandbox = this.getMermaidSandbox();

                // (Optional but helps avoid a second reflow due to font swapping)
                if (document.fonts?.ready) await document.fonts.ready;

                const out = await mermaid.render(id, source, sandbox);
                el.innerHTML = out.svg;
                out.bindFunctions?.(el);
            } catch (e) {
                el.innerHTML = `<div style="color:#d32f2f; padding:1rem;">Error: ${escapeHtml(e.message || 'Mermaid rendering failed')}</div>`;
            }
            el.dataset.mermaidProcessed = "1";
        }

        return true;
    }

    /**
     * Enhances rendered content with syntax highlighting, diagrams, and math.
     */
    static async enhanceRenderedContent(rootEl, options = {}) {
        if (!rootEl) return;
        const { renderAllSlides = false, force = false, skipMermaidRendering = false } = options;

        if (!force && rootEl.dataset?.webdeckEnhanced === "1") return true;

        // Load assets if needed
        if (!window.Prism || !window.renderMathInElement || (!window.__WEBDECK_MERMAID__ && rootEl.querySelector(".mermaid"))) {
            try {
                const loader = window.AssetLoader || (await import("../core/asset-loader.js")).AssetLoader;
                await loader.ensureRichTextEnhancers();
            } catch (e) { console.warn("Enhancer load error", e); }
        }

        // 1. Convert Mermaid code blocks to divs
        const mermaidCodeNodes = rootEl.querySelectorAll("pre code.language-mermaid, pre code.lang-mermaid");
        for (const codeEl of mermaidCodeNodes) {
            const pre = codeEl.parentElement;
            if (pre?.tagName === "PRE") {
                const source = codeEl.textContent?.trim();
                if (!source) continue;

                const div = document.createElement("div");
                div.className = "mermaid";
                div.dataset.mermaidSource = source;
                // Include source for runtime rendering (used in exports)
                div.textContent = source;
                pre.replaceWith(div);
            }
        }

        // 2. Render Mermaid diagrams (skip if requested for runtime rendering)
        const mermaidBlocks = rootEl.querySelectorAll(".mermaid");
        if (mermaidBlocks.length > 0) {
            mermaidBlocks.forEach((el) => el.closest(".slide__area")?.classList.add("media"));
            if (!skipMermaidRendering) {
                await this.renderMermaidDiagrams(rootEl, { renderAllSlides });
            }
        }

        // 3. Prism syntax highlighting
        if (window.Prism) {
            const codeNodes = Array.from(rootEl.querySelectorAll("pre code"));
            for (const codeEl of codeNodes) {
                const match = codeEl.className.match(/(?:lang|language)-(\S+)/);
                const lang = match ? normalizeCodeLanguage(match[1]) : "none";
                codeEl.className = `language-${lang}`;
            }
            try {
                if (window.Prism.highlightAllUnder) window.Prism.highlightAllUnder(rootEl);
                else codeNodes.forEach(c => window.Prism.highlightElement(c));
            } catch (e) { console.warn("Prism error:", e); }
        }

        // 4. KaTeX math
        if (window.renderMathInElement) {
            try {
                window.renderMathInElement(rootEl, {
                    delimiters: [
                        { left: "$$", right: "$$", display: true },
                        { left: "$", right: "$", display: false },
                        { left: "\\(", right: "\\)", display: false },
                        { left: "\\[", right: "\\]", display: true }
                    ],
                    ignoredClasses: ["no-math", "katex-ignore", "mermaid"],
                    throwOnError: false,
                });
            } catch (e) { console.warn("KaTeX error:", e); }
        }

        if (rootEl.dataset) rootEl.dataset.webdeckEnhanced = "1";
        return true;
    }
}
