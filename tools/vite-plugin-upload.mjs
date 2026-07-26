/**
 * Vite plugin that adds a /api/upload-image POST endpoint to the dev server.
 * Accepts multipart/form-data with an "image" field, saves the file to
 * images/ (next to the deck file) with a unique name, and returns the
 * relative path string as JSON.
 *
 * Uses only Node.js builtins — no external multer dependency needed.
 */
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

const root = path.resolve('.');
const IMAGES_DIR = path.join(root, 'images');

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_EXT_RE = /\.(jpe?g|png|gif|webp|svg|avif)$/i;

const MIME = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
};

/**
 * Read the full request body as a Buffer.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<Buffer>}
 */
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_UPLOAD_BYTES) {
                req.destroy();
                reject(new Error('File too large (max 20 MB)'));
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

/**
 * Minimal multipart/form-data parser — extracts the first file part.
 *
 * @param {Buffer} body
 * @param {string} boundary
 * @returns {{ filename: string, data: Buffer }}
 */
function parseMultipart(body, boundary) {
    const boundaryBuf = Buffer.from(`--${boundary}`);
    const endBuf = Buffer.from(`--${boundary}--`);

    // Find first boundary
    let start = body.indexOf(boundaryBuf);
    if (start === -1) throw new Error('Malformed multipart body');
    start += boundaryBuf.length;

    // Skip CRLF after boundary
    if (body[start] === 0x0d && body[start + 1] === 0x0a) start += 2;

    // Read headers until blank line
    const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), start);
    if (headerEnd === -1) throw new Error('Missing multipart headers');
    const headerStr = body.slice(start, headerEnd).toString('utf8');

    const filenameMatch = headerStr.match(/filename="?([^";\s]+)"?/i);
    if (!filenameMatch) throw new Error('No filename in upload');
    const filename = filenameMatch[1];

    // File data starts after the blank line
    const dataStart = headerEnd + 4;

    // Find the next boundary to know where data ends
    let dataEnd = body.indexOf(boundaryBuf, dataStart);
    if (dataEnd === -1) dataEnd = body.indexOf(endBuf, dataStart);
    if (dataEnd === -1) throw new Error('Missing closing boundary');

    // Strip trailing CRLF before boundary
    let data = body.slice(dataStart, dataEnd);
    if (data.length >= 2 && data[data.length - 2] === 0x0d && data[data.length - 1] === 0x0a) {
        data = data.slice(0, data.length - 2);
    }

    return { filename, data };
}

/**
 * @returns {import('vite').Plugin}
 */
export function imageUploadPlugin() {
    if (!fs.existsSync(IMAGES_DIR)) {
        fs.mkdirSync(IMAGES_DIR, { recursive: true });
    }

    return {
        name: 'vite-plugin-upload',
        configureServer(server) {

            // ── GET /images/* — serve uploaded images as static files ──
            // Must match after the mount prefix since connect does NOT strip req.url
            const IMAGES_PREFIX = '/images/';
            server.middlewares.use((req, res, next) => {
                if (req.method !== 'GET' || !req.url.startsWith(IMAGES_PREFIX)) return next();
                const fileName = req.url.slice(IMAGES_PREFIX.length);
                if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
                    res.statusCode = 403;
                    res.end('Forbidden');
                    return;
                }
                const filePath = path.join(IMAGES_DIR, fileName);
                if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                    const ext = path.extname(filePath).toLowerCase();
                    const mime = MIME[ext] || 'application/octet-stream';
                    res.statusCode = 200;
                    res.setHeader('Content-Type', mime);
                    fs.createReadStream(filePath).pipe(res);
                    return;
                }
                next();
            });

            server.middlewares.use('/api/upload-image', async (req, res) => {
                res.setHeader('Content-Type', 'application/json');

                if (req.method !== 'POST') {
                    res.statusCode = 405;
                    res.end(JSON.stringify({ error: 'Method not allowed' }));
                    return;
                }

                try {
                    const contentType = req.headers['content-type'] || '';
                    const boundaryMatch = contentType.match(/boundary=(.+)/i);
                    if (!boundaryMatch) {
                        res.statusCode = 400;
                        res.end(JSON.stringify({ error: 'Missing multipart boundary' }));
                        return;
                    }

                    const body = await readBody(req);
                    const { filename, data } = parseMultipart(body, boundaryMatch[1]);

                    const ext = path.extname(filename).toLowerCase() || '.bin';
                    if (!ALLOWED_EXT_RE.test(ext)) {
                        res.statusCode = 400;
                        res.end(JSON.stringify({ error: 'Unsupported image type' }));
                        return;
                    }

                    const savedName = `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
                    await fs.promises.writeFile(path.join(IMAGES_DIR, savedName), data);

                    const relativePath = `images/${savedName}`;

                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ path: relativePath }));
                } catch (err) {
                    const message = err.message || 'Upload failed';
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: message }));
                }
            });

            // ── GET /api/images — list existing images in images/ ──
            server.middlewares.use('/api/images', (req, res) => {
                res.setHeader('Content-Type', 'application/json');

                if (req.method !== 'GET') {
                    res.statusCode = 405;
                    res.end(JSON.stringify({ error: 'Method not allowed' }));
                    return;
                }
                try {
                    if (!fs.existsSync(IMAGES_DIR)) {
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ images: [] }));
                        return;
                    }

                    const entries = fs.readdirSync(IMAGES_DIR)
                        .filter((name) => ALLOWED_EXT_RE.test(path.extname(name)))
                        .map((name) => ({
                            name,
                            path: `images/${name}`,
                        }));

                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ images: entries }));
                } catch (err) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: err.message || 'Failed to list images' }));
                }
            });
        },
    };
}
