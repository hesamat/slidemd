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
import { setImageUploadPromise } from "../../core/image-upload-promise.js";
import { MarkdownParser } from "../../data/markdown-parser.js";
import { extractVisualSystemFromMarkdown } from "../../data/ai/visual-system-schema.js";
import { DeckImagesResolver } from "../image/deck-images-resolver.js";
import { ImagePicker } from "../image/image-picker.js";
import { DirectoryHandleStore } from "../../core/directory-handle-store.js";
import { Logger } from "../../core/logger.js";
import { modalOpened, modalClosed } from "../../core/modal-state.js";

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
  static _textpackBtn = null;
  static _mdBtn = null;
  static _previousFocus = null;

  static init() {
    this._el = document.getElementById("openDeckModal");
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
    const wasHidden = this._el.classList.contains("webdeck-hidden");
    this._el.classList.remove("webdeck-hidden");
    if (wasHidden) {
      modalOpened();
      this._mdBtn?.focus();
    }
  }

  static hide() {
    if (!this._el || this._el.classList.contains("webdeck-hidden")) return;
    this._el.classList.add("webdeck-hidden");
    modalClosed();
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
          resolvedMarkdown = resolvedMarkdown.split(relPath).join(blobUrl);
        }
      }

      if (controller.signal.aborted) {
        throw new DOMException("Open .textpack cancelled", "AbortError");
      }

      localStorage.setItem("webdeck_local_file", resolvedMarkdown);
      localStorage.setItem("webdeck_local_file_type", "md");
      localStorage.setItem("webdeck_local_file_name", file.name.replace(/\.textpack$/, ""));
      localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
      // .textpack imports are not bound to a server source and should not
      // overwrite the dev server file on save.
      localStorage.removeItem("webdeck_source_url");
      localStorage.setItem("webdeck_opened_from_picker", "1");

      await DraftManager.saveDraft(resolvedMarkdown);

      // Show loading state before hiding the modal so the user sees feedback
      SlideRenderer.showLoadingState();
      this.hide();

      loading.updateMessage("Loading deck...");
      loading.updateProgress(95);

      const editCtrl = window.__WEBDECK_EDIT_CONTROLLER__;
      const fallbackCtrl = window.__WEBDECK_CONTROLLER__;
      const deckStore = editCtrl?.deckStore ?? fallbackCtrl?.deckStore;
      if (deckStore) {
        deckStore.loadFromMarkdown(resolvedMarkdown, 0);
      }

      // Flush cached images so the new deck doesn't show stale thumbnails.
      // .textpack images are rendered from blobs / the server, not the
      // previous .md deck's on-disk folder.
      DeckImagesResolver.clearDirectoryHandle();
      DeckImagesResolver.invalidateCache();
      ImagePicker.clearImageCache();

      const newDeck = await DeckLoader.parseMarkdown(resolvedMarkdown);
      const reloadManager = editCtrl?.controller?.reloadManager ?? fallbackCtrl?.reloadManager;
      if (reloadManager?.replaceDeck) {
        await reloadManager.replaceDeck(newDeck, {
          startAtFirstSlide: true,
          syncStore: false,
        });
      }

      await DraftManager.clearDraft();
      loading.dismiss();

      if (serverAvailable && uniqueEntries.length > 0) {
        // Upload images to the server in the background and then swap blob URLs for server paths
        setImageUploadPromise(
          (async () => {
            const uploadEntries = uniqueEntries.map(({ name, data }) => ({
              key: name,
              file: data,
            }));

            const uploadedPaths = await uploadImagesInBatches(uploadEntries, {
              signal: controller.signal,
            });

            const failedUploads = uniqueEntries.length - uploadedPaths.size;
            if (failedUploads > 0) {
              Logger.warn(`${failedUploads} image(s) failed to upload and may not persist.`);
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

            if (editCtrl?.deckStore) {
              try {
                const { markdown: serverMarkdownWithoutComment } =
                  extractVisualSystemFromMarkdown(serverMarkdown);
                const newSlides = new MarkdownParser().splitSlides(serverMarkdownWithoutComment);
                editCtrl.deckStore.syncSlides(newSlides, editCtrl.deckStore.getActiveIndex());
                const updatedDeck = await DeckLoader.parseMarkdown(serverMarkdown);
                if (reloadManager?.replaceDeck) {
                  await reloadManager.replaceDeck(updatedDeck, {
                    startAtFirstSlide: false,
                    syncStore: false,
                  });
                }
              } catch {
                /* ignore */
              }
            }
          })().catch((err) => {
            if (err.name === "AbortError") return;
            Logger.warn("Background image upload failed:", err);
          }),
        );
      }
    } catch (e) {
      if (loading) loading.dismiss();
      if (e.name === "AbortError") {
        Notification.info("Open .textpack cancelled");
      } else {
        Logger.error("Failed to open .textpack file:", e);
        Notification.error("Failed to open .textpack file");
      }
    }
  }

  /**
   * Open a .md presentation in a single step: the user picks the deck folder
   * and the .md file inside it is opened together with its sibling images/
   * folder (one permission covers both, so no follow-up "Load deck images"
   * prompt is needed).
   *
   * Falls back to a plain .md file input on browsers without the File System
   * Access API; in that case images cannot be read from disk.
   */
  static async _openMdFile() {
    if ("showOpenFilePicker" in window && window.showDirectoryPicker) {
      try {
        const dirHandle = await window.showDirectoryPicker({ mode: "read", startIn: "documents" });

        const mdNames = [];
        for await (const [name, handle] of dirHandle.entries()) {
          if (handle.kind === "file" && name.toLowerCase().endsWith(".md")) {
            mdNames.push(name);
          }
        }
        if (mdNames.length === 0) {
          Notification.warning("No .md file found in the selected folder.", 6000);
          return;
        }

        let fileName = mdNames[0];
        if (mdNames.length > 1) {
          const chosen = await Notification.showModal({
            title: "Multiple presentations",
            message: "This folder contains several .md decks. Which one do you want to open?",
            type: "info",
            blockBackdrop: true,
            buttons: mdNames.slice(0, 6).map((name, i) => ({
              label: name,
              isPrimary: i === 0,
              resolvesTo: name,
            })),
            closeResolvesTo: null,
          });
          if (!chosen) return;
          fileName = chosen;
        }

        const fileHandle = await dirHandle.getFileHandle(fileName);
        const file = await fileHandle.getFile();
        const rawText = await file.text();

        // Register both handles so reload (Ctrl+R deck) and save can reuse
        // them without re-picking.
        DeckLoader.fileHandleRegistry.set(fileName, fileHandle);
        await DirectoryHandleStore.save(dirHandle, "parent", fileName);

        await this._loadMdDeck(fileName, rawText, dirHandle);
      } catch (e) {
        if (e.name !== "AbortError") {
          Logger.error("Failed to open .md deck folder:", e);
          Notification.error("Failed to open .md presentation");
        }
      }
      return;
    }

    // Safari/Firefox fallback — plain file input, no folder access.
    try {
      const file = await this._pickFileViaInput(".md");
      if (!file) return;
      const rawText = await file.text();
      const folderHandle = await this._resolveDeckFolderHandle(file.name, rawText);
      await this._loadMdDeck(file.name, rawText, folderHandle);
    } catch (e) {
      if (e.name !== "AbortError") {
        Logger.error("Failed to open .md file:", e);
        Notification.error("Failed to open .md file");
      }
    }
  }

  /**
   * Shared tail of the .md open flow: persist open state, flush caches, and
   * swap the loaded deck.
   * @param {string} fileName — the opened .md file name
   * @param {string} rawText — deck markdown
   * @param {FileSystemDirectoryHandle|null} folderHandle — deck folder handle
   *   (already permitted), or null when images can't be read from disk
   */
  static async _loadMdDeck(fileName, rawText, folderHandle) {
    DeckImagesResolver.setDirectoryHandle(
      folderHandle,
      DeckImagesResolver.extractImageRefs(rawText),
    );

    localStorage.setItem("webdeck_local_file", rawText);
    localStorage.setItem("webdeck_local_file_type", "md");
    localStorage.setItem("webdeck_local_file_name", fileName);
    localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
    // Picker-opened .md files are not authoritative server sources, so don't
    // let Save POST back to the dev server. Clear the source URL so a reload
    // does not fetch a stale server source and instead uses the cached file.
    localStorage.setItem("webdeck_opened_from_picker", "1");
    localStorage.removeItem("webdeck_source_url");

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

    const editCtrl = window.__WEBDECK_EDIT_CONTROLLER__;
    const fallbackCtrl = window.__WEBDECK_CONTROLLER__;
    const deckStore = editCtrl?.deckStore ?? fallbackCtrl?.deckStore;
    if (deckStore) {
      deckStore.loadFromMarkdown(rawText, 0);
    }

    // Flush cached images so the new deck doesn’t show stale thumbnails
    DeckImagesResolver.invalidateCache();
    ImagePicker.clearImageCache();

    const newDeck = await DeckLoader.parseMarkdown(rawText);
    const reloadManager = editCtrl?.controller?.reloadManager ?? fallbackCtrl?.reloadManager;
    if (reloadManager?.replaceDeck) {
      await reloadManager.replaceDeck(newDeck, {
        startAtFirstSlide: true,
        syncStore: false,
      });
    }

    // Clear stale draft from any previously opened deck
    await DraftManager.clearDraft();
  }

  /**
   * Resolve a directory handle for a picker-opened .md deck so its sibling
   * images/ folder can render directly from disk. Reuses the folder handle
   * persisted at save time when its read permission is still granted;
   * otherwise asks the user to pick the folder once (which re-grants
   * permission) and remembers it for next time.
   * @param {string} fileName — the opened .md file name
   * @param {string} markdown — deck markdown, checked for image references
   * @returns {Promise<FileSystemDirectoryHandle|null>}
   */
  static async _resolveDeckFolderHandle(fileName, markdown) {
    const hasImages =
      /!\[[^\]]*\]\(images\/|<img[^>]*\ssrc=["']images\/|url\(\s*['"]?images\//i.test(
        markdown || "",
      );

    const dir = await DirectoryHandleStore.load(fileName);
    if (dir.handle) {
      let perm = dir.handle.queryPermission
        ? await dir.handle.queryPermission({ mode: "read" })
        : "granted";
      if (perm !== "granted" && dir.handle.requestPermission) {
        try {
          perm = await dir.handle.requestPermission({ mode: "read" });
        } catch {
          perm = "denied";
        }
      }
      if (perm === "granted") return dir.handle;
    }

    if (!hasImages || !window.showDirectoryPicker) return null;

    // showOpenFilePicker already consumed the user activation, so the
    // directory picker would be rejected by Chromium if called inline.
    // Trigger it from this modal's button click instead (fresh activation).
    const shouldPick = await Notification.showModal({
      title: "Load deck images",
      message:
        `This deck references images in an "images/" folder next to the .md file. ` +
        `Choose that folder so the images can be displayed.`,
      type: "info",
      blockBackdrop: true,
      buttons: [
        { label: "Cancel", resolvesTo: false },
        { label: "Choose images folder", isPrimary: true, resolvesTo: true },
      ],
      closeResolvesTo: false,
    });
    if (!shouldPick) return null;

    try {
      // Read-only is enough for previewing; the save flow re-picks the
      // folder with readwrite permission when the user saves.
      const handle = await window.showDirectoryPicker({
        mode: "read",
        startIn: "documents",
      });
      // Verify the picked folder contains the .md so the relative images/
      // references actually resolve from it.
      try {
        await handle.getFileHandle(fileName);
      } catch (_err) {
        Notification.warning(
          "The folder you selected does not contain this .md file, so its images could not be loaded.",
          6000,
        );
        return null;
      }
      await DirectoryHandleStore.save(handle, "parent", fileName);
      return handle;
    } catch (e) {
      if (e.name !== "AbortError") {
        Logger.warn("Deck folder selection failed:", e);
      }
      return null;
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
}
