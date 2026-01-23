/**
 * HtmlExportManager
 * Handles exporting the current deck as a fully self-contained HTML file.
 * Similar to build.mjs, creates a single file with all CSS and JS inlined.
 */

import { yieldToMain } from "../core/utils.js";
import { ContentEnhancer } from "./content-enhancer.js";
import { DeckLoader } from "../data/deck-loader.js";

export class HtmlExportManager {
    static _isExporting = false;

    // Order of JS source files (same as build.mjs)
    static JS_BUNDLE_ORDER = [
        // Core utilities and helpers
        "src/core/utils.js",
        "src/core/element-gatherer.js",
        "src/core/asset-loader.js",
        // Data loading and parsing
        "src/data/layout-data.js",
        "src/data/markdown-parser.js",
        "src/data/layout-parser.js",
        "src/data/deck-loader.js",
        // Renderer components
        "src/renderer/notification.js",
        "src/renderer/stage-scaler.js",
        "src/renderer/content-enhancer.js",
        "src/renderer/slide-renderer.js",
        "src/renderer/theme-manager.js",
        "src/renderer/print-manager.js",
        // Engine components
        "src/engine/keyboard-handler.js",
        "src/engine/role-manager.js",
        "src/engine/slide-navigator.js",
        "src/engine/break-manager.js",
        "src/engine/reload-manager.js",
        "src/engine/deck-controller.js",
        // UI components
        "src/ui/ui-actions.js",
        // Entry point
        "deck.js",
    ];

    /**
     * Exports the current deck as a fully self-contained HTML file.
     * All CSS and JS are inlined, making it a true standalone file.
     * @param {HTMLElement} slidesContainer - The container element holding all slides
     * @param {Object} deck - The deck object containing metadata and slides
     * @param {Object} options - Optional parameters
     * @param {string} options.filename - Output filename (default: auto-generated from deck title)
     * @returns {Promise<void>}
     */
    static async handleHtmlExport(slidesContainer, deck, { filename = null } = {}) {
        if (HtmlExportManager._isExporting) return;
        HtmlExportManager._isExporting = true;

        try {
            // 1. Force load all enhancers locally first (so we can snapshot D2)
            console.log('HtmlExport: Loading rich text enhancers...');
            const assetLoader = await import("../core/asset-loader.js").then(m => m.AssetLoader);

            await assetLoader.ensureRichTextEnhancers();
            if (!window.__WEBDECK_D2__?.D2) {
                await assetLoader.ensureD2Loaded();
            }
            if (!window.Prism) {
                try { await assetLoader.ensurePrismLoaded(); } catch (e) { console.error(e); }
            }

            // 2. Enhance all slides (Force D2 generation)
            // We use force:true to ensure diagrams are generated
            const slides = slidesContainer.querySelectorAll('.slide');
            console.log(`HtmlExport: Enhancing ${slides.length} slides...`);

            // Check if D2 is properly loaded
            const d2Loaded = window.__WEBDECK_D2__?.D2;
            console.log(`HtmlExport: D2 loaded:`, !!d2Loaded);

            for (let i = 0; i < slides.length; i++) {
                // Determine if slide has content needing enhancement
                const html = slides[i].innerHTML;
                const needsEnhancement = html.includes('language-') || html.includes('d2');

                if (needsEnhancement) {
                    await ContentEnhancer.enhanceRenderedContent(slides[i], { renderAllSlides: true, force: true });
                    // Give the UI thread a moment to update DOM
                    await new Promise(r => setTimeout(r, 10));
                }
            }

            // Debug: Check D2 state after enhancement
            const d2Blocks = slidesContainer.querySelectorAll('.d2');
            const d2Processed = slidesContainer.querySelectorAll('.d2[data-d2-processed]');
            console.log(`HtmlExport: After enhancement - ${d2Blocks.length} D2 blocks, ${d2Processed.length} processed`);

            // 3. Wait for D2 Rendering to complete
            // This is CRITICAL because D2 is async. We must wait for the DOM to update.
            await HtmlExportManager.waitForD2Rendering(slidesContainer);

            // Debug: Check D2 state after waiting
            const d2ProcessedAfter = slidesContainer.querySelectorAll('.d2[data-d2-processed]');
            console.log(`HtmlExport: After waitForD2Rendering - ${d2ProcessedAfter.length} processed`);

            // 4. Generate the standalone HTML 
            // This will now include the Prism JS library so it can run on load
            const html = await HtmlExportManager.generateStandaloneHtml(deck, slidesContainer);

            // 5. Trigger download
            const outputFilename = filename || HtmlExportManager.generateFilename(deck);
            HtmlExportManager.downloadHtml(html, outputFilename);

        } catch (e) {
            console.warn("HTML export failed:", e);
            throw e;
        } finally {
            HtmlExportManager._isExporting = false;
        }
    }

    /**
     * Waits for D2 diagrams to finish rendering before export.
     */
    static async waitForD2Rendering(slidesContainer) {
        // Find blocks that look like D2 source code OR processed D2 containers
        // If snapshotting hasn't happened yet, they might still be <pre class="d2">
        const d2Potential = slidesContainer.querySelectorAll('.d2');

        if (d2Potential.length === 0) return;

        console.log(`HtmlExport: Waiting for ${d2Potential.length} D2 diagram(s)...`);

        const startTime = Date.now();
        const timeout = 30000;

        while (true) {
            let allReady = true;
            let pending = 0;

            for (const block of d2Potential) {
                // If it's a PRE tag, it hasn't been transformed yet
                if (block.tagName === 'PRE') {
                    allReady = false;
                    pending++;
                    continue;
                }

                // If it's a DIV, check if it has the processed flag
                if (block.tagName === 'DIV' && !block.dataset.d2Processed) {
                    allReady = false;
                    pending++;
                }
            }

            if (allReady) {
                console.log('HtmlExport: All D2 diagrams rendered.');
                break;
            }

            if (Date.now() - startTime > timeout) {
                console.warn(`HtmlExport: Timeout waiting for D2. Exporting current state.`);
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }

    /**
     * Generates a fully self-contained HTML document.
     */
    static async generateStandaloneHtml(deck, slidesContainer) {
        // 1. Get CSS (Vendor + App)
        const mainCss = HtmlExportManager.extractCssFromDocument();
        const vendorCss = await HtmlExportManager.fetchVendorCss(deck);
        const allCss = vendorCss + '\n\n' + mainCss;

        // 2. Get JS (App Bundle + Vendor Libraries)
        const bundledJs = await HtmlExportManager.fetchAndBundleJs();
        const vendorJs = await HtmlExportManager.fetchVendorJs(deck);

        // 3. Escape Data
        const deckJson = JSON.stringify(deck);
        const escapedDeckJson = HtmlExportManager.escapeJsonForHtml(deckJson);

        // 4. Extract Slide HTML (The Snapshot)
        const title = DeckLoader.getDisplayTitle(deck);
        const slidesHtml = HtmlExportManager.extractSlidesHtml(slidesContainer);

        const presenterHideCss = `
/* Hide presenter-only elements in exported HTML */
#presenter, #presenterPanel, #topbar, #controlBar, #editorPanel, #viewerOnlyControls { display: none !important; }
.main { display: flex !important; height: 100vh !important; width: 100vw !important; }
.viewer { width: 100% !important; height: 100% !important; }
`;

        // We add a small init script to trigger Prism on load
        // D2 is not triggered here because we can't bundle the WASM
        const initScript = `
        window.addEventListener('DOMContentLoaded', () => {
            // Re-run Prism if it's available (fixes broken snapshots)
            if (window.Prism) {
                console.log('Export: Re-running Prism highlight...');
                window.Prism.highlightAll();
            }
        });
        `;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${HtmlExportManager.escapeHtml(title)}</title>
    <style>
${presenterHideCss}
${allCss}
    </style>
</head>
<body>
    <div id="app" class="app">
        <main class="main">
            <section id="viewer" class="viewer">
                <div id="stageHost" class="stage-host">
                    <div id="deckStage" class="stage">
                        <div id="stageInner" class="stage__inner">
                            <div id="slidesContainer" class="slides">
${slidesHtml}
                            </div>
                            <div id="slideIndicator" class="slide-indicator">
                                <span id="slideNumber">1</span>/<span id="slideCount">1</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    </div>

    <script type="application/json" id="deckData">${escapedDeckJson}</script>
    
    <!-- Vendor Libraries (Prism) -->
    <script>
${vendorJs}
    </script>

    <!-- App Logic -->
    <script>
${bundledJs}
${initScript}
    </script>
</body>
</html>`;
    }

    /**
     * Fetches vendor JS libraries (specifically Prism) to inline in the export.
     * This ensures code highlighting works even if snapshotting fails.
     */
    static async fetchVendorJs(deck) {
        const deckHtmlText = HtmlExportManager.getDeckHtmlText(deck);

        // Helper to fetch JS with fallback
        const fetchJs = async (localPath, cdnUrl) => {
            try {
                let r = await fetch(localPath);
                if (!r.ok) r = await fetch(cdnUrl);
                if (r.ok) return await r.text();
            } catch (e) {
                console.warn("Failed to fetch JS:", cdnUrl);
            }
            return "";
        };

        let vendorScripts = "";

        // Check if we need Prism
        const needsPrism = /<pre\b[\s\S]*?<code\b/i.test(deckHtmlText) ||
            /```[\s\S]*?\n/.test(deckHtmlText) ||
            /~~~[\s\S]*?\n/.test(deckHtmlText);

        if (needsPrism) {
            console.log("HtmlExport: Inlining Prism.js library...");
            // We use the Autoloader version so it can fetch languages if connected to net, 
            // but the core highlighting works immediately.
            const prismJs = await fetchJs(
                'node_modules/prismjs/prism.js',
                'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js'
            );

            // Also try to fetch python/javascript common languages to bundle them
            const pythonJs = await fetchJs(
                'node_modules/prismjs/components/prism-python.min.js',
                'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-python.min.js'
            );

            const jsJs = await fetchJs(
                'node_modules/prismjs/components/prism-javascript.min.js',
                'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-javascript.min.js'
            );

            vendorScripts += `/* Prism JS */\n${prismJs}\n${pythonJs}\n${jsJs}\n`;
        }

        // Note: We DO NOT bundle D2 here because it requires WASM. 
        // D2 content must be snapshotted.

        return vendorScripts;
    }

    /**
     * Fetches and bundles all JS source files.
     */
    static async fetchAndBundleJs() {
        const parts = [];
        console.log('HtmlExport: Starting JS bundle...');

        for (const filePath of HtmlExportManager.JS_BUNDLE_ORDER) {
            try {
                const response = await fetch(filePath);
                if (!response.ok) continue;

                let src = await response.text();
                const processedSrc = await HtmlExportManager.stripEsmSyntax(src, filePath);
                parts.push(`// ${filePath}\n` + processedSrc);
            } catch (e) {
                console.error(`Could not load ${filePath}:`, e);
            }
        }
        return parts.join('\n\n');
    }

    /**
     * Strips ES module syntax. 
     * Stubs out AssetLoader methods to prevent them from trying to load external files in the exported HTML.
     */
    static async stripEsmSyntax(srcText, filePath) {
        if (!srcText) return "";
        let out = srcText;

        // 1. Handle JSON imports
        const jsonImportRe = /import\s+(\w+)\s+from\s+['"]([^'"]+\.json(?:\?import)?)['"](?:\s+with\s+\{\s*type:\s*['"]json['"]\s*\})?\s*;?/g;
        const jsonImports = [...srcText.matchAll(jsonImportRe)];

        for (const jsonMatch of jsonImports) {
            const [fullMatch, importName, jsonPath] = jsonMatch;
            try {
                let cleanPath = jsonPath.split('?')[0];
                let jsonUrl = cleanPath.startsWith('/') ? cleanPath :
                    filePath.substring(0, filePath.lastIndexOf('/')) + '/' + (cleanPath.startsWith('./') ? cleanPath.substring(2) : cleanPath);

                const jsonResp = await fetch(jsonUrl);
                if (jsonResp.ok) {
                    const jsonContent = await jsonResp.text();
                    out = out.replace(fullMatch, `const ${importName} = ${jsonContent};`);
                }
            } catch (e) {
                out = out.replace(fullMatch, `const ${importName} = {};`);
            }
        }

        // 2. Standard ESM stripping
        out = out.replace(/^\s*import\s+[\s\S]*?;\s*$/gm, "");
        out = out.replace(/^\s*export\s+(class|function|const|let|var)\s+/gm, (_m, kind) => `${kind} `);
        out = out.replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, "");
        out = out.replace(/^\s*export\s+default\s+/gm, "const __default_export__ = ");

        // 3. Stub Dynamic Imports
        out = out.replace(
            /const\s*\{\s*AssetLoader\s*\}\s*=\s*await\s+import\(['"][^'"]*asset-loader\.js['"]\)\s*;?/g,
            () => `/* AssetLoader already available */`
        );

        // 4. Stub AssetLoader methods
        // Since we inline Prism, we stub ensurePrismLoaded to do nothing (it's already there)
        out = out.replace(
            /await\s+import\(['"][^'"]*asset-loader\.js['"]\)\s*\.then\s*\(\s*m\s*=>\s*m\.AssetLoader\.(ensureD2Loaded|ensureRichTextEnhancers|ensureKatexLoaded|ensurePrismLoaded)\(\s*\)\s*\)/g,
            () => `AssetLoader.$1()`
        );

        // 5. Specific Stubs for asset-loader.js
        if (filePath.includes('asset-loader.js')) {
            // KaTeX stub
            out = out.replace(
                /static async ensureKatexLoaded\(\) \{[\s\S]*?\}(?=\s*static async ensureD2Loaded)/,
                () => `static async ensureKatexLoaded() { /* KaTeX inlined */ return; }`
            );
            // D2 stub (Pre-rendered only)
            out = out.replace(
                /static async ensureD2Loaded\(\) \{[\s\S]*?\}(?=\s*static async ensureRichTextEnhancers)/,
                () => `static async ensureD2Loaded() { /* D2 pre-rendered */ return; }`
            );
            // Prism stub (Library inlined via fetchVendorJs)
            out = out.replace(
                /static async ensurePrismLoaded\(\) \{[\s\S]*?\}(?=\s*static async ensureKatexLoaded)/,
                () => `static async ensurePrismLoaded() { /* Prism inlined */ return; }`
            );
        }

        // 6. Stub ContentEnhancer D2 methods (D2 is pre-rendered in exported HTML)
        if (filePath.includes('content-enhancer.js')) {
            // Stub warmupD2 - replace entire method with no-op
            out = out.replace(
                /static async warmupD2\(\) \{[\s\S]*?\n    static async initializeD2/,
                () => `static async warmupD2() { /* D2 pre-rendered in exported HTML */ return; }
    static async initializeD2`
            );
            // Stub initializeD2 - return null (D2 instance not available)
            out = out.replace(
                /static async initializeD2\([^)]*\) \{[\s\S]*?\n    static showD2Error/,
                () => `static async initializeD2() { /* D2 pre-rendered in exported HTML */ return null; }
    static showD2Error`
            );
            // Stub renderD2Diagrams - return true (skip rendering)
            out = out.replace(
                /static async renderD2Diagrams\([^)]*\) \{[\s\S]*?\n    static async enhanceRenderedContent/,
                () => `static async renderD2Diagrams() { /* D2 pre-rendered in exported HTML */ return true; }
    static async enhanceRenderedContent`
            );
        }

        // 7. Stub deck.js D2 warmup call (skip D2 initialization in exported HTML)
        if (filePath.includes('deck.js')) {
            // Comment out the warmupD2 call
            out = out.replace(
                /ContentEnhancer\.warmupD2\(\);/,
                () => `/* ContentEnhancer.warmupD2() - D2 pre-rendered in exported HTML */`
            );
        }

        return out;
    }

    /**
     * CSS Extraction & Filtering
     */
    static extractCssFromDocument() {
        const cssParts = [];
        for (const sheet of document.styleSheets) {
            try {
                if (sheet.cssRules) {
                    for (const rule of sheet.cssRules) {
                        const css = rule.cssText;
                        if (css && !css.includes('@vite/') && !css.includes('import.meta.hot')) {
                            const filtered = css.replace(/\b[\w-]+:\s*;/g, '').trim();
                            if (filtered) cssParts.push(filtered);
                        }
                    }
                }
            } catch (e) { console.debug('CSS Access error:', e); }
        }
        return cssParts.join('\n\n');
    }

    static filterViteArtifactsFromCss(cssText) {
        if (!cssText) return '';
        const viteCssMatch = cssText.match(/const\s+__vite__css\s*=\s*"(.*)";?\s*(?:__vite__updateStyle|\/\/)/s);
        if (viteCssMatch) {
            return viteCssMatch[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        }
        return cssText.split('\n').filter(line => {
            const t = line.trim();
            return !t.includes('import ') && !t.includes('/@vite/') && !t.includes('__vite__');
        }).join('\n');
    }

    /**
     * Fetches vendor CSS with CDN fallback
     */
    static async fetchVendorCss(deck) {
        const parts = [];
        const deckHtmlText = HtmlExportManager.getDeckHtmlText(deck);

        const fetchCssWithFallback = async (localPath, cdnUrl, name) => {
            try {
                let response = await fetch(localPath);
                if (!response.ok) response = await fetch(cdnUrl);

                if (response.ok) {
                    let css = await response.text();
                    css = HtmlExportManager.filterViteArtifactsFromCss(css);
                    return `/* ${name} CSS */\n${css}`;
                }
            } catch (e) { console.warn(`Error loading ${name} CSS`); }
            return '';
        };

        if (/<pre\b[\s\S]*?<code\b/i.test(deckHtmlText) || /```/.test(deckHtmlText)) {
            parts.push(await fetchCssWithFallback(
                'node_modules/prismjs/themes/prism-tomorrow.css',
                'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css',
                'Prism'
            ));
        }

        if (/(\$\$|\\\(|\\begin)/.test(deckHtmlText)) {
            parts.push(await fetchCssWithFallback(
                'node_modules/katex/dist/katex.min.css',
                'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css',
                'KaTeX'
            ));
        }

        parts.push(`
/* D2 Diagram Styles (Standalone) */
.d2 { display: flex; justify-content: center; width: 100%; margin: 1rem 0; }
.d2 svg { max-width: 100%; height: auto; background-color: transparent; }
`);

        return parts.join('\n\n');
    }

    static extractSlidesHtml(slidesContainer) {
        if (!slidesContainer) return '<div class="slide"></div>';
        const slides = slidesContainer.querySelectorAll('.slide');
        return Array.from(slides).map(slide => slide.outerHTML).join('\n');
    }

    static getDeckHtmlText(deck) {
        if (!deck?.slides) return '';
        return deck.slides.map(s =>
            Object.values(s.areas || {}).join('') + (s.notes || '')
        ).join('\n');
    }

    static generateFilename(deck) {
        const title = DeckLoader.getDisplayTitle(deck);
        return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'deck';
    }

    static downloadHtml(html, filename) {
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    static escapeJsonForHtml(json) {
        return json.replace(/</g, '\\u003C').replace(/<!--/g, '\\u003C!--');
    }

    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}