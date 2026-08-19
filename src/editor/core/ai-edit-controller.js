/**
 * AiEditController
 *
 * Handles single-slide and whole-deck AI edit flows. Builds AiOperations,
 * runs them through the orchestrator, resolves conflicts, and applies
 * patches via DeckStore so they're undoable.
 *
 * Extracted from EditController (AI edit flow concern).
 */

import { Logger } from "../../core/logger.js";
import { Notification } from "../../renderer/notification.js";
import { DeckLoader } from "../../data/deck-loader.js";
import { AssetLoader } from "../../core/asset-loader.js";
import { MarkdownParser } from "../../data/markdown-parser.js";
import { copyText, downloadText } from "../../core/clipboard.js";
import { buildExportablePrompt } from "../../data/ai/ai-prompt-export.js";
import { AiOutputValidator } from "../../data/ai/ai-output-validator.js";
import { parseAiResponse, slidesToMarkdown } from "../../data/ai/ai-response-parser.js";

import { resolveConflict } from "../../data/store/conflict-resolver.js";
import { ConflictModal } from "../ui/conflict-modal.js";

export class AiEditController {
  /**
   * @param {object} opts
   * @param {() => object|null} opts.getDeckStore
   * @param {() => object} opts.getController
   * @param {() => object} opts.getSaveManager
   * @param {() => object} opts.getPreviewUpdater
   * @param {() => Map<number, string>} opts.getUnsavedMarkdown
   * @param {() => number} opts.getCurrentSlideIndex
   * @param {(v: number) => void} opts.setCurrentSlideIndex
   * @param {(v: boolean) => void} opts.setHasUnsavedChanges
   * @param {() => void} opts.prepareStoreOperation
   * @param {(fn: () => unknown) => unknown} opts.withSuppressedStoreChange
   * @param {() => Promise<boolean>} opts.chainStoreChangeRestore
   * @param {() => void} opts.syncStructuralRevision
   * @param {() => void} opts.loadSlideIntoEditor
   * @param {() => void} opts.updateUnsavedChangesFlag
   */
  constructor({
    getDeckStore,
    getController,
    getSaveManager,
    getPreviewUpdater,
    getUnsavedMarkdown,
    getCurrentSlideIndex,
    setCurrentSlideIndex,
    setHasUnsavedChanges,
    prepareStoreOperation,
    withSuppressedStoreChange,
    chainStoreChangeRestore,
    syncStructuralRevision,
    loadSlideIntoEditor,
    updateUnsavedChangesFlag,
  }) {
    this._getDeckStore = getDeckStore;
    this._getController = getController;
    this._getSaveManager = getSaveManager;
    this._getPreviewUpdater = getPreviewUpdater;
    this._getUnsavedMarkdown = getUnsavedMarkdown;
    this._getCurrentSlideIndex = getCurrentSlideIndex;
    this._setCurrentSlideIndex = setCurrentSlideIndex;
    this._setHasUnsavedChanges = setHasUnsavedChanges;
    this._prepareStoreOperation = prepareStoreOperation;
    this._withSuppressedStoreChange = withSuppressedStoreChange;
    this._chainStoreChangeRestore = chainStoreChangeRestore;
    this._syncStructuralRevision = syncStructuralRevision;
    this._loadSlideIntoEditor = loadSlideIntoEditor;
    this._updateUnsavedChangesFlag = updateUnsavedChangesFlag;
  }

  /**
   * Run a single-slide AI operation (enhanceSlide, addSpeakerNotes).
   * Builds an AiOperation, runs it through the orchestrator, resolves any
   * conflict with the latest working slide, and applies the resulting patch
   * via DeckStore so it's undoable.
   * @param {string} intent — one of the single-slide intents
   */
  async runSingleSlideAi(intent) {
    const { SettingsModal } = await import("../settings-modal.js");
    const { createAiProviderClient } = await import("../../data/ai/ai-provider-factory.js");
    const { AiOrchestrator } = await import("../../data/ai/ai-orchestrator.js");
    const { createOperation } = await import("../../data/ai/ai-operation.js");
    const { AiSidebar } = await import("../ai-sidebar.js");

    const providerLabel = SettingsModal.getProvider();
    if (SettingsModal.requiresApiKey(providerLabel) && !SettingsModal.getApiKey()) {
      Notification.error("No API key — open Settings to configure AI.");
      return;
    }
    const deckStore = this._getDeckStore();
    if (!deckStore) {
      Notification.error("AI editing requires a loaded deck. Open or create a deck first.");
      return;
    }

    // Sync editor state into the store so the patch's `before` matches and
    // capture the structural revision / overlay baseline before the request.
    this._prepareStoreOperation();
    const targetSlide = this._getCurrentSlideIndex();
    const baselineRevision = deckStore.getStructuralRevision();

    const storeSlide = { index: targetSlide, markdown: deckStore.getSlides()[targetSlide] };
    const saveManager = this._getSaveManager();
    const workingSlide = saveManager.getFullSlide(targetSlide, storeSlide);
    const slideMarkdown = workingSlide.markdown;
    saveManager.setUnsavedEditorOverlay(targetSlide, slideMarkdown);

    const provider = createAiProviderClient(
      providerLabel,
      () => SettingsModal.getBaseUrl(),
      () => SettingsModal.getApiKey(),
      () => SettingsModal.getModel(),
    );

    const model = SettingsModal.getModel();
    const orchestrator = new AiOrchestrator({
      provider,
      modelMaxOutput: SettingsModal.getModelMaxTokens(model),
      useReasoning: SettingsModal.getReasoning(),
      effort: SettingsModal.getReasoning() ? SettingsModal.getEffort() : "none",
      effortSupported: SettingsModal.getSupportedEfforts(model).length > 0,
      resolveImageSrc: (src) =>
        import("../image/deck-images-resolver.js").then(({ DeckImagesResolver }) =>
          DeckImagesResolver.resolvePreviewSrc(src),
        ),
    });

    const op = createOperation(intent, targetSlide, slideMarkdown);

    try {
      const patches = await AiSidebar.showSingleSlideOperation(op, orchestrator, intent);
      if (patches && patches.length > 0 && deckStore) {
        const patch = patches[0];

        const currentSlideMarkdown =
          this._getUnsavedMarkdown().get(targetSlide) ?? deckStore.getSlides()[targetSlide] ?? "";
        const structuralRevisionChanged = deckStore.getStructuralRevision() !== baselineRevision;

        let resolution = resolveConflict({
          patch,
          currentSlideMarkdown,
          intent,
          structuralRevisionChanged,
        });

        if (resolution.action === "reject") {
          if (structuralRevisionChanged || currentSlideMarkdown === patch.before) {
            saveManager.clearUnsavedEditorOverlay(targetSlide);
            Notification.warning(resolution.reason);
            return;
          }
          const choice = await ConflictModal.show(patch, intent);
          if (choice.action === "reject") {
            saveManager.clearUnsavedEditorOverlay(targetSlide);
            Notification.warning(resolution.reason);
            return;
          }
          const rebase = choice.action === "apply" ? "apply-to-latest" : choice.rebase;
          resolution = resolveConflict({
            patch,
            currentSlideMarkdown,
            intent,
            structuralRevisionChanged,
            rebase,
          });
        }

        if (resolution.action === "reject") {
          saveManager.clearUnsavedEditorOverlay(targetSlide);
          Notification.warning(resolution.reason);
          return;
        }

        const patchToApply = resolution.rebasedPatch ?? patch;

        // Safety check before mutating the store.
        if (
          deckStore.getStructuralRevision() !== baselineRevision ||
          targetSlide >= deckStore.getSlideCount()
        ) {
          saveManager.clearUnsavedEditorOverlay(targetSlide);
          Notification.warning(
            `AI ${intent} could not be applied — the slide changed since the request started.`,
          );
          return;
        }

        // If the rebased patch's `before` does not match the store, fast-forward
        // the store to the user's latest working markdown without history, then
        // apply the patch. Keep the queued store-change restore suppressed for
        // the whole sequence so the explicit restoreStoreSnapshot below is the
        // single view refresh.
        const { applied, syncRan } = this._withSuppressedStoreChange(() => {
          let syncRan = false;
          if (patchToApply.before !== deckStore.getSlides()[targetSlide]) {
            const synced = [...deckStore.getSlides()];
            synced[targetSlide] = patchToApply.before;
            deckStore.syncSlides(synced, targetSlide);
            syncRan = true;
          }
          return { applied: deckStore.applyPatch(patchToApply, baselineRevision), syncRan };
        });
        if (!applied || (typeof applied === "object" && !applied.success)) {
          const reason = typeof applied === "object" ? applied.reason : "the slide changed";
          saveManager.clearUnsavedEditorOverlay(targetSlide);
          // syncSlides may have fast-forwarded the store; re-project that
          // working state into the view since the queued restore is suppressed.
          // Avoid a no-op restore when syncSlides did not run.
          if (syncRan) {
            try {
              await this._chainStoreChangeRestore();
            } catch (restoreError) {
              Logger.error("Failed to refresh view after rejected AI patch:", restoreError);
            }
          }
          Notification.warning(
            `AI ${intent} could not be applied — ${reason || "the slide changed since the request started."}`,
          );
          return;
        }

        // The AI panel is non-blocking, so the user may have kept typing on
        // other slides while it was open. restoreStoreSnapshot() below
        // reloads the deck from the store and clears unsavedMarkdown, which
        // would silently discard those edits. Snapshot everything except the
        // AI-patched slide (whose content is superseded by the patch) and
        // restore it afterwards.
        saveManager.clearUnsavedEditorOverlay(targetSlide);
        // The cached editor state for the patched slide will be dropped by
        // loadSlideState's doc-mismatch branch when the restore loads the
        // new AI content — no explicit invalidation needed.
        const preservedEdits = new Map(this._getUnsavedMarkdown());
        preservedEdits.delete(targetSlide);

        // Chain the restore onto the store-sync queue so it serializes with any
        // in-flight restore. The preserved-edits restoration and post-restore
        // UI updates run in the .then() continuation after the queued restore
        // completes, so they see the post-restore store state.
        await this._chainStoreChangeRestore().then(() => {
          for (const [index, markdown] of preservedEdits) {
            this._getUnsavedMarkdown().set(index, markdown);
          }
          this._updateUnsavedChangesFlag();
          // updateUnsavedChangesFlag() recomputes from unsavedMarkdown.size;
          // when the user had no other pending edits that drops to 0 and
          // clears the dirty flag. The AI-applied store state has not been
          // written to the file, so the deck is still unsaved and the reload
          // guard must prompt.
          this._setHasUnsavedChanges(true);
          saveManager.updateButton();
          this._loadSlideIntoEditor();
        });
        Notification.success(`AI ${intent} applied. Press Ctrl+Z to undo.`);
      }
    } catch (err) {
      Notification.error(`AI ${intent} failed: ${err.message || err}`);
    } finally {
      saveManager?.clearUnsavedEditorOverlay(targetSlide);
    }
  }

  /**
   * Run a whole-deck AI generate operation (Refine all slides).
   * Builds an AiOperation, runs it through the orchestrator, and delegates to
   * AiSidebar.show() for the progress/retry UI — same pattern as runSingleSlideAi.
   *
   * Also supports the export-prompt flow (issue #240): when the user clicks
   * "Copy prompt" or "Download prompt" in the modal, the prompt is built and
   * copied/downloaded without an API key or provider call.
   */
  async runWholeDeckAi() {
    const { SettingsModal } = await import("../settings-modal.js");
    const { createAiProviderClient } = await import("../../data/ai/ai-provider-factory.js");
    const { AiOrchestrator } = await import("../../data/ai/ai-orchestrator.js");
    const { createOperation } = await import("../../data/ai/ai-operation.js");
    const { AiSidebar } = await import("../ai-sidebar.js");
    const { AiGenerateModal } = await import("../ui/ai-generate-modal.js");

    const deckStore = this._getDeckStore();
    const saveManager = this._getSaveManager();

    // Sync editor state before running whole-deck AI
    this._prepareStoreOperation();

    const fullMarkdown = deckStore
      ? deckStore.toMarkdown()
      : saveManager.getFullSlides().join("\n\n---\n\n");

    // Export handler: builds the exact prompt the orchestrator would send and
    // copies/downloads it. No API key or provider is needed for export.
    // Also snapshots the current deck's images to a persistent server-side
    // directory so they remain available if the user imports the result into
    // a different deck later.
    const onExport = async (generateOpts, kind) => {
      const op = createOperation("generate", null, fullMarkdown, {
        flow: generateOpts.flow,
        mode: generateOpts.mode,
        addSpeakerNotes: generateOpts.addSpeakerNotes || false,
        includeImages: generateOpts.includeImages || false,
        preserveVisualIdentity: generateOpts.preserveVisualIdentity ?? true,
      });
      const { formattedText } = buildExportablePrompt(op);
      // Snapshot images so they survive a deck switch before import.
      try {
        await fetch("/api/images/snapshot", { method: "POST" });
      } catch {
        // Non-fatal: images may already be available if same deck is open.
      }
      if (kind === "copy") {
        await copyText(formattedText);
        Notification.success("AI prompt copied to clipboard.");
      } else {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        downloadText(formattedText, `ai-prompt-${generateOpts.mode}-${stamp}.txt`);
        Notification.success("AI prompt downloaded.");
      }
    };

    // Show pre-flight modal so the user can set options and see cost estimate.
    // The API-key check is deferred to after the modal resolves so that the
    // export path works without a configured key.
    const generateOpts = await AiGenerateModal.show(fullMarkdown, {
      modelName: SettingsModal.getModel(),
      useReasoning: SettingsModal.getReasoning(),
      getModelName: () => SettingsModal.getModel(),
      getReasoning: () => SettingsModal.getReasoning(),
      onOpenSettings: async () => {
        await SettingsModal.show();
      },
      onExport,
    });
    if (!generateOpts) return; // user cancelled or exported — no API call made

    // From here on we need a provider, so the key check applies.
    const providerLabel = SettingsModal.getProvider();
    if (SettingsModal.requiresApiKey(providerLabel) && !SettingsModal.getApiKey()) {
      Notification.error("No API key — open Settings to configure AI.");
      return;
    }

    const provider = createAiProviderClient(
      providerLabel,
      () => SettingsModal.getBaseUrl(),
      () => SettingsModal.getApiKey(),
      () => SettingsModal.getModel(),
    );

    const model = SettingsModal.getModel();
    const orchestrator = new AiOrchestrator({
      provider,
      modelMaxOutput: SettingsModal.getModelMaxTokens(model),
      useReasoning: SettingsModal.getReasoning(),
      effort: SettingsModal.getReasoning() ? SettingsModal.getEffort() : "none",
      effortSupported: SettingsModal.getSupportedEfforts(model).length > 0,
      resolveImageSrc: (src) =>
        import("../image/deck-images-resolver.js").then(({ DeckImagesResolver }) =>
          DeckImagesResolver.resolvePreviewSrc(src),
        ),
    });

    const op = createOperation("generate", null, fullMarkdown, {
      flow: generateOpts.flow,
      mode: generateOpts.mode,
      addSpeakerNotes: generateOpts.addSpeakerNotes || false,
      includeImages: generateOpts.includeImages || false,
      preserveVisualIdentity: generateOpts.preserveVisualIdentity ?? true,
    });

    try {
      const enhanced = await AiSidebar.show(op, orchestrator);
      if (enhanced) {
        await this._applyWholeDeckResult(enhanced);
        Notification.success("AI Refine all slides applied. Press Ctrl+Z to undo.");
      }
    } catch (err) {
      Notification.error(`AI generate failed: ${err.message || err}`);
    }
  }

  /**
   * Import an AI-generated deck markdown produced by an external tool
   * (issue #240). Goes straight to a paste modal that validates the pasted
   * output structurally (valid layouts, areas, non-empty content) and applies
   * it through the same replaceDeck path. The output is not compared against
   * the current deck — the user may have exported the prompt from a different
   * deck and is replacing the current one entirely. Supports both JSON
   * responses (the format the exported prompt asks for) and slide markdown.
   */
  async importWholeDeckResult() {
    const { AiImportModal } = await import("../ui/ai-import-modal.js");

    const deckStore = this._getDeckStore();
    if (!deckStore) {
      Notification.error(
        "Importing an AI result requires a loaded deck. Open or create a deck first.",
      );
      return;
    }

    // The import flow validates the pasted output structurally (valid layouts,
    // valid area names, non-empty content, parseable) but does NOT compare it
    // against the current deck. The user may have exported the prompt from a
    // different deck and is replacing the current one entirely — enforcing
    // slide count or image-source parity against the current deck would reject
    // legitimate cross-deck imports.
    //
    // The external AI may return either JSON (the format the exported prompt
    // asks for) or slide markdown (some models ignore format instructions).
    // We parse the response with parseAiResponse (which handles both) and
    // convert to slide markdown for validation and application.
    const validator = new AiOutputValidator({ inputMarkdown: "" });
    let lastConvertedMarkdown = null;
    const validate = (text) => {
      // Try parsing as an AI JSON response first; fall back to raw text if
      // it's already slide markdown.
      const parsed = parseAiResponse(text);
      let markdown;
      if (parsed && parsed.slides && parsed.slides.length > 0) {
        markdown = slidesToMarkdown(parsed.slides);
      } else {
        markdown = text;
      }
      lastConvertedMarkdown = markdown;
      // Structural validation only: no expected slide count, no image-source
      // restrictions, no identity enforcement. The validator still checks
      // layouts, areas, non-empty content, and basic schema rules.
      return validator.validate(markdown, "generate", {
        expectedSlideCount: undefined,
        skipOverflow: true,
        enforcePreserveIdentity: false,
        restrictImageSources: false,
        allowedImageSrcs: undefined,
        onlyExplicitImageSources: false,
        visualSystem: undefined,
      });
    };

    let pasted;
    try {
      pasted = await AiImportModal.show({ validate });
    } catch (err) {
      Notification.error(`Import failed: ${err.message || err}`);
      return;
    }
    if (!pasted) return; // cancelled

    // Use the converted markdown (JSON→markdown) from the last validation
    // call. This ensures we apply the same text that was validated.
    const markdownToApply = lastConvertedMarkdown || pasted;

    try {
      await this._applyWholeDeckResult(markdownToApply);
      Notification.success("AI result imported. Press Ctrl+Z to undo.");
    } catch (err) {
      Notification.error(`Import failed: ${err.message || err}`);
    }
  }

  /**
   * Apply a whole-deck AI result (enhanced markdown) to the deck.
   * Shared by the live AI generate flow and the import-AI-result flow so both
   * go through the same replaceDeck path (undoable, broadcasts, re-renders).
   * @param {string} enhancedMarkdown
   * @returns {Promise<void>}
   * @private
   */
  async _applyWholeDeckResult(enhancedMarkdown) {
    const deckStore = this._getDeckStore();
    const saveManager = this._getSaveManager();
    const controller = this._getController();
    if (!deckStore || !controller.reloadManager?.replaceDeck) return;

    await AssetLoader.ensureMarkdownItLoaded();
    const deck = await DeckLoader.parseMarkdown(enhancedMarkdown);

    // Update the deck store BEFORE firing deckchange via reloadManager so
    // the _onDeckChange handler reads the correct (post-refine) store
    // state. The structural-revision listener will clear the per-slide
    // editor-state cache when deckStore.replaceDeck bumps the revision.
    this._getUnsavedMarkdown().clear();
    const parser = new MarkdownParser();
    const newSlides = parser.splitSlides(enhancedMarkdown);
    // Route through replaceDeck so the refine is undoable (Ctrl+Z)
    // instead of loadFromMarkdown which clears history. Suppress the
    // queued store-change restore so the explicit reload below is the
    // single view refresh.
    this._withSuppressedStoreChange(() =>
      deckStore.replaceDeck(newSlides, 0, {
        index: 0,
        before: null,
        after: enhancedMarkdown,
        source: "ai",
        timestamp: Date.now(),
      }),
    );
    // Keep the store-sync module's structural revision in sync because
    // we are not using restoreStoreSnapshot() for this whole-deck
    // mutation. Any future store mutation that suppresses the queued
    // restore and does its own reload MUST also sync the revision here
    // — otherwise the next restoreStoreSnapshot will incorrectly
    // believe the revision is unchanged and saveSlideState the current
    // editor state for a stale slide index, silently corrupting the
    // per-slide undo cache.
    this._syncStructuralRevision();
    await controller.reloadManager.replaceDeck(deck, {
      startAtFirstSlide: true,
      syncStore: false,
    });
    this._setCurrentSlideIndex(0);
    this._loadSlideIntoEditor();
    await this._getPreviewUpdater()?.update();
    saveManager?.updateButton();
  }
}
