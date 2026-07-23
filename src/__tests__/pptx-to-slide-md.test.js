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

    expect(md).toContain("layout: media-span");
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
    const secondaryIndex = md.indexOf("@secondary");
    const textIndex = md.indexOf("Summary text stays in the main column");
    const firstImageIndex = md.indexOf("dominant-1.png");
    const secondImageIndex = md.indexOf("dominant-2.png");

    expect(md).toContain("layout: three-column");
    expect(mainIndex).toBeGreaterThan(-1);
    expect(mediaIndex).toBeGreaterThan(mainIndex);
    expect(secondaryIndex).toBeGreaterThan(mediaIndex);
    expect(textIndex).toBeGreaterThan(mainIndex);
    expect(textIndex).toBeLessThan(mediaIndex);
    expect(firstImageIndex).toBeGreaterThan(mediaIndex);
    expect(firstImageIndex).toBeLessThan(secondaryIndex);
    expect(secondImageIndex).toBeGreaterThan(secondaryIndex);
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

    expect(md).toContain("layout: media-span");
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

  it("detects left-heavy layout when left column has significantly more area", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Left Heavy",
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
            content: "Main content with substantial text that takes up the left column area",
            left: 500000,
            top: 1500000,
            width: 5500000,
            height: 3000000,
          },
          {
            type: "text",
            content: "Small right",
            left: 6500000,
            top: 2000000,
            width: 2000000,
            height: 800000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("layout: left-heavy");
  });

  it("detects right-heavy layout when right column has significantly more area", () => {
    const extraction = makeExtraction([
      {
        index: 0,
        title: "Right Heavy",
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
            content: "Small left",
            left: 500000,
            top: 2000000,
            width: 2000000,
            height: 800000,
          },
          {
            type: "text",
            content: "Main content with substantial text that takes up the right column area",
            left: 3000000,
            top: 1500000,
            width: 5500000,
            height: 3000000,
          },
        ],
        background: "",
      },
    ]);
    const md = convertToSlideMd(extraction);
    expect(md).toContain("layout: right-heavy");
  });

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
});
