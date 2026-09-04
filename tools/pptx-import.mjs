#!/usr/bin/env node
/**
 * PPTX import CLI.
 *
 * Converts .pptx files to SlideMD markdown (.md deck folder) or .textpack
 * archives using the same extraction pipeline as the in-app PPTX import
 * (PptxExtractor + convertToSlideMd), run in headless Chromium so diagram
 * shape-groups render to PNG and EMF/TIFF images convert exactly like the
 * app's import path.
 *
 * Usage:
 *   node tools/pptx-import.mjs <file.pptx> [more.pptx ...] [options]
 *   node tools/pptx-import.mjs "<dir>" --format textpack
 *
 * Options:
 *   --format md|textpack|both   Output format (default: md)
 *   --out <dir>                 Output directory (default: alongside the input)
 *   --limit <n>                 Only convert the first n slides
 *   --port <n>                  Vite dev server port (default: auto-find from 5195)
 *
 * Output layout:
 *   md       → <out>/<deck name>/<deck name>.md + images/ (app-openable folder)
 *   textpack → <out>/<deck name>.textpack  (text.markdown + assets/)
 *
 * Requires: npx playwright install chromium
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const projectRoot = path.resolve(import.meta.dirname, "..");
const { default: JSZip } = await import(
  pathToFileURL(path.join(projectRoot, "node_modules", "jszip", "dist", "jszip.min.js")).href
);
const { buildImportReport } = await import(
  pathToFileURL(path.join(projectRoot, "src", "data", "pptx-import-warnings.js")).href
);

// Retry each deck once on failure — a hung conversion (stalled diagram crop,
// CDP hiccup) usually succeeds immediately on a second run.
const MAX_ATTEMPTS = 2;

// ── Args ──────────────────────────────────────────────────────────────────────

const CODE_LANGUAGES = new Set([
  "javascript",
  "python",
  "java",
  "cpp",
  "html",
  "css",
  "sql",
  "bash",
  "json",
  "typescript",
]);

function parseArgs(argv) {
  const inputs = [];
  let format = "md";
  let out = null;
  let limit;
  let port;
  let codeLanguage = "";
  let contentImages = true;
  let backgrounds = true;
  let theme = true;
  let pdf = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--format") format = argv[++i];
    else if (a === "--out") out = argv[++i];
    else if (a === "--limit") limit = parseInt(argv[++i], 10);
    else if (a === "--port") port = parseInt(argv[++i], 10);
    else if (a === "--code-language") codeLanguage = argv[++i];
    else if (a === "--no-content-images") contentImages = false;
    else if (a === "--no-backgrounds") backgrounds = false;
    else if (a === "--no-theme") theme = false;
    else if (a === "--pdf") pdf = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: node tools/pptx-import.mjs <file.pptx|dir> [...] [options]

Options:
  --format md|textpack|both   Output format (default: md)
  --out <dir>                 Output directory (default: alongside the input)
  --limit <n>                 Only convert the first n slides
  --code-language <lang>      Tag fenced code blocks with a language
                              (javascript, python, java, cpp, html, css, sql,
                              bash, json, typescript)
  --no-content-images         Drop content <img> tags (diagram crops are kept)
  --no-backgrounds            Drop slide background images
  --no-theme                  Drop background/theme color directives
  --pdf                       Also render each deck to PDF (via build + pdf tools)
  --port <n>                  Vite dev server port (default: auto-find from 5195)

Mirrors the in-app import modal options (code language, content images,
background images, theme) and adds direct PPTX-to-PDF conversion.`);
      process.exit(0);
    } else inputs.push(a);
  }
  if (!["md", "textpack", "both"].includes(format)) {
    console.error(`Error: invalid --format "${format}" (expected md, textpack, or both)`);
    process.exit(1);
  }
  if (codeLanguage && !CODE_LANGUAGES.has(codeLanguage)) {
    console.error(
      `Error: invalid --code-language "${codeLanguage}" (expected one of: ${[...CODE_LANGUAGES].join(", ")})`,
    );
    process.exit(1);
  }
  if (limit !== undefined && (Number.isNaN(limit) || limit <= 0)) {
    console.error(`Error: invalid --limit "${limit}" (expected a positive integer)`);
    process.exit(1);
  }
  if (pdf && !["md", "both"].includes(format)) {
    console.error('Error: --pdf requires md output (use --format md or --format both)');
    process.exit(1);
  }
  return { inputs, format, out, limit, port, codeLanguage, contentImages, backgrounds, theme, pdf };
}

const {
  inputs,
  format,
  out,
  limit,
  port: portArg,
  codeLanguage,
  contentImages,
  backgrounds,
  theme,
  pdf: wantPdf,
} = parseArgs(process.argv.slice(2));
if (inputs.length === 0) {
  console.error("Error: no input .pptx file or directory given. See --help.");
  process.exit(1);
}

const pptxFiles = [];
for (const input of inputs) {
  const resolved = path.resolve(input);
  if (!fs.existsSync(resolved)) {
    console.error(`Error: not found: ${resolved}`);
    process.exit(1);
  }
  if (fs.statSync(resolved).isDirectory()) {
    const found = fs
      .readdirSync(resolved)
      .filter((f) => f.toLowerCase().endsWith(".pptx") && !f.startsWith("~$"))
      .map((f) => path.join(resolved, f));
    if (found.length === 0) {
      console.error(`Error: no .pptx files in directory: ${resolved}`);
      process.exit(1);
    }
    pptxFiles.push(...found);
  } else {
    if (!resolved.toLowerCase().endsWith(".pptx")) {
      console.error(`Error: not a .pptx file: ${resolved}`);
      process.exit(1);
    }
    pptxFiles.push(resolved);
  }
}

function findFreePort(start) {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(start, "127.0.0.1", () => {
      server.close(() => resolve(start));
    });
    server.on("error", () => resolve(findFreePort(start + 1)));
  });
}

// ── Modal-equivalent markdown post-processing ────────────────────────────────
// Mirrors ConversionModal's Import button: strip non-diagram content images,
// strip theme/background directives, and tag opening code fences.

function applyConversionOptions(markdown, { codeLanguage: lang, contentImages: keepImages, theme: keepTheme }) {
  let md = markdown;
  if (!keepImages) {
    // Keep diagram-derived images (data-diagram="true") — they are content.
    md = md.replace(/<img\s+(?![^>]*data-diagram="true")[^>]*>/g, "");
  }
  if (!keepTheme) {
    md = md.replace(/^\s*background:.*$/gm, "").replace(/^\s*theme:.*$/gm, "").replace(/\n{3,}/g, "\n\n");
  }
  if (lang) {
    // Tag opening fences only — use a state machine to skip closing fences.
    const lines = md.split("\n");
    let inCode = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === "```") {
        lines[i] = inCode ? "```" : "```" + lang;
        inCode = !inCode;
      }
    }
    md = lines.join("\n");
  }
  return md;
}

function runTool(args, cwd = projectRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", args, { cwd, stdio: ["ignore", "inherit", "inherit"] });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${args.join(" ")} exited ${code}`))));
    child.on("error", reject);
  });
}

async function renderPdf(deckMdPath, deckName, outDir) {
  // build.mjs: <deck>.md → dist/<deck>.html ; pdf.mjs: dist/<deck>.html → dist/<deck>.pdf
  await runTool([path.join(projectRoot, "tools", "build.mjs"), "--", deckMdPath]);
  const distHtml = path.join(projectRoot, "dist", `${deckName}.html`);
  await runTool([path.join(projectRoot, "tools", "pdf.mjs"), distHtml]);
  const distPdf = path.join(projectRoot, "dist", `${deckName}.pdf`);
  const finalPdf = path.join(outDir, `${deckName}.pdf`);
  fs.mkdirSync(outDir, { recursive: true });
  // copy+unlink: renameSync throws EXDEV across mounts
  fs.copyFileSync(distPdf, finalPdf);
  fs.rmSync(distPdf, { force: true });
  fs.rmSync(distHtml, { force: true });
  return finalPdf;
}

// ── Bridge server (moves bulk data over plain HTTP) ──────────────────────────
// Bulk data must not cross the Playwright evaluate bridge — 100MB+ decks
// dead-lock CDP serialization in both directions. The browser GETs the PPTX
// bytes from this server and POSTs the result back to it instead.
// Serving the PPTX from here (not Vite's /@fs) avoids Vite's fs.allow
// restriction, so inputs can live anywhere on disk.

function startBridgeServer(pptxPaths) {
  const results = new Map();
  const errors = new Map();
  const waiters = new Map();
  const server = http.createServer((req, res) => {
    // The page origin (Vite port) differs from this port, so CORS is required.
    res.setHeader("Access-Control-Allow-Origin", "*");
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET") {
      const idx = Number(url.pathname.split("/").pop());
      const pptxPath = pptxPaths[idx];
      if (!pptxPath || Number.isNaN(idx)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const buf = fs.readFileSync(pptxPath);
      res.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Length": buf.length,
      });
      res.end(buf);
      return;
    }
    // POST: the path after /result/ is the "<deckIndex>/<attempt>" key.
    let key = url.pathname.replace(/^\/result\//, "");
    try {
      key = decodeURIComponent(key);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      results.set(key, Buffer.concat(chunks));
      res.writeHead(204);
      res.end();
      const waiter = waiters.get(key);
      if (waiter) {
        waiters.delete(key);
        waiter();
      }
    });
  });
  return {
    listen: (port2) =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port2, "127.0.0.1", () => resolve(port2));
      }),
    // Called when the in-page evaluate fails before it could POST a result.
    // `key` is "<deckIndex>/<attempt>" so superseded attempts cannot poison
    // a retry's result slot.
    fail(key, message) {
      errors.set(key, message);
      const waiter = waiters.get(key);
      if (waiter) {
        waiters.delete(key);
        waiter();
      }
    },
    async waitFor(key, timeoutMs = 10 * 60 * 1000) {
      if (results.has(key)) return results.get(key);
      if (errors.has(key)) throw new Error(errors.get(key));
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.delete(key);
          reject(new Error(`conversion timed out after ${timeoutMs / 1000}s`));
        }, timeoutMs);
        waiters.set(key, () => {
          clearTimeout(timer);
          resolve();
        });
      });
      if (errors.has(key)) throw new Error(errors.get(key));
      return results.get(key);
    },
    close: () => server.close(),
  };
}

// ── Vite server (serves the app's src modules to the browser) ────────────────

const port = portArg || (await findFreePort(5195));
const viteBin = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const server = spawn(process.execPath, [viteBin, "--port", String(port), "--strictPort"], {
  cwd: projectRoot,
  stdio: "pipe",
  env: { ...process.env, WEBDECK_NO_OPEN: "1" },
});
const serverExited = new Promise((resolve) => server.on("exit", (code) => resolve(code)));
const results = startBridgeServer(pptxFiles);
let browser;
try {
  // Wait for Vite by polling the HTTP port instead of matching its startup
  // banner: a cold CI runner (fresh npm ci, empty Vite dep cache) can take
  // well over 30s to print the banner, and stdout text is not a contract.
  let serverExitCode = null;
  server.once("exit", (code) => {
    serverExitCode = code;
  });
  const viteUp = new Promise((resolve, reject) => {
    const started = Date.now();
    const attempt = async () => {
      if (serverExitCode !== null) {
        reject(new Error(`vite dev server exited early (code ${serverExitCode})`));
        return;
      }
      try {
        const res = await fetch(`http://127.0.0.1:${port}/index.html`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          resolve();
          return;
        }
      } catch {
        /* not up yet — retry below */
      }
      if (Date.now() - started > 120_000) {
        reject(new Error("vite dev server did not become reachable within 120s"));
        return;
      }
      setTimeout(attempt, 500);
    };
    attempt();
  });
  server.stderr.on("data", (d) => process.stderr.write(d));
  await viteUp;

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.error("[browser error]", err.message));

  const resultPort = await findFreePort(5295);
  await results.listen(resultPort);

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  let failures = 0;
  let lastOutDir = null;
  const evalPromises = [];
  const warnOverwrite = (target) => {
    if (fs.existsSync(target)) console.log(`\n  note: overwriting existing ${path.basename(target)}`);
  };
  for (let i = 0; i < pptxFiles.length; i++) {
    const pptxPath = pptxFiles[i];
    const deckName = path.basename(pptxPath).replace(/\.pptx$/i, "");
    process.stdout.write(`\nConverting ${path.basename(pptxPath)} ... `);
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // Result keys are scoped per attempt, so a late POST (success or error)
      // from a superseded attempt can never be consumed by the retry — the
      // in-app modal guards the same race with an attempt token.
      const resultKey = `${i}/${attempt}`;
      // Set once conversion output (markdown/textpack) has been written; a
      // later stage failing (e.g. --pdf rendering) must not re-convert the
      // whole deck.
      let outputsWritten = false;
      try {
        const started = Date.now();

        // The page fetches the PPTX bytes from the bridge server and POSTs the
        // result back to it — nothing bulky crosses the evaluate bridge.
        evalPromises.push(
          page.evaluate(
            async ({ pptxUrl, resultUrl, limit, importBackgrounds }) => {
              try {
                const { PptxExtractor } = await import(`/src/data/pptx-extractor.js?t=${Date.now()}`);
                const { convertToSlideMd } = await import(`/src/data/pptx-to-slide-md.js?t=${Date.now()}`);
                const res = await fetch(pptxUrl);
                if (!res.ok) throw new Error(`pptx fetch failed: ${res.status}`);
                const buffer = await res.arrayBuffer();
                const extraction = await PptxExtractor.extract(buffer, limit);
                const markdown = convertToSlideMd(extraction, "presentation", {
                  importBackgrounds,
                });
                const images = [];
                const seen = new Set();
                for (const slide of extraction.slides) {
                  for (const el of slide.elements) {
                    if (!el.base64 || !el.ref) continue;
                    const name = el.ref.split("/").pop().replace(/\.(emf|wmf)$/i, ".png");
                    if (seen.has(name)) continue;
                    seen.add(name);
                    images.push({ name, base64: el.base64.replace(/^data:[^;]*;base64,/, "") });
                  }
                }
                await fetch(resultUrl, {
                  method: "POST",
                  body: JSON.stringify({
                    markdown,
                    images,
                    slideCount: extraction.slides.length,
                    warnings: extraction.warnings?.warnings || [],
                  }),
                });
              } catch (e) {
                await fetch(resultUrl, { method: "POST", body: JSON.stringify({ error: String(e && e.message ? e.message : e) }) });
              }
            },
            {
              pptxUrl: `http://127.0.0.1:${resultPort}/pptx/${i}`,
              resultUrl: `http://127.0.0.1:${resultPort}/result/${resultKey}`,
              limit,
              importBackgrounds: backgrounds,
            },
          ).catch((e) => results.fail(resultKey, e?.message ?? String(e))), // surface bridge failures immediately
        );

        const raw = await results.waitFor(resultKey);
        const result = JSON.parse(raw.toString("utf8"));
        if (result.error) throw new Error(result.error);

        const outDir = path.resolve(out ?? path.dirname(pptxPath));
        lastOutDir = outDir;
        fs.mkdirSync(outDir, { recursive: true });

        const finalMarkdown = applyConversionOptions(result.markdown, {
          codeLanguage,
          contentImages,
          theme,
        });

        if (format === "md" || format === "both") {
          const deckDir = path.join(outDir, deckName);
          warnOverwrite(deckDir);
          const imgDir = path.join(deckDir, "images");
          fs.mkdirSync(imgDir, { recursive: true });
          for (const img of result.images) {
            fs.writeFileSync(path.join(imgDir, img.name), Buffer.from(img.base64, "base64"));
          }
          const deckMdPath = path.join(deckDir, `${deckName}.md`);
          fs.writeFileSync(deckMdPath, finalMarkdown);
          if (wantPdf) {
            process.stdout.write("  rendering PDF ... ");
            const pdfPath = await renderPdf(deckMdPath, deckName, outDir);
            console.log(`ok — ${path.relative(process.cwd(), pdfPath)}`);
          }
        }

        if (format === "textpack" || format === "both") {
          warnOverwrite(path.join(outDir, `${deckName}.textpack`));
          const zip = new JSZip();
          zip.file("text.markdown", finalMarkdown);
          const assets = zip.folder("assets");
          for (const img of result.images) assets.file(img.name, img.base64, { base64: true });
          const buf = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
          fs.writeFileSync(path.join(outDir, `${deckName}.textpack`), buf);
        }
        outputsWritten = true;

        console.log(
          `ok — ${result.slideCount} slides, ${result.images.length} images (${Math.round((Date.now() - started) / 100) / 10}s)`,
        );
        const report = buildImportReport(result.warnings || [], result.slideCount, {
          maxDetails: Infinity,
        });
        if (report.summary) {
          console.log(`  review needed: ${report.summary}`);
          for (const line of report.details) console.log(`   - ${line}`);
        }
        break;
      } catch (e) {
        if (attempt < MAX_ATTEMPTS && !outputsWritten) {
          console.log(`attempt ${attempt} failed (${e.message}) — retrying ...`);
          process.stdout.write(`Converting ${path.basename(pptxPath)} ... `);
          continue;
        }
        failures++;
        console.log(`FAILED: ${e.message}`);
      }
    }
  }

  await Promise.allSettled(evalPromises);
  if (browser) await browser.close();
  console.log(`\nDone: ${pptxFiles.length - failures}/${pptxFiles.length} converted (${format})`);
  if (lastOutDir) console.log(`Output: ${path.relative(process.cwd(), lastOutDir) || "."}`);
  process.exitCode = failures > 0 ? 1 : 0;
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
  await serverExited;
  results.close();
}
