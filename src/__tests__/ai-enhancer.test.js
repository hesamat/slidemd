import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  parseAiResponse,
  slidesToMarkdown,
  buildMessages,
  extractDirectives,
  fixSlideLayouts,
} from "../data/ai-enhancer.js";

describe("estimateTokens", () => {
  it("estimates roughly 1 token per 4 chars", () => {
    expect(estimateTokens("1234")).toBe(1);
    expect(estimateTokens("12345678")).toBe(2);
  });
  it("rounds up", () => {
    expect(estimateTokens("123")).toBe(1);
    expect(estimateTokens("12345")).toBe(2);
  });
});

describe("parseAiResponse", () => {
  it("parses valid JSON with slides", () => {
    const input = '{"slides":[{"layout":"header-content","content":"@header\\n## Title"}]}';
    const result = parseAiResponse(input);
    expect(result).not.toBeNull();
    expect(result.slides).toHaveLength(1);
    expect(result.slides[0].layout).toBe("header-content");
  });

  it("parses JSON wrapped in code fence", () => {
    const input = '```json\n{"slides":[{"layout":"title-slide","content":"# Title"}]}\n```';
    const result = parseAiResponse(input);
    expect(result).not.toBeNull();
    expect(result.slides[0].layout).toBe("title-slide");
  });

  it("returns null for invalid input", () => {
    expect(parseAiResponse("no json here")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parseAiResponse("")).toBeNull();
  });

  it("handles braces inside JSON string values", () => {
    const input =
      '{"slides":[{"layout":"header-content","content":"@main\\nUse {braces} in code"}]}';
    const result = parseAiResponse(input);
    expect(result).not.toBeNull();
    expect(result.slides[0].content).toContain("{braces}");
  });
});

describe("slidesToMarkdown", () => {
  it("converts slides to markdown with layout", () => {
    const slides = [
      { layout: "header-content", content: "@header\n## Title" },
      { layout: "two-column", content: "@main\n- Item 1" },
    ];
    const md = slidesToMarkdown(slides);
    expect(md).toContain("layout: header-content");
    expect(md).toContain("layout: two-column");
    expect(md).toContain("@header");
    expect(md).toContain("---");
  });

  it("includes background when provided", () => {
    const slides = [{ layout: "title-slide", background: "#fff", content: "# Hi" }];
    const md = slidesToMarkdown(slides);
    expect(md).toContain("background: #fff");
  });

  it("skips empty background", () => {
    const slides = [{ layout: "title-slide", content: "# Hi" }];
    const md = slidesToMarkdown(slides);
    expect(md).not.toContain("background:");
  });
});

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

describe("fixSlideLayouts", () => {
  it("preserves original backgrounds (fix mode)", () => {
    const slides = [{ layout: "header-content", content: "@header\n## Hi" }];
    const orig = [
      { layout: "header-content", background: "linear-gradient(#000,#fff)", theme: "" },
    ];
    const result = fixSlideLayouts(slides, orig, "fix");
    expect(result[0].background).toBe("linear-gradient(#000,#fff)");
  });

  it("preserves original backgrounds (generate mode)", () => {
    const slides = [{ layout: "title-slide", content: "# Hi" }];
    const orig = [
      { layout: "header-content", background: "linear-gradient(#000,#fff)", theme: "" },
    ];
    const result = fixSlideLayouts(slides, orig, "generate");
    expect(result[0].background).toBe("linear-gradient(#000,#fff)");
  });

  it("fixes header-content to two-column when @media exists", () => {
    const slides = [{ layout: "header-content", content: "@header\n## Title\n\n@media\n- Item" }];
    const orig = [{ layout: "two-column", background: "", theme: "" }];
    const result = fixSlideLayouts(slides, orig, "fix");
    expect(result[0].layout).toBe("two-column");
  });

  it("preserves original layout when no @media (fix mode)", () => {
    const slides = [{ layout: "header-content", content: "@header\n## Title\n\n@main\n- Item" }];
    const orig = [{ layout: "two-column", background: "", theme: "" }];
    const result = fixSlideLayouts(slides, orig, "fix");
    expect(result[0].layout).toBe("two-column");
  });

  it("keeps AI-chosen layout in generate mode", () => {
    const slides = [{ layout: "two-column", content: "@main\n- Item 1" }];
    const orig = [{ layout: "header-content", background: "", theme: "" }];
    const result = fixSlideLayouts(slides, orig, "generate");
    expect(result[0].layout).toBe("two-column");
  });

  it("still fixes @media mismatch in generate mode", () => {
    const slides = [{ layout: "header-content", content: "@header\n## Title\n\n@media\n- Item" }];
    const orig = [{ layout: "header-content", background: "", theme: "" }];
    const result = fixSlideLayouts(slides, orig, "generate");
    expect(result[0].layout).toBe("two-column");
  });

  it("defaults to fix mode when mode not specified", () => {
    const slides = [{ layout: "header-content", content: "@header\n## Hi" }];
    const orig = [{ layout: "two-column", background: "", theme: "" }];
    const result = fixSlideLayouts(slides, orig);
    expect(result[0].layout).toBe("two-column");
  });

  it("filters out slides with empty content", () => {
    const slides = [
      { layout: "title-slide", content: "# Title" },
      { layout: "header-content", content: "   " },
      { layout: "two-column", content: "" },
      { layout: "header-content", content: "@main\n- Item" },
    ];
    const orig = [
      { layout: "title-slide", background: "", theme: "" },
      { layout: "header-content", background: "", theme: "" },
      { layout: "two-column", background: "", theme: "" },
      { layout: "header-content", background: "", theme: "" },
    ];
    const result = fixSlideLayouts(slides, orig);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("# Title");
    expect(result[1].content).toBe("@main\n- Item");
  });

  it("filters out slides with null/undefined content", () => {
    const slides = [
      { layout: "title-slide", content: "# Hi" },
      { layout: "header-content", content: null },
    ];
    const orig = [
      { layout: "title-slide", background: "", theme: "" },
      { layout: "header-content", background: "", theme: "" },
    ];
    const result = fixSlideLayouts(slides, orig);
    expect(result).toHaveLength(1);
  });
});

describe("buildMessages", () => {
  it("strips frontmatter from markdown", () => {
    const md =
      "layout: header-content\nbackground: #fff\ntheme: dark\n@header\n## Title\n\n@main\n- Item";
    const { user, original } = buildMessages(md, "fix");
    expect(user).toContain("@header");
    expect(user).toContain("- Item");
    expect(user).not.toContain("layout:");
    expect(user).not.toContain("background:");
    expect(user).not.toContain("theme:");
    expect(original).toBe(md);
  });

  it("preserves directives inside code blocks", () => {
    const md =
      "layout: header-content\n@main\n```\nlayout: two-column\nbackground: #fff\n```\n- Item";
    const { user } = buildMessages(md, "fix");
    expect(user).toContain("layout: two-column");
    expect(user).toContain("background: #fff");
    expect(user).not.toMatch(/^layout: header-content/m);
  });

  it("includes hidden in stripped frontmatter", () => {
    const md = "layout: title-slide\nhidden: true\n# Title";
    const { user } = buildMessages(md, "fix");
    expect(user).not.toContain("hidden:");
    expect(user).toContain("# Title");
  });

  it("returns system prompt for fix mode", () => {
    const { system } = buildMessages("# Test", "fix");
    expect(system).toContain("You are a SlideMD markdown editor");
  });

  it("returns system prompt for generate mode", () => {
    const { system } = buildMessages("# Test", "generate");
    expect(system).toContain("You are a SlideMD markdown editor");
  });
});

describe("parseAiResponse (edge cases)", () => {
  it("handles JSON with escaped characters in content", () => {
    const input =
      '{"slides":[{"layout":"header-content","content":"@header\\n## \\"Quoted\\" Title"}]}';
    const result = parseAiResponse(input);
    expect(result).not.toBeNull();
    expect(result.slides[0].content).toContain('"Quoted" Title');
  });

  it("handles JSON with escaped backslashes", () => {
    // JSON "\\\\n" → parsed as "\n" (literal backslash + n)
    const input =
      '{"slides":[{"layout":"header-content","content":"@main\\nUse \\\\n for newlines"}]}';
    const result = parseAiResponse(input);
    expect(result).not.toBeNull();
    expect(result.slides[0].content).toContain("\\n");
  });

  it("extracts JSON when analysis text precedes it", () => {
    const input =
      'Here is the analysis of your slides...\n\nThe JSON output is below:\n\n{"slides":[{"layout":"title-slide","content":"# Title"}]}\n\nHope this helps!';
    const result = parseAiResponse(input);
    expect(result).not.toBeNull();
    expect(result.slides[0].layout).toBe("title-slide");
  });

  it("handles code fence with language tag", () => {
    const input = '```json\n{"slides":[{"layout":"header-content","content":"@main"}]}\n```';
    const result = parseAiResponse(input);
    expect(result).not.toBeNull();
  });

  it("returns null for object without slides key", () => {
    expect(parseAiResponse('{"notSlides":[{"a":1}]}')).toBeNull();
  });
});
