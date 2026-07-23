# Self-Contained Deck Formats (.smd + remote .md) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support a self-contained `.smd` binary format (ZIP with deck.md + images) and make `.md` files remote-URL-only, eliminating the confusing directory picker for image resolution.

**Architecture:** Add `jszip` for ZIP operations and `localforage` for IndexedDB auto-save. Create `SmdHandler` (ZIP extract/build) and `DraftManager` (crash recovery). Modify `OpenDeckModal` to use file pickers instead of directory picker. Modify `DeckImagesResolver` to resolve from in-memory blob URL cache. Modify `SaveManager` to export `.smd` or plain `.md`. Modify `ImageBackgroundHandler` to store uploads in memory.

**Tech Stack:** JSZip, localforage, File System Access API (`showOpenFilePicker`, `showSaveFilePicker`), IndexedDB (via localforage), Vitest

## Global Constraints

- `SmdHandler.buildSmd` MUST use `{ compression: "STORE" }` for image files to prevent UI thread freezing on large JPEGs/PNGs
- `.smd` ZIP structure: `deck.md` (root) + `images/` folder
- `.md` files only support remote URLs (`https://...`) for images — no relative paths
- No directory picker anywhere in the new flow
- Draft auto-save triggers on editor `input` event (debounced) and image uploads
- Save fallback: `<a download>` for Safari/Firefox when `showSaveFilePicker` is unavailable
- OpenDeckModal buttons MUST have subtitle text explaining .smd vs .md difference
- ImageBackgroundHandler adapts UI: .smd mode = file picker, .md mode = URL prompt only
- DeckImagesResolver returns "Missing Image" placeholder SVG when image not found

---

### Task 1: Add Dependencies

**Covers:** [S12]

**Files:**

- Modify: `package.json`

**Interfaces:**

- Consumes: (none)
- Produces: `jszip` and `localforage` available for import

- [ ] **Step 1: Add jszip and localforage to package.json**

In `package.json`, add to the `"dependencies"` block:

```json
"dependencies": {
  "jszip": "^3.10.1",
  "localforage": "^1.10.0",
  ...existing...
}
```

- [ ] **Step 2: Install dependencies**

Run: `cmd /c "npm install"`
Expected: `jszip` and `localforage` installed successfully

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add jszip and localforage for .smd format support"
```

---

### Task 2: SmdHandler — ZIP Extract and Build

**Covers:** [S4]

**Files:**

- Create: `src/core/smd-handler.js`
- Create: `src/__tests__/smd-handler.test.js`

**Interfaces:**

- Consumes: `jszip` (npm package)
- Produces: `SmdHandler.extractFromSmd(file)` → `{ markdown: string, images: Map<string, Blob> }`, `SmdHandler.buildSmd(markdown, images)` → `Blob`

- [ ] **Step 1: Write failing tests for SmdHandler**

Create `src/__tests__/smd-handler.test.js`:

```js
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { SmdHandler } from "../core/smd-handler.js";

describe("SmdHandler", () => {
  async function createTestSmd(markdown, images = {}) {
    const zip = new JSZip();
    zip.file("deck.md", markdown);
    const imgFolder = zip.folder("images");
    for (const [name, content] of Object.entries(images)) {
      imgFolder.file(name, content);
    }
    return new Blob([await zip.generateAsync({ type: "uint8array" })], {
      type: "application/octet-stream",
    });
  }

  describe("extractFromSmd", () => {
    it("extracts markdown from .smd file", async () => {
      const blob = await createTestSmd("# Hello\n\nSlide content");
      const result = await SmdHandler.extractFromSmd(blob);
      expect(result.markdown).toBe("# Hello\n\nSlide content");
    });

    it("extracts images as Map<string, Blob>", async () => {
      const imgContent = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header
      const blob = await createTestSmd("# Deck", { "photo.png": imgContent });
      const result = await SmdHandler.extractFromSmd(blob);
      expect(result.images).toBeInstanceOf(Map);
      expect(result.images.has("images/photo.png")).toBe(true);
      expect(result.images.get("images/photo.png")).toBeInstanceOf(Blob);
    });

    it("handles .smd with no images folder", async () => {
      const zip = new JSZip();
      zip.file("deck.md", "# No images");
      const blob = new Blob([await zip.generateAsync({ type: "uint8array" })], {
        type: "application/octet-stream",
      });
      const result = await SmdHandler.extractFromSmd(blob);
      expect(result.markdown).toBe("# No images");
      expect(result.images.size).toBe(0);
    });

    it("extracts multiple images", async () => {
      const blob = await createTestSmd("# Deck", {
        "a.png": new Uint8Array([1]),
        "b.jpg": new Uint8Array([2]),
      });
      const result = await SmdHandler.extractFromSmd(blob);
      expect(result.images.size).toBe(2);
      expect(result.images.has("images/a.png")).toBe(true);
      expect(result.images.has("images/b.jpg")).toBe(true);
    });
  });

  describe("buildSmd", () => {
    it("creates a valid .smd ZIP with deck.md", async () => {
      const images = new Map();
      const blob = await SmdHandler.buildSmd("# My Deck", images);
      expect(blob).toBeInstanceOf(Blob);

      const extracted = await SmdHandler.extractFromSmd(blob);
      expect(extracted.markdown).toBe("# My Deck");
    });

    it("includes images in images/ folder", async () => {
      const images = new Map([["images/photo.png", new Blob([new Uint8Array([0x89])])]]);
      const blob = await SmdHandler.buildSmd("# Deck", images);
      const extracted = await SmdHandler.extractFromSmd(blob);
      expect(extracted.images.has("images/photo.png")).toBe(true);
    });

    it("round-trips: build then extract preserves content", async () => {
      const originalMd = "# Title\n\n---\n\n## Slide 2\n\nContent here.";
      const images = new Map([
        ["images/img1.png", new Blob([new Uint8Array([1, 2, 3])])],
        ["images/img2.jpg", new Blob([new Uint8Array([4, 5, 6])])],
      ]);

      const built = await SmdHandler.buildSmd(originalMd, images);
      const extracted = await SmdHandler.extractFromSmd(built);

      expect(extracted.markdown).toBe(originalMd);
      expect(extracted.images.size).toBe(2);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cmd /c "npx vitest run src/__tests__/smd-handler.test.js"`
Expected: FAIL — `Cannot find module '../core/smd-handler.js'`

- [ ] **Step 3: Implement SmdHandler**

Create `src/core/smd-handler.js`:

```js
import JSZip from "jszip";

export class SmdHandler {
  /**
   * Extract markdown and images from a .smd file (ZIP archive).
   * @param {Blob|string} file - The .smd file as a Blob or File
   * @returns {Promise<{markdown: string, images: Map<string, Blob>}>}
   */
  static async extractFromSmd(file) {
    const zip = await JSZip.loadAsync(file);

    const mdFile = zip.file("deck.md");
    if (!mdFile) {
      throw new Error("Invalid .smd file: missing deck.md");
    }
    const markdown = await mdFile.async("text");

    const images = new Map();
    const imagesFolder = zip.folder("images");
    if (imagesFolder) {
      const imageFiles = [];
      imagesFolder.forEach((path, entry) => {
        if (!entry.dir) {
          imageFiles.push(entry);
        }
      });

      for (const entry of imageFiles) {
        const blob = await entry.async("blob");
        const relPath = `images/${entry.name}`;
        images.set(relPath, blob);
      }
    }

    return { markdown, images };
  }

  /**
   * Build a .smd file (ZIP archive) from markdown and images.
   * Uses STORE compression for images to avoid UI thread freezing.
   * @param {string} markdown
   * @param {Map<string, Blob>} images - Map of relative paths (images/foo.png) to Blobs
   * @returns {Promise<Blob>}
   */
  static async buildSmd(markdown, images) {
    const zip = new JSZip();
    zip.file("deck.md", markdown);

    const imgFolder = zip.folder("images");
    for (const [relPath, blob] of images) {
      const fileName = relPath.replace(/^images\//, "");
      imgFolder.file(fileName, blob, { compression: "STORE" });
    }

    const content = await zip.generateAsync({ type: "blob" });
    return content;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cmd /c "npx vitest run src/__tests__/smd-handler.test.js"`
Expected: PASS

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `cmd /c "npm test"`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/core/smd-handler.js src/__tests__/smd-handler.test.js
git commit -m "feat: add SmdHandler for .smd ZIP extract/build operations"
```

---

### Task 3: DraftManager — IndexedDB Auto-Save

**Covers:** [S5]

**Files:**

- Create: `src/core/draft-manager.js`
- Create: `src/__tests__/draft-manager.test.js`

**Interfaces:**

- Consumes: `localforage` (npm package)
- Produces: `DraftManager.saveDraft(markdown, imageMap)`, `DraftManager.loadDraft()` → `{markdown, images} | null`, `DraftManager.clearDraft()`

- [ ] **Step 1: Write failing tests for DraftManager**

Create `src/__tests__/draft-manager.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import { DraftManager } from "../core/draft-manager.js";

describe("DraftManager", () => {
  beforeEach(async () => {
    await DraftManager.clearDraft();
  });

  describe("saveDraft / loadDraft", () => {
    it("saves and retrieves markdown", async () => {
      const images = new Map();
      await DraftManager.saveDraft("# My Deck\n\nSlide content", images);
      const draft = await DraftManager.loadDraft();
      expect(draft).not.toBeNull();
      expect(draft.markdown).toBe("# My Deck\n\nSlide content");
    });

    it("saves and retrieves images as Blobs", async () => {
      const images = new Map([["images/photo.png", new Blob([new Uint8Array([0x89])])]]);
      await DraftManager.saveDraft("# Deck", images);
      const draft = await DraftManager.loadDraft();
      expect(draft.images.size).toBe(1);
      expect(draft.images.get("images/photo.png")).toBeInstanceOf(Blob);
    });

    it("returns null when no draft exists", async () => {
      const draft = await DraftManager.loadDraft();
      expect(draft).toBeNull();
    });

    it("overwrites previous draft on save", async () => {
      await DraftManager.saveDraft("# First", new Map());
      await DraftManager.saveDraft("# Second", new Map());
      const draft = await DraftManager.loadDraft();
      expect(draft.markdown).toBe("# Second");
    });
  });

  describe("clearDraft", () => {
    it("removes saved draft", async () => {
      await DraftManager.saveDraft("# Deck", new Map());
      await DraftManager.clearDraft();
      const draft = await DraftManager.loadDraft();
      expect(draft).toBeNull();
    });

    it("is safe to call when no draft exists", async () => {
      await expect(DraftManager.clearDraft()).resolves.not.toThrow();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cmd /c "npx vitest run src/__tests__/draft-manager.test.js"`
Expected: FAIL — `Cannot find module '../core/draft-manager.js'`

- [ ] **Step 3: Implement DraftManager**

Create `src/core/draft-manager.js`:

```js
import localforage from "localforage";

const DRAFT_STORE = localforage.createInstance({
  name: "webdeck",
  storeName: "drafts",
});

const DRAFT_KEY = "current-draft";

export class DraftManager {
  /**
   * Save current markdown and images to IndexedDB.
   * @param {string} markdown
   * @param {Map<string, Blob>} images
   */
  static async saveDraft(markdown, images) {
    const imageEntries = [];
    for (const [path, blob] of images) {
      imageEntries.push([path, blob]);
    }
    await DRAFT_STORE.setItem(DRAFT_KEY, { markdown, images: imageEntries });
  }

  /**
   * Load draft from IndexedDB. Returns null if no draft exists.
   * @returns {Promise<{markdown: string, images: Map<string, Blob}> | null>}
   */
  static async loadDraft() {
    const data = await DRAFT_STORE.getItem(DRAFT_KEY);
    if (!data) return null;

    const images = new Map(data.images || []);
    return { markdown: data.markdown, images };
  }

  /**
   * Clear the saved draft from IndexedDB.
   */
  static async clearDraft() {
    await DRAFT_STORE.removeItem(DRAFT_KEY);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cmd /c "npx vitest run src/__tests__/draft-manager.test.js"`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `cmd /c "npm test"`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/core/draft-manager.js src/__tests__/draft-manager.test.js
git commit -m "feat: add DraftManager for IndexedDB auto-save and crash recovery"
```

---

### Task 4: DeckLoader — Add smdImageCache

**Covers:** [S11]

**Files:**

- Modify: `src/data/deck-loader.js:17-94`

**Interfaces:**

- Consumes: (existing DeckLoader)
- Produces: `DeckLoader.smdImageCache` (Map<string, string>), `DeckLoader.isSmdMode` (boolean)

- [ ] **Step 1: Add new static properties to DeckLoader**

After the existing `fileHandleRegistry` getter (line 94), add:

```js
/**
 * In-memory cache for .smd images: relative path → blob URL.
 * Populated when opening a .smd file, used by DeckImagesResolver.
 * @static
 * @type {Map<string, string>}
 */
static smdImageCache = new Map();

/**
 * Whether the currently loaded deck is in .smd format.
 * @static
 * @type {boolean}
 */
static isSmdMode = false;
```

- [ ] **Step 2: Run full test suite**

Run: `cmd /c "npm test"`
Expected: All tests pass (no regressions)

- [ ] **Step 3: Commit**

```bash
git add src/data/deck-loader.js
git commit -m "feat: add smdImageCache and isSmdMode to DeckLoader"
```

---

### Task 5: DeckImagesResolver — In-Memory Image Resolution

**Covers:** [S7]

**Files:**

- Modify: `src/editor/image/deck-images-resolver.js`

**Interfaces:**

- Consumes: `DeckLoader.smdImageCache`, `DeckLoader.isSmdMode`
- Produces: Updated `resolvePreviewSrc()`, `rewriteImgSrcs()`, `rewriteBackgroundUrls()` that check SMD cache first

- [ ] **Step 1: Add setSmdImages method and modify resolvePreviewSrc**

Replace the `resolvePreviewSrc` method (lines 110-145) with:

```js
/**
 * Set images from an .smd file for in-memory resolution.
 * @param {Map<string, string>} imageMap - Map of relative paths to blob URLs
 */
static setSmdImages(imageMap) {
  this.clearCache();
  for (const [path, url] of imageMap) {
    this._urls.set(path, url);
  }
}

/**
 * Resolve a single relative path to a URL the browser can render.
 * Checks SMD in-memory cache first, then falls back to directory handle.
 *
 * @param {string} relPath
 * @param {{ force?: boolean }} [options]
 * @returns {Promise<string>}
 */
static async resolvePreviewSrc(relPath, { force = false } = {}) {
  if (!relPath) return relPath;

  // Pass through remote URLs and data URIs unchanged
  if (relPath.startsWith("http://") || relPath.startsWith("https://") || relPath.startsWith("data:")) {
    return relPath;
  }

  // Only handle images/ paths
  if (!relPath.startsWith("images/")) {
    return relPath;
  }

  // Check in-memory cache (SMD mode or primed directory)
  if (force && this._urls.has(relPath)) {
    URL.revokeObjectURL(this._urls.get(relPath));
    this._urls.delete(relPath);
    this._cache.delete(relPath);
  }

  if (this._urls.has(relPath)) return this._urls.get(relPath);

  // Fall back to directory handle (legacy mode)
  if (!this._dirHandle) {
    // No directory handle and not in cache — return missing image placeholder
    console.warn(`[ImagesResolver] image not found: "${relPath}" — no directory handle available`);
    return this._missingImagePlaceholder(relPath);
  }

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
      `[ImagesResolver] failed to resolve "${relPath}"`,
      err,
    );
    return this._missingImagePlaceholder(relPath);
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
```

- [ ] **Step 2: Update rewriteImgSrcs to work without dirHandle**

Replace the `rewriteImgSrcs` method (lines 154-175) with:

```js
/**
 * Walk a slide element and rewrite every `<img src="images/...">` to a
 * resolved URL (blob URL from cache or directory handle).
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
```

- [ ] **Step 3: Update rewriteBackgroundUrls similarly**

Replace the `rewriteBackgroundUrls` method (lines 241-266) with:

```js
/**
 * Walk a slide element and rewrite any CSS background `url('images/...')`
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
```

- [ ] **Step 4: Run full test suite**

Run: `cmd /c "npm test"`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/editor/image/deck-images-resolver.js
git commit -m "feat: DeckImagesResolver resolves from in-memory cache for .smd mode"
```

---

### Task 6: OpenDeckModal — File Pickers Instead of Directory Picker

**Covers:** [S6]

**Files:**

- Modify: `src/editor/ui/open-deck-modal.js`
- Modify: `index.html` (modal DOM)

**Interfaces:**

- Consumes: `SmdHandler.extractFromSmd()`, `DeckLoader.smdImageCache`, `DeckLoader.isSmdMode`, `DraftManager.saveDraft()`
- Produces: Updated modal with .smd and .md file picker buttons, loads images into DeckLoader.smdImageCache

- [ ] **Step 1: Update the modal DOM in index.html**

Find the open-deck modal section (around line 798). Replace the "Open Presentation Folder" button with two file picker buttons. Find the `<button id="openDeckBrowseBtn"` element and replace the surrounding section:

```html
<div class="open-deck__actions">
  <button id="openDeckSmdBtn" class="open-deck__browse-btn">
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
    <div>
      <div>Open .smd File</div>
      <div class="open-deck__subtitle">Self-contained presentation with embedded local images.</div>
    </div>
  </button>
  <button id="openDeckMdBtn" class="open-deck__browse-btn">
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
    <div>
      <div>Open .md File</div>
      <div class="open-deck__subtitle">
        Plain markdown. Requires external image URLs (e.g., https://...).
      </div>
    </div>
  </button>
</div>
```

- [ ] **Step 2: Rewrite OpenDeckModal**

Replace the entire contents of `src/editor/ui/open-deck-modal.js`:

```js
/**
 * OpenDeckModal
 *
 * Custom modal for opening deck files.
 * Supports .smd (ZIP archive with images) and .md (remote URLs only).
 */
import { DeckLoader } from "../../data/deck-loader.js";
import { Notification } from "../../renderer/notification.js";
import { SmdHandler } from "../../core/smd-handler.js";
import { DraftManager } from "../../core/draft-manager.js";

export class OpenDeckModal {
  static _el = null;
  static _fileListEl = null;
  static _smdBtn = null;
  static _mdBtn = null;
  static _previousFocus = null;

  static init() {
    this._el = document.getElementById("openDeckModal");
    this._fileListEl = document.getElementById("openDeckFileList");
    this._smdBtn = document.getElementById("openDeckSmdBtn");
    this._mdBtn = document.getElementById("openDeckMdBtn");

    if (!this._el) return;

    document.getElementById("openDeckModalOverlay")?.addEventListener("click", () => this.hide());
    document.getElementById("closeOpenDeckModalBtn")?.addEventListener("click", () => this.hide());
    this._smdBtn?.addEventListener("click", () => this._openSmdFile());
    this._mdBtn?.addEventListener("click", () => this._openMdFile());

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this._el.classList.contains("webdeck-hidden")) {
        this.hide();
      }
    });
  }

  static show() {
    if (!this._el) return;
    this._previousFocus = document.activeElement;
    this._el.classList.remove("webdeck-hidden");
    this._fileListEl.innerHTML = "";
    this._renderRecentDecks();
    this._smdBtn?.focus();
  }

  static hide() {
    if (!this._el) return;
    this._el.classList.add("webdeck-hidden");
    this._previousFocus?.focus();
    this._previousFocus = null;
  }

  static async _openSmdFile() {
    if (!("showOpenFilePicker" in window)) {
      Notification.warning("File picker requires a Chromium-based browser.");
      return;
    }

    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [
          {
            description: "SlideMD Presentation",
            accept: { "application/octet-stream": [".smd"] },
          },
        ],
      });

      const file = await fileHandle.getFile();
      const { markdown, images } = await SmdHandler.extractFromSmd(file);

      // Create blob URLs for images
      DeckLoader.smdImageCache.clear();
      for (const [path, blob] of images) {
        const url = URL.createObjectURL(blob);
        DeckLoader.smdImageCache.set(path, url);
      }
      DeckLoader.isSmdMode = true;

      // Store file handle for re-save
      DeckLoader.fileHandleRegistry.set(file.name, fileHandle);

      localStorage.setItem("webdeck_local_file", markdown);
      localStorage.setItem("webdeck_local_file_type", "smd");
      localStorage.setItem("webdeck_local_file_name", file.name);
      localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
      localStorage.removeItem("webdeck_source_url");

      DeckLoader.addRecentDeck(file.name);

      await DraftManager.saveDraft(markdown, images);

      this.hide();

      window.dispatchEvent(
        new CustomEvent("webdeck-load-local", {
          detail: { text: markdown, fileType: "smd", fileName: file.name },
        }),
      );
    } catch (e) {
      if (e.name !== "AbortError") {
        console.error("Failed to open .smd file:", e);
        Notification.error("Failed to open .smd file");
      }
    }
  }

  static async _openMdFile() {
    if (!("showOpenFilePicker" in window)) {
      Notification.warning("File picker requires a Chromium-based browser.");
      return;
    }

    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [
          {
            description: "Markdown file",
            accept: { "text/markdown": [".md"] },
          },
        ],
      });

      const file = await fileHandle.getFile();
      const rawText = await file.text();

      DeckLoader.isSmdMode = false;
      DeckLoader.smdImageCache.clear();
      DeckLoader.fileHandleRegistry.set(file.name, fileHandle);

      localStorage.setItem("webdeck_local_file", rawText);
      localStorage.setItem("webdeck_local_file_type", "md");
      localStorage.setItem("webdeck_local_file_name", file.name);
      localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
      localStorage.removeItem("webdeck_source_url");

      DeckLoader.addRecentDeck(file.name);

      await DraftManager.saveDraft(rawText, new Map());

      this.hide();

      window.dispatchEvent(
        new CustomEvent("webdeck-load-local", {
          detail: { text: rawText, fileType: "md", fileName: file.name },
        }),
      );
    } catch (e) {
      if (e.name !== "AbortError") {
        console.error("Failed to open .md file:", e);
        Notification.error("Failed to open .md file");
      }
    }
  }

  static _renderRecentDecks() {
    const recent = DeckLoader.getRecentDecks();
    if (recent.length === 0 || !this._fileListEl) return;
    if (this._fileListEl.children.length > 0) return;

    const heading = document.createElement("div");
    heading.className = "open-deck__section-label";
    heading.textContent = "Recent";

    const list = document.createElement("div");
    list.className = "open-deck__recent-list";

    for (const entry of recent) {
      const btn = document.createElement("button");
      btn.className = "open-deck__recent-item";
      btn.dataset.recentFile = entry.name;

      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("width", "14");
      icon.setAttribute("height", "14");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("fill", "none");
      icon.setAttribute("stroke", "currentColor");
      icon.setAttribute("stroke-width", "2");
      icon.setAttribute("stroke-linecap", "round");
      icon.setAttribute("stroke-linejoin", "round");
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", "12");
      circle.setAttribute("cy", "12");
      circle.setAttribute("r", "10");
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      poly.setAttribute("points", "12 6 12 12 16 14");
      icon.appendChild(circle);
      icon.appendChild(poly);

      const nameSpan = document.createElement("span");
      nameSpan.className = "open-deck__recent-name";
      nameSpan.textContent = entry.name;

      const timeSpan = document.createElement("span");
      timeSpan.className = "open-deck__recent-time";
      timeSpan.textContent = this._timeAgo(entry.timestamp);

      btn.appendChild(icon);
      btn.appendChild(nameSpan);
      btn.appendChild(timeSpan);

      btn.addEventListener("click", () => {
        DeckLoader.loadRecentDeck(entry.name);
        this.hide();
      });

      list.appendChild(btn);
    }

    this._fileListEl.appendChild(heading);
    this._fileListEl.appendChild(list);
  }

  static _timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}
```

- [ ] **Step 3: Run full test suite**

Run: `cmd /c "npm test"`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/editor/ui/open-deck-modal.js index.html
git commit -m "feat: OpenDeckModal uses file pickers for .smd and .md files"
```

---

### Task 7: SaveManager — Export .smd or .md

**Covers:** [S8]

**Files:**

- Modify: `src/editor/ui/save-manager.js`

**Interfaces:**

- Consumes: `SmdHandler.buildSmd()`, `DeckLoader.smdImageCache`, `DraftManager.clearDraft()`
- Produces: Updated `save()` that exports .smd when images are present, .md otherwise

- [ ] **Step 1: Rewrite SaveManager.save()**

Replace the `save()` method (lines 58-111) in `src/editor/ui/save-manager.js`:

```js
async save() {
  for (let i = 0; i < this.deck.slides.length; i++) {
    if (this.unsavedMarkdown.has(i)) {
      this.originalMarkdown[i] = this.unsavedMarkdown.get(i);
    }
  }

  this.unsavedMarkdown.clear();
  this.hasUnsavedChanges = false;
  this.updateButton();

  try {
    const fullMarkdown = this.originalMarkdown.join("\n\n---\n\n");
    const hasLocalImages = DeckLoader.smdImageCache.size > 0;

    if (hasLocalImages) {
      // Export as .smd (ZIP with images)
      const zipBlob = await SmdHandler.buildSmd(fullMarkdown, DeckLoader.smdImageCache);
      await this._saveBlob(zipBlob, "presentation.smd", "application/octet-stream");
    } else {
      // Export as plain .md
      const mdBlob = new Blob([fullMarkdown], { type: "text/markdown" });
      await this._saveBlob(mdBlob, "deck.md", "text/markdown");
    }

    await DraftManager.clearDraft();
    Notification.success("Deck saved successfully!");
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error("Failed to save file:", error);
      Notification.error("Failed to save file: " + (error.message || error));
    }
  }
}

/**
 * Save a blob to disk using File System Access API or <a download> fallback.
 * @param {Blob} blob
 * @param {string} fileName
 * @param {string} mimeType
 */
async _saveBlob(blob, fileName, mimeType) {
  if (window.showSaveFilePicker) {
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: fileName,
      types: [
        {
          description: fileName.endsWith(".smd") ? "SlideMD Presentation" : "Markdown file",
          accept: { [mimeType]: [`.${fileName.split(".").pop()}`] },
        },
      ],
    });

    if (!fileHandle) return;

    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
```

- [ ] **Step 2: Add imports at top of file**

Add these imports after the existing `import { Notification }` line:

```js
import { DeckLoader } from "../../data/deck-loader.js";
import { SmdHandler } from "../../core/smd-handler.js";
import { DraftManager } from "../../core/draft-manager.js";
```

- [ ] **Step 3: Run full test suite**

Run: `cmd /c "npm test"`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/editor/ui/save-manager.js
git commit -m "feat: SaveManager exports .smd with images or plain .md"
```

---

### Task 8: ImageBackgroundHandler — In-Memory Uploads

**Covers:** [S9]

**Files:**

- Modify: `src/editor/image/image-background-handler.js`

**Interfaces:**

- Consumes: `DeckLoader.smdImageCache`, `DeckLoader.isSmdMode`, `DraftManager.saveDraft()`
- Produces: Updated `uploadImage()` that stores blobs in memory instead of writing to disk

- [ ] **Step 1: Rewrite ImageBackgroundHandler**

Replace the entire contents of `src/editor/image/image-background-handler.js`:

```js
/**
 * ImageBackgroundHandler
 *
 * Manages image uploads. Behavior adapts based on file type:
 * - .smd mode: file picker for local images, stored in memory
 * - .md mode: URL input only, inserts remote image URLs
 */

import { DeckLoader } from "../../data/deck-loader.js";
import { DraftManager } from "../../core/draft-manager.js";

export class ImageBackgroundHandler {
  constructor() {
    this.deckDirectoryHandle = null;
    this._deckDirMode = null;
  }

  /** Current mode of the directory handle ('parent' | 'images' | null). */
  get deckDirMode() {
    return this._deckDirMode || "parent";
  }

  /**
   * Whether local file upload is supported (true for .smd mode).
   * @returns {boolean}
   */
  get supportsLocalUpload() {
    return DeckLoader.isSmdMode;
  }

  /**
   * Upload an image file from disk. Only works in .smd mode.
   * Stores as blob URL in DeckLoader.smdImageCache.
   * @param {File} file
   * @returns {Promise<string>} Relative path (images/<filename>)
   */
  async uploadImage(file) {
    if (!DeckLoader.isSmdMode) {
      console.warn("uploadImage called in .md mode — use insertImageUrl instead");
      return null;
    }

    const ext = file.name.match(/\.[^.]+$/)?.[0] || ".png";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
    const relativePath = `images/${fileName}`;

    const blobUrl = URL.createObjectURL(file);
    DeckLoader.smdImageCache.set(relativePath, blobUrl);

    // Persist to IndexedDB for crash recovery
    const md = localStorage.getItem("webdeck_local_file") || "";
    await DraftManager.saveDraft(md, DeckLoader.smdImageCache);

    return relativePath;
  }

  /**
   * Insert a remote image URL into the markdown.
   * Used in .md mode where images must be external URLs.
   * @param {string} url - The image URL (https://...)
   * @returns {string} The markdown image tag: ![image](url)
   */
  insertImageUrl(url) {
    const alt = url.split("/").pop()?.split("?")[0] || "image";
    return `![${alt}](${url})`;
  }

  async clearDeckDirectoryHandle() {
    this.deckDirectoryHandle = null;
    this._deckDirMode = null;
  }
}
```

- [ ] **Step 2: Update ImageInserter to handle .md mode**

In `src/editor/image/image-inserter.js`, modify `pickAndInsert()` (lines 54-109). When in .md mode, skip the directory handle resolution and show a simple URL prompt instead of the full ImagePicker:

```js
async pickAndInsert() {
  if (!this.markdownEditor) return;

  // In .md mode: prompt for image URL directly
  if (!DeckLoader.isSmdMode) {
    const url = prompt("Enter image URL (https://...):");
    if (!url || !url.startsWith("http")) return;
    const alt = url.split("/").pop()?.split("?")[0] || "image";
    const snippet = `![${alt}](${url})`;
    const current = this.markdownEditor.getValue();
    const insertPos = current.length;
    this.markdownEditor.replaceRange(insertPos, insertPos, `\n\n${snippet}\n`);
    this.markdownEditor.focus();
    return;
  }

  // In .smd mode: use the full image picker
  const savedCursorPos = this.markdownEditor.view?.state?.selection?.main?.from ?? null;

  const deckDirHandle = await this.imageBg._resolveDeckDirectoryHandle();
  DeckImagesResolver.setDeckDir(deckDirHandle, this.imageBg.deckDirMode);

  ImagePicker.show(
    (snippet) => {
      const current = this.markdownEditor.getValue();
      const hasSavedPosition =
        savedCursorPos !== null && savedCursorPos >= 0 && savedCursorPos <= current.length;

      let insertPos;
      let afterSnippet;

      if (hasSavedPosition) {
        const pos = savedCursorPos;
        const isAtStart = pos === 0;
        const isAtEnd = pos >= current.length;
        const prevChar = isAtStart ? "\n" : current[pos - 1];
        const nextChar = isAtEnd ? "\n" : current[pos];

        const before = prevChar === "\n" ? "" : "\n\n";
        const after = isAtEnd ? "" : nextChar === "\n" ? "\n" : "\n\n";
        const leadTrim = isAtStart ? before.replace(/^\n+/, "") : before;

        insertPos = pos;
        afterSnippet = `${leadTrim}${snippet}${after}`;
      } else {
        const footerIdx = current.search(/^@footer\b/m);
        if (footerIdx > 0) {
          insertPos = footerIdx;
          afterSnippet = `${snippet}\n\n`;
        } else {
          insertPos = current.length;
          afterSnippet = `\n\n${snippet}\n`;
        }
      }

      this.markdownEditor.replaceRange(insertPos, insertPos, afterSnippet);
      this.markdownEditor.focus();
    },
    {
      deckDirHandle,
      deckDirMode: this.imageBg.deckDirMode,
      onChangeFolder: async () => {
        await this.imageBg.clearDeckDirectoryHandle();
        const next = await this.imageBg._resolveDeckDirectoryHandle();
        if (next) DeckImagesResolver.setDeckDir(next, this.imageBg.deckDirMode);
        return next ? { handle: next, mode: this.imageBg.deckDirMode } : null;
      },
    },
  );
}
```

Also update the `drop` and `paste` handlers in `initDropAndPaste()` to handle .md mode — in .md mode, drag-drop and paste of images should be disabled (or treated as URL paste). Add at the top of the `drop` handler (line 134):

```js
// In .md mode, skip drag-drop image upload
if (!DeckLoader.isSmdMode) return;
```

And in the `paste` handler (line 160), add after the `if (!this._getIsEditMode()) return;` line:

```js
// In .md mode, skip image paste (only URL paste supported)
if (!DeckLoader.isSmdMode) return;
```

Add the import at the top of `image-inserter.js`:

```js
import { DeckLoader } from "../../data/deck-loader.js";
```

- [ ] **Step 3: Add CSS for modal subtitles**

In `index.html`, add a `<style>` rule for the subtitle class inside the modal:

```css
.open-deck__subtitle {
  font-size: 0.75rem;
  color: var(--text-muted, #888);
  margin-top: 2px;
  font-weight: 400;
}
```

- [ ] **Step 4: Run full test suite**

Run: `cmd /c "npm test"`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/editor/image/image-background-handler.js src/editor/image/image-inserter.js index.html
git commit -m "feat: ImageBackgroundHandler adapts upload UI for .smd vs .md mode"
```

---

### Task 9: Draft Recovery on App Load

**Covers:** [S11]

**Files:**

- Modify: `src/data/deck-loader.js:145-165` (loadDeckData method)

**Interfaces:**

- Consumes: `DraftManager.loadDraft()`
- Produces: Draft recovery prompt on app load when unsaved draft exists

- [ ] **Step 1: Add draft recovery to loadDeckData()**

In `src/data/deck-loader.js`, modify the `loadDeckData()` method. After the localStorage check (line 165), before the embedded JSON check, add draft recovery:

```js
// After the localStorage block (after line 165), add:
// 1b. Try IndexedDB draft (crash recovery)
try {
  const { DraftManager } = await import("../core/draft-manager.js");
  const draft = await DraftManager.loadDraft();
  if (draft) {
    const fileName = localStorage.getItem("webdeck_local_file_name") || "recovered-deck";
    const confirmed = window.confirm("Unsaved draft found from a previous session. Restore it?");
    if (confirmed) {
      // Restore images into smdImageCache
      DeckLoader.smdImageCache.clear();
      for (const [path, blob] of draft.images) {
        const url = URL.createObjectURL(blob);
        DeckLoader.smdImageCache.set(path, url);
      }
      DeckLoader.isSmdMode = draft.images.size > 0;

      localStorage.setItem("webdeck_local_file", draft.markdown);
      localStorage.setItem("webdeck_local_file_type", draft.images.size > 0 ? "smd" : "md");
      localStorage.setItem("webdeck_local_file_name", fileName);
      localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());

      await DraftManager.clearDraft();
      await AssetLoader.ensureMarkdownItLoaded();
      return new MarkdownParser().parseDeckMarkdown(draft.markdown);
    } else {
      await DraftManager.clearDraft();
    }
  }
} catch (err) {
  console.warn("Draft recovery failed:", err);
}
```

- [ ] **Step 2: Run full test suite**

Run: `cmd /c "npm test"`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/data/deck-loader.js
git commit -m "feat: add draft recovery on app load from IndexedDB"
```

---

### Task 10: Verify and Lint

**Covers:** [S13]

**Files:**

- (no new files)

**Interfaces:**

- Consumes: All previous tasks
- Produces: Clean test suite, lint pass, format pass

- [ ] **Step 1: Run full test suite**

Run: `cmd /c "npm test"`
Expected: All tests pass

- [ ] **Step 2: Run lint**

Run: `cmd /c "npm run lint"`
Expected: No errors

- [ ] **Step 3: Run format check**

Run: `cmd /c "npm run format:check"`
Expected: Passes. If fails, run `cmd /c "npx prettier --write ."` then re-check.

- [ ] **Step 4: Run build**

Run: `cmd /c "npm run build"`
Expected: Build succeeds

- [ ] **Step 5: Final commit if format fix was needed**

```bash
git add -A
git commit -m "style: format code for .smd feature"
```
