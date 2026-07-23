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

  it("continues numbering across split lists with <p> separators (PPTX sub-items)", () => {
    // PowerPoint often splits a numbered list into single-item <ol> blocks
    // with <p> sub-items (Windows/Unix variants) between them.
    const html =
      "<ol><li><p>Clear the terminal screen:</p></li></ol>" +
      "<p>Windows:    cls</p>" +
      "<p>Unix:    clear</p>" +
      "<ol><li><p>Display the name of the current directory:</p></li></ol>" +
      "<p>Windows:    cd</p>" +
      "<p>Unix:    pwd</p>" +
      "<ol><li><p>Print contents of current directory:</p></li></ol>" +
      "<p>Windows:    dir</p>" +
      "<p>Unix:    ls</p>";
    const result = PptxExtractor.htmlToMarkdown(html);
    expect(result).toContain("1. Clear the terminal screen:");
    expect(result).toContain("2. Display the name of the current directory:");
    expect(result).toContain("3. Print contents of current directory:");
  });

  it("continues numbering with real PPTX HTML (text-indent bullet sub-items)", () => {
    // Real PPTX HTML: sub-items have text-indent: -18pt which triggers CSS bullet detection
    const html =
      '<ol><li><p style="text-align: left;line-height: 0.9;margin-top: 10pt;"><span style="color: #000000;font-size: 20pt;font-family: Aptos;">Clear the terminal screen:</span></p></li></ol>' +
      '<p style="text-align: left;line-height: 0.9;margin-top: 5pt;margin-left: 54pt;text-indent: -18pt;"><span style="color: #000000;font-size: 20pt;font-family: Aptos;">Windows: cls</span></p>' +
      '<p style="text-align: left;line-height: 0.9;margin-top: 5pt;margin-left: 54pt;text-indent: -18pt;"><span style="color: #000000;font-size: 20pt;font-family: Aptos;">Unix: clear</span></p>' +
      '<ol><li><p style="text-align: left;line-height: 0.9;margin-top: 10pt;"><span style="color: #000000;font-size: 20pt;font-family: Aptos;">Display the name of the current directory:</span></p></li></ol>' +
      '<p style="text-align: left;line-height: 0.9;margin-top: 5pt;margin-left: 54pt;text-indent: -18pt;"><span style="color: #000000;font-size: 20pt;font-family: Aptos;">Windows: cd</span></p>' +
      '<p style="text-align: left;line-height: 0.9;margin-top: 5pt;margin-left: 54pt;text-indent: -18pt;"><span style="color: #000000;font-size: 20pt;font-family: Aptos;">Unix: pwd</span></p>' +
      '<ol><li><p style="text-align: left;line-height: 0.9;margin-top: 10pt;"><span style="color: #000000;font-size: 20pt;font-family: Aptos;">Print contents of current directory:</span></p></li></ol>' +
      '<p style="text-align: left;line-height: 0.9;margin-top: 5pt;margin-left: 54pt;text-indent: -18pt;"><span style="color: #000000;font-size: 20pt;font-family: Aptos;">Windows: dir</span></p>' +
      '<p style="text-align: left;line-height: 0.9;margin-top: 5pt;margin-left: 54pt;text-indent: -18pt;"><span style="color: #000000;font-size: 20pt;font-family: Aptos;">Unix: ls</span></p>';
    const result = PptxExtractor.htmlToMarkdown(html);
    expect(result).toContain("1. Clear the terminal screen:");
    expect(result).toContain("2. Display the name of the current directory:");
    expect(result).toContain("3. Print contents of current directory:");
    // Sub-bullets should be indented under their parent numbered item
    expect(result).toContain("   - Windows: cls");
    expect(result).toContain("   - Unix: clear");
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
    const result = PptxExtractor.htmlToMarkdown("<p>a b</p>");
    expect(result).toContain("a b");
  });

  it("indents sub-bullets by margin-left when no <ol> precedes them", () => {
    // All items have text-indent: -18pt so CSS bullet detection wraps them all
    // in <li>, but parent items have margin-left: 18pt and sub-items have
    // margin-left: 54pt.  The margin-left gap should indent sub-items.
    const html =
      '<p style="text-align: left;line-height: 0.9;margin-top: 10pt;margin-left: 18pt;text-indent: -18pt;"><span style="text-decoration: underline;">Lectures</span>:</p>' +
      '<p style="text-align: left;line-height: 0.9;margin-top: 5pt;margin-left: 54pt;text-indent: -18pt;"><span>Thursdays</span></p>' +
      '<p style="text-align: left;line-height: 0.9;margin-top: 5pt;margin-left: 54pt;text-indent: -18pt;"><span>10:30 AM</span></p>' +
      '<p style="text-align: left;line-height: 0.9;margin-top: 10pt;margin-left: 18pt;text-indent: -18pt;"><span style="text-decoration: underline;">Lab:</span> </p>' +
      '<p style="text-align: left;line-height: 0.9;margin-top: 5pt;margin-left: 54pt;text-indent: -18pt;"><span>Mondays</span></p>';
    const result = PptxExtractor.htmlToMarkdown(html);
    expect(result).toContain("- Lectures:");
    expect(result).toContain("   - Thursdays");
    expect(result).toContain("   - 10:30 AM");
    expect(result).toContain("- Lab:");
    expect(result).toContain("   - Mondays");
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
    expect(result).toContain("`` `backticks` ``");
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
  it("detects h1 heading from large font-size (46pt)", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-size: 46pt;">Big Title</span></p>',
    );
    expect(result).toContain("# Big Title");
  });

  it("detects h2 heading from medium font-size (34pt)", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-size: 34pt;">Subtitle</span></p>',
    );
    expect(result).toContain("## Subtitle");
  });

  it("detects h3 heading from font-size (28pt)", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-size: 28pt;">Section</span></p>',
    );
    expect(result).toContain("### Section");
  });

  it("does not add heading for body text (18pt)", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-size: 18pt;">Body text</span></p>',
    );
    expect(result).not.toContain("# ");
    expect(result).not.toContain("## ");
    expect(result).not.toContain("### ");
    expect(result).toContain("Body text");
  });

  it("does not add heading for text without font-size", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="color: #333;">Plain text</span></p>',
    );
    expect(result).not.toContain("# ");
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

describe("PptxExtractor ordered list start attribute injection", () => {
  it("injects start attribute into <ol> tags when start != 1", () => {
    const html = "<ol><li>item 1</li><li>item 2</li></ol>";
    const startValues = [5];
    const startIdxRef = { value: 0 };
    const result = PptxExtractor.injectOlStartAttributes(html, startValues, startIdxRef);
    expect(result).toBe('<ol start="5"><li>item 1</li><li>item 2</li></ol>');
    expect(startIdxRef.value).toBe(1);
  });

  it("does not inject start attribute when start is 1 (default)", () => {
    const html = "<ol><li>item 1</li><li>item 2</li></ol>";
    const startValues = [1];
    const startIdxRef = { value: 0 };
    const result = PptxExtractor.injectOlStartAttributes(html, startValues, startIdxRef);
    expect(result).toBe("<ol><li>item 1</li><li>item 2</li></ol>");
    expect(startIdxRef.value).toBe(1);
  });

  it("injects start attributes into multiple <ol> tags", () => {
    const html = "<ol><li>a</li></ol><ol><li>b</li></ol>";
    const startValues = [3, 7];
    const startIdxRef = { value: 0 };
    const result = PptxExtractor.injectOlStartAttributes(html, startValues, startIdxRef);
    expect(result).toBe('<ol start="3"><li>a</li></ol><ol start="7"><li>b</li></ol>');
    expect(startIdxRef.value).toBe(2);
  });

  it("leaves <ol> without start values unchanged", () => {
    const html = "<ol><li>a</li></ol><ol><li>b</li></ol>";
    const startValues = [];
    const startIdxRef = { value: 0 };
    const result = PptxExtractor.injectOlStartAttributes(html, startValues, startIdxRef);
    expect(result).toBe("<ol><li>a</li></ol><ol><li>b</li></ol>");
    expect(startIdxRef.value).toBe(0);
  });

  it("preserves existing start attribute", () => {
    const html = '<ol start="10"><li>item</li></ol>';
    const startValues = [5];
    const startIdxRef = { value: 0 };
    const result = PptxExtractor.injectOlStartAttributes(html, startValues, startIdxRef);
    expect(result).toBe('<ol start="10"><li>item</li></ol>');
    expect(startIdxRef.value).toBe(0);
  });

  it("tracks startIdxRef across multiple calls", () => {
    const html1 = "<ol><li>a</li></ol>";
    const html2 = "<ol><li>b</li></ol>";
    const startValues = [3, 8];
    const startIdxRef = { value: 0 };

    const result1 = PptxExtractor.injectOlStartAttributes(html1, startValues, startIdxRef);
    const result2 = PptxExtractor.injectOlStartAttributes(html2, startValues, startIdxRef);

    expect(result1).toBe('<ol start="3"><li>a</li></ol>');
    expect(result2).toBe('<ol start="8"><li>b</li></ol>');
    expect(startIdxRef.value).toBe(2);
  });

  it("handles <ol> with attributes", () => {
    const html = '<ol class="custom"><li>item</li></ol>';
    const startValues = [5];
    const startIdxRef = { value: 0 };
    const result = PptxExtractor.injectOlStartAttributes(html, startValues, startIdxRef);
    expect(result).toBe('<ol start="5" class="custom"><li>item</li></ol>');
    expect(startIdxRef.value).toBe(1);
  });

  it("handles <ol> with only opening bracket (no attributes)", () => {
    const html = "<ol><li>item</li></ol>";
    const startValues = [5];
    const startIdxRef = { value: 0 };
    const result = PptxExtractor.injectOlStartAttributes(html, startValues, startIdxRef);
    expect(result).toBe('<ol start="5"><li>item</li></ol>');
    expect(startIdxRef.value).toBe(1);
  });
});
