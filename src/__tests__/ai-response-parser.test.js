import { describe, it, expect } from "vitest";
import {
  parseAiResponse,
  slidesToMarkdown,
  areasToMarkdown,
  extractHeadings,
  extractJsonObject,
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

  it("recovers from JSON with raw, unescaped newlines inside content strings", () => {
    // Some models emit real line breaks inside JSON strings instead of \n.
    const raw =
      '{"slides":[{"layout":"header-content","content":"@header\n# Title\n\n@main\n- Point 1"}]}';
    const result = parseAiResponse(raw);
    expect(result).not.toBeNull();
    expect(result.slides[0].layout).toBe("header-content");
    expect(result.slides[0].content).toContain("@main");
    expect(result.slides[0].content).toContain("- Point 1");
  });

  it("does not corrupt already-correct \n escapes when recovering from raw newlines", () => {
    // Mixed: the model got some escapes right and inserted a raw newline.
    const raw =
      '{"slides":[{"layout":"header-content","content":"@header\\n# Title\n\n@main\\n- Point"}]}';
    const result = parseAiResponse(raw);
    expect(result).not.toBeNull();
    expect(result.slides[0].content).toContain("# Title");
    expect(result.slides[0].content).toContain("- Point");
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
    expect(result.slides[0].mediaFullBleed).toBe(true);
    expect(result.slides[0].content).not.toContain("media-span:");
  });

  it("extracts directives from markdown fallback with a leading batch comment", () => {
    const input = `<!-- SLIDE 8 (return this) -->
layout: two-column
theme: light
background: #f4f4f5

@header
# Title

@main
- Point`;
    const result = parseAiResponse(input);
    expect(result).not.toBeNull();
    expect(result.slides[0].layout).toBe("two-column");
    expect(result.slides[0].theme).toBe("light");
    expect(result.slides[0].background).toBe("#f4f4f5");
    expect(result.slides[0].content).toContain("# Title");
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
    const slides = [{ layout: "media-span-right", mediaFullBleed: true, content: "@media\nImage" }];
    const md = slidesToMarkdown(slides);
    expect(md).toContain("media-full-bleed: true");
  });

  it("strips SLIDE INDEX comments from content", () => {
    const slides = [{ content: "<!-- SLIDE INDEX 3 (return this) -->\n@header\n## Title" }];
    const md = slidesToMarkdown(slides);
    expect(md).not.toContain("<!-- SLIDE INDEX");
    expect(md).toContain("@header");
  });

  it("strips SLIDE n comments that omit INDEX", () => {
    const slides = [
      { content: "<!-- SLIDE 8 (return this) -->\nlayout: two-column\n@header\n## Title" },
    ];
    const md = slidesToMarkdown(slides);
    expect(md).not.toContain("<!-- SLIDE");
    expect(md).toContain("layout: two-column");
    expect(md).toContain("@header");
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

describe("extractJsonObject", () => {
  it("parses direct JSON", () => {
    const input = '{"chapters":[{"title":"Ch1","slides":[]}]}';
    const result = extractJsonObject(input, "chapters");
    expect(result).not.toBeNull();
    expect(result.parsed.chapters).toHaveLength(1);
  });

  it("extracts JSON from a code fence", () => {
    const input =
      'Here is the breakdown:\n```json\n{"chapters":[{"title":"Ch1","slides":[]}]}\n```\nDone.';
    const result = extractJsonObject(input, "chapters");
    expect(result).not.toBeNull();
    expect(result.parsed.chapters).toHaveLength(1);
  });

  it("extracts JSON from prose with stray braces", () => {
    const input =
      "Sure! Here {is} the breakdown you requested:\n" +
      '{"chapters":[{"title":"Ch1","slides":[{"title":"S1","intent":"Do X"}]}]}\n' +
      "Let me know if {you} need changes.";
    const result = extractJsonObject(input, "chapters");
    expect(result).not.toBeNull();
    expect(result.parsed.chapters).toHaveLength(1);
    expect(result.parsed.chapters[0].slides).toHaveLength(1);
  });

  it("handles braces inside JSON string values", () => {
    const input =
      "Here is the plan:\n" +
      '{"plan":[{"source":0,"action":"merge","note":"Use {curly} braces in code"}]}\n' +
      "Done.";
    const result = extractJsonObject(input, "plan");
    expect(result).not.toBeNull();
    expect(result.parsed.plan).toHaveLength(1);
    expect(result.parsed.plan[0].note).toContain("{curly}");
  });

  it("handles escaped quotes inside JSON string values", () => {
    const input =
      '{"chapters":[{"title":"Ch \\"quoted\\"","slides":[{"title":"S1","intent":"Say \\"hi\\""}]}]}';
    const result = extractJsonObject(input, "chapters");
    expect(result).not.toBeNull();
    expect(result.parsed.chapters[0].title).toBe('Ch "quoted"');
  });

  it("finds the last occurrence when key appears multiple times", () => {
    const input =
      'I considered {"chapters":[]} but decided on this:\n' +
      '{"chapters":[{"title":"Real","slides":[]}]}';
    const result = extractJsonObject(input, "chapters");
    expect(result).not.toBeNull();
    expect(result.parsed.chapters[0].title).toBe("Real");
  });

  it("returns null for text without JSON", () => {
    expect(extractJsonObject("Just prose, no JSON here.", "chapters")).toBeNull();
  });

  it("returns null for empty or non-string input", () => {
    expect(extractJsonObject(null, "chapters")).toBeNull();
    expect(extractJsonObject(undefined, "chapters")).toBeNull();
    expect(extractJsonObject(42, "chapters")).toBeNull();
  });

  it("extracts slides key (used by parseAiResponse)", () => {
    const input =
      'Here are your slides:\n```json\n{"slides":[{"layout":"header-content","content":"# Hi"}]}\n```';
    const result = extractJsonObject(input, "slides");
    expect(result).not.toBeNull();
    expect(result.parsed.slides).toHaveLength(1);
  });

  it("handles nested objects with braces in values", () => {
    const input =
      '{"chapters":[{"title":"Ch1","slides":[{"title":"S1","intent":"Use {a: 1, b: 2} syntax"}]}]}';
    const result = extractJsonObject(input, "chapters");
    expect(result).not.toBeNull();
    expect(result.parsed.chapters[0].slides[0].intent).toContain("{a: 1, b: 2}");
  });

  it("does not infinite-loop when the key is at position 0 without an opening brace", () => {
    // A truncated reply starting with a bare key — no opening { before it.
    // This used to spin forever because searchPos went to -1, then
    // lastIndexOf clamped to 0 and matched the same key again.
    const input = '"chapters": [{"title":"Ch1","slides":[]}]}';
    const result = extractJsonObject(input, "chapters");
    // Should either find the JSON (if the brace walk succeeds from the
    // { after "chapters":) or return null — but must NOT hang.
    expect(typeof result).toBe("object");
  });

  it("does not infinite-loop on a bare key with no braces at all", () => {
    const input = '"chapters" is what you asked for but I have no JSON';
    const result = extractJsonObject(input, "chapters");
    expect(result).toBeNull();
  });

  it("finds nested slides inside a wrapper object", () => {
    // Some models wrap the response: {"response": {"slides": [...]}}
    // The direct parse succeeds but the key is not at the top level,
    // so the brace walk must dig it out.
    const input = JSON.stringify({
      response: { slides: [{ layout: "header-content", content: "# Hi" }] },
    });
    const result = extractJsonObject(input, "slides");
    expect(result).not.toBeNull();
    expect(result.parsed.slides).toHaveLength(1);
    expect(result.parsed.slides[0].layout).toBe("header-content");
  });

  it("does not accept a direct parse that lacks the requested key", () => {
    const input = '{"response": {"chapters": []}}';
    const result = extractJsonObject(input, "chapters");
    // The direct parse succeeds but "chapters" is not at the top level.
    // The brace walk should find the inner object.
    expect(result).not.toBeNull();
    expect(result.parsed.chapters).toEqual([]);
  });

  it("finds enclosing brace when nested objects appear before the key (outline shape)", () => {
    // This is the exact outline schema shape: visualSystem with nested
    // palette/imagery objects BEFORE the "chapters" key, wrapped in prose.
    // The backward brace walk must skip the sibling { } objects and find
    // the enclosing top-level {.
    const outline = {
      plan: "Reimagined plan.",
      visualSystem: {
        palette: { base: "#0f172a", accent: "#3b82f6", highlight: "#ffffff" },
      },
      keepImages: [0],
      firstSlideIdentity: "COMP 1510 202630",
      chapters: [{ title: "Chapter 1", summary: "Hook.", suggestedSlideCount: 3 }],
    };
    const input = `Here is the outline:\n${JSON.stringify(outline)}\nHope this helps!`;
    const result = extractJsonObject(input, "chapters");
    expect(result).not.toBeNull();
    expect(result.parsed.chapters).toHaveLength(1);
    expect(result.parsed.plan).toBe("Reimagined plan.");
    expect(result.parsed.visualSystem.palette.highlight).toBe("#ffffff");
  });

  it("finds enclosing brace with deeply nested objects before the key", () => {
    const payload = {
      a: { b: { c: { d: "deep" } } },
      chapters: [{ title: "Ch1" }],
    };
    const input = `Sure!\n${JSON.stringify(payload)}\nDone.`;
    const result = extractJsonObject(input, "chapters");
    expect(result).not.toBeNull();
    expect(result.parsed.chapters).toHaveLength(1);
    expect(result.parsed.a.b.c.d).toBe("deep");
  });

  it("handles escaped quotes in string values during backward scan", () => {
    const payload = {
      note: 'say "hi"',
      chapters: [{ title: 'Ch "quoted"' }],
    };
    const input = `Here:\n${JSON.stringify(payload)}\nDone.`;
    const result = extractJsonObject(input, "chapters");
    expect(result).not.toBeNull();
    expect(result.parsed.chapters[0].title).toBe('Ch "quoted"');
  });

  it("continues search when a matched object has non-array slides value", () => {
    // parseAiResponse should skip {"slides": "..."} and keep looking.
    const input =
      '{"slides": "not an array"}\n---\n{"slides": [{"layout": "header-content", "content": "# Hi"}]}';
    const result = parseAiResponse(input);
    expect(result).not.toBeNull();
    expect(result.slides).toHaveLength(1);
    expect(result.slides[0].layout).toBe("header-content");
  });
});
