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
            file: path.relative(root, file),
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
            file: path.relative(root, file),
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
    const documentedFallbacks = new Set([
      // PPTX import: loads metric-compatible fonts for shape text measurement.
      // Non-fatal: skipped when offline, short timeout, import always completes.
      "src/data/pptx-diagram-cropper.js",
      // HTML export: CDN URLs are fallbacks used only when node_modules fetch
      // fails. Primary path is local node_modules inlining.
      "src/renderer/html-export-manager.js",
    ]);
    const violations = [];
    for (const file of allFiles) {
      const rel = path.relative(root, file);
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
});
