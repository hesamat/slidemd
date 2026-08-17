import { describe, expect, it } from "vitest";
import {
  extractStyleDirectives,
  lintCssString,
  lintSlideStyles,
} from "../editor/core/style-lint.js";

describe("extractStyleDirectives", () => {
  it("extracts area-style, background, and area-bg-* directives", () => {
    const md = [
      "layout: focus",
      "area-style: border: 2px solid #94a3b8; border-radius: 10px",
      "background: #1a1a2e",
      "area-bg-main: rgba(255, 0, 0, 0.1)",
      "",
      "@main",
      "Hello",
    ].join("\n");
    const result = extractStyleDirectives(md);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      directive: "area-style",
      value: "border: 2px solid #94a3b8; border-radius: 10px",
    });
    expect(result[1]).toEqual({ directive: "background", value: "#1a1a2e" });
    expect(result[2]).toEqual({ directive: "area-bg-main", value: "rgba(255, 0, 0, 0.1)" });
  });

  it("returns empty for markdown with no style directives", () => {
    expect(extractStyleDirectives("# Hello\n\nWorld")).toEqual([]);
  });

  it("returns empty for null/undefined input", () => {
    expect(extractStyleDirectives(null)).toEqual([]);
    expect(extractStyleDirectives(undefined)).toEqual([]);
  });

  it("does not match @area markers or content lines", () => {
    const md = "@main\narea-style is not a directive\nbackground color is blue";
    expect(extractStyleDirectives(md)).toEqual([]);
  });

  it("is case-insensitive", () => {
    const md = "Area-Style: border-radius: 10px\nBACKGROUND: #1a1a2e\nArea-Bg-Main: #1e293b";
    const result = extractStyleDirectives(md);
    expect(result).toHaveLength(3);
    expect(result[0].directive).toBe("Area-Style");
    expect(result[0].value).toBe("border-radius: 10px");
  });

  it("skips directives inside code fences", () => {
    const md = [
      "area-style: border-radius: 10px",
      "```",
      "area-style: border-radius: 14px",
      "```",
      "area-bg-main: #1e293b",
    ].join("\n");
    const result = extractStyleDirectives(md);
    expect(result).toHaveLength(2);
    expect(result[0].directive).toBe("area-style");
    expect(result[1].directive).toBe("area-bg-main");
  });

  it("handles CRLF line endings", () => {
    const md = "area-style: border-radius: 10px\r\n\r\n@main\nHello";
    const result = extractStyleDirectives(md);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ directive: "area-style", value: "border-radius: 10px" });
  });
});

describe("lintCssString", () => {
  it("flags hardcoded border-radius matching a token", () => {
    const msgs = lintCssString("border-radius: 10px");
    expect(msgs).toContain("border-radius: 10px → use --radius-md");
  });

  it("flags hardcoded padding matching a token", () => {
    const msgs = lintCssString("padding: 16px");
    expect(msgs).toContain("padding: 16px → use --spacing-md");
  });

  it("flags hardcoded border color matching --border-color", () => {
    const msgs = lintCssString("border: 2px solid #94a3b8");
    expect(msgs.some((m) => m.includes("var(--border-color)"))).toBe(true);
  });

  it("does not flag non-token values", () => {
    expect(lintCssString("border-radius: 7px")).toEqual([]);
    expect(lintCssString("padding: 15px")).toEqual([]);
    expect(lintCssString("border: 2px solid #ff0000")).toEqual([]);
  });

  it("does not flag values already using var()", () => {
    expect(lintCssString("border-radius: var(--radius-md)")).toEqual([]);
    expect(lintCssString("padding: var(--spacing-lg)")).toEqual([]);
    expect(lintCssString("border: 2px solid var(--border-color)")).toEqual([]);
  });

  it("handles multiple declarations", () => {
    const msgs = lintCssString("border: 2px solid #94a3b8; border-radius: 10px; padding: 16px");
    expect(msgs).toHaveLength(3);
  });

  it("returns empty for null/empty input", () => {
    expect(lintCssString("")).toEqual([]);
    expect(lintCssString(null)).toEqual([]);
  });

  it("flags all three radius tokens", () => {
    expect(lintCssString("border-radius: 6px")).toContain("border-radius: 6px → use --radius-sm");
    expect(lintCssString("border-radius: 14px")).toContain("border-radius: 14px → use --radius-lg");
  });

  it("flags all five spacing tokens", () => {
    expect(lintCssString("padding: 6px")).toContain("padding: 6px → use --spacing-xs");
    expect(lintCssString("padding: 10px")).toContain("padding: 10px → use --spacing-sm");
    expect(lintCssString("padding: 24px")).toContain("padding: 24px → use --spacing-lg");
    expect(lintCssString("padding: 32px")).toContain("padding: 32px → use --spacing-xl");
  });

  it("flags rgba border color with spaces", () => {
    const msgs = lintCssString("border: 1px solid rgba(148, 163, 184, 0.2)");
    expect(msgs.some((m) => m.includes("var(--border-color)"))).toBe(true);
  });

  it("flags border-color longhand", () => {
    const msgs = lintCssString("border-color: #94a3b8");
    expect(msgs.some((m) => m.includes("var(--border-color)"))).toBe(true);
  });

  it("flags border-top shorthand", () => {
    const msgs = lintCssString("border-top: 1px solid rgba(148, 163, 184, 0.2)");
    expect(msgs.some((m) => m.includes("var(--border-color)"))).toBe(true);
  });
});

describe("lintSlideStyles", () => {
  it("returns advisory messages for off-token values in area-style", () => {
    const md = "area-style: border: 2px solid #94a3b8; border-radius: 10px\n\n@main\nHello";
    const msgs = lintSlideStyles(md);
    expect(msgs.length).toBeGreaterThanOrEqual(2);
    expect(msgs.some((m) => m.startsWith("area-style:"))).toBe(true);
  });

  it("returns empty when all values use tokens", () => {
    const md =
      "area-style: border: 2px solid var(--border-color); border-radius: var(--radius-md)\n\n@main\nHello";
    expect(lintSlideStyles(md)).toEqual([]);
  });

  it("returns empty for markdown with no style directives", () => {
    expect(lintSlideStyles("# Hello\n\nWorld")).toEqual([]);
  });

  it("checks area-bg directives too", () => {
    const md = "area-bg-main: border-radius: 10px\n\n@main\nHello";
    const msgs = lintSlideStyles(md);
    expect(msgs.some((m) => m.includes("--radius-md"))).toBe(true);
  });
});
