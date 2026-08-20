import { describe, it, expect } from "vitest";
import { extractDirectives, injectDirectives } from "../data/ai/ai-directive-utils.js";
import { slidesToMarkdown } from "../data/ai/ai-response-parser.js";

// Tests the directives snapshot round-trip used by the AI import flow:
// extract from source deck at export time → inject into AI output at import
// time, gap-filling theme/background the external AI dropped. Mirrors the
// live orchestrator's extractDirectives + injectDirectives step.

const SOURCE_DECK = `layout: title-slide
theme: dark
background: #1e293b

@title
# Title

---

layout: header-content
theme: dark
background: #1e293b

@header
# Slide 2

@main
- Point`;

describe("import directives gap-fill round-trip", () => {
  it("extractDirectives captures theme and background from the source deck", () => {
    const directives = extractDirectives(SOURCE_DECK);
    expect(directives).toHaveLength(2);
    expect(directives[0]).toMatchObject({
      layout: "title-slide",
      theme: "dark",
      background: "#1e293b",
    });
    expect(directives[1]).toMatchObject({
      layout: "header-content",
      theme: "dark",
      background: "#1e293b",
    });
  });

  it("injectDirectives restores theme/background the AI dropped from a JSON response", () => {
    // Simulate an AI JSON response converted via slidesToMarkdown — the AI
    // kept layout but dropped theme/background from content.
    const aiSlides = [
      { layout: "title-slide", content: "@title\n# Title" },
      { layout: "header-content", content: "@header\n# Slide 2\n\n@main\n- Point" },
    ];
    const converted = slidesToMarkdown(aiSlides);
    expect(converted).not.toContain("theme: dark");
    expect(converted).not.toContain("background: #1e293b");

    const directives = extractDirectives(SOURCE_DECK);
    const gapFilled = injectDirectives(converted, directives, "generate");

    expect(gapFilled).toContain("theme: dark");
    expect(gapFilled).toContain("background: #1e293b");
  });

  it("does not overwrite theme/background the AI chose", () => {
    const aiSlides = [
      { layout: "title-slide", content: "theme: light\nbackground: white\n\n@title\n# Title" },
    ];
    const converted = slidesToMarkdown(aiSlides);
    const directives = [
      {
        layout: "title-slide",
        theme: "dark",
        background: "#1e293b",
        mediaFullBleed: false,
        areaBg: {},
      },
    ];
    const result = injectDirectives(converted, directives, "generate");
    expect(result).toContain("theme: light");
    expect(result).toContain("background: white");
    expect(result).not.toContain("theme: dark");
    expect(result).not.toContain("background: #1e293b");
  });

  it("index-matches directives positionally when the slide count differs from the snapshot", () => {
    // injectDirectives maps sections[i] to origDirectives[i] positionally.
    // When the AI returns more slides than the snapshot has directives, the
    // extra slides are left unchanged (no matching directive entry). The
    // import controller guards against this case by only calling
    // injectDirectives when the slide counts match, so cross-deck
    // restructures do not pick up another deck's colors.
    const aiSlides = [
      { layout: "title-slide", content: "@title\n# A" },
      { layout: "header-content", content: "@header\n# B" },
      { layout: "header-content", content: "@header\n# C" },
    ];
    const converted = slidesToMarkdown(aiSlides);
    const directives = [
      {
        layout: "title-slide",
        theme: "dark",
        background: "#1e293b",
        mediaFullBleed: false,
        areaBg: {},
      },
      {
        layout: "header-content",
        theme: "dark",
        background: "#1e293b",
        mediaFullBleed: false,
        areaBg: {},
      },
    ];
    const result = injectDirectives(converted, directives, "generate");
    // Only the first two slides get gap-filled (index-matched); the third
    // is unchanged because there's no matching directive entry.
    expect(result.match(/theme: dark/g)?.length).toBe(2);
  });

  it("is a no-op with an empty directives snapshot", () => {
    const aiSlides = [{ layout: "title-slide", content: "@title\n# Title" }];
    const converted = slidesToMarkdown(aiSlides);
    const result = injectDirectives(converted, [], "generate");
    expect(result).toBe(converted);
  });
});
