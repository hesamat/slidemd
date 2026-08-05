import { describe, expect, it } from "vitest";
import { DeckHistory } from "../data/store/deck-history.js";

const patch = { index: 0, before: "a", after: "b", source: "user", timestamp: 1 };

describe("DeckHistory", () => {
  it("pushes undo entries and clears redo", () => {
    const history = new DeckHistory();
    history.push(["a"], 0, patch);
    expect(history.canUndo()).toBe(true);
    expect(history.popUndo(["b"], 0)?.slides).toEqual(["a"]);
    expect(history.canRedo()).toBe(true);
    history.push(["a"], 0, patch);
    expect(history.canRedo()).toBe(false);
  });

  it("moves snapshots between undo and redo", () => {
    const history = new DeckHistory();
    history.push(["a"], 0, patch);
    const undo = history.popUndo(["b"], 0);
    expect(undo?.slides).toEqual(["a"]);
    const redo = history.popRedo(["a"], 0);
    expect(redo?.slides).toEqual(["b"]);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it("clears redo history even when maxEntries is zero", () => {
    const history = new DeckHistory({ maxEntries: 0 });
    history.push(["a"], 0, patch);
    expect(history.canUndo()).toBe(false);
    history.popUndo(["b"], 0);
    history.push(["b"], 0, patch);
    expect(history.canRedo()).toBe(false);
  });

  it("bounds the undo stack and clears both stacks", () => {
    const history = new DeckHistory({ maxEntries: 2 });
    history.push(["1"], 0, patch);
    history.push(["2"], 0, patch);
    history.push(["3"], 0, patch);
    expect(history.popUndo(["4"], 0)?.slides).toEqual(["3"]);
    expect(history.popUndo(["3"], 0)?.slides).toEqual(["2"]);
    expect(history.popUndo(["2"], 0)).toBeNull();
    history.clear();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });
});
