import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  parseAiResponse,
  slidesToMarkdown,
  buildMessages,
  extractDirectives,
  extractHeadings,
  restoreDirectives,
  injectDirectives,
  estimateMaxTokens,
  buildDeckSummary,
  buildBatchMessages,
  validateFixOutput,
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

describe("extractHeadings", () => {
  it("extracts first heading from each slide", () => {
    const md =
      "layout: header-content\n@header\n## Intro\n\n@main\n- Hi\n\n---\n\nlayout: two-column\n@header\n## Overview\n\n@main\n- Left";
    const result = extractHeadings(md);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("Intro");
    expect(result[1]).toBe("Overview");
  });

  it("returns empty string for slides without headings", () => {
    const md =
      "layout: focus\n@main\n- Just a bullet\n\n---\n\nlayout: focus\n@main\n- Another bullet";
    const result = extractHeadings(md);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("");
    expect(result[1]).toBe("");
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

describe("buildMessages", () => {
  it("strips frontmatter from markdown in fix mode but keeps layout", () => {
    const md =
      "layout: header-content\nbackground: #fff\ntheme: dark\n@header\n## Title\n\n@main\n- Item";
    const { user } = buildMessages(md, "fix");
    expect(user).toContain("@header");
    expect(user).toContain("- Item");
    // Layout is kept so AI can preserve it
    const markdownSection = user.split("Input markdown:")[1] || "";
    expect(markdownSection).toContain("layout: header-content");
    // Background and theme are stripped (restored post-AI)
    expect(markdownSection).not.toContain("background: #fff");
    expect(markdownSection).not.toContain("theme: dark");
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
    // Both the outer layout and the code block content are kept
    expect(user).toContain("layout: header-content");
    expect(user).toContain("layout: two-column");
    expect(user).toContain("background: #fff");
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
    expect(user).toContain("CONTEXT SLIDE");
    expect(user).toContain("## Slide 4");
    expect(user).toContain("## Slide 5");
    expect(user).toContain("## Slide 8");
    expect(user).toContain("## Slide 9");
  });

  it("fix mode: no left neighbor for first batch", () => {
    const { user } = buildBatchMessages(md, "fix", 0, 4, 12);
    const contextMatches = user.match(/CONTEXT SLIDE/g);
    expect(contextMatches).toHaveLength(1); // only right neighbor
  });

  it("fix mode: no right neighbor for last batch", () => {
    const { user } = buildBatchMessages(md, "fix", 8, 12, 12);
    const contextMatches = user.match(/CONTEXT SLIDE/g);
    expect(contextMatches).toHaveLength(1); // only left neighbor
  });

  it("fix mode: no neighbors for middle batch with both edges", () => {
    const { user } = buildBatchMessages(md, "fix", 4, 8, 12);
    const contextMatches = user.match(/CONTEXT SLIDE/g);
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
    expect(user).toContain("CRITICAL: You must return EXACTLY 4 slide(s)");
    expect(user).toContain("indices 0 through 3");
  });

  it("returns correct pagination instruction for generate mode", () => {
    const { user } = buildBatchMessages(md, "generate", 0, 4, 12);
    expect(user).toContain("Return exactly 4 slide(s)");
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

describe("validateFixOutput", () => {
  it("returns valid when slide count and layouts match", () => {
    const orig = [
      { layout: "header-content", background: "", theme: "" },
      { layout: "two-column", background: "", theme: "" },
    ];
    const fixed = [
      { layout: "header-content", content: "@header\n## Title\n\n@main\n- Item" },
      { layout: "two-column", content: "@header\n## Overview\n\n@main\n- Left\n\n@media\n- Right" },
    ];
    const result = validateFixOutput(orig, fixed);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects slide count mismatch", () => {
    const orig = [
      { layout: "header-content", background: "", theme: "" },
      { layout: "two-column", background: "", theme: "" },
    ];
    const fixed = [{ layout: "header-content", content: "@header\n## Title" }];
    const result = validateFixOutput(orig, fixed);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Slide count mismatch");
    expect(result.errors[0]).toContain("2 input → 1 output");
  });

  it("detects layout change", () => {
    const orig = [{ layout: "media-span", background: "", theme: "" }];
    const fixed = [{ layout: "two-column", content: "@header\n## Title\n\n@main\n- Item" }];
    const result = validateFixOutput(orig, fixed);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('layout changed "media-span" → "two-column"');
  });

  it("detects heading mismatch against original", () => {
    const orig = [
      { layout: "header-content", background: "", theme: "" },
      { layout: "header-content", background: "", theme: "" },
    ];
    const fixed = [
      { layout: "header-content", content: "@header\n## Module Design\n\n@main\n- Point 1" },
      { layout: "two-column", content: "@header\n## Different Title\n\n@main\n- Point 2" },
    ];
    const result = validateFixOutput(orig, fixed, {
      originalHeadings: ["Module Design", "Other Slide"],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("heading mismatch"))).toBe(true);
  });

  it("allows slides with same heading when original matches", () => {
    const orig = [
      { layout: "media-span", background: "", theme: "" },
      { layout: "media-span", background: "", theme: "" },
    ];
    const fixed = [
      {
        layout: "media-span",
        content: '@header\n## Example\n\n@media\n<img src="images/a.jpeg">',
      },
      {
        layout: "media-span",
        content: '@header\n## Example\n\n@media\n<img src="images/b.jpeg">',
      },
    ];
    const result = validateFixOutput(orig, fixed, {
      originalHeadings: ["Example", "Example"],
    });
    expect(result.valid).toBe(true);
  });

  it("allows empty headings (no heading to compare)", () => {
    const orig = [
      { layout: "focus", background: "", theme: "" },
      { layout: "focus", background: "", theme: "" },
    ];
    const fixed = [
      { layout: "focus", content: "@main\n- Just a bullet" },
      { layout: "focus", content: "@main\n- Another bullet" },
    ];
    const result = validateFixOutput(orig, fixed, {
      originalHeadings: ["", ""],
    });
    expect(result.valid).toBe(true);
  });

  it("reports multiple errors at once", () => {
    const orig = [
      { layout: "media-span", background: "", theme: "" },
      { layout: "header-content", background: "", theme: "" },
    ];
    const fixed = [
      { layout: "two-column", content: "@header\n## Title A\n\n@main\n- Item" },
      { layout: "header-content", content: "@header\n## Title B\n\n@main\n- Other" },
    ];
    const result = validateFixOutput(orig, fixed, {
      originalHeadings: ["Title A", "Title C"],
    });
    expect(result.valid).toBe(false);
    // Should have layout change error + heading mismatch error
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("skips layout check when skipLayoutCheck is true", () => {
    const orig = [
      { layout: "media-span", background: "", theme: "" },
      { layout: "focus", background: "", theme: "" },
    ];
    const fixed = [
      { layout: "two-column", content: "@header\n## Title A\n\n@main\n- Item" },
      { layout: "header-content", content: "@header\n## Title B\n\n@main\n- Other" },
    ];
    const result = validateFixOutput(orig, fixed, {
      skipLayoutCheck: true,
      originalHeadings: ["Title A", "Title B"],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("still checks slide count with skipLayoutCheck", () => {
    const orig = [
      { layout: "media-span", background: "", theme: "" },
      { layout: "focus", background: "", theme: "" },
    ];
    const fixed = [{ layout: "two-column", content: "@header\n## Title" }];
    const result = validateFixOutput(orig, fixed, { skipLayoutCheck: true });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Slide count mismatch");
  });

  it("still checks heading match with skipLayoutCheck", () => {
    const orig = [
      { layout: "media-span", background: "", theme: "" },
      { layout: "focus", background: "", theme: "" },
    ];
    const fixed = [
      { layout: "two-column", content: "@header\n## Title A\n\n@main\n- A" },
      { layout: "header-content", content: "@header\n## Title B\n\n@main\n- B" },
    ];
    const result = validateFixOutput(orig, fixed, {
      skipLayoutCheck: true,
      originalHeadings: ["Title A", "Wrong Title"],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("heading mismatch"))).toBe(true);
  });
});
