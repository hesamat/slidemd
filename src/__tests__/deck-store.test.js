import { describe, expect, it, vi } from "vitest";
import { DeckStore } from "../data/store/deck-store.js";
import {
  createDeletePatch,
  createEditPatch,
  createInsertPatch,
} from "../data/store/slide-patch.js";

describe("DeckStore", () => {
  it("loads markdown with fence-aware slide splitting and resets history", () => {
    const store = new DeckStore();
    store.loadFromMarkdown("# A\n---\n# B\n```\n---\n```\n# C", 1);
    expect(store.getSlides()).toEqual(["# A", "# B\n```\n---\n```\n# C"]);
    expect(store.getActiveIndex()).toBe(1);
    expect(store.canUndo()).toBe(false);
  });

  it("applies edits and supports undo/redo", () => {
    const store = new DeckStore();
    store.loadFromMarkdown("a\n---\nb");
    expect(store.applyPatch(createEditPatch(1, "b", "updated"))).toBe(true);
    expect(store.getSlides()).toEqual(["a", "updated"]);
    expect(store.undo()).toBe(true);
    expect(store.getSlides()).toEqual(["a", "b"]);
    expect(store.redo()).toBe(true);
    expect(store.getSlides()).toEqual(["a", "updated"]);
  });

  it("applies insertions and deletions while preserving active index", () => {
    const store = new DeckStore();
    store.loadFromMarkdown("a\n---\nb\n---\nc", 1);
    store.applyPatch(createInsertPatch(1, "new"));
    expect(store.getSlides()).toEqual(["a", "new", "b", "c"]);
    expect(store.getActiveIndex()).toBe(2);
    store.applyPatch(createDeletePatch(0, "a"));
    expect(store.getSlides()).toEqual(["new", "b", "c"]);
    expect(store.getActiveIndex()).toBe(1);
    expect(store.undo()).toBe(true);
    expect(store.getSlides()).toEqual(["a", "new", "b", "c"]);
  });

  it("groups adjacent move patches and updates the active index atomically", () => {
    const store = new DeckStore();
    store.loadFromMarkdown("a\n---\nb\n---\nc", 1);
    expect(
      store.applyPatches([
        createDeletePatch(1, "b", "user", "move"),
        createInsertPatch(0, "b", "user", "move"),
      ]),
    ).toBe(true);
    expect(store.getSlides()).toEqual(["b", "a", "c"]);
    expect(store.getActiveIndex()).toBe(0);
    expect(store.undo()).toBe(true);
    expect(store.getSlides()).toEqual(["a", "b", "c"]);
    expect(store.getActiveIndex()).toBe(1);
  });

  it("rejects no-op and stale patches", () => {
    const store = new DeckStore();
    store.loadFromMarkdown("a");
    expect(store.applyPatch(createEditPatch(0, "a", "a"))).toBe(false);
    expect(store.applyPatch(createEditPatch(0, "wrong", "b"))).toBe(false);
    expect(store.canUndo()).toBe(false);
  });

  it("handles active indices, markdown export, and events", () => {
    const store = new DeckStore();
    const change = vi.fn();
    const slide = vi.fn();
    const patch = vi.fn();
    const off = store.on("change", change);
    store.on("slide", slide);
    store.on("patch", patch);
    store.loadFromMarkdown("a\n---\nb");
    store.setActiveIndex(1);
    store.applyPatch(createEditPatch(1, "b", "c"));
    expect(store.toMarkdown()).toBe("a\n\n---\n\nc");
    expect(change).toHaveBeenCalledTimes(2);
    expect(slide).toHaveBeenCalledTimes(2);
    expect(patch).toHaveBeenCalledWith(expect.objectContaining({ after: "c" }));
    off();
    store.loadFromMarkdown("only");
    expect(change).toHaveBeenCalledTimes(2);
  });
});
