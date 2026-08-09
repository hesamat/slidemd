// @vitest-environment jsdom
/**
 * PPTX import integration tests.
 *
 * Each fixture is a small .pptx (built from real PowerPoint slide structure
 * with neutral text) that exercises a known conversion-quality problem:
 *
 * - one-image-plus-body.pptx — one dominant image (left) + body text (right)
 *   must become `media-span` with the image in @media and the text in @main.
 * - two-text-columns.pptx — two text columns, no images; both columns must
 *   stay non-empty in `two-column`.
 * - decorative-icon.pptx — a small icon beside the heading is decorative and
 *   must not appear in the output at all.
 * - verbose-bullets.pptx — literal bullet glyphs, trailing spaces, tabs and
 *   an empty text box must not leak into the converted markdown.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import markdownit from "markdown-it";
import { PptxExtractor } from "../data/pptx-extractor.js";
import { convertToSlideMd } from "../data/pptx-to-slide-md.js";
import { MarkdownParser } from "../data/markdown-parser.js";

window.markdownit = markdownit;

const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures", "pptx");

const parser = new MarkdownParser();

/**
 * Run the full import pipeline: extract -> convert to SlideMD -> parse deck.
 * @param {string} name - Fixture filename.
 */
async function convertFixture(name) {
  const buffer = fs.readFileSync(path.join(FIXTURES_DIR, name));
  const extraction = await PptxExtractor.extract(buffer);
  const markdown = convertToSlideMd(extraction);
  const deck = parser.parseDeckMarkdown(markdown);
  return { extraction, markdown, deck };
}

/** Strip HTML tags for text-level assertions. */
function textOf(html) {
  return html.replace(/<[^>]+>/g, " ");
}

describe("pptx import integration", () => {
  it("converts one-image-plus-body.pptx to media-span-left with the image in @media", async () => {
    const { markdown, deck } = await convertFixture("one-image-plus-body.pptx");

    expect(deck.slides).toHaveLength(1);
    expect(deck.slides[0].layout).toBe("media-span-left");

    const { header = "", main = "", media = "" } = deck.slides[0].areas;
    expect(textOf(header)).toContain("Strings and Immutability");
    // Body text belongs in @main, not @media
    expect(textOf(main)).toContain("Strings cannot be changed in place");
    expect(textOf(media)).not.toContain("Strings cannot be changed in place");
    // The image goes to @media; @main must not contain it
    expect(media).toContain("images/image1.png");
    expect(main).not.toContain("image1.png");
    expect(markdown).toContain("layout: media-span-left");
  });

  it("converts two-text-columns.pptx to two-column with non-empty columns", async () => {
    const { markdown, deck } = await convertFixture("two-text-columns.pptx");

    expect(deck.slides).toHaveLength(1);
    expect(deck.slides[0].layout).toBe("two-column");

    const { header = "", main = "", media = "" } = deck.slides[0].areas;
    expect(textOf(header)).toContain("Feature Comparison");
    expect(textOf(main)).toContain("Install the package");
    expect(textOf(main)).toContain("Run the test suite");
    expect(textOf(media)).toContain("Version control basics");
    expect(textOf(media)).toContain("Continuous integration");
    // No empty columns, no stray media
    expect(main.trim()).not.toBe("");
    expect(media.trim()).not.toBe("");
    expect(markdown).toContain("layout: two-column");
  });

  it("drops the decorative icon in decorative-icon.pptx", async () => {
    const { markdown, deck } = await convertFixture("decorative-icon.pptx");

    expect(deck.slides).toHaveLength(1);
    expect(deck.slides[0].layout).toBe("header-content");

    const { header = "", main = "" } = deck.slides[0].areas;
    expect(textOf(header)).toContain("Getting Started");
    expect(textOf(main)).toContain("Download the latest release");
    // The icon is decorative: no image may survive conversion
    expect(markdown).not.toMatch(/<img/);
    expect(markdown).not.toContain("image1.png");
  });

  it("cleans verbose bullets in verbose-bullets.pptx", async () => {
    const { markdown, deck } = await convertFixture("verbose-bullets.pptx");

    expect(deck.slides).toHaveLength(1);
    expect(deck.slides[0].layout).toBe("header-content");

    // No literal bullet glyphs anywhere
    expect(markdown).not.toContain("•");
    // The literal-glyph paragraph becomes a proper markdown bullet
    expect(markdown).toContain("- Verify the installation");
    // The empty text box (a lone bullet glyph) must vanish, not become a
    // dangling "-" line
    expect(markdown).not.toMatch(/^-\s*$/m);
    expect(markdown).not.toContain("\n- \n");
    // Duplicate whitespace from trailing spaces and tabs is collapsed
    expect(markdown).not.toContain("objects    :");
    expect(markdown).not.toContain("Level    Item");
    expect(markdown).toContain("- Level Item");
    // Real buChar bullets still convert
    expect(markdown).toContain("- *Store references*: a variable holds an address in memory");
  });
});

describe("slide title derivation from HTML-heavy slides", () => {
  const gridCells = [
    ["OPERATOR", "NAME", "ACTION"],
    ["&", "AND", "Sets a bit to 1 if both are 1"],
    ["|", "OR", "Sets a bit to 1 if one or both are 1"],
    ["^", "XOR", "Sets a bit to 1 if only one is 1"],
    ["~", "NOT", "Inverts all the bits"],
    ["<<", "Left Shift", "Shifts bits to the left"],
    [">>", "Right Shift", "Shifts bits to the right"],
  ];

  it("derives a readable title from a fullpage-grid @main (no raw HTML)", () => {
    const cells = gridCells
      .flat()
      .map(
        (cell) =>
          `<div class="fullpage-grid__cell fullpage-grid__cell--on-color" style="background:#000611b3">${cell}</div>`,
      )
      .join("");
    const md = [
      "layout: header-content",
      "background: linear-gradient(rgba(0,0,0,0.65),rgba(0,0,0,0.65)), url(images/image12-3b70.jpeg) center / cover no-repeat",
      "theme: dark",
      "",
      "@main",
      "",
      `<div class="fullpage-grid" style="grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(7,1fr)">${cells}</div>`,
      "",
      "@footer",
      "",
      "COMP 1510 202630",
    ].join("\n");
    const deck = parser.parseDeckMarkdown(md);
    const title = deck.slides[0].title;
    expect(title).toContain("OPERATOR");
    expect(title).toContain("&"); // entities decoded, not &amp;
    expect(title).not.toContain("<div");
    expect(title).not.toContain("&lt;");
    expect(title).not.toContain("&amp;");
    expect(title.length).toBeLessThanOrEqual(81);
  });

  it("skips HTML wrapper lines and titles from the first readable line", () => {
    const md = [
      "layout: header-content",
      "",
      "@main",
      "",
      '<div class="flex-row" style="display: flex; gap: 1em; align-items: start;">',
      '<div style="flex: 1; min-width: 0;">**Bold text**</div>',
      "</div>",
    ].join("\n");
    const deck = parser.parseDeckMarkdown(md);
    expect(deck.slides[0].title).toBe("Bold text");
  });

  it("falls back to Slide N when the area holds only markup", () => {
    const md = [
      "layout: header-content",
      "",
      "@main",
      "",
      '<div class="fullpage-grid" style="grid-template-columns:repeat(3,1fr)"></div>',
    ].join("\n");
    const deck = parser.parseDeckMarkdown(md);
    expect(deck.slides[0].title).toBe("Slide 1");
  });

  it("preserves literal angle brackets when deriving titles", () => {
    const md = ["layout: header-content", "", "@main", "", "a < b > c"].join("\n");
    const deck = parser.parseDeckMarkdown(md);
    expect(deck.slides[0].title).toBe("a < b > c");
  });

  it("keeps << / >> cells in titles derived from fullpage grids", () => {
    const cells = [
      ["<<", "Left Shift", "Moves bits left"],
      [">>", "Right Shift", "Moves bits right"],
    ]
      .flat()
      .map((cell) => `<div class="fullpage-grid__cell" style="background:#000611b3">${cell}</div>`)
      .join("");
    const md = [
      "layout: header-content",
      "",
      "@main",
      "",
      `<div class="fullpage-grid" style="grid-template-columns:repeat(3,1fr)">${cells}</div>`,
    ].join("\n");
    const deck = parser.parseDeckMarkdown(md);
    const title = deck.slides[0].title;
    expect(title).toContain("<<");
    expect(title).toContain(">>");
    expect(title).not.toContain("<div");
  });
});
