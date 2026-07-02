import { describe, it, expect } from "vitest";
import { convertToSlideMd } from "../data/pptx-to-slide-md.js";

const DEFAULT_SIZE = { width: 9144000, height: 5143500 };

const makeExtraction = (slides, opts = {}) => ({
  slides,
  themeColors: [],
  usedFonts: [],
  size: opts.size || DEFAULT_SIZE,
  images: [],
});

describe("convertToSlideMd", () => {
  it("converts a single title-like slide", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Hello World",
        notes: "",
        elements: [
          {
            type: "text",
            content: "Hello World\nSubtitle",
            left: 1000000,
            top: 2000000,
            width: 7000000,
            height: 1000000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("layout: title-slide");
    expect(md).toContain("Hello World");
    expect(md).toContain("Subtitle");
  });

  it("converts header + content layout", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Slide",
        notes: "",
        elements: [
          {
            type: "text",
            content: "Header",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "text",
            content: "Body text here",
            left: 500000,
            top: 1500000,
            width: 8000000,
            height: 2000000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("layout: header-content");
    expect(md).toContain("@header");
    expect(md).toContain("Header");
    expect(md).toContain("@main");
    expect(md).toContain("Body text here");
  });

  it("converts two-column layout", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Two Col",
        notes: "",
        elements: [
          {
            type: "text",
            content: "Left",
            left: 500000,
            top: 2000000,
            width: 3500000,
            height: 1000000,
          },
          {
            type: "text",
            content: "Right",
            left: 5000000,
            top: 2000000,
            width: 3500000,
            height: 1000000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("layout: two-column");
    expect(md).toContain("@main");
    expect(md).toContain("@media");
    expect(md).toContain("Left");
    expect(md).toContain("Right");
  });

  it("converts header + two-column layout", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "H2C",
        notes: "",
        elements: [
          {
            type: "text",
            content: "Title",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "text",
            content: "Left",
            left: 500000,
            top: 2000000,
            width: 3500000,
            height: 1000000,
          },
          {
            type: "text",
            content: "Right",
            left: 5000000,
            top: 2000000,
            width: 3500000,
            height: 1000000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("@header");
    expect(md).toContain("@main");
    expect(md).toContain("@media");
  });

  it("preserves speaker notes", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Notes",
        notes: "Remember to explain this",
        elements: [
          {
            type: "text",
            content: "Content",
            left: 500000,
            top: 2000000,
            width: 8000000,
            height: 1000000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("<!-- notes: Remember to explain this -->");
  });

  it("handles image elements", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Image",
        notes: "",
        elements: [
          {
            type: "text",
            content: "Title",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "image",
            ref: "image1.png",
            base64: "abc",
            left: 1000000,
            top: 2000000,
            width: 3000000,
            height: 2000000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain('src="images/presentation_image1.png"');
    expect(md).toContain('width="630"');
    expect(md).toContain('height="420"');
  });

  it("handles table elements", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Table",
        notes: "",
        elements: [
          {
            type: "text",
            content: "Title",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "table",
            rows: [
              [{ text: "Name" }, { text: "Value" }],
              [{ text: "A" }, { text: "1" }],
            ],
            left: 500000,
            top: 2000000,
            width: 8000000,
            height: 1000000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("| Name | Value |");
    expect(md).toContain("| A | 1 |");
  });

  it("keeps multi-line cell text in the same table cell", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Table",
        notes: "",
        elements: [
          {
            type: "text",
            content: "Title",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "table",
            rows: [
              [{ text: "Name" }, { text: "Value" }],
              [{ text: "Line A\nLine B" }, { text: "1\n2\n3" }],
            ],
            left: 500000,
            top: 2000000,
            width: 8000000,
            height: 1000000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    // The newline must be escaped to <br> and must NOT produce a new
    // markdown table row (which would have a leading | only if actually
    // intended).  The cell content stays a single line in the source.
    expect(md).toContain("| Line A<br>Line B | 1<br>2<br>3 |");
    // Sanity: the body should still have exactly two data rows (one
    // per element), no extra split-out lines from the inner newlines.
    const tableBlock = md.match(/\| Name \| Value \|\n\| --- \| --- \|\n([\s\S]+?)(?:\n\n|$)/)[1];
    expect(tableBlock.trim().split("\n").length).toBe(1);
  });

  it("classifies a title+subtitle slide as title-slide even when title sits near the top", () => {
    // Mirrors a real PPTX title slide: a prominent centred title at the
    // top band (so `hasHeader` is true) and a one-line centred subtitle
    // below.  Both boxes are similar height, so this is a tight centred
    // cluster, not a thin header strip above a tall body.
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Cover",
        notes: "",
        elements: [
          {
            type: "text",
            content: "Microservices Architecture",
            left: 1500000,
            top: 600000,
            width: 6000000,
            height: 1500000,
          },
          {
            type: "text",
            content: "A practical guide",
            left: 2000000,
            top: 2500000,
            width: 5000000,
            height: 1200000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("layout: title-slide");
  });

  it("renders the title-slide's first text element as a heading", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Cover",
        notes: "",
        elements: [
          {
            type: "text",
            content: "Introduction to APIs",
            left: 1500000,
            top: 600000,
            width: 6000000,
            height: 1500000,
          },
          {
            type: "text",
            content: "Hesam Alizadeh",
            left: 2000000,
            top: 2500000,
            width: 5000000,
            height: 1200000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    // Title slide must promote its first text element to a heading so
    // the cover doesn't read as a wall of unstyled body text.
    expect(md).toContain("## Introduction to APIs");
    // The subtitle stays unstyled body text.
    expect(md).not.toContain("## Hesam Alizadeh");
  });

  it("collapses leading '- - ' from PPTX bullets into a single dash", () => {
    // Mirrors a real PPTX where the bullet glyph is a literal text run
    // (e.g. "- ") that pptxtojson keeps AND #htmlToMarkdown prepends
    // another "- " for the <li>, producing "- - Understand what an API is".
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Bullets",
        notes: "",
        elements: [
          {
            type: "text",
            content: "Header",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 400000,
          },
          {
            type: "text",
            content:
              "- - Understand what an API is\n- Learn why APIs are important\n- See how APIs are used in software development",
            left: 500000,
            top: 1500000,
            width: 8000000,
            height: 3000000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("- Understand what an API is");
    expect(md).toContain("- Learn why APIs are important");
    expect(md).toContain("- See how APIs are used in software development");
    // No double-dash anywhere in the body.
    expect(md).not.toMatch(/^- - /m);
    // Also no line should begin with "- - ".
    expect(md).not.toContain("- - Understand");
  });

  it("handles empty slides", () => {
    const extraction = makeExtraction([
      { index: 0, title: "", notes: "", elements: [], background: "" },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("layout: header-content");
    expect(md).toContain("@main");
  });

  it("preserves background", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "BG",
        notes: "",
        elements: [
          {
            type: "text",
            content: "Hello",
            left: 500000,
            top: 2000000,
            width: 8000000,
            height: 1000000,
          },
        ],
        background: "linear-gradient(red, blue)",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("background: linear-gradient(red, blue)");
  });

  it("separates multiple slides with ---", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "A",
        notes: "",
        elements: [{ type: "text", content: "A", left: 0, top: 0, width: 1000, height: 1000 }],
        background: "",
      },
      {
        index: 1,
        title: "B",
        notes: "",
        elements: [{ type: "text", content: "B", left: 0, top: 0, width: 1000, height: 1000 }],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("\n\n---\n\n");
    expect(md).toContain("A");
    expect(md).toContain("B");
  });

  // ── Bold-paragraph → heading tests ──────────────────────────────────

  it("converts standalone bold paragraphs to ### headings", () => {
    // Mirrors the addEventListener slide where a bold-only paragraph
    // acts as a sub-heading (e.g. "What is an Event Listener?").
    // PptxExtractor converts <span bold>What...</span> to **What...**
    // and formatTextElement should promote it to ### heading.
    const extraction = makeExtraction([
      {
        index: 0,
        title: "addEventListener",
        notes: "",
        elements: [
          {
            type: "text",
            content:
              "*Making things interactive*\n**What is an Event Listener?**\n- Piece of code\n- Attached to a DOM\n**Examples:**\n- Click\n- Hover",
            left: 43,
            top: 66,
            width: 653,
            height: 286,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("### What is an Event Listener?");
    expect(md).toContain("### Examples:");
    expect(md).toContain("- Piece of code");
    expect(md).toContain("- Click");
  });

  it("preserves bold+italic formatting without extra spaces", () => {
    // Mirrors the var vs let slide where bold+italic spans wrap each
    // word individually.  After pre-merging same-styled spans, the
    // output should be ***var*** **vs** ***let*** without trailing
    // spaces inside the markers.
    const extraction = makeExtraction([
      {
        index: 0,
        title: "var vs let",
        notes: "",
        elements: [
          {
            type: "text",
            content: "***var*** **vs** ***let***",
            left: 59,
            top: 42,
            width: 118,
            height: 34,
          },
          {
            type: "text",
            content:
              "- Variables declared with the ***var*** keyword can not have Block Scope.\n- ***let*** -> for local declarations (Block Scope)",
            left: 56,
            top: 100,
            width: 410,
            height: 51,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    // Header: bold+italic var, bold vs, bold+italic let
    expect(md).toContain("***var*** **vs** ***let***");
    // Body: no trailing spaces inside markers
    expect(md).not.toMatch(/\*{2,}\w+\s{2,}\*{2,}/);
    expect(md).toContain("***var*** keyword");
    expect(md).toContain("***let*** ->");
  });

  it("does not add trailing spaces inside bold+italic markers from body bullets", () => {
    // Regression test for the var vs let slide body where bold+italic
    // keywords had trailing spaces: ***var  ***keyword should be
    // ***var*** keyword (space OUTSIDE the markers).
    const extraction = makeExtraction([
      {
        index: 0,
        title: "var vs let",
        notes: "",
        elements: [
          {
            type: "text",
            content:
              "- Variables declared with the ***var*** keyword can not have Block Scope.\n- ***let*** -> for local declarations (Block Scope)\n- Redeclaring a variable inside a block with var will also redeclare the variable outside the block.",
            left: 56,
            top: 100,
            width: 410,
            height: 51,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    // No trailing spaces inside any *** markers
    expect(md).not.toMatch(/\*\*\*\w+\s+\*\*\*/);
    expect(md).toContain("***var*** keyword");
    expect(md).toContain("***let*** ->");
  });

  it("preserves bold+italic header with mixed bold runs without marker corruption", () => {
    // Regression test for the var vs let header: var=bold+italic,
    // vs=bold, let=bold+italic. The ** merge must not consume the
    // opening *** of the next triple-asterisk marker.
    // Bug: "**vs**" + " " + "***let***" was being merged into
    // "**vs *let***" because the trailing ** in the merge matched
    // the first two * of ***. Fix: add (?!\*) lookahead.
    const extraction = makeExtraction([
      {
        index: 0,
        title: "var vs let",
        notes: "",
        elements: [
          {
            type: "text",
            content: "***var*** **vs** ***let***",
            left: 59,
            top: 42,
            width: 118,
            height: 34,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    // Must produce clean markers, not ***var* vs* let***
    expect(md).toContain("***var*** **vs** ***let***");
    // The broken output would have ***var* (italic var) instead of
    // ***var*** (bold+italic var). Check for the exact broken pattern.
    expect(md).not.toMatch(/\*\*\*var\*(?!\*)/);
    expect(md).not.toMatch(/vs\*\s+let/);
  });

  it("routes footer elements to @footer area", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Slide with Footer",
        notes: "",
        elements: [
          {
            type: "text",
            content: "Header Text",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "text",
            content: "Body content here",
            left: 500000,
            top: 1500000,
            width: 8000000,
            height: 2000000,
          },
          {
            type: "text",
            content: "Company Name",
            placeholderType: "footer",
            left: 500000,
            top: 4800000,
            width: 8000000,
            height: 300000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("@footer");
    expect(md).toContain("Company Name");
    expect(md).toContain("@header");
    expect(md).toContain("@main");
    expect(md).toContain("Body content here");
  });

  it("excludes footer elements from layout inference", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Two Column",
        notes: "",
        elements: [
          {
            type: "text",
            content: "Left",
            left: 500000,
            top: 2000000,
            width: 3500000,
            height: 1000000,
          },
          {
            type: "text",
            content: "Right",
            left: 5000000,
            top: 2000000,
            width: 3500000,
            height: 1000000,
          },
          {
            type: "text",
            content: "Footer text",
            placeholderType: "footer",
            left: 500000,
            top: 4800000,
            width: 8000000,
            height: 300000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    // Footer should not affect layout detection — still two-column
    expect(md).toContain("layout: two-column");
    expect(md).toContain("@footer");
    expect(md).toContain("Footer text");
  });

  it("skips footer elements with empty content", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Slide",
        notes: "",
        elements: [
          {
            type: "text",
            content: "Content",
            left: 500000,
            top: 2000000,
            width: 8000000,
            height: 1000000,
          },
          {
            type: "text",
            content: "",
            placeholderType: "footer",
            left: 500000,
            top: 4800000,
            width: 8000000,
            height: 300000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    // Empty footer should not produce @footer area
    expect(md).not.toContain("@footer");
  });
});
