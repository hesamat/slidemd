import { describe, it, expect } from "vitest";
import {
  getAllowedLayoutList,
  buildMessages,
  buildDeckSummary,
  buildBatchMessages,
  buildGenerateOptionsSuffix,
  splitSlidesForAi,
  BATCH_SIZE,
  stripFrontmatter,
  stripThemeAndBackground,
} from "../data/ai/ai-prompt-builder.js";

describe("buildMessages", () => {
  it("strips frontmatter from markdown in fix mode but keeps layout", () => {
    const md =
      "layout: header-content\nbackground: #fff\ntheme: dark\n@header\n## Title\n\n@main\n- Item";
    const { user } = buildMessages(md, "fix");
    expect(user).toContain("@header");
    expect(user).toContain("- Item");
    // Layout is kept so AI can preserve it
    const markdownSection = user.split("Input markdown:")[1] || "";
    expect(markdownSection).toContain("layout: header-content");
    // Background and theme are stripped (restored post-AI)
    expect(markdownSection).not.toContain("background: #fff");
    expect(markdownSection).not.toContain("theme: dark");
  });

  it("keeps background and theme in generate mode", () => {
    const md =
      "layout: header-content\nbackground: #fff\ntheme: dark\n@header\n## Title\n\n@main\n- Item";
    const { user } = buildMessages(md, "generate");
    expect(user).toContain("@header");
    expect(user).toContain("- Item");
    expect(user).toContain("background: #fff");
    expect(user).toContain("theme: dark");
    // Layout should be stripped from the input markdown (only kept in prompt examples)
    expect(user).not.toContain("layout: header-content");
  });

  it("preserves directives inside code blocks", () => {
    const md =
      "layout: header-content\n@main\n```\nlayout: two-column\nbackground: #fff\n```\n- Item";
    const { user } = buildMessages(md, "fix");
    // Both the outer layout and the code block content are kept
    expect(user).toContain("layout: header-content");
    expect(user).toContain("layout: two-column");
    expect(user).toContain("background: #fff");
  });

  it("includes hidden in stripped frontmatter", () => {
    const md = "layout: title-slide\nhidden: true\n# Title";
    const { user } = buildMessages(md, "fix");
    expect(user).not.toContain("hidden:");
    expect(user).toContain("# Title");
  });

  it("returns system prompt for fix mode", () => {
    const { system } = buildMessages("# Test", "fix");
    expect(system).toContain("You are a SlideMD editor");
  });

  it("returns system prompt for generate mode", () => {
    const { system } = buildMessages("# Test", "generate");
    expect(system).toContain("You are a SlideMD editor");
  });

  it("replaces {{layoutList}} in the system prompt", () => {
    const { system } = buildMessages("# Test", "fix");
    expect(system).not.toContain("{{layoutList}}");
    expect(system).toContain("header-content");
    expect(system).toContain("title-slide");
  });
});

describe("buildDeckSummary", () => {
  it("produces correct outline with slide count and layouts", () => {
    const md =
      "layout: header-content\n@header\n## Intro\n\n@main\n- Hi\n\n---\n\nlayout: two-column\n@header\n## Overview\n\n@main\n- Left\n\n@media\n- Right";
    const summary = buildDeckSummary(md);
    expect(summary).toContain("Deck: 2 slides");
    expect(summary).toContain("Layouts: header-content, two-column");
    expect(summary).toContain("1. [header-content] Intro");
    expect(summary).toContain("2. [two-column] Overview");
  });

  it("detects code blocks, diagrams, and images", () => {
    const md =
      "layout: header-content\n@main\n```\nconsole.log('hi')\n```\n\n---\n\nlayout: header-content\n@main\n[Diagram: A, B]\n\n---\n\nlayout: media-span\n@media\n<img src=\"pic.png\">";
    const summary = buildDeckSummary(md);
    expect(summary).toContain("Features: code blocks, diagrams, images");
  });

  it("handles single slide", () => {
    const md = "layout: title-slide\n@title\n# Welcome";
    const summary = buildDeckSummary(md);
    expect(summary).toContain("Deck: 1 slides");
    expect(summary).toContain("1. [title-slide] Welcome");
  });

  it("does not split on `---` inside code blocks", () => {
    const md =
      "layout: header-content\n@header\n## Slide 1\n\n@main\n```\n---\n```\n\n---\n\nlayout: header-content\n@header\n## Slide 2\n\n@main\n- Item";
    const summary = buildDeckSummary(md);
    expect(summary).toContain("Deck: 2 slides");
    expect(summary).toContain("1. [header-content] Slide 1");
    expect(summary).toContain("2. [header-content] Slide 2");
  });
});

describe("buildBatchMessages", () => {
  const md = Array.from(
    { length: 12 },
    (_, i) => `layout: header-content\n@header\n## Slide ${i + 1}\n\n@main\n- Content ${i + 1}`,
  ).join("\n\n---\n\n");

  it("fix mode: sends chunk only, not full markdown", () => {
    const { user } = buildBatchMessages(md, "fix", 0, 4, 12);
    expect(user).toContain("## Slide 1");
    expect(user).toContain("## Slide 4");
    // Right neighbor (slide 5) is included as context, but slides 6+ are not
    expect(user).toContain("## Slide 5");
    expect(user).not.toContain("## Slide 6");
    expect(user).not.toContain("## Slide 12");
  });

  it("fix mode: includes neighbor context on left edge", () => {
    const { user } = buildBatchMessages(md, "fix", 4, 8, 12);
    expect(user).toContain("CONTEXT SLIDE");
    expect(user).toContain("## Slide 4");
    expect(user).toContain("## Slide 5");
    expect(user).toContain("## Slide 8");
    expect(user).toContain("## Slide 9");
  });

  it("fix mode: no left neighbor for first batch", () => {
    const { user } = buildBatchMessages(md, "fix", 0, 4, 12);
    const contextMatches = user.match(/CONTEXT SLIDE/g);
    expect(contextMatches).toHaveLength(1); // only right neighbor
  });

  it("fix mode: no right neighbor for last batch", () => {
    const { user } = buildBatchMessages(md, "fix", 8, 12, 12);
    const contextMatches = user.match(/CONTEXT SLIDE/g);
    expect(contextMatches).toHaveLength(1); // only left neighbor
  });

  it("fix mode: no neighbors for middle batch with both edges", () => {
    const { user } = buildBatchMessages(md, "fix", 4, 8, 12);
    const contextMatches = user.match(/CONTEXT SLIDE/g);
    expect(contextMatches).toHaveLength(2); // both left and right
  });

  it("generate mode: includes deck summary prefix", () => {
    const { user } = buildBatchMessages(md, "generate", 0, 4, 12, "Deck: 12 slides.");
    expect(user).toContain("Deck: 12 slides.");
    expect(user).toContain("## Slide 1");
    expect(user).toContain("## Slide 4");
  });

  it("generate mode: chunk only, not full markdown", () => {
    const { user } = buildBatchMessages(md, "generate", 4, 8, 12, "Deck: 12 slides.");
    expect(user).toContain("## Slide 5");
    expect(user).toContain("## Slide 8");
    expect(user).not.toContain("## Slide 9");
    expect(user).not.toContain("## Slide 1");
  });

  it("returns correct pagination instruction for fix mode", () => {
    const { user } = buildBatchMessages(md, "fix", 0, 4, 12);
    expect(user).toContain("CRITICAL: You must return EXACTLY 4 slide(s)");
    expect(user).toContain("indices 0 through 3");
  });

  it("returns correct pagination instruction for generate mode", () => {
    const { user } = buildBatchMessages(md, "generate", 0, 4, 12);
    expect(user).toContain("Return exactly 4 slide(s)");
  });

  it("polish mode uses polish-prompt fragment in generate mode", () => {
    // polish-prompt.md contains "Rejoin split code lines" — generate-prompt does not.
    const { user } = buildBatchMessages(md, "generate", 0, 4, 12, "Deck: 12 slides.", "polish");
    expect(user).toContain("Rejoin split code lines");
    // Still uses generate-mode pagination (not fix-mode CRITICAL instruction)
    expect(user).toContain("Return exactly 4 slide(s)");
  });

  it("non-polish mode uses generate-prompt fragment", () => {
    const { user } = buildBatchMessages(md, "generate", 0, 4, 12, "Deck: 12 slides.");
    expect(user).toContain("Refine this SlideMD presentation");
    expect(user).not.toContain("Rejoin split code lines");
  });
});

describe("buildGenerateOptionsSuffix", () => {
  it("returns empty by default", () => {
    expect(buildGenerateOptionsSuffix({})).toBe("");
  });

  it("adds flow instruction", () => {
    const suffix = buildGenerateOptionsSuffix({ flow: "persuasive" });
    expect(suffix).toContain("persuasive");
    expect(suffix).toContain("argument-driven");
  });

  it("adds story flow instruction", () => {
    const suffix = buildGenerateOptionsSuffix({ flow: "story" });
    expect(suffix).toContain("narrative");
    expect(suffix).toContain("story arc");
  });

  it("adds speaker notes instruction when requested", () => {
    const suffix = buildGenerateOptionsSuffix({ addSpeakerNotes: true });
    expect(suffix).toContain("Add useful speaker notes");
  });

  it("asks to preserve existing notes when not adding new ones", () => {
    const suffix = buildGenerateOptionsSuffix({ mode: "polish" });
    expect(suffix).toContain("Do not add new speaker notes");
  });

  it("preserves visual identity when requested", () => {
    const suffix = buildGenerateOptionsSuffix({ preserveVisualIdentity: true });
    expect(suffix).toContain("Preserve the original theme");
  });

  it("tells reimagine to discard visual identity", () => {
    const suffix = buildGenerateOptionsSuffix({ mode: "reimagine", preserveVisualIdentity: false });
    expect(suffix).toContain("Do not preserve the original theme");
    expect(suffix).toContain("You may introduce new `theme:`");
  });
});

describe("stripThemeAndBackground", () => {
  it("removes theme and background but keeps layout", () => {
    const md = "layout: header-content\nbackground: #fff\ntheme: dark\n@main\n- Item";
    const result = stripThemeAndBackground(md);
    expect(result).toContain("layout: header-content");
    expect(result).not.toContain("background: #fff");
    expect(result).not.toContain("theme: dark");
    expect(result).toContain("@main");
  });

  it("leaves code fences untouched", () => {
    const md = "```yaml\ntheme: dark\n```\n@main\n- Item";
    const result = stripThemeAndBackground(md);
    expect(result).toContain("theme: dark");
    expect(result).toContain("@main");
  });
});

describe("getAllowedLayoutList", () => {
  it("includes header-content and title-slide layouts", () => {
    const list = getAllowedLayoutList();
    expect(list).toContain("header-content");
    expect(list).toContain("title-slide");
  });

  it("lists allowed areas per layout in a compact format", () => {
    const list = getAllowedLayoutList();
    expect(list).toContain("@main");
    // two-column should list @media but NOT @secondary
    expect(list).toMatch(/two-column:.*@media/);
    expect(list).not.toMatch(/two-column:.*@secondary/);
    // three-column should list @secondary
    expect(list).toMatch(/three-column:.*@secondary/);
    // full-image should only have @main
    expect(list).toMatch(/full-image: @main$/);
  });
});

describe("stripFrontmatter", () => {
  it("fix mode keeps layout, strips background/theme", () => {
    const md = "layout: header-content\nbackground: #fff\ntheme: dark\n@main\n- Item";
    const result = stripFrontmatter(md, "fix");
    expect(result).toContain("layout: header-content");
    expect(result).not.toContain("background: #fff");
    expect(result).not.toContain("theme: dark");
    expect(result).toContain("@main");
  });

  it("generate mode strips layout, keeps background/theme", () => {
    const md = "layout: header-content\nbackground: #fff\ntheme: dark\n@main\n- Item";
    const result = stripFrontmatter(md, "generate");
    expect(result).not.toContain("layout: header-content");
    expect(result).toContain("background: #fff");
    expect(result).toContain("theme: dark");
  });
});

describe("splitSlidesForAi", () => {
  it("splits markdown into individual slides", () => {
    const md =
      "layout: header-content\n@header\n## Slide 1\n\n---\n\nlayout: title-slide\n# Slide 2";
    const slides = splitSlidesForAi(md, "fix");
    expect(slides).toHaveLength(2);
    expect(slides[0]).toContain("## Slide 1");
    expect(slides[1]).toContain("# Slide 2");
  });
});

describe("BATCH_SIZE", () => {
  it("is 8", () => {
    expect(BATCH_SIZE).toBe(8);
  });
});
