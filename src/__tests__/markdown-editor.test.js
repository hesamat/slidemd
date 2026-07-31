import { describe, it, expect, vi, afterEach } from "vitest";
import { MarkdownEditor } from "../editor/core/markdown-editor.js";

describe("MarkdownEditor suppression reset", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resets suppressChange when setValue throws", () => {
    const editor = {
      value: "",
      view: {
        setState() {
          throw new Error("setState failed");
        },
      },
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
        setState() {
          throw new Error("setState failed");
        },
        dispatch() {},
        focus() {},
      },
      suppressChange: false,
    };

    expect(() =>
      MarkdownEditor.prototype.setValueWithCursor.call(editor, "next", 1, {
        suppressOnChange: true,
      }),
    ).toThrow("setState failed");
    expect(editor.suppressChange).toBe(false);
  });

  it("calls onChange when setValue is not suppressed", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const editor = {
      value: "",
      view: {
        setState() {},
      },
      suppressChange: false,
      debounceTimer: null,
      options: { onChange, debounceDelay: 50 },
      scheduleOnChange: MarkdownEditor.prototype.scheduleOnChange,
    };

    MarkdownEditor.prototype.setValue.call(editor, "updated markdown", { suppressOnChange: false });
    vi.advanceTimersByTime(50);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("updated markdown");
  });
});
