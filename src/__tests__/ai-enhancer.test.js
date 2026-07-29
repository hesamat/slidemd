import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  parseAiResponse,
  slidesToMarkdown,
  buildMessages,
  extractDirectives,
  restoreDirectives,
  estimateMaxTokens,
  buildDeckSummary,
  buildBatchMessages,
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

  it("trusts AI layout choices", () => {
    const slides = [{ layout: "two-column", content: "@main\n- Item 1" }];
    const orig = [{ layout: "header-content", background: "", theme: "" }];
    const result = restoreDirectives(slides, orig);
    expect(result[0].layout).toBe("two-column");
  });

  it("prefers original bg/theme over AI", () => {
    const slides = [{ layout: "focus", background: "red", theme: "light", content: "@main\n- Hi" }];
    const orig = [{ layout: "", background: "blue", theme: "dark" }];
    const result = restoreDirectives(slides, orig);
    expect(result[0].background).toBe("blue");
    expect(result[0].theme).toBe("dark");
  });

  it("falls back to AI values when no original", () => {
    const slides = [{ layout: "focus", background: "red", theme: "light", content: "@main\n- Hi" }];
    const result = restoreDirectives(slides, []);
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

describe("buildMessages", () => {
  it("strips frontmatter from markdown in fix mode", () => {
    const md =
      "layout: header-content\nbackground: #fff\ntheme: dark\n@header\n## Title\n\n@main\n- Item";
    const { user } = buildMessages(md, "fix");
    expect(user).toContain("@header");
    expect(user).toContain("- Item");
    expect(user).not.toContain("layout:");
    expect(user).not.toContain("background:");
    expect(user).not.toContain("theme:");
  });

  it("keeps background and theme in generate mode", () => {
    const md =
      "layout: header-content\nbackground: #fff\ntheme: dark\n@header\n## Title\n\n@main\n- Item";
    const { user } = buildMessages(md, "generate");
    expect(user).toContain("@header");
    expect(user).toContain("- Item");
    expect(user).toContain("background: #fff");
    expect(user).toContain("theme: dark");
    // Layout should be stripped from the input markdown (only kept in prompt examples)
    expect(user).not.toContain("layout: header-content");
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

describe("estimateMaxTokens", () => {
  it("returns at least 16000 without reasoning", () => {
    const md =
      "layout: header-content\n@header\n## Hi\n\n---\n\nlayout: header-content\n@header\n## Bye";
    expect(estimateMaxTokens(md, "fix")).toBeGreaterThanOrEqual(16000);
  });

  it("returns at least 64000 with reasoning", () => {
    const md = "a".repeat(1000);
    const result = estimateMaxTokens(md, "fix", { useReasoning: true });
    expect(result).toBeGreaterThanOrEqual(64000);
  });

  it("scales with input size for fix mode", () => {
    const small = "a".repeat(1000);
    const large = "a".repeat(100000);
    expect(estimateMaxTokens(large, "fix")).toBeGreaterThan(estimateMaxTokens(small, "fix"));
  });

  it("scales with input size for generate mode", () => {
    const small = "a".repeat(1000);
    const large = "a".repeat(100000);
    expect(estimateMaxTokens(large, "generate")).toBeGreaterThan(
      estimateMaxTokens(small, "generate"),
    );
  });

  it("generate mode estimates more tokens than fix mode", () => {
    const md = "a".repeat(100000);
    expect(estimateMaxTokens(md, "generate")).toBeGreaterThan(estimateMaxTokens(md, "fix"));
  });

  it("reasoning mode estimates 3x more tokens than non-reasoning", () => {
    const md = "a".repeat(100000);
    const without = estimateMaxTokens(md, "fix");
    const withReasoning = estimateMaxTokens(md, "fix", { useReasoning: true });
    expect(withReasoning).toBeGreaterThan(without * 2);
  });

  it("uses modelMaxOutput as upper bound when provided", () => {
    const md = "a".repeat(500000);
    const result = estimateMaxTokens(md, "generate", { modelMaxOutput: 50000 });
    expect(result).toBeLessThanOrEqual(50000);
  });

  it("falls back to 128000 when modelMaxOutput is null", () => {
    const md = "a".repeat(500000);
    const result = estimateMaxTokens(md, "generate", { modelMaxOutput: null });
    expect(result).toBeLessThanOrEqual(128000);
  });

  it("falls back to 128000 when options are omitted", () => {
    const md = "a".repeat(500000);
    const result = estimateMaxTokens(md, "generate");
    expect(result).toBeLessThanOrEqual(128000);
  });

  it("respects high modelMaxOutput for large decks", () => {
    const md = "a".repeat(500000);
    const result = estimateMaxTokens(md, "generate", { modelMaxOutput: 384000 });
    expect(result).toBeGreaterThan(128000);
    expect(result).toBeLessThanOrEqual(384000);
  });

  it("reasoning + high modelMaxOutput allows large estimates", () => {
    const md = "a".repeat(200000);
    const result = estimateMaxTokens(md, "generate", {
      modelMaxOutput: 384000,
      useReasoning: true,
    });
    expect(result).toBeGreaterThan(64000);
    expect(result).toBeLessThanOrEqual(384000);
  });
});

describe("buildDeckSummary", () => {
  it("produces correct outline with slide count and layouts", () => {
    const md =
      "layout: header-content\n@header\n## Intro\n\n@main\n- Hi\n\n---\n\nlayout: two-column\n@header\n## Overview\n\n@main\n- Left\n\n@media\n- Right";
    const summary = buildDeckSummary(md);
    expect(summary).toContain("Deck: 2 slides");
    expect(summary).toContain("Layouts: header-content, two-column");
    expect(summary).toContain("1. [header-content] Intro");
    expect(summary).toContain("2. [two-column] Overview");
  });

  it("detects code blocks, diagrams, and images", () => {
    const md =
      "layout: header-content\n@main\n```\nconsole.log('hi')\n```\n\n---\n\nlayout: header-content\n@main\n[Diagram: A, B]\n\n---\n\nlayout: media-span\n@media\n<img src=\"pic.png\">";
    const summary = buildDeckSummary(md);
    expect(summary).toContain("Features: code blocks, diagrams, images");
  });

  it("handles single slide", () => {
    const md = "layout: title-slide\n@title\n# Welcome";
    const summary = buildDeckSummary(md);
    expect(summary).toContain("Deck: 1 slides");
    expect(summary).toContain("1. [title-slide] Welcome");
  });
});

describe("buildBatchMessages", () => {
  const md = Array.from(
    { length: 12 },
    (_, i) => `layout: header-content\n@header\n## Slide ${i + 1}\n\n@main\n- Content ${i + 1}`,
  ).join("\n\n---\n\n");

  it("fix mode: sends chunk only, not full markdown", () => {
    const { user } = buildBatchMessages(md, "fix", 0, 4, 12);
    expect(user).toContain("## Slide 1");
    expect(user).toContain("## Slide 4");
    // Right neighbor (slide 5) is included as context, but slides 6+ are not
    expect(user).toContain("## Slide 5");
    expect(user).not.toContain("## Slide 6");
    expect(user).not.toContain("## Slide 12");
  });

  it("fix mode: includes neighbor context on left edge", () => {
    const { user } = buildBatchMessages(md, "fix", 4, 8, 12);
    expect(user).toContain("context: do not return");
    expect(user).toContain("## Slide 4");
    expect(user).toContain("## Slide 5");
    expect(user).toContain("## Slide 8");
    expect(user).toContain("## Slide 9");
  });

  it("fix mode: no left neighbor for first batch", () => {
    const { user } = buildBatchMessages(md, "fix", 0, 4, 12);
    const contextMatches = user.match(/context: do not return/g);
    expect(contextMatches).toHaveLength(1); // only right neighbor
  });

  it("fix mode: no right neighbor for last batch", () => {
    const { user } = buildBatchMessages(md, "fix", 8, 12, 12);
    const contextMatches = user.match(/context: do not return/g);
    expect(contextMatches).toHaveLength(1); // only left neighbor
  });

  it("fix mode: no neighbors for middle batch with both edges", () => {
    const { user } = buildBatchMessages(md, "fix", 4, 8, 12);
    const contextMatches = user.match(/context: do not return/g);
    expect(contextMatches).toHaveLength(2); // both left and right
  });

  it("generate mode: includes deck summary prefix", () => {
    const { user } = buildBatchMessages(md, "generate", 0, 4, 12, "Deck: 12 slides.");
    expect(user).toContain("Deck: 12 slides.");
    expect(user).toContain("## Slide 1");
    expect(user).toContain("## Slide 4");
  });

  it("generate mode: chunk only, not full markdown", () => {
    const { user } = buildBatchMessages(md, "generate", 4, 8, 12, "Deck: 12 slides.");
    expect(user).toContain("## Slide 5");
    expect(user).toContain("## Slide 8");
    expect(user).not.toContain("## Slide 9");
    expect(user).not.toContain("## Slide 1");
  });

  it("returns correct pagination instruction for fix mode", () => {
    const { user } = buildBatchMessages(md, "fix", 0, 4, 12);
    expect(user).toContain("Return exactly 4 slide(s)");
    expect(user).toContain("1:1");
  });

  it("returns correct pagination instruction for generate mode", () => {
    const { user } = buildBatchMessages(md, "generate", 0, 4, 12);
    expect(user).toContain("Return exactly 4 slide(s)");
  });
});
