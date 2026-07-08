// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { PptxExtractor } from "../data/pptx-extractor.js";

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

  it("converts ordered lists with per-item numbering", () => {
    const result = PptxExtractor.htmlToMarkdown("<ol><li>a</li><li>b</li><li>c</li></ol>");
    expect(result).toContain("1. a");
    expect(result).toContain("2. b");
    expect(result).toContain("3. c");
  });

  it("continues numbering across adjacent same-type lists (PowerPoint split list)", () => {
    const html = "<ol><li>a</li><li>b</li></ol><ol><li>c</li><li>d</li></ol>";
    const result = PptxExtractor.htmlToMarkdown(html);
    expect(result).toContain("1. a");
    expect(result).toContain("2. b");
    expect(result).toContain("3. c");
    expect(result).toContain("4. d");
  });

  it("honours HTML start attribute on ordered lists", () => {
    const html = '<ol start="5"><li>a</li><li>b</li><li>c</li></ol>';
    const result = PptxExtractor.htmlToMarkdown(html);
    expect(result).toContain("5. a");
    expect(result).toContain("6. b");
    expect(result).toContain("7. c");
  });

  it("restarts numbering across different list types", () => {
    const html = "<ol><li>a</li><li>b</li></ol><ul><li>c</li><li>d</li></ul>";
    const result = PptxExtractor.htmlToMarkdown(html);
    expect(result).toContain("1. a");
    expect(result).toContain("2. b");
    expect(result).toContain("- c");
    expect(result).toContain("- d");
  });
  it("converts nested lists emitted as siblings of <li> (PowerPoint style)", () => {
    const html = "<ol><li>a</li><li>b</li><ol><li>c</li><li>d</li></ol><li>e</li></ol>";
    const result = PptxExtractor.htmlToMarkdown(html);
    expect(result).toContain("1. a");
    expect(result).toContain("2. b");
    expect(result).toContain("  a. c");
    expect(result).toContain("  b. d");
    expect(result).toContain("3. e");
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
    const result = PptxExtractor.htmlToMarkdown("<p>a b</p>");
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

  it("handles bold monospace text — monospace wins over bold", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-family: Consolas; font-weight: bold;">code</span></p>',
    );
    expect(result).toContain("`code`");
    expect(result).not.toContain("**`code`**");
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

  it("detects h2 heading from medium font-size (30pt)", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-size: 30pt;">Subtitle</span></p>',
    );
    expect(result).toContain("## Subtitle");
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

describe("PptxExtractor.htmlToMarkdown indentation preservation", () => {
  it("preserves indentation in monospace code", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-family: Courier;">    # do some stuff</span></p>',
    );
    expect(result).toContain("`    # do some stuff`");
  });

  it("preserves indentation in multiple monospace lines", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-family: Courier;">line 1</span></p>' +
        '<p><span style="font-family: Courier;">    indented line</span></p>' +
        '<p><span style="font-family: Courier;">line 3</span></p>',
    );
    // Multiple lines are grouped into a fenced code block with indentation preserved
    expect(result).toContain("```\nline 1\n    indented line\nline 3\n```");
  });
});
