import { describe, it, expect, vi } from "vitest";
import { GridResizerManager } from "../editor/layout/grid-resizer-manager.js";

const MEDIA_SPAN_RIGHT_GRID = {
  gridTemplateAreas: '"header media" "main media" "footer media"',
  gridTemplateColumns: "1.2fr 0.8fr",
  gridTemplateRows: "0.1fr 1fr 0.1fr",
};

function createManager(editor) {
  return new GridResizerManager({
    getMarkdownEditor: () => editor,
    adjustColumnsMenuItem: null,
    deckStage: null,
    getCurrentSlideIndex: () => 0,
    getSlideElementByIndex: () => null,
  });
}

describe("GridResizerManager media-span intent", () => {
  it("does not add media-span intent when resizing a named media-span preset without one", () => {
    const editor = {
      getValue: () => "layout: media-span-right\n\n@media\nImage",
      setValue: vi.fn(),
    };
    const manager = createManager(editor);

    manager._onGridResize(
      { cols: "1fr 1fr", rows: null },
      MEDIA_SPAN_RIGHT_GRID,
      "media-span-right",
    );

    const [md] = editor.setValue.mock.calls[0];
    expect(md).toContain("layout: ");
    expect(md).not.toContain("media-span:");
  });

  it("preserves media-span intent across consecutive resizes of the custom grid", () => {
    const customSpec = '"header media" "main media" "footer media" / 1fr 1fr';
    const editor = {
      getValue: () => `layout: ${customSpec}\nmedia-span: right\n\n@media\nImage`,
      setValue: vi.fn(),
    };
    const manager = createManager(editor);

    manager._onGridResize({ cols: "0.8fr 1.2fr", rows: null }, MEDIA_SPAN_RIGHT_GRID, customSpec);

    const [md] = editor.setValue.mock.calls[0];
    expect(md).toContain("media-span: right");
  });

  it("does not write media-span intent for non-media layouts", () => {
    const editor = {
      getValue: () => "layout: two-column\n\n@main\nContent\n\n@media\nImage",
      setValue: vi.fn(),
    };
    const manager = createManager(editor);

    manager._onGridResize(
      { cols: "1fr 1fr", rows: null },
      { gridTemplateAreas: '"header header" "main media"', gridTemplateColumns: "1fr 1fr" },
      "two-column",
    );

    const [md] = editor.setValue.mock.calls[0];
    expect(md).not.toContain("media-span:");
  });
});
