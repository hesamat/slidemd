import { describe, it, expect } from "vitest";
import {
  extractDirectives,
  restoreDirectives,
  injectDirectives,
} from "../data/ai/ai-directive-utils.js";

describe("extractDirectives", () => {
  it("extracts layout, background, theme per slide", () => {
    const md =
      "layout: header-content\nbackground: #fff\n@header\n## Hi\n\n---\n\nlayout: two-column\ntheme: dark\n@main\n- Item";
    const result = extractDirectives(md);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ layout: "header-content", background: "#fff", theme: "" });
    expect(result[1]).toEqual({ layout: "two-column", background: "", theme: "dark" });
  });
});

describe("restoreDirectives", () => {
  it("restores original backgrounds", () => {
    const slides = [{ layout: "header-content", content: "@header\n## Hi" }];
    const orig = [
      { layout: "header-content", background: "linear-gradient(#000,#fff)", theme: "" },
    ];
    const result = restoreDirectives(slides, orig);
    expect(result[0].background).toBe("linear-gradient(#000,#fff)");
  });

  it("restores original themes", () => {
    const slides = [{ layout: "header-content", content: "@header\n## Hi" }];
    const orig = [{ layout: "", background: "", theme: "dark" }];
    const result = restoreDirectives(slides, orig);
    expect(result[0].theme).toBe("dark");
  });

  it("restores original layout over AI choice", () => {
    const slides = [{ layout: "two-column", content: "@main\n- Item 1" }];
    const orig = [{ layout: "header-content", background: "", theme: "" }];
    const result = restoreDirectives(slides, orig);
    expect(result[0].layout).toBe("header-content");
  });

  it("prefers original layout/bg/theme over AI", () => {
    const slides = [{ layout: "focus", background: "red", theme: "light", content: "@main\n- Hi" }];
    const orig = [{ layout: "header-content", background: "blue", theme: "dark" }];
    const result = restoreDirectives(slides, orig);
    expect(result[0].layout).toBe("header-content");
    expect(result[0].background).toBe("blue");
    expect(result[0].theme).toBe("dark");
  });

  it("falls back to AI values when no original", () => {
    const slides = [{ layout: "focus", background: "red", theme: "light", content: "@main\n- Hi" }];
    const result = restoreDirectives(slides, []);
    expect(result[0].layout).toBe("focus");
    expect(result[0].background).toBe("red");
    expect(result[0].theme).toBe("light");
  });

  it("handles slides with empty content", () => {
    const slides = [
      { layout: "title-slide", content: "# Title" },
      { layout: "header-content", content: "   " },
    ];
    const orig = [
      { layout: "", background: "#fff", theme: "" },
      { layout: "", background: "#000", theme: "dark" },
    ];
    const result = restoreDirectives(slides, orig);
    expect(result).toHaveLength(2);
    expect(result[0].background).toBe("#fff");
    expect(result[1].theme).toBe("dark");
  });
});

describe("injectDirectives", () => {
  it("injects background after layout directive", () => {
    const md = "layout: focus\n\n@header\n## Title\n\n@main\n- Content";
    const orig = [{ layout: "focus", background: "url(images/bg.jpg)", theme: "" }];
    const result = injectDirectives(md, orig);
    expect(result).toContain("layout: focus\nbackground: url(images/bg.jpg)");
  });

  it("injects theme after layout directive", () => {
    const md = "layout: focus\n\n@header\n## Title";
    const orig = [{ layout: "focus", background: "", theme: "dark" }];
    const result = injectDirectives(md, orig);
    expect(result).toContain("layout: focus\ntheme: dark");
  });

  it("injects both background and theme", () => {
    const md = "layout: focus\n\n@header\n## Title";
    const orig = [{ layout: "focus", background: "red", theme: "dark" }];
    const result = injectDirectives(md, orig);
    expect(result).toContain("background: red");
    expect(result).toContain("theme: dark");
  });

  it("does not inject when no bg/theme in original", () => {
    const md = "layout: focus\n\n@header\n## Title";
    const orig = [{ layout: "focus", background: "", theme: "" }];
    const result = injectDirectives(md, orig);
    expect(result).toBe(md);
  });

  it("handles multi-slide markdown", () => {
    const md =
      "layout: focus\n\n@main\n- Slide 1\n\n---\n\nlayout: header-content\n\n@main\n- Slide 2";
    const orig = [
      { layout: "focus", background: "red", theme: "dark" },
      { layout: "header-content", background: "blue", theme: "" },
    ];
    const result = injectDirectives(md, orig);
    expect(result).toContain("background: red");
    expect(result).toContain("theme: dark");
    expect(result).toContain("background: blue");
    expect(result).not.toMatch(/background: blue[\s\S]*theme:/);
  });

  it("preserves content after directives", () => {
    const md = "layout: focus\n\n@header\n## Title\n\n@main\n- Content";
    const orig = [{ layout: "focus", background: "red", theme: "dark" }];
    const result = injectDirectives(md, orig);
    expect(result).toContain("@header\n## Title");
    expect(result).toContain("@main\n- Content");
  });
});
