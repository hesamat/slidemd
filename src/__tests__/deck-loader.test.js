import { describe, it, expect } from "vitest";
import { DeckLoader } from "../data/deck-loader.js";

describe("DeckLoader.normalizeDeck", () => {
  const validDeck = {
    meta: { title: "Test Deck" },
    slides: [
      { id: "s1", title: "Slide 1", areas: { main: "<p>Content</p>" } },
      { id: "s2", title: "Slide 2", areas: { main: "<p>More</p>" } },
    ],
  };

  it("throws for non-object input", () => {
    expect(() => DeckLoader.normalizeDeck(null)).toThrow("not an object");
    expect(() => DeckLoader.normalizeDeck("string")).toThrow("not an object");
    expect(() => DeckLoader.normalizeDeck(undefined)).toThrow("not an object");
  });

  it("throws for missing slides array", () => {
    expect(() => DeckLoader.normalizeDeck({ meta: {} })).toThrow("slides must be an array");
  });

  it("preserves slide count", () => {
    const result = DeckLoader.normalizeDeck(validDeck);
    expect(result.slides).toHaveLength(2);
  });

  it("preserves slide ids", () => {
    const result = DeckLoader.normalizeDeck(validDeck);
    expect(result.slides[0].id).toBe("s1");
    expect(result.slides[1].id).toBe("s2");
  });

  it("preserves slide titles", () => {
    const result = DeckLoader.normalizeDeck(validDeck);
    expect(result.slides[0].title).toBe("Slide 1");
  });

  it("preserves areas", () => {
    const result = DeckLoader.normalizeDeck(validDeck);
    expect(result.slides[0].areas).toEqual({ main: "<p>Content</p>" });
  });

  it("defaults missing slide fields", () => {
    const deck = {
      meta: { title: "Test" },
      slides: [{ areas: { main: "<p>Hi</p>" } }],
    };
    const result = DeckLoader.normalizeDeck(deck);
    expect(result.slides[0].id).toBe("slide-1");
    expect(result.slides[0].title).toBe("Slide 1");
    expect(result.slides[0].notes).toBe("");
    expect(result.slides[0].layout).toBe("");
    expect(result.slides[0].background).toBe("");
    expect(result.slides[0].theme).toBe("");
    expect(result.slides[0].hidden).toBe(false);
  });

  it("normalizes meta fields", () => {
    const result = DeckLoader.normalizeDeck(validDeck);
    expect(result.meta.title).toBe("Test Deck");
    expect(result.meta.aspect).toBe("16:9");
    expect(result.meta.stage).toEqual({ width: 1920, height: 1080 });
  });

  it("defaults meta title from first slide", () => {
    const deck = { slides: [{ id: "s1", title: "My Slide", areas: { main: "<p>Hi</p>" } }] };
    const result = DeckLoader.normalizeDeck(deck);
    expect(result.meta.title).toBe("My Slide");
  });

  describe("hidden slides", () => {
    const deckWithHidden = {
      meta: { title: "Test" },
      slides: [
        { id: "s1", title: "Visible", areas: { main: "<p>A</p>" } },
        { id: "s2", title: "Hidden", hidden: true, areas: { main: "<p>B</p>" } },
      ],
    };

    it("includes hidden slides when includeHidden is true", () => {
      const result = DeckLoader.normalizeDeck(deckWithHidden, { includeHidden: true });
      expect(result.slides).toHaveLength(2);
    });

    it("excludes hidden slides when includeHidden is false", () => {
      const result = DeckLoader.normalizeDeck(deckWithHidden, { includeHidden: false });
      expect(result.slides).toHaveLength(1);
      expect(result.slides[0].id).toBe("s1");
    });

    it("defaults includeHidden to true", () => {
      const result = DeckLoader.normalizeDeck(deckWithHidden);
      expect(result.slides).toHaveLength(2);
    });

    it("returns placeholder when all slides are hidden", () => {
      const allHidden = {
        meta: { title: "Test" },
        slides: [{ id: "s1", title: "Hidden", hidden: true, areas: { main: "<p>B</p>" } }],
      };
      const result = DeckLoader.normalizeDeck(allHidden, { includeHidden: false });
      expect(result.slides).toHaveLength(1);
      expect(result.slides[0].id).toBe("no-visible-slides");
    });
  });

  it("throws for invalid slide entries", () => {
    const deck = { meta: { title: "Test" }, slides: [null] };
    expect(() => DeckLoader.normalizeDeck(deck)).toThrow("Invalid slide at index 0");
  });

  it("preserves areaStyle", () => {
    const deck = {
      meta: { title: "Test" },
      slides: [{ id: "s1", title: "S", areaStyle: "border: 1px", areas: { main: "<p>Hi</p>" } }],
    };
    const result = DeckLoader.normalizeDeck(deck);
    expect(result.slides[0].areaStyle).toBe("border: 1px");
  });

  it("preserves the visual system", () => {
    const visualSystem = {
      mood: "Dark, technical.",
      styleNotes: "Use dark backgrounds for content, bright for emphasis.",
    };
    const deck = {
      meta: { title: "Test" },
      slides: [{ id: "s1", title: "S", areas: { main: "<p>Hi</p>" } }],
      visualSystem,
    };
    const result = DeckLoader.normalizeDeck(deck);
    expect(result.visualSystem).toEqual(visualSystem);
  });

  it("defaults visual system to null when missing", () => {
    const result = DeckLoader.normalizeDeck(validDeck);
    expect(result.visualSystem).toBeNull();
  });

  it("normalizes hidden to boolean", () => {
    const deck = {
      meta: { title: "Test" },
      slides: [{ id: "s1", title: "S", hidden: 1, areas: { main: "<p>Hi</p>" } }],
    };
    const result = DeckLoader.normalizeDeck(deck);
    expect(result.slides[0].hidden).toBe(true);
  });
});
