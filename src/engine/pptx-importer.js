/**
 * PPTX Importer
 *
 * Handles the PPTX import workflow: modal, image upload, parsing, AI post-processing.
 */
import { Notification } from "../renderer/notification.js";
import { MarkdownParser } from "../data/markdown-parser.js";
import { AssetLoader } from "../core/asset-loader.js";
import { DeckImagesResolver } from "../editor/image/deck-images-resolver.js";
import { ImagePicker } from "../editor/image/image-picker.js";
import { DraftManager } from "../core/draft-manager.js";
import { TextpackExportManager } from "../renderer/textpack-export-manager.js";
import { uploadImagesInBatches } from "../core/image-batch-uploader.js";
import { setImageUploadPromise, waitForImageUpload } from "../core/image-upload-promise.js";

export class PptxImporter {
  /**
   * @param {object} opts
   * @param {object} opts.reloadManager - Deck reload manager
   * @param {Function} opts.toggleEditMode - Toggle edit mode callback
   */
  constructor({ reloadManager, toggleEditMode }) {
    this._reloadManager = reloadManager;
    this._toggleEditMode = toggleEditMode;
  }

  async import() {
    const { ConversionModal } = await import("../editor/conversion-modal.js");
    const result = await ConversionModal.show();
    if (!result || !result.markdown) return;

    // Close the conversion modal
    ConversionModal.close();

    let { markdown, images, deckName } = result;

    // Convert PPTX-extracted images to in-memory blob URLs so the deck renders immediately
    const imageBlobs = new Map();
    const imageFiles = new Map();
    if (images?.length) {
      for (const img of images) {
        if (!img.base64 || !img.ref) continue;
        const rawName = img.ref.split("/").pop();
        if (!rawName) continue;
        const file = PptxImporter.#imageToFile(img, rawName);
        if (!file) continue;
        const blobUrl = URL.createObjectURL(file);
        imageBlobs.set(rawName, blobUrl);
        imageFiles.set(rawName, file);
      }
    }

    // Rewrite markdown image references to use the in-memory blob URLs
    if (imageBlobs.size > 0) {
      for (const [rawName, blobUrl] of imageBlobs) {
        const oldRef = `images/${rawName}`;
        const escaped = oldRef.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        markdown = markdown.replace(new RegExp(escaped, "g"), blobUrl);
      }
    }

    // Show a loading overlay while the deck is being loaded
    const controller = new AbortController();
    const loading = Notification.showLoadingModal("Loading slides…", {
      title: "Importing PPTX",
      type: "info",
      cancelLabel: "Cancel",
      cancelConfirmMessage: "Are you sure you want to cancel the PPTX import?",
      onCancel: () => controller.abort(),
    });

    try {
      // Clear stale images from the previous deck so the picker is clean
      try {
        await fetch("/api/images/clear", { method: "POST", signal: controller.signal });
      } catch (e) {
        if (e.name === "AbortError") throw e;
        /* ignore — best-effort cleanup */
      }

      // Flush cached images so the new deck doesn't show stale thumbnails.
      // PPTX images are served from the upload temp dir, not the previous
      // .md deck's on-disk folder.
      DeckImagesResolver.clearDirectoryHandle();
      DeckImagesResolver.invalidateCache();
      ImagePicker.clearImageCache();

      loading.updateProgress(70);

      // Store markdown info in localStorage so edit mode can find it.
      // PPTX imports are not bound to a server source and should not overwrite
      // the dev server file on save.
      try {
        localStorage.setItem("webdeck_local_file", markdown);
        localStorage.setItem("webdeck_local_file_type", "md");
        localStorage.setItem("webdeck_local_file_name", deckName || "pptx-import");
        localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
        localStorage.removeItem("webdeck_source_url");
        localStorage.setItem("webdeck_opened_from_picker", "1");
      } catch {
        window.__WEBDECK_MARKDOWN__ = markdown;
      }

      // Persist draft so a page refresh doesn't lose the imported deck
      await DraftManager.saveDraft(markdown);

      // Parse and replace deck
      await AssetLoader.ensureMarkdownItLoaded();
      const deckData = new MarkdownParser().parseDeckMarkdown(markdown);

      const editCtrl = window.__WEBDECK_EDIT_CONTROLLER__;
      if (editCtrl?.deckStore) {
        editCtrl.deckStore.loadFromMarkdown(markdown, 0);
      }

      loading.updateProgress(85);

      if (this._reloadManager?.replaceDeck) {
        await this._reloadManager.replaceDeck(deckData, {
          startAtFirstSlide: true,
          syncStore: false,
        });
      }

      loading.updateProgress(95);

      // Open edit mode so the user can review and edit the result
      this._toggleEditMode();

      loading.updateProgress(100);
      loading.dismiss();

      const getLatestMarkdown = () => {
        // Prefer the edit controller's live markdown (which reflects AI
        // refines, unsaved edits, etc.) over the stale localStorage snapshot.
        const editCtrl = window.__WEBDECK_EDIT_CONTROLLER__;
        if (editCtrl?.saveManager?.getFullMarkdown) {
          const live = editCtrl.saveManager.getFullMarkdown();
          if (live) return live;
        }
        return (
          localStorage.getItem("webdeck_local_file") || window.__WEBDECK_MARKDOWN__ || markdown
        );
      };

      if (imageFiles.size > 0) {
        // Upload images to the server in the background and then swap blob URLs for server paths
        setImageUploadPromise(
          (async () => {
            const entries = [];
            for (const [rawName, file] of imageFiles) {
              entries.push({ key: rawName, file });
            }
            const uploadedPaths = await uploadImagesInBatches(entries, {
              signal: controller.signal,
              pptx: true,
            });
            let serverMarkdown = markdown;
            for (const [rawName, serverPath] of uploadedPaths) {
              const blobUrl = imageBlobs.get(rawName);
              if (blobUrl && serverPath) {
                serverMarkdown = serverMarkdown.split(blobUrl).join(serverPath);
              }
            }
            try {
              localStorage.setItem("webdeck_local_file", serverMarkdown);
              localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
            } catch {
              window.__WEBDECK_MARKDOWN__ = serverMarkdown;
            }
            await DraftManager.saveDraft(serverMarkdown);
            const editCtrl = window.__WEBDECK_EDIT_CONTROLLER__;
            if (editCtrl?.deckStore) {
              try {
                const newSlides = new MarkdownParser().splitSlides(serverMarkdown);
                editCtrl.deckStore.syncSlides(newSlides, editCtrl.deckStore.getActiveIndex());
                await AssetLoader.ensureMarkdownItLoaded();
                const updatedDeck = new MarkdownParser().parseDeckMarkdown(serverMarkdown);
                if (this._reloadManager?.replaceDeck) {
                  await this._reloadManager.replaceDeck(updatedDeck, {
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
            console.warn("Background image upload failed:", err);
          }),
        );
      }

      Notification.dismissAll();
      Notification.success("PPTX imported successfully.", 0, {
        actions: [
          {
            label: "Save as .textpack",
            onClick: async () => {
              await waitForImageUpload();
              const mockDeck = { meta: { title: deckName || "pptx-import" } };
              const { ok } = await TextpackExportManager.handleTextpackExport(
                getLatestMarkdown(),
                mockDeck,
                {
                  filename: deckName || "pptx-import",
                },
              );
              if (ok) {
                Notification.dismissAll();
                Notification.success("Deck exported as .textpack!");
              }
            },
          },
          {
            label: "Save as .md (markdown only)",
            onClick: async () => {
              const loading = Notification.showLoadingModal("Saving deck\u2026");
              await waitForImageUpload();
              const mdBlob = new Blob([getLatestMarkdown()], { type: "text/markdown" });
              try {
                if (window.showSaveFilePicker) {
                  const handle = await window.showSaveFilePicker({
                    suggestedName: `${deckName || "pptx-import"}.md`,
                    types: [
                      {
                        description: "Markdown file",
                        accept: { "text/markdown": [".md"] },
                      },
                    ],
                  });
                  const writable = await handle.createWritable();
                  await writable.write(mdBlob);
                  await writable.close();
                  loading.dismiss();
                  Notification.dismissAll();
                  Notification.success("Deck saved!");
                  return;
                }
              } catch (err) {
                if (err?.name === "AbortError") {
                  loading.dismiss();
                  return;
                }
              }
              const url = URL.createObjectURL(mdBlob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${deckName || "pptx-import"}.md`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              loading.dismiss();
              Notification.dismissAll();
              Notification.success("Deck saved!");
            },
          },
        ],
      });
    } catch (err) {
      loading.dismiss();
      if (err.name === "AbortError") {
        Notification.info("PPTX import cancelled");
        return;
      }
      console.error("PPTX import failed:", err);
      Notification.error(`Import failed: ${err.message || err}`);
    }
  }

  /**
   * Decode a PPTX-extracted base64 image into a File.
   * Formats browsers can't render are renamed to .png (the extractor converts them).
   * @param {{ base64: string, ref: string }} img
   * @param {string} rawName
   * @returns {File|null} Null when the base64 payload can't be decoded.
   */
  static #imageToFile(img, rawName) {
    const safeName = rawName.replace(/\.(emf|wmf|tif|tiff|bmp)$/i, ".png");

    const raw = img.base64
      .replace(/^data:[^;]*;base64,/, "")
      .replace(/\s+/g, "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const pad = raw.length % 4;
    const padded = pad ? raw + "=".repeat(4 - pad) : raw;

    let binary;
    try {
      binary = atob(padded);
    } catch {
      console.warn("Failed to decode base64 for image:", img.ref, "sample:", padded.slice(0, 80));
      return null;
    }

    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const ext = safeName.match(/\.[^.]+$/)?.[0] || ".png";
    const blob = new Blob([bytes], { type: `image/${ext.slice(1)}` });
    return new File([blob], safeName, { type: blob.type });
  }
}
