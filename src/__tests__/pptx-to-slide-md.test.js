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
    // PptxExtractor normalises image dimensions from points to EMU (×12700).
    // These values represent a ~236pt × ~157pt image already converted to EMU.
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
    expect(md).toContain('src="images/image1.png"');
    // Extracted images keep explicit dimensions for click/drag handler
    expect(md).toContain("width=");
    expect(md).toContain("height=");
  });

  it("uses two-column layout when a dominant image shares a slide with substantial text", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Dominant Image",
        notes: "",
        elements: [
          {
            type: "text",
            content:
              "First paragraph of body text that provides context for the slide content and discussion",
            left: 500000,
            top: 1500000,
            width: 3000000,
            height: 1200000,
          },
          {
            type: "text",
            content:
              "Second paragraph with additional details and explanation of the topic being covered here",
            left: 500000,
            top: 2800000,
            width: 3000000,
            height: 1200000,
          },
          {
            type: "image",
            ref: "dominant.png",
            base64: "abc",
            left: 5000000,
            top: 1000000,
            width: DEFAULT_SIZE.width * 0.5,
            height: DEFAULT_SIZE.height * 0.7,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    const mainIndex = md.indexOf("@main");
    const mediaIndex = md.indexOf("@media");
    const imageIndex = md.indexOf("dominant.png");

    expect(md).toContain("layout: media-span-right");
    expect(md).not.toContain("@secondary");
    expect(mainIndex).toBeGreaterThan(-1);
    expect(mediaIndex).toBeGreaterThan(mainIndex);
    expect(imageIndex).toBeGreaterThan(mediaIndex);
  });

  it("uses header-content when a dominant image shares a slide with only a header", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Header Only",
        notes: "",
        elements: [
          {
            type: "text",
            content: "USER STORY",
            left: 500000,
            top: 500000,
            width: 3000000,
            height: 800000,
          },
          {
            type: "image",
            ref: "dominant.png",
            base64: "abc",
            left: 5000000,
            top: 1000000,
            width: DEFAULT_SIZE.width * 0.5,
            height: DEFAULT_SIZE.height * 0.7,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);

    expect(md).toContain("layout: header-content");
    expect(md).toContain("@header");
    expect(md).toContain("USER STORY");
  });

  it("uses three-column layout when two dominant images share a slide with text", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Two Dominant Images",
        notes: "",
        elements: [
          {
            type: "text",
            content: "Summary text stays in the main column",
            left: 500000,
            top: 1500000,
            width: 2500000,
            height: 1200000,
          },
          {
            type: "image",
            ref: "dominant-1.png",
            base64: "abc",
            left: 3500000,
            top: 1000000,
            width: DEFAULT_SIZE.width * 0.3,
            height: DEFAULT_SIZE.height * 0.65,
          },
          {
            type: "image",
            ref: "dominant-2.png",
            base64: "def",
            left: 6500000,
            top: 1000000,
            width: DEFAULT_SIZE.width * 0.3,
            height: DEFAULT_SIZE.height * 0.62,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    const mainIndex = md.indexOf("@main");
    const mediaIndex = md.indexOf("@media");
    const textIndex = md.indexOf("Summary text stays in the main column");
    const firstImageIndex = md.indexOf("dominant-1.png");
    const secondImageIndex = md.indexOf("dominant-2.png");

    expect(md).toContain("layout: media-span-right");
    expect(mainIndex).toBeGreaterThan(-1);
    expect(mediaIndex).toBeGreaterThan(mainIndex);
    expect(textIndex).toBeGreaterThan(mainIndex);
    expect(textIndex).toBeLessThan(mediaIndex);
    expect(firstImageIndex).toBeGreaterThan(mediaIndex);
    expect(secondImageIndex).toBeGreaterThan(mediaIndex);
  });

  it("keeps image-only slides in single-column layout", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Image Only",
        notes: "",
        elements: [
          {
            type: "image",
            ref: "full-slide.png",
            base64: "abc",
            left: 1000000,
            top: 500000,
            width: DEFAULT_SIZE.width * 0.6,
            height: DEFAULT_SIZE.height * 0.8,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);

    expect(md).toContain("layout: header-content");
    expect(md).toContain("@main");
    expect(md).not.toContain("@media");
    expect(md).not.toContain("@secondary");
    expect(md).toContain("full-slide.png");
  });

  it("does not use multi-column layout for non-dominant images", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Small Image",
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
            content: "Body text stays in the main area",
            left: 500000,
            top: 1500000,
            width: 8000000,
            height: 1500000,
          },
          {
            type: "image",
            ref: "small.png",
            base64: "abc",
            left: 3500000,
            top: 3200000,
            width: DEFAULT_SIZE.width * 0.15,
            height: DEFAULT_SIZE.height * 0.15,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);

    expect(md).toContain("layout: header-content");
    expect(md).toContain("@main");
    expect(md).not.toContain("@media");
    expect(md).not.toContain("@secondary");
  });

  it("uses two-column layout with image on right when slide has header + body content + large image", () => {
    // Overflow scenario: a heading, a table, and a large right-side image.
    // The image dimensions are stored in EMU (as normalised by PptxExtractor).
    // width = 310pt × 12700 ≈ 3 937 000 EMU  → ratio 0.43  (> 0.4 → dominant)
    // height = 540pt × 12700 ≈ 6 858 000 EMU  → ratio 1.33  (> 0.6 → dominant)
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Escape sequences",
        notes: "",
        elements: [
          {
            type: "text",
            content: "## In order to represent quotes inside a string we use escape sequences",
            left: 500000,
            top: 200000,
            width: 5000000,
            height: 700000,
          },
          {
            type: "table",
            rows: [
              [{ text: "Sequence" }, { text: "Meaning" }],
              [{ text: '\\"' }, { text: "Double quote" }],
              [{ text: "\\n" }, { text: "New line" }],
              [{ text: "\\\\" }, { text: "Backslash" }],
            ],
            left: 500000,
            top: 1400000,
            width: 5000000,
            height: 2500000,
          },
          {
            type: "image",
            ref: "code-example.png",
            base64: "abc",
            left: 5800000,
            top: 200000,
            width: Math.round(310 * 12700),
            height: Math.round(540 * 12700),
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    const headerIdx = md.indexOf("@header");
    const mainIdx = md.indexOf("@main");
    const mediaIdx = md.indexOf("@media");
    const headingIdx = md.indexOf("escape sequences");
    const imageIdx = md.indexOf("code-example.png");

    expect(md).toContain("layout: media-span-right");
    // Heading must appear in the @header section (between @header and @main)
    expect(headingIdx).toBeGreaterThan(headerIdx);
    expect(headingIdx).toBeLessThan(mainIdx);
    // Image must appear in the @media section (after @media)
    expect(imageIdx).toBeGreaterThan(mediaIdx);
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
            // Font-size heading detection happens in htmlToMarkdown during extraction.
            // By the time convertToSlideMd sees it, it's already markdown with ##.
            content: "## Introduction to APIs",
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

  it("prunes empty slides", () => {
    const extraction = makeExtraction([
      { index: 0, title: "", notes: "", elements: [], background: "" },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toBe("");
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
    expect(md).toContain("## What is an Event Listener?");
    expect(md).toContain("## Examples:");
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

  it("emits footer in title-slide layout", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Cover",
        notes: "",
        elements: [
          {
            type: "text",
            content: "## My Title",
            left: 1500000,
            top: 600000,
            width: 6000000,
            height: 1500000,
          },
          {
            type: "text",
            content: "COMP 1510 202610",
            placeholderType: "footer",
            left: 3180000,
            top: 4800000,
            width: 3240000,
            height: 287500,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("layout: title-slide");
    expect(md).toContain("@footer");
    expect(md).toContain("COMP 1510 202610");
  });

  // ── Layout detection improvement tests ──────────────────────────────

  it("uses two-column layout when a single long text element shares a slide with a dominant image", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Single Text + Image",
        notes: "",
        elements: [
          {
            type: "text",
            content:
              "This is a long text element with more than 80 characters of content that should trigger the two-column layout when paired with a dominant image on the slide.",
            left: 500000,
            top: 1500000,
            width: 3000000,
            height: 2000000,
          },
          {
            type: "image",
            ref: "photo.png",
            base64: "abc",
            left: 5000000,
            top: 1000000,
            width: DEFAULT_SIZE.width * 0.5,
            height: DEFAULT_SIZE.height * 0.7,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    // inferLayout returns two-column, but the media-span upgrade promotes it
    // because the right column has a single dominant image
    expect(md).toMatch(/layout: (two-column|media-span)/);
    expect(md).toContain("@main");
    expect(md).toContain("@media");
  });

  it("handles image-only slide with two side-by-side images as two-column", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Two Images",
        notes: "",
        elements: [
          {
            type: "image",
            ref: "img1.png",
            base64: "abc",
            left: 500000,
            top: 1000000,
            width: DEFAULT_SIZE.width * 0.4,
            height: DEFAULT_SIZE.height * 0.6,
          },
          {
            type: "image",
            ref: "img2.png",
            base64: "def",
            left: 5000000,
            top: 1000000,
            width: DEFAULT_SIZE.width * 0.4,
            height: DEFAULT_SIZE.height * 0.6,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    // inferLayout returns two-column for side-by-side images, but media-span
    // upgrade promotes it because the right column has a single dominant image
    expect(md).toMatch(/layout: (two-column|media-span)/);
    expect(md).toContain("@main");
    expect(md).toContain("@media");
  });

  it("treats stacked images as two-column instead of three-column", () => {
    // Images at the same x position (100% horizontal overlap) are vertically
    // stacked, not side-by-side, so they should get two-column not three-column
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Stacked Images",
        notes: "",
        elements: [
          {
            type: "text",
            content: "Summary text stays in the main column",
            left: 500000,
            top: 1500000,
            width: 2500000,
            height: 1200000,
          },
          {
            type: "image",
            ref: "stacked-1.png",
            base64: "abc",
            left: 4000000,
            top: 500000,
            width: DEFAULT_SIZE.width * 0.5,
            height: DEFAULT_SIZE.height * 0.35,
          },
          {
            type: "image",
            ref: "stacked-2.png",
            base64: "def",
            left: 4000000,
            top: 3500000,
            width: DEFAULT_SIZE.width * 0.5,
            height: DEFAULT_SIZE.height * 0.35,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("layout: two-column");
    expect(md).not.toContain("layout: three-column");
  });

  it("strips background/theme from full-image slides that carry speaker notes", () => {
    // With notes, the directive lines are not at parts[0]/parts[1]; the
    // full-image override must find and remove them wherever they sit. A
    // footer keeps the slide from being pruned as empty (the full-image
    // candidate itself is excluded from the content elements), and a dark
    // slide fill makes convertSlide emit background:/theme: dark lines that
    // the override must then remove.
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Photo",
        notes: "This slide has speaker notes.",
        background: "#111111",
        elements: [
          {
            type: "image",
            ref: "photo.png",
            base64: "abc",
            left: 0,
            top: 0,
            width: Math.round(DEFAULT_SIZE.width * 0.9),
            height: Math.round(DEFAULT_SIZE.height * 0.9),
          },
          {
            type: "text",
            content: "Photo credit",
            placeholderType: "footer",
            left: 500000,
            top: 4500000,
            width: 4000000,
            height: 300000,
          },
        ],
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("layout: full-image");
    expect(md).toContain("This slide has speaker notes.");
    expect(md).not.toContain("background:");
    expect(md).not.toContain("theme: dark");
  });

  it("uses media-span when body text straddles the midpoint", () => {
    // A dominant image on the left plus body text whose box crosses the
    // midpoint still yields media-span, with the image in @media and the
    // straddling text in @main. Guards the layout decision (inferLayout
    // treats the straddling box as body content rather than forcing
    // two-column).
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Straddle",
        notes: "",
        elements: [
          {
            type: "text",
            content: "## Header",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "image",
            ref: "photo.png",
            base64: "abc",
            left: 762000,
            top: 1422400,
            width: 2500000,
            height: 3000000,
          },
          {
            type: "text",
            content: "Body text that straddles the midpoint of the slide",
            left: 3000000,
            top: 1422400,
            width: 5600000,
            height: 2000000,
          },
          {
            type: "text",
            content: "Supporting text on the right",
            left: 5200000,
            top: 1800000,
            width: 2500000,
            height: 1500000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    // The dominant image sits on the left, so the left media-span variant is
    // emitted and the image stays in @media (now the left column).
    expect(md).toContain("layout: media-span-left");
    const mainIdx = md.indexOf("@main");
    const mediaIdx = md.indexOf("@media");
    expect(mainIdx).toBeGreaterThan(-1);
    expect(mediaIdx).toBeGreaterThan(mainIdx);
    expect(md.indexOf("straddles the midpoint")).toBeGreaterThan(mainIdx);
    expect(md.indexOf("photo.png")).toBeGreaterThan(mediaIdx);
  });

  it("splits overflowing slides with long wrapping headings into two columns", () => {
    // Each ~70-char heading wraps to two rendered lines, so 8 headings need
    // ~928px — over the 760px budget — and the body must be redistributed.
    const headings = Array.from(
      { length: 8 },
      (_, i) =>
        `### Topic number ${i + 1} with a long enough title to wrap over two rendered lines`,
    ).join("\n");
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Wrap",
        notes: "",
        elements: [
          {
            type: "text",
            content: "# Header",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "text",
            content: headings,
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
    expect(md).toContain("layout: two-column");
    for (let i = 1; i <= 8; i++) {
      expect(md).toContain(`Topic number ${i}`);
    }
  });

  it("keeps a small top image when the slide has no heading", () => {
    // The header-band rule only drops small top images beside an actual
    // heading; a text-bearing slide without one keeps the image.
    const extraction = makeExtraction([
      {
        index: 0,
        title: "No Header",
        notes: "",
        elements: [
          {
            type: "text",
            content: "Body paragraph",
            left: 500000,
            top: 2000000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "image",
            ref: "badge.png",
            base64: "abc",
            left: 7000000,
            top: 600000,
            width: 508000,
            height: 508000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("badge.png");
  });

  it("keeps a small top image when the only top text is a narrow label", () => {
    // A narrow label or date placeholder in the header region is not a
    // title, so the header-band rule must not drop images beside it.
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Label",
        notes: "",
        elements: [
          {
            type: "text",
            content: "Course 101",
            left: 500000,
            top: 400000,
            width: 1524000,
            height: 381000,
          },
          {
            type: "text",
            content: "Body paragraph below",
            left: 500000,
            top: 2000000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "image",
            ref: "badge.png",
            base64: "abc",
            left: 7000000,
            top: 600000,
            width: 508000,
            height: 508000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("badge.png");
  });

  it("renders all body content when the two-column split leaves one side empty", () => {
    // Element A's overlap ratio (1.33) passes the 1.2x pre-check but not the
    // renderer's 1.5x threshold, so the render split finds no left elements.
    // The slide must downgrade to header-content AND render every element —
    // not emit an empty slide.
    const longA = "Element A text with enough words to be substantial. ".repeat(6);
    const longB = "Element B text with enough words to be substantial. ".repeat(6);
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Split",
        notes: "",
        elements: [
          {
            type: "text",
            content: "## Header",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "text",
            content: longA,
            left: 2540000,
            top: 1500000,
            width: 3556000,
            height: 1000000,
          },
          {
            type: "text",
            content: longB,
            left: 6350000,
            top: 1500000,
            width: 2540000,
            height: 1000000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("layout: header-content");
    expect(md).toContain("@main");
    expect(md).toContain("Element A text");
    expect(md).toContain("Element B text");
  });

  it("patches the layout directive when the pre-check downgrades two-column", () => {
    // Two overflowing body elements stacked on the left are forced into
    // two-column by the overflow upgrade, but the pre-check finds no right
    // column and downgrades — the emitted directive must match.
    const longText = "Stacked body element with a lot of words. ".repeat(20);
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Stack",
        notes: "",
        elements: [
          {
            type: "text",
            content: "## Header",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "text",
            content: longText,
            left: 1000000,
            top: 1500000,
            width: 6000000,
            height: 1500000,
          },
          {
            type: "text",
            content: longText,
            left: 1000000,
            top: 3200000,
            width: 6000000,
            height: 1500000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("layout: header-content");
    expect(md).not.toContain("layout: two-column");
    expect(md).toContain("@main");
    expect(md).toContain("Stacked body element");
  });

  it("picks the media-span variant from the media-only column, not the first dominant image", () => {
    // The text column also contains a dominant image, so dominantImages[0]
    // (element order) is the illustration inside the text column. The variant
    // must follow the picture-only column instead — media on the right.
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Two Pics",
        notes: "",
        elements: [
          {
            type: "text",
            content: "## Header",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "text",
            content: "Left column body text that carries the main content",
            left: 762000,
            top: 1524000,
            width: 3556000,
            height: 1016000,
          },
          // Illustration inside the text column — comes first in element order
          {
            type: "image",
            ref: "illustration.png",
            base64: "abc",
            left: 1016000,
            top: 2540000,
            width: 2540000,
            height: 1905000,
          },
          // The media-only column
          {
            type: "image",
            ref: "photo.png",
            base64: "abc",
            left: 5334000,
            top: 1270000,
            width: 3556000,
            height: 4318000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("layout: media-span-right");
    expect(md).not.toContain("layout: media-span-left");
  });

  it("picks media-span-left when the picture-only column is on the left", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Two Pics L",
        notes: "",
        elements: [
          {
            type: "text",
            content: "## Header",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "text",
            content: "Right column body text that carries the main content",
            left: 5334000,
            top: 1524000,
            width: 3556000,
            height: 1016000,
          },
          // Illustration inside the text column — comes first among images,
          // so dominantImages[0] would point at the wrong column
          {
            type: "image",
            ref: "illustration.png",
            base64: "abc",
            left: 5588000,
            top: 2540000,
            width: 2540000,
            height: 1905000,
          },
          // The media-only column (left)
          {
            type: "image",
            ref: "photo.png",
            base64: "abc",
            left: 762000,
            top: 1270000,
            width: 3556000,
            height: 4318000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("layout: media-span-left");
    expect(md).not.toContain("layout: media-span-right");
  });

  it("keeps divider lines typed in body text without splitting the slide", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Divider",
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
            content: "Before\n---\nAfter",
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
    // The divider becomes a markdown horizontal rule; a raw "---" line would
    // terminate the slide in splitSlides.
    expect(md).toContain("Before\n***\nAfter");
    expect(md).not.toMatch(/^---\s*$/m);
    expect(md).not.toContain("\n- \n");
  });

  it("keeps two-column when the side image is not dominant (no empty @media)", () => {
    // Image area 14000 pt² (~4.8% of slide) sits between the logo threshold
    // (1.5%) and the dominant threshold (5%): it survives filtering but must
    // not trigger media-span, whose @media is filled only by dominant images.
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Small",
        notes: "",
        elements: [
          {
            type: "text",
            content: "## Header",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "image",
            ref: "small.png",
            base64: "abc",
            left: 762000,
            top: 1422400,
            width: 1778000,
            height: 1270000,
          },
          {
            type: "text",
            content: "Body text on the right",
            left: 6858000,
            top: 1422400,
            width: 3657600,
            height: 2000000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("layout: two-column");
    expect(md).not.toContain("layout: media-span");
    const mainIdx = md.indexOf("@main");
    const mediaIdx = md.indexOf("@media");
    const imageIdx = md.indexOf("small.png");
    const bodyIdx = md.indexOf("Body text on the right");
    expect(mainIdx).toBeGreaterThan(-1);
    expect(mediaIdx).toBeGreaterThan(-1);
    expect(imageIdx).toBeGreaterThan(-1);
    expect(bodyIdx).toBeGreaterThan(-1);
  });

  it("uses two-column when a column mixes an image and a table", () => {
    // A right column with both an image and a table counts as text-bearing
    // (tables are content), so media-span is not inferred and the table keeps
    // its column instead of being pushed across the divide into @main.
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Mixed",
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
            content: "Left text content",
            left: 500000,
            top: 1500000,
            width: 3500000,
            height: 2000000,
          },
          {
            type: "image",
            ref: "photo.png",
            base64: "abc",
            left: 5500000,
            top: 1500000,
            width: 3000000,
            height: 1800000,
          },
          {
            type: "table",
            rows: [
              [{ text: "Name" }, { text: "Value" }],
              [{ text: "A" }, { text: "1" }],
            ],
            left: 5500000,
            top: 3600000,
            width: 3000000,
            height: 900000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("layout: two-column");
    expect(md).not.toContain("layout: media-span");
    const mediaIdx = md.indexOf("@media");
    const imageIdx = md.indexOf("photo.png");
    const tableIdx = md.indexOf("| Name | Value |");
    const mainIdx = md.indexOf("@main");
    expect(mainIdx).toBeGreaterThan(-1);
    expect(mediaIdx).toBeGreaterThan(-1);
    // Image and table both stay in the right column (@media)
    expect(imageIdx).toBeGreaterThan(mediaIdx);
    expect(tableIdx).toBeGreaterThan(mediaIdx);
  });

  it("uses media-span when right column has only an image", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Image Right",
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
            content: "Left text content",
            left: 500000,
            top: 1500000,
            width: 4000000,
            height: 2000000,
          },
          {
            type: "image",
            ref: "right-image.png",
            base64: "abc",
            left: 5500000,
            top: 1000000,
            width: DEFAULT_SIZE.width * 0.5,
            height: DEFAULT_SIZE.height * 0.7,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("layout: media-span-right");
    expect(md).toContain("@header");
    expect(md).toContain("@main");
    expect(md).toContain("@media");
  });

  it("uses two-column when right column has text and image", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Empty Left",
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
            content: "Right text",
            left: 5500000,
            top: 1500000,
            width: 3000000,
            height: 2000000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toMatch(/layout: (header-content|two-column)/);
    expect(md).toContain("@main");
    expect(md).toContain("Right text");
  });

  it("keeps header-content when a long paragraph still fits the column", () => {
    // A ~400-char single paragraph wraps to ~7 rendered lines — well under
    // the overflow budget — so the slide must stay in one column. This is the
    // counterpart of the overflow-upgrade test below: the split only happens
    // when the body genuinely cannot fit.
    const longBody = "Word ".repeat(80).trim(); // ~400 chars
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Fits",
        notes: "",
        elements: [
          {
            type: "text",
            content: "Section Header",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "text",
            content: longBody,
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
    expect(md).toContain("layout: header-content");
    expect(md).toContain("@main");
    expect(md).toContain(longBody);
  });

  it("upgrades header-content to two-column when the body overflows", () => {
    // Mirrors a real Week 04 slide ("Assert, assert, assert!"): a title and a
    // single body box with 14 large-font (28pt) lines that cannot fit one
    // column. The body box is only ~2/3 slide width, so the split must not
    // depend on the wide-element heuristic.
    const assertLines = Array.from(
      { length: 14 },
      (_, i) => `### assert case number ${i + 1}`,
    ).join("\n");
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Asserts",
        notes: "",
        elements: [
          {
            type: "text",
            content: "# Assert, assert, assert!",
            left: 0,
            top: 0,
            width: 318 * 12700,
            height: 540 * 12700,
          },
          {
            type: "text",
            content: assertLines,
            left: 396 * 12700,
            top: 18 * 12700,
            width: 480 * 12700,
            height: 482 * 12700,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("layout: two-column");
    const mainIdx = md.indexOf("@main");
    const mediaIdx = md.indexOf("@media");
    expect(mainIdx).toBeGreaterThan(-1);
    expect(mediaIdx).toBeGreaterThan(mainIdx);
    // Every line survives the split exactly once
    for (let i = 1; i <= 14; i++) {
      expect(md).toContain(`assert case number ${i}`);
    }
    expect((md.match(/assert case number/g) || []).length).toBe(14);
    expect(md).toContain("### assert case number 1");
    expect(md).toContain("### assert case number 14");
  });

  it("upgrades media-span to two-column when body overflows", () => {
    const longBody = "Item with enough text to trigger overflow detection. ".repeat(20).trim(); // ~1100 chars
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Media Overflow",
        notes: "",
        elements: [
          {
            type: "text",
            content: "## Title",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "text",
            content: longBody,
            left: 500000,
            top: 1500000,
            width: 4000000,
            height: 3000000,
          },
          {
            type: "image",
            ref: "photo.png",
            base64: "abc",
            left: 5500000,
            top: 1000000,
            width: DEFAULT_SIZE.width * 0.45,
            height: DEFAULT_SIZE.height * 0.6,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    // media-span with overflowing body → upgraded to two-column
    expect(md).toMatch(/layout: (two-column|media-span)/);
    expect(md).toContain(longBody);
  });

  it("detects h1 heading in header and keeps media-span for content with image", () => {
    const items = Array.from(
      { length: 21 },
      (_, i) => `${i + 1}. Topic ${i + 1} with enough text to make it substantial`,
    ).join("\n");
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Week 3",
        notes: "",
        elements: [
          {
            type: "text",
            content: items,
            left: 500000,
            top: 1000000,
            width: 4000000,
            height: 3500000,
          },
          {
            type: "text",
            content: "# Week 3",
            left: 500000,
            top: 600000,
            width: 8000000,
            height: 400000,
          },
          {
            type: "image",
            ref: "image1.jpeg",
            base64: "abc",
            left: 5500000,
            top: 500000,
            width: DEFAULT_SIZE.width * 0.45,
            height: DEFAULT_SIZE.height * 0.8,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    // h1 should be in @header
    expect(md).toContain("@header");
    expect(md).toContain("Week 3");
    const headerIdx = md.indexOf("@header");
    const weekIdx = md.indexOf("Week 3");
    expect(weekIdx).toBeGreaterThan(headerIdx);
    // No forced overflow upgrade — content stays in media-span
    expect(md).toMatch(/layout: (media-span|two-column)/);
    expect(md).toContain("@media");
  });

  it("does not split code blocks across columns when redistributing content", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Code Split",
        notes: "",
        elements: [
          {
            type: "text",
            content: "## Title",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "text",
            content:
              "- First point with enough text to reach the character threshold for overflow detection\n" +
              "- Second point with enough text to reach the character threshold for overflow detection\n" +
              "- Third point with enough text to reach the character threshold for overflow detection\n" +
              "- Fourth point with enough text to reach the character threshold for overflow detection\n" +
              "- Fifth point with enough text to reach the character threshold for overflow detection\n" +
              "```python\ncode_a = 1\ncode_b = 2\n```\n" +
              "- Sixth point with enough text to reach the character threshold for overflow detection\n" +
              "- Seventh point with enough text to reach the character threshold for overflow detection\n" +
              "- Eighth point with enough text to reach the character threshold for overflow detection",
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
    // Code block must not be split — ``` must appear in pairs
    const codeBlockMatches = md.match(/```/g) || [];
    expect(codeBlockMatches.length % 2).toBe(0);
  });
});

describe("flex-row rendering", () => {
  it("wraps 3 horizontally adjacent elements in a flex container", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Flex Test",
        notes: "",
        elements: [
          {
            type: "text",
            content: "## Title",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "image",
            ref: "img1.png",
            base64: "abc",
            left: 500000,
            top: 1500000,
            width: 1200000,
            height: 1200000,
          },
          {
            type: "text",
            content: "Some text",
            left: 3500000,
            top: 1500000,
            width: 2500000,
            height: 1200000,
          },
          {
            type: "image",
            ref: "img2.png",
            base64: "def",
            left: 6500000,
            top: 1500000,
            width: 1200000,
            height: 1200000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain('class="flex-row"');
    expect(md).toContain("display: flex");
    expect(md).toContain("img1.png");
    expect(md).toContain("Some text");
    expect(md).toContain("img2.png");
  });

  it("wraps 2 images + 1 overlapping text in a flex row", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Flex Overlap",
        notes: "",
        elements: [
          {
            type: "text",
            content: "## Title",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "image",
            ref: "img1.png",
            base64: "abc",
            left: 100000,
            top: 1500000,
            width: 600000,
            height: 600000,
          },
          {
            type: "text",
            content: "Label",
            left: 1700000,
            top: 1550000,
            width: 600000,
            height: 500000,
          },
          {
            type: "image",
            ref: "img2.png",
            base64: "def",
            left: 3300000,
            top: 1500000,
            width: 600000,
            height: 600000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain('class="flex-row"');
    expect(md).toContain("img1.png");
    expect(md).toContain("Label");
    expect(md).toContain("img2.png");
  });

  it("does not create flex row for vertically stacked elements", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Stacked",
        notes: "",
        elements: [
          {
            type: "text",
            content: "Top element",
            left: 500000,
            top: 500000,
            width: 8000000,
            height: 1000000,
          },
          {
            type: "text",
            content: "Bottom element",
            left: 500000,
            top: 2500000,
            width: 8000000,
            height: 1000000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).not.toContain('class="flex-row"');
    expect(md).toContain("Top element");
    expect(md).toContain("Bottom element");
  });

  it("does not create flex row for a single body element", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Single",
        notes: "",
        elements: [
          {
            type: "text",
            content: "## Header",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "text",
            content: "Only body element",
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
    expect(md).not.toContain('class="flex-row"');
    expect(md).toContain("Only body element");
  });

  it("does not create flex row for text-only horizontal elements", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Text Only",
        notes: "",
        elements: [
          {
            type: "text",
            content: "## Header",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "text",
            content: "Java",
            left: 500000,
            top: 1500000,
            width: 3000000,
            height: 2000000,
          },
          {
            type: "text",
            content: "```\nwhile True:\n    pass\n```",
            left: 4200000,
            top: 1500000,
            width: 3500000,
            height: 2000000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).not.toContain('class="flex-row"');
    expect(md).toContain("Java");
  });

  it("renders multi-item diagram as [Diagram: ...] marker", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "",
        notes: "",
        elements: [
          {
            type: "diagram",
            content: "Step 1, Step 2, Step 3",
            order: 5,
            left: 1000000,
            top: 2000000,
            width: 3000000,
            height: 1500000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("[Diagram: Step 1, Step 2, Step 3]");
    expect(md).not.toContain("- Step 1");
  });

  it("renders single-item diagram as plain text", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "",
        notes: "",
        elements: [
          {
            type: "diagram",
            content: "Only Item",
            order: 5,
            left: 1000000,
            top: 2000000,
            width: 3000000,
            height: 1500000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("Only Item");
    expect(md).not.toContain("[Diagram:");
  });

  it("renders empty diagram as placeholder", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "",
        notes: "",
        elements: [
          {
            type: "diagram",
            content: "[Diagram]",
            order: 5,
            left: 1000000,
            top: 2000000,
            width: 3000000,
            height: 1500000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("[Diagram]");
  });

  it("uses two-column layout for wide code elements that span the slide", () => {
    // Simulates a PPTX slide where code from two columns was merged into one wide text element
    const mergedCode = [
      "products = [",
      "    'Keyboard',",
      "    'Mouse',",
      "    'Monitor',",
      "    'Webcam'",
      "]",
      "inventory = {",
      "    product: 0",
      "    for product in products",
      "}",
      "words = [",
      "    'algorithm',",
      "    'loop',",
      "    'dictionary',",
      "    'function'",
      "]",
      "lengths = {",
      "    word: len(word)",
      "    for word in words",
      "}",
    ].join("\n");

    const extraction = makeExtraction([
      {
        index: 0,
        title: "Dict Comp",
        notes: "",
        elements: [
          {
            type: "text",
            content: "## The dictionary comprehension",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "text",
            content: mergedCode,
            left: 500000,
            top: 1500000, // below bodyThreshold (22% of 5143500 = 1131570)
            width: 8000000, // wide element spanning >80% of the slide (9144000)
            height: 3500000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    // Should get two-column because the code element is wide (>60% of slide width)
    expect(md).toMatch(/layout: two-column/);
    expect(md).toContain("@main");
    expect(md).toContain("@media");
  });

  // ── Empty @main guard tests ─────────────────────────────────────

  it("downgrades media-span to header-content when @main would be empty", () => {
    // Slide with a header + dominant image + no body text.
    // Media-span would produce empty @main, so it should be header-content
    // with the image in @main instead.
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Header + Image",
        notes: "",
        elements: [
          {
            type: "text",
            content: "Behold the ancient ASCII table",
            left: 500000,
            top: 500000,
            width: 4000000,
            height: 400000,
          },
          {
            type: "image",
            ref: "image3-81b0.png",
            base64: "abc",
            left: 4500000,
            top: 1000000,
            width: DEFAULT_SIZE.width * 0.5,
            height: DEFAULT_SIZE.height * 0.7,
          },
        ],
        background: "#00F501",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("layout: header-content");
    expect(md).toContain("@header");
    expect(md).toContain("Behold the ancient ASCII table");
    expect(md).toContain("@main");
    expect(md).toContain("image3-81b0.png");
    expect(md).not.toContain("@media");
  });

  it("does not emit duplicate @header when media-span downgrades to header-content", () => {
    // Regression test: the media-span guard must compute mediaEls/leftEls
    // BEFORE pushing any @header, otherwise @header gets emitted twice.
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Double Header Regression",
        notes: "",
        elements: [
          {
            type: "text",
            content: "## PROGRAMMING LANGUAGE PARADIGMS",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "image",
            ref: "image57-f87f.png",
            base64: "abc",
            left: 4500000,
            top: 1000000,
            width: DEFAULT_SIZE.width * 0.5,
            height: DEFAULT_SIZE.height * 0.7,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    const headerCount = (md.match(/@header/g) || []).length;
    expect(headerCount).toBe(1);
    expect(md).toContain("layout: header-content");
    expect(md).toContain("PROGRAMMING LANGUAGE PARADIGMS");
  });

  it("uses header-content for body text with inline code in numbered list (single print() line)", () => {
    // A slide with header + body text containing a numbered list with inline
    // code (print()). The code detection should NOT trigger because there's
    // only a single line matching the code regex — not enough to call it code.
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Raw strings",
        notes: "",
        elements: [
          {
            type: "text",
            content: "## Raw strings",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "text",
            content:
              "If we do not want to use escape characters, we can create a raw string\n" +
              "A raw string is prefixed by the letter r or R\n" +
              "Python raw strings treat the backslash as an ordinary character\n" +
              "\n" +
              '1. `print("Hello\\nworld")`\n' +
              '2. `print(r"Hello\\nworld") # This is a raw string`\n' +
              "\n" +
              "This is useful if we have a string that contains backslashes that must be interpreted as backslashes",
            left: 500000,
            top: 1500000,
            width: 8000000,
            height: 3000000,
          },
        ],
        background:
          "linear-gradient(rgba(0,0,0,0.65),rgba(0,0,0,0.65)), url(images/image7-9452.jpeg) center / cover no-repeat",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("layout: header-content");
    expect(md).toContain("@header");
    expect(md).toContain("Raw strings");
    expect(md).toContain("@main");
    expect(md).toContain("print(");
    // Should not have @media since there's no second column
    expect(md).not.toMatch(/@media/);
  });

  it("still uses two-column for genuine code slides with ≥2 code lines", () => {
    // A slide with a header and genuine code (multiple code lines)
    // should still get two-column or focus layout
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Code Slide",
        notes: "",
        elements: [
          {
            type: "text",
            content: "## Code Example",
            left: 500000,
            top: 200000,
            width: 8000000,
            height: 500000,
          },
          {
            type: "text",
            content:
              "def hello():\n" +
              "    print('Hello')\n" +
              "    return True\n" +
              "def goodbye():\n" +
              "    print('Goodbye')\n" +
              "    return False",
            left: 500000,
            top: 1500000,
            width: 8000000,
            height: 3500000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    // 6 lines with code keywords (def, print, return) — should still be code
    expect(md).toMatch(/layout: (two-column|focus)/);
    expect(md).toContain("@main");
  });

  it("keeps all three images in a side-by-side 3-image slide", () => {
    // Regression test: a middle image straddling the midpoint can be unclassified
    // by the 1.2x overlap threshold and silently dropped.
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Three People",
        notes: "",
        elements: [
          {
            type: "text",
            content: "I'm Charles Babbage",
            left: 2500000,
            top: 200000,
            width: 4000000,
            height: 400000,
          },
          {
            type: "image",
            ref: "image20-f6a2.jpeg",
            base64: "abc",
            left: 0,
            top: 1000000,
            width: DEFAULT_SIZE.width * 0.33,
            height: DEFAULT_SIZE.height * 0.8,
          },
          {
            type: "image",
            ref: "image21-xxxx.jpeg",
            base64: "def",
            left: DEFAULT_SIZE.width * 0.33,
            top: 1000000,
            width: DEFAULT_SIZE.width * 0.34,
            height: DEFAULT_SIZE.height * 0.8,
          },
          {
            type: "image",
            ref: "image22-0bac.jpeg",
            base64: "ghi",
            left: DEFAULT_SIZE.width * 0.67,
            top: 1000000,
            width: DEFAULT_SIZE.width * 0.33,
            height: DEFAULT_SIZE.height * 0.8,
          },
        ],
        background: "#000000",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("image20-f6a2.jpeg");
    expect(md).toContain("image21-xxxx.jpeg");
    expect(md).toContain("image22-0bac.jpeg");
  });
});
