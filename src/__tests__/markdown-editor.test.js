import { describe, it, expect, vi, afterEach } from "vitest";
import { MarkdownEditor } from "../editor/core/markdown-editor.js";
import { MarkdownFormatContextMenu } from "../editor/core/markdown-format-context-menu.js";

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

  it("preserves longer marker runs when adding italic or inline code", () => {
    for (const [value, marker] of [
      ["**word**", "*"],
      ["``word``", "`"],
    ]) {
      const replaceRange = vi.fn();
      const menu = Object.create(MarkdownFormatContextMenu.prototype);
      Object.assign(menu, {
        _editor: { replaceRange },
        _value: value,
        _from: 2,
        _to: value.length - 2,
        _lineFrom: 0,
        _lineTo: value.length,
        _wordFrom: 2,
        _wordTo: value.length - 2,
      });

      menu._toggleWrap(marker, marker);

      expect(replaceRange).toHaveBeenCalledWith(2, value.length - 2, `${marker}word${marker}`);
    }
  });

  it("toggles bold and italic layers without losing the other style", () => {
    const cases = [
      ["*word*", "**", 2, 1, 1, 5, "**word**"],
      ["***word***", "*", 4, 3, 2, 8, "word"],
      ["***word***", "**", 4, 3, 1, 9, "word"],
    ];

    for (const [value, marker, cursor, wordFrom, expectedFrom, expectedTo, replacement] of cases) {
      const replaceRange = vi.fn();
      const menu = Object.create(MarkdownFormatContextMenu.prototype);
      Object.assign(menu, {
        _editor: { replaceRange },
        _value: value,
        _from: cursor,
        _to: cursor,
        _lineFrom: 0,
        _lineTo: value.length,
        _wordFrom: wordFrom,
        _wordTo: value.length - wordFrom,
      });

      menu._toggleWrap(marker, marker);

      expect(replaceRange).toHaveBeenCalledWith(expectedFrom, expectedTo, replacement);
    }
  });
});
