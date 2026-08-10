// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import markdownit from "markdown-it";
import { SaveManager } from "../editor/ui/save-manager.js";
import { EditController } from "../editor/core/edit-controller.js";
import { StoreSyncController } from "../editor/core/store-sync-controller.js";
import { EditorBufferController } from "../editor/core/editor-buffer-controller.js";
import { HistoryController } from "../editor/core/history-controller.js";
import { DeckStore } from "../data/store/deck-store.js";
import { MarkdownParser } from "../data/markdown-parser.js";
import { ImageInteractionHandler } from "../editor/image/image-interaction-handler.js";
import { TextBlockHandler } from "../editor/text/text-block-handler.js";
import { SlideStylePanel } from "../editor/ui/slide-style-panel.js";
import { StageScaler } from "../renderer/stage-scaler.js";

beforeAll(() => {
  window.markdownit = markdownit;
});

afterEach(() => {
  window.__WEBDECK_MARKDOWN__ = undefined;
});

/**
 * Wire a real StoreSyncController to a fake EditController-like object.
 * The controller's getters read from the fake so tests can assert on
 * the fake's mutable fields after calling store-sync methods.
 */
function createStoreSync(fake) {
  return new StoreSyncController({
    getDeckStore: () => fake.deckStore,
    getController: () => fake.controller,
    getMarkdownEditor: () => fake.markdownEditor,
    getSaveManager: () => fake.saveManager,
    getPreviewUpdater: () => fake.previewUpdater,
    getUnsavedMarkdown: () => fake.unsavedMarkdown,
    setUnsavedMarkdown: (v) => {
      fake.unsavedMarkdown = v;
    },
    setHasUnsavedChanges: (v) => {
      fake.hasUnsavedChanges = v;
    },
    getCurrentSlideIndex: () => fake.currentSlideIndex,
    setCurrentSlideIndex: (v) => {
      fake.currentSlideIndex = v;
    },
    getIsEditMode: () => fake.isEditMode,
    isDestroyed: () => fake._destroyed ?? false,
    captureCurrentEditorMarkdown: () => fake._captureCurrentEditorMarkdown?.(),
    loadSlideIntoEditor: () => fake.loadSlideIntoEditor?.(),
    storeDiffersFromSource: () => fake._storeDiffersFromSource?.() ?? false,
    getLastEditorSlideIndex: () => fake._lastEditorSlideIndex ?? -1,
    incrementDeckRestoreDepth: () => {
      fake._deckRestoreDepth = (fake._deckRestoreDepth ?? 0) + 1;
    },
    decrementDeckRestoreDepth: () => {
      fake._deckRestoreDepth = (fake._deckRestoreDepth ?? 0) - 1;
    },
    getPendingStructuralOperations: () => fake._pendingStructuralOperations ?? 0,
    setPendingStructuralOperations: (v) => {
      fake._pendingStructuralOperations = v;
    },
  });
}

function createSaveManager(overrides = {}) {
  let hasUnsaved = overrides.hasUnsavedChanges ?? false;
  const unsaved = overrides.unsavedMarkdown ?? new Map();
  return new SaveManager({
    getDeck: () => ({ slides: [] }),
    getDeckStore: () => null,
    getSourceMarkdown: () => overrides.sourceMarkdown ?? "",
    setSourceMarkdown: overrides.setSourceMarkdown ?? (() => {}),
    getUnsavedMarkdown: () => unsaved,
    getHasUnsavedChanges: () => hasUnsaved,
    setHasUnsavedChanges: (v) => {
      hasUnsaved = v;
      if (overrides.setHasUnsavedChanges) overrides.setHasUnsavedChanges(v);
    },
    onBeforeSave: overrides.onBeforeSave,
    onSaveStateReset: overrides.onSaveStateReset,
  });
}

/**
 * Wire a real EditorBufferController to a fake EditController-like object.
 */
function createBuffer(fake) {
  return new EditorBufferController({
    getMarkdownEditor: () => fake.markdownEditor,
    getDeckStore: () => fake.deckStore,
    getDeck: () => fake.deck,
    getUnsavedMarkdown: () => fake.unsavedMarkdown,
    getCurrentSlideIndex: () => fake.currentSlideIndex,
    getIsEditMode: () => fake.isEditMode,
    getSaveManager: () => fake.saveManager,
    getPreviewUpdater: () => fake.previewUpdater,
    getAreaGuides: () => fake.areaGuides,
    getLastEditorSlideIndex: () => fake._lastEditorSlideIndex,
    setLastEditorSlideIndex: (v) => {
      fake._lastEditorSlideIndex = v;
    },
    getLastEditorDeck: () => fake._lastEditorDeck,
    setLastEditorDeck: (v) => {
      fake._lastEditorDeck = v;
    },
    setHasUnsavedChanges: (v) => {
      fake.hasUnsavedChanges = v;
    },
  });
}

/**
 * Wire a real HistoryController to a fake EditController-like object.
 */
function createHistory(fake) {
  return new HistoryController({
    getMarkdownEditor: () => fake.markdownEditor,
    getDeckStore: () => fake.deckStore,
    getUnsavedMarkdown: () => fake.unsavedMarkdown,
    getPendingStructuralOperations: () => fake._pendingStructuralOperations ?? 0,
    chainStoreChangeRestore: () => fake.storeSync.chainStoreChangeRestore(),
    withSuppressedStoreChange: (fn) => fake.storeSync.withSuppressedStoreChange(fn),
  });
}

describe("Editor undo regression suite", () => {
  describe("store-null SaveManager path", () => {
    it("getFullSlides() with no args and no store returns string[]", () => {
      const sm = createSaveManager({
        sourceMarkdown: "# A\n---\n# B",
        unsavedMarkdown: new Map([[1, "## B edited"]]),
      });

      const full = sm.getFullSlides();
      expect(Array.isArray(full)).toBe(true);
      expect(full.every((s) => typeof s === "string")).toBe(true);
      expect(full).toEqual(["# A", "## B edited"]);
    });

    it("getFullMarkdown() with no args and no store returns a string", () => {
      const sm = createSaveManager({
        sourceMarkdown: "# A\n---\n# B",
        unsavedMarkdown: new Map([[1, "## B edited"]]),
      });

      const full = sm.getFullMarkdown();
      expect(typeof full).toBe("string");
      expect(full).toBe("# A\n\n---\n\n## B edited");
    });

    it("produces markdown that can be parsed into a deck without a DeckStore", () => {
      const sm = createSaveManager({
        sourceMarkdown: "# A\n---\n# B",
        unsavedMarkdown: new Map([[1, "## B edited"]]),
      });

      const fullMarkdown = sm.getFullMarkdown();
      const parser = new MarkdownParser();
      const deck = parser.parseDeckMarkdown(fullMarkdown);

      expect(deck.slides.length).toBe(2);
      expect(deck.slides[1].title).toBe("B edited");
    });
  });

  describe("save baseline and dirty flag", () => {
    it("_markSaved updates the source baseline and keeps the dirty flag clean until the next edit", () => {
      const setSourceMarkdown = vi.fn();
      const setHasUnsavedChanges = vi.fn();
      const unsaved = new Map([[0, "# A edited"]]);

      const sm = createSaveManager({
        sourceMarkdown: "# A",
        unsavedMarkdown: unsaved,
        hasUnsavedChanges: true,
        setHasUnsavedChanges,
        setSourceMarkdown,
      });

      sm._markSaved("# A edited");

      expect(unsaved.size).toBe(0);
      expect(setHasUnsavedChanges).toHaveBeenCalledWith(false);
      expect(setSourceMarkdown).toHaveBeenCalledWith("# A edited");
      expect(sm.hasUnsavedChanges).toBe(false);

      // After the save baseline is updated, a new edit flips the dirty flag again.
      unsaved.set(0, "# A edited again");
      sm.hasUnsavedChanges = true;
      expect(sm.hasUnsavedChanges).toBe(true);
    });

    it("_setSourceMarkdown clears the cached source so the next diff uses the saved baseline", () => {
      const fake = {
        _cachedSourceMarkdown: null,
        _cachedOriginalSlides: [],
        _getSourceMarkdown: () => window.__WEBDECK_MARKDOWN__ ?? "",
        _cacheOriginalMarkdown: EditController.prototype._cacheOriginalMarkdown,
        deckStore: {
          getSlides: () => ["# A edited"],
        },
      };

      // Seed the cache with the pre-save source.
      fake._cachedSourceMarkdown = "# A";
      fake._cachedOriginalSlides = ["# A"];

      expect(EditController.prototype._storeDiffersFromSource.call(fake)).toBe(true);

      // Simulate the save updating the source baseline.
      EditController.prototype._setSourceMarkdown.call(fake, "# A edited");
      expect(fake._cachedSourceMarkdown).toBeNull();

      // The next diff re-reads the new source and matches the store.
      window.__WEBDECK_MARKDOWN__ = "# A edited";
      expect(EditController.prototype._storeDiffersFromSource.call(fake)).toBe(false);
    });
  });

  describe("undo after save", () => {
    it("reverts the just-saved text, not an earlier structural change", async () => {
      const deckStore = new DeckStore();
      deckStore.loadFromMarkdown("# A");

      const onStore = vi.fn();
      deckStore.onStoreChange(onStore);

      const unsaved = new Map([[0, "# A edited"]]);
      const fake = {
        currentSlideIndex: 0,
        deckStore,
        unsavedMarkdown: unsaved,
        hasUnsavedChanges: true,
        _pendingStructuralOperations: 0,
        _deckRestoreDepth: 0,
        _lastEditorSlideIndex: -1,
        controller: {
          reloadManager: { replaceDeck: () => Promise.resolve() },
          slideNavigator: { goTo: () => {}, currentIndex: 0 },
        },
        _captureCurrentEditorMarkdown: () => {},
        _storeDiffersFromSource: () => true,
        saveManager: {
          getFullSlides: () => [{ index: 0, markdown: "# A edited" }],
          updateButton: vi.fn(),
        },
        markdownEditor: {
          canUndo: () => false,
          undo: vi.fn(),
        },
        previewUpdater: { update: vi.fn() },
        loadSlideIntoEditor: () => {},
      };
      fake.storeSync = createStoreSync(fake);
      fake.history = createHistory(fake);

      // User edits and then saves.
      EditController.prototype.prepareStoreOperation.call(fake, true);
      expect(deckStore.getSlides()[0]).toBe("# A edited");

      // The save path itself does not broadcast a storeChange.
      expect(onStore).not.toHaveBeenCalled();

      // Immediately undo after the save.
      await fake.history.undo();
      expect(deckStore.getSlides()[0]).toBe("# A");

      // The undo used store history, not the editor's local undo.
      expect(fake.markdownEditor.undo).not.toHaveBeenCalled();
    });

    it("prepareStoreOperation does not broadcast storeChange or clear the editor cache", () => {
      const deckStore = new DeckStore();
      deckStore.loadFromMarkdown("# A");

      const onStore = vi.fn();
      deckStore.onStoreChange(onStore);

      const clearSlideStateCache = vi.fn();
      const unsaved = new Map([[0, "# A edited"]]);
      const fake = {
        currentSlideIndex: 0,
        deckStore,
        unsavedMarkdown: unsaved,
        hasUnsavedChanges: true,
        _captureCurrentEditorMarkdown: () => {},
        _storeDiffersFromSource: () => true,
        saveManager: {
          getFullSlides: () => [{ index: 0, markdown: "# A edited" }],
          updateButton: vi.fn(),
        },
        markdownEditor: {
          getValue: () => "# A edited",
          clearSlideStateCache,
        },
      };
      fake.storeSync = createStoreSync(fake);

      EditController.prototype.prepareStoreOperation.call(fake, true);
      expect(deckStore.getSlides()[0]).toBe("# A edited");
      expect(onStore).not.toHaveBeenCalled();
      expect(clearSlideStateCache).not.toHaveBeenCalled();
    });

    it("onBeforeSave callback does not broadcast storeChange or clear the editor cache", () => {
      const deckStore = new DeckStore();
      deckStore.loadFromMarkdown("# A");

      const onStore = vi.fn();
      deckStore.onStoreChange(onStore);

      const clearSlideStateCache = vi.fn();
      const unsaved = new Map([[0, "# A edited"]]);
      const fake = {
        currentSlideIndex: 0,
        deckStore,
        unsavedMarkdown: unsaved,
        hasUnsavedChanges: true,
        _captureCurrentEditorMarkdown: () => {},
        _storeDiffersFromSource: () => true,
        saveManager: {
          getFullSlides: () => [{ index: 0, markdown: "# A edited" }],
          updateButton: vi.fn(),
        },
        markdownEditor: {
          getValue: () => "# A edited",
          clearSlideStateCache,
        },
      };
      fake.storeSync = createStoreSync(fake);

      // This is the exact callback passed to SaveManager by EditController.
      const onBeforeSave = () => {
        EditController.prototype.prepareStoreOperation.call(fake, true);
      };
      onBeforeSave();

      expect(deckStore.getSlides()[0]).toBe("# A edited");
      expect(onStore).not.toHaveBeenCalled();
      expect(clearSlideStateCache).not.toHaveBeenCalled();
    });
  });

  describe("loadSlideIntoEditor preserves undo history", () => {
    it("uses setValue (not loadSlideState) when slide and deck are unchanged", () => {
      const saveSlideState = vi.fn();
      const loadSlideState = vi.fn();
      const setValue = vi.fn();
      const getValue = vi.fn(() => "# old");
      const deck = { id: 1 };
      const fake = {
        isEditMode: true,
        currentSlideIndex: 0,
        deck,
        _lastEditorSlideIndex: 0,
        _lastEditorDeck: deck,
        deckStore: { getSlides: () => ["# A"] },
        unsavedMarkdown: new Map(),
        _captureEditorMarkdown: vi.fn(),
        markdownEditor: {
          getValue,
          setValue,
          saveSlideState,
          loadSlideState,
          hasClearedCache: vi.fn(() => false),
          clearSlideStateCache: vi.fn(),
        },
        saveManager: { updateButton: vi.fn() },
        areaGuides: { refresh: vi.fn() },
      };

      const buffer = createBuffer(fake);

      buffer.loadSlideIntoEditor();

      // Same slide/deck: update in place with setValue so CodeMirror history survives.
      expect(setValue).toHaveBeenCalledWith("# A", { suppressOnChange: true });
      expect(loadSlideState).not.toHaveBeenCalled();
      expect(saveSlideState).not.toHaveBeenCalled();
    });

    it("does not flush stale buffer to the wrong slide when the deck has changed", () => {
      const oldDeck = { id: 1 };
      const newDeck = { id: 2 };
      const fake = {
        isEditMode: true,
        currentSlideIndex: 0,
        deck: newDeck,
        _lastEditorSlideIndex: 1,
        _lastEditorDeck: oldDeck,
        deckStore: { getSlides: () => ["# A", "# B"] },
        unsavedMarkdown: new Map(),
        markdownEditor: {
          getValue: vi.fn(() => "## New Slide"),
          setValue: vi.fn(),
          saveSlideState: vi.fn(),
          loadSlideState: vi.fn(),
          cancelOnChange: vi.fn(),
          hasClearedCache: vi.fn(() => true),
        },
        saveManager: { updateButton: vi.fn() },
        areaGuides: { refresh: vi.fn() },
      };
      const buffer = createBuffer(fake);
      const captureSpy = vi.spyOn(buffer, "captureEditorMarkdown");

      buffer.loadSlideIntoEditor();

      // The old buffer belongs to the previous deck; do not write it into
      // slide 1 of the restored deck.
      expect(captureSpy).not.toHaveBeenCalled();
      expect(fake._lastEditorSlideIndex).toBe(0);
      expect(fake._lastEditorDeck).toBe(newDeck);
    });

    it("flushes pending editor buffer when navigating within the same deck", () => {
      const deck = { id: 1 };
      const fake = {
        isEditMode: true,
        currentSlideIndex: 1,
        deck,
        _lastEditorSlideIndex: 0,
        _lastEditorDeck: deck,
        deckStore: { getSlides: () => ["# A", "# B"] },
        unsavedMarkdown: new Map(),
        markdownEditor: {
          getValue: vi.fn(() => "## B edited"),
          setValue: vi.fn(),
          saveSlideState: vi.fn(),
          loadSlideState: vi.fn(),
          cancelOnChange: vi.fn(),
          hasClearedCache: vi.fn(() => false),
        },
        saveManager: { updateButton: vi.fn() },
        areaGuides: { refresh: vi.fn() },
      };
      const buffer = createBuffer(fake);
      const captureSpy = vi.spyOn(buffer, "captureEditorMarkdown");

      buffer.loadSlideIntoEditor();

      // Same deck: the buffer for the previous slide should still be captured.
      expect(captureSpy).toHaveBeenCalledWith(0);
    });
  });

  describe("handleStoreChange during undo/redo", () => {
    it("skips the queued restoreStoreSnapshot when a store change is suppressed", async () => {
      const replaceDeck = vi.fn(() => Promise.resolve());
      const fake = {
        deckStore: {
          getStructuralRevision: () => 0,
          toMarkdown: () => "# A",
          getActiveIndex: () => 0,
          getSlides: () => ["# A"],
        },
        controller: {
          reloadManager: { replaceDeck },
          slideNavigator: { goTo: () => {}, currentIndex: 0 },
        },
        isEditMode: true,
        unsavedMarkdown: new Map(),
        hasUnsavedChanges: false,
        _destroyed: false,
        _lastEditorSlideIndex: -1,
        _deckRestoreDepth: 0,
        _storeDiffersFromSource: () => false,
        saveManager: { updateButton: vi.fn() },
        previewUpdater: { update: vi.fn() },
        markdownEditor: null,
        loadSlideIntoEditor: () => {},
      };
      const storeSync = createStoreSync(fake);
      // Suppress restore (simulates undo/redo wrapping a store mutation).
      storeSync.withSuppressedStoreChange(() => {
        storeSync.handleStoreChange(["# A"]);
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      // The restore path calls reloadManager.replaceDeck; suppression should
      // prevent that call entirely. The companion positive test below
      // asserts replaceDeck *was* called, proving the restore chain itself
      // doesn't throw — so a pass here cannot be explained by a swallowed
      // error in restoreStoreSnapshot.
      expect(replaceDeck).not.toHaveBeenCalled();
    });

    it("queues restoreStoreSnapshot when store changes are not suppressed", async () => {
      const replaceDeck = vi.fn(() => Promise.resolve());
      const fake = {
        deckStore: {
          getStructuralRevision: () => 0,
          toMarkdown: () => "# A",
          getActiveIndex: () => 0,
          getSlides: () => ["# A"],
        },
        controller: {
          reloadManager: { replaceDeck },
          slideNavigator: { goTo: () => {}, currentIndex: 0 },
        },
        isEditMode: true,
        unsavedMarkdown: new Map(),
        hasUnsavedChanges: false,
        _destroyed: false,
        _lastEditorSlideIndex: -1,
        _deckRestoreDepth: 0,
        _storeDiffersFromSource: () => false,
        saveManager: { updateButton: vi.fn() },
        previewUpdater: { update: vi.fn() },
        markdownEditor: null,
        loadSlideIntoEditor: () => {},
      };
      const storeSync = createStoreSync(fake);
      storeSync.handleStoreChange(["# A"]);
      await new Promise((resolve) => setTimeout(resolve, 0));

      // The restore path should have run and called replaceDeck.
      expect(replaceDeck).toHaveBeenCalledTimes(1);
    });
  });

  describe("prepareStoreOperation buffer capture", () => {
    function makeFake({ isEditMode, currentSlideIndex, bufferValue, unsaved = new Map() }) {
      const deckStore = new DeckStore();
      deckStore.loadFromMarkdown("# s0\n\n---\n\n# s1\n\n---\n\n# s2\n\n---\n\n# s3");
      return {
        isEditMode,
        currentSlideIndex,
        deckStore,
        unsavedMarkdown: unsaved,
        _pendingStructuralOperations: 0,
        markdownEditor: {
          // The buffer may be stale when the editor is not active.
          getValue: () => bufferValue,
        },
        // Mirrors EditController's wiring: the injected capture routes to a
        // guarded capture that skips outside edit mode (stale buffer).
        _captureCurrentEditorMarkdown: () => {
          if (!isEditMode) return;
          const markdown = bufferValue;
          const original = deckStore.getSlides()[currentSlideIndex] ?? "";
          if (markdown !== original && markdown !== unsaved.get(currentSlideIndex)) {
            unsaved.set(currentSlideIndex, markdown);
          }
        },
        _storeDiffersFromSource: () => false,
        saveManager: {
          getFullSlides: (slides) => slides.map((s) => ({ markdown: s.markdown })),
          updateButton: vi.fn(),
        },
      };
    }

    it("does not attribute the stale editor buffer to the current slide outside edit mode", () => {
      const fake = makeFake({
        isEditMode: false,
        currentSlideIndex: 3,
        bufferValue: "# stale slide 0 text",
      });
      fake.storeSync = createStoreSync(fake);

      fake.storeSync.prepareStoreOperation(true);

      // Slide 3 keeps its own content; the stale buffer must not leak into
      // unsavedMarkdown (and from there into the written file).
      expect(fake.deckStore.getSlides()[3]).toBe("# s3");
      expect(fake.unsavedMarkdown.has(3)).toBe(false);
    });

    it("captures the live buffer when the editor is active", () => {
      const fake = makeFake({
        isEditMode: true,
        currentSlideIndex: 3,
        bufferValue: "# typed in the editor",
      });
      fake.storeSync = createStoreSync(fake);

      fake.storeSync.prepareStoreOperation(true);

      expect(fake.unsavedMarkdown.get(3)).toBe("# typed in the editor");
    });
  });

  describe("toggleEditMode buffer capture on exit", () => {
    it("captures the buffer against the hidden slide before onEditModeChanged navigates away", () => {
      const deactivateImage = vi
        .spyOn(ImageInteractionHandler, "deactivate")
        .mockImplementation(() => {});
      const deactivateText = vi.spyOn(TextBlockHandler, "deactivate").mockImplementation(() => {});
      const hidePanel = vi.spyOn(SlideStylePanel, "hide").mockImplementation(() => {});
      const applyScale = vi.spyOn(StageScaler, "applyStageScale").mockImplementation(() => {});

      const deckStore = new DeckStore();
      deckStore.loadFromMarkdown("# s0\n\n---\n\n# hidden\n\n---\n\n# s2\n\n---\n\n# s3");
      const unsaved = new Map();
      const fake = {
        isEditMode: true,
        currentSlideIndex: 1, // the hidden slide currently in the editor
        deckStore,
        unsavedMarkdown: unsaved,
        hasUnsavedChanges: false,
        markdownEditor: {
          getValue: () => "# hidden edited",
          cancelOnChange: vi.fn(),
        },
        _getSourceMarkdown: () => "# s0\n\n---\n\n# hidden\n\n---\n\n# s2\n\n---\n\n# s3",
        _captureCurrentEditorMarkdown: () => fake.buffer.captureCurrentEditorMarkdown(),
        // EditController._captureCurrentEditorMarkdown delegates to the
        // buffer controller, which captures against the current slide index.
        buffer: {
          captureCurrentEditorMarkdown: () => {
            const markdown = "# hidden edited";
            const original = deckStore.getSlides()[fake.currentSlideIndex] ?? "";
            if (markdown !== original && markdown !== unsaved.get(fake.currentSlideIndex)) {
              unsaved.set(fake.currentSlideIndex, markdown);
            }
          },
        },
        controller: {
          // Simulates SlideNavigator jumping to the next visible slide when
          // the current one is hidden — before the flush runs in the buggy
          // version, this moves currentSlideIndex away from the buffer.
          onEditModeChanged: vi.fn(() => {
            fake.currentSlideIndex = 2;
          }),
          roleManager: { isEditorWindow: false },
        },
        elements: {
          editorPanel: { classList: { add: vi.fn(), remove: vi.fn() } },
          toggleEditModeBtn: {
            classList: { add: vi.fn(), remove: vi.fn() },
            setAttribute: vi.fn(),
          },
          toggleEditModeLabel: { textContent: "" },
          presenterPanel: { classList: { add: vi.fn(), remove: vi.fn() } },
        },
        mermaidHelper: { hide: vi.fn() },
        placeholderDialogEl: null,
        saveManager: { updateButton: vi.fn() },
      };

      EditController.prototype.toggleEditMode.call(fake);

      // The hidden slide's buffer must be filed under the slide it belongs
      // to (index 1), not the visible slide the app jumped to (index 2).
      expect(unsaved.get(1)).toBe("# hidden edited");
      expect(unsaved.has(2)).toBe(false);

      deactivateImage.mockRestore();
      deactivateText.mockRestore();
      hidePanel.mockRestore();
      applyScale.mockRestore();
    });
  });
});
