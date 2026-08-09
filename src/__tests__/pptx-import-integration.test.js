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
  it("converts one-image-plus-body.pptx to media-span with the image in @media", async () => {
    const { markdown, deck } = await convertFixture("one-image-plus-body.pptx");

    expect(deck.slides).toHaveLength(1);
    expect(deck.slides[0].layout).toBe("media-span");

    const { header = "", main = "", media = "" } = deck.slides[0].areas;
    expect(textOf(header)).toContain("Strings and Immutability");
    // Body text belongs in @main, not @media
    expect(textOf(main)).toContain("Strings cannot be changed in place");
    expect(textOf(media)).not.toContain("Strings cannot be changed in place");
    // The image goes to @media; @main must not contain it
    expect(media).toContain("images/image1.png");
    expect(main).not.toContain("image1.png");
    expect(markdown).toContain("layout: media-span");
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
