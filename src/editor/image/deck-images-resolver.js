/**
 * DeckImagesResolver
 *
 * Resolves `images/foo.png` relative paths in markdown to blob URLs
 * for preview rendering. Images are loaded from in-memory cache
 * (populated from .smd extraction or uploads).
 *
 * Remote URLs (http/https) and data URIs pass through unchanged.
 * Missing images show a named SVG placeholder.
 */

export class DeckImagesResolver {
  /** Blob URLs by relative path — kept so we can revoke later. */
  static _urls = new Map();

  /** Cached File objects by relative path ("images/foo.png"). */
  static _cache = new Map();

  /** URLs borrowed from smdImageCache — must NOT be revoked by clearCache(). */
  static _borrowedUrls = new Set();

  /**
   * Set images from an .smd file for in-memory resolution.
   * Borrowed URLs are tracked and not revoked by clearCache().
   * @param {Map<string, string>} imageMap - Map of relative paths to blob URLs
   */
  static setSmdImages(imageMap) {
    // Clear internal state without revoking borrowed URLs
    this._cache.clear();
    this._borrowedUrls.clear();
    this._urls.clear();
    for (const [path, url] of imageMap) {
      this._urls.set(path, url);
      this._borrowedUrls.add(url);
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
   * Clear cached files + revoke owned blob URLs.
   * Borrowed URLs (from smdImageCache) are NOT revoked.
   */
  static clearCache() {
    for (const [, url] of this._urls) {
      if (!this._borrowedUrls.has(url)) {
        URL.revokeObjectURL(url);
      }
    }
    this._cache.clear();
    this._urls.clear();
    this._borrowedUrls.clear();
  }

  /**
   * Resolve a single relative path (`images/foo.png`) to a URL the browser
   * can render in the preview. Checks in-memory cache first; returns a
   * "Missing Image" placeholder if not found.
   *
   * @param {string} relPath
   * @param {{ force?: boolean }} [options]
   * @returns {Promise<string>}
   */
  static async resolvePreviewSrc(relPath, { force = false } = {}) {
    if (!relPath) return relPath;

    // Pass through remote URLs and data URIs unchanged
    if (
      relPath.startsWith("http://") ||
      relPath.startsWith("https://") ||
      relPath.startsWith("data:")
    ) {
      return relPath;
    }

    // Only handle images/ paths
    if (!relPath.startsWith("images/")) {
      return relPath;
    }

    // Check in-memory cache
    if (force && this._urls.has(relPath)) {
      if (!this._borrowedUrls.has(this._urls.get(relPath))) {
        URL.revokeObjectURL(this._urls.get(relPath));
      }
      this._urls.delete(relPath);
      this._cache.delete(relPath);
    }

    if (this._urls.has(relPath)) return this._urls.get(relPath);

    // Not in cache — return missing image placeholder
    return this._missingImagePlaceholder(relPath);
  }

  /**
   * Walk a slide element and rewrite every `<img src="images/...">` to a
   * resolved URL (blob URL from cache or placeholder).
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
   * Walk a slide element and rewrite any `background` style `url('images/...')`
   * references to resolved URLs.
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
            const blobUrl = await this.resolvePreviewSrc(relPath);
            if (blobUrl !== relPath) {
              resolved = resolved.replace(m[0], m[0].replace(`images/${m[2]}`, blobUrl));
            }
          }
          if (resolved !== bg) el.style.background = resolved;
        })(),
      );
    }
    await Promise.all(tasks);
  }
}
