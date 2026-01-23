import fs from "node:fs";
import path from "node:path";
import parseDeckMarkdown from "./md-to-deck.mjs";
import { minify } from "terser";

const root = process.cwd();
const distDir = path.join(root, "dist");
const inIndex = path.join(root, "index.html");
const inCss = path.join(root, "styles.css");
const inJs = path.join(root, "deck.js");
const prismCssPath = path.join(root, "node_modules", "prismjs", "themes", "prism.css");

const args = process.argv.slice(2);
const inlineAssets = !args.includes("--no-inline-assets");

/**
 * Resolve deck file path from arguments.
 *
 * Usage: node build.mjs [deck-path] [--no-inline-assets]
 *
 * Arguments:
 *   deck-path - Path to the deck file. Can be:
 *               - A filename relative to the project root (e.g., "deck.md", "presentation/deck.md")
 *               - An absolute path (e.g., "/path/to/deck.md" on Unix, "C:\\path\\to\\deck.md" on Windows)
 *               - Defaults to "deck.md" if not provided
 *   --no-inline-assets - Skip inlining images as data URIs (keeps external image references)
 *
 * Examples:
 *   node build.mjs                          # Use default deck.md
 *   node build.mjs my-deck.md              # Use my-deck.md from project root
 *   node build.mjs ./presentations/deck.md # Use relative path from project root
 *   node build.mjs /absolute/path/deck.md  # Use absolute path
 */
function resolveDeckPath() {
    const deckArg = args.find(arg => !arg.startsWith("--"));

    if (!deckArg) {
        return path.join(root, "deck.md");
    }

    // Check if it's an absolute path
    if (path.isAbsolute(deckArg)) {
        return deckArg;
    }

    // Otherwise, resolve relative to project root
    return path.join(root, deckArg);
}

const inDeck = resolveDeckPath();
const outHtml = path.join(distDir, `${path.basename(inDeck, path.extname(inDeck))}.html`);

function readTextIfExists(filePath) {
    if (!fs.existsSync(filePath)) return "";
    return fs.readFileSync(filePath, "utf8");
}

function isRemoteCssImport(specifier) {
    const s = String(specifier || "").trim().toLowerCase();
    return s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:");
}

function resolveCssImports(entryFilePath, { _seen = new Set() } = {}) {
    const absEntry = path.resolve(entryFilePath);
    if (_seen.has(absEntry)) return "";
    _seen.add(absEntry);

    const src = fs.readFileSync(absEntry, "utf8");
    const dir = path.dirname(absEntry);

    // Very small, dependency-free @import resolver.
    // Supports: @import "./file.css"; and @import url("./file.css");
    // Supports basic media queries: @import "./file.css" print;
    const importRe = /^\s*@import\s+(?:url\()?['"]([^'"]+)['"]\)?\s*([^;]*);\s*$/gm;

    return src.replace(importRe, (full, specifier, mediaRaw) => {
        if (isRemoteCssImport(specifier)) return full;

        const importedAbs = path.resolve(dir, specifier);
        if (!fs.existsSync(importedAbs)) return full;

        const importedCss = resolveCssImports(importedAbs, { _seen });
        const media = String(mediaRaw || "").trim();
        const banner = `/* @import ${specifier}${media ? " " + media : ""} */`;

        if (!media) return `${banner}\n${importedCss}`;

        // Avoid changing semantics for less-common @import forms.
        if (/^(layer|supports)\b/i.test(media)) return full;

        return `${banner}\n@media ${media} {\n${importedCss}\n}`;
    });
}

function fontMimeForExt(ext) {
    switch (ext.toLowerCase()) {
        case ".woff2":
            return "font/woff2";
        case ".woff":
            return "font/woff";
        case ".ttf":
            return "font/ttf";
        case ".otf":
            return "font/otf";
        default:
            return null;
    }
}

function toDataUriWithMime(filePath, mime) {
    const buf = fs.readFileSync(filePath);
    const b64 = buf.toString("base64");
    return `data:${mime};base64,${b64}`;
}

function inlineKatexFonts(cssText) {
    if (!cssText) return cssText;

    // katex.min.css uses url(fonts/<file>) relative references.
    return cssText.replace(/url\((?:'|")?fonts\/([^'"\)]+)(?:'|")?\)/g, (match, fileName) => {
        const abs = path.join(root, "node_modules", "katex", "dist", "fonts", fileName);
        if (!fs.existsSync(abs)) return match;
        const mime = fontMimeForExt(path.extname(fileName));
        if (!mime) return match;
        try {
            const uri = toDataUriWithMime(abs, mime);
            return `url(${uri})`;
        } catch {
            return match;
        }
    });
}

function escapeInlineScriptText(jsText) {
    if (!jsText) return jsText;
    // Prevent literal </script from terminating the script tag.
    return jsText.replace(/<\/script/gi, "<\\/script");
}

function escapeJsonForHtmlScriptTag(jsonText) {
    if (!jsonText) return jsonText;
    // Prevent '</script' and '<!--' sequences from breaking out of <script type="application/json">.
    // JSON.parse will decode \u003C back to '<'.
    return jsonText.replace(/</g, "\\u003C");
}

function mimeForExt(ext) {
    switch (ext.toLowerCase()) {
        case ".png":
            return "image/png";
        case ".jpg":
        case ".jpeg":
            return "image/jpeg";
        case ".gif":
            return "image/gif";
        case ".webp":
            return "image/webp";
        case ".svg":
            return "image/svg+xml";
        default:
            return null;
    }
}

function toDataUri(filePath) {
    const ext = path.extname(filePath);
    const mime = mimeForExt(ext);
    if (!mime) return null;
    const buf = fs.readFileSync(filePath);
    const b64 = buf.toString("base64");
    return `data:${mime};base64,${b64}`;
}

function inlineLocalImagesInHtml(htmlText) {
    if (!htmlText) return htmlText;

    // Replace src="images/..." and src='images/...'
    return htmlText.replace(/\s(src|poster)=(['"])(images\/[^'">]+)\2/gi, (m, attr, q, rel) => {
        const abs = path.join(root, rel);
        if (!fs.existsSync(abs)) return m;
        const uri = toDataUri(abs);
        if (!uri) return m;
        return ` ${attr}=${q}${uri}${q}`;
    });
}

function inlineImagesInDeck(deck) {
    if (!deck || typeof deck !== "object") return deck;
    if (!Array.isArray(deck.slides)) return deck;

    const slides = deck.slides.map((s) => {
        const areas = s && typeof s === "object" && s.areas && typeof s.areas === "object" ? s.areas : {};
        const outAreas = {};
        for (const [k, html] of Object.entries(areas)) {
            outAreas[k] = inlineLocalImagesInHtml(html);
        }

        // Inline background images if they reference local files
        let background = s.background || "";
        if (background && background.includes("url(")) {
            background = background.replace(/url\((['"]?)([^'")\s]+)\1\)/g, (m, q, url) => {
                // Check if it's a local path (starts with images/ or relative path)
                if (url.startsWith("images/") || (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("data:"))) {
                    const abs = path.join(root, url);
                    if (fs.existsSync(abs)) {
                        const uri = toDataUri(abs);
                        if (uri) return `url(${uri})`;
                    }
                }
                return m;
            });
        }

        return { ...s, areas: outAreas, background };
    });

    return { ...deck, slides };
}

if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

// Validate deck file exists
if (!fs.existsSync(inDeck)) {
    console.error(`Error: Deck file not found: ${inDeck}`);
    process.exit(1);
}

console.log(`Building from: ${path.relative(root, inDeck)}`);

let html = fs.readFileSync(inIndex, "utf8");
let css = resolveCssImports(inCss);
if (fs.existsSync(prismCssPath)) {
    try {
        const prismCss = fs.readFileSync(prismCssPath, "utf8");
        css += `\n\n/* Prism default theme (inlined for dist) */\n${prismCss}`;
    } catch {
        // keep going without prism theme
    }
}
const js = fs.readFileSync(inJs, "utf8");

// Load and parse the deck
let deck;
const deckMd = fs.readFileSync(inDeck, "utf8");
deck = parseDeckMarkdown(deckMd);

function decodeHtmlEntities(s) {
    return String(s || "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

async function renderD2BlocksInHtml(htmlText, d2, { saltPrefix = "webdeck_d2", startIndex = 0 } = {}) {
    const html = String(htmlText || "");
    const re = /<pre>\s*<code[^>]*class=["'][^"']*(?:language|lang)-d2[^"']*["'][^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi;
    let out = "";
    let last = 0;
    let i = startIndex;

    re.lastIndex = 0;
    let m;
    while ((m = re.exec(html))) {
        out += html.slice(last, m.index);
        last = re.lastIndex;

        const src = decodeHtmlEntities(m[1]).trim();
        const salt = `${saltPrefix}_${i++}`;
        try {
            const compiled = await d2.compile(src, {
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

            out += `<div class="d2">${svg || ""}</div>`;
        } catch (e) {
            out += `<div class="d2"><pre style="color:#dc2626; white-space:pre-wrap;">D2 render failed: ${String(e)}</pre></div>`;
        }
    }

    out += html.slice(last);
    return { html: out, nextIndex: i };
}

async function preRenderD2InDeck(d) {
    if (!d || typeof d !== "object" || !Array.isArray(d.slides)) return d;

    const { D2 } = await import("@terrastruct/d2");
    const d2 = new D2();

    // D2 Node runtime spins up a worker_threads Worker and does not currently
    // expose a public dispose(). We terminate the worker explicitly so the
    // Node process can exit when the build is done.
    try {
        let idx = 0;

        const slides = [];
        for (const slide of d.slides) {
            if (!slide || typeof slide !== "object" || !slide.areas || typeof slide.areas !== "object") {
                slides.push(slide);
                continue;
            }

            const outAreas = {};
            for (const [k, html] of Object.entries(slide.areas)) {
                const r = await renderD2BlocksInHtml(html, d2, { startIndex: idx });
                idx = r.nextIndex;
                outAreas[k] = r.html;
            }

            slides.push({ ...slide, areas: outAreas });
        }

        return { ...d, slides };
    } finally {
        try {
            if (d2 && d2.worker && typeof d2.worker.terminate === "function") {
                await d2.worker.terminate();
            }
        } catch {
            // ignore
        }
    }
}

// Optional vendor assets (PrismJS + KaTeX).
// These get inlined into dist/deck.html, but we only inline what the current deck actually uses.
function getDeckHtmlText(d) {
    if (!d || typeof d !== "object" || !Array.isArray(d.slides)) return "";
    const chunks = [];
    for (const slide of d.slides) {
        if (!slide || typeof slide !== "object") continue;
        if (slide.areas && typeof slide.areas === "object") {
            for (const v of Object.values(slide.areas)) {
                if (typeof v === "string" && v) chunks.push(v);
            }
        }
        if (typeof slide.notes === "string" && slide.notes) chunks.push(slide.notes);
        if (typeof slide.background === "string" && slide.background) chunks.push(slide.background);
    }
    return chunks.join("\n");
}

let deckHtmlText = getDeckHtmlText(deck);

// Check if deck uses D2 diagrams and pre-render them
const usesD2 = /(?:language-d2|lang-d2)/i.test(deckHtmlText);
if (usesD2) {
    deck = await preRenderD2InDeck(deck);
    deckHtmlText = getDeckHtmlText(deck);
}

// Inline images if requested
if (inlineAssets) {
    deck = inlineImagesInDeck(deck);
    deckHtmlText = getDeckHtmlText(deck);
}

const usesPrism = /<pre\b[\s\S]*?<code\b/i.test(deckHtmlText);
const usesKatex = /(\$\$[\s\S]+?\$\$)|\\\(|\\\[|\\begin\{(?:equation|align|gather|matrix|cases)/.test(deckHtmlText);

function unique(arr) {
    return Array.from(new Set(arr));
}

function prismComponentForLang(lang) {
    const l = String(lang || "").toLowerCase();
    const map = {
        js: "javascript",
        javascript: "javascript",
        ts: "typescript",
        typescript: "typescript",
        json: "json",
        bash: "bash",
        sh: "bash",
        shell: "bash",
        powershell: "powershell",
        ps: "powershell",
        python: "python",
        py: "python",
        java: "java",
        c: "c",
        cpp: "cpp",
        "c++": "cpp",
        css: "css",
        html: "markup",
        xml: "markup",
        markup: "markup",
        clike: "clike",
    };
    return map[l] || null;
}

function prismDependencies(component) {
    // Minimal dependency closure for the components we ship.
    switch (component) {
        case "typescript":
            return ["clike", "javascript", "typescript"];
        case "javascript":
            return ["clike", "javascript"];
        case "java":
            return ["clike", "java"];
        case "c":
            return ["clike", "c"];
        case "cpp":
            return ["clike", "cpp"];
        default:
            return [component];
    }
}

function detectPrismComponentsFromDeck(htmlText) {
    const langs = [];
    const re = /(?:lang|language)-([a-zA-Z0-9_+\-]+)/g;
    let m;
    while ((m = re.exec(htmlText))) {
        const comp = prismComponentForLang(m[1]);
        if (comp) langs.push(comp);
    }

    // If we saw code blocks but couldn't detect any language, keep Prism core only.
    const comps = unique(langs.flatMap((c) => prismDependencies(c)));
    return comps;
}

// Build vendor CSS/JS based on detected usage
let vendorCss = "";
const vendorJsParts = [];

if (usesPrism || usesKatex) {
    const vendorCssParts = [];

    if (usesPrism) {
        vendorCssParts.push(readTextIfExists(path.join(root, "node_modules", "prismjs", "themes", "prism-tomorrow.css")));

        const prismCore = readTextIfExists(path.join(root, "node_modules", "prismjs", "prism.js"));
        if (prismCore) vendorJsParts.push(prismCore);

        const comps = detectPrismComponentsFromDeck(deckHtmlText);
        for (const c of comps) {
            const file = path.join(root, "node_modules", "prismjs", "components", `prism-${c}.min.js`);
            const src = readTextIfExists(file);
            if (src) vendorJsParts.push(src);
        }
    }

    if (usesKatex) {
        const katexCssRaw = readTextIfExists(path.join(root, "node_modules", "katex", "dist", "katex.min.css"));
        const katexCss = inlineKatexFonts(katexCssRaw);
        if (katexCss) vendorCssParts.push(katexCss);

        const katexCore = readTextIfExists(path.join(root, "node_modules", "katex", "dist", "katex.min.js"));
        const katexAutoRender = readTextIfExists(
            path.join(root, "node_modules", "katex", "dist", "contrib", "auto-render.min.js")
        );
        if (katexCore) vendorJsParts.push(katexCore);
        if (katexAutoRender) vendorJsParts.push(katexAutoRender);
    }

    vendorCss = vendorCssParts.filter(Boolean).join("\n\n");
}

const deckJson = JSON.stringify(deck);
const deckTag = `<script type="application/json" id="deckData">${escapeJsonForHtmlScriptTag(deckJson)}</script>`;

// --- Inline local project JS (simple ESM bundling) ---
function stripEsmSyntax(srcText, filePath) {
    if (!srcText) return "";
    let out = srcText;

    // Handle JSON imports: find and inline them
    // Pattern: import NAME from 'path.json' with { type: 'json' };
    const jsonImportRe = /import\s+(\w+)\s+from\s+['"]([^'"]+\.json)['"]\s+with\s+\{\s*type:\s*['"]json['"]\s*\}\s*;?/g;
    out = out.replace(jsonImportRe, (_match, importName, jsonPath) => {
        const resolvedPath = path.resolve(path.dirname(filePath), jsonPath);
        try {
            const jsonContent = fs.readFileSync(resolvedPath, "utf8");
            const jsonObj = JSON.parse(jsonContent);
            // Inline the JSON as a const declaration
            return `const ${importName} = ${JSON.stringify(jsonObj)};`;
        } catch (e) {
            console.warn(`Warning: Failed to inline JSON import ${jsonPath}: ${e.message}`);
            return `const ${importName} = null; /* Failed to inline JSON import */`;
        }
    });

    // Remove other import lines (including those with 'with' clause for JSON imports)
    // Matches from 'import' to the next semicolon, handling multi-line imports
    out = out.replace(/^\s*import\s+[\s\S]*?;\s*$/gm, "");
    // Convert named exports to plain declarations
    out = out.replace(/^\s*export\s+(class|function|const|let|var)\s+/gm, (m, kind) => `${kind} `);
    // Remove 'export {' re-exports (not used in this project)
    out = out.replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, "");
    // Convert 'export default' to plain assignment (rare; not used here)
    out = out.replace(/^\s*export\s+default\s+/gm, "const __default_export__ = ");

    // Handle internal dynamic imports - since all modules are bundled together,
    // we replace these with direct references to the already-available classes

    // Pattern: const { AssetLoader } = await import("../core/asset-loader.js")
    out = out.replace(
        /const\s*\{\s*AssetLoader\s*\}\s*=\s*await\s+import\(['"](\.\.\/|\.\/)?core\/asset-loader\.js['"]\)/g,
        () => `{ AssetLoader } = { AssetLoader }`
    );
    // Clean up the broken destructuring syntax above to just access AssetLoader directly
    out = out.replace(
        /\{\s*AssetLoader\s*\}\s*=\s*\{\s*AssetLoader\s*\}/g,
        () => `/* AssetLoader already available */`
    );

    // Pattern: import("../core/asset-loader.js") - standalone import
    out = out.replace(
        /import\(['"](\.\.\/|\.\/)?core\/asset-loader\.js['"]\)/g,
        () => `Promise.resolve({ AssetLoader })`
    );

    // Pattern: import("../core/asset-loader.js").then(m => m.AssetLoader)
    out = out.replace(
        /import\(['"](\.\.\/|\.\/)?core\/asset-loader\.js['"]\)\.then\((\w+)\s*=>\s*\2\.AssetLoader/g,
        () => `Promise.resolve(AssetLoader)`
    );

    // Pattern: await import("../core/asset-loader.js").then(m => m.AssetLoader.ensureD2Loaded())
    out = out.replace(
        /await\s+import\(['"](\.\.\/|\.\/)?core\/asset-loader\.js['"]\)\.then\((\w+)\s*=>\s*\2\.AssetLoader\.ensureD2Loaded\(\)\)/g,
        () => `AssetLoader.ensureD2Loaded()`
    );

    // For dist builds, stub out the problematic import() calls in AssetLoader methods
    // by replacing the entire method with a no-op version

    // Stub ensureKatexLoaded method - replace entire method with no-op
    // Match from "static async ensureKatexLoaded() {" to "static async ensureD2Loaded() {"
    out = out.replace(
        /static async ensureKatexLoaded\(\) \{[\s\S]*?\}(?=\s*static async ensureD2Loaded)/,
        () => `static async ensureKatexLoaded() { /* KaTeX inlined in dist build */ return; }`
    );

    // Stub ensureD2Loaded method - replace entire method with no-op
    // Match from "static async ensureD2Loaded() {" to "static async ensureRichTextEnhancers() {"
    out = out.replace(
        /static async ensureD2Loaded\(\) \{[\s\S]*?\}(?=\s*static async ensureRichTextEnhancers)/,
        () => `static async ensureD2Loaded() { /* D2 pre-rendered in dist build */ return; }`
    );

    // Also stub ensurePrismLoaded and ensureMarkdownItLoaded for consistency
    out = out.replace(
        /static async ensurePrismLoaded\(\) \{[\s\S]*?\}(?=\s*static async ensureKatexLoaded)/,
        () => `static async ensurePrismLoaded() { /* Prism inlined in dist build */ return; }`
    );

    out = out.replace(
        /static async ensureMarkdownItLoaded\(\) \{[\s\S]*?\}(?=\s*static async ensurePrismLoaded)/,
        () => `static async ensureMarkdownItLoaded() { /* markdown-it not needed in dist build */ return; }`
    );

    // Stub ContentEnhancer methods that try to access D2 at runtime
    // Since D2 is pre-rendered in dist builds, these should not run
    if (filePath.includes('content-enhancer.js')) {
        // Stub warmupD2 - simpler pattern that doesn't depend on exact indentation
        // Replace from method start to the next method's start
        out = out.replace(
            /static async warmupD2\(\) \{[\s\S]*?\n    static async initializeD2/,
            () => `static async warmupD2() { /* D2 pre-rendered in dist build */ return; }\n    static async initializeD2`
        );
        // Stub initializeD2 - replace from method start to showD2Error
        out = out.replace(
            /static async initializeD2\([^)]*\) \{[\s\S]*?\n    static showD2Error/,
            () => `static async initializeD2() { /* D2 pre-rendered in dist build */ return null; }\n    static showD2Error`
        );
    }

    // Remove auto-redirect to presenter mode in dist builds
    // In exported HTML, we don't want to auto-redirect to ?role=presenter
    if (filePath.includes('deck.js')) {
        // Remove the auto-redirect block entirely
        out = out.replace(
            // Match from "// Auto-redirect checks" comment to the "return;" statement
            /\/\/ Auto-redirect checks \(optional\)[\s\S]*?window\.location\.href = url\.toString\(\);[\s\S]*?return;[\s\S]*?\}/,
            () => `/* Auto-redirect disabled in dist build */`
        );
    }

    return out;
}

function buildBundleJs() {
    const order = [
        // Core utilities and helpers
        path.join(root, "src", "core", "utils.js"),
        path.join(root, "src", "core", "element-gatherer.js"),
        path.join(root, "src", "core", "asset-loader.js"),
        // Data loading and parsing
        path.join(root, "src", "data", "layout-data.js"),
        path.join(root, "src", "data", "markdown-parser.js"),
        path.join(root, "src", "data", "layout-parser.js"),
        path.join(root, "src", "data", "deck-loader.js"),
        // Renderer components
        path.join(root, "src", "renderer", "notification.js"),
        path.join(root, "src", "renderer", "stage-scaler.js"),
        path.join(root, "src", "renderer", "content-enhancer.js"),
        path.join(root, "src", "renderer", "slide-renderer.js"),
        path.join(root, "src", "renderer", "theme-manager.js"),
        path.join(root, "src", "renderer", "print-manager.js"),
        // Engine components
        path.join(root, "src", "engine", "keyboard-handler.js"),
        path.join(root, "src", "engine", "role-manager.js"),
        path.join(root, "src", "engine", "slide-navigator.js"),
        path.join(root, "src", "engine", "break-manager.js"),
        path.join(root, "src", "engine", "reload-manager.js"),
        path.join(root, "src", "engine", "deck-controller.js"),
        // UI components
        path.join(root, "src", "ui", "ui-actions.js"),
        // Entry point
        path.join(root, "deck.js"),
    ];

    const parts = order
        .filter((p) => fs.existsSync(p))
        .map((p) => {
            const src = fs.readFileSync(p, "utf8");
            return `// ${path.relative(root, p)}\n` + stripEsmSyntax(src, p);
        });

    // Don't wrap in IIFE - deck.js already has one at the end
    return parts.join("\n\n");
}

const bundleJs = buildBundleJs();

async function processJs() {
    // Minify your local bundle
    const bundleResult = await minify(bundleJs);
    const minifiedBundleJs = bundleResult.code;

    // Minify vendor scripts safely
    const minifiedVendorScripts = [];

    // This will now work because vendorJsParts is defined in the outer scope
    for (const src of vendorJsParts) {
        if (!src) continue; // Safety check
        const result = await minify(src);
        minifiedVendorScripts.push(
            `<script>\n${escapeInlineScriptText(result.code)}\n</script>`
        );
    }

    return {
        bundle: minifiedBundleJs,
        vendor: minifiedVendorScripts.join("\n")
    };
}

// Inline CSS
html = html.replace(
    /<link\s+rel="stylesheet"\s+href="styles\.css"\s*\/?\s*>/i,
    () => `<style>\n${vendorCss}\n\n${css}\n</style>`
);

// Always remove presenter mode elements from the output
// Remove elements with id 'presenterPanel', 'viewerOnlyControls', 'controlBar' from the HTML
// This function handles nested tags correctly by counting depth
function removeElementById(htmlText, elementId) {
    const idRegex = new RegExp(`<([a-zA-Z0-9]+)([^>]*\\bid=["']${elementId}["'][^>]*)>`, "gi");
    let result = htmlText;

    let match;
    while ((match = idRegex.exec(htmlText)) !== null) {
        const fullTag = match[0];
        const tagName = match[1];
        const tagStart = match.index;
        const tagEnd = tagStart + fullTag.length;

        const openTag = `<${tagName}`;
        const closeTag = `</${tagName}>`;

        // Find the matching closing tag by counting depth
        let depth = 1;
        let searchPos = tagEnd;

        while (depth > 0 && searchPos < result.length) {
            const nextOpen = result.indexOf(openTag, searchPos);
            const nextClose = result.indexOf(closeTag, searchPos);

            if (nextClose === -1) {
                // No closing tag found, skip this element
                depth = 0;
                break;
            }

            if (nextOpen !== -1 && nextOpen < nextClose) {
                // Check if it's actually an opening tag (not just part of another string)
                // and not a closing tag or self-closing
                const charAfterOpenTag = result.charCodeAt(nextOpen + openTag.length);
                const isOpeningTag = charAfterOpenTag === 62 || // >
                    (charAfterOpenTag === 32 || charAfterOpenTag === 9 || charAfterOpenTag === 10 || charAfterOpenTag === 13); // whitespace

                if (isOpeningTag && !result.substring(nextOpen, nextOpen + 2).includes("</")) {
                    depth++;
                    searchPos = nextOpen + openTag.length;
                } else {
                    searchPos = nextClose + closeTag.length;
                }
            } else {
                depth--;
                if (depth === 0) {
                    // Remove the entire element
                    result = result.substring(0, tagStart) + result.substring(nextClose + closeTag.length);
                } else {
                    searchPos = nextClose + closeTag.length;
                }
            }
        }

        // Reset search to continue from the beginning since we modified the string
        htmlText = result;
        idRegex.lastIndex = 0;
    }

    return result;
}

// Remove all presenter mode elements
html = removeElementById(html, "presenterPanel");
html = removeElementById(html, "controlBar");
html = removeElementById(html, "viewerOnlyControls");
// Optionally, hide any remaining with CSS if dynamic content remains
html = html.replace(/(<style>)/i, `$1\n#presenter, #presenterPanel, #topbar, #controlBar { display: none !important; }`);

const deckScriptRegex = /<script[^>]*\ssrc=["']deck\.js["'][^>]*>\s*<\/script>/i;
const { bundle, vendor } = await processJs();
html = html.replace(
    deckScriptRegex,
    () => `${deckTag}\n${vendor}\n<script>\n${escapeInlineScriptText(bundle)}\n</script>`
);
fs.writeFileSync(outHtml, html, "utf8");
console.log(`Wrote ${outHtml}${inlineAssets ? " (single-file, images inlined)" : ""}`);
