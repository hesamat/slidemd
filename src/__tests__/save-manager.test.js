import { describe, it, expect } from "vitest";
import { SaveManager } from "../editor/ui/save-manager.js";

function createSaveManager() {
  return new SaveManager({
    getDeck: () => ({ slides: [] }),
    getUnsavedMarkdown: () => new Map(),
    getOriginalMarkdown: () => [],
    setOriginalMarkdown: () => {},
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
