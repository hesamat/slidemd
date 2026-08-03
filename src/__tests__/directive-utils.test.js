import { describe, it, expect } from "vitest";
import {
  updateLayoutDirective,
  updateBackgroundDirective,
  updateThemeDirective,
  updateAreaStyleDirective,
  updateHeaderStyleDirective,
  removeAreaFromLayout,
  describeBackground,
} from "../editor/core/directive-utils.js";

describe("removeAreaFromLayout", () => {
  it("leaves a blank layout directive unchanged", () => {
    const md = "background: #fff\nlayout:\n\n@main\ncontent\n@media\nimage";
    expect(removeAreaFromLayout(md, "media")).toBe(md);
  });

  it("replaces an area's cells and drops the now-empty redundant column", () => {
    const md = 'layout: "header header" "main media" / 1fr 1fr\n\n@media\nimage';
    const result = removeAreaFromLayout(md, "media");
    expect(result).toContain('layout: "header" "main" / 1fr');
  });

  it("removes a row that becomes entirely empty", () => {
    const md = 'layout: "header" "main" "footer" / 1fr\n\n@header\ntitle';
    const result = removeAreaFromLayout(md, "header");
    expect(result).toContain('layout: "main" "footer" / 1fr');
  });

  it("leaves the markdown unchanged when the area is not in the layout", () => {
    const md = 'layout: "header" "main" / 1fr\n\n@header\ntitle';
    expect(removeAreaFromLayout(md, "media")).toBe(md);
  });

  it("does not allow removing main", () => {
    const md = 'layout: "header" "main" / 1fr\n\n@main\ncontent';
    expect(removeAreaFromLayout(md, "main")).toBe(md);
  });
});

describe("updateLayoutDirective", () => {
  it("replaces existing layout directive", () => {
    const md = "layout: two-column\n# Hello";
    const result = updateLayoutDirective(md, "three-column");
    expect(result).toMatch(/^layout: three-column\n/);
    expect(result).toContain("# Hello");
  });

  it("inserts layout directive when missing", () => {
    const md = "# Hello\nSome content";
    const result = updateLayoutDirective(md, "two-column");
    expect(result).toMatch(/^layout: two-column\n/);
    expect(result).toContain("# Hello");
  });

  it("removes old layout line from body", () => {
    const md = "layout: old-value\n# Title";
    const result = updateLayoutDirective(md, "new-value");
    expect(result).not.toContain("layout: old-value");
  });
});

describe("updateBackgroundDirective", () => {
  it("replaces existing background directive", () => {
    const md = "background: red\n# Hello";
    const result = updateBackgroundDirective(md, "blue");
    expect(result).toMatch(/^background: blue\n/);
  });

  it("inserts background directive when missing", () => {
    const md = "# Hello";
    const result = updateBackgroundDirective(md, "url(bg.png)");
    expect(result).toMatch(/^background: url\(bg.png\)\n/);
  });

  it("removes background when value is empty", () => {
    const md = "background: red\n# Hello";
    const result = updateBackgroundDirective(md, "");
    expect(result).not.toContain("background:");
    expect(result).toContain("# Hello");
  });

  it("handles multi-line background values", () => {
    const md = "# Hello";
    const result = updateBackgroundDirective(md, "linear-gradient(\n  red, blue)");
    expect(result).toMatch(/^background: linear-gradient\(\n {4}red, blue\)\n/);
  });
});

describe("updateThemeDirective", () => {
  it("replaces existing theme directive", () => {
    const md = "theme: dark\n# Hello";
    const result = updateThemeDirective(md, "light");
    expect(result).toMatch(/^theme: light\n/);
  });

  it("inserts theme directive when missing", () => {
    const md = "# Hello";
    const result = updateThemeDirective(md, "dark");
    expect(result).toMatch(/^theme: dark\n/);
  });

  it("removes theme when value is empty", () => {
    const md = "theme: dark\n# Hello";
    const result = updateThemeDirective(md, "");
    expect(result).not.toContain("theme:");
  });

  it("normalizes to lowercase", () => {
    const md = "# Hello";
    const result = updateThemeDirective(md, "DARK");
    expect(result).toMatch(/^theme: dark\n/);
  });
});

describe("updateAreaStyleDirective", () => {
  it("replaces existing area-style directive", () => {
    const md = "area-style: border: 1px\n# Hello";
    const result = updateAreaStyleDirective(md, "border: 2px solid red");
    expect(result).toMatch(/^area-style: border: 2px solid red\n/);
  });

  it("removes area-style when value is empty", () => {
    const md = "area-style: border: 1px\n# Hello";
    const result = updateAreaStyleDirective(md, "");
    expect(result).not.toContain("area-style:");
  });
});

describe("updateHeaderStyleDirective", () => {
  it("replaces existing header-style directive", () => {
    const md = "header-style: full\n# Hello";
    const result = updateHeaderStyleDirective(md, "thick");
    expect(result).toMatch(/^header-style: thick\n/);
  });

  it("removes header-style when value is 'line' (default)", () => {
    const md = "header-style: full\n# Hello";
    const result = updateHeaderStyleDirective(md, "line");
    expect(result).not.toContain("header-style:");
  });

  it("removes header-style when value is empty", () => {
    const md = "header-style: full\n# Hello";
    const result = updateHeaderStyleDirective(md, "");
    expect(result).not.toContain("header-style:");
  });

  it("normalizes to lowercase", () => {
    const md = "# Hello";
    const result = updateHeaderStyleDirective(md, "THICK");
    expect(result).toMatch(/^header-style: thick\n/);
  });
});

describe("describeBackground", () => {
  it("returns none type for empty string", () => {
    expect(describeBackground("")).toEqual({ type: "none", value: "", preview: "" });
  });

  it("returns none type for null/undefined", () => {
    expect(describeBackground(null)).toEqual({ type: "none", value: "", preview: "" });
    expect(describeBackground(undefined)).toEqual({ type: "none", value: "", preview: "" });
  });

  it("detects color type", () => {
    const result = describeBackground("red");
    expect(result.type).toBe("color");
    expect(result.value).toBe("red");
    expect(result.preview).toBe("red");
  });

  it("detects gradient type", () => {
    const result = describeBackground("linear-gradient(red, blue)");
    expect(result.type).toBe("gradient");
  });

  it("detects image type", () => {
    const result = describeBackground("url(image.png)");
    expect(result.type).toBe("image");
  });

  it("trims whitespace", () => {
    const result = describeBackground("  red  ");
    expect(result.value).toBe("red");
  });
});
