import fs from "node:fs";
import path from "node:path";
import parseDeckMarkdown from "./md-to-deck.mjs";
import { minify } from "terser";

const root = process.cwd();
const distDir = path.join(root, "dist");
const inIndex = path.join(root, "index.html");
const inCss = path.join(root, "styles.css");
const inJs = path.join(root, "deck.js");
const outHtml = path.join(distDir, "deck.html");
const prismCssPath = path.join(root, "node_modules", "prismjs", "themes", "prism.css");

const args = process.argv.slice(2);
const inlineAssets = !args.includes("--no-inline-assets");

// Get deck file from args or use default
const deckArg = args.find(arg => !arg.startsWith("--"));
const deckFile = deckArg || "week2.md";
const inDeck = path.join(root, "decks", deckFile);

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
if (deckFile.endsWith(".json")) {
    const deckJson = fs.readFileSync(inDeck, "utf8");
    try {
        deck = JSON.parse(deckJson);
    } catch (e) {
        console.error(`Error parsing JSON deck: ${e}`);
        process.exit(1);
    }
} else {
    const deckMd = fs.readFileSync(inDeck, "utf8");
    deck = parseDeckMarkdown(deckMd);
}

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
function stripEsmSyntax(srcText) {
    if (!srcText) return "";
    // Remove import lines
    let out = srcText.replace(/^\s*import[^;]+;\s*$/gm, "");
    // Convert named exports to plain declarations
    out = out.replace(/^\s*export\s+(class|function|const|let|var)\s+/gm, (m, kind) => `${kind} `);
    // Remove 'export {' re-exports (not used in this project)
    out = out.replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, "");
    // Convert 'export default' to plain assignment (rare; not used here)
    out = out.replace(/^\s*export\s+default\s+/gm, "const __default_export__ = ");
    return out;
}

function buildBundleJs() {
    const order = [
        path.join(root, "src", "utils.js"),
        path.join(root, "src", "asset-loader.js"),
        path.join(root, "src", "content-enhancer.js"),
        path.join(root, "src", "markdown-parser.js"),
        path.join(root, "src", "layout-parser.js"),
        path.join(root, "src", "slide-renderer.js"),
        path.join(root, "src", "deck-loader.js"),
        path.join(root, "src", "deck-controller.js"),
        path.join(root, "deck.js"),
    ];

    const parts = order
        .filter((p) => fs.existsSync(p))
        .map((p) => {
            const src = fs.readFileSync(p, "utf8");
            return `// ${path.relative(root, p)}\n` + stripEsmSyntax(src);
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
// Remove elements with id 'presenter', 'presenter-only', 'presenterPanel', 'topbar', 'controlBar', or 'footerBar' from the HTML
html = html.replace(/<([a-zA-Z0-9]+)([^>]*\bid=["'](presenterPanel|controlBar)["'][^>]*)>.*?<\/\1>/gs, "");
// Optionally, hide any remaining with CSS if dynamic content remains
html = html.replace(/(<style>)/i, `$1\n#presenter, #presenter-only, #presenterPanel, #topbar, #controlBar { display: none !important; }`);

const deckScriptRegex = /<script[^>]*\ssrc=["']deck\.js["'][^>]*>\s*<\/script>/i;
const { bundle, vendor } = await processJs();
html = html.replace(
    deckScriptRegex,
    () => `${deckTag}\n${vendor}\n<script>\n${escapeInlineScriptText(bundle)}\n</script>`
);
fs.writeFileSync(outHtml, html, "utf8");
console.log(`Wrote ${outHtml}${inlineAssets ? " (single-file, images inlined)" : ""}`);
