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
});
