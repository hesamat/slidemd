import { describe, it, expect } from "vitest";
import {
  COLOR_SWATCHES,
  ICON_NONE,
  isColorDark,
  buildImageBackground,
  parseCss,
  parseBorder,
  parsePx,
  buildAreaStyle,
} from "../editor/ui/style-helpers.js";

describe("COLOR_SWATCHES", () => {
  it("has 5 swatches", () => {
    expect(COLOR_SWATCHES).toHaveLength(5);
  });

  it("each swatch has name and value", () => {
    for (const s of COLOR_SWATCHES) {
      expect(s.name).toBeTruthy();
      expect(s.value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("ICON_NONE", () => {
  it("is a cross mark", () => {
    expect(ICON_NONE).toBe("\u2715");
  });
});

describe("isColorDark", () => {
  it("returns false for null/undefined", () => {
    expect(isColorDark(null)).toBe(false);
    expect(isColorDark(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isColorDark("")).toBe(false);
  });

  it("returns false for non-hex strings", () => {
    expect(isColorDark("red")).toBe(false);
    expect(isColorDark("rgb(0,0,0)")).toBe(false);
  });

  it("returns false for white", () => {
    expect(isColorDark("#ffffff")).toBe(false);
  });

  it("returns true for black", () => {
    expect(isColorDark("#000000")).toBe(true);
  });

  it("returns true for dark navy", () => {
    expect(isColorDark("#0f172a")).toBe(true);
  });

  it("returns false for light gray", () => {
    expect(isColorDark("#f1f5f9")).toBe(false);
  });

  it("returns true for dark slate", () => {
    expect(isColorDark("#1e293b")).toBe(true);
  });

  it("handles hex without # prefix", () => {
    // isColorDark requires # prefix
    expect(isColorDark("ffffff")).toBe(false);
  });
});

describe("buildImageBackground", () => {
  it("returns empty string for empty path", () => {
    expect(buildImageBackground("", 40, "")).toBe("");
    expect(buildImageBackground(null, 40, "")).toBe("");
  });

  it("builds image-only background", () => {
    const result = buildImageBackground("images/slide.png", 0, "");
    expect(result).toBe("url('images/slide.png') center / cover no-repeat");
  });

  it("prefers blobUrl over path", () => {
    const result = buildImageBackground("images/slide.png", 0, "blob:http://example.com/abc");
    expect(result).toContain("blob:http://example.com/abc");
    expect(result).not.toContain("images/slide.png");
  });

  it("adds overlay layer", () => {
    const result = buildImageBackground("images/slide.png", 50, "");
    expect(result).toContain("linear-gradient(rgba(0,0,0,0.5),rgba(0,0,0,0.5))");
    expect(result).toContain("url('images/slide.png')");
  });

  it("overlay 0 returns image only", () => {
    const result = buildImageBackground("images/slide.png", 0, "");
    expect(result).not.toContain("linear-gradient");
  });

  it("escapes single quotes in path", () => {
    const result = buildImageBackground("images/my slide.png", 0, "");
    expect(result).toContain("url('images/my slide.png')");
  });
});

describe("parseCss", () => {
  it("parses simple CSS", () => {
    const result = parseCss("border: 2px solid red; padding: 10px");
    expect(result).toEqual({ border: "2px solid red", padding: "10px" });
  });

  it("returns empty object for empty input", () => {
    expect(parseCss("")).toEqual({});
    expect(parseCss(null)).toEqual({});
  });

  it("skips declarations without colon", () => {
    const result = parseCss("border: 2px solid red; invalid; padding: 5px");
    expect(result).toEqual({ border: "2px solid red", padding: "5px" });
  });

  it("skips empty values", () => {
    const result = parseCss("border: ; padding: 10px");
    expect(result).toEqual({ padding: "10px" });
  });

  it("trims whitespace", () => {
    const result = parseCss("  border : 2px solid red ; padding : 10px ");
    expect(result).toEqual({ border: "2px solid red", padding: "10px" });
  });

  it("handles single declaration", () => {
    const result = parseCss("border-radius: 8px");
    expect(result).toEqual({ "border-radius": "8px" });
  });
});

describe("parseBorder", () => {
  it("parses full border string", () => {
    const result = parseBorder("2px solid #ff0000");
    expect(result).toEqual({ width: 2, color: "#ff0000" });
  });

  it("defaults color to light gray", () => {
    const result = parseBorder("3px solid");
    expect(result).toEqual({ width: 3, color: "#d3d3d3" });
  });

  it("returns 0 width for empty string", () => {
    const result = parseBorder("");
    expect(result).toEqual({ width: 0, color: "#d3d3d3" });
  });

  it("returns 0 width for non-numeric", () => {
    const result = parseBorder("abc solid red");
    expect(result).toEqual({ width: 0, color: "red" });
  });

  it("parses width only", () => {
    const result = parseBorder("4px");
    expect(result).toEqual({ width: 4, color: "#d3d3d3" });
  });
});

describe("parsePx", () => {
  it("parses numeric value", () => {
    expect(parsePx("10")).toBe(10);
  });

  it("parses value with px suffix", () => {
    expect(parsePx("10px")).toBe(10);
  });

  it("returns 0 for empty string", () => {
    expect(parsePx("")).toBe(0);
  });

  it("returns 0 for non-numeric", () => {
    expect(parsePx("abc")).toBe(0);
  });

  it("truncates decimals", () => {
    expect(parsePx("10.5")).toBe(10);
  });
});

describe("buildAreaStyle", () => {
  it("returns empty string for defaults", () => {
    expect(buildAreaStyle(0, "#d3d3d3", 0, 10)).toBe("");
  });

  it("builds border only", () => {
    expect(buildAreaStyle(2, "#ff0000", 0, 10)).toBe("border: 2px solid #ff0000");
  });

  it("builds radius only", () => {
    expect(buildAreaStyle(0, "#d3d3d3", 8, 10)).toBe("border-radius: 8px");
  });

  it("builds padding only when not 10", () => {
    expect(buildAreaStyle(0, "#d3d3d3", 0, 20)).toBe("padding: 20px");
  });

  it("omits padding when it is 10", () => {
    expect(buildAreaStyle(0, "#d3d3d3", 0, 10)).toBe("");
  });

  it("combines border and radius", () => {
    expect(buildAreaStyle(1, "#000", 5, 10)).toBe("border: 1px solid #000; border-radius: 5px");
  });

  it("combines all non-default values", () => {
    const result = buildAreaStyle(2, "#ff0000", 8, 16);
    expect(result).toBe("border: 2px solid #ff0000; border-radius: 8px; padding: 16px");
  });
});
