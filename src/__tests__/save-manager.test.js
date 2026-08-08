import { describe, it, expect, vi } from "vitest";
import { SaveManager, removeStaleImages } from "../editor/ui/save-manager.js";

function makeImageDir(entries) {
  const removed = [];
  return {
    removed,
    handle: {
      entries: async function* () {
        for (const entry of entries) yield entry;
      },
      removeEntry: vi.fn(async (name) => {
        removed.push(name);
      }),
    },
  };
}

describe("removeStaleImages", () => {
  it("removes only the old deck's images that the new deck no longer uses", async () => {
    const { handle, removed } = makeImageDir([
      ["a.png", { kind: "file" }],
      ["b.png", { kind: "file" }],
      ["c.jpg", { kind: "file" }],
    ]);
    const oldImageNames = new Set(["a.png", "b.png", "c.jpg"]);

    await removeStaleImages(handle, ["images/b.png"], oldImageNames);

    expect(removed).toEqual(["a.png", "c.jpg"]);
  });

  it("never removes images the old deck did not reference (other decks' files)", async () => {
    const { handle, removed } = makeImageDir([
      ["a.png", { kind: "file" }],
      ["other-deck.png", { kind: "file" }],
    ]);

    await removeStaleImages(handle, ["images/a.png"], new Set(["a.png"]));

    expect(removed).toEqual([]);
  });

  it("ignores non-image files and directories", async () => {
    const { handle, removed } = makeImageDir([
      ["notes.txt", { kind: "file" }],
      ["sub", { kind: "directory" }],
      ["old.png", { kind: "file" }],
    ]);

    await removeStaleImages(handle, ["images/new.png"], new Set(["old.png", "notes.txt"]));

    expect(removed).toEqual(["old.png"]);
  });
});

function createSaveManager() {
  return new SaveManager({
    getDeck: () => ({ slides: [] }),
    getDeckStore: () => null,
    getUnsavedMarkdown: () => new Map(),
    getHasUnsavedChanges: () => false,
    setHasUnsavedChanges: () => {},
  });
}

describe("SaveManager working-state overlay", () => {
  it("stores, checks, and clears an overlay", () => {
    const sm = createSaveManager();
    expect(sm.hasUnsavedOverlay(0)).toBe(false);

    sm.setUnsavedEditorOverlay(0, "# Overlay");
    expect(sm.hasUnsavedOverlay(0)).toBe(true);

    sm.clearUnsavedEditorOverlay(0);
    expect(sm.hasUnsavedOverlay(0)).toBe(false);
  });

  it("getFullSlide returns the stored slide when no overlay is present", () => {
    const sm = createSaveManager();
    const slide = { index: 0, markdown: "# Stored", areas: { main: "<p>Stored</p>" } };
    expect(sm.getFullSlide(0, slide)).toBe(slide);
  });

  it("getFullSlide replaces markdown and keeps the same slide shape", () => {
    const sm = createSaveManager();
    const slide = { index: 0, markdown: "# Stored", areas: { main: "<p>Stored</p>" } };
    sm.setUnsavedEditorOverlay(0, "# Overlay");

    const full = sm.getFullSlide(0, slide);
    expect(full).not.toBe(slide);
    expect(full.index).toBe(0);
    expect(full.markdown).toBe("# Overlay");
    expect(full.areas).toEqual({ main: "<p>Stored</p>" });
  });

  it("getFullSlides maps overlays across the deck", () => {
    const sm = createSaveManager();
    sm.setUnsavedEditorOverlay(1, "## B edited");
    const slides = [
      { index: 0, markdown: "# A", areas: {} },
      { index: 1, markdown: "# B", areas: {} },
    ];

    const full = sm.getFullSlides(slides);
    expect(full[0].markdown).toBe("# A");
    expect(full[1].markdown).toBe("## B edited");
  });

  it("getFullMarkdown joins overlay markdown with slide separators", () => {
    const sm = createSaveManager();
    sm.setUnsavedEditorOverlay(1, "## B edited");
    const slides = [
      { index: 0, markdown: "# A", areas: {} },
      { index: 1, markdown: "# B", areas: {} },
    ];

    expect(sm.getFullMarkdown(slides)).toBe("# A\n\n---\n\n## B edited");
  });
});
