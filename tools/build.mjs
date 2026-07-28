import fs from "node:fs";
import path from "node:path";
import parseDeckMarkdown from "./md-to-deck.mjs";
import { build as esbuild } from "esbuild";

const root = process.cwd();
const distDir = path.join(root, "dist");
const inIndex = path.join(root, "index.html");
const inCss = path.join(root, "styles.css");
const inJs = path.join(root, "deck.js");
const prismCssPath = path.join(root, "node_modules", "prismjs", "themes", "prism.css");

const args = process.argv.slice(2);
const inlineAssets = !args.includes("--no-inline-assets");
const inlineKatexFontDataUris = !args.includes("--no-inline-katex-fonts");

// Will be set after resolving the deck path
let deckDir = root;

/**
 * Resolve deck file path from arguments.
 *
 * Usage: node build.mjs [deck-path] [--no-inline-assets] [--no-inline-katex-fonts]
 *
 * Arguments:
 *   deck-path - Path to the deck file. Can be:
 *               - A filename relative to the project root (e.g., "deck.md", "presentation/deck.md")
 *               - An absolute path (e.g., "/path/to/deck.md" on Unix, "C:\\path\\to\\deck.md" on Windows)
 *               - Defaults to "deck.md" if not provided
 *   --no-inline-assets - Skip inlining images as data URIs (keeps external image references)
 *   --no-inline-katex-fonts - Keep KaTeX fonts as external files (copies fonts to dist/fonts)
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

// Set deckDir to the directory containing the deck file
deckDir = path.dirname(path.resolve(inDeck));

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

function copyDirRecursive(srcDir, destDir) {
    if (!fs.existsSync(srcDir)) return;

    try {
        fs.cpSync(srcDir, destDir, { recursive: true });
        return;
    } catch {
        // Fallback: manual copy
    }

    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        const src = path.join(srcDir, entry.name);
        const dest = path.join(destDir, entry.name);
        if (entry.isDirectory()) copyDirRecursive(src, dest);
        else fs.copyFileSync(src, dest);
    }
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

    // Replace src="..." and src='...' for local relative paths
    // Matches: relative paths that don't start with /, http://, https://, or data:
    return htmlText.replace(/\s(src|poster)=(['"])([^'">\s]+)\2/gi, (m, attr, quote, relPath) => {
        // Skip if it's an absolute path, URL, or already a data URI
        if (relPath.startsWith('/') || relPath.startsWith('http://') || relPath.startsWith('https://') || relPath.startsWith('data:')) {
            return m;
        }
        // Resolve relative to the deck file's directory
        const abs = path.resolve(deckDir, relPath);
        if (!fs.existsSync(abs)) return m;
        const uri = toDataUri(abs);
        if (!uri) return m;
        return ` ${attr}=${quote}${uri}${quote}`;
    });
}

function inlineEmbeddedImagesInHtml(htmlText, images) {
    if (!htmlText || !images) return htmlText;
    return htmlText.replace(/\s(src|poster)=(['"])([^'">\s]+)\2/gi, (m, attr, quote, relPath) => {
        if (relPath.startsWith('/') || relPath.startsWith('http://') || relPath.startsWith('https://') || relPath.startsWith('data:')) {
            return m;
        }
        // Extract filename from path (e.g., "images/icon.png" -> "icon.png")
        const fileName = relPath.split("/").pop();
        const buf = images.get(fileName);
        if (!buf) return m;
        const ext = path.extname(fileName).toLowerCase();
        const mime = mimeForExt(ext);
        if (!mime) return m;
        const b64 = buf.toString("base64");
        return ` ${attr}=${quote}data:${mime};base64,${b64}${quote}`;
    });
}

function inlineImagesInDeck(deck) {
    if (!deck || typeof deck !== "object") return deck;
    if (!Array.isArray(deck.slides)) return deck;

    const slides = deck.slides.map((s) => {
        const areas = s && typeof s === "object" && s.areas && typeof s.areas === "object" ? s.areas : {};
        const outAreas = {};
        for (const [k, html] of Object.entries(areas)) {
            outAreas[k] = embeddedImages
                ? inlineEmbeddedImagesInHtml(html, embeddedImages)
                : inlineLocalImagesInHtml(html);
        }

        // Inline background images if they reference local files
        let background = s.background || "";
        if (background && background.includes("url(")) {
            background = background.replace(/url\((['"]?)([^'")\s]+)\1\)/g, (m, quote, url) => {
                if (url.startsWith('/') || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
                    return m;
                }
                if (embeddedImages) {
                    const fileName = url.split("/").pop();
                    const buf = embeddedImages.get(fileName);
                    if (buf) {
                        const ext = path.extname(fileName).toLowerCase();
                        const mime = mimeForExt(ext);
                        if (mime) {
                            const b64 = buf.toString("base64");
                            return `url(data:${mime};base64,${b64})`;
                        }
                    }
                    return m;
                }
                const abs = path.resolve(deckDir, url);
                if (fs.existsSync(abs)) {
                    const uri = toDataUri(abs);
                    if (uri) return `url(${uri})`;
                }
                return m;
            });
        }

        return { ...s, areas: outAreas, background };
    });

    return { ...deck, slides };
}

if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

// Clean stale intermediate files from previous builds
for (const f of ["deck.bundle.js", "deck.bundle.js.map", "deck.bundle.css", "deck.bundle.css.map"]) {
    const p = path.join(distDir, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
}

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

// Load and parse the deck (.md file with optional images/ directory)
let deck;
let embeddedImages = null;
const ext = path.extname(inDeck).toLowerCase();

const deckMd = fs.readFileSync(inDeck, "utf8");
deck = parseDeckMarkdown(deckMd);

// Auto-discover images/ directory in the same location as the .md file
const imagesDir = path.join(path.dirname(inDeck), "images");
if (fs.existsSync(imagesDir)) {
    embeddedImages = new Map();
    for (const name of fs.readdirSync(imagesDir)) {
        const filePath = path.join(imagesDir, name);
        if (fs.statSync(filePath).isFile()) {
            embeddedImages.set(name, fs.readFileSync(filePath));
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

// Inline images if requested
if (inlineAssets) {
    deck = inlineImagesInDeck(deck);
    deckHtmlText = getDeckHtmlText(deck);
}

const usesPrism = /<pre\b[\s\S]*?<code\b/i.test(deckHtmlText);
const usesKatex = /(\$\$[\s\S]+?\$\$)|\\\(|\\\[|\\begin\{(?:equation|align|gather|matrix|cases)/.test(deckHtmlText);
const usesMermaid = /class=["'][^"']*\bmermaid\b[^"']*["']/.test(deckHtmlText) ||
    /(```|~~~)\s*mermaid/.test(deckHtmlText) ||
    /<div\s+class=["']mermaid["']/.test(deckHtmlText);

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
        markdown: "markdown",
        makefile: "makefile",
        cmake: "cmake",
        sql: "sql",
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

if (usesPrism || usesKatex || usesMermaid) {
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
        const katexCss = inlineKatexFontDataUris ? inlineKatexFonts(katexCssRaw) : katexCssRaw;
        if (katexCss) vendorCssParts.push(katexCss);

        const katexCore = readTextIfExists(path.join(root, "node_modules", "katex", "dist", "katex.min.js"));
        const katexAutoRender = readTextIfExists(
            path.join(root, "node_modules", "katex", "dist", "contrib", "auto-render.min.js")
        );
        if (katexCore) vendorJsParts.push(katexCore);
        if (katexAutoRender) vendorJsParts.push(katexAutoRender);

        if (!inlineKatexFontDataUris) {
            const srcFontsDir = path.join(root, "node_modules", "katex", "dist", "fonts");
            const destFontsDir = path.join(distDir, "fonts");
            copyDirRecursive(srcFontsDir, destFontsDir);
            console.log("Externalized KaTeX fonts to dist/fonts (--no-inline-katex-fonts)");
        }
    }

    if (usesMermaid) {
        // Mermaid is bundled into deck.bundle.js via esbuild.
        // No CDN script needed — works offline.
    }

    vendorCss = vendorCssParts.filter(Boolean).join("\n\n");
}

const deckJson = JSON.stringify(deck);
const deckTag = `<script type="application/json" id="deckData">${escapeJsonForHtmlScriptTag(deckJson)}</script>`;

// --- Bundle JS with esbuild ---
async function buildBundleJs() {
    const deckJsPath = path.join(root, "deck.js");
    
    const result = await esbuild({
        entryPoints: [deckJsPath],
        bundle: true,
        format: "iife",
        platform: "browser",
        target: "es2020",
        minify: true,
        sourcemap: true,
        write: false,
        outdir: distDir,
        // Configure loaders for non-JS assets that might be imported
        loader: {
            ".woff": "dataurl",
            ".woff2": "dataurl",
            ".ttf": "dataurl",
            ".otf": "dataurl",
            ".png": "dataurl",
            ".jpg": "dataurl",
            ".jpeg": "dataurl",
            ".gif": "dataurl",
            ".svg": "dataurl",
            ".css": "css",
            ".md": "text",
        },
        // External packages that shouldn't be bundled
        external: [],
        // Define globals if needed
        define: {
            "process.env.NODE_ENV": '"production"',
        },
    });
    
    // Get the JS output from the build result
    const jsOutput = result.outputFiles.find(f => f.path.endsWith(".js"));
    return jsOutput ? jsOutput.text : "";
}

async function processJs() {
    // Bundle with esbuild (already minified)
    const bundleJs = await buildBundleJs();

    // Minify vendor scripts with esbuild
    const minifiedVendorScripts = [];
    for (const src of vendorJsParts) {
        if (!src) continue;
        const result = await esbuild({
            stdin: { contents: src },
            minify: true,
            write: false,
        });
        minifiedVendorScripts.push(
            `<script>\n${escapeInlineScriptText(result.code)}\n</script>`
        );
    }

    return {
        bundle: bundleJs,
        vendor: minifiedVendorScripts.join("\n"),
    };
}

// Inline CSS
html = html.replace(
    /<link\s+rel="stylesheet"\s+href="styles\.css"\s*\/?\s*>/i,
    () => `<style>\n${vendorCss}\n\n${css}\n</style>`
);

// Remove manifest and icon link tags that use absolute paths (fail under file:// protocol)
html = html.replace(/<link\s+rel="manifest"\s+href="\/site\.webmanifest"\s*\/?\s*>\s*\n?/gi, "");
html = html.replace(/<link\s+rel="icon"[^>]*>\s*\n?/gi, "");
html = html.replace(/<link\s+rel="apple-touch-icon"[^>]*>\s*\n?/gi, "");

// Always remove presenter mode elements from the output
// Remove elements with id 'presenterPanel', 'editorOnlyControls', 'controlBar' from the HTML
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
html = removeElementById(html, "editorOnlyControls");
// Optionally, hide any remaining with CSS if dynamic content remains
html = html.replace(/(<style>)/i, `$1\n#presenter, #presenterPanel, #topbar, #controlBar { display: none !important; }`);

const deckScriptRegex = /<script[^>]*\ssrc=["']deck\.js["'][^>]*>\s*<\/script>/i;
const { bundle, vendor } = await processJs();
html = html.replace(
    deckScriptRegex,
    () => `${deckTag}\n${vendor}\n<script>\n${escapeInlineScriptText(bundle)}\n</script>`
);

// Initialize KaTeX auto-render for dist builds (needed since ensureKatexLoaded is stubbed out)
if (usesKatex) {
    const katexInitScript = '<script>window.addEventListener("DOMContentLoaded",function(){if(typeof renderMathInElement==="function"){renderMathInElement(document.body,{delimiters:[{left:"$$",right:"$$",display:!0},{left:"$",right:"$",display:!1},{left:"\\\\(",right:"\\\\)",display:!1},{left:"\\\\[",right:"\\\\]",display:!0}],ignoredClasses:["no-math","katex-ignore","mermaid"],throwOnError:!1});}});</script>';
    html = html.replace(/<\/head>/i, `${katexInitScript}</head>`);
    console.log(`Added KaTeX auto-render initialization`);
}

// Mark this as an exported build (for deck.js to skip broadcast-based loading)
html = html.replace(/<\/head>/i, '<script>window.__WEBDECK_EXPORTED__=true;</script></head>');

fs.writeFileSync(outHtml, html, "utf8");
{
    const notes = [];
    if (inlineAssets) notes.push("images inlined");
    if (usesKatex && inlineKatexFontDataUris) notes.push("KaTeX fonts inlined");
    if (usesKatex && !inlineKatexFontDataUris) notes.push("KaTeX fonts externalized");

    const suffix = notes.length ? ` (${notes.join(", ")})` : "";
    console.log(`Wrote ${outHtml}${suffix}`);
}
