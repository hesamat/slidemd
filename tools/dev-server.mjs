#!/usr/bin/env node
/**
 * SlideMD Dev Server
 *
 * Lightweight CLI dev server that:
 * - Accepts a .textbundle directory, loose .md + assets/, or .textpack ZIP
 * - Serves the frontend UI on localhost
 * - Serves assets as standard HTTP routes (/assets/*)
 * - Watches files on disk and triggers live-reload via SSE
 * - Handles deck save (POST /api/deck) and asset upload (POST /api/upload-asset)
 *
 * Usage:
 *   node tools/dev-server.mjs [path] [--port 8000]
 *
 * Examples:
 *   node tools/dev-server.mjs docs/example.textbundle
 *   node tools/dev-server.mjs slides.md --port 3000
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Args ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const portFlag = args.indexOf("--port");
const PORT = portFlag !== -1 ? parseInt(args[portFlag + 1], 10) : 8000;
const DECK_ARG = args.find((a) => !a.startsWith("--") && a !== String(PORT));

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
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

const IMAGE_RE = /\.(jpe?g|png|gif|webp|svg|avif|tif?f)$/i;

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Detect the deck format and return normalized paths.
 * @param {string} deckPath
 * @returns {{ type: "textbundle"|"md", mdFile: string, assetsDir: string, writeDir: string }}
 */
function detectFormat(deckPath) {
  const resolved = path.resolve(deckPath);

  // .textbundle directory
  if (
    fs.existsSync(resolved) &&
    fs.statSync(resolved).isDirectory() &&
    resolved.endsWith(".textbundle")
  ) {
    const mdFile = path.join(resolved, "text.markdown");
    if (!fs.existsSync(mdFile)) {
      console.error(`Error: .textbundle missing text.markdown: ${resolved}`);
      process.exit(1);
    }
    return {
      type: "textbundle",
      mdFile,
      assetsDir: path.join(resolved, "assets"),
      writeDir: resolved,
    };
  }

  // Loose .md file (with optional sidecar assets/ folder)
  if (fs.existsSync(resolved) && resolved.endsWith(".md")) {
    const dir = path.dirname(resolved);
    return {
      type: "md",
      mdFile: resolved,
      assetsDir: path.join(dir, "assets"),
      writeDir: dir,
    };
  }

  // Default: treat as .md in current directory
  if (!fs.existsSync(resolved)) {
    console.error(`Error: File not found: ${resolved}`);
    process.exit(1);
  }

  console.error(`Error: Unsupported input format: ${resolved}`);
  console.error("  Expected: *.textbundle directory or *.md file");
  process.exit(1);
}

// ── SSE ───────────────────────────────────────────────────────────────────────

/** @type {Set<http.ServerResponse>} */
const sseClients = new Set();

function sendReloadEvent() {
  for (const res of sseClients) {
    res.write("data: reload\n\n");
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
  if (fs.existsSync(format.assetsDir)) {
    watchPaths.push(format.assetsDir);
  }

  for (const p of watchPaths) {
    if (!fs.existsSync(p)) continue;
    fs.watch(p, { recursive: p !== format.mdFile }, () => {
      scheduleReload();
    });
  }

  console.log(`  Watching for changes...`);
}

// ── Multipart parser (for image uploads) ─────────────────────────────────────

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES) {
        req.destroy();
        reject(new Error("File too large (max 20 MB)"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
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

  const filenameMatch = headerStr.match(/filename="?([^";\s]+)"?/i);
  if (!filenameMatch) throw new Error("No filename in upload");
  const filename = filenameMatch[1];

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

// ── JSON body parser ─────────────────────────────────────────────────────────

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

// ── Request handler ───────────────────────────────────────────────────────────

function createHandler(format) {
  /** @type {Map<string, http.ServerResponse>} */
  const watchers = new Map();
  let watcherId = 0;

  return async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // CORS headers (for dev)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // ── SSE endpoint ──
    if (pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("data: connected\n\n");

      const id = watcherId++;
      watchers.set(id, res);
      sseClients.add(res);

      req.on("close", () => {
        watchers.delete(id);
        sseClients.delete(res);
      });
      return;
    }

    // ── GET /api/deck ──
    if (pathname === "/api/deck" && req.method === "GET") {
      try {
        const markdown = fs.readFileSync(format.mdFile, "utf8");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ markdown, type: format.type }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // ── POST /api/deck ──
    if (pathname === "/api/deck" && req.method === "POST") {
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

    // ── GET /api/assets ──
    if (pathname === "/api/assets" && req.method === "GET") {
      try {
        if (!fs.existsSync(format.assetsDir)) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ assets: [] }));
          return;
        }
        const entries = fs
          .readdirSync(format.assetsDir)
          .filter((name) => IMAGE_RE.test(path.extname(name)))
          .map((name) => ({ name, path: `assets/${name}` }));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ assets: entries }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // ── POST /api/upload-asset ──
    if (pathname === "/api/upload-asset" && req.method === "POST") {
      try {
        const contentType = req.headers["content-type"] || "";
        const boundaryMatch = contentType.match(/boundary=(.+)/i);
        if (!boundaryMatch) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing multipart boundary" }));
          return;
        }

        const body = await readBody(req);
        const { filename, data } = parseMultipart(body, boundaryMatch[1]);

        const ext = path.extname(filename).toLowerCase() || ".bin";
        if (!IMAGE_RE.test(ext)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unsupported file type" }));
          return;
        }

        if (!fs.existsSync(format.assetsDir)) {
          fs.mkdirSync(format.assetsDir, { recursive: true });
        }

        const { randomUUID } = await import("node:crypto");
        const safeName = `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
        fs.writeFileSync(path.join(format.assetsDir, safeName), data);

        const assetPath = `assets/${safeName}`;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ path: assetPath }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // ── Static assets: /assets/* ──
    if (pathname.startsWith("/assets/")) {
      const fileName = pathname.slice("/assets/".length);
      const filePath = path.join(format.assetsDir, fileName);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME[ext] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": mime });
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      res.writeHead(404);
      res.end("Not found");
      return;
    }

    // ── Static files: serve from project root ──
    let filePath = path.join(ROOT, pathname === "/" ? "index.html" : pathname);

    // Prevent directory traversal
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    // If path is a directory, try index.html
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

    // SPA fallback: serve index.html for non-file routes
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

function main() {
  if (!DECK_ARG) {
    console.error("Usage: node tools/dev-server.mjs <path> [--port 8000]");
    console.error("");
    console.error("  <path>   .textbundle directory or .md file");
    console.error("  --port   Port number (default: 8000)");
    process.exit(1);
  }

  const format = detectFormat(DECK_ARG);

  console.log(`SlideMD Dev Server`);
  console.log(`  Deck:      ${format.mdFile}`);
  console.log(`  Assets:    ${format.assetsDir}`);
  console.log(`  Format:    ${format.type}`);

  // Ensure assets dir exists
  if (!fs.existsSync(format.assetsDir)) {
    fs.mkdirSync(format.assetsDir, { recursive: true });
  }

  const handler = createHandler(format);
  const server = http.createServer(handler);

  server.listen(PORT, () => {
    console.log(`  Server:    http://localhost:${PORT}`);
    console.log(`  Deck API:  http://localhost:${PORT}/api/deck`);
    console.log(`  Assets:    http://localhost:${PORT}/assets/`);
    console.log(`  SSE:       http://localhost:${PORT}/api/events`);
    console.log("");
    startWatching(format);
  });
}

main();
