import { describe, it, expect } from "vitest";
import {
  COLOR_SWATCHES,
  ICON_NONE,
  isColorDark,
  buildImageBackground,
  parseBackgroundValue,
  parseCss,
  parseBorder,
  parsePx,
  buildAreaStyle,
  hexToRgba,
  parseRgba,
  getDefaultBorderColor,
} from "../editor/ui/style-helpers.js";

describe("COLOR_SWATCHES", () => {
  it("has 4 swatches", () => {
    expect(COLOR_SWATCHES).toHaveLength(4);
  });

  it("each swatch has name and value", () => {
    for (const s of COLOR_SWATCHES) {
      expect(s.name).toBeTruthy();
      expect(s.value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("ICON_NONE", () => {
  it("is an SVG icon string (ban icon)", () => {
    expect(ICON_NONE).toContain("<svg");
    expect(ICON_NONE).toContain("</svg>");
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

describe("hexToRgba", () => {
  it("returns hex unchanged at 100% opacity", () => {
    expect(hexToRgba("#ff0000", 100)).toBe("#ff0000");
  });

  it("converts to rgba at 50% opacity", () => {
    expect(hexToRgba("#ff0000", 50)).toBe("rgba(255, 0, 0, 0.5)");
  });

  it("converts to rgba at 0% opacity", () => {
    expect(hexToRgba("#000000", 0)).toBe("rgba(0, 0, 0, 0)");
  });

  it("returns empty string for empty input", () => {
    expect(hexToRgba("", 50)).toBe("");
  });

  it("returns non-hex input unchanged", () => {
    expect(hexToRgba("red", 50)).toBe("red");
  });

  it("expands 3-digit hex before applying transparency", () => {
    expect(hexToRgba("#fff", 50)).toBe("rgba(255, 255, 255, 0.5)");
    expect(hexToRgba("#abc", 0)).toBe("rgba(170, 187, 204, 0)");
  });

  it("returns expanded 3-digit hex at 100% opacity", () => {
    expect(hexToRgba("#abc", 100)).toBe("#aabbcc");
  });
});

describe("parseRgba", () => {
  it("parses rgba with alpha", () => {
    expect(parseRgba("rgba(255, 0, 0, 0.5)")).toEqual({ hex: "#ff0000", opacity: 50 });
  });

  it("parses rgba with alpha 1", () => {
    expect(parseRgba("rgba(0, 0, 0, 1)")).toEqual({ hex: "#000000", opacity: 100 });
  });

  it("parses rgba with alpha 0", () => {
    expect(parseRgba("rgba(0, 0, 0, 0)")).toEqual({ hex: "#000000", opacity: 0 });
  });

  it("parses rgb without alpha as 100% opacity", () => {
    expect(parseRgba("rgb(255, 128, 0)")).toEqual({ hex: "#ff8000", opacity: 100 });
  });

  it("returns hex unchanged for non-rgba input", () => {
    expect(parseRgba("#ff0000")).toEqual({ hex: "#ff0000", opacity: 100 });
  });

  it("returns empty for empty input", () => {
    expect(parseRgba("")).toEqual({ hex: "", opacity: 100 });
  });

  it("handles whitespace in rgba", () => {
    expect(parseRgba("rgba( 100 , 200 , 50 , 0.25 )")).toEqual({
      hex: "#64c832",
      opacity: 25,
    });
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

  it("defaults to cover/center/no-repeat when no opts", () => {
    const result = buildImageBackground("images/bg.png", 0, "");
    expect(result).toBe("url('images/bg.png') center / cover no-repeat");
  });

  it("supports contain size", () => {
    const result = buildImageBackground("images/bg.png", 0, "", { size: "contain" });
    expect(result).toBe("url('images/bg.png') center / contain no-repeat");
  });

  it("supports auto size", () => {
    const result = buildImageBackground("images/bg.png", 0, "", { size: "auto" });
    expect(result).toBe("url('images/bg.png') center / auto no-repeat");
  });

  it("maps fit size to 100% 100%", () => {
    const result = buildImageBackground("images/bg.png", 0, "", { size: "fit" });
    expect(result).toBe("url('images/bg.png') center / 100% 100% no-repeat");
  });

  it("supports all repeat variants", () => {
    expect(buildImageBackground("images/bg.png", 0, "", { repeat: "repeat" })).toBe(
      "url('images/bg.png') center / cover repeat",
    );
    expect(buildImageBackground("images/bg.png", 0, "", { repeat: "repeat-x" })).toBe(
      "url('images/bg.png') center / cover repeat-x",
    );
    expect(buildImageBackground("images/bg.png", 0, "", { repeat: "repeat-y" })).toBe(
      "url('images/bg.png') center / cover repeat-y",
    );
  });

  it("supports custom position", () => {
    const result = buildImageBackground("images/bg.png", 0, "", { position: "top left" });
    expect(result).toBe("url('images/bg.png') top left / cover no-repeat");
  });

  it("combines size and position", () => {
    const result = buildImageBackground("images/bg.png", 0, "", {
      size: "contain",
      position: "bottom right",
    });
    expect(result).toBe("url('images/bg.png') bottom right / contain no-repeat");
  });

  it("supports custom repeat", () => {
    const result = buildImageBackground("images/bg.png", 0, "", { repeat: "repeat" });
    expect(result).toBe("url('images/bg.png') center / cover repeat");
  });

  it("overlay works with custom size/position", () => {
    const result = buildImageBackground("images/bg.png", 60, "", {
      size: "contain",
      position: "top center",
    });
    expect(result).toContain("linear-gradient(rgba(0,0,0,0.6),rgba(0,0,0,0.6))");
    expect(result).toContain("url('images/bg.png') top center / contain no-repeat");
  });
});

describe("parseBackgroundValue", () => {
  it("returns defaults for empty/non-image background", () => {
    const result = parseBackgroundValue("#f1f5f9");
    expect(result.imagePath).toBe("");
    expect(result.bg).toBe("#f1f5f9");
    expect(result.opacity).toBe(100);
    expect(result.size).toBe("cover");
    expect(result.position).toBe("center");
    expect(result.repeat).toBe("no-repeat");
  });

  it("returns defaults for empty string", () => {
    const result = parseBackgroundValue("");
    expect(result.imagePath).toBe("");
    expect(result.overlay).toBe(40);
    expect(result.opacity).toBe(100);
  });

  it("parses rgba color into hex + opacity", () => {
    const result = parseBackgroundValue("rgba(255, 0, 0, 0.5)");
    expect(result.imagePath).toBe("");
    expect(result.bg).toBe("#ff0000");
    expect(result.opacity).toBe(50);
  });

  it("parses rgb color as 100% opacity", () => {
    const result = parseBackgroundValue("rgb(0, 0, 128)");
    expect(result.bg).toBe("#000080");
    expect(result.opacity).toBe(100);
  });

  it("extracts image path from url()", () => {
    const result = parseBackgroundValue("url('images/bg.png') center / cover no-repeat");
    expect(result.imagePath).toBe("images/bg.png");
  });

  it("extracts overlay opacity", () => {
    const css =
      "linear-gradient(rgba(0,0,0,0.5),rgba(0,0,0,0.5)), url('bg.png') center / cover no-repeat";
    const result = parseBackgroundValue(css);
    expect(result.overlay).toBe(50);
  });

  it("defaults overlay to 0 when no gradient", () => {
    const result = parseBackgroundValue("url('bg.png') center / cover no-repeat");
    expect(result.overlay).toBe(0);
  });

  it("parses cover size", () => {
    const result = parseBackgroundValue("url('bg.png') center / cover no-repeat");
    expect(result.size).toBe("cover");
  });

  it("parses contain size", () => {
    const result = parseBackgroundValue("url('bg.png') center / contain no-repeat");
    expect(result.size).toBe("contain");
  });

  it("parses auto size", () => {
    const result = parseBackgroundValue("url('bg.png') center / auto no-repeat");
    expect(result.size).toBe("auto");
  });

  it("normalizes 100% 100% size to fit", () => {
    const result = parseBackgroundValue("url('bg.png') center / 100% 100% no-repeat");
    expect(result.size).toBe("fit");
    expect(result.repeat).toBe("no-repeat");
  });

  it("round-trips fit through buildImageBackground", () => {
    const original = "url('bg.png') center / 100% 100% no-repeat";
    const parsed = parseBackgroundValue(original);
    const rebuilt = buildImageBackground(parsed.imagePath, 0, "", {
      size: parsed.size,
      position: parsed.position,
      repeat: parsed.repeat,
    });
    expect(rebuilt).toBe(original);
  });

  it("parses repeat-y", () => {
    const result = parseBackgroundValue("url('bg.png') center / cover repeat-y");
    expect(result.repeat).toBe("repeat-y");
  });

  it("parses center position", () => {
    const result = parseBackgroundValue("url('bg.png') center / cover no-repeat");
    expect(result.position).toBe("center");
  });

  it("parses two-word position", () => {
    const result = parseBackgroundValue("url('bg.png') top left / cover no-repeat");
    expect(result.position).toBe("top left");
  });

  it("parses bottom right position", () => {
    const result = parseBackgroundValue("url('bg.png') bottom right / contain no-repeat");
    expect(result.position).toBe("bottom right");
    expect(result.size).toBe("contain");
  });

  it("parses repeat", () => {
    const result = parseBackgroundValue("url('bg.png') center / cover repeat");
    expect(result.repeat).toBe("repeat");
  });

  it("parses repeat-x", () => {
    const result = parseBackgroundValue("url('bg.png') center / cover repeat-x");
    expect(result.repeat).toBe("repeat-x");
  });

  it("defaults size to cover when no slash present", () => {
    const result = parseBackgroundValue("url('bg.png') center");
    expect(result.size).toBe("cover");
    expect(result.position).toBe("center");
  });

  it("round-trips through buildImageBackground", () => {
    const original =
      "linear-gradient(rgba(0,0,0,0.4),rgba(0,0,0,0.4)), url('images/bg.png') top left / contain no-repeat";
    const parsed = parseBackgroundValue(original);
    const rebuilt = buildImageBackground(parsed.imagePath, parsed.overlay, "", {
      size: parsed.size,
      position: parsed.position,
      repeat: parsed.repeat,
    });
    expect(rebuilt).toBe(original);
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
    expect(result).toEqual({ width: 3, color: getDefaultBorderColor() });
  });

  it("returns 0 width for empty string", () => {
    const result = parseBorder("");
    expect(result).toEqual({ width: 0, color: getDefaultBorderColor() });
  });

  it("returns 0 width for non-numeric", () => {
    const result = parseBorder("abc solid red");
    expect(result).toEqual({ width: 0, color: "red" });
  });

  it("parses width only", () => {
    const result = parseBorder("4px");
    expect(result).toEqual({ width: 4, color: getDefaultBorderColor() });
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
