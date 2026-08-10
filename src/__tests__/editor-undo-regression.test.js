// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import markdownit from "markdown-it";
import { SaveManager } from "../editor/ui/save-manager.js";
import { EditController } from "../editor/core/edit-controller.js";
import { DeckStore } from "../data/store/deck-store.js";
import { MarkdownParser } from "../data/markdown-parser.js";

beforeAll(() => {
  window.markdownit = markdownit;
});

afterEach(() => {
  window.__WEBDECK_MARKDOWN__ = undefined;
});

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
        _pendingStructuralOperations: 0,
        _historyOperation: null,
        _deckRestoreDepth: 0,
        _captureCurrentEditorMarkdown: () => {},
        captureCurrentEditorState: EditController.prototype.captureCurrentEditorState,
        _reconcileUnsavedOverlays: EditController.prototype._reconcileUnsavedOverlays,
        _restoreStoreSnapshot: () => true,
        _storeDiffersFromSource: () => true,
        saveManager: {
          getFullSlides: () => [{ index: 0, markdown: "# A edited" }],
          updateButton: vi.fn(),
        },
        markdownEditor: {
          canUndo: () => false,
          undo: vi.fn(),
        },
      };

      // User edits and then saves.
      EditController.prototype.prepareStoreOperation.call(fake, true);
      expect(deckStore.getSlides()[0]).toBe("# A edited");

      // The save path itself does not broadcast a storeChange.
      expect(onStore).not.toHaveBeenCalled();

      // Immediately undo after the save.
      await EditController.prototype.undo.call(fake);
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
        _captureCurrentEditorMarkdown: () => {},
        captureCurrentEditorState: EditController.prototype.captureCurrentEditorState,
        _reconcileUnsavedOverlays: EditController.prototype._reconcileUnsavedOverlays,
        _restoreStoreSnapshot: () => true,
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
        _captureCurrentEditorMarkdown: () => {},
        captureCurrentEditorState: EditController.prototype.captureCurrentEditorState,
        _reconcileUnsavedOverlays: EditController.prototype._reconcileUnsavedOverlays,
        _restoreStoreSnapshot: () => true,
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

      EditController.prototype.loadSlideIntoEditor.call(fake);

      // Same slide/deck: update in place with setValue so CodeMirror history survives.
      expect(setValue).toHaveBeenCalledWith("# A", { suppressOnChange: true });
      expect(loadSlideState).not.toHaveBeenCalled();
      expect(saveSlideState).not.toHaveBeenCalled();
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
        captureCurrentEditorState: EditController.prototype.captureCurrentEditorState,
        _captureCurrentEditorMarkdown: EditController.prototype._captureCurrentEditorMarkdown,
        _captureEditorMarkdown: EditController.prototype._captureEditorMarkdown,
        updateUnsavedChangesFlag: EditController.prototype.updateUnsavedChangesFlag,
        _reconcileUnsavedOverlays: EditController.prototype._reconcileUnsavedOverlays,
        _storeDiffersFromSource: () => false,
        saveManager: {
          // getFullSlides returns slide objects with a .markdown property,
          // matching the real contract that prepareStoreOperation depends on.
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

      EditController.prototype.prepareStoreOperation.call(fake, true);

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

      EditController.prototype.prepareStoreOperation.call(fake, true);

      expect(fake.unsavedMarkdown.get(3)).toBe("# typed in the editor");
    });
  });
});
