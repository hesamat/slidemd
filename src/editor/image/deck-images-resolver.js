/**
 * DeckImagesResolver
 *
 * Resolves `images/foo.png` relative paths in markdown to HTTP URLs
 * for preview rendering. The CLI dev server serves images from the
 * filesystem via `/images/*` routes.
 *
 * Remote URLs (http/https) and data URIs pass through unchanged.
 * Missing images show a named SVG placeholder.
 */

export class DeckImagesResolver {
  /** Cache-busting version stamp — incremented when the deck changes. */
  static _cacheVersion = Date.now();

  /**
   * Directory handle for a picker-opened .md deck. When set, `images/...`
   * refs resolve from `<dir>/images/` directly on disk instead of the CLI
   * server, so a saved deck's sidecar images render without a server.
   * @type {FileSystemDirectoryHandle|null}
   */
  static _directoryHandle = null;

  /** Blob URLs created from the directory handle, keyed by rel path. */
  static _dirBlobUrls = new Map();

  /**
   * Bump the cache version so all image URLs are treated as new resources.
   */
  static invalidateCache() {
    this._cacheVersion = Date.now();
    this._dirBlobUrls.clear();
  }

  /**
   * Register (or clear, when passed null) the directory handle of the
   * currently open picker-opened .md deck, so its sibling images/ folder
   * can render without the CLI dev server.
   * @param {FileSystemDirectoryHandle|null} handle
   */
  static setDirectoryHandle(handle) {
    this._directoryHandle = handle;
    this._dirBlobUrls.clear();
    this.invalidateCache();
  }

  /**
   * Drop the registered directory handle (used when switching to a deck
   * whose images are served by the CLI dev server, e.g. .textpack or PPTX).
   */
  static clearDirectoryHandle() {
    this.setDirectoryHandle(null);
  }

  /**
   * Read an image directly from the registered directory handle and return
   * a blob URL, or null when the handle is unavailable/unpermitted.
   * @param {string} relPath — relative path like "images/foo.png"
   * @returns {Promise<string|null>}
   */
  static async _readFromDirectory(relPath) {
    const handle = this._directoryHandle;
    if (!handle || !relPath.startsWith("images/")) return null;
    // Negative results are cached too (as null) so missing images or an
    // absent images/ folder do not re-probe the filesystem on every render.
    if (this._dirBlobUrls.has(relPath)) return this._dirBlobUrls.get(relPath);
    try {
      if (handle.queryPermission) {
        let perm = await handle.queryPermission({ mode: "read" });
        if (perm !== "granted" && handle.requestPermission) {
          try {
            perm = await handle.requestPermission({ mode: "read" });
          } catch {
            this._dirBlobUrls.set(relPath, null);
            return null;
          }
        }
        if (perm !== "granted") {
          this._dirBlobUrls.set(relPath, null);
          return null;
        }
      }
      const imagesDir = await handle.getDirectoryHandle("images");
      const fileHandle = await imagesDir.getFileHandle(relPath.split("/").pop());
      const file = await fileHandle.getFile();
      const url = URL.createObjectURL(file);
      this._dirBlobUrls.set(relPath, url);
      return url;
    } catch {
      this._dirBlobUrls.set(relPath, null);
      return null;
    }
  }

  /**
   * Generate a data URI placeholder for a missing image.
   * @param {string} relPath
   * @returns {string} A data URI placeholder image
   */
  static _missingImagePlaceholder(relPath) {
    const name = relPath.split("/").pop() || relPath;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120">
      <rect width="200" height="120" fill="#f0f0f0" stroke="#ccc" stroke-width="1"/>
      <text x="100" y="50" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#999">Missing Image</text>
      <text x="100" y="70" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#bbb">${name}</text>
    </svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  /**
   * Resolve a relative image path to a URL the browser can render.
   * - Remote URLs and data URIs pass through unchanged.
   * - `images/foo.png` → `/images/foo.png` (served by CLI dev server)
   * - Anything else → placeholder SVG
   *
   * @param {string} relPath
   * @returns {Promise<string>}
   */
  static async resolvePreviewSrc(relPath) {
    if (!relPath) return relPath;

    // Pass through remote URLs and data URIs unchanged
    if (
      relPath.startsWith("http://") ||
      relPath.startsWith("https://") ||
      relPath.startsWith("data:")
    ) {
      return relPath;
    }

    // Resolve images/ paths. A registered directory handle (picker-opened
    // .md deck) serves the images from disk; otherwise fall back to the
    // HTTP routes served by the CLI dev server.
    if (relPath.startsWith("images/")) {
      const localUrl = await this._readFromDirectory(relPath);
      if (localUrl) return localUrl;
      return `/${relPath}?v=${this._cacheVersion}`;
    }

    // Not recognized — return missing image placeholder
    return this._missingImagePlaceholder(relPath);
  }

  /**
   * Walk a slide element and rewrite every `<img src="images/...">` to
   * an HTTP URL served by the CLI dev server.
   *
   * @param {HTMLElement} rootEl
   */
  static async rewriteImgSrcs(rootEl) {
    if (!rootEl) return;
    const imgs = rootEl.querySelectorAll("img[src]");
    const tasks = [];
    for (const img of imgs) {
      const src = img.getAttribute("src");
      if (!src || src.startsWith("blob:") || src.startsWith("data:")) continue;
      if (!src.startsWith("images/")) continue;
      img.dataset.originalSrc = src;
      tasks.push(
        (async () => {
          const resolved = await this.resolvePreviewSrc(src);
          if (resolved !== src) {
            img.src = resolved;
          }
        })(),
      );
    }
    await Promise.all(tasks);
  }

  /**
   * Walk a slide element and rewrite any `background` style
   * `url('images/...')` references to HTTP URLs.
   *
   * @param {HTMLElement} rootEl
   */
  static async rewriteBackgroundUrls(rootEl) {
    if (!rootEl) return;
    const IMAGE_RE = /url\(\s*(['"]?)images\/([^'")]+)\1\s*\)/i;
    const candidates = [rootEl, ...rootEl.querySelectorAll("[style]")];
    const tasks = [];

    for (const el of candidates) {
      const bg = el.style.background;
      if (!bg || !/images\//.test(bg)) continue;
      tasks.push(
        (async () => {
          const matches = [...bg.matchAll(new RegExp(IMAGE_RE.source, "gi"))];
          let resolved = bg;
          for (const m of matches) {
            const relPath = `images/${m[2]}`;
            const resolvedUrl = await this.resolvePreviewSrc(relPath);
            if (resolvedUrl !== relPath) {
              resolved = resolved.replace(m[0], m[0].replace(`images/${m[2]}`, resolvedUrl));
            }
          }
          if (resolved !== bg) el.style.background = resolved;
        })(),
      );
    }
    await Promise.all(tasks);
  }
}
