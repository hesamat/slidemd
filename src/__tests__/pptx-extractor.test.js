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

  it("does not escape > characters in text content", () => {
    const result = PptxExtractor.htmlToMarkdown("<p>a &gt; b</p>");
    expect(result).toContain("a > b");
    expect(result).not.toContain("&gt;");
  });

  it("escapes < characters in text content", () => {
    const result = PptxExtractor.htmlToMarkdown("<p>a &lt; b</p>");
    expect(result).toContain("&lt;");
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

describe("PptxExtractor.htmlToMarkdown bullet, divider, and whitespace edge cases", () => {
  it("promotes numbered titles to headings", () => {
    // A large-font title that starts with a number must keep its heading size
    // instead of being emitted as an ordered-list item.
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-size: 44pt;">3. Data Structures</span></p>',
    );
    expect(result).toContain("## 3. Data Structures");
  });

  it("does not promote bullet lines to headings", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-size: 32pt;">• First item</span></p>',
    );
    expect(result).toContain("- First item");
    expect(result).not.toContain("###");
  });

  it("preserves content inside language-tagged fences", () => {
    // The fence guard must toggle on "```yaml" too, or code lines like "---"
    // inside the fence would be rewritten as dividers.
    const result = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-family: Consolas;">```yaml</span></p>' +
        '<p><span style="font-family: Consolas;">---</span></p>' +
        '<p><span style="font-family: Consolas;">key: value</span></p>' +
        '<p><span style="font-family: Consolas;">```</span></p>',
    );
    expect(result).toContain("---");
  });

  it("normalizes glyphs without a following space", () => {
    // "•item" (no space) must become a markdown bullet, not leak "### •item".
    const spaced = PptxExtractor.htmlToMarkdown(
      '<p><span style="font-size: 32pt;">•item</span></p>',
    );
    expect(spaced).toContain("- item");
    expect(spaced).not.toContain("•");
    expect(spaced).not.toContain("###");
  });

  it("keeps divider lines typed in slides", () => {
    expect(PptxExtractor.htmlToMarkdown("<p>---</p>")).toContain("---");
    expect(PptxExtractor.htmlToMarkdown("<p>***</p>")).toContain("***");
    // Spaced three-marker dividers survive too (mergeAdjacentMarkers would
    // otherwise mangle "* * *" into a marker-only residue)
    expect(PptxExtractor.htmlToMarkdown("<p>- - -</p>")).toContain("- - -");
    expect(PptxExtractor.htmlToMarkdown("<p>* * *</p>")).toContain("* * *");
  });

  it("drops two-marker dash runs as residue", () => {
    // "--" is a double-hyphen artifact, not a divider — it must not become a
    // horizontal rule, and it must not leak a dangling "- ".
    expect(PptxExtractor.htmlToMarkdown("<p>--</p>")).toBe("");
  });

  it("keeps divider content inside list items", () => {
    // A divider typed as a bullet item is preserved as a list item, with the
    // markers escaped so formatTextElement does not misread the item as a
    // page-wide divider; "* * *" is not mangled by marker merging.
    const result = PptxExtractor.htmlToMarkdown(
      "<ul><li>before</li><li>---</li><li>after</li></ul>",
    );
    expect(result).toContain("- before");
    expect(result).toContain("- \\-\\-\\-");
    expect(result).toContain("- after");
    expect(result).not.toContain("- ---");

    const stars = PptxExtractor.htmlToMarkdown("<ul><li>* * *</li></ul>");
    expect(stars).toContain("- \\* \\* \\*");
    expect(stars).not.toContain("- * * *");

    // Non-ASCII glyphs need no backslash escape — CommonMark only honours
    // escapes before ASCII punctuation, so "\•" would stay visible.
    const glyphs = PptxExtractor.htmlToMarkdown("<ul><li>• • •</li></ul>");
    expect(glyphs).toContain("- • • •");
    expect(glyphs).not.toContain("\\");
  });

  it("drops a lone bullet marker (empty text box residue)", () => {
    expect(PptxExtractor.htmlToMarkdown("<p>•</p>")).toBe("");
    expect(PptxExtractor.htmlToMarkdown("<p>-</p>")).toBe("");
  });

  it("preserves whitespace inside inline code that sits mid-line", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p>Use <span style="font-family: Courier New;">x  =  1</span> here</p>',
    );
    expect(result).toContain("Use `x  =  1` here");
  });

  it("collapses whitespace between two inline-code spans", () => {
    const result = PptxExtractor.htmlToMarkdown(
      '<p>Use <span style="font-family: Courier New;">a</span>    <span style="font-family: Courier New;">b</span> here</p>',
    );
    expect(result).toContain("`a` `b`");
    expect(result).not.toContain("`a`    `b`");
  });

  it("drops a marker-only CSS-bullet item without a dangling dash", () => {
    // A hanging-indent paragraph containing only a hyphen becomes a
    // standalone <li>; the residue must vanish instead of "- -".
    const result = PptxExtractor.htmlToMarkdown(
      '<p style="text-indent: -24pt; margin-left: 24pt">-</p>',
    );
    expect(result).toBe("");
  });

  it("joins real and glyph bullets into one tight list", () => {
    // Mixed bullet sources (buChar <li> + hand-typed glyphs) in one text box
    // must not get a blank line between the two groups.
    const liThenGlyph = PptxExtractor.htmlToMarkdown(
      "<ul><li>real item</li></ul><p>\u2022 glyph item</p>",
    );
    expect(liThenGlyph).toContain("- real item\n- glyph item");
    expect(liThenGlyph).not.toContain("- real item\n\n- glyph item");

    const glyphThenLi = PptxExtractor.htmlToMarkdown(
      "<p>\u2022 glyph item</p><ul><li>real item</li></ul>",
    );
    expect(glyphThenLi).toContain("- glyph item\n- real item");
    expect(glyphThenLi).not.toContain("- glyph item\n\n- real item");

    const liThenLi = PptxExtractor.htmlToMarkdown("<ul><li>a</li></ul><ul><li>b</li></ul>");
    expect(liThenLi).toContain("- a\n- b");
  });

  it("drops spaced marker residue from empty sub-bullets", () => {
    // PowerPoint leaves "- -" / "• •" behind in empty sub-bullets; they must
    // not fall through to a dangling "- " bullet.
    expect(PptxExtractor.htmlToMarkdown("<p>- -</p>")).toBe("");
    expect(PptxExtractor.htmlToMarkdown("<p>• •</p>")).toBe("");
    expect(
      PptxExtractor.htmlToMarkdown('<p style="text-indent: -24pt; margin-left: 24pt">- -</p>'),
    ).toBe("");
  });

  it("renders consecutive literal-glyph bullets as a tight list", () => {
    const result = PptxExtractor.htmlToMarkdown("<p>• one</p><p>• two</p><p>• three</p>");
    expect(result).toContain("- one\n- two\n- three");
    // No blank lines between the items — markdown-it would render a loose
    // list (each item wrapped in <p>) otherwise.
    expect(result).not.toContain("- one\n\n- two");
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

describe("PptxExtractor diagram detection", () => {
  // Test helper to create mock elements that match ExtractedElement shape
  const makeShape = (overrides = {}) => ({
    type: "text",
    content: "",
    left: 100000,
    top: 100000,
    width: 50000,
    height: 50000,
    order: 0,
    shapType: "rect",
    fill: "FF0000",
    strokeOnly: false,
    hasConnector: false,
    ...overrides,
  });

  const makeConnector = (overrides = {}) => ({
    type: "connector",
    content: "",
    left: 150000,
    top: 100000,
    width: 100000,
    height: 0,
    order: 1,
    shapType: null,
    fill: null,
    strokeOnly: true,
    hasConnector: true,
    ...overrides,
  });

  const makeText = (content, overrides = {}) => ({
    type: "text",
    content,
    left: 100000,
    top: 100000,
    width: 50000,
    height: 50000,
    order: 0,
    ...overrides,
  });

  it("connector elements are preserved with hasConnector flag", () => {
    const elements = [makeConnector({ left: 0, top: 0, width: 100000, height: 0 })];
    expect(elements[0].hasConnector).toBe(true);
    expect(elements[0].strokeOnly).toBe(true);
  });

  it("shape elements preserve fill and shapType metadata", () => {
    const elements = [makeShape({ shapType: "ellipse", fill: "00FF00" })];
    expect(elements[0].shapType).toBe("ellipse");
    expect(elements[0].fill).toBe("00FF00");
  });

  it("text elements without shapes have null metadata", () => {
    const elements = [makeText("Hello")];
    expect(elements[0].shapType).toBeUndefined();
    expect(elements[0].fill).toBeUndefined();
    expect(elements[0].hasConnector).toBeFalsy();
  });

  it("empty shapes with shapType are preserved", () => {
    const elements = [
      makeShape({
        content: "",
        shapType: "rect",
        fill: "FF0000",
        left: 0,
        top: 0,
        width: 100000,
        height: 100000,
      }),
    ];
    // Empty shapes with shapType should not be null
    expect(elements[0].shapType).toBe("rect");
    expect(elements[0].fill).toBe("FF0000");
  });
});
