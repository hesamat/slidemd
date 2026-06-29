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
