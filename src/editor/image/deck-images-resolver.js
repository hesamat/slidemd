/**
 * DeckImagesResolver
 *
 * The markdown references images as relative paths like `images/foo.png`.
 * During dev preview the browser can't fetch these from the filesystem,
 * only from the Vite dev server.  This module solves that by:
 *
 *   1. Lazily loading images via the File System Access API from the user's
 *      deck folder the first time they're requested.
 *   2. Caching the File objects in memory.
 *   3. Exposing `resolvePreviewSrc(path)` that returns either:
 *        - a `blob:` URL for files we have (so the preview renders), or
 *        - the original path (so build/export HTTP serving works).
 *
 * The path that lands in the saved markdown stays as `images/foo.png` —
 * portable for build and export.  Only the in-memory preview is rewritten.
 */

export class DeckImagesResolver {
  /** @type {FileSystemDirectoryHandle|null} */
  static _dirHandle = null;
  /** @type {'parent'|'images'} */
  static _mode = "parent";

  /** Cached File objects by relative path ("images/foo.png"). */
  static _cache = new Map();

  /** Blob URLs by relative path — kept so we can revoke later. */
  static _urls = new Map();

  /**
   * Set the deck folder handle and mode.  Clears any previous cache.
   *
   * @param {FileSystemDirectoryHandle|null} dirHandle
   * @param {'parent'|'images'} mode
   */
  static setDeckDir(dirHandle, mode = "parent") {
    const changed = dirHandle !== this._dirHandle || mode !== this._mode;
    if (changed) {
      this._dirHandle = dirHandle;
      this._mode = mode;
      this.clearCache();
    }
  }

  /**
   * Clear cached files + revoke blob URLs.
   */
  static clearCache() {
    for (const url of this._urls.values()) URL.revokeObjectURL(url);
    this._cache.clear();
    this._urls.clear();
  }

  /**
   * Eagerly prime the cache by listing every image in `<dir>/images/`.
   * Returns a Map<relativePath, File>.
   */
  static async prime() {
    if (!this._dirHandle) return new Map();
    try {
      let targetDir;
      if (this._mode === "images") {
        targetDir = this._dirHandle;
      } else {
        try {
          targetDir = await this._dirHandle.getDirectoryHandle("images", { create: false });
        } catch (e) {
          console.warn(`[ImagesResolver] "images/" not found in dir="${this._dirHandle.name}"`, e);
          return new Map();
        }
      }
      const IMAGE_RE = /\.(jpe?g|png|gif|webp|svg|avif)$/i;
      const out = new Map();
      for await (const [name, handle] of targetDir.entries()) {
        if (handle.kind !== "file") {
          continue;
        }
        if (!IMAGE_RE.test(name)) {
          continue;
        }
        const file = await handle.getFile();
        const rel = `images/${name}`;
        this._cache.set(rel, file);
        const url = URL.createObjectURL(file);
        this._urls.set(rel, url);
        out.set(rel, file);
      }
      return out;
    } catch (err) {
      if (err.name !== "NotFoundError") {
        console.warn("DeckImagesResolver.prime failed:", err);
      }
      return new Map();
    }
  }

  /**
   * Resolve a single relative path (`images/foo.png`) to a URL the browser
   * can render in the preview.  Returns the original `path` if we can't
   * access the file (so build/export HTTP serving still works).
   *
   * @param {string} relPath
   * @param {{ force?: boolean }} [options] - When `force` is true, discard
   *   any cached blob URL for `relPath` and re-read the file from disk.
   *   Used after the underlying file has been rewritten in place (e.g.
   *   transparency-trimmed EMF-converted images).
   * @returns {Promise<string>}
   */
  static async resolvePreviewSrc(relPath, { force = false } = {}) {
    if (!this._dirHandle || !relPath) return relPath;
    if (!/^images\//.test(relPath) && !relPath.startsWith("images/")) {
      return relPath;
    }

    if (force && this._urls.has(relPath)) {
      URL.revokeObjectURL(this._urls.get(relPath));
      this._urls.delete(relPath);
      this._cache.delete(relPath);
    }

    if (this._urls.has(relPath)) return this._urls.get(relPath);

    try {
      let targetDir;
      if (this._mode === "images") {
        targetDir = this._dirHandle;
      } else {
        targetDir = await this._dirHandle.getDirectoryHandle("images", { create: false });
      }
      const name = relPath.split("/").pop();
      const fileHandle = await targetDir.getFileHandle(name);
      const file = await fileHandle.getFile();
      const url = URL.createObjectURL(file);
      this._cache.set(relPath, file);
      this._urls.set(relPath, url);
      return url;
    } catch (err) {
      console.warn(
        `[ImagesResolver] failed to resolve "${relPath}" from dir="${this._dirHandle.name}" mode=${this._mode}`,
        err,
      );
      return relPath;
    }
  }

  /**
   * Walk a slide element and rewrite every `<img src="images/...">` to a
   * blob URL the browser can render.  Use this immediately after the
   * preview is rendered so images appear instantly.
   *
   * @param {HTMLElement} rootEl
   */
  static async rewriteImgSrcs(rootEl) {
    if (!this._dirHandle || !rootEl) return;
    const imgs = rootEl.querySelectorAll("img[src]");
    const tasks = [];
    for (const img of imgs) {
      const src = img.getAttribute("src");
      if (!src || src.startsWith("blob:") || src.startsWith("data:")) continue;
      if (!/^images\//.test(src)) continue;
      img.dataset.originalSrc = src;
      tasks.push(
        (async () => {
          const resolved = await this.resolvePreviewSrc(src);
          if (resolved !== src) {
            img.src = resolved;
          } else {
            console.warn(`Image not resolved (still relative): ${src}`);
          }
        })(),
      );
    }
    await Promise.all(tasks);
  }

  /**
   * Overwrite an image file inside the deck folder with the supplied
   * `Blob` (e.g. a transparency-trimmed PNG).  After writing, the cached
   * blob URL for `relPath` is revoked so the next call to
   * `resolvePreviewSrc` re-reads the new bytes from disk.
   *
   * Requires a `FileSystemDirectoryHandle` with readwrite permission.
   * Returns `true` on success, `false` when we can't access the deck
   * folder (no handle, no FS Access API, no permission, etc.) — in that
   * case the caller should fall back to a non-destructive notification
   * rather than silently dropping the user's edit.
   *
   * @param {string} relPath  - Must be under `images/...`.
   * @param {Blob} blob       - New file contents.
   * @returns {Promise<boolean>}
   */
  static async replaceImageFile(relPath, blob) {
    if (!this._dirHandle || !relPath || !/^images\//.test(relPath)) return false;
    if (typeof window.showDirectoryPicker !== "function") return false;

    try {
      // We need readwrite permission to overwrite the file.  The deck
      // directory handle was originally requested with readwrite in
      // ImageBackgroundHandler, but query first and re-request if
      // necessary — the user may have revoked the grant since then.
      let perm = await this._dirHandle.queryPermission({ mode: "readwrite" });
      if (perm !== "granted") {
        perm = await this._dirHandle.requestPermission({ mode: "readwrite" });
      }
      if (perm !== "granted") return false;

      const targetDir =
        this._mode === "images"
          ? this._dirHandle
          : await this._dirHandle.getDirectoryHandle("images", { create: true });
      const name = relPath.split("/").pop();
      const fileHandle = await targetDir.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      // Drop the cached URL + File so the next resolvePreviewSrc(refresh)
      // picks up the new bytes.
      if (this._urls.has(relPath)) {
        URL.revokeObjectURL(this._urls.get(relPath));
        this._urls.delete(relPath);
      }
      this._cache.delete(relPath);
      return true;
    } catch (err) {
      if (err.name !== "AbortError") {
        console.warn("DeckImagesResolver.replaceImageFile failed:", err);
      }
      return false;
    }
  }

  /**
   * Walk a slide element and rewrite any `background` style `url('images/...')`
   * references to blob URLs the browser can render.  This mirrors
   * `rewriteImgSrcs` but for CSS background-image shorthand values.
   *
   * @param {HTMLElement} rootEl
   */
  static async rewriteBackgroundUrls(rootEl) {
    if (!this._dirHandle || !rootEl) return;
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
