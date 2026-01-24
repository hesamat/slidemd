/**
 * HtmlExportManager
 * Handles exporting the current deck as a fully self-contained HTML file.
 * Similar to build.mjs, creates a single file with all CSS and JS inlined.
 */

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
    static async handleHtmlExport(slidesContainer, deck, { filename = null, includeSlideSnapshot = false, minify = true, useCdn = true } = {}) {
        if (HtmlExportManager._isExporting) return;
        HtmlExportManager._isExporting = true;

        try {
            // Generate the standalone HTML (runtime enhancers run in exported file)
            const html = await HtmlExportManager.generateStandaloneHtml(deck, slidesContainer, { includeSlideSnapshot, minify, useCdn });

            // Trigger download
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
     * Generates a fully self-contained HTML document.
     */
    static async generateStandaloneHtml(deck, slidesContainer, { includeSlideSnapshot = false, minify = true, useCdn = true } = {}) {
        // 1. Get CSS (Vendor + App)
        const mainCss = HtmlExportManager.extractCssFromDocument();
        const vendorCssData = await HtmlExportManager.fetchVendorCss(deck, useCdn);
        let allCss = vendorCssData.css + '\n\n' + mainCss;
        if (minify) allCss = HtmlExportManager.minifyCss(allCss);

        // 2. Get JS (App Bundle + Vendor Libraries)
        let bundledJs = await HtmlExportManager.fetchAndBundleJs();
        let vendorJs = useCdn ? '' : await HtmlExportManager.fetchVendorJs(deck);
        const vendorScripts = useCdn ? HtmlExportManager.generateCdnScripts(deck) : '';
        if (minify) {
            bundledJs = HtmlExportManager.minifyJs(bundledJs);
            if (vendorJs) vendorJs = HtmlExportManager.minifyJs(vendorJs);
        }

        // 3. Escape Data
        const deckJson = JSON.stringify(deck);
        const escapedDeckJson = HtmlExportManager.escapeJsonForHtml(deckJson);

        // 4. Extract Slide HTML (The Snapshot)
        const title = DeckLoader.getDisplayTitle(deck);
        const slidesHtml = includeSlideSnapshot ? HtmlExportManager.extractSlidesHtml(slidesContainer) : "";

        const presenterHideCss = `
/* Hide presenter-only elements in exported HTML */
#presenter, #presenterPanel, #topbar, #controlBar, #editorPanel, #viewerOnlyControls { display: none !important; }
.main { display: flex !important; height: 100vh !important; width: 100vw !important; }
.viewer { width: 100% !important; height: 100% !important; }
`;

        // We add a small init script to trigger Prism on load
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
${vendorCssData.links}
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
    
    <!-- Vendor Libraries -->
${vendorScripts}
${vendorJs ? `    <script>\n${vendorJs}\n    </script>` : ''}

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

        // Inline Mermaid for runtime rendering in exported HTML
        const needsMermaid = /\bmermaid\b/i.test(deckHtmlText) || /(```|~~~)\s*mermaid/i.test(deckHtmlText);
        if (needsMermaid) {
            console.log("HtmlExport: Inlining Mermaid.js library...");
            const mermaidJs = await fetchJs(
                'node_modules/mermaid/dist/mermaid.min.js',
                'https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js'
            );
            vendorScripts += `/* Mermaid JS */\n${mermaidJs}\n`;
        }

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
                parts.push(processedSrc);
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

        // 3. Replace dynamic imports of AssetLoader with global access
        out = out.replace(
            /const\s*\{\s*AssetLoader\s*\}\s*=\s*await\s+import\(['"][^'"]*asset-loader\.js['"]\)\s*;?/g,
            () => `const { AssetLoader } = window;`
        );
        out = out.replace(
            /const\s+(\w+)\s*=\s*await\s+import\(['"][^'"]*asset-loader\.js['"]\)\s*\.then\s*\(\s*m\s*=>\s*m\.AssetLoader\s*\)\s*;?/g,
            (_m, varName) => `const ${varName} = window.AssetLoader;`
        );
        out = out.replace(
            /\(\s*await\s+import\(['"][^'"]*asset-loader\.js['"]\)\s*\)\.AssetLoader/g,
            () => `window.AssetLoader`
        );
        out = out.replace(
            /import\(['"][^'"]*asset-loader\.js['"]\)\s*\.then\s*\(\s*\(\s*\{\s*AssetLoader\s*\}\s*\)\s*=>\s*AssetLoader\s*\)/g,
            () => `Promise.resolve(window.AssetLoader)`
        );
        out = out.replace(
            /import\(['"][^'"]*asset-loader\.js['"]\)\s*\.then\s*\(\s*m\s*=>\s*m\.AssetLoader\s*\)/g,
            () => `Promise.resolve(window.AssetLoader)`
        );

        // 4. Stub AssetLoader methods
        // Since we inline Prism, we stub ensurePrismLoaded to do nothing (it's already there)
        out = out.replace(
            /await\s+import\(['"][^'"]*asset-loader\.js['"]\)\s*\.then\s*\(\s*m\s*=>\s*m\.AssetLoader\.(ensureMermaidLoaded|ensureRichTextEnhancers|ensureKatexLoaded|ensurePrismLoaded)\(\s*\)\s*\)/g,
            () => `AssetLoader.$1()`
        );

        // 5. Specific Stubs for asset-loader.js
        if (filePath.includes('asset-loader.js')) {
            // KaTeX stub
            out = out.replace(
                /static async ensureKatexLoaded\(\) \{[\s\S]*?\}(?=\s*static async ensureMermaidLoaded)/,
                () => `static async ensureKatexLoaded() { /* KaTeX inlined */ return; }`
            );
            // Prism stub (Library inlined via fetchVendorJs)
            out = out.replace(
                /static async ensurePrismLoaded\(\) \{[\s\S]*?\}(?=\s*static async ensureKatexLoaded)/,
                () => `static async ensurePrismLoaded() { /* Prism inlined */ return; }`
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

    static minifyCss(cssText) {
        if (!cssText) return '';
        return cssText
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\s+/g, ' ')
            .replace(/\s*([:;{},])\s*/g, '$1')
            .replace(/;}/g, '}')
            .trim();
    }

    static minifyJs(jsText) {
        if (!jsText) return '';
        // Safe minify: only trim trailing whitespace and collapse extra blank lines.
        // Removing comments here can break code (e.g., tokens inside strings/regex).
        const trimmed = jsText
            .split('\n')
            .map(line => line.trimEnd())
            .join('\n');
        return trimmed.replace(/\n{3,}/g, '\n\n').trim();
    }

    /**
     * Generates CDN script tags for vendor libraries
     */
    static generateCdnScripts(deck) {
        const deckHtmlText = HtmlExportManager.getDeckHtmlText(deck);
        const scripts = [];

        const needsPrism = /<pre\b[\s\S]*?<code\b/i.test(deckHtmlText) ||
            /```[\s\S]*?\n/.test(deckHtmlText) ||
            /~~~[\s\S]*?\n/.test(deckHtmlText);

        if (needsPrism) {
            scripts.push('    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>');
            scripts.push('    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-python.min.js"></script>');
            scripts.push('    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-javascript.min.js"></script>');
        }

        const needsMermaid = /\bmermaid\b/i.test(deckHtmlText) || /(```|~~~)\s*mermaid/i.test(deckHtmlText);
        if (needsMermaid) {
            scripts.push('    <script src="https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js"></script>');
        }

        return scripts.join('\n');
    }

    /**
     * Fetches vendor CSS with CDN fallback
     * Returns an object with { links: string, css: string }
     */
    static async fetchVendorCss(deck, useCdn = false) {
        const links = [];
        const cssParts = [];
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
            if (useCdn) {
                links.push('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css">');
            } else {
                cssParts.push(await fetchCssWithFallback(
                    'node_modules/prismjs/themes/prism-tomorrow.css',
                    'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css',
                    'Prism'
                ));
            }
        }

        if (/(\$\$|\\\(|\\begin)/.test(deckHtmlText)) {
            if (useCdn) {
                links.push('<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">');
            } else {
                cssParts.push(await fetchCssWithFallback(
                    'node_modules/katex/dist/katex.min.css',
                    'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css',
                    'KaTeX'
                ));
            }
        }

        cssParts.push(`
/* Mermaid Diagram Styles (Standalone) */
.mermaid { display: flex; justify-content: center; width: 100%; margin: 1rem 0; }
.mermaid svg { max-width: 100%; height: auto; background-color: transparent; }
`);

        return {
            links: links.join('\n'),
            css: cssParts.join('\n\n')
        };
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