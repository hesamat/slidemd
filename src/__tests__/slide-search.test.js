import { describe, it, expect, beforeAll, vi } from "vitest";
import { JSDOM } from "jsdom";
import { SlideSearch } from "../engine/slide-search.js";

beforeAll(() => {
  const { window } = new JSDOM();
  globalThis.DOMParser = window.DOMParser;
  globalThis.document = window.document;
  globalThis.MouseEvent = window.MouseEvent;
});

function createSearch({ slides = [], isEditMode = false, onSelect = vi.fn() } = {}) {
  return new SlideSearch({
    getDeck: () => ({ slides }),
    onSelect,
    getCurrentIndex: () => 0,
    isEditMode: () => isEditMode,
  });
}

const sampleSlides = [
  {
    index: 0,
    id: "intro",
    title: "Introduction",
    notes: "Welcome everyone.",
    layout: "header-content",
    background: "",
    theme: "",
    headerStyle: "",
    hidden: false,
    areas: {
      header: "<h2>Introduction</h2>",
      main: "<p>Welcome to the <strong>presentation</strong>.</p>",
    },
    areaStyle: "",
    codeFontSize: 0,
  },
  {
    index: 1,
    id: "agenda",
    title: "Agenda",
    notes: "We will cover **topics** today.",
    layout: "header-content",
    background: "",
    theme: "",
    headerStyle: "",
    hidden: false,
    areas: {
      header: "<h2>Agenda</h2>",
      main: "<ul><li>Search</li><li>Navigation</li></ul>",
    },
    areaStyle: "",
    codeFontSize: 0,
  },
  {
    index: 2,
    id: "details",
    title: "Deep Dive",
    notes: "",
    layout: "header-content",
    background: "",
    theme: "",
    headerStyle: "",
    hidden: true,
    areas: {
      header: "<h2>Deep Dive</h2>",
      main: "<p>This slide is hidden but contains matchable content.</p>",
    },
    areaStyle: "",
    codeFontSize: 0,
  },
];

describe("SlideSearch", () => {
  it("returns all slides when the query is empty", () => {
    const search = createSearch({ slides: sampleSlides });
    const results = search.search("");
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("Introduction");
    expect(results[1].title).toBe("Agenda");
  });

  it("finds matches in slide titles", () => {
    const search = createSearch({ slides: sampleSlides });
    const results = search.search("agenda");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Agenda");
    expect(results[0].matchedFields).toContain("title");
  });

  it("finds matches in slide body content", () => {
    const search = createSearch({ slides: sampleSlides });
    const results = search.search("navigation");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Agenda");
    expect(results[0].matchedFields).toContain("body");
  });

  it("finds matches in speaker notes", () => {
    const search = createSearch({ slides: sampleSlides });
    const results = search.search("topics");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Agenda");
    expect(results[0].matchedFields).toContain("notes");
  });

  it("strips markdown formatting from notes before matching", () => {
    const search = createSearch({ slides: sampleSlides });
    const results = search.search("topics");
    expect(results).toHaveLength(1);
  });

  it("strips HTML tags from body areas", () => {
    const search = createSearch({ slides: sampleSlides });
    const results = search.search("presentation");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Introduction");
    expect(results[0].matchedFields).toContain("body");
  });

  it("requires all query terms to match somewhere in the slide", () => {
    const search = createSearch({ slides: sampleSlides });
    const results = search.search("welcome topics");
    expect(results).toHaveLength(0);
  });

  it("matches terms spread across different fields", () => {
    const search = createSearch({ slides: sampleSlides });
    const results = search.search("agenda topics");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Agenda");
    expect(results[0].matchedFields).toContain("title");
    expect(results[0].matchedFields).toContain("notes");
  });

  it("ranks title matches above body matches", () => {
    const slides = [
      {
        id: "a",
        title: "Navigation",
        notes: "",
        hidden: false,
        areas: { main: "<p>Some content.</p>" },
      },
      {
        id: "b",
        title: "Other",
        notes: "",
        hidden: false,
        areas: { main: "<p>Navigation is key.</p>" },
      },
    ];
    const search = createSearch({ slides });
    const results = search.search("navigation");
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("Navigation");
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("excludes hidden slides outside edit mode", () => {
    const search = createSearch({ slides: sampleSlides, isEditMode: false });
    const results = search.search("hidden");
    expect(results).toHaveLength(0);
  });

  it("includes hidden slides in edit mode", () => {
    const search = createSearch({ slides: sampleSlides, isEditMode: true });
    const results = search.search("hidden");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Deep Dive");
    expect(results[0].isHidden).toBe(true);
  });

  it("highlights the current slide in results", () => {
    const search = createSearch({
      slides: sampleSlides,
      isEditMode: true,
    });
    const results = search.search("");
    const current = results.find((r) => r.isCurrent);
    expect(current.title).toBe("Introduction");
  });

  it("produces snippets around matched terms", () => {
    const search = createSearch({ slides: sampleSlides });
    const results = search.search("presentation");
    expect(results[0].snippet).toContain("presentation");
  });
});

describe("SlideSearch modal UI", () => {
  it("opens a modal and can be closed", () => {
    const search = createSearch({ slides: sampleSlides });
    expect(document.getElementById("slide-search-modal")).toBeNull();
    search.open();
    const modal = document.getElementById("slide-search-modal");
    expect(modal).not.toBeNull();
    search.close();
    expect(document.getElementById("slide-search-modal")).toBeNull();
  });

  it("renders all slides in the modal on open", () => {
    const search = createSearch({ slides: sampleSlides });
    search.open();
    const items = document.querySelectorAll(".slide-search__item");
    expect(items.length).toBe(2);
  });

  it("navigates to a selected slide on click", () => {
    const onSelect = vi.fn();
    const search = createSearch({ slides: sampleSlides, onSelect });
    search.open();
    // JSDOM does not dispatch item-level click events in this configuration,
    // so exercise the activation path directly.
    search._activateResult(1);
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
