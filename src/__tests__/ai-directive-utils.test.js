import { describe, it, expect } from "vitest";
import {
  extractDirectives,
  restoreDirectives,
  injectDirectives,
  stripLeadingDirectives,
} from "../data/ai/ai-directive-utils.js";

describe("extractDirectives", () => {
  it("extracts layout, background, theme per slide", () => {
    const md =
      "layout: header-content\nbackground: #fff\n@header\n## Hi\n\n---\n\nlayout: two-column\ntheme: dark\n@main\n- Item";
    const result = extractDirectives(md);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      layout: "header-content",
      background: "#fff",
      theme: "",
      mediaFullBleed: false,
      areaBg: {},
    });
    expect(result[1]).toEqual({
      layout: "two-column",
      background: "",
      theme: "dark",
      mediaFullBleed: false,
      areaBg: {},
    });
  });

  it("extracts the media-span intent directive", () => {
    const md = "layout: media-span-right\nmedia-span: right\n@media\nImage";
    const result = extractDirectives(md);
    expect(result[0].mediaFullBleed).toBe(true);
  });

  it("is fence-aware — a --- inside a code block does not create a phantom slide", () => {
    const md =
      "layout: header-content\nbackground: #fff\n@main\n```yaml\n---\n```\n\n---\n\nlayout: two-column\ntheme: dark\n@main\n- Item";
    const result = extractDirectives(md);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      layout: "header-content",
      background: "#fff",
      theme: "",
      mediaFullBleed: false,
      areaBg: {},
    });
    expect(result[1]).toEqual({
      layout: "two-column",
      background: "",
      theme: "dark",
      mediaFullBleed: false,
      areaBg: {},
    });
  });

  it("accepts a pre-split slides array", () => {
    const slides = [
      "layout: focus\nbackground: red\n@main\n- A",
      "layout: header-content\ntheme: light\n@main\n- B",
    ];
    const result = extractDirectives("", slides);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      layout: "focus",
      background: "red",
      theme: "",
      mediaFullBleed: false,
      areaBg: {},
    });
    expect(result[1]).toEqual({
      layout: "header-content",
      background: "",
      theme: "light",
      mediaFullBleed: false,
      areaBg: {},
    });
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

  it("does not duplicate background/theme when the AI already echoed them back", () => {
    const md = "layout: focus\nbackground: red\ntheme: dark\n\n@header\n## Title";
    const orig = [{ layout: "focus", background: "red", theme: "dark" }];
    const result = injectDirectives(md, orig);
    expect(result.match(/^background:/gm)).toHaveLength(1);
    expect(result.match(/^theme:/gm)).toHaveLength(1);
    expect(result).toContain("background: red");
    expect(result).toContain("theme: dark");
  });

  it("restores media-span intent in fix mode", () => {
    const md = "layout: media-span-right\n\n@media\nImage";
    const orig = [{ layout: "media-span-right", background: "", theme: "", mediaFullBleed: true }];
    const result = injectDirectives(md, orig, "fix");
    expect(result).toContain("media-full-bleed: true");
  });

  it("strips an AI-echoed media-span line and restores the original in fix mode", () => {
    const md = "layout: media-span-right\nmedia-span: left\n\n@media\nImage";
    const orig = [{ layout: "media-span-right", background: "", theme: "", mediaFullBleed: true }];
    const result = injectDirectives(md, orig, "fix");
    expect(result.match(/^media-full-bleed:/gm)).toHaveLength(1);
    expect(result).toContain("media-full-bleed: true");
    expect(result).not.toContain("media-span:");
  });

  describe("generate mode", () => {
    it("preserves an AI-chosen background instead of overwriting with the original", () => {
      const md = "layout: focus\nbackground: red\n\n@header\n## Title";
      const orig = [{ layout: "focus", background: "blue", theme: "" }];
      const result = injectDirectives(md, orig, "generate");
      expect(result).toContain("background: red");
      expect(result).not.toContain("background: blue");
      expect(result.match(/^background:/gm)).toHaveLength(1);
    });

    it("fills in a background the AI dropped", () => {
      const md = "layout: focus\n\n@header\n## Title";
      const orig = [{ layout: "focus", background: "blue", theme: "" }];
      const result = injectDirectives(md, orig, "generate");
      expect(result).toContain("background: blue");
    });

    it("does not inject when neither AI nor original has bg/theme", () => {
      const md = "layout: focus\n\n@header\n## Title";
      const orig = [{ layout: "focus", background: "", theme: "" }];
      const result = injectDirectives(md, orig, "generate");
      expect(result).toBe(md);
    });

    it("fills in a media-span directive the AI dropped", () => {
      const md = "layout: media-span-right\n\n@media\nImage";
      const orig = [
        { layout: "media-span-right", background: "", theme: "", mediaFullBleed: true },
      ];
      const result = injectDirectives(md, orig, "generate");
      expect(result).toContain("media-full-bleed: true");
    });

    it("leaves a background: line inside a code block untouched", () => {
      const md = "layout: focus\n\n@main\n```\nbackground: keep\n```";
      const orig = [{ layout: "focus", background: "blue", theme: "" }];
      const result = injectDirectives(md, orig, "generate");
      expect(result).toContain("background: keep");
      expect(result).toContain("background: blue");
    });
  });

  describe("fix mode fence-awareness", () => {
    it("leaves a background: line inside a code block untouched", () => {
      const md = "layout: focus\n\n@main\n```\nbackground: keep\n```";
      const orig = [{ layout: "focus", background: "red", theme: "" }];
      const result = injectDirectives(md, orig, "fix");
      expect(result).toContain("background: keep");
      expect(result).toContain("background: red");
    });

    it("injects bg/theme at the top when the AI omits the layout line", () => {
      // The AI response has no `layout:` directive — fix mode should still
      // restore the original background/theme by prepending them.
      const md = "@header\n## Title\n\n@main\n- Content";
      const orig = [{ layout: "header-content", background: "red", theme: "dark" }];
      const result = injectDirectives(md, orig, "fix");
      expect(result).toContain("background: red");
      expect(result).toContain("theme: dark");
      expect(result).toContain("@header\n## Title");
    });

    it("extracts capitalized directives (Theme:/Background:) the same as lowercase", () => {
      const md = "layout: header-content\nBackground: #fff\nTheme: dark\n@header\n## Hi";
      const result = extractDirectives(md);
      expect(result[0].background).toBe("#fff");
      expect(result[0].theme).toBe("dark");
    });

    it("strips a capitalized AI-echoed Theme: line and restores the original in fix mode", () => {
      // The AI echoes `Theme: light` capitalized; fix mode must strip it so
      // the original `theme: dark` is the only theme that survives — otherwise
      // MarkdownParser.extractDirective (which keeps the last match) would
      // apply the AI's value.
      const md = "layout: header-content\nTheme: light\n\n@header\n## Title";
      const orig = [{ layout: "header-content", background: "", theme: "dark" }];
      const result = injectDirectives(md, orig, "fix");
      expect(result.match(/^theme:/gim) || []).toHaveLength(1);
      expect(result).toContain("theme: dark");
      expect(result).not.toContain("Theme: light");
      expect(result).not.toMatch(/theme:\s*light/i);
    });

    it("strips a capitalized AI-echoed Background: line and restores the original in fix mode", () => {
      const md = "layout: header-content\nBackground : #123456\n\n@header\n## Title";
      const orig = [{ layout: "header-content", background: "#fff", theme: "" }];
      const result = injectDirectives(md, orig, "fix");
      expect(result.match(/^background:/gim) || []).toHaveLength(1);
      expect(result).toContain("background: #fff");
      expect(result).not.toMatch(/background:\s*#123456/i);
    });

    it("recognizes a capitalized Theme: the AI dropped is not double-injected in generate mode", () => {
      const md = "layout: header-content\nTheme: dark\n\n@header\n## Title";
      const orig = [{ layout: "header-content", background: "", theme: "dark" }];
      const result = injectDirectives(md, orig, "generate");
      // hasTopLevelDirective must see the capitalized line as present, so no
      // duplicate is spliced in after layout.
      expect(result.match(/^theme:/gim) || []).toHaveLength(1);
      expect(result).toContain("Theme: dark");
    });

    it("does not treat mid-slide prose as an existing directive in generate mode", () => {
      // A prose line `Background: the story so far` in the body must not
      // suppress the gap-fill for the original background.
      const md = "layout: header-content\n\n@main\n# Heading\n\nBackground: the story so far";
      const orig = [{ layout: "header-content", background: "#fff", theme: "" }];
      const result = injectDirectives(md, orig, "generate");
      expect(result).toContain("background: #fff");
    });
  });

  describe("area-bg directives", () => {
    it("extracts per-area backgrounds from the slide", () => {
      const md =
        "layout: media-span-right\narea-bg-media: #1e293b\narea-bg-main: url(images/c.png)\n@main\n- A";
      const result = extractDirectives(md);
      expect(result[0].areaBg).toEqual({
        media: "#1e293b",
        main: "url(images/c.png)",
      });
    });

    it("restores a dropped per-area background in fix mode", () => {
      // The AI dropped the area-bg line — fix mode must splice the original
      // back in positionally, exactly like background/theme.
      const md = "layout: media-span-right\n\n@main\n- Content";
      const orig = [
        { layout: "media-span-right", background: "", theme: "", areaBg: { media: "#1e293b" } },
      ];
      const result = injectDirectives(md, orig, "fix");
      expect(result).toContain("area-bg-media: #1e293b");
    });

    it("strips an AI-echoed per-area background and restores the original in fix mode", () => {
      const md = "layout: media-span-right\narea-bg-media: #ffffff\n\n@main\n- Content";
      const orig = [
        { layout: "media-span-right", background: "", theme: "", areaBg: { media: "#1e293b" } },
      ];
      const result = injectDirectives(md, orig, "fix");
      expect(result.match(/^area-bg-media:/gm) || []).toHaveLength(1);
      expect(result).toContain("area-bg-media: #1e293b");
      expect(result).not.toContain("area-bg-media: #ffffff");
    });

    it("fills in a per-area background the AI dropped in generate mode", () => {
      const md = "layout: media-span-right\n\n@main\n- Content";
      const orig = [
        { layout: "media-span-right", background: "", theme: "", areaBg: { media: "#1e293b" } },
      ];
      const result = injectDirectives(md, orig, "generate");
      expect(result).toContain("area-bg-media: #1e293b");
    });

    it("keeps an AI-chosen per-area background in generate mode", () => {
      const md = "layout: media-span-right\narea-bg-media: #0f172a\n\n@main\n- Content";
      const orig = [
        { layout: "media-span-right", background: "", theme: "", areaBg: { media: "#1e293b" } },
      ];
      const result = injectDirectives(md, orig, "generate");
      expect(result.match(/^area-bg-media:/gm) || []).toHaveLength(1);
      expect(result).toContain("area-bg-media: #0f172a");
      expect(result).not.toContain("area-bg-media: #1e293b");
    });
  });

  describe("stripLeadingDirectives", () => {
    it("strips named directives from the leading block only", () => {
      const lines = [
        "layout: header-content",
        "theme: dark",
        "",
        "# Heading",
        "background: not a directive",
      ];
      const result = stripLeadingDirectives(lines, ["theme", "background"]);
      expect(result).not.toContain("theme: dark");
      // The mid-slide "background:" line is outside the leading block and
      // must survive.
      expect(result).toContain("background: not a directive");
      expect(result).toContain("layout: header-content");
    });
  });
});
