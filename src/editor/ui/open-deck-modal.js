/**
 * OpenDeckModal
 *
 * Custom modal for opening deck files.
 * Supports .textpack archives (ZIP with markdown + images) and .md files.
 * Uses File System Access API on Chromium, falls back to <input> on Safari/Firefox.
 */
import { DeckLoader } from "../../data/deck-loader.js";
import { Notification } from "../../renderer/notification.js";
import { DraftManager } from "../../core/draft-manager.js";
import { SlideRenderer } from "../../renderer/slide-renderer.js";
import { uploadImagesInBatches } from "../../core/image-batch-uploader.js";
import { MarkdownParser } from "../../data/markdown-parser.js";

const IMAGE_MIME_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
};

function getImageMimeType(filename) {
  const ext = filename.split(".").pop()?.toLowerCase();
  return (ext && IMAGE_MIME_TYPES[ext]) || "application/octet-stream";
}

export class OpenDeckModal {
  static _el = null;
  static _fileListEl = null;
  static _textpackBtn = null;
  static _mdBtn = null;
  static _previousFocus = null;

  static init() {
    this._el = document.getElementById("openDeckModal");
    this._fileListEl = document.getElementById("openDeckFileList");
    this._textpackBtn = document.getElementById("openDeckTextpackBtn");
    this._mdBtn = document.getElementById("openDeckMdBtn");

    if (!this._el) return;

    document.getElementById("openDeckModalOverlay")?.addEventListener("click", () => this.hide());
    document.getElementById("closeOpenDeckModalBtn")?.addEventListener("click", () => this.hide());
    this._textpackBtn?.addEventListener("click", () => this._openTextpackFile());
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
    this._textpackBtn?.focus();
  }

  static hide() {
    if (!this._el) return;
    this._el.classList.add("webdeck-hidden");
    this._previousFocus?.focus();
    this._previousFocus = null;
  }

  /**
   * Open a .textpack file (ZIP archive containing text.markdown + assets/).
   * Extracts to memory and loads the deck.
   *
   * Images are rendered immediately from in-memory blob URLs so the deck
   * appears without waiting for uploads. When the CLI dev server is running,
   * images are uploaded in the background and the saved markdown is rewritten
   * to use server `images/…` paths once the upload completes.
   */
  static async _openTextpackFile() {
    let loading = null;
    const controller = new AbortController();

    try {
      const { default: JSZip } = await import("jszip");

      let file;
      if ("showOpenFilePicker" in window) {
        [file] = await window.showOpenFilePicker({
          types: [
            {
              description: "Textpack archive",
              accept: { "application/zip": [".textpack"] },
            },
          ],
        });
        file = await file.getFile();
      } else {
        file = await this._pickFileViaInput(".textpack");
        if (!file) return;
      }

      loading = Notification.showLoadingModal("Opening .textpack...", {
        title: "Opening .textpack",
        cancelLabel: "Cancel",
        cancelConfirmMessage: "Are you sure you want to cancel opening this .textpack?",
        onCancel: () => controller.abort(),
      });

      if (controller.signal.aborted) {
        throw new DOMException("Open .textpack cancelled", "AbortError");
      }

      loading.updateMessage("Reading archive...");
      const buf = await file.arrayBuffer();

      if (controller.signal.aborted) {
        throw new DOMException("Open .textpack cancelled", "AbortError");
      }

      loading.updateMessage("Extracting archive...");
      const zip = await JSZip.loadAsync(buf);

      // Extract text.markdown (or deck.md)
      const mdEntry = zip.file("text.markdown") || zip.file("deck.md");
      if (!mdEntry) {
        throw new Error("Not a valid .textpack: missing text.markdown or deck.md");
      }

      if (controller.signal.aborted) {
        throw new DOMException("Open .textpack cancelled", "AbortError");
      }

      loading.updateMessage("Loading markdown...");
      const markdown = await mdEntry.async("text");

      if (controller.signal.aborted) {
        throw new DOMException("Open .textpack cancelled", "AbortError");
      }

      // Collect all image entries from the ZIP (assets/ or images/ folder)
      const imageEntries = [];
      for (const folderName of ["assets", "images"]) {
        const folder = zip.folder(folderName);
        if (!folder) continue;
        folder.forEach((entryPath, entry) => {
          if (!entry.dir && /\.(jpe?g|png|gif|webp|svg|avif)$/i.test(entryPath)) {
            imageEntries.push({ folderName, name: entryPath.split("/").pop(), entry });
          }
        });
      }

      // Deduplicate by filename (both folders may contain the same image)
      const seen = new Set();
      const uniqueEntries = imageEntries.filter((e) => {
        if (seen.has(e.name)) return false;
        seen.add(e.name);
        return true;
      });

      let resolvedMarkdown = markdown;

      loading.updateMessage("Probing server...");
      // Try the CLI server first — keeps relative paths so Ctrl+S works
      let serverAvailable = false;
      try {
        const probe = await fetch("/api/images", {
          method: "HEAD",
          signal: controller.signal,
        });
        serverAvailable = probe.ok;
      } catch {
        /* no server */
      }

      if (controller.signal.aborted) {
        throw new DOMException("Open .textpack cancelled", "AbortError");
      }

      // Clear stale images from the previous deck so the picker is clean
      if (serverAvailable) {
        try {
          await fetch("/api/images/clear", {
            method: "POST",
            signal: controller.signal,
          });
        } catch {
          /* ignore — best-effort cleanup */
        }
      }

      // Render images immediately from in-memory blob URLs while uploading in the background
      const filenameToBlobUrl = new Map();
      const relPathToBlobUrl = new Map();
      if (uniqueEntries.length > 0) {
        loading.updateMessage("Preparing images...");
        await Promise.all(
          uniqueEntries.map(async (item) => {
            if (controller.signal.aborted) {
              throw new DOMException("Open .textpack cancelled", "AbortError");
            }
            const rawBlob = await item.entry.async("blob");
            const type = rawBlob.type || getImageMimeType(item.name);
            const typedFile = new File([rawBlob], item.name, { type });
            item.data = typedFile;
            const blobUrl = URL.createObjectURL(typedFile);
            filenameToBlobUrl.set(item.name, blobUrl);
          }),
        );

        for (const name of filenameToBlobUrl.keys()) {
          const blobUrl = filenameToBlobUrl.get(name);
          relPathToBlobUrl.set(`images/${name}`, blobUrl);
          relPathToBlobUrl.set(`assets/${name}`, blobUrl);
        }

        for (const [relPath, blobUrl] of relPathToBlobUrl) {
          const escapedPath = relPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          resolvedMarkdown = resolvedMarkdown.replace(
            new RegExp(`(src=["']?)${escapedPath}(["']?)`, "g"),
            `$1${blobUrl}$2`,
          );
          resolvedMarkdown = resolvedMarkdown.replace(
            new RegExp(`(\\]\\()${escapedPath}(\\))`, "g"),
            `$1${blobUrl}$2`,
          );
          resolvedMarkdown = resolvedMarkdown.replace(
            new RegExp(`(url\\(\\s*["']?)${escapedPath}(["']?\\s*\\))`, "gi"),
            `$1${blobUrl}$2`,
          );
        }
      }

      if (controller.signal.aborted) {
        throw new DOMException("Open .textpack cancelled", "AbortError");
      }

      localStorage.setItem("webdeck_local_file", resolvedMarkdown);
      localStorage.setItem("webdeck_local_file_type", "md");
      localStorage.setItem("webdeck_local_file_name", file.name.replace(/\.textpack$/, ""));
      localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
      localStorage.removeItem("webdeck_source_url");

      DeckLoader.addRecentDeck(file.name.replace(/\.textpack$/, ""));
      await DraftManager.saveDraft(resolvedMarkdown);

      // Show loading state before hiding the modal so the user sees feedback
      SlideRenderer.showLoadingState();
      this.hide();

      loading.updateMessage("Loading deck...");
      loading.updateProgress(95);

      window.dispatchEvent(
        new CustomEvent("webdeck-load-local", {
          detail: {
            text: resolvedMarkdown,
            fileType: "md",
            fileName: file.name.replace(/\.textpack$/, ""),
          },
        }),
      );

      await DraftManager.clearDraft();
      loading.dismiss();

      if (serverAvailable && uniqueEntries.length > 0) {
        // Upload images to the server in the background and then swap blob URLs for server paths
        window.__WEBDECK_IMAGE_UPLOAD_PROMISE__ = (async () => {
          const uploadEntries = uniqueEntries.map(({ name, data }) => ({
            key: name,
            file: data,
          }));

          const uploadedPaths = await uploadImagesInBatches(uploadEntries, {
            signal: controller.signal,
          });

          const failedUploads = uniqueEntries.length - uploadedPaths.size;
          if (failedUploads > 0) {
            console.warn(`${failedUploads} image(s) failed to upload and may not persist.`);
          }

          let serverMarkdown = resolvedMarkdown;
          for (const [name, serverPath] of uploadedPaths) {
            const blobUrl = filenameToBlobUrl.get(name);
            if (blobUrl && serverPath) {
              serverMarkdown = serverMarkdown.split(blobUrl).join(serverPath);
            }
          }

          localStorage.setItem("webdeck_local_file", serverMarkdown);
          await DraftManager.saveDraft(serverMarkdown);

          if (window.__WEBDECK_EDIT_CONTROLLER__) {
            try {
              window.__WEBDECK_EDIT_CONTROLLER__.originalMarkdown =
                new MarkdownParser().splitSlides(serverMarkdown);
            } catch {
              /* ignore */
            }
          }
        })().catch((err) => {
          if (err.name === "AbortError") return;
          console.warn("Background image upload failed:", err);
        });
      }
    } catch (e) {
      if (loading) loading.dismiss();
      if (e.name === "AbortError") {
        Notification.info("Open .textpack cancelled");
      } else {
        console.error("Failed to open .textpack file:", e);
        Notification.error("Failed to open .textpack file");
      }
    }
  }

  /**
   * Open a .md file using the File System Access API or file input fallback.
   */
  static async _openMdFile() {
    try {
      let file;
      let fileHandle = null;

      if ("showOpenFilePicker" in window) {
        [fileHandle] = await window.showOpenFilePicker({
          types: [
            {
              description: "Markdown file",
              accept: { "text/markdown": [".md"] },
            },
          ],
        });
        file = await fileHandle.getFile();
      } else {
        // Safari/Firefox fallback
        file = await this._pickFileViaInput(".md");
        if (!file) return;
      }

      const rawText = await file.text();

      if (fileHandle) {
        DeckLoader.fileHandleRegistry.set(file.name, fileHandle);
      }

      localStorage.setItem("webdeck_local_file", rawText);
      localStorage.setItem("webdeck_local_file_type", "md");
      localStorage.setItem("webdeck_local_file_name", file.name);
      localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
      localStorage.setItem("webdeck_source_url", file.name);

      DeckLoader.addRecentDeck(file.name);
      await DraftManager.saveDraft(rawText);

      // Clear stale images from the previous deck so the picker is clean
      try {
        await fetch("/api/images/clear", { method: "POST" });
      } catch {
        /* ignore — best-effort cleanup */
      }

      // Show loading state before hiding the modal so the user sees feedback
      SlideRenderer.showLoadingState();
      this.hide();

      window.dispatchEvent(
        new CustomEvent("webdeck-load-local", {
          detail: { text: rawText, fileType: "md", fileName: file.name },
        }),
      );

      // Clear stale draft from any previously opened deck
      await DraftManager.clearDraft();
    } catch (e) {
      if (e.name !== "AbortError") {
        console.error("Failed to open .md file:", e);
        Notification.error("Failed to open .md file");
      }
    }
  }

  /**
   * Safari/Firefox fallback: creates a hidden <input type="file"> to pick files.
   * @param {string} accept - e.g. ".md"
   * @returns {Promise<File | null>}
   */
  static _pickFileViaInput(accept) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.style.display = "none";
      document.body.appendChild(input);

      input.onchange = () => {
        const file = input.files?.[0];
        document.body.removeChild(input);
        resolve(file || null);
      };

      window.addEventListener(
        "focus",
        () => {
          setTimeout(() => {
            if (document.body.contains(input)) {
              document.body.removeChild(input);
              resolve(null);
            }
          }, 500);
        },
        { once: true },
      );

      input.click();
    });
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

      btn.addEventListener("click", async () => {
        await DeckLoader.loadRecentDeck(entry.name);
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
