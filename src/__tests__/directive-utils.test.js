import { describe, it, expect } from "vitest";
import {
  updateLayoutDirective,
  updateBackgroundDirective,
  updateThemeDirective,
  updateAreaStyleDirective,
  updateHeaderStyleDirective,
  removeAreaFromLayout,
  describeBackground,
  buildSingleColumnCustomLayout,
  parseSingleColumnLayout,
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

  it("keeps main centered when deleting header from a focus (3-column) layout", () => {
    const md =
      'layout: "header header header" auto ". main ." minmax(0, 1fr) "footer footer footer" 0.08fr / 1fr 4.6667fr 1fr\n\n@header\nTitle\n\n@main\nContent\n\n@footer\nFoot';
    const result = removeAreaFromLayout(md, "header");
    expect(result).toContain('"footer footer footer"');
    expect(result).toContain('". main ."');
    expect(result).toContain("/ 1fr 4.6667fr 1fr");
    // Should not produce a 2-column right-aligned grid
    expect(result).not.toContain('". main"');
    expect(result).not.toContain('"main ."');
  });

  it("keeps main centered when deleting footer from a focus (3-column) layout", () => {
    const md =
      'layout: "header header header" auto ". main ." minmax(0, 1fr) "footer footer footer" 0.08fr / 1fr 4.6667fr 1fr\n\n@header\nTitle\n\n@main\nContent\n\n@footer\nFoot';
    const result = removeAreaFromLayout(md, "footer");
    expect(result).toContain('"header header header"');
    expect(result).toContain('". main ."');
    expect(result).toContain("/ 1fr 4.6667fr 1fr");
    expect(result).not.toContain('". main"');
    expect(result).not.toContain('"main ."');
  });

  it("does not force-center main when the original row was asymmetric", () => {
    // "media main ." — deleting media makes it ". main ." but the original
    // was not symmetric, so the mirror rule should not fire.
    const md =
      'layout: "header header header" "media main ." "footer footer footer" / 1fr 2fr 1fr\n\n@media\nimg\n\n@main\nContent\n\n@footer\nFoot';
    const result = removeAreaFromLayout(md, "media");
    // The right filler column should be pruned, producing a 2-column grid
    expect(result).not.toContain('". main ."');
  });
});

describe("single-column layout helpers", () => {
  it("rejects multi-column grids even when they contain main at a supported index", () => {
    expect(
      parseSingleColumnLayout(
        '"header header" auto "main media" 1fr "footer footer" auto / 2fr 1fr',
      ),
    ).toBeNull();
    expect(
      parseSingleColumnLayout(
        '"header header header" auto "main media secondary" 1fr "footer footer footer" auto / 1fr 1fr 1fr',
      ),
    ).toBeNull();
  });

  it("recognizes centered filler-column grids and preserves focus row sizes", () => {
    const layout =
      '"header header header" 0.08fr ". main ." 1fr "footer footer footer" 0.08fr / 1fr 2fr 1fr';
    expect(parseSingleColumnLayout(layout)).toEqual({ base: "focus", width: 50, align: "center" });
    expect(buildSingleColumnCustomLayout("focus", 40, "center", "0.08fr 1fr 0.08fr")).toContain(
      '"header header header" 0.08fr ". main ." 1fr "footer footer footer" 0.08fr',
    );
  });

  it("recognizes a resized focus grid with auto header and 0.08fr footer", () => {
    const layout =
      '"header header header" auto ". main ." minmax(0, 1fr) "footer footer footer" 0.08fr / 1.5fr 3fr 1.5fr';
    expect(parseSingleColumnLayout(layout)).toEqual({ base: "focus", width: 50, align: "center" });
  });

  it("reports the actual rendered width for the focus preset name", () => {
    const parsed = parseSingleColumnLayout("focus");
    expect(parsed.base).toBe("focus");
    expect(parsed.align).toBe("center");
    expect(parsed.width).toBe(70);
  });

  it("still reports 100% width for single-column preset names", () => {
    expect(parseSingleColumnLayout("header-content").width).toBe(100);
    expect(parseSingleColumnLayout("default").width).toBe(100);
    expect(parseSingleColumnLayout("full-image").width).toBe(100);
  });

  it("returns the base preset for a centered 100% width when preset renders at 100%", () => {
    expect(buildSingleColumnCustomLayout("header-content", 100, "center")).toBe("header-content");
    expect(buildSingleColumnCustomLayout("default", 100, "center")).toBe("default");
  });

  it("returns the preset name when requested width/align matches the preset's rendered values", () => {
    // Focus renders at 70% centered — requesting 70% center is a no-op
    expect(buildSingleColumnCustomLayout("focus", 70, "center")).toBe("focus");
  });

  it("emits an explicit grid when custom row sizes are supplied, even at matching width", () => {
    const result = buildSingleColumnCustomLayout("focus", 70, "center", "0.2fr 1fr 0.08fr");
    expect(result).not.toBe("focus");
    expect(result).toContain("0.2fr");
  });

  it("emits an explicit full-width grid for focus at 100% (preset renders at 70%)", () => {
    const result = buildSingleColumnCustomLayout("focus", 100, "center");
    expect(result).not.toBe("focus");
    expect(result).toContain('"header header header"');
    expect(result).toContain('"footer footer footer"');
    expect(result).toContain("0.08fr");
    const parsed = parseSingleColumnLayout(result);
    expect(parsed.width).toBe(100);
    expect(parsed.base).toBe("focus");
  });

  it("does not classify a title row as an editable single-column layout", () => {
    expect(parseSingleColumnLayout('"title" 1fr "main" 1fr / 1fr')).toBeNull();
  });

  it("preserves full-image structure when building an aligned grid", () => {
    expect(buildSingleColumnCustomLayout("full-image", 60, "left")).toContain('"main ."');
    expect(buildSingleColumnCustomLayout("full-image", 60, "left")).not.toContain("header");
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
