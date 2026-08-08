import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SaveManager } from "../editor/ui/save-manager.js";
import { DeckStore } from "../data/store/deck-store.js";
import { createEditPatch } from "../data/store/slide-patch.js";
import { EditController } from "../editor/core/edit-controller.js";

function createSaveManager(overrides = {}) {
  return new SaveManager({
    getDeck: () => ({ slides: [] }),
    getDeckStore: () => null,
    getSourceMarkdown: () => overrides.sourceMarkdown ?? "",
    setSourceMarkdown: () => {},
    getUnsavedMarkdown: () => overrides.unsavedMarkdown ?? new Map(),
    getHasUnsavedChanges: () => false,
    setHasUnsavedChanges: () => {},
    ...overrides,
  });
}

describe("SaveManager mirror removal contract", () => {
  it("getFullSlides() without a store returns string[]", () => {
    const sm = createSaveManager({
      sourceMarkdown: "# A\n---\n# B",
      unsavedMarkdown: new Map([[1, "## B edited"]]),
    });

    const full = sm.getFullSlides();
    expect(Array.isArray(full)).toBe(true);
    expect(full.every((s) => typeof s === "string")).toBe(true);
    expect(full).toEqual(["# A", "## B edited"]);
  });

  it("getFullSlides() with a store returns string[]", () => {
    const sm = createSaveManager({
      getDeckStore: () => ({ getSlides: () => ["# A", "# B"] }),
      unsavedMarkdown: new Map([[1, "## B edited"]]),
    });

    const full = sm.getFullSlides();
    expect(Array.isArray(full)).toBe(true);
    expect(full.every((s) => typeof s === "string")).toBe(true);
    expect(full).toEqual(["# A", "## B edited"]);
  });

  it("getFullMarkdown() joins strings into a valid markdown deck", () => {
    const smNoStore = createSaveManager({
      sourceMarkdown: "# A\n---\n# B",
      unsavedMarkdown: new Map([[1, "## B edited"]]),
    });
    expect(smNoStore.getFullMarkdown()).toBe("# A\n\n---\n\n## B edited");

    const smStore = createSaveManager({
      getDeckStore: () => ({ getSlides: () => ["# A", "# B"] }),
      unsavedMarkdown: new Map([[0, "# A edited"]]),
    });
    expect(smStore.getFullMarkdown()).toBe("# A edited\n\n---\n\n# B");
  });
});

describe("DeckStore applyPatches emit option", () => {
  it("emits storeChange by default", () => {
    const store = new DeckStore();
    store.loadFromMarkdown("a\n---\nb");
    const onStore = vi.fn();
    store.onStoreChange(onStore);

    store.applyPatches([createEditPatch(1, "b", "updated")]);
    expect(onStore).toHaveBeenCalledTimes(1);
  });

  it("does not emit storeChange when emit is false", () => {
    const store = new DeckStore();
    store.loadFromMarkdown("a\n---\nb");
    const onStore = vi.fn();
    store.onStoreChange(onStore);

    store.applyPatches([createEditPatch(1, "b", "updated")], { emitStoreChange: false });
    expect(onStore).not.toHaveBeenCalled();
    expect(store.getSlides()).toEqual(["a", "updated"]);
  });
});

describe("EditController mirror removal", () => {
  describe("prepareStoreOperation", () => {
    it("does not broadcast a storeChange", () => {
      const deckStore = new DeckStore();
      deckStore.loadFromMarkdown("# A");
      const onStore = vi.fn();
      deckStore.onStoreChange(onStore);

      const fake = {
        deckStore,
        currentSlideIndex: 0,
        unsavedMarkdown: new Map(),
        hasUnsavedChanges: false,
        _captureCurrentEditorMarkdown: () => {},
        _reconcileUnsavedOverlays: EditController.prototype._reconcileUnsavedOverlays,
        _storeDiffersFromSource: () => false,
        saveManager: {
          getFullSlides: () => [{ index: 0, markdown: "# A edited" }],
          updateButton: vi.fn(),
        },
      };

      EditController.prototype.prepareStoreOperation.call(fake, false);
      expect(onStore).not.toHaveBeenCalled();
      expect(deckStore.getSlides()).toEqual(["# A edited"]);

      deckStore.loadFromMarkdown("# B");
      onStore.mockClear();
      fake.currentSlideIndex = 0;
      EditController.prototype.prepareStoreOperation.call(fake, true);
      expect(onStore).not.toHaveBeenCalled();
      expect(deckStore.getSlides()).toEqual(["# A edited"]);
    });
  });

  describe("loadSlideIntoEditor", () => {
    it("does not clear history on the same slide and deck", () => {
      const deck = { id: 1 };
      const setValue = vi.fn();
      const getValue = vi.fn(() => "# old");
      const fake = {
        isEditMode: true,
        currentSlideIndex: 0,
        deck,
        _lastEditorSlideIndex: 0,
        _lastEditorDeck: deck,
        deckStore: { getSlides: () => ["# A"] },
        unsavedMarkdown: new Map(),
        markdownEditor: {
          getValue,
          setValue,
          saveSlideState: vi.fn(),
          loadSlideState: vi.fn(),
          hasClearedCache: vi.fn(() => false),
          clearSlideStateCache: vi.fn(),
        },
        saveManager: { updateButton: vi.fn() },
        areaGuides: { refresh: vi.fn() },
      };

      EditController.prototype.loadSlideIntoEditor.call(fake);
      expect(setValue).toHaveBeenCalledWith("# A", { suppressOnChange: true });
      expect(fake._lastEditorSlideIndex).toBe(0);
      expect(fake._lastEditorDeck).toBe(fake.deck);
    });

    it("skips setValue when the markdown is unchanged", () => {
      const setValue = vi.fn();
      const getValue = vi.fn(() => "# A");
      const fake = {
        isEditMode: true,
        currentSlideIndex: 0,
        deck: { id: 1 },
        _lastEditorSlideIndex: 0,
        _lastEditorDeck: { id: 1 },
        deckStore: { getSlides: () => ["# A"] },
        unsavedMarkdown: new Map(),
        markdownEditor: {
          getValue,
          setValue,
          saveSlideState: vi.fn(),
          loadSlideState: vi.fn(),
          hasClearedCache: vi.fn(() => false),
          clearSlideStateCache: vi.fn(),
        },
        saveManager: { updateButton: vi.fn() },
        areaGuides: { refresh: vi.fn() },
      };

      EditController.prototype.loadSlideIntoEditor.call(fake);
      expect(setValue).not.toHaveBeenCalled();
    });
  });

  describe("_setSourceMarkdown", () => {
    let originalWindow;
    let originalLocalStorage;

    beforeEach(() => {
      originalWindow = globalThis.window;
      originalLocalStorage = globalThis.localStorage;
      globalThis.window = globalThis;
      delete globalThis.__WEBDECK_MARKDOWN__;
      globalThis.localStorage = {
        setItem: vi.fn(() => {
          throw new Error("QuotaExceededError");
        }),
        removeItem: vi.fn(),
      };
    });

    afterEach(() => {
      globalThis.window = originalWindow;
      globalThis.localStorage = originalLocalStorage;
      delete globalThis.__WEBDECK_MARKDOWN__;
    });

    it("removes the localStorage key before falling back to the global", () => {
      EditController.prototype._setSourceMarkdown("# markdown");
      expect(globalThis.localStorage.removeItem).toHaveBeenCalledWith("webdeck_local_file");
      expect(globalThis.__WEBDECK_MARKDOWN__).toBe("# markdown");
    });
  });
});
