/**
 * StoreSyncController
 *
 * Keeps the editor view in sync with the canonical DeckStore. Handles
 * store-change events, reconciles unsaved editor overlays against the
 * store, restores the deck snapshot into the view after structural ops,
 * and provides the prepare/record hooks used by save, slide-ops, style,
 * and AI flows.
 *
 * Extracted from EditController (store-to-view sync concern).
 */

import { Logger } from "../../core/logger.js";
import { Notification } from "../../renderer/notification.js";
import { DeckLoader } from "../../data/deck-loader.js";
import { AssetLoader } from "../../core/asset-loader.js";
import { createEditPatch } from "../../data/store/slide-patch.js";

export class StoreSyncController {
  /**
   * @param {object} opts
   * @param {() => object|null} opts.getDeckStore
   * @param {() => object} opts.getController
   * @param {() => object} opts.getMarkdownEditor
   * @param {() => object} opts.getSaveManager
   * @param {() => object} opts.getPreviewUpdater
   * @param {() => Map<number, string>} opts.getUnsavedMarkdown
   * @param {(v: Map<number, string>) => void} opts.setUnsavedMarkdown
   * @param {(v: boolean) => void} opts.setHasUnsavedChanges
   * @param {() => number} opts.getCurrentSlideIndex
   * @param {(v: number) => void} opts.setCurrentSlideIndex
   * @param {() => boolean} opts.getIsEditMode
   * @param {() => boolean} opts.isDestroyed
   * @param {() => void} opts.captureCurrentEditorMarkdown
   * @param {() => void} opts.loadSlideIntoEditor
   * @param {() => boolean} opts.storeDiffersFromSource
   * @param {() => number} opts.getLastEditorSlideIndex
   * @param {() => void} opts.incrementDeckRestoreDepth
   * @param {() => void} opts.decrementDeckRestoreDepth
   * @param {() => number} opts.getPendingStructuralOperations
   * @param {(v: number) => void} opts.setPendingStructuralOperations
   */
  constructor({
    getDeckStore,
    getController,
    getMarkdownEditor,
    getSaveManager,
    getPreviewUpdater,
    getUnsavedMarkdown,
    setUnsavedMarkdown,
    setHasUnsavedChanges,
    getCurrentSlideIndex,
    setCurrentSlideIndex,
    getIsEditMode,
    isDestroyed,
    captureCurrentEditorMarkdown,
    loadSlideIntoEditor,
    storeDiffersFromSource,
    getLastEditorSlideIndex,
    incrementDeckRestoreDepth,
    decrementDeckRestoreDepth,
    getPendingStructuralOperations,
    setPendingStructuralOperations,
  }) {
    this._getDeckStore = getDeckStore;
    this._getController = getController;
    this._getMarkdownEditor = getMarkdownEditor;
    this._getSaveManager = getSaveManager;
    this._getPreviewUpdater = getPreviewUpdater;
    this._getUnsavedMarkdown = getUnsavedMarkdown;
    this._setUnsavedMarkdown = setUnsavedMarkdown;
    this._setHasUnsavedChanges = setHasUnsavedChanges;
    this._getCurrentSlideIndex = getCurrentSlideIndex;
    this._setCurrentSlideIndex = setCurrentSlideIndex;
    this._getIsEditMode = getIsEditMode;
    this._isDestroyed = isDestroyed;
    this._captureCurrentEditorMarkdown = captureCurrentEditorMarkdown;
    this._loadSlideIntoEditor = loadSlideIntoEditor;
    this._storeDiffersFromSource = storeDiffersFromSource;
    this._getLastEditorSlideIndex = getLastEditorSlideIndex;
    this._incrementDeckRestoreDepth = incrementDeckRestoreDepth;
    this._decrementDeckRestoreDepth = decrementDeckRestoreDepth;
    this._getPendingStructuralOperations = getPendingStructuralOperations;
    this._setPendingStructuralOperations = setPendingStructuralOperations;

    // Private state owned by this module
    this._queue = null;
    this._suppressRestore = false;
    this._lastStructuralRevision = this._getDeckStore()?.getStructuralRevision() ?? 0;
  }

  /**
   * Subscribe to DeckStore change events. Returns an unsubscribe function.
   * @returns {(() => void) | undefined}
   */
  subscribe() {
    const deckStore = this._getDeckStore();
    return deckStore?.onStoreChange((slides) => this.handleStoreChange(slides));
  }

  /**
   * Sync the cached structural revision from the store. Call this after a
   * whole-deck mutation that performs its own reload (bypassing
   * restoreStoreSnapshot) so the next restore doesn't incorrectly believe
   * the revision is unchanged and saveSlideState a stale editor state.
   */
  syncStructuralRevision() {
    const deckStore = this._getDeckStore();
    if (deckStore) this._lastStructuralRevision = deckStore.getStructuralRevision();
  }

  /**
   * Respond to a canonical DeckStore change by re-syncing the editor view.
   * Preserves unsaved editor overlays that still differ from the store and
   * re-renders thumbnails, the current slide, and the preview.
   * @param {string[]} slides
   */
  handleStoreChange(slides) {
    if (this._isDestroyed()) return;

    this.reconcileUnsavedOverlays([...slides]);
    this._setHasUnsavedChanges(
      this._storeDiffersFromSource() || this._getUnsavedMarkdown().size > 0,
    );
    this._getSaveManager()?.updateButton();

    if (this._getIsEditMode() && !this._suppressRestore) {
      this._queue = this.chainStoreChangeRestore().catch((error) => {
        Logger.error("Store-to-view sync failed:", error);
        Notification.error("Failed to refresh the editor view.");
      });
    }
  }

  /**
   * Capture the current editor buffer into unsaved overlays, sync the
   * merged slides into the store (without emitting storeChange), and
   * reconcile overlays + dirty flag.
   *
   * When `recordHistory` is true, patches are applied via `applyPatches`
   * so the operation is undoable; a silent `syncSlides` is used as a
   * fallback if the patches are rejected. When false, a silent
   * `syncSlides` is used directly.
   * @param {boolean} recordHistory
   */
  prepareStoreOperation(recordHistory = false) {
    // The injected capture callback is guarded (captureCurrentEditorState):
    // outside edit mode the stale buffer is not attributed to the current
    // slide, and inside edit mode the pending edits are flushed first.
    this._captureCurrentEditorMarkdown();
    const deckStore = this._getDeckStore();
    const storeSlides = deckStore.getSlides();
    const storeSlideObjects = storeSlides.map((markdown, index) => ({ index, markdown }));
    const fullSlides = this._getSaveManager()
      .getFullSlides(storeSlideObjects)
      .map((slide) => slide.markdown ?? "");

    if (recordHistory) {
      const patches = [];
      for (let i = 0; i < storeSlides.length; i++) {
        if (storeSlides[i] !== fullSlides[i]) {
          patches.push(createEditPatch(i, storeSlides[i], fullSlides[i], "user"));
        }
      }
      if (patches.length > 0) {
        const result = deckStore.applyPatches(patches, { emitStoreChange: false });
        const succeeded = result === true || (result && result.success === true);
        if (!succeeded) {
          // Patches were rejected (drift / before mismatch); fall back to a
          // silent full sync so the store stays in sync with the editor.
          deckStore.syncSlides(fullSlides, this._getCurrentSlideIndex(), {
            emitStoreChange: false,
          });
        }
      }
    } else {
      deckStore.syncSlides(fullSlides, this._getCurrentSlideIndex(), {
        emitStoreChange: false,
      });
    }

    this.reconcileUnsavedOverlays(deckStore.getSlides());
    this._setHasUnsavedChanges(
      this._storeDiffersFromSource() || this._getUnsavedMarkdown().size > 0,
    );
    this._getSaveManager()?.updateButton();
  }

  /**
   * Increment the pending structural-operations counter. Used by slide
   * operations (add/delete/move) so undo logic knows to skip the editor
   * undo stack and go straight to store-level undo.
   */
  recordStoreOperation() {
    this._setPendingStructuralOperations(this._getPendingStructuralOperations() + 1);
  }

  /**
   * Prune out-of-range or identical unsaved overlays, keeping only those
   * that genuinely differ from the supplied source.
   * @param {string[]} source
   */
  reconcileUnsavedOverlays(source) {
    const next = new Map();
    for (const [idx, value] of this._getUnsavedMarkdown()) {
      if (idx >= 0 && idx < source.length && value !== source[idx]) {
        next.set(idx, value);
      }
    }
    this._setUnsavedMarkdown(next);
  }

  /**
   * Reload the deck from the store into the view. Preserves the per-slide
   * editor-state cache when the structural revision hasn't changed, updates
   * the deck reference via reloadManager, navigates to the store's active
   * index, and loads the editor at the correct (clamped) index.
   * @returns {Promise<boolean>}
   */
  async restoreStoreSnapshot() {
    const deckStore = this._getDeckStore();
    if (!deckStore) return false;
    const currentStructuralRevision = deckStore.getStructuralRevision();
    const structuralRevisionChanged = currentStructuralRevision !== this._lastStructuralRevision;
    this._lastStructuralRevision = currentStructuralRevision;

    // Save the current editor state into the cache before the restore
    // potentially replaces it, so the most recent undo history is preserved
    // rather than a stale snapshot from the last navigation away.
    // Skip this when the structural revision has changed (add/delete/move
    // or whole-deck load) because the current editor state belongs to a
    // pre-op slide at a pre-op index and would pollute the cache. The
    // structural-change listener already cleared the cache.
    if (
      !structuralRevisionChanged &&
      this._getLastEditorSlideIndex() >= 0 &&
      this._getMarkdownEditor()
    ) {
      this._getMarkdownEditor().saveSlideState(this._getLastEditorSlideIndex());
    }
    const markdown = deckStore.toMarkdown();
    const restoredActiveIndex = deckStore.getActiveIndex();
    await AssetLoader.ensureMarkdownItLoaded();
    const deck = await DeckLoader.parseMarkdown(markdown);
    const controller = this._getController();
    // Use a depth counter instead of a boolean so concurrent restores
    // don't clear the flag while an outer restore is still in progress.
    // The depth counter lives on EditController because _onSlideChange
    // and _onDeckChange also read it to suppress loads during a restore.
    this._incrementDeckRestoreDepth();
    try {
      await controller.reloadManager.replaceDeck(deck, { syncStore: false });
      // Navigate to the restored index while the depth is still > 0 so
      // _onSlideChange is suppressed — the explicit loadSlideIntoEditor
      // below is the single load at the correct index.
      controller.slideNavigator.goTo(restoredActiveIndex, { broadcast: false });
    } finally {
      this._decrementDeckRestoreDepth();
    }
    // Use the navigator's clamped index (which may differ from the store's
    // raw active index if hidden-slide adjustment was applied) and load
    // the editor at that index with the updated deck.
    this._setCurrentSlideIndex(controller.slideNavigator.currentIndex);
    this._loadSlideIntoEditor();
    return true;
  }

  /**
   * Chain an explicit store-to-view restore onto the store-change queue.
   * This serializes the restore with any in-flight one so a stale restore
   * from a previous operation cannot overwrite a newer store state.
   * @returns {Promise<boolean>}
   */
  chainStoreChangeRestore() {
    const queue = (this._queue || Promise.resolve())
      .catch(() => {})
      .then(async () => {
        await this.restoreStoreSnapshot();
        this._getPreviewUpdater()?.update();
        return true;
      });
    this._queue = queue;
    return queue;
  }

  /**
   * Run a synchronous store mutation with the queued store-change restore
   * suppressed. Use this around any operation that immediately performs its
   * own explicit view restore (undo, redo, AI patch, whole-deck replace) so
   * the synchronous storeChange emit does not queue a duplicate restore.
   *
   * **Cross-module invariant:** if the suppressed operation mutates the
   * deck's structural revision (add/delete/move/whole-deck replace) and
   * performs its own reload rather than going through
   * `restoreStoreSnapshot`, the caller MUST also call
   * `syncStructuralRevision()` afterwards. Otherwise the next restore will
   * `saveSlideState` the current editor state under a stale slide index and
   * corrupt the per-slide undo cache.
   *
   * The callback **must be synchronous** — the flag is restored in a
   * `finally` block, so an `async` callback would clear it at the first
   * `await` and any later `storeChange` emit would not be suppressed.
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  withSuppressedStoreChange(fn) {
    const previous = this._suppressRestore;
    this._suppressRestore = true;
    try {
      return fn();
    } finally {
      this._suppressRestore = previous;
    }
  }
}
