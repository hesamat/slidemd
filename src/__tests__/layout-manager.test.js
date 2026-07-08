import { describe, it, expect, vi } from "vitest";

vi.mock("../renderer/notification.js", () => ({
  Notification: { success: vi.fn(), error: vi.fn() },
}));

import { LayoutManager } from "../editor/layout/layout-manager.js";

function makeEditor(initial) {
  let value = initial;
  return {
    getValue: () => value,
    setValue: (v) => {
      value = v;
    },
    focus: vi.fn(),
  };
}

describe("LayoutManager.applyToCurrentSlide", () => {
  it("inserts @media before @footer when switching to two-column", () => {
    const editor = makeEditor(
      "layout: header-content\n\n@header\n## Title\n\n@main\nContent\n\n@footer\nFooter text",
    );
    const lm = new LayoutManager({ getMarkdownEditor: () => editor });
    lm.applyToCurrentSlide("two-column");

    const result = editor.getValue();
    const headerIdx = result.indexOf("@header");
    const mainIdx = result.indexOf("@main");
    const mediaIdx = result.indexOf("@media");
    const footerIdx = result.indexOf("@footer");

    expect(mediaIdx).toBeGreaterThan(-1);
    expect(headerIdx).toBeLessThan(mainIdx);
    expect(mainIdx).toBeLessThan(mediaIdx);
    expect(mediaIdx).toBeLessThan(footerIdx);
  });

  it("appends the missing area at the end when no later area exists", () => {
    const editor = makeEditor("layout: main-only\n\n@main\nOnly content here");
    const lm = new LayoutManager({ getMarkdownEditor: () => editor });
    lm.applyToCurrentSlide("two-column");

    const result = editor.getValue();
    const mainIdx = result.indexOf("@main");
    const mediaIdx = result.indexOf("@media");

    expect(mediaIdx).toBeGreaterThan(mainIdx);
    expect(result.trim().endsWith("@media")).toBe(true);
  });

  it("inserts multiple missing areas in the correct relative order", () => {
    const editor = makeEditor(
      "layout: header-content\n\n@header\nTitle\n\n@main\nBody\n\n@footer\nFoot",
    );
    const lm = new LayoutManager({ getMarkdownEditor: () => editor });
    lm.applyToCurrentSlide("three-column");

    const result = editor.getValue();
    const mediaIdx = result.indexOf("@media");
    const secondaryIdx = result.indexOf("@secondary");
    const footerIdx = result.indexOf("@footer");

    expect(mediaIdx).toBeGreaterThan(-1);
    expect(secondaryIdx).toBeGreaterThan(-1);
    expect(mediaIdx).toBeLessThan(secondaryIdx);
    expect(secondaryIdx).toBeLessThan(footerIdx);
  });
});
