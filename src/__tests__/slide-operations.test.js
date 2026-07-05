import { describe, it, expect, vi, beforeEach } from "vitest";
import { SlideOperations } from "../editor/core/slide-operations.js";

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
    getOriginalMarkdown: () => [],
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
