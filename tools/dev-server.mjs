#!/usr/bin/env node
/**
 * SlideMD Dev Server
 *
 * Lightweight CLI dev server for SlideMD presentations.
 *
 * Supported input formats:
 *   slides.md          — markdown file with sidecar images/ folder
 *   deck.textpack      — ZIP archive containing text.markdown + assets/
 *
 * Usage:
 *   node tools/dev-server.mjs <path> [--port 8000]
 *
 * Examples:
 *   node tools/dev-server.mjs slides.md
 *   node tools/dev-server.mjs slides.md --port 3000
 *   node tools/dev-server.mjs deck.textpack
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Persistent temp directory for PPTX import images.  Images live here during
// the session so they don't pollute the currently-loaded deck's images/ folder.
// When the user saves the deck as .md, the client downloads these images and
// writes them next to the .md file.  The directory is NOT wiped on server
// restart — that would break decks saved as .md with images/ references.
const PPTX_IMPORT_DIR = path.join(ROOT, ".webdeck-pptx-imports");
const PPTX_IMPORT_IMAGES_DIR = path.join(PPTX_IMPORT_DIR, "images");

// Persistent directory for images from exported AI prompts. When the user
// exports a prompt, the current deck's images are copied here so they remain
// available even after the user loads a different deck and imports the AI
// result. The /images/* handler checks this as a fallback after the current
// deck's imagesDir. NOT wiped on restart — same rationale as PPTX imports.
const EXPORTED_IMAGES_DIR = path.join(ROOT, ".webdeck-exported", "images");

// Persistent file for the source deck's per-slide directives (theme,
// background, mediaFullBleed, areaBg) captured at export time. The import
// flow reads this to gap-fill directives the external AI dropped, mirroring
// the live orchestrator's extractDirectives + injectDirectives step. NOT
// wiped on restart — same rationale as the exported images directory.
const EXPORTED_DIRECTIVES_FILE = path.join(ROOT, ".webdeck-exported", "directives.json");

// ── Args ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let PORT = 8000;
let INPUT_ARG = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && i + 1 < args.length) {
    PORT = parseInt(args[i + 1], 10);
    if (isNaN(PORT)) {
      console.error("Error: Invalid port number:", args[i + 1]);
      process.exit(1);
    }
    i++;
  } else if (!args[i].startsWith("--")) {
    INPUT_ARG = args[i];
  }
}

// ── MIME types ────────────────────────────────────────────────────────────────

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

const IMAGE_RE = /\.(jpe?g|png|gif|webp|svg|avif)$/i;

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * @typedef {{ mdFile: string, imagesDir: string, label: string }} DeckFormat
 */

/**
 * Detect the input format and return normalized paths.
 * @param {string} inputPath
 * @returns {DeckFormat}
 */
function detectFormat(inputPath) {
  const resolved = path.resolve(inputPath);

  if (!fs.existsSync(resolved)) {
    console.error(`Error: File not found: ${resolved}`);
    process.exit(1);
  }

  // .textpack (ZIP archive)
  if (resolved.endsWith(".textpack")) {
    return { mdFile: resolved, imagesDir: "", label: "textpack" };
  }

  // .md file — auto-discover images/ in same directory
  if (resolved.endsWith(".md")) {
    const dir = path.dirname(resolved);
    const imagesDir = path.resolve(dir, "images");
    const relative = path.relative(dir, imagesDir);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      console.error(`Error: Invalid path`);
      process.exit(1);
    }
    return { mdFile: resolved, imagesDir, label: "md" };
  }

  console.error(`Error: Unsupported file type: ${resolved}`);
  console.error("  Expected: *.md file or *.textpack archive");
  process.exit(1);
}

// ── Textpack extraction ──────────────────────────────────────────────────────

/**
 * Extract a .textpack ZIP to a temp directory.
 * Returns the same shape as detectFormat for .md files.
 * @param {string} textpackPath
 * @returns {Promise<DeckFormat>}
 */
async function extractTextpack(textpackPath) {
  const resolvedPath = path.resolve(textpackPath);
  if (path.isAbsolute(textpackPath) && textpackPath.includes('..')) {
    console.error("Error: Invalid file path");
    process.exit(1);
  }
  const buf = fs.readFileSync(resolvedPath);
  // Validate ZIP magic bytes
  if (buf.length < 2 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    console.error("Error: Not a valid ZIP archive (missing PK header)");
    process.exit(1);
  }
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buf);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "slidemd-"));

  // Extract text.markdown
  const mdEntry = zip.file("text.markdown") || zip.file("deck.md");
  if (!mdEntry) {
    console.error("Error: .textpack missing text.markdown or deck.md");
    process.exit(1);
  }
  const mdContent = await mdEntry.async("text");
  const mdFile = path.join(tmpDir, "slides.md");
  fs.writeFileSync(mdFile, mdContent, "utf8");

  // Extract assets/ to images/
  const imagesDir = path.join(tmpDir, "images");
  fs.mkdirSync(imagesDir, { recursive: true });

  const assetsFolder = zip.folder("assets") || zip.folder("images");
  if (assetsFolder) {
    const entries = [];
    assetsFolder.forEach((p, entry) => {
      if (!entry.dir) entries.push(entry);
    });
    for (const entry of entries) {
      const data = await entry.async("nodebuffer");
      const name = path.basename(entry.name);
      fs.writeFileSync(path.join(imagesDir, name), data);
    }
  }

  return { mdFile, imagesDir, label: `textpack → ${path.basename(resolvedPath)}` };
}

// ── SSE ───────────────────────────────────────────────────────────────────────

/** @type {Set<http.ServerResponse>} */
const sseClients = new Set();

function sendReloadEvent() {
  for (const client of sseClients) {
    client.write("data: reload\n\n");
  }
}

// ── File watching ─────────────────────────────────────────────────────────────

let watchTimeout = null;
const lastWrittenContentHashes = new Map();

function hashContent(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function scheduleReload(format) {
  if (watchTimeout) clearTimeout(watchTimeout);
  watchTimeout = setTimeout(async () => {
    if (!format || !fs.existsSync(format.mdFile)) {
      sendReloadEvent();
      watchTimeout = null;
      return;
    }
    const current = fs.readFileSync(format.mdFile, "utf8");
    const currentHash = hashContent(current);
    const lastHash = lastWrittenContentHashes.get(format.mdFile);
    if (currentHash === lastHash) {
      // This is the echo of our own write — don't reload.
      watchTimeout = null;
      return;
    }
    lastWrittenContentHashes.delete(format.mdFile);
    sendReloadEvent();
    watchTimeout = null;
  }, 100);
}

function startWatching(format) {
  const watchPaths = [format.mdFile];

  for (const p of watchPaths) {
    if (!fs.existsSync(p)) continue;
    fs.watch(p, { recursive: p !== format.mdFile }, () => {
      scheduleReload(format);
    });
  }
}

// ── Upload filename generation ────────────────────────────────────────────────

/**
 * Generate a human-readable unique filename for an uploaded image.
 * Format: sanitized-name-XXXX.ext (e.g., architecture-a3f2.png)
 * @param {string} originalName
 * @returns {string}
 */
function generateUploadFilename(originalName) {
  const rawExt = path.extname(originalName);
  const ext = rawExt.toLowerCase() || ".png";
  const base = path.basename(originalName, rawExt);
  // Sanitize: lowercase, replace spaces/special chars with hyphens, trim
  const sanitized = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  const hash = randomUUID().slice(0, 4);
  return `${sanitized || "image"}-${hash}${ext}`;
}

// ── Multipart parser ─────────────────────────────────────────────────────────

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_UPLOAD_BATCH_BYTES = 100 * 1024 * 1024;

function readBody(req, maxBytes = MAX_UPLOAD_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error(`File too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)`));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * Extract the filename from a multipart part's headers.
 * Quoted names may contain spaces, so they are matched before bare tokens.
 * @param {string} headerStr
 * @returns {string|null}
 */
function getPartFilename(headerStr) {
  const match = /filename=(?:"([^"]*)"|([^";\s]+))/i.exec(headerStr);
  if (!match) return null;
  const filename = match[1] ?? match[2];
  return filename ? filename : null;
}

function parseMultipart(body, boundary) {
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const endBuf = Buffer.from(`--${boundary}--`);

  let start = body.indexOf(boundaryBuf);
  if (start === -1) throw new Error("Malformed multipart body");
  start += boundaryBuf.length;

  if (body[start] === 0x0d && body[start + 1] === 0x0a) start += 2;

  const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), start);
  if (headerEnd === -1) throw new Error("Missing multipart headers");
  const headerStr = body.slice(start, headerEnd).toString("utf8");

  const filename = getPartFilename(headerStr);
  if (!filename) throw new Error("No filename in upload");

  const dataStart = headerEnd + 4;
  let dataEnd = body.indexOf(boundaryBuf, dataStart);
  if (dataEnd === -1) dataEnd = body.indexOf(endBuf, dataStart);
  if (dataEnd === -1) throw new Error("Missing closing boundary");

  let data = body.slice(dataStart, dataEnd);
  if (data.length >= 2 && data[data.length - 2] === 0x0d && data[data.length - 1] === 0x0a) {
    data = data.slice(0, data.length - 2);
  }

  return { filename, data };
}

/**
 * Extract the boundary token from a multipart Content-Type header.
 * @param {string} contentType
 * @returns {string|null}
 */
function getMultipartBoundary(contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType || "");
  if (!match) return null;
  return match[1] || match[2] || null;
}

function parseMultipartAll(body, boundary) {
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const endBuf = Buffer.from(`--${boundary}--`);
  const parts = [];

  let start = body.indexOf(boundaryBuf);
  if (start === -1) throw new Error("Malformed multipart body");

  while (true) {
    const boundaryStart = start;
    start += boundaryBuf.length;

    if (body.indexOf(endBuf, boundaryStart) === boundaryStart) break;

    if (body[start] === 0x0d && body[start + 1] === 0x0a) start += 2;

    const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), start);
    if (headerEnd === -1) break;
    const headerStr = body.slice(start, headerEnd).toString("utf8");

    const filename = getPartFilename(headerStr);
    const dataStart = headerEnd + 4;
    let dataEnd = body.indexOf(boundaryBuf, dataStart);
    if (dataEnd === -1) dataEnd = body.indexOf(endBuf, dataStart);
    if (dataEnd === -1) break;

    let data = body.slice(dataStart, dataEnd);
    if (data.length >= 2 && data[data.length - 2] === 0x0d && data[data.length - 1] === 0x0a) {
      data = data.slice(0, data.length - 2);
    }

    if (filename) {
      parts.push({ filename, data });
    }

    if (body.indexOf(endBuf, dataEnd) === dataEnd) break;
    start = dataEnd;
  }

  return parts;
}

// ── JSON body parser ─────────────────────────────────────────────────────────

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Verify the request came from the same origin as the dev server.
 * Browsers send the Origin header for cross-site and non-GET requests;
 * if it is missing we fall back to the Referer header.
 */
function isSameOrigin(req) {
  const host = req.headers.host;
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  if (!host) return false;
  // Honor the actual request scheme so HTTPS dev servers (or reverse proxies)
  // are not treated as cross-origin. The dev server itself knows whether it
  // is serving over TLS via req.connection.encrypted.
  const scheme = req.socket?.encrypted ? "https" : "http";
  const expected = `${scheme}://${host}`;
  if (origin) return origin === expected;
  if (referer) {
    try {
      return new URL(referer).origin === expected;
    } catch {
      return false;
    }
  }
  return false;
}

// ── Request handler ───────────────────────────────────────────────────────────

/**
 * @param {DeckFormat} format
 */
function createHandler(format) {
  let loadMutex = Promise.resolve();

  return async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // ── SSE ──
    if (pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("data: connected\n\n");

      sseClients.add(res);

      req.on("close", () => {
        sseClients.delete(res);
      });
      return;
    }

    // ── POST /api/deck/reset ──
    if (pathname === "/api/deck/reset" && req.method === "POST") {
      if (!isSameOrigin(req)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Cross-origin write not allowed" }));
        return;
      }
      format = null;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // ── GET /api/deck ──
    if (pathname === "/api/deck" && req.method === "GET") {
      if (!format || !format.mdFile) {
        // Return 200 with empty body so the frontend falls through to the welcome deck
        // without a 404 error in the browser console.
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({}));
        return;
      }
      try {
        const markdown = fs.readFileSync(format.mdFile, "utf8");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ markdown, type: "md" }));
      } catch (e) {
        console.error("[deck:get] Error reading", format?.mdFile, ":", e.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // ── POST /api/deck ──
    if (pathname === "/api/deck" && req.method === "POST") {
      if (!format) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No deck loaded" }));
        return;
      }
      if (!isSameOrigin(req)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Cross-origin write not allowed" }));
        return;
      }
      try {
        const { markdown } = await readJsonBody(req);
        lastWrittenContentHashes.set(format.mdFile, hashContent(markdown));
        fs.writeFileSync(format.mdFile, markdown, "utf8");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // ── POST /api/deck/load ──
    // Dynamically load a deck by directory path (e.g., when opening example deck)
    if (pathname === "/api/deck/load" && req.method === "POST") {
      if (!isSameOrigin(req)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Cross-origin write not allowed" }));
        return;
      }
      loadMutex = loadMutex
        .then(async () => {
          try {
            const { dir } = await readJsonBody(req);
            const base = path.resolve(ROOT);
            const deckDir = path.resolve(base, dir);
            const relative = path.relative(base, deckDir);
            if (relative.startsWith('..') || path.isAbsolute(relative)) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Invalid deck path" }));
              return;
            }
            const mdFile = path.join(deckDir, "slides.md");
            const imagesDir = path.join(deckDir, "images");

            if (fs.existsSync(mdFile)) {
              // If the upload handler auto-initialized a temp format (label === "temp"),
              // move any uploaded images into the real deck's images directory first.
              const prevImagesDir = format?.label === "temp" ? format.imagesDir : null;

              if (!format) {
                format = { mdFile, imagesDir, label: "dynamic" };
              } else {
                format.mdFile = mdFile;
                format.imagesDir = imagesDir;
                format.label = "dynamic";
              }

              if (!fs.existsSync(format.imagesDir)) {
                fs.mkdirSync(format.imagesDir, { recursive: true });
              }

              // Migrate images from temp dir to the real deck images dir
              if (prevImagesDir && fs.existsSync(prevImagesDir)) {
                for (const file of fs.readdirSync(prevImagesDir)) {
                  const src = path.join(prevImagesDir, file);
                  const dest = path.join(format.imagesDir, file);
                  if (!fs.existsSync(dest)) {
                    fs.copyFileSync(src, dest);
                  }
                }
                fs.rmSync(prevImagesDir, { recursive: true, force: true });
                const tmpRoot = path.dirname(prevImagesDir);
                if (fs.existsSync(tmpRoot) && fs.readdirSync(tmpRoot).length === 0) {
                  fs.rmSync(tmpRoot, { recursive: true, force: true });
                }
              }

              startWatching(format);

              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: true }));
            } else {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({ error: "Invalid deck path: slides.md not found" }),
              );
            }
          } catch (e) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: e.message }));
          }
        })
        .catch(() => {});
      return;
    }

    // ── GET /api/images ──
    if (pathname === "/api/images" && req.method === "GET") {
      try {
        const seen = new Set();
        const entries = [];
        // Enumerate the deck's images dir first (takes priority on dedup),
        // then the PPTX import temp dir so imported images appear in the
        // editor's image picker.
        const dirs = [];
        if (format?.imagesDir) dirs.push(format.imagesDir);
        dirs.push(EXPORTED_IMAGES_DIR);
        dirs.push(PPTX_IMPORT_IMAGES_DIR);
        for (const dir of dirs) {
          if (!fs.existsSync(dir)) continue;
          for (const name of fs.readdirSync(dir)) {
            if (!IMAGE_RE.test(path.extname(name))) continue;
            if (seen.has(name)) continue;
            seen.add(name);
            entries.push({ name, path: `images/${name}` });
          }
        }
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        });
        res.end(JSON.stringify({ images: entries }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // ── POST /api/images/clear ──
    if (pathname === "/api/images/clear" && req.method === "POST") {
      if (!isSameOrigin(req)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Cross-origin write not allowed" }));
        return;
      }
      try {
        // Clear both temp upload directories — never touch deck image folders
        const dirsToClear = [
          path.join(ROOT, ".webdeck-uploads", "images"),
          PPTX_IMPORT_IMAGES_DIR,
        ];
        for (const dir of dirsToClear) {
          if (fs.existsSync(dir)) {
            for (const file of fs.readdirSync(dir)) {
              const filePath = path.join(dir, file);
              if (fs.statSync(filePath).isFile()) {
                fs.unlinkSync(filePath);
              }
            }
          }
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // ── POST /api/images/snapshot ──
    // Copies the current deck's images to the persistent exported-images
    // directory so they remain available after the user loads a different
    // deck and imports an AI result that references them.
    if (pathname === "/api/images/snapshot" && req.method === "POST") {
      if (!isSameOrigin(req)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Cross-origin write not allowed" }));
        return;
      }
      try {
        if (!format?.imagesDir || !fs.existsSync(format.imagesDir)) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, copied: 0, note: "No images dir" }));
          return;
        }
        fs.mkdirSync(EXPORTED_IMAGES_DIR, { recursive: true });
        // Prune files from the exported-images dir that are not in the
        // current deck before copying. This bounds growth to the most
        // recently exported deck's images so the picker does not
        // accumulate leftovers from previously exported decks, while
        // preserving the snapshot through the deck switch that precedes
        // an import (the clear endpoint intentionally does not touch
        // this directory for the same reason).
        const currentNames = new Set(
          fs.readdirSync(format.imagesDir).filter((f) => IMAGE_RE.test(path.extname(f))),
        );
        for (const file of fs.readdirSync(EXPORTED_IMAGES_DIR)) {
          if (!IMAGE_RE.test(path.extname(file))) continue;
          if (!currentNames.has(file)) {
            fs.unlinkSync(path.join(EXPORTED_IMAGES_DIR, file));
          }
        }
        let copied = 0;
        for (const file of fs.readdirSync(format.imagesDir)) {
          const src = path.join(format.imagesDir, file);
          if (!fs.statSync(src).isFile()) continue;
          if (!IMAGE_RE.test(path.extname(file))) continue;
          const dest = path.join(EXPORTED_IMAGES_DIR, file);
          fs.copyFileSync(src, dest);
          copied++;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, copied }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // ── POST /api/directives/snapshot ──
    // Stores the source deck's per-slide directives (extracted client-side
    // via extractDirectives) so the import flow can gap-fill theme/background
    // the external AI dropped. The body is the directives array as JSON.
    if (pathname === "/api/directives/snapshot" && req.method === "POST") {
      if (!isSameOrigin(req)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Cross-origin write not allowed" }));
        return;
      }
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body.toString("utf8"));
        if (!Array.isArray(parsed)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Expected a directives array" }));
          return;
        }
        // Validate each entry matches the extractDirectives output shape:
        // { layout, background, theme, mediaFullBleed, areaBg }. Bound the
        // array length and string values so a crafted cross-origin payload
        // cannot write arbitrary content into the snapshot file.
        if (parsed.length > 1000) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Directives array too large" }));
          return;
        }
        const sanitized = parsed.map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            throw new TypeError("Invalid directive entry");
          }
          const str = (v, max) =>
            typeof v === "string" && v.length <= max ? v : undefined;
          const areaBg = {};
          if (entry.areaBg && typeof entry.areaBg === "object") {
            for (const [k, v] of Object.entries(entry.areaBg)) {
              if (typeof k === "string" && k.length <= 64) {
                const val = str(v, 256);
                if (val !== undefined) areaBg[k] = val;
              }
            }
          }
          return {
            layout: str(entry.layout, 256),
            background: str(entry.background, 256),
            theme: str(entry.theme, 256),
            mediaFullBleed: typeof entry.mediaFullBleed === "boolean" ? entry.mediaFullBleed : false,
            areaBg,
          };
        });
        fs.mkdirSync(path.dirname(EXPORTED_DIRECTIVES_FILE), { recursive: true });
        fs.writeFileSync(EXPORTED_DIRECTIVES_FILE, JSON.stringify(sanitized));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, count: sanitized.length }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // ── GET /api/directives/snapshot ──
    // Returns the stored directives array, or an empty array if no snapshot
    // exists (e.g. first export, or wiped directory).
    if (pathname === "/api/directives/snapshot" && req.method === "GET") {
      try {
        if (!fs.existsSync(EXPORTED_DIRECTIVES_FILE)) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify([]));
          return;
        }
        const raw = fs.readFileSync(EXPORTED_DIRECTIVES_FILE, "utf8");
        const parsed = JSON.parse(raw);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(parsed));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // ── POST /api/upload-image ──
    if (pathname === "/api/upload-image" && req.method === "POST") {
      if (!isSameOrigin(req)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Cross-origin write not allowed" }));
        return;
      }
      if (!format) {
        // Auto-initialize a temp images directory so PPTX imports
        // (which upload images before POST /api/deck/load sets format)
        // can succeed.  POST /api/deck/load overwrites this later.
        const tmpImgDir = path.join(ROOT, ".webdeck-uploads", "images");
        fs.mkdirSync(tmpImgDir, { recursive: true });
        format = { mdFile: "", imagesDir: tmpImgDir, label: "temp" };
      }
      try {
        const boundary = getMultipartBoundary(req.headers["content-type"]);
        if (!boundary) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing multipart boundary" }));
          return;
        }

        const body = await readBody(req);
        const { filename, data } = parseMultipart(body, boundary);

        const ext = path.extname(filename).toLowerCase() || ".bin";
        if (!IMAGE_RE.test(ext)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unsupported image type" }));
          return;
        }

        if (!fs.existsSync(format.imagesDir)) {
          fs.mkdirSync(format.imagesDir, { recursive: true });
        }

        const safeName = generateUploadFilename(filename);
        const base = path.resolve(format.imagesDir);
        const target = path.resolve(base, safeName);
        const relative = path.relative(base, target);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid filename" }));
          return;
        }
        fs.writeFileSync(target, data);

        const assetPath = `images/${safeName}`;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ path: assetPath }));
      } catch (e) {
        console.error("[upload-image] Error:", e.message);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // ── POST /api/upload-images ──
    if (pathname === "/api/upload-images" && req.method === "POST") {
      if (!isSameOrigin(req)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Cross-origin write not allowed" }));
        return;
      }
      const isPptx = url.searchParams.get("pptx") === "true";
      // PPTX import images go to a dedicated temp directory so they don't
      // pollute the currently-loaded deck's images/ folder.  The client
      // downloads them and writes them next to the .md file on save-as.
      const targetDir = isPptx ? PPTX_IMPORT_IMAGES_DIR : format?.imagesDir;
      if (!targetDir) {
        const tmpImgDir = path.join(ROOT, ".webdeck-uploads", "images");
        fs.mkdirSync(tmpImgDir, { recursive: true });
        format = { mdFile: "", imagesDir: tmpImgDir, label: "temp" };
      }
      const writeDir = targetDir || format.imagesDir;
      try {
        const boundary = getMultipartBoundary(req.headers["content-type"]);
        if (!boundary) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing multipart boundary" }));
          return;
        }

        const body = await readBody(req, MAX_UPLOAD_BATCH_BYTES);
        const parts = parseMultipartAll(body, boundary);

        if (!fs.existsSync(writeDir)) {
          fs.mkdirSync(writeDir, { recursive: true });
        }

        const paths = [];
        for (const { filename, data } of parts) {
          const ext = path.extname(filename).toLowerCase() || ".bin";
          if (!IMAGE_RE.test(ext)) continue;

          const safeName = generateUploadFilename(filename);
          const base = path.resolve(writeDir);
          const target = path.resolve(base, safeName);
          const relative = path.relative(base, target);
          if (relative.startsWith('..') || path.isAbsolute(relative)) {
            throw new Error("Invalid filename");
          }
          fs.writeFileSync(target, data);
          paths.push({ name: filename, path: `images/${safeName}` });
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ paths }));
      } catch (e) {
        console.error("[upload-images] Error:", e.message);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // ── Static images: /images/* ──
    if (pathname.startsWith("/images/")) {
      const fileName = pathname.slice("/images/".length);

      if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      const candidateDirs = [];
      if (format?.imagesDir) candidateDirs.push(format.imagesDir);
      candidateDirs.push(EXPORTED_IMAGES_DIR);
      candidateDirs.push(PPTX_IMPORT_IMAGES_DIR);

      for (const dir of candidateDirs) {
        const filePath = path.join(dir, fileName);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const mime = MIME[ext] || "application/octet-stream";
          res.writeHead(200, {
            "Content-Type": mime,
            "Cache-Control": "public, max-age=60",
          });
          fs.createReadStream(filePath).pipe(res);
          return;
        }
      }
      // Fall through to static file handler below
    }

    // ── Static files: serve from project root ──
    let filePath = path.join(ROOT, pathname === "/" ? "index.html" : pathname);

    const relative = path.relative(ROOT, filePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // SPA fallback
    const indexPath = path.join(ROOT, "index.html");
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { "Content-Type": "text/html" });
      fs.createReadStream(indexPath).pipe(res);
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Clean up orphaned uploads from previous sessions (e.g. crashed PPTX imports)
  const uploadDir = path.join(ROOT, ".webdeck-uploads");
  if (fs.existsSync(uploadDir)) {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
  // Clean up orphaned images/ at project root (uploaded by previous PPTX imports)
  const rootImagesDir = path.join(ROOT, "images");
  if (fs.existsSync(rootImagesDir)) {
    fs.rmSync(rootImagesDir, { recursive: true, force: true });
  }
  // Ensure the PPTX import temp directory exists.  Unlike .webdeck-uploads,
  // this directory is NOT wiped on restart — images here belong to decks the
  // user saved as .md and would be lost if deleted.
  fs.mkdirSync(PPTX_IMPORT_IMAGES_DIR, { recursive: true });
  // Ensure the exported-images directory exists (same persistence rationale).
  fs.mkdirSync(EXPORTED_IMAGES_DIR, { recursive: true });
  // The directives snapshot file lives in the same parent directory.
  fs.mkdirSync(path.dirname(EXPORTED_DIRECTIVES_FILE), { recursive: true });

  let format = null;

  if (INPUT_ARG) {
    if (INPUT_ARG.endsWith(".textpack")) {
      console.log("Extracting .textpack...");
      format = await extractTextpack(INPUT_ARG);
    } else {
      format = detectFormat(INPUT_ARG);
    }

    // Ensure images directory exists
    if (format.imagesDir && !fs.existsSync(format.imagesDir)) {
      fs.mkdirSync(format.imagesDir, { recursive: true });
    }
  }

  const handler = createHandler(format);
  const server = http.createServer(handler);

  server.listen(PORT, "127.0.0.1", () => {
    console.log("");
    console.log(`  SlideMD Dev Server`);
    console.log(`  ─────────────────────────────────`);
    if (format) {
      const relMd = path.relative(process.cwd(), format.mdFile);
      const relImg = format.imagesDir
        ? path.relative(process.cwd(), format.imagesDir)
        : "(none)";
      console.log(`  Deck:    ${relMd}`);
      console.log(`  Images:  ${relImg}`);
    } else {
      console.log(`  Mode:    API-only (no deck loaded)`);
    }
    console.log(`  Server:  http://127.0.0.1:${PORT}`);
    console.log(`  ─────────────────────────────────`);
    console.log("");

    if (format) {
      startWatching(format);
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
