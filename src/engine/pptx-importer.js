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

    let { markdown, images, deckName, aiMode } = result;

    // Show a loading overlay while the deck is being saved and loaded
    const controller = new AbortController();
    const loading = Notification.showLoadingModal("Saving deck and uploading images…", {
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

      // Upload PPTX-extracted images via the CLI server API
      // and build a mapping from original filenames to server-saved paths.
      const imagePathMap = await this.#uploadImages(images, loading, controller.signal);

      if (controller.signal.aborted) {
        throw new DOMException("PPTX import cancelled", "AbortError");
      }

      // Rewrite markdown image references to use the server-saved paths.
      if (imagePathMap.size > 0) {
        let updated = markdown;
        for (const [oldName, newPath] of imagePathMap) {
          const oldRef = `images/${oldName}`;
          const escaped = oldRef.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          updated = updated.replace(new RegExp(escaped, "g"), newPath);
        }
        markdown = updated;
      }

      // Flush cached images so the new deck doesn't show stale thumbnails
      DeckImagesResolver.invalidateCache();
      ImagePicker.clearImageCache();

      loading.updateMessage("Loading slides…");
      loading.updateProgress(70);

      // Store markdown info in localStorage so edit mode can find it
      try {
        localStorage.setItem("webdeck_local_file", markdown);
        localStorage.setItem("webdeck_local_file_type", "md");
        localStorage.setItem("webdeck_local_file_name", "pptx-import");
        localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
      } catch {
        window.__WEBDECK_MARKDOWN__ = markdown;
      }

      // Persist draft so a page refresh doesn't lose the imported deck
      await DraftManager.saveDraft(markdown);

      // Parse and replace deck
      await AssetLoader.ensureMarkdownItLoaded();
      const deckData = new MarkdownParser().parseDeckMarkdown(markdown);

      loading.updateProgress(85);

      if (this._reloadManager?.replaceDeck) {
        await this._reloadManager.replaceDeck(deckData, { startAtFirstSlide: true });
      }

      loading.updateProgress(95);

      // Open edit mode so the user can review and edit the result
      this._toggleEditMode();

      // Flag the save manager to use file picker instead of overwriting
      const editCtrl = window.__WEBDECK_EDIT_CONTROLLER__;
      if (editCtrl?.saveManager) {
        editCtrl.saveManager.needsSaveAs = true;
      }

      // Shared helper to apply AI result to the deck
      const applyAiResult = async (enhanced, origDirectives) => {
        // In fix mode, re-inject background/theme directives into the markdown
        if (origDirectives && aiMode === "fix") {
          const { injectDirectives } = await import("../data/ai-enhancer.js");
          enhanced = injectDirectives(enhanced, origDirectives);
        }

        let newDeckData;
        try {
          newDeckData = new MarkdownParser().parseDeckMarkdown(enhanced);
        } catch (err) {
          console.warn("parseDeckMarkdown failed:", err);
          Notification.error("Failed to parse AI result. The output may be malformed.");
          return;
        }

        // Fallback: if parser returned only 1 slide but content has ---, split manually
        if (newDeckData && newDeckData.slides.length <= 1 && enhanced.includes("\n---\n")) {
          const parts = enhanced.split(/\n---\n/);
          if (parts.length > 1) {
            const md = new MarkdownParser();
            newDeckData.slides = parts.map((part) => {
              const parsed = md.parseDeckMarkdown(part.trim());
              return parsed.slides[0];
            });
            newDeckData.meta = newDeckData.meta || {};
          }
        }

        if (newDeckData && this._reloadManager?.replaceDeck) {
          try {
            try {
              localStorage.setItem("webdeck_local_file", enhanced);
              localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
            } catch {
              window.__WEBDECK_MARKDOWN__ = enhanced;
            }
            await DraftManager.saveDraft(enhanced);

            await this._reloadManager.replaceDeck(newDeckData, { startAtFirstSlide: true });
            markdown = enhanced;
          } catch (err) {
            console.error("Failed to replace deck with AI result:", err);
            Notification.error("AI enhancement could not be applied.");
          }
        }
      };

      loading.updateProgress(100);
      loading.dismiss();

      Notification.dismissAll();
      Notification.success("PPTX imported successfully.", 0, {
        actions: [
          {
            label: "Save as .textpack",
            onClick: async () => {
              const mockDeck = { meta: { title: deckName || "pptx-import" } };
              const { ok } = await TextpackExportManager.handleTextpackExport(markdown, mockDeck, {
                filename: deckName || "pptx-import",
              });
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
              const mdBlob = new Blob([markdown], { type: "text/markdown" });
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

      // AI post-processing (runs after save notification is shown)
      if (aiMode) {
        try {
          const { AiSidebar } = await import("../editor/ai-sidebar.js");
          const { extractDirectives } = await import("../data/ai-enhancer.js");
          const origDirectives = extractDirectives(markdown);
          const enhanced = await AiSidebar.show(markdown, aiMode);
          if (enhanced) {
            await applyAiResult(enhanced, origDirectives);
          }
        } catch (err) {
          console.error("AI post-processing failed:", err);
          Notification.error("AI post-processing failed. You can still save the imported deck.");
        }
      }
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
   * Upload PPTX-extracted images via the CLI server API.
   * @param {Array} images - Extracted images from PPTX
   * @param {object} loading - Loading indicator
   * @param {AbortSignal} [signal] - Aborts in-flight uploads when the user cancels
   * @returns {Promise<Map<string, string>>} Map from original filename to server path
   */
  async #uploadImages(images, loading, signal = null) {
    if (!images?.length) return new Map();

    const entries = [];
    for (const img of images) {
      if (!img.base64 || !img.ref) continue;
      const rawName = img.ref.split("/").pop();
      if (!rawName) continue;
      const file = PptxImporter.#imageToFile(img, rawName);
      if (file) entries.push({ key: rawName, file });
    }

    const total = entries.length;
    if (total === 0) return new Map();

    return uploadImagesInBatches(entries, {
      signal,
      onProgress: (processed) => {
        loading.updateMessage(`Uploading images… ${processed}/${total}`);
        loading.updateProgress(Math.round((processed / total) * 60));
      },
    });
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
