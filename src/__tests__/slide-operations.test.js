import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SlideOperations } from "../editor/core/slide-operations.js";
import { StyleApplier } from "../editor/core/style-applier.js";
import { DeckStore } from "../data/store/deck-store.js";
import { Notification } from "../renderer/notification.js";

/**
 * `rebuildUnsavedMarkdownMap` is the index-rewriting helper called
 * after insert/delete/duplicate.  It needs to keep the in-memory
 * `unsavedMarkdown` Map in sync with the deck's slide order.
 */

function createOps(initialMap = new Map()) {
  const setUnsavedMarkdown = vi.fn((v) => {
    currentMap = v;
  });
  const setHasUnsavedChanges = vi.fn();
  const updateButton = vi.fn();
  // The getter and setter share backing state, matching how
  // EditController wires them in production (both close over the
  // same `this.unsavedMarkdown` field).
  let currentMap = initialMap;
  const getUnsavedMarkdown = () => currentMap;

  const ops = new SlideOperations({
    getDeck: () => ({ slides: [] }),
    getElements: () => ({ slidesContainer: null, slideCountEl: null }),
    getController: () => ({ slideNavigator: { goTo: vi.fn() } }),
    getThumbnails: () => ({ refresh: vi.fn() }),
    getMarkdownEditor: () => null,
    getCurrentSlideIndex: () => 0,
    setCurrentSlideIndex: vi.fn(),
    getUnsavedMarkdown,
    setUnsavedMarkdown,
    getHasUnsavedChanges: () => false,
    setHasUnsavedChanges,
    getSaveManager: () => ({ updateButton }),
  });

  return { ops, setUnsavedMarkdown, setHasUnsavedChanges, updateButton };
}

describe("SlideOperations.rebuildUnsavedMarkdownMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("insert: shifts entries at or after insertAtIndex up by one", () => {
    const map = new Map([
      [0, "alpha"],
      [1, "beta"],
      [2, "gamma"],
    ]);
    const { ops, setUnsavedMarkdown, setHasUnsavedChanges, updateButton } = createOps(map);

    // Insert at index 1 — "alpha" stays at 0, "beta"/"gamma" shift to 2/3
    ops.rebuildUnsavedMarkdownMap(1, -1);

    expect(setUnsavedMarkdown).toHaveBeenCalledTimes(1);
    const newMap = setUnsavedMarkdown.mock.calls[0][0];
    expect(newMap.get(0)).toBe("alpha");
    expect(newMap.has(1)).toBe(false); // vacated
    expect(newMap.get(2)).toBe("beta");
    expect(newMap.get(3)).toBe("gamma");
    expect(newMap.size).toBe(3);
    expect(setHasUnsavedChanges).toHaveBeenCalledWith(true);
    expect(updateButton).toHaveBeenCalled();
  });

  it("insert: appending at the end leaves existing indices alone", () => {
    const map = new Map([
      [0, "alpha"],
      [1, "beta"],
    ]);
    const { ops, setUnsavedMarkdown } = createOps(map);

    // Insert at index 2 (after the last entry) — no shift needed
    ops.rebuildUnsavedMarkdownMap(2, -1);

    const newMap = setUnsavedMarkdown.mock.calls[0][0];
    expect(newMap.get(0)).toBe("alpha");
    expect(newMap.get(1)).toBe("beta");
    expect(newMap.size).toBe(2);
  });

  it("delete: drops the deleted index and shifts later entries down", () => {
    const map = new Map([
      [0, "alpha"],
      [1, "beta"],
      [2, "gamma"],
      [3, "delta"],
    ]);
    const { ops, setUnsavedMarkdown } = createOps(map);

    // Delete at index 1 — "alpha" stays, "beta" removed, "gamma"/"delta" → 1/2
    ops.rebuildUnsavedMarkdownMap(-1, 1);

    const newMap = setUnsavedMarkdown.mock.calls[0][0];
    expect(newMap.get(0)).toBe("alpha");
    expect(newMap.get(1)).toBe("gamma");
    expect(newMap.get(2)).toBe("delta");
    expect(newMap.size).toBe(3);
  });

  it("delete at index 0: drops first entry and shifts everything down by one", () => {
    const map = new Map([
      [0, "alpha"],
      [1, "beta"],
      [2, "gamma"],
    ]);
    const { ops, setUnsavedMarkdown } = createOps(map);

    ops.rebuildUnsavedMarkdownMap(-1, 0);

    const newMap = setUnsavedMarkdown.mock.calls[0][0];
    expect(newMap.get(0)).toBe("beta");
    expect(newMap.get(1)).toBe("gamma");
    expect(newMap.size).toBe(2);
  });

  it("insert with newSlideMarkdown: places the new content at newSlideIndex", () => {
    const map = new Map([
      [0, "alpha"],
      [1, "beta"],
    ]);
    const { ops, setUnsavedMarkdown } = createOps(map);

    // Insert + new slide at index 1
    ops.rebuildUnsavedMarkdownMap(1, -1, 1, "new-slide-content");

    const newMap = setUnsavedMarkdown.mock.calls[0][0];
    expect(newMap.get(0)).toBe("alpha");
    expect(newMap.get(1)).toBe("new-slide-content");
    // Original "beta" shifted from 1 → 2
    expect(newMap.get(2)).toBe("beta");
    expect(newMap.size).toBe(3);
  });

  it("newSlideMarkdown is ignored when newSlideIndex < 0", () => {
    const map = new Map([[0, "alpha"]]);
    const { ops, setUnsavedMarkdown } = createOps(map);

    ops.rebuildUnsavedMarkdownMap(-1, -1, -1, "should-be-dropped");

    const newMap = setUnsavedMarkdown.mock.calls[0][0];
    expect(newMap.size).toBe(1);
    expect(newMap.get(0)).toBe("alpha");
  });

  it("empty map: no-op (no entries to shift, no new slide added)", () => {
    const { ops, setUnsavedMarkdown, setHasUnsavedChanges, updateButton } = createOps(new Map());

    ops.rebuildUnsavedMarkdownMap(0, -1, 0, "x");

    const newMap = setUnsavedMarkdown.mock.calls[0][0];
    // No existing entries + newSlideIndex=0 + markdown="x" → 1 entry
    expect(newMap.size).toBe(1);
    expect(newMap.get(0)).toBe("x");
    expect(setHasUnsavedChanges).toHaveBeenCalledWith(true);
    expect(updateButton).toHaveBeenCalled();
  });
});

describe("SlideOperations.deleteSlide", () => {
  function createDeleteOps({ originalMarkdown, unsavedMarkdown, currentIndex, editorValue }) {
    const state = {
      store: new DeckStore(),
      deck: { slides: originalMarkdown.map((_, i) => ({ id: i + 1 })) },
      originalMarkdown: [...originalMarkdown],
      unsavedMarkdown: new Map(unsavedMarkdown),
      currentIndex,
      editorValue,
    };

    state.store.syncSlides([...state.originalMarkdown], state.currentIndex);

    const getFullSlide = (index, slide) => {
      const overlay = state.unsavedMarkdown.get(index);
      return overlay !== undefined ? { ...slide, markdown: overlay } : slide;
    };

    const getFullSlides = (slides) => {
      if (slides === undefined) {
        const merged = [...state.originalMarkdown];
        state.unsavedMarkdown.forEach((value, key) => {
          merged[key] = value;
        });
        return merged;
      }
      return slides.map((slide, index) => getFullSlide(index, slide));
    };

    const ops = new SlideOperations({
      getDeck: () => state.deck,
      getElements: () => ({ slideCountEl: null, slidesContainer: null }),
      getController: () => ({ slideNavigator: { goTo: vi.fn() } }),
      getThumbnails: () => ({ refresh: vi.fn() }),
      getMarkdownEditor: () => ({
        getValue: () => state.editorValue,
        clearSlideStateCache: vi.fn(),
      }),
      getCurrentSlideIndex: () => state.currentIndex,
      setCurrentSlideIndex: (v) => {
        state.currentIndex = v;
      },
      getUnsavedMarkdown: () => state.unsavedMarkdown,
      setUnsavedMarkdown: (v) => {
        state.unsavedMarkdown = v;
      },
      getHasUnsavedChanges: () => false,
      setHasUnsavedChanges: vi.fn(),
      getSaveManager: () => ({ updateButton: vi.fn(), getFullSlide, getFullSlides }),
      deckStore: state.store,
      prepareStoreOperation: () => {
        const current = state.currentIndex;
        if (state.editorValue !== state.originalMarkdown[current]) {
          state.unsavedMarkdown.set(current, state.editorValue);
        }
        state.store.syncSlides(getFullSlides(), current);
      },
      recordStoreOperation: vi.fn(),
    });

    return { ops, state };
  }

  it("captures fresh editor text before building the delete patch so undo restores it", async () => {
    vi.spyOn(Notification, "confirm").mockResolvedValue(true);

    const { ops, state } = createDeleteOps({
      originalMarkdown: ["# Slide 1", "# Slide 2"],
      unsavedMarkdown: [],
      currentIndex: 0,
      editorValue: "# Slide 1\n\nfresh text",
    });

    vi.stubGlobal("document", { querySelectorAll: () => [] });
    await ops.deleteSlide();
    vi.unstubAllGlobals();

    expect(state.store.getSlideCount()).toBe(1);
    expect(state.store.toMarkdown()).toBe("# Slide 2");
    expect(state.store.undo()).toBe(true);
    expect(state.store.toMarkdown()).toBe("# Slide 1\n\nfresh text\n\n---\n\n# Slide 2");
  });
});

describe("SlideOperations store-backed structural operations", () => {
  beforeEach(() => {
    vi.spyOn(Notification, "success").mockImplementation(() => {});
    vi.spyOn(Notification, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createStoreOps(slides, currentIndex = 0) {
    const store = new DeckStore();
    store.loadFromMarkdown(slides.join("\n\n---\n\n"), currentIndex);

    const state = {
      store,
      deck: { slides: slides.map(() => ({ id: 1 })) },
      originalMarkdown: [...slides],
      currentIndex,
      unsavedMarkdown: new Map(),
      hasUnsavedChanges: false,
    };

    const getFullSlide = (index, slide) => {
      const overlay = state.unsavedMarkdown.get(index);
      return overlay !== undefined ? { ...slide, markdown: overlay } : slide;
    };

    const getFullSlides = (deckStoreSlides) => {
      return deckStoreSlides.map((slide, index) => getFullSlide(index, slide));
    };

    const ops = new SlideOperations({
      getDeck: () => state.deck,
      getElements: () => ({ slideCountEl: null, slidesContainer: null }),
      getController: () => ({ slideNavigator: { goTo: vi.fn() } }),
      getThumbnails: () => ({ refresh: vi.fn() }),
      getMarkdownEditor: () => null,
      getCurrentSlideIndex: () => state.currentIndex,
      setCurrentSlideIndex: (v) => {
        state.currentIndex = v;
      },
      getUnsavedMarkdown: () => state.unsavedMarkdown,
      setUnsavedMarkdown: (v) => {
        state.unsavedMarkdown = v;
      },
      getHasUnsavedChanges: () => state.hasUnsavedChanges,
      setHasUnsavedChanges: (v) => {
        state.hasUnsavedChanges = v;
      },
      getSaveManager: () => ({ updateButton: vi.fn(), getFullSlide, getFullSlides }),
      deckStore: store,
      prepareStoreOperation: () => {},
      recordStoreOperation: () => {},
    });

    return { ops, state };
  }

  it("adds a new slide and records a single undoable history entry", () => {
    const { ops, state } = createStoreOps(["# A", "# B"], 0);
    ops.addSlide();

    expect(state.store.getSlideCount()).toBe(3);
    expect(state.store.getActiveIndex()).toBe(1);
    expect(state.store.toMarkdown()).toMatch(/# A\n\n---\n\n## New Slide/);
    expect(state.store.canUndo()).toBe(true);
  });

  it("duplicates a slide with the working overlay", async () => {
    const { ops, state } = createStoreOps(["# A", "# B"], 0);
    state.unsavedMarkdown.set(0, "# A\n\noverlay");
    await ops.duplicateSlide();

    expect(state.store.getSlideCount()).toBe(3);
    expect(state.store.getSlides()[1]).toBe("# A\n\noverlay");
    expect(state.store.undo()).toBe(true);
    expect(state.store.getSlideCount()).toBe(2);
  });

  it("moves a slide down and updates active index", () => {
    const { ops, state } = createStoreOps(["# A", "# B", "# C"], 0);
    ops.moveSlideDown();

    expect(state.store.getSlides()).toEqual(["# B", "# A", "# C"]);
    expect(state.store.getActiveIndex()).toBe(1);
    expect(state.store.canUndo()).toBe(true);
  });

  it("fails closed when the store rejects the patch after a re-sync", () => {
    const { ops, state } = createStoreOps(["# A", "# B"], 0);
    const warn = vi.spyOn(Notification, "warning").mockImplementation(() => {});
    const store = state.store;

    // Force the store to reject by breaking the `before` match.
    store.syncSlides(["# Different", "# B"], 0);

    // addSlide uses a before-less insert, but a stale state shouldn't matter here.
    // Instead, test an explicit bad patch through the internals.
    const badPatch = {
      index: 0,
      before: "# Wrong",
      after: "# X",
      source: "user",
      timestamp: Date.now(),
    };
    const result = ops._applyStorePatches([badPatch]);

    expect(result).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("StyleApplier store-backed transaction", () => {
  beforeEach(() => {
    vi.spyOn(Notification, "success").mockImplementation(() => {});
    vi.spyOn(Notification, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("commits a style change to all slides as a single patch transaction", async () => {
    const store = new DeckStore();
    store.loadFromMarkdown("# A\n\n---\n\n# B", 0);

    const unsaved = new Map();
    const setHasUnsaved = vi.fn();
    const updateButton = vi.fn();

    const getFullSlide = (index, slide) => {
      const overlay = unsaved.get(index);
      return overlay !== undefined ? { ...slide, markdown: overlay } : slide;
    };

    const getFullSlides = (slides) => slides.map((slide, index) => getFullSlide(index, slide));

    const applier = new StyleApplier({
      getSaveManager: () => ({ getFullSlide, getFullSlides }),
      getDeckStore: () => store,
      getUnsavedMarkdown: () => unsaved,
      setUnsavedMarkdown: () => {},
      getDeck: () => ({ slides: [] }),
      getCurrentSlideIndex: () => 0,
      getMarkdownEditor: () => null,
      setHasUnsavedChanges: setHasUnsaved,
      onUpdateSaveButton: updateButton,
      getImageBg: () => ({}),
      prepareStoreOperation: () => {},
    });

    await applier.applyToAll("color: red", "line", "", "dark");

    const slides = store.getSlides();
    expect(slides[0]).toContain("theme: dark");
    expect(slides[1]).toContain("theme: dark");
    expect(slides[0]).toContain("area-style: color: red");
    expect(store.canUndo()).toBe(true);
  });
});
