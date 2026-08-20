/**
 * HtmlExportManager
 * Handles exporting the current deck as a fully self-contained HTML file.
 * Similar to build.mjs, creates a single file with all CSS and JS inlined.
 */

import { DeckLoader } from "../data/deck-loader.js";
import LAYOUTS_JSON from "../data/layouts.json" with { type: "json" };
import { buildInlinedMermaidScriptTag } from "../core/mermaid-config.js";
import { Notification } from "./notification.js";
import { JS_BUNDLE_ORDER } from "../data/bundle-order.js";
import { Logger } from "../core/logger.js";

export class HtmlExportManager {
  static _isExporting = false;

  // Known-good CDN versions used when the installed version can't be read
  // (e.g. node_modules is not served by the host). Keep in sync with package.json.
  static FALLBACK_VENDOR_VERSIONS = {
    prismjs: "1.30.0",
    katex: "0.18.4",
    mermaid: "11.16.1",
    dompurify: "3.4.13",
  };

  /**
   * Exports the current deck as a fully self-contained HTML file.
   * All CSS and JS are inlined, making it a true standalone file.
   * @param {HTMLElement} slidesContainer - The container element holding all slides
   * @param {Object} deck - The deck object containing metadata and slides
   * @param {Object} options - Optional parameters
   * @param {string} options.filename - Output filename (default: auto-generated from deck title)
   * @returns {Promise<void>}
   */
  static async handleHtmlExport(
    slidesContainer,
    deck,
    { filename = null, includeSlideSnapshot = false, minify = true } = {},
  ) {
    if (HtmlExportManager._isExporting) return;
    HtmlExportManager._isExporting = true;

    const controller = new AbortController();
    HtmlExportManager._abortController = controller;

    const loading = Notification.showLoadingModal("Preparing HTML export...", {
      title: "Exporting HTML",
      cancelLabel: "Cancel",
      cancelConfirmMessage: "Are you sure you want to cancel the HTML export?",
      onCancel: () => {
        controller.abort();
        if (HtmlExportManager._abortController === controller) {
          HtmlExportManager._abortController = null;
        }
      },
    });

    try {
      const html = await HtmlExportManager.generateStandaloneHtml(deck, slidesContainer, {
        includeSlideSnapshot,
        minify,
        signal: controller.signal,
        onProgress: (message, percent) => {
          loading.updateMessage(message);
          if (typeof percent === "number") loading.updateProgress(percent);
        },
      });

      // Trigger download
      const outputFilename = filename || HtmlExportManager.generateFilename(deck);
      HtmlExportManager.downloadHtml(html, outputFilename);

      loading.dismiss();
      Notification.success("HTML export complete");
    } catch (e) {
      if (e.name === "AbortError") {
        loading.dismiss();
        Notification.info("HTML export cancelled");
        return;
      }
      loading.dismiss();
      Logger.warn("HTML export failed:", e);
      Notification.error(`HTML export failed: ${e.message || e}`);
    } finally {
      HtmlExportManager._isExporting = false;
      if (HtmlExportManager._abortController === controller) {
        HtmlExportManager._abortController = null;
      }
    }
  }

  /**
   * Generates a fully self-contained HTML document.
   */
  static async generateStandaloneHtml(
    deck,
    slidesContainer,
    { includeSlideSnapshot = false, minify = true, signal = null, onProgress = null } = {},
  ) {
    const report = (message, percent) => {
      if (typeof onProgress === "function") onProgress(message, percent);
      if (signal?.aborted) throw new DOMException("HTML export cancelled", "AbortError");
    };

    // 1. Get CSS (Vendor + App)
    report("Collecting styles...", 10);
    const katexVersion = await HtmlExportManager._getVendorVersion("katex", signal);
    let mainCss = HtmlExportManager.extractCssFromDocument();
    mainCss = HtmlExportManager.fixKatexFontUrls(mainCss, katexVersion);
    const vendorCss = await HtmlExportManager.fetchVendorCss(deck, signal);
    let allCss = vendorCss + "\n\n" + mainCss;
    if (minify) allCss = HtmlExportManager.minifyCss(allCss);

    // 2. Get JS (App Bundle + Vendor Libraries)
    report("Bundling app JavaScript...", 25);
    let bundledJs = await HtmlExportManager.fetchAndBundleJs(signal);
    report("Inlining vendor JavaScript...", 40);
    let vendorJs = await HtmlExportManager.fetchVendorJs(deck, signal);
    const mermaidScript = await HtmlExportManager.buildMermaidScriptTagIfNeeded(deck, signal);
    if (minify) {
      bundledJs = HtmlExportManager.minifyJs(bundledJs);
      if (vendorJs) vendorJs = HtmlExportManager.minifyJs(vendorJs);
    }

    // Prevent inline script text from closing the <script> tag prematurely.
    bundledJs = HtmlExportManager.escapeInlineScriptText(bundledJs);
    if (vendorJs) vendorJs = HtmlExportManager.escapeInlineScriptText(vendorJs);

    // 3. Escape Data
    // Inline images in deck JSON as data URIs
    report("Inlining deck images...", 55);
    const inlinedDeck = await HtmlExportManager.inlineImagesInDeck(deck, signal);
    const deckJson = JSON.stringify(inlinedDeck);
    const escapedDeckJson = HtmlExportManager.escapeJsonForHtml(deckJson);

    // 4. Extract Slide HTML (The Snapshot)
    report("Building slide snapshot...", 70);
    const title = DeckLoader.getDisplayTitle(deck);
    let slidesHtml = includeSlideSnapshot
      ? HtmlExportManager.extractSlidesHtml(slidesContainer)
      : "";

    // 4b. Inline images as data URIs
    report("Inlining slide images...", 85);
    slidesHtml = await HtmlExportManager.inlineImagesInHtml(slidesHtml, signal);

    const presenterHideCss = `
/* Hide presenter-only elements in exported HTML */
#presenter, #presenterPanel, #topbar, #controlBar, #editorPanel, #editorOnlyControls { display: none !important; }
.main { display: flex !important; height: 100vh !important; width: 100vw !important; }
.viewer { width: 100% !important; height: 100% !important; }
`;

    const escapedInitScript = HtmlExportManager.escapeInlineScriptText(
      HtmlExportManager.getInitScript(),
    );

    report("Finalizing HTML...", 95);
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${HtmlExportManager.escapeHtml(title)}</title>
    <meta name="theme-color" content="#3b82f6" />
    <style>
${presenterHideCss}
${allCss}
    </style>
    <script>window.__WEBDECK_EXPORTED__ = true;</script>
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

        <footer id="footerBar" class="footer">
            <div class="footer__left">
                <strong>Shortcuts:</strong>
                <span><b>Arrows, Space, PgUp/Dn</b>: Prev/Next</span>
                <span>•</span>
                <span><b>F</b> Full Screen</span>
                <span>•</span>
                <span><b>G</b>: Go to slide</span>
            </div>
            <div class="footer__right">Slide Deck</div>
        </footer>
    </div>

    <script type="application/json" id="deckData">${escapedDeckJson}</script>
    
    <!-- Vendor Libraries -->
${mermaidScript}
${vendorJs ? `    <script>\n${vendorJs}\n    </script>` : ""}

    <!-- App Logic -->
    <script>
${bundledJs}
${escapedInitScript}
    </script>
</body>
</html>`;
  }

  /**
   * Maps language names to Prism component names.
   */
  static prismComponentForLang(lang) {
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
      yaml: "yaml",
      yml: "yaml",
      toml: "toml",
      ini: "ini",
      rust: "rust",
      rs: "rust",
      go: "go",
      golang: "go",
      ruby: "ruby",
      rb: "ruby",
      php: "php",
      swift: "swift",
      kotlin: "kotlin",
      kt: "kotlin",
      scala: "scala",
      r: "r",
      perl: "perl",
      pl: "perl",
      lua: "lua",
      graphql: "graphql",
      docker: "docker",
      dockerfile: "docker",
      nginx: "nginx",
      vim: "vim",
      regex: "regex",
      diff: "diff",
      http: "http",
    };
    return map[l] || null;
  }

  /**
   * Returns the dependency chain for a Prism component.
   */
  static prismDependencies(component) {
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
      case "go":
      case "ruby":
        return ["clike", component];
      case "php":
        return ["clike", "markup", "markup-templating", "php"];
      case "scala":
        return ["clike", "java", "scala"];
      case "markdown":
        return ["markup", "markdown"];
      case "nginx":
        return ["clike", "nginx"];
      default:
        return [component];
    }
  }

  /**
   * Detects which Prism language components are needed from the deck content.
   */
  static detectPrismComponentsFromDeck(deck) {
    const deckHtmlText = HtmlExportManager.getDeckHtmlText(deck);
    const langs = [];
    const re = /(?:lang|language)-([a-zA-Z0-9_+-]+)/g;
    let m;
    while ((m = re.exec(deckHtmlText))) {
      const comp = HtmlExportManager.prismComponentForLang(m[1]);
      if (comp) langs.push(comp);
    }

    // Unique components with their dependencies
    const comps = Array.from(new Set(langs.flatMap((c) => HtmlExportManager.prismDependencies(c))));
    return comps;
  }

  /**
   * Fetches vendor JS libraries (Prism and KaTeX) to inline in the export.
   * Mermaid is inlined from node_modules when needed (no CDN dependency).
   */
  static async fetchVendorJs(deck, signal = null) {
    const deckHtmlText = HtmlExportManager.getDeckHtmlText(deck);

    const prismVersion = await HtmlExportManager._getVendorVersion("prismjs", signal);
    const katexVersion = await HtmlExportManager._getVendorVersion("katex", signal);
    const dompurifyVersion = await HtmlExportManager._getVendorVersion("dompurify", signal);

    // Helper to fetch JS with fallback
    const fetchJs = async (localPath, cdnUrl) => {
      if (signal?.aborted) throw new DOMException("HTML export cancelled", "AbortError");
      for (const url of [localPath, cdnUrl].filter(Boolean)) {
        try {
          const r = await fetch(url, { signal });
          if (r.ok) return await r.text();
        } catch (e) {
          if (e.name === "AbortError") throw e;
          Logger.warn("Failed to fetch JS:", url);
        }
      }
      return "";
    };

    let vendorScripts = "";

    // DOMPurify is always inlined because slide-renderer.js sanitizes user HTML.
    const dompurifyCdn = dompurifyVersion
      ? `https://cdnjs.cloudflare.com/ajax/libs/dompurify/${dompurifyVersion}/purify.min.js`
      : null;
    const dompurifyJs = await fetchJs("node_modules/dompurify/dist/purify.js", dompurifyCdn);
    if (!dompurifyJs) {
      throw new Error(
        "HTML export requires DOMPurify, but it could not be loaded from node_modules or the CDN.",
      );
    }
    vendorScripts += `/* DOMPurify */\n${dompurifyJs}\n`;

    // Check if we need Prism
    const needsPrism =
      /<pre\b[\s\S]*?<code\b/i.test(deckHtmlText) ||
      /```[\s\S]*?\n/.test(deckHtmlText) ||
      /~~~[\s\S]*?\n/.test(deckHtmlText);

    if (needsPrism) {
      Logger.info("HtmlExport: Inlining Prism.js library...");
      const cdnUrl = prismVersion
        ? `https://cdnjs.cloudflare.com/ajax/libs/prism/${prismVersion}/prism.min.js`
        : null;
      const prismJs = await fetchJs("node_modules/prismjs/prism.js", cdnUrl);

      vendorScripts += `/* Prism Core */\n${prismJs}\n`;

      // Detect and load all required language components
      const components = HtmlExportManager.detectPrismComponentsFromDeck(deck);
      for (const c of components) {
        const cdnUrl = prismVersion
          ? `https://cdnjs.cloudflare.com/ajax/libs/prism/${prismVersion}/components/prism-${c}.min.js`
          : null;
        const langJs = await fetchJs(`node_modules/prismjs/components/prism-${c}.min.js`, cdnUrl);
        if (langJs) {
          vendorScripts += `/* Prism: ${c} */\n${langJs}\n`;
        }
      }
    }

    // Check if we need KaTeX
    const needsKatex = /(\$|\$\$|\\\(|\\\[|\\begin)/.test(deckHtmlText);
    if (needsKatex) {
      Logger.info("HtmlExport: Inlining KaTeX...");
      const katexJsCdn = katexVersion
        ? `https://cdn.jsdelivr.net/npm/katex@${katexVersion}/dist/katex.min.js`
        : null;
      const katexRenderCdn = katexVersion
        ? `https://cdn.jsdelivr.net/npm/katex@${katexVersion}/dist/contrib/auto-render.min.js`
        : null;
      const katexJs = await fetchJs("node_modules/katex/dist/katex.min.js", katexJsCdn);
      const katexRender = await fetchJs(
        "node_modules/katex/dist/contrib/auto-render.min.js",
        katexRenderCdn,
      );
      if (katexJs) vendorScripts += `/* KaTeX Core */\n${katexJs}\n`;
      if (katexRender) vendorScripts += `/* KaTeX Auto-Render */\n${katexRender}\n`;
    }

    return vendorScripts;
  }

  /**
   * Fetches and bundles all JS source files.
   */
  static async fetchAndBundleJs(signal = null) {
    const parts = [];
    Logger.info("HtmlExport: Starting JS bundle...");

    for (const filePath of JS_BUNDLE_ORDER) {
      try {
        const response = await fetch(filePath, { signal });
        if (!response.ok) continue;

        let src = await response.text();
        const processedSrc = await HtmlExportManager.stripEsmSyntax(src, filePath);
        parts.push(processedSrc);
      } catch (e) {
        if (e.name === "AbortError") throw e;
        Logger.error(`Could not load ${filePath}:`, e);
      }
    }
    return parts.join("\n\n");
  }

  /**
   * Strips ES module syntax.
   * Stubs out AssetLoader methods to prevent them from trying to load external files in the exported HTML.
   */
  static async stripEsmSyntax(srcText, filePath) {
    if (!srcText) return "";
    let out = srcText;

    // 1. Handle JSON imports
    // Vite transforms JSON imports to: import X from "/path/to/file.json?import&t=..."
    const jsonImportRe = /import\s+(\w+)\s+from\s+['"]([^'"]+\.json(?:\?[^'"]*)?)['"]\s*;?/g;
    const jsonImports = [...srcText.matchAll(jsonImportRe)];

    for (const jsonMatch of jsonImports) {
      const [fullMatch, importName, jsonPath] = jsonMatch;
      try {
        // Remove Vite's query parameters (?import&t=...) to get the clean path
        let cleanPath = jsonPath.split("?")[0];

        // Special handling for layouts.json - inline it directly
        if (cleanPath.includes("layouts.json")) {
          const jsonContent = JSON.stringify(LAYOUTS_JSON);
          out = out.replace(fullMatch, `const ${importName} = ${jsonContent};`);
          continue;
        }

        // For other JSON files, try fetching
        let jsonUrl = cleanPath.startsWith("/")
          ? cleanPath
          : "/" +
            filePath.substring(0, filePath.lastIndexOf("/")) +
            "/" +
            (cleanPath.startsWith("./") ? cleanPath.substring(2) : cleanPath);

        const jsonResp = await fetch(jsonUrl);
        if (jsonResp.ok) {
          const jsonContent = await jsonResp.text();
          out = out.replace(fullMatch, `const ${importName} = ${jsonContent};`);
        } else {
          // Fetch returned non-ok status (404, etc.)
          out = out.replace(fullMatch, `const ${importName} = {};`);
        }
      } catch (_e) {
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
      () => `const { AssetLoader } = window;`,
    );
    out = out.replace(
      /const\s+(\w+)\s*=\s*await\s+import\(['"][^'"]*asset-loader\.js['"]\)\s*\.then\s*\(\s*m\s*=>\s*m\.AssetLoader\s*\)\s*;?/g,
      (_m, varName) => `const ${varName} = window.AssetLoader;`,
    );
    out = out.replace(
      /\(\s*await\s+import\(['"][^'"]*asset-loader\.js['"]\)\s*\)\.AssetLoader/g,
      () => `window.AssetLoader`,
    );
    out = out.replace(
      /import\(['"][^'"]*asset-loader\.js['"]\)\s*\.then\s*\(\s*\(\s*\{\s*AssetLoader\s*\}\s*\)\s*=>\s*AssetLoader\s*\)/g,
      () => `Promise.resolve(window.AssetLoader)`,
    );
    out = out.replace(
      /import\(['"][^'"]*asset-loader\.js['"]\)\s*\.then\s*\(\s*m\s*=>\s*m\.AssetLoader\s*\)/g,
      () => `Promise.resolve(window.AssetLoader)`,
    );

    // 4. Stub AssetLoader methods
    // Since we inline Prism, we stub ensurePrismLoaded to do nothing (it's already there)
    out = out.replace(
      /await\s+import\(['"][^'"]*asset-loader\.js['"]\)\s*\.then\s*\(\s*m\s*=>\s*m\.AssetLoader\.(ensureMermaidLoaded|ensureRichTextEnhancers|ensureKatexLoaded|ensurePrismLoaded)\(\s*\)\s*\)/g,
      () => `AssetLoader.$1()`,
    );

    // 5. Specific Stubs for asset-loader.js
    if (filePath.includes("asset-loader.js")) {
      // KaTeX stub
      out = out.replace(
        /static async ensureKatexLoaded\(\) \{[\s\S]*?\}(?=\s*static async ensureMermaidLoaded)/,
        () => `static async ensureKatexLoaded() { /* KaTeX inlined */ return; }`,
      );
      // Prism stub (Library inlined via fetchVendorJs)
      out = out.replace(
        /static async ensurePrismLoaded\(\) \{[\s\S]*?\}(?=\s*static async ensureKatexLoaded)/,
        () => `static async ensurePrismLoaded() { /* Prism inlined */ return; }`,
      );
    }

    // 6. Stub AI generation code in deck-controller.js for exports
    // The generation folder is not bundled, so we need to remove references
    if (filePath.includes("deck-controller.js")) {
      // Stub initGenerationManager method with no-op
      out = out.replace(
        /initGenerationManager\(\) \{[^}]*\}/,
        () => `initGenerationManager() { /* AI generation disabled in export */ }`,
      );
    }

    // 7. Stub deck.js auto-redirect
    if (filePath === "deck.js") {
      out = out.replace(
        /\/\/ Auto-redirect checks \(optional\)[\s\S]*?window\.location\.href = url\.toString\(\);[\s\S]*?return;[\s\S]*?\}/,
        () => `/* Auto-redirect disabled in export */`,
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
            if (css && !css.includes("@vite/") && !css.includes("import.meta.hot")) {
              const filtered = css.replace(/\b[\w-]+:\s*;/g, "").trim();
              if (filtered) cssParts.push(filtered);
            }
          }
        }
      } catch (e) {
        Logger.debug("CSS Access error:", e);
      }
    }
    return cssParts.join("\n\n");
  }

  static filterViteArtifactsFromCss(cssText) {
    if (!cssText) return "";
    const viteCssMatch = cssText.match(
      /const\s+__vite__css\s*=\s*"(.*)";?\s*(?:__vite__updateStyle|\/\/)/s,
    );
    if (viteCssMatch) {
      return viteCssMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
    return cssText
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        return !t.includes("import ") && !t.includes("/@vite/") && !t.includes("__vite__");
      })
      .join("\n");
  }

  /**
   * Convert absolute or relative KaTeX font URLs from the dev bundle into
   * CDN URLs so the exported HTML loads them without a local node_modules server.
   */
  static fixKatexFontUrls(cssText, version) {
    if (!cssText || !version) return cssText;
    const cdnBase = `https://cdn.jsdelivr.net/npm/katex@${version}/dist/fonts/`;
    // Restrict all URL rewrites to KaTeX @font-face rules so app CSS with its
    // own relative fonts directory is not affected.
    const katexFontBlockRe = /@font-face\s*\{[^{}]*?\bKaTeX[^{}]*?\}/gi;
    return cssText.replace(katexFontBlockRe, (block) =>
      block
        .replace(/url\((['"]?)\/node_modules\/katex\/dist\/fonts\//g, `url($1${cdnBase}`)
        .replace(/url\((['"]?)\.\/fonts\//g, `url($1${cdnBase}`)
        .replace(/url\((['"]?)fonts\//g, `url($1${cdnBase}`),
    );
  }

  static minifyCss(cssText) {
    if (!cssText) return "";
    return cssText
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\s+/g, " ")
      .replace(/\s*([:;{},])\s*/g, "$1")
      .replace(/;}/g, "}")
      .trim();
  }

  static minifyJs(jsText) {
    if (!jsText) return "";
    // Safe minify: only trim trailing whitespace and collapse extra blank lines.
    // Removing comments here can break code (e.g., tokens inside strings/regex).
    const trimmed = jsText
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n");
    return trimmed.replace(/\n{3,}/g, "\n\n").trim();
  }

  /**
   * Escape </script sequences inside inline script text so the HTML parser does not
   * close the script tag prematurely (e.g., from strings or regexes in the bundle).
   */
  static escapeInlineScriptText(jsText) {
    if (!jsText) return jsText;
    return jsText.replace(/<\/script/gi, "<\\/script");
  }

  /**
   * Returns an inlined Mermaid script block if the deck contains Mermaid
   * diagrams, empty string otherwise. The Mermaid IIFE bundle is fetched from
   * node_modules and inlined directly (no CDN) so the exported HTML works
   * offline.
   */
  static async buildMermaidScriptTagIfNeeded(deck, signal = null) {
    const deckHtmlText = HtmlExportManager.getDeckHtmlText(deck);
    const needsMermaid =
      /\bmermaid\b/i.test(deckHtmlText) || /(```|~~~)\s*mermaid/i.test(deckHtmlText);
    if (!needsMermaid) return "";
    const mermaidJs = await HtmlExportManager._fetchLocalText(
      "node_modules/mermaid/dist/mermaid.min.js",
      signal,
    );
    if (!mermaidJs) {
      Logger.warn("HtmlExport: Could not load Mermaid from node_modules; skipping Mermaid script.");
      return "";
    }
    // Verify the bundle is a classic (IIFE/UMD) script, not an ESM module.
    // ESM files start with import/export and would cause a syntax error in
    // a classic <script> tag. If the package ships ESM at this path in a
    // future version, skip inlining rather than emitting broken HTML.
    const firstChars = mermaidJs.slice(0, 200).trim();
    if (/^(import|export)\s/m.test(firstChars)) {
      Logger.warn(
        "HtmlExport: mermaid.min.js appears to be an ESM module, not a classic bundle; skipping Mermaid inlining.",
      );
      return "";
    }
    const escapedMermaidJs = HtmlExportManager.escapeInlineScriptText(mermaidJs);
    return buildInlinedMermaidScriptTag(escapedMermaidJs, "    ");
  }

  /**
   * Resolves the CDN version to use for a vendor package, falling back to a
   * known-good version when the installed one can't be read.
   * @param {string} packageName
   * @param {AbortSignal} [signal]
   * @returns {Promise<string|null>}
   */
  static async _getVendorVersion(packageName, signal = null) {
    const installed = await HtmlExportManager._getInstalledVersion(packageName, signal);
    return installed || HtmlExportManager.FALLBACK_VENDOR_VERSIONS[packageName] || null;
  }

  /**
   * Fetches the installed version of a node_modules package at runtime.
   * @param {string} packageName
   * @param {AbortSignal} [signal]
   * @returns {Promise<string|null>}
   */
  static async _getInstalledVersion(packageName, signal = null) {
    if (signal?.aborted) throw new DOMException("HTML export cancelled", "AbortError");
    try {
      const response = await fetch(`node_modules/${packageName}/package.json`, { signal });
      if (!response.ok) return null;
      const data = await response.json();
      return data.version || null;
    } catch (e) {
      if (e.name === "AbortError") throw e;
      return null;
    }
  }

  /**
   * Fetches a text file from a local path (typically node_modules).
   * @param {string} localPath - Path relative to the project root.
   * @param {AbortSignal} [signal]
   * @returns {Promise<string|null>} The file text, or null if the fetch fails.
   */
  static async _fetchLocalText(localPath, signal = null) {
    if (signal?.aborted) throw new DOMException("HTML export cancelled", "AbortError");
    try {
      const response = await fetch(localPath, { signal });
      if (!response.ok) return null;
      return await response.text();
    } catch (e) {
      if (e.name === "AbortError") throw e;
      return null;
    }
  }

  /**
   * Fetches vendor CSS from node_modules with CDN fallback.
   * Always inlines CSS into the export (no external links).
   */
  static async fetchVendorCss(deck, signal = null) {
    const cssParts = [];
    const deckHtmlText = HtmlExportManager.getDeckHtmlText(deck);

    const fetchCssWithFallback = async (localPath, cdnUrl, name, version = null) => {
      if (signal?.aborted) throw new DOMException("HTML export cancelled", "AbortError");
      for (const url of [localPath, cdnUrl].filter(Boolean)) {
        try {
          const response = await fetch(url, { signal });
          if (!response.ok) continue;

          let css = await response.text();
          css = HtmlExportManager.filterViteArtifactsFromCss(css);
          // Convert relative font URLs to CDN absolute URLs for KaTeX
          if (name === "KaTeX" && version) {
            css = css.replace(
              /url\((["']?)fonts\//g,
              `url($1https://cdn.jsdelivr.net/npm/katex@${version}/dist/fonts/`,
            );
          }
          return `/* ${name} CSS */\n${css}`;
        } catch (e) {
          if (e.name === "AbortError") throw e;
          Logger.warn(`Error loading ${name} CSS`);
        }
      }
      return "";
    };

    const prismVersion = await HtmlExportManager._getVendorVersion("prismjs", signal);
    const katexVersion = await HtmlExportManager._getVendorVersion("katex", signal);

    if (/<pre\b[\s\S]*?<code\b/i.test(deckHtmlText) || /```/.test(deckHtmlText)) {
      const cdnUrl = prismVersion
        ? `https://cdnjs.cloudflare.com/ajax/libs/prism/${prismVersion}/themes/prism-tomorrow.min.css`
        : null;
      cssParts.push(
        await fetchCssWithFallback(
          "node_modules/prismjs/themes/prism-tomorrow.css",
          cdnUrl,
          "Prism",
        ),
      );
    }

    if (/(\$|\$\$|\\\(|\\\[|\\begin)/.test(deckHtmlText)) {
      const cdnUrl = katexVersion
        ? `https://cdn.jsdelivr.net/npm/katex@${katexVersion}/dist/katex.min.css`
        : null;
      cssParts.push(
        await fetchCssWithFallback(
          "node_modules/katex/dist/katex.min.css",
          cdnUrl,
          "KaTeX",
          katexVersion,
        ),
      );
    }

    cssParts.push(`
/* Mermaid Diagram Styles (Standalone) */
.mermaid { display: flex; justify-content: center; width: 100%; margin: 1rem 0; }
.mermaid svg { max-width: 100%; height: auto; background-color: transparent; }
`);

    return cssParts.join("\n\n");
  }

  static extractSlidesHtml(slidesContainer) {
    if (!slidesContainer) return '<div class="slide"></div>';
    const slides = slidesContainer.querySelectorAll(".slide");
    return Array.from(slides)
      .map((slide) => slide.outerHTML)
      .join("\n");
  }

  /**
   * Fetches images from the server and converts them to data URIs in HTML.
   */
  static async inlineImagesInHtml(html, signal = null) {
    if (!html) return html;
    if (signal?.aborted) throw new DOMException("HTML export cancelled", "AbortError");
    // Match src="images/..." / src='images/...' and in-memory blob URLs from imports.
    const imgRe = /src=(["'])((?:images\/|blob:)[^"']+)\1/g;
    const matches = [...html.matchAll(imgRe)];
    if (matches.length === 0) return html;

    const imagePromises = matches.map(async (match) => {
      if (signal?.aborted) throw new DOMException("HTML export cancelled", "AbortError");
      const [fullMatch, quote, imagePath] = match;
      try {
        const fetchUrl = imagePath.startsWith("blob:") ? imagePath : `/${imagePath}`;
        const response = await fetch(fetchUrl, { signal });
        if (!response.ok) return fullMatch;
        const blob = await response.blob();
        if (signal?.aborted) throw new DOMException("HTML export cancelled", "AbortError");
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onabort = () => reject(new DOMException("HTML export cancelled", "AbortError"));
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("Failed to read image"));
          reader.readAsDataURL(blob);
        });
        return `src=${quote}${dataUrl}${quote}`;
      } catch (e) {
        if (e.name === "AbortError") throw e;
        return fullMatch;
      }
    });

    const results = await Promise.all(imagePromises);
    // Apply replacements in reverse order so match indices stay valid
    let result = html;
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      const start = match.index;
      const end = start + match[0].length;
      result = result.slice(0, start) + results[i] + result.slice(end);
    }
    return result;
  }

  /**
   * Inlines images in deck JSON as data URIs.
   */
  static async inlineImagesInDeck(deck, signal = null) {
    if (!deck?.slides) return deck;
    if (signal?.aborted) throw new DOMException("HTML export cancelled", "AbortError");

    const imageRefs = new Set();
    for (const slide of deck.slides) {
      if (slide.areas) {
        for (const area of Object.values(slide.areas)) {
          if (typeof area === "string") {
            const matches = area.matchAll(/src=(["'])((?:images\/|blob:)[^"']+)\1/g);
            for (const m of matches) imageRefs.add(m[2]);
          }
        }
      }
      // Also check background for url(images/...) or url(blob:...)
      if (slide.background) {
        const bgMatches = slide.background.matchAll(
          /url\((["']?)((?:images\/|blob:)[^"')]+)\1?\)/g,
        );
        for (const m of bgMatches) imageRefs.add(m[2]);
      }
    }

    if (imageRefs.size === 0) return deck;

    // Fetch all images and convert to data URIs
    const dataUriMap = {};
    for (const ref of imageRefs) {
      if (signal?.aborted) throw new DOMException("HTML export cancelled", "AbortError");
      try {
        const fetchUrl = ref.startsWith("blob:") ? ref : `/${ref}`;
        const response = await fetch(fetchUrl, { signal });
        if (!response.ok) continue;
        const blob = await response.blob();
        if (signal?.aborted) throw new DOMException("HTML export cancelled", "AbortError");
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onabort = () => reject(new DOMException("HTML export cancelled", "AbortError"));
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("Failed to read image"));
          reader.readAsDataURL(blob);
        });
        dataUriMap[ref] = dataUrl;
      } catch (e) {
        if (e.name === "AbortError") throw e;
        // skip failed images
      }
    }

    if (Object.keys(dataUriMap).length === 0) return deck;

    // Replace image refs in deck JSON
    const inlinedDeck = JSON.parse(JSON.stringify(deck));
    for (const slide of inlinedDeck.slides) {
      if (slide.areas) {
        for (const key of Object.keys(slide.areas)) {
          if (typeof slide.areas[key] === "string") {
            for (const [ref, dataUrl] of Object.entries(dataUriMap)) {
              slide.areas[key] = slide.areas[key].replaceAll(ref, dataUrl);
            }
          }
        }
      }
      if (slide.background) {
        for (const [ref, dataUrl] of Object.entries(dataUriMap)) {
          slide.background = slide.background.replaceAll(ref, dataUrl);
        }
      }
    }
    return inlinedDeck;
  }

  static getDeckHtmlText(deck) {
    if (!deck?.slides) return "";
    return deck.slides
      .map((s) => Object.values(s.areas || {}).join("") + (s.notes || ""))
      .join("\n");
  }

  static generateFilename(deck) {
    const title = DeckLoader.getDisplayTitle(deck);
    return (
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "deck"
    );
  }

  /**
   * Returns the init script injected into exported HTML bundles.
   * The script re-uses the same ContentEnhancer pipeline as the runtime and
   * the PDF build path, so all three export/print surfaces stay in sync.
   */
  static getInitScript() {
    return `
        // Mark this as an exported HTML file (prevents auto-redirect to presenter mode)
        window.__WEBDECK_EXPORTED__ = true;

        // Clear any stored slide state so we always start on slide 1
        try {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('webdeck:')) {
                    localStorage.removeItem(key);
                }
            });
        } catch (e) { /* ignore localStorage errors */ }

        // Re-run the shared enhancer after deck.js has rendered the slides.
        (function runEnhancer() {
            let done = false;
            const enhance = () => {
                if (done) return;
                done = true;
                if (typeof ContentEnhancer !== "undefined" && ContentEnhancer.normalizeEmojiText) {
                    ContentEnhancer.normalizeEmojiText(document.body);
                }
                if (typeof ContentEnhancer !== "undefined" && ContentEnhancer.enhanceRenderedContent) {
                    ContentEnhancer.enhanceRenderedContent(document.body, { renderAllSlides: true, force: true })
                        .catch(e => {
                            if (typeof Logger !== 'undefined') Logger.warn('Enhancement error:', e);
                        });
                }
            };
            window.addEventListener('webdeck:ready', enhance, { once: true });
            if (window.__WEBDECK_READY__) enhance();
        })();
        `;
  }

  static downloadHtml(html, filename) {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  static escapeJsonForHtml(json) {
    return json.replace(/</g, "\\u003C").replace(/<!--/g, "\\u003C!--");
  }

  static escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    // This is a safe read: textContent escapes the input, and innerHTML
    // returns the escaped representation. No untrusted string is assigned.
    return div.innerHTML;
  }
}
