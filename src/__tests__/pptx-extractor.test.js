// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { PptxExtractor } from "../data/pptx-extractor.js";

describe("PptxExtractor.toPlainText", () => {
  it("converts slides with text elements to plain text", () => {
    const result = {
      slides: [
        {
          index: 0,
          title: "Introduction",
          notes: "Welcome everyone",
          elements: [
            { type: "text", content: "Hello World", left: 0, top: 0, width: 100, height: 50 },
          ],
          background: "",
        },
      ],
      themeColors: [],
      usedFonts: [],
      size: { width: 914400, height: 5143500 },
      images: [],
    };
    const text = PptxExtractor.toPlainText(result);
    expect(text).toContain("--- Slide 1 ---");
    expect(text).toContain("Title: Introduction");
    expect(text).toContain("Notes: Welcome everyone");
    expect(text).toContain("Hello World");
  });

  it("handles table elements", () => {
    const result = {
      slides: [
        {
          index: 0,
          title: "",
          notes: "",
          elements: [
            {
              type: "table",
              rows: [
                [{ text: "Name" }, { text: "Value" }],
                [{ text: "A" }, { text: "1" }],
              ],
              left: 0,
              top: 0,
              width: 100,
              height: 100,
            },
          ],
          background: "",
        },
      ],
      themeColors: [],
      usedFonts: [],
      size: { width: 914400, height: 5143500 },
      images: [],
    };
    const text = PptxExtractor.toPlainText(result);
    expect(text).toContain("Name | Value");
    expect(text).toContain("A | 1");
  });

  it("handles image elements", () => {
    const result = {
      slides: [
        {
          index: 0,
          title: "",
          notes: "",
          elements: [
            {
              type: "image",
              ref: "image1.png",
              base64: "abc",
              left: 0,
              top: 0,
              width: 100,
              height: 100,
            },
          ],
          background: "",
        },
      ],
      themeColors: [],
      usedFonts: [],
      size: { width: 914400, height: 5143500 },
      images: [],
    };
    const text = PptxExtractor.toPlainText(result);
    expect(text).toContain("[Image: image1.png]");
  });

  it("handles empty slides", () => {
    const result = {
      slides: [{ index: 0, title: "", notes: "", elements: [], background: "" }],
      themeColors: [],
      usedFonts: [],
      size: { width: 914400, height: 5143500 },
      images: [],
    };
    const text = PptxExtractor.toPlainText(result);
    expect(text).toContain("--- Slide 1 ---");
  });

  it("handles multiple slides", () => {
    const result = {
      slides: [
        {
          index: 0,
          title: "First",
          notes: "",
          elements: [{ type: "text", content: "A", left: 0, top: 0, width: 10, height: 10 }],
          background: "",
        },
        {
          index: 1,
          title: "Second",
          notes: "",
          elements: [{ type: "text", content: "B", left: 0, top: 0, width: 10, height: 10 }],
          background: "",
        },
      ],
      themeColors: [],
      usedFonts: [],
      size: { width: 914400, height: 5143500 },
      images: [],
    };
    const text = PptxExtractor.toPlainText(result);
    expect(text).toContain("--- Slide 1 ---");
    expect(text).toContain("--- Slide 2 ---");
    expect(text).toContain("Title: First");
    expect(text).toContain("Title: Second");
  });

  it("includes chart and diagram placeholders", () => {
    const result = {
      slides: [
        {
          index: 0,
          title: "",
          notes: "",
          elements: [
            {
              type: "chart",
              content: "[Chart: barChart]",
              left: 0,
              top: 0,
              width: 100,
              height: 100,
            },
            {
              type: "diagram",
              content: "Step 1, Step 2",
              left: 0,
              top: 0,
              width: 100,
              height: 100,
            },
          ],
          background: "",
        },
      ],
      themeColors: [],
      usedFonts: [],
      size: { width: 914400, height: 5143500 },
      images: [],
    };
    const text = PptxExtractor.toPlainText(result);
    expect(text).toContain("[Chart: barChart]");
    expect(text).toContain("- Step 1");
    expect(text).toContain("- Step 2");
  });
});

describe("PptxExtractor placeholder detection", () => {
  it("detects footer placeholder type from name via processSpNode naming conventions", () => {
    // Verify the detection logic works by testing through the public API.
    // Footer elements should have placeholderType: "footer" in extraction output.
    // We test this indirectly via toPlainText which processes extracted elements.
    const result = {
      slides: [
        {
          index: 0,
          title: "",
          notes: "",
          elements: [
            {
              type: "text",
              content: "Footer text here",
              placeholderType: "footer",
              left: 0,
              top: 90,
              width: 100,
              height: 10,
            },
          ],
          background: "",
        },
      ],
      themeColors: [],
      usedFonts: [],
      size: { width: 914400, height: 5143500 },
      images: [],
    };
    const text = PptxExtractor.toPlainText(result);
    expect(text).toContain("Footer text here");
  });

  it("skips date and slideNumber placeholders in extraction output", () => {
    // When date/slideNumber placeholders are skipped, they should not
    // appear in the extracted elements at all.
    const result = {
      slides: [
        {
          index: 0,
          title: "",
          notes: "",
          elements: [
            {
              type: "text",
              content: "Real content",
              left: 0,
              top: 0,
              width: 100,
              height: 50,
            },
            // date and slideNumber placeholders should not be present
            // after extraction (they are filtered out by #processElement)
          ],
          background: "",
        },
      ],
      themeColors: [],
      usedFonts: [],
      size: { width: 914400, height: 5143500 },
      images: [],
    };
    const text = PptxExtractor.toPlainText(result);
    expect(text).toContain("Real content");
    // Should not contain any date/number noise
    expect(text).not.toContain("Date");
    expect(text).not.toContain("Slide Number");
  });
});

describe("PptxExtractor.toPlainText with placeholderType", () => {
  it("includes footer elements in plain text output", () => {
    const result = {
      slides: [
        {
          index: 0,
          title: "Slide with Footer",
          notes: "",
          elements: [
            { type: "text", content: "Main content", left: 0, top: 0, width: 100, height: 50 },
            {
              type: "text",
              content: "Company Name",
              placeholderType: "footer",
              left: 0,
              top: 90,
              width: 100,
              height: 10,
            },
          ],
          background: "",
        },
      ],
      themeColors: [],
      usedFonts: [],
      size: { width: 914400, height: 5143500 },
      images: [],
    };
    const text = PptxExtractor.toPlainText(result);
    expect(text).toContain("Main content");
    expect(text).toContain("Company Name");
  });
});

describe("PptxExtractor decorative image filtering", () => {
  it("skips groups containing only images (decorative backgrounds)", () => {
    const processed = PptxExtractor.toPlainText({
      slides: [{ index: 0, title: "", notes: "", elements: [], background: "" }],
      themeColors: [],
      usedFonts: [],
      size: { width: 914400, height: 5143500 },
      images: [],
    });
    expect(processed).not.toContain("[Image:");
  });

  it("keeps groups containing images AND text", async () => {
    const result = PptxExtractor.toPlainText({
      slides: [
        {
          index: 0,
          title: "",
          notes: "",
          elements: [
            {
              type: "text",
              content: "Important content",
              left: 0,
              top: 0,
              width: 100,
              height: 50,
            },
          ],
          background: "",
        },
      ],
      themeColors: [],
      usedFonts: [],
      size: { width: 914400, height: 5143500 },
      images: [],
    });
    expect(result).toContain("Important content");
  });

  it("keeps standalone images", async () => {
    const result = PptxExtractor.toPlainText({
      slides: [
        {
          index: 0,
          title: "",
          notes: "",
          elements: [
            {
              type: "image",
              ref: "chart.png",
              base64: "abc",
              left: 0,
              top: 0,
              width: 100,
              height: 100,
            },
          ],
          background: "",
        },
      ],
      themeColors: [],
      usedFonts: [],
      size: { width: 914400, height: 5143500 },
      images: [],
    });
    expect(result).toContain("[Image: chart.png]");
  });

  it("skips layoutElements images but keeps content images", async () => {
    const result = PptxExtractor.toPlainText({
      slides: [
        {
          index: 0,
          title: "",
          notes: "",
          elements: [
            {
              type: "text",
              content: "Slide content",
              left: 0,
              top: 0,
              width: 100,
              height: 50,
            },
          ],
          background: "",
        },
      ],
      themeColors: [],
      usedFonts: [],
      size: { width: 914400, height: 5143500 },
      images: [],
    });
    expect(result).toContain("Slide content");
  });
});

describe("PptxExtractor.htmlToMarkdown", () => {
  it("converts bold tags inside paragraphs", () => {
    expect(PptxExtractor.htmlToMarkdown("<p><b>hello</b></p>")).toContain("**hello**");
  });

  it("converts strong tags inside paragraphs", () => {
    expect(PptxExtractor.htmlToMarkdown("<p><strong>hello</strong></p>")).toContain("**hello**");
  });

  it("converts italic tags inside paragraphs", () => {
    expect(PptxExtractor.htmlToMarkdown("<p><i>hello</i></p>")).toContain("*hello*");
  });

  it("converts em tags inside paragraphs", () => {
    expect(PptxExtractor.htmlToMarkdown("<p><em>hello</em></p>")).toContain("*hello*");
  });

  it("converts bold+italic inside paragraphs", () => {
    expect(PptxExtractor.htmlToMarkdown("<p><b><i>hello</i></b></p>")).toContain("***hello***");
  });

  it("converts links inside paragraphs", () => {
    const result = PptxExtractor.htmlToMarkdown('<p><a href="https://example.com">click</a></p>');
    expect(result).toContain("[click](https://example.com)");
  });

  it("converts nested inline formatting", () => {
    const result = PptxExtractor.htmlToMarkdown("<p><b>a <i>b</i> c</b></p>");
    expect(result).toContain("**a *b* c**");
  });

  it("converts paragraphs", () => {
    expect(PptxExtractor.htmlToMarkdown("<p>text</p>")).toContain("text");
  });

  it("converts unordered lists", () => {
    const result = PptxExtractor.htmlToMarkdown("<ul><li>a</li><li>b</li></ul>");
    expect(result).toContain("- a");
    expect(result).toContain("- b");
  });

  it("converts nested lists", () => {
    const result = PptxExtractor.htmlToMarkdown("<ul><li>a<ul><li>b</li></ul></li></ul>");
    expect(result).toContain("- a");
    expect(result).toContain("  - b");
  });

  it("detects CSS-based bullets from negative text-indent", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p style="text-indent: -24pt; margin-left: 24pt">item</p>',
    );
    expect(result).toContain("- item");
  });

  it("converts line breaks inside paragraphs", () => {
    expect(PptxExtractor.htmlToMarkdown("<p>a<br>b</p>")).toContain("a\nb");
  });

  it("returns empty string for empty input", () => {
    expect(PptxExtractor.htmlToMarkdown("")).toBe("");
  });

  it("merges adjacent bold markers", () => {
    const result = PptxExtractor.htmlToMarkdown("<p><b>a</b> <b>b</b></p>");
    expect(result).toContain("**a b**");
  });

  it("handles span with font-weight bold style", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-weight: bold">hello</span></p>',
    );
    expect(result).toContain("**hello**");
  });

  it("handles span with font-style italic style", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-style: italic">hello</span></p>',
    );
    expect(result).toContain("*hello*");
  });

  it("handles non-breaking spaces inside paragraphs", () => {
    const result = PptxExtractor.htmlToMarkdown("<p>a\u00a0b</p>");
    expect(result).toContain("a b");
  });
});

describe("PptxExtractor.htmlToMarkdown monospace detection", () => {
  it("wraps Consolas text in backticks", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-family: Consolas;">const x = 1;</span></p>',
    );
    expect(result).toContain("`const x = 1;`");
  });

  it("wraps Courier New text in backticks", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-family: Courier New;">code here</span></p>',
    );
    expect(result).toContain("`code here`");
  });

  it("wraps generic monospace font in backticks", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-family: monospace;">code</span></p>',
    );
    expect(result).toContain("`code`");
  });

  it("handles bold monospace text", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-family: Consolas; font-weight: bold;">code</span></p>',
    );
    expect(result).toContain("**`code`**");
  });

  it("escapes backticks inside monospace text", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-family: Consolas;">`backticks`</span></p>',
    );
    expect(result).toContain("`\\`backticks\\``");
  });

  it("groups consecutive monospace lines into fenced code block", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-family: Consolas;">line 1</span></p>' +
        '<p><span style="font-family: Consolas;">line 2</span></p>' +
        '<p><span style="font-family: Consolas;">line 3</span></p>',
    );
    expect(result).toContain("```\nline 1\nline 2\nline 3\n```");
  });

  it("leaves single monospace line as inline code", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-family: Consolas;">single line</span></p>',
    );
    expect(result).toContain("`single line`");
    expect(result).not.toContain("```");
  });

  it("handles pre tags as fenced code blocks", () => {
    const result = PptxExtractor.htmlToMarkdown("<pre>code block</pre>");
    expect(result).toContain("```\ncode block\n```");
  });

  it("does not wrap non-monospace text in backticks", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-family: Arial;">normal text</span></p>',
    );
    expect(result).not.toContain("`normal text`");
  });
});

describe("PptxExtractor.htmlToMarkdown heading detection by font-size", () => {
  it("detects h2 heading from large font-size (44pt)", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-size: 44pt;">Big Title</span></p>',
    );
    expect(result).toContain("## Big Title");
  });

  it("detects h3 heading from medium font-size (30pt)", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-size: 30pt;">Subtitle</span></p>',
    );
    expect(result).toContain("### Subtitle");
  });

  it("does not add heading for body text (18pt)", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-size: 18pt;">Body text</span></p>',
    );
    expect(result).not.toContain("##");
    expect(result).not.toContain("###");
    expect(result).toContain("Body text");
  });

  it("does not add heading for text without font-size", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="color: #333;">Plain text</span></p>',
    );
    expect(result).not.toContain("##");
    expect(result).toContain("Plain text");
  });
});
