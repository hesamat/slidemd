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
import { randomUUID } from "node:crypto";
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
    const imagesDir = path.join(dir, "images");
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
  const buf = fs.readFileSync(textpackPath);
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

  return { mdFile, imagesDir, label: `textpack → ${path.basename(textpackPath)}` };
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

function scheduleReload() {
  if (watchTimeout) clearTimeout(watchTimeout);
  watchTimeout = setTimeout(() => {
    sendReloadEvent();
    watchTimeout = null;
  }, 100);
}

function startWatching(format) {
  const watchPaths = [format.mdFile];

  for (const p of watchPaths) {
    if (!fs.existsSync(p)) continue;
    fs.watch(p, { recursive: p !== format.mdFile }, () => {
      scheduleReload();
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
      try {
        const { markdown } = await readJsonBody(req);
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
      loadMutex = loadMutex
        .then(async () => {
          try {
            const { dir } = await readJsonBody(req);
            const deckDir = path.resolve(ROOT, dir);
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

    // ── POST /api/upload-image ──
    if (pathname === "/api/upload-image" && req.method === "POST") {
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
        fs.writeFileSync(path.join(format.imagesDir, safeName), data);

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
          fs.writeFileSync(path.join(writeDir, safeName), data);
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

  server.listen(PORT, () => {
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
    console.log(`  Server:  http://localhost:${PORT}`);
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
