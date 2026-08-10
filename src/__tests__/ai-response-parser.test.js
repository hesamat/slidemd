import { describe, it, expect } from "vitest";
import {
  parseAiResponse,
  slidesToMarkdown,
  areasToMarkdown,
  extractHeadings,
} from "../data/ai/ai-response-parser.js";

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

describe("parseAiResponse (edge cases)", () => {
  it("handles JSON with escaped characters in content", () => {
    const input =
      '{"slides":[{"layout":"header-content","content":"@header\\n## \\"Quoted\\" Title"}]}';
    const result = parseAiResponse(input);
    expect(result).not.toBeNull();
    expect(result.slides[0].content).toContain('"Quoted" Title');
  });

  it("handles JSON with escaped backslashes", () => {
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

  it("extracts media-span from the markdown fallback instead of leaving it in content", () => {
    const input = "layout: media-span-right\nmedia-span: right\n\n@media\nImage";
    const result = parseAiResponse(input);
    expect(result).not.toBeNull();
    expect(result.slides[0].mediaSpan).toBe("right");
    expect(result.slides[0].content).not.toContain("media-span:");
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

  it("emits media-span intent when present", () => {
    const slides = [{ layout: "media-span-right", mediaSpan: "right", content: "@media\nImage" }];
    const md = slidesToMarkdown(slides);
    expect(md).toContain("media-span: right");
  });
});

describe("areasToMarkdown", () => {
  it("converts areas object back to markdown with area markers", () => {
    const slides = [
      {
        layout: "header-content",
        areas: {
          header: "<h2>Title</h2>",
          main: "<p>Content</p>",
        },
      },
    ];
    const md = areasToMarkdown(slides);
    expect(md).toContain("layout: header-content");
    expect(md).toContain("@header");
    expect(md).toContain("<h2>Title</h2>");
    expect(md).toContain("@main");
    expect(md).toContain("<p>Content</p>");
  });

  it("strips data-source-line attributes", () => {
    const slides = [
      {
        layout: "header-content",
        areas: {
          main: '<p data-source-line="5">Content</p>',
        },
      },
    ];
    const md = areasToMarkdown(slides);
    expect(md).not.toContain("data-source-line");
  });

  it("handles empty areas", () => {
    const slides = [{ layout: "title-slide", areas: {} }];
    const md = areasToMarkdown(slides);
    expect(md).toContain("layout: title-slide");
  });
});

describe("extractHeadings", () => {
  it("extracts first heading from each slide", () => {
    const md = "## Slide One\n\n@main\n- Item\n\n---\n\n# Slide Two\n\n@main\n- Item";
    const headings = extractHeadings(md);
    expect(headings).toHaveLength(2);
    expect(headings[0]).toBe("Slide One");
    expect(headings[1]).toBe("Slide Two");
  });

  it("returns empty string for slides without headings", () => {
    const md = "@main\n- No heading here";
    const headings = extractHeadings(md);
    expect(headings).toHaveLength(1);
    expect(headings[0]).toBe("");
  });
});
