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

  it("replaceDeck swaps slides and is undoable without clearing history", () => {
    const store = new DeckStore();
    store.loadFromMarkdown("a\n---\nb");
    store.applyPatch(createEditPatch(0, "a", "edited"));
    expect(store.canUndo()).toBe(true);

    store.replaceDeck(["x", "y", "z"], 0, {
      index: 0,
      before: null,
      after: "x\n---\ny\n---\nz",
      source: "ai",
      timestamp: Date.now(),
    });
    expect(store.getSlides()).toEqual(["x", "y", "z"]);
    expect(store.getActiveIndex()).toBe(0);
    // History preserved — undo restores the pre-refine deck
    expect(store.canUndo()).toBe(true);
    expect(store.undo()).toBe(true);
    expect(store.getSlides()).toEqual(["edited", "b"]);
  });

  it("starts the structural revision at zero and increments for structural operations", () => {
    const store = new DeckStore();
    expect(store.getStructuralRevision()).toBe(0);

    store.loadFromMarkdown("a\n---\nb");
    expect(store.getStructuralRevision()).toBe(1);

    store.applyPatch(createEditPatch(0, "a", "edited"));
    expect(store.getStructuralRevision()).toBe(1);

    store.applyPatch(createInsertPatch(2, "c"));
    expect(store.getStructuralRevision()).toBe(2);

    store.applyPatch(createDeletePatch(1, "b"));
    expect(store.getStructuralRevision()).toBe(3);

    store.applyPatches([
      createDeletePatch(1, "c", "user", "move"),
      createInsertPatch(0, "c", "user", "move"),
    ]);
    expect(store.getStructuralRevision()).toBe(4);
  });

  it("notifies structural change listeners only on structural mutations", () => {
    const store = new DeckStore();
    const onStructural = vi.fn();
    const off = store.onStructuralChange(onStructural);

    store.loadFromMarkdown("a\n---\nb");
    expect(onStructural).toHaveBeenCalledWith(1);

    store.applyPatch(createEditPatch(0, "a", "edited"));
    expect(onStructural).toHaveBeenCalledTimes(1);

    store.applyPatch(createInsertPatch(2, "c"));
    expect(onStructural).toHaveBeenCalledWith(2);
    expect(onStructural).toHaveBeenCalledTimes(2);

    off();
    store.applyPatch(createDeletePatch(1, "b"));
    expect(onStructural).toHaveBeenCalledTimes(2);
  });

  it("notifies store change listeners with the latest slides array on every mutation", () => {
    const store = new DeckStore();
    const onStore = vi.fn();
    const off = store.onStoreChange(onStore);

    store.loadFromMarkdown("a\n---\nb");
    expect(onStore).not.toHaveBeenCalled();

    store.applyPatch(createEditPatch(1, "b", "updated"));
    expect(onStore).toHaveBeenLastCalledWith(["a", "updated"]);

    store.applyPatch(createInsertPatch(2, "c"));
    expect(onStore).toHaveBeenLastCalledWith(["a", "updated", "c"]);

    store.undo();
    expect(onStore).toHaveBeenLastCalledWith(["a", "updated"]);

    off();
    store.applyPatch(createEditPatch(0, "a", "again"));
    expect(onStore).toHaveBeenCalledTimes(3);
  });

  it("applyPatch is fail-closed when an expected structural revision is provided", () => {
    const store = new DeckStore();
    store.loadFromMarkdown("a\n---\nb");
    const baseline = store.getStructuralRevision();

    // Successful application returns a result object
    const ok = store.applyPatch(createEditPatch(1, "b", "updated"), baseline);
    expect(ok).toEqual({ success: true });
    expect(store.getSlides()).toEqual(["a", "updated"]);

    // Stale index should fail without mutating
    const stale = store.applyPatch(createEditPatch(1, "b", "stale"), store.getStructuralRevision());
    expect(stale).toEqual(
      expect.objectContaining({
        success: false,
        reason: expect.stringContaining("out of range or before mismatch"),
      }),
    );
    expect(store.getSlides()).toEqual(["a", "updated"]);

    // Structural change bumps the revision, invalidating the old token
    store.applyPatch(createInsertPatch(2, "c"));
    const current = store.getStructuralRevision();
    expect(current).toBe(baseline + 1);

    // Mismatched structural revision should fail before touching state
    const conflict = store.applyPatch(createEditPatch(1, "updated", "again"), baseline);
    expect(conflict).toEqual(
      expect.objectContaining({
        success: false,
        reason: expect.stringContaining("Structural revision mismatch"),
      }),
    );
    expect(store.getSlides()).toEqual(["a", "updated", "c"]);

    // Using the current revision succeeds
    const now = store.applyPatch(createEditPatch(1, "updated", "again"), current);
    expect(now).toEqual({ success: true });
    expect(store.getSlides()).toEqual(["a", "again", "c"]);
  });

  it("applyPatches rejects the whole transaction when the expected structural revision is stale", () => {
    const store = new DeckStore();
    store.loadFromMarkdown("a\n---\nb\n---\nc");
    const baseline = store.getStructuralRevision();
    store.applyPatch(createDeletePatch(1, "b"));

    const result = store.applyPatches(
      [createDeletePatch(1, "c", "user", "move"), createInsertPatch(0, "c", "user", "move")],
      baseline,
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        reason: expect.stringContaining("Structural revision mismatch"),
      }),
    );
    expect(store.getSlides()).toEqual(["a", "c"]);
  });

  it("strips a visual system comment from the top of markdown", () => {
    const store = new DeckStore();
    const comment =
      '<!-- visual-system: {"visualDirection":"Dark, technical. Use #0f172a for base, #06b6d4 for accent, #ffffff for highlight."} -->';
    store.loadFromMarkdown(`${comment}\n\n# A\n\n---\n\n# B`);
    expect(store.getSlides()).toEqual(["# A", "# B"]);
    expect(store.toMarkdown()).not.toContain("visual-system");
  });
});
