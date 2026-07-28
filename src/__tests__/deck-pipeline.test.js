import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import markdownit from "markdown-it";
import { MarkdownParser } from "../data/markdown-parser.js";
import { DeckLoader } from "../data/deck-loader.js";

let parser;

beforeAll(() => {
  vi.stubGlobal("window", { markdownit });
  parser = new MarkdownParser();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("deck pipeline: markdown → parseDeckMarkdown → normalizeDeck", () => {
  const sampleMd = `layout: two-column
theme: dark
# First Slide

Welcome content

<!-- notes: Speaker note one -->

---

# Second Slide

\`\`\`javascript
const x = 1;
\`\`\`

@sidebar
Side content

@main
Main content
`;

  let raw;
  let deck;

  it("parses markdown into a deck structure", () => {
    raw = parser.parseDeckMarkdown(sampleMd);
    expect(raw).toBeDefined();
    expect(raw.meta).toBeDefined();
    expect(raw.slides).toBeDefined();
  });

  it("produces correct meta", () => {
    expect(raw.meta.title).toBe("First Slide");
    expect(raw.meta.aspect).toBe("16:9");
    expect(raw.meta.stage).toEqual({ width: 1920, height: 1080 });
  });

  it("produces correct number of slides", () => {
    expect(raw.slides).toHaveLength(2);
  });

  it("extracts layout directive", () => {
    expect(raw.slides[0].layout).toBe("two-column");
  });

  it("extracts theme directive", () => {
    expect(raw.slides[0].theme).toBe("dark");
  });

  it("extracts speaker notes", () => {
    expect(raw.slides[0].notes).toBe("Speaker note one");
  });

  it("strips notes from slide content", () => {
    expect(raw.slides[0].areas.main).not.toContain("notes:");
    expect(raw.slides[0].areas.main).toContain("Welcome content");
  });

  it("renders markdown to HTML", () => {
    expect(raw.slides[0].areas.main).toContain("<h1");
    expect(raw.slides[0].areas.main).toContain("First Slide");
  });

  it("preserves code blocks", () => {
    expect(raw.slides[1].areas.main).toContain("language-javascript");
    expect(raw.slides[1].areas.main).toContain("const x = 1");
  });

  it("generates unique slide ids", () => {
    const ids = raw.slides.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("normalizes through DeckLoader.normalizeDeck", () => {
    deck = DeckLoader.normalizeDeck(raw, { includeHidden: true });
    expect(deck.slides).toHaveLength(2);
    expect(deck.meta.title).toBe("First Slide");
  });

  it("preserves all slide fields after normalization", () => {
    const s = deck.slides[0];
    expect(s).toHaveProperty("id");
    expect(s).toHaveProperty("title");
    expect(s).toHaveProperty("notes");
    expect(s).toHaveProperty("layout");
    expect(s).toHaveProperty("background");
    expect(s).toHaveProperty("theme");
    expect(s).toHaveProperty("hidden");
    expect(s).toHaveProperty("areas");
  });
});

describe("parseDeckMarkdown: slide title derivation", () => {
  it("uses explicit # heading as slide title", () => {
    const deck = parser.parseDeckMarkdown("# My Title\n\nContent here");
    expect(deck.slides[0].title).toBe("My Title");
  });

  it("uses @header heading as slide title", () => {
    const md = "@header\n\n## Header Title\n\n@main\n\nMain content";
    const deck = parser.parseDeckMarkdown(md);
    expect(deck.slides[0].title).toBe("Header Title");
  });

  it("uses @header first line as slide title when no heading", () => {
    const md = "@header\n\n***var* vs *let***\n\n@main\n\nSome content";
    const deck = parser.parseDeckMarkdown(md);
    expect(deck.slides[0].title).toBe("var vs let");
  });

  it("uses @main heading as slide title when no @header", () => {
    const md = "@main\n\n## Main Title\n\nContent here";
    const deck = parser.parseDeckMarkdown(md);
    expect(deck.slides[0].title).toBe("Main Title");
  });

  it("uses @main first line as slide title when no heading", () => {
    const md = "@main\n\nSome plain text content\n\nMore content";
    const deck = parser.parseDeckMarkdown(md);
    expect(deck.slides[0].title).toBe("Some plain text content");
  });

  it("falls back to Slide N when no @header or @main content", () => {
    const md = "layout: title-slide";
    const deck = parser.parseDeckMarkdown(md);
    expect(deck.slides[0].title).toBe("Slide 1");
  });

  it("strips markdown formatting from @header first line title", () => {
    const md = "@header\n\n**Bold Title** with [link](https://example.com)\n\n@main\n\nContent";
    const deck = parser.parseDeckMarkdown(md);
    expect(deck.slides[0].title).toBe("Bold Title with link");
  });
});
