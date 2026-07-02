import { describe, it, expect } from "vitest";
import { MarkdownEditor } from "../editor/core/markdown-editor.js";

describe("MarkdownEditor suppression reset", () => {
  it("resets suppressChange when setValue throws", () => {
    const editor = {
      value: "",
      view: {
        scrollDOM: { scrollTop: 0 },
        setState() {
          throw new Error("setState failed");
        },
      },
      extensions: [],
      suppressChange: false,
    };

    expect(() =>
      MarkdownEditor.prototype.setValue.call(editor, "next", { suppressOnChange: true }),
    ).toThrow("setState failed");
    expect(editor.suppressChange).toBe(false);
  });

  it("resets suppressChange when setValueWithCursor throws", () => {
    const editor = {
      value: "",
      view: {
        state: { doc: { length: 0 } },
        dispatch() {
          throw new Error("dispatch failed");
        },
        focus() {},
      },
      suppressChange: false,
    };

    expect(() =>
      MarkdownEditor.prototype.setValueWithCursor.call(editor, "next", 1, {
        suppressOnChange: true,
      }),
    ).toThrow("dispatch failed");
    expect(editor.suppressChange).toBe(false);
  });
});
