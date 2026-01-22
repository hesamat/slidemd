/**
 * ContentEnhancer
 * Provides static methods for enhancing slide content, including diagram rendering (D2), syntax highlighting (Prism), and math typesetting (KaTeX).
 */
import { normalizeCodeLanguage, escapeHtml, simpleHash, yieldToMain } from "./utils.js";

export class ContentEnhancer {
    static d2Promise = null; 
    static d2Instance = null;
    static d2RenderQueue = new Set();
    static d2Cache = new Map();

    /**
     * Efficiently scans the deck object to see what enhancers we need
     * (Avoids converting the whole deck to a massive HTML string)
     */
    static scanDeck(deck) {
        let hasD2 = false;
        let hasMath = false;
        let hasCode = false;

        const checkText = (text) => {
            if (!text) return;
            if (!hasD2 && /class=["'][^"']*\bd2\b[^"']*["']/.test(text)) hasD2 = true;
            if (!hasD2 && /(```|~~~)\s*d2/.test(text)) hasD2 = true; // Check markdown blocks too
            if (!hasMath && /\$\$|\$|\\\(|\\\[|\\begin\{/.test(text)) hasMath = true;
            if (!hasCode && /<pre\b[\s\S]*?<code\b/i.test(text)) hasCode = true;
        };

        for (const slide of deck.slides) {
            if (hasD2 && hasMath && hasCode) break; // Found everything
            if (slide.notes) checkText(slide.notes);
            if (slide.areas) {
                for (const area of Object.values(slide.areas)) checkText(area);
            }
        }
        return { hasD2, hasMath, hasCode };
    }

    /**
     * Triggers a background download and initialization of D2.
     * Call this immediately when the app starts if D2 is detected.
     */
    static async warmupD2() {
        if (this.d2Instance || this.d2Promise) return; // Already running
        
        console.log("Warming up D2 engine in background...");
        try {
            // 1. Download Script
            await this.initializeD2();
            
            // 2. Force Worker Start (Compile nothing)
            if (this.d2Instance) {
                await this.d2Instance.compile("", { salt: "warmup" });
            }
        } catch (e) {
            console.warn("D2 Warmup failed (will retry on demand):", e);
        }
    }

    static async initializeD2(forceReinit = false) {
        if (this.d2Promise && !forceReinit) return this.d2Promise;

        this.d2Promise = (async () => {
            if (forceReinit && this.d2Instance) {
                try {
                    if (this.d2Instance.worker?.terminate) this.d2Instance.worker.terminate();
                } catch (e) { console.warn("D2 cleanup warning:", e); }
                this.d2Instance = null;
            }

            // Load Script via AssetLoader
            if (!window.__WEBDECK_D2__?.D2) {
                const { AssetLoader } = await import("./asset-loader.js");
                await AssetLoader.ensureD2Loaded();
            }

            const D2Ctor = window.__WEBDECK_D2__.D2;
            this.d2Instance = new D2Ctor();
            return this.d2Instance;
        })();

        return this.d2Promise;
    }

    static async renderD2Diagrams(rootEl, options = {}) {
        if (!rootEl) return true;

        const d2Blocks = rootEl.querySelectorAll(".d2");
        if (d2Blocks.length === 0) return true;

        const { renderAllSlides = false } = options;

        const nodes = Array.from(d2Blocks).filter(el => {
            if (el.dataset.d2Processed === "1") return false;
            const slide = el.closest(".slide");
            return !slide || renderAllSlides || slide.classList.contains("active");
        });

        if (nodes.length === 0) return true;

        let d2 = null;

        for (const [i, el] of nodes.entries()) {
            try {
                const rawSource = el.dataset.d2Source; 
                if (!rawSource) {
                    el.dataset.d2Processed = "1";
                    continue;
                }

                const sourceHash = simpleHash(rawSource);
                if (this.d2Cache.has(sourceHash)) {
                    el.innerHTML = this.d2Cache.get(sourceHash);
                    el.dataset.d2Processed = "1";
                    const svgEl = el.querySelector("svg");
                    if (svgEl) {
                        svgEl.style.width = "100%";
                        svgEl.style.height = "auto";
                    }
                    continue; 
                }

                if (!d2) {
                    try {
                        await yieldToMain();
                        d2 = await this.initializeD2();
                    } catch (e) {
                        console.error("Failed to initialize D2:", e);
                        return false;
                    }
                }

                const elementId = `d2_${sourceHash}_${i}`;
                if (this.d2RenderQueue.has(elementId)) continue;

                this.d2RenderQueue.add(elementId);
                el.dataset.d2Rendering = "1";

                const salt = `d2_${Date.now()}_${i}`;
                let success = false;
                let attempts = 0;

                await yieldToMain();

                while (!success && attempts <= 1) {
                    try {
                        const timeoutPromise = new Promise((_, reject) => 
                            setTimeout(() => reject(new Error("Timeout")), 15000)
                        );

                        const compiled = await Promise.race([
                            d2.compile(rawSource, { pad: 24, center: true, salt }),
                            timeoutPromise
                        ]);

                        await yieldToMain();

                        const response = await Promise.race([
                            d2.render(compiled.diagram, { 
                                ...(compiled.renderOptions || {}), 
                                pad: 24, center: true, salt 
                            }),
                            timeoutPromise
                        ]);

                        let svg = (typeof response === "string") ? response : 
                                  (response?.svg || response?.result || "");
                        
                        if (!svg) throw new Error("No SVG generated");

                        this.d2Cache.set(sourceHash, svg);

                        el.innerHTML = svg;
                        el.dataset.d2Processed = "1";
                        
                        const svgEl = el.querySelector("svg");
                        if (svgEl) {
                            svgEl.style.width = "100%";
                            svgEl.style.height = "auto";
                            svgEl.style.maxWidth = "100%";
                        }
                        success = true;

                    } catch (e) {
                        attempts++;
                        if (e.message === "Timeout" || e.message.includes("worker")) {
                            d2 = await this.initializeD2(true);
                        }
                        if (attempts > 1) {
                            el.innerHTML = `<div style="color:#d32f2f; padding:1rem; border:1px solid red;">Error: ${escapeHtml(e.message)}</div>`;
                            el.dataset.d2Processed = "1";
                        } else {
                            await new Promise(r => setTimeout(r, 500));
                        }
                    }
                }
                this.d2RenderQueue.delete(elementId);
                delete el.dataset.d2Rendering;
            } catch (e) {
                console.error(`Error processing D2 diagram at index ${i}:`, e);
                el.innerHTML = `<div style="color:#d32f2f; padding:1rem; border:1px solid red;">Error: ${escapeHtml(e.message)}</div>`;
                el.dataset.d2Processed = "1";
                if (el.dataset.d2Rendering) {
                    delete el.dataset.d2Rendering;
                }
            }
        }

        return true;
    }

    static async enhanceRenderedContent(rootEl, options = {}) {
        if (!rootEl) return;
        const { renderAllSlides = false } = options;

        // Note: Asset loading logic moved to scanDeck/warmup in deck.js
        // but we keep this check for runtime safety.
        if (!window.Prism || (!window.renderMathInElement && /\$\$|\$|\\\(|\\\[|\\begin\{/.test(rootEl.textContent || ""))) {
            try {
                const { AssetLoader } = await import("./asset-loader.js");
                await AssetLoader.ensureRichTextEnhancers();
            } catch (e) { console.warn("Enhancer load error", e); }
        }

        // 1. Prepare D2 blocks (Save source, show spinner)
        const d2CodeNodes = rootEl.querySelectorAll("pre code.language-d2, pre code.lang-d2");
        for (const codeEl of d2CodeNodes) {
            const pre = codeEl.parentElement;
            if (pre && pre.tagName === "PRE") {
                const source = (codeEl.textContent || "").trim();
                if (!source) continue;

                const sourceHash = simpleHash(source);
                const div = document.createElement("div");
                div.className = "d2";
                div.dataset.d2Source = source; 

                if (this.d2Cache.has(sourceHash)) {
                    div.innerHTML = this.d2Cache.get(sourceHash);
                    div.dataset.d2Processed = "1";
                } else {
                    div.innerHTML = `<div class="d2-loading" style="display:flex;align-items:center;justify-content:center;min-height:100px;color:#666;">
                        <svg style="width:24px;height:24px;margin-right:8px;animation:spin 1s linear infinite;" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" style="opacity:0.3"></circle>
                            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path>
                        </svg>
                        <span style="font-family:sans-serif;font-size:0.9rem;">Rendering...</span>
                        <style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>
                    </div>`;
                }
                pre.replaceWith(div);
            }
        }

        // 2. Trigger Render
        const d2Blocks = rootEl.querySelectorAll(".d2");
        if (d2Blocks.length > 0) {
             // If we didn't warmup, this will be slow, but it will work.
            if (!window.__WEBDECK_D2__?.D2) {
                try {
                    const { AssetLoader } = await import("./asset-loader.js");
                    await AssetLoader.ensureD2Loaded();
                } catch (e) { console.error("D2 load error", e); }
            }
            d2Blocks.forEach((el) => el.closest(".slide__area")?.classList.add("media"));
            
            // Run rendering in background
            this.renderD2Diagrams(rootEl, { renderAllSlides }).catch(e => console.error(e));
        }

        // 3. Prism
        if (window.Prism) {
            const codeNodes = Array.from(rootEl.querySelectorAll("pre code"));
            for (const codeEl of codeNodes) {
                const match = codeEl.className.match(/(?:lang|language)-(\S+)/);
                let lang = match ? match[1] : "none";
                if (typeof normalizeCodeLanguage === 'function') lang = normalizeCodeLanguage(lang);
                codeEl.className = `language-${lang}`;
            }
            try {
                if (window.Prism.highlightAllUnder) window.Prism.highlightAllUnder(rootEl);
                else codeNodes.forEach(c => window.Prism.highlightElement(c));
            } catch (e) { }
        }

        // 4. KaTeX
        if (window.renderMathInElement && /\$\$|\$|\\\(|\\\[|\\begin\{/.test(rootEl.textContent || "")) {
            try {
                window.renderMathInElement(rootEl, {
                    delimiters: [
                        { left: "$$", right: "$$", display: true },
                        { left: "$", right: "$", display: false },
                        { left: "\\(", right: "\\)", display: false },
                        { left: "\\[", right: "\\]", display: true }
                    ],
                    ignoredClasses: ["no-math", "katex-ignore", "d2"],
                    throwOnError: false,
                });
            } catch (e) { }
        }
        return true;
    }
}