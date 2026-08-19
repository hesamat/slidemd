import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const srcDir = path.join(root, "src");

/**
 * Layer order: lower layers must not import from higher layers.
 * core → data → renderer → engine → editor → ui
 */
const LAYER_ORDER = ["core", "data", "renderer", "engine", "editor", "ui"];

/**
 * Returns the layer index for a file path within src/, or -1 if not in a known layer.
 */
function layerOf(filePath) {
  const rel = path.relative(srcDir, filePath).replace(/\\/g, "/");
  for (let i = 0; i < LAYER_ORDER.length; i++) {
    if (rel.startsWith(LAYER_ORDER[i] + "/")) return i;
  }
  return -1;
}

/**
 * Recursively collect all .js files under a directory.
 */
function collectJsFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(full, acc);
    } else if (entry.name.endsWith(".js")) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Extract import paths from a JS source string.
 * Matches both static and dynamic imports.
 */
function extractImportPaths(source) {
  const paths = [];
  // Static: import ... from "..."
  const staticRe = /(?:import\s+[^;]*?\s+from\s*|import\s*)["']([^"']+)["']/g;
  let m;
  while ((m = staticRe.exec(source)) !== null) {
    paths.push(m[1]);
  }
  // Dynamic: import("...")
  const dynRe = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = dynRe.exec(source)) !== null) {
    paths.push(m[1]);
  }
  return paths;
}

/**
 * Resolve a relative import path to an absolute file path.
 * Returns null if it's a bare specifier (npm package) or can't be resolved.
 */
function resolveImport(importerFile, importPath) {
  if (!importPath.startsWith(".")) return null; // bare specifier
  const dir = path.dirname(importerFile);
  const resolved = path.resolve(dir, importPath);
  // Try exact, .js, /index.js
  for (const candidate of [resolved, resolved + ".js", path.join(resolved, "index.js")]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

describe("layering invariants", () => {
  const allFiles = collectJsFiles(srcDir);

  it("no layer imports from a higher layer (core→data→renderer→engine→editor→ui)", () => {
    const violations = [];
    for (const file of allFiles) {
      const importerLayer = layerOf(file);
      if (importerLayer < 0) continue;
      const source = fs.readFileSync(file, "utf8");
      const importPaths = extractImportPaths(source);
      for (const imp of importPaths) {
        const resolved = resolveImport(file, imp);
        if (!resolved) continue;
        const targetLayer = layerOf(resolved);
        if (targetLayer < 0) continue;
        if (targetLayer > importerLayer) {
          violations.push({
            file: path.relative(root, file).replace(/\\/g, "/"),
            import: imp,
            importerLayer: LAYER_ORDER[importerLayer],
            targetLayer: LAYER_ORDER[targetLayer],
          });
        }
      }
    }
    if (violations.length > 0) {
      const details = violations
        .map((v) => `  ${v.file} (${v.importerLayer}) → "${v.import}" (${v.targetLayer})`)
        .join("\n");
      expect.fail(`Found ${violations.length} upward layer import(s):\n${details}`);
    }
  });

  it("no vendor type references in JSDoc for core/ or data/ (except boundary modules)", () => {
    const vendorPkgs = ["pptxtojson", "@aiden0z/pptx-renderer", "@codemirror"];
    const violations = [];
    for (const file of allFiles) {
      const layer = layerOf(file);
      if (layer !== 0 && layer !== 1) continue; // only core/ and data/
      const source = fs.readFileSync(file, "utf8");
      for (const pkg of vendorPkgs) {
        const re = new RegExp(`import\\(['"]${pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]\\)`);
        if (re.test(source)) {
          violations.push({
            file: path.relative(root, file).replace(/\\/g, "/"),
            pkg,
          });
        }
      }
    }
    if (violations.length > 0) {
      const details = violations
        .map((v) => `  ${v.file} references vendor type ${v.pkg}`)
        .join("\n");
      expect.fail(`Found ${violations.length} vendor type leak(s) in core/ or data/:\n${details}`);
    }
  });

  it("no external CDN URLs in source (offline-first, excluding test files and documented fallbacks)", () => {
    const cdnPatterns = [
      "cdn.jsdelivr.net",
      "unpkg.com",
      "cdnjs.cloudflare.com",
      "fonts.googleapis.com",
      "fonts.gstatic.com",
    ];
    // Files with documented, non-fatal CDN fallbacks (best-effort enhancements
    // with local-first paths and timeouts). These are acceptable deviations.
    // ─── IMPORTANT ───────────────────────────────────────────────────────
    // This list must NOT grow without review. Each entry must have a comment
    // explaining why the CDN reference is non-fatal and what the local-first
    // primary path is. The test below asserts the exact count to prevent
    // silent additions.
    // ─────────────────────────────────────────────────────────────────────
    const documentedFallbacks = new Set([
      // PPTX import: loads metric-compatible fonts for shape text measurement.
      // Non-fatal: skipped when offline, short timeout, import always completes.
      "src/data/pptx-diagram-cropper.js",
      // HTML export: CDN URLs are fallbacks used only when node_modules fetch
      // fails. Primary path is local node_modules inlining.
      "src/renderer/html-export-manager.js",
    ]);
    // Lock the count — any new entry requires explicit review and updating
    // this expected number.
    expect(documentedFallbacks.size).toBe(2);

    const violations = [];
    for (const file of allFiles) {
      const rel = path.relative(root, file).replace(/\\/g, "/");
      // Skip test files — they legitimately reference CDN URLs in assertions.
      if (rel.includes("__tests__/") || rel.includes("tools/")) continue;
      if (documentedFallbacks.has(rel)) continue;
      const source = fs.readFileSync(file, "utf8");
      for (const pattern of cdnPatterns) {
        if (source.includes(pattern)) {
          violations.push({
            file: rel,
            pattern,
          });
        }
      }
    }
    if (violations.length > 0) {
      const details = violations.map((v) => `  ${v.file} contains ${v.pattern}`).join("\n");
      expect.fail(`Found ${violations.length} external CDN reference(s):\n${details}`);
    }
  });

  it("all .innerHTML= assignments in renderer/ and engine/ use sanitizeAreaHtml or static templates", () => {
    // Scan for .innerHTML = assignments that interpolate dynamic values.
    // Safe patterns:
    //   - .innerHTML = "" (clearing)
    //   - .innerHTML = sanitizeAreaHtml(...) or SlideRenderer.sanitizeAreaHtml(...)
    //   - .innerHTML = STATIC_STRING (no ${} interpolation, no variable refs)
    //   - .innerHTML = someConstant (assigned from a string literal elsewhere)
    //
    // This test flags any .innerHTML = that references a variable or template
    // literal with interpolation but does NOT call sanitizeAreaHtml on the
    // right-hand side. It may produce false positives for trusted static
    // content — those should be suppressed by adding the file to the
    // trustedStaticContent set below with a justification comment.
    const trustedStaticContent = new Set([
      // slide-renderer.js: showBootError escapes < and > manually.
      "src/renderer/slide-renderer.js",
      // content-enhancer.js: enhances already-sanitized slide content with
      // trusted library output (Prism, KaTeX, Mermaid).
      "src/renderer/content-enhancer.js",
      // html-export-manager.js: builds the export HTML template from
      // already-escaped/sanitized components.
      "src/renderer/html-export-manager.js",
      // print-manager.js: uses the print iframe with sanitized content.
      "src/renderer/print-manager.js",
      // notification.js: uses static template strings.
      "src/renderer/notification.js",
      // slide-navigator.js: uses static HTML strings for badges/buttons.
      "src/engine/slide-navigator.js",
    ]);

    const violations = [];
    const layers = ["renderer", "engine"];
    for (const file of allFiles) {
      const layer = layerOf(file);
      if (!layers.includes(LAYER_ORDER[layer])) continue;
      const rel = path.relative(root, file).replace(/\\/g, "/");
      if (trustedStaticContent.has(rel)) continue;
      const source = fs.readFileSync(file, "utf8");
      // Match .innerHTML = <expression> — capture across lines until
      // a semicolon followed by newline (end of statement).
      const innerHtmlRe = /\.innerHTML\s*=\s*([\s\S]*?);\s*\n/g;
      let m;
      while ((m = innerHtmlRe.exec(source)) !== null) {
        const rhs = m[1].trim();
        // Safe: clearing
        if (rhs === '""' || rhs === "''" || rhs === "``") continue;
        // Safe: sanitizeAreaHtml call (direct or via a method that wraps it)
        if (rhs.includes("sanitizeAreaHtml")) continue;
        // Safe: DOMPurify.sanitize call
        if (rhs.includes("DOMPurify.sanitize")) continue;
        // Safe: renderNotes() wraps output through sanitizeAreaHtml
        if (rhs.includes("renderNotes")) continue;
        // Safe: pure string literal (no interpolation, no variable)
        if (/^["'`][^"'`]*["'`]$/.test(rhs) && !rhs.includes("${")) continue;
        // Flag: anything else that might interpolate dynamic content
        if (rhs.includes("${") || /[a-zA-Z_]/.test(rhs.replace(/["'`]/g, ""))) {
          violations.push({
            file: rel,
            line: source.slice(0, m.index).split("\n").length,
            snippet: m[0].slice(0, 80),
          });
        }
      }
    }
    if (violations.length > 0) {
      const details = violations.map((v) => `  ${v.file}:${v.line} — ${v.snippet}`).join("\n");
      expect.fail(
        `Found ${violations.length} potentially unsafe .innerHTML= assignment(s) in renderer/ or engine/.\n` +
          `If the content is trusted/static, add the file to trustedStaticContent with a justification.\n${details}`,
      );
    }
  });

  it("deck.js passes all required DI dependencies to DeckController", () => {
    const deckJs = fs.readFileSync(path.join(root, "deck.js"), "utf8");
    const controllerJs = fs.readFileSync(path.join(srcDir, "engine", "deck-controller.js"), "utf8");

    // Extract DI option names from the DeckController constructor's
    // destructured parameter block only (not the whole file).
    const ctorMatch = controllerJs.match(/constructor\s*\([^)]*\{([^}]*)\}\s*=\s*\{[^}]*\}/s);
    if (!ctorMatch) {
      expect.fail("Could not find DeckController constructor parameter block");
    }
    const ctorParams = ctorMatch[1];
    // Matches: optionName = null,
    const diRe = /(\w+)\s*=\s*null\s*,?/g;
    const requiredDeps = new Set();
    let m;
    while ((m = diRe.exec(ctorParams)) !== null) {
      // Skip non-DI options (deckStore is not an editor/ui dep)
      if (m[1] === "deckStore") continue;
      requiredDeps.add(m[1]);
    }

    // Check that each required dep appears in the DeckController construction
    // in deck.js. We look for the pattern: depName: (some value) inside the
    // new DeckController(...) call.
    const ctorCallMatch = deckJs.match(/new DeckController\s*\([^)]*\{([^}]*)\}/s);
    if (!ctorCallMatch) {
      expect.fail("Could not find DeckController construction in deck.js");
    }
    const ctorCallArgs = ctorCallMatch[1];
    const missing = [];
    for (const dep of requiredDeps) {
      const usageRe = new RegExp(`${dep}\\s*:\\s*[^,}\\s]+`);
      if (!usageRe.test(ctorCallArgs)) {
        missing.push(dep);
      }
    }
    if (missing.length > 0) {
      expect.fail(
        `deck.js is missing DI dependency(ies) for DeckController: ${missing.join(", ")}. ` +
          `Add them to the constructor call in deck.js.`,
      );
    }
  });
});
