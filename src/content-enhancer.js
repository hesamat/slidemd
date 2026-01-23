
/**
 * ContentEnhancer
 * Provides static methods for enhancing slide content, including diagram rendering (D2), syntax highlighting (Prism), and math typesetting (KaTeX).
 *
 * D2 rendering uses the main thread with proper error handling and SVG validation.
 * Only visible/active slides are rendered by default.
 * D2 is preloaded on browser idle.
 */
import { normalizeCodeLanguage, escapeHtml, yieldToMain, withTimeout } from "./utils.js";

export class ContentEnhancer {
    static d2Promise = null;
    static d2Instance = null;
    static d2Cache = new Map(); // Cache rendered diagrams by source hash

    /**
     * Validates that a string is valid SVG markup.
     * Checks for: non-empty, contains <svg tag, ends with </svg>, contains actual content
     */
    static isValidSvg(svg) {
        if (!svg || typeof svg !== 'string') return false;
        const trimmed = svg.trim();
        if (!trimmed) return false;

        // Remove XML declaration if present (<?xml...?>) before checking
        const withoutXmlDecl = trimmed.replace(/^<\?xml[^?]*\?>\s*/, '');

        if (!withoutXmlDecl.startsWith('<svg')) return false;
        if (!trimmed.includes('</svg>')) return false;

        // Check for some actual SVG content (paths, shapes, text, etc.)
        // This catches empty SVGs like <svg></svg>
        const hasContent = /<(path|rect|circle|ellipse|line|polygon|polyline|text|g|use|image)\b/i.test(svg);
        return hasContent;
    }

    /**
     * Creates a simple hash of a string for caching purposes.
     * Uses SubtleCrypto for better distribution than simple hashing.
     */
    static async hashString(str) {
        if (!crypto?.subtle) {
            // Fallback for older browsers: simple hash
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            return hash.toString(36);
        }

        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

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
            // Clear the failed promise to allow retry on first actual use
            this.d2Promise = null;
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

    static showD2Error(el, message) {
        el.innerHTML = `<div style="color:#d32f2f; padding:1rem; border:1px solid red;">Error: ${escapeHtml(message)}</div>`;
        el.dataset.d2Processed = "1";
    }


    static async renderD2Diagrams(rootEl, options = {}) {
        if (!rootEl) return true;

        // Only render visible/active slides unless renderAllSlides is true
        const { renderAllSlides = false } = options;
        const d2Blocks = rootEl.querySelectorAll(".d2");
        if (d2Blocks.length === 0) return true;
        const nodes = Array.from(d2Blocks).filter(el => {
            if (el.dataset.d2Processed === "1") return false;
            const slide = el.closest(".slide");
            if (!slide) return true;
            if (renderAllSlides) return true;
            // Only render if slide is visible
            return slide.classList.contains("active") && slide.offsetParent !== null;
        });
        if (nodes.length === 0) return true;

        // Initialize D2 once
        let d2 = null;
        try {
            d2 = await this.initializeD2();
        } catch (e) {
            console.error("Failed to initialize D2:", e);
            return false;
        }

        // Batch rendering for UI responsiveness - larger batch for better throughput
        const BATCH_SIZE = 4;
        let idx = 0;
        while (idx < nodes.length) {
            const batch = nodes.slice(idx, idx + BATCH_SIZE);
            await Promise.all(batch.map(async (el, i) => {
                if (el.dataset.d2Rendering === "1") return;
                el.dataset.d2Rendering = "1";
                try {
                    const rawSource = el.dataset.d2Source;
                    if (!rawSource) {
                        el.dataset.d2Processed = "1";
                        return;
                    }

                    // Check cache first
                    const sourceHash = await this.hashString(rawSource);
                    if (this.d2Cache.has(sourceHash)) {
                        const cachedSvg = this.d2Cache.get(sourceHash);
                        el.innerHTML = cachedSvg;
                        el.dataset.d2Processed = "1";
                        const svgEl = el.querySelector("svg");
                        if (svgEl) {
                            svgEl.style.width = "100%";
                            svgEl.style.height = "auto";
                            svgEl.style.maxWidth = "100%";
                        }
                        return;
                    }

                    const salt = `d2_${idx}_${i}`;
                    console.debug(`[D2] Rendering diagram (${rawSource.length} bytes)`);

                    // Render on main thread
                    let svg;
                    try {
                        console.debug('[D2] Compiling...');
                        const compiled = await withTimeout(
                            d2.compile(rawSource, { pad: 24, center: true, salt }),
                            8000
                        );

                        if (!compiled?.diagram) {
                            throw new Error('D2 compile returned empty result');
                        }

                        console.debug('[D2] Rendering...');
                        const response = await withTimeout(
                            d2.render(compiled.diagram, {
                                ...(compiled.renderOptions || {}),
                                pad: 24, center: true, salt
                            }),
                            8000
                        );

                        svg = (typeof response === "string") ? response :
                            (response?.svg || response?.result || "");

                        if (!svg || typeof svg !== 'string') {
                            console.error('[D2] Invalid response:', {
                                response,
                                responseKeys: Object.keys(response || {}),
                                hasSvg: !!response?.svg,
                                hasResult: !!response?.result,
                                svgType: typeof response?.svg,
                                resultType: typeof response?.result,
                                extractedSvg: svg,
                                extractedSvgType: typeof svg
                            });
                            throw new Error('D2 returned invalid response');
                        }

                        console.debug(`[D2] Complete (${svg.length} chars)`);
                    } catch (e) {
                        console.error('[D2] Rendering failed:', e);
                        throw new Error(e?.message || 'Rendering error');
                    }

                    // Validate SVG
                    if (!this.isValidSvg(svg)) {
                        throw new Error('D2 returned invalid SVG');
                    }

                    // Store in cache
                    this.d2Cache.set(sourceHash, svg);

                    el.innerHTML = svg;
                    el.dataset.d2Processed = "1";
                    const svgEl = el.querySelector("svg");
                    if (svgEl) {
                        svgEl.style.width = "100%";
                        svgEl.style.height = "auto";
                        svgEl.style.maxWidth = "100%";
                    }
                } catch (e) {
                    console.error(`Error processing D2 diagram at index ${idx + i}:`, e);
                    this.showD2Error(el, e.message);
                    el.dataset.d2Processed = "1";
                } finally {
                    delete el.dataset.d2Rendering;
                }
            }));
            idx += BATCH_SIZE;
            await yieldToMain();
        }
        return true;
    }

    static async enhanceRenderedContent(rootEl, options = {}) {
        if (!rootEl) return;
        const { renderAllSlides = false, force = false } = options;

        if (!force && rootEl.dataset?.webdeckEnhanced === "1") return true;

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

                const div = document.createElement("div");
                div.className = "d2";
                div.dataset.d2Source = source;
                div.innerHTML = `
                    <div class="d2-loading">
                        <svg class="d2-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <circle class="d2-spinner__track" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle>
                            <path class="d2-spinner__head" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3"></path>
                        </svg>
                        <span class="d2-loading__text">Rendering...</span>
                    </div>`;
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
        if (rootEl.dataset) rootEl.dataset.webdeckEnhanced = "1";
        return true;
    }
}