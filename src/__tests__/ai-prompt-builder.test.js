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
  stripVisualIdentity,
  applyVisualSystemIdentity,
} from "../data/ai/ai-prompt-builder.js";
import { buildVisualStylingNote } from "../data/ai/ai-prompt-fragments.js";

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
      "layout: header-content\n@main\n```\nconsole.log('hi')\n```\n\n---\n\nlayout: header-content\n@main\n[Diagram: A, B]\n\n---\n\nlayout: media-span-right\n@media\n<img src=\"pic.png\">";
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

  it("includes the full first slide content for identity preservation when requested", () => {
    const md =
      "layout: focus\n@header\n# Dictionaries\n\n@main\n- Content\n\n@footer\nCOMP 1510 202630\n\n---\n\nlayout: header-content\n@header\n## Slide 2\n\n@main\n- Item";
    const summary = buildDeckSummary(md, true);
    expect(summary).toContain("First slide (preserve its identifying info):");
    expect(summary).toContain("COMP 1510 202630");
    expect(summary).toContain("# Dictionaries");
  });

  it("does not include the full first slide by default", () => {
    const md =
      "layout: focus\n@header\n# Dictionaries\n\n@main\n- Content\n\n@footer\nCOMP 1510 202630\n\n---\n\nlayout: header-content\n@header\n## Slide 2\n\n@main\n- Item";
    const summary = buildDeckSummary(md);
    expect(summary).not.toContain("First slide (preserve its identifying info):");
    expect(summary).not.toContain("COMP 1510 202630");
    expect(summary).toContain("1. [focus] Dictionaries");
  });

  it("enriches per-slide metadata when enrichPerSlide is true", () => {
    const md =
      "layout: header-content\n@header\n## Intro\n\n@main\n- Point 1\n- Point 2\n- Point 3\n\n---\n\nlayout: two-column\n@header\n## Code Slide\n\n@main\n```\nconsole.log('hi')\n```\n\n@media\n<img src=\"pic.png\">";
    const summary = buildDeckSummary(md, false, true);
    // First slide: heading + 3 bullets = 4 content lines (directives and @area excluded)
    expect(summary).toContain("1. [header-content] Intro (4 lines, 3 bullets)");
    // Second slide: heading + code line + img = 3 content lines (code fences excluded)
    expect(summary).toContain("2. [two-column] Code Slide (3 lines");
    expect(summary).toContain("code");
    expect(summary).toContain("image");
  });

  it("does not enrich per-slide metadata by default", () => {
    const md = "layout: header-content\n@header\n## Intro\n\n@main\n- Point 1\n- Point 2";
    const summary = buildDeckSummary(md);
    expect(summary).toContain("1. [header-content] Intro");
    expect(summary).not.toContain("bullets");
    expect(summary).not.toContain("lines");
  });

  it("enriched metadata marks diagrams", () => {
    const md = "layout: header-content\n@main\n[Diagram: A, B]";
    const summary = buildDeckSummary(md, false, true);
    expect(summary).toContain("diagram");
  });

  it("enriched metadata counts a single bullet correctly", () => {
    const md = "layout: header-content\n@main\n- Only one";
    const summary = buildDeckSummary(md, false, true);
    expect(summary).toContain("1 bullet");
    expect(summary).not.toContain("1 bullets");
  });

  it("enriched metadata excludes speaker notes from line count", () => {
    const md =
      "layout: header-content\n@header\n## Slide\n\n@main\n- Point 1\n\n<!-- notes: Remember to mention the backstory -->";
    const summary = buildDeckSummary(md, false, true);
    // Heading + 1 bullet = 2 content lines (notes excluded)
    expect(summary).toContain("(2 lines, 1 bullet)");
  });

  it("enriched metadata excludes code fence delimiters from line count", () => {
    const md = "layout: header-content\n@main\n```\nline1 = 1\nline2 = 2\n```";
    const summary = buildDeckSummary(md, false, true);
    // 2 code lines (fences excluded)
    expect(summary).toContain("2 lines");
  });

  it("enriched metadata excludes known frontmatter directives from line count", () => {
    const md =
      "layout: header-content\nhidden: true\nmedia-full-bleed: true\n@header\n## Slide\n\n@main\n- Point 1";
    const summary = buildDeckSummary(md, false, true);
    // Heading + 1 bullet = 2 content lines (hidden: and media-full-bleed: excluded)
    expect(summary).toContain("(2 lines, 1 bullet)");
  });

  it("enriched metadata does NOT exclude body prose with colons (Example:, Output:)", () => {
    const md =
      "layout: header-content\n@header\n## Slide\n\n@main\nExample: this is a labelled line\nOutput: another labelled line\n- Point 1";
    const summary = buildDeckSummary(md, false, true);
    // Heading + Example + Output + bullet = 4 content lines, 1 bullet
    expect(summary).toContain("(4 lines, 1 bullet)");
  });

  it("enriched metadata counts nested/indented bullets", () => {
    const md = "layout: header-content\n@main\n- Top level\n  - Nested bullet\n  - Another nested";
    const summary = buildDeckSummary(md, false, true);
    // 3 bullets total (including indented ones)
    expect(summary).toContain("3 bullets");
  });

  it("enriched metadata counts + and ordered list items as bullets", () => {
    const md = "layout: header-content\n@main\n- Dash item\n+ Plus item\n1. First\n2. Second";
    const summary = buildDeckSummary(md, false, true);
    // 4 list items total
    expect(summary).toContain("4 bullets");
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

  it("fix mode with polish batchMode throws (invalid combination)", () => {
    // fix mode always uses the fix fragment; batchMode "polish" is only valid
    // with mode "generate". Throw instead of silently ignoring batchMode so a
    // future caller does not get fix semantics when it expected polish.
    expect(() => buildBatchMessages(md, "fix", 0, 4, 12, "Deck: 12 slides.", "polish")).toThrow(
      /batchMode "polish" is only valid with mode "generate"/,
    );
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
    expect(suffix).toContain("story-driven");
    expect(suffix).toContain("payoff");
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
    expect(suffix).toContain("The application will apply the source slide's visual identity");
    expect(suffix).toContain("`theme:`");
    expect(suffix).toContain("`background:`");
  });

  it("tells reimagine to discard visual identity", () => {
    const suffix = buildGenerateOptionsSuffix({ mode: "reimagine", preserveVisualIdentity: false });
    expect(suffix).toContain("Do not preserve the original color theme");
    expect(suffix).toContain("Do not introduce new colors");
  });
});

describe("buildVisualStylingNote", () => {
  it("includes beat treatment guidance when a visual system is present", () => {
    const note = buildVisualStylingNote(true);
    expect(note).toContain("Beat treatment");
    expect(note).toContain("`continuation`");
    expect(note).toContain("`punctuation`");
    expect(note).toContain("`emotional`");
    expect(note).toContain("`energy: high`");
    expect(note).toContain("`relationship: break`");
  });

  it("does not include beat treatment guidance when no visual system is present", () => {
    const note = buildVisualStylingNote(false);
    expect(note).not.toContain("Beat treatment");
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

  it("preserves blank lines inside code fences (no global collapse)", () => {
    const md = `layout: header-content
theme: dark

@main
\`\`\`python
def a():
    pass


def b():
    pass
\`\`\``;
    const result = stripThemeAndBackground(md);
    expect(result).not.toContain("theme:");
    // Two blank lines between functions survive the strip.
    expect(result).toContain("pass\n\n\ndef");
  });

  it("collapses blank runs between content outside fences", () => {
    const md = "theme: dark\n\n@main\n- A\n\n\n- B\n\n\n\n- C";
    const result = stripThemeAndBackground(md);
    expect(result).not.toContain("theme:");
    // Runs of 2+ blank lines outside fences collapse to a single blank line.
    expect(result).toContain("- A\n\n- B\n\n- C");
  });

  it("strips indented and capitalized directives (the parser accepts both)", () => {
    const md = "  theme: dark\nTheme: dark\n  background: #fff\n@main\n- Item";
    const result = stripThemeAndBackground(md);
    expect(result).not.toContain("theme:");
    expect(result).not.toContain("Theme:");
    expect(result).not.toContain("background: #fff");
    expect(result).toContain("@main");
  });

  it("does not strip body text that starts with theme: or background:", () => {
    const md =
      "layout: header-content\n@main\n- Item 1\n\nbackground: the war began in 1939\n\ntheme: the main theme is hope";
    const result = stripThemeAndBackground(md);
    expect(result).toContain("background: the war began in 1939");
    expect(result).toContain("theme: the main theme is hope");
  });
});

describe("stripVisualIdentity", () => {
  it("strips themes and color backgrounds but keeps image backgrounds", () => {
    const md = `layout: full-image
theme: dark
background: #1a1a2e

@main
<img src="images/hero.png">

---

layout: header-content
background: url(images/bg.png) center/cover

@main
- Item`;
    const result = stripVisualIdentity(md);
    expect(result).not.toContain("theme:");
    expect(result).not.toContain("background: #1a1a2e");
    // A full-bleed image background the validator allowed is content, not identity.
    expect(result).toContain("background: url(images/bg.png) center/cover");
    expect(result).toContain("images/hero.png");
  });

  it("strips gradient backgrounds without image references", () => {
    const md = "layout: header-content\nbackground: linear-gradient(#000, #fff)\n@main\n- Item";
    const result = stripVisualIdentity(md);
    expect(result).not.toContain("background:");
  });

  it("strips indented and capitalized identity directives but keeps their image backgrounds", () => {
    const md = `  theme: dark
  background: #1a1a2e
Background: url(images/bg.png)

@main
- Item`;
    const result = stripVisualIdentity(md);
    expect(result).not.toContain("theme:");
    expect(result).not.toContain("background: #1a1a2e");
    expect(result).toContain("Background: url(images/bg.png)");
  });

  it("strips a color smuggled alongside an image in a mixed background", () => {
    // `background: #fff url(images/hero.png)` renders the color behind the
    // (possibly transparent) image — discard mode must not leave the stale
    // color behind while keeping the image. Only the url part survives.
    const md =
      "layout: full-image\nbackground: #fff url(images/hero.png) center/cover\n@main\n## Hero";
    const result = stripVisualIdentity(md);
    expect(result).toContain("background: url(images/hero.png) center/cover");
    expect(result).not.toMatch(/background:.*#fff/i);
  });

  it("strips a gradient smuggled alongside an image in a mixed background", () => {
    const md =
      "layout: full-image\nbackground: linear-gradient(rgba(0,0,0,.5), transparent) url(images/hero.png)\n@main\n## Hero";
    const result = stripVisualIdentity(md);
    expect(result).toContain("background: url(images/hero.png)");
    expect(result).not.toMatch(/background:.*gradient/i);
  });

  it("leaves a pure image background untouched", () => {
    const md = "layout: full-image\nbackground: url(images/hero.png)\n@main\n## Hero";
    const result = stripVisualIdentity(md);
    expect(result).toContain("background: url(images/hero.png)");
  });

  it("does not strip body text that starts with Theme: or Background:", () => {
    const md =
      "layout: header-content\n@main\n- Item 1\n\nBackground: the war began in 1939\n\nTheme: the main theme is hope";
    const result = stripVisualIdentity(md);
    expect(result).toContain("Background: the war began in 1939");
    expect(result).toContain("Theme: the main theme is hope");
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

  it("strips the internal media-span directive in both modes", () => {
    const md = "layout: media-span-right\nmedia-span: right\n@media\nImage";
    const fix = stripFrontmatter(md, "fix");
    expect(fix).toContain("layout: media-span-right");
    expect(fix).not.toContain("media-span:");
    const generate = stripFrontmatter(md, "generate");
    expect(generate).not.toContain("layout: media-span-right");
    expect(generate).not.toContain("media-span:");
  });

  it("generate mode strips layout, keeps background/theme", () => {
    const md = "layout: header-content\nbackground: #fff\ntheme: dark\n@main\n- Item";
    const result = stripFrontmatter(md, "generate");
    expect(result).not.toContain("layout: header-content");
    expect(result).toContain("background: #fff");
    expect(result).toContain("theme: dark");
  });

  it("does not strip body text that starts with a directive-like word", () => {
    const md =
      "layout: header-content\n@main\n- Item\n\nhidden: this is body text\n\ncode-font-size: this is also body text";
    const result = stripFrontmatter(md, "fix");
    expect(result).toContain("hidden: this is body text");
    expect(result).toContain("code-font-size: this is also body text");
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

const TEST_VISUAL_SYSTEM = {
  visualDirection:
    "Dark, technical, with bright accent walls for key moments. Use dark or neutral backgrounds for continuation and content slides. Use bright or light backgrounds sparingly for punctuation, transition, climax, and call-to-action moments.",
};

describe("applyVisualSystemIdentity", () => {
  it("keeps arbitrary background colors and image backgrounds", () => {
    const md = `layout: full-image\nbackground: #1a1a2e url(images/hero.png)\n@main\n<img src="images/hero.png">`;
    const result = applyVisualSystemIdentity(md, TEST_VISUAL_SYSTEM);
    expect(result).toContain("background: #1a1a2e url(images/hero.png)");
    expect(result).toContain("theme: dark");
  });

  it("keeps mixed backgrounds and infers the correct theme", () => {
    const md = `layout: full-image\nbackground: #ffffff url(images/hero.png)\n@main\n## Hero`;
    const result = applyVisualSystemIdentity(md, TEST_VISUAL_SYSTEM);
    expect(result).toContain("background: #ffffff url(images/hero.png)");
    expect(result).toContain("theme: light");
  });

  it("leaves body text untouched", () => {
    const md = `layout: header-content\n@main\n- theme: the main theme\n- background: the war began`;
    const result = applyVisualSystemIdentity(md, TEST_VISUAL_SYSTEM);
    expect(result).toContain("theme: the main theme");
    expect(result).toContain("background: the war began");
  });

  it("is a no-op when no visual system is provided", () => {
    const md = `layout: header-content\ntheme: dark\nbackground: #1a1a2e\n@main\n- Item`;
    const result = applyVisualSystemIdentity(md, null);
    expect(result).toContain("theme: dark");
    expect(result).toContain("background: #1a1a2e");
  });

  it("adds missing theme and background to every slide", () => {
    const md = `layout: header-content\n@header\n## Slide 1\n\n---\n\nlayout: two-column\n@main\n- Point`;
    const result = applyVisualSystemIdentity(md, TEST_VISUAL_SYSTEM);
    const slides = result.split("\n\n---\n\n");
    expect(slides).toHaveLength(2);
    for (const slide of slides) {
      expect(slide).toMatch(/^theme: dark$/m);
      expect(slide).toMatch(/^background: #1a1a2e$/m);
    }
  });

  it("replaces a transparent background with a real color matching the theme", () => {
    const md = `layout: header-content\ntheme: dark\nbackground: transparent\n@header\n## Slide`;
    const result = applyVisualSystemIdentity(md, TEST_VISUAL_SYSTEM);
    expect(result).toContain("theme: dark");
    expect(result).toContain("background: #1a1a2e");
    expect(result).not.toMatch(/^background:\s*transparent$/m);
  });

  it("fills a light theme with a real light background when background is missing", () => {
    const md = `layout: header-content\ntheme: light\n@header\n## Slide`;
    const result = applyVisualSystemIdentity(md, TEST_VISUAL_SYSTEM);
    expect(result).toContain("theme: light");
    expect(result).toContain("background: #ffffff");
  });

  it("corrects a mismatched theme for a solid-hex background", () => {
    const md = `layout: header-content\ntheme: light\nbackground: #0f172a\n@header\n## Slide`;
    const result = applyVisualSystemIdentity(md, TEST_VISUAL_SYSTEM);
    expect(result).toContain("theme: dark");
    expect(result).toContain("background: #0f172a");
  });

  it("does not restrict colors to a palette", () => {
    const md = `layout: header-content\nbackground: #ff5c5c\n@header\n## Slide\n\n@main\n- One\n- Two\n- Three`;
    const result = applyVisualSystemIdentity(md, TEST_VISUAL_SYSTEM);
    expect(result).toContain("background: #ff5c5c");
    expect(result).toContain("theme: light");
  });

  it("does not downgrade accent colors on dense content slides", () => {
    const md = `layout: focus\nbackground: #06b6d4\n@main\n## Title\n\n1. First\n2. Second\n3. Third\n4. Fourth`;
    const result = applyVisualSystemIdentity(md, TEST_VISUAL_SYSTEM);
    expect(result).toContain("background: #06b6d4");
    expect(result).toContain("theme: light");
  });

  it("replaces background: none with a real color", () => {
    const md = `layout: header-content\ntheme: dark\nbackground: none\n@header\n## Slide`;
    const result = applyVisualSystemIdentity(md, TEST_VISUAL_SYSTEM);
    expect(result).toContain("theme: dark");
    expect(result).toContain("background: #1a1a2e");
    expect(result).not.toMatch(/^background:\s*none$/m);
  });

  it("expands 3-digit hex colors and infers theme correctly", () => {
    // #abc expands to #aabbcc which is light
    const md = `layout: header-content\nbackground: #abc\n@header\n## Slide`;
    const result = applyVisualSystemIdentity(md, TEST_VISUAL_SYSTEM);
    expect(result).toContain("background: #abc");
    expect(result).toContain("theme: light");
  });

  it("handles 8-digit hex colors with alpha", () => {
    const md = `layout: header-content\nbackground: #0f172a80\n@header\n## Slide`;
    const result = applyVisualSystemIdentity(md, TEST_VISUAL_SYSTEM);
    expect(result).toContain("background: #0f172a80");
    expect(result).toContain("theme: dark");
  });

  it("does not crash on non-hex color names and infers theme as dark fallback", () => {
    const md = `layout: header-content\nbackground: red\n@header\n## Slide`;
    const result = applyVisualSystemIdentity(md, TEST_VISUAL_SYSTEM);
    expect(result).toBeDefined();
    // "red" is a valid named CSS color, so it should be kept
    expect(result).toContain("background: red");
    // themeForColor returns null for non-hex, so theme defaults to "dark"
    expect(result).toContain("theme: dark");
  });

  it("rejects javascript: URLs in background values", () => {
    const md = `layout: header-content\nbackground: url(javascript:alert(1))\n@header\n## Slide`;
    const result = applyVisualSystemIdentity(md, TEST_VISUAL_SYSTEM);
    expect(result).not.toContain("javascript:");
    expect(result).toMatch(/^background: #1a1a2e$/m);
  });

  it("rejects malformed background values and replaces with fallback", () => {
    const md = `layout: header-content\nbackground: expression(alert(1))\n@header\n## Slide`;
    const result = applyVisualSystemIdentity(md, TEST_VISUAL_SYSTEM);
    expect(result).not.toContain("expression");
    expect(result).toMatch(/^background: #1a1a2e$/m);
  });

  it("preserves valid gradient backgrounds", () => {
    const md = `layout: header-content\nbackground: linear-gradient(135deg, #0f172a, #1e293b)\n@header\n## Slide`;
    const result = applyVisualSystemIdentity(md, TEST_VISUAL_SYSTEM);
    expect(result).toContain("linear-gradient");
    expect(result).toContain("theme: dark");
  });

  it("preserves valid rgb() background colors", () => {
    const md = `layout: header-content\nbackground: rgb(15, 23, 42)\n@header\n## Slide`;
    const result = applyVisualSystemIdentity(md, TEST_VISUAL_SYSTEM);
    expect(result).toContain("background: rgb(15, 23, 42)");
  });

  it("preserves image part when replacing invalid color part", () => {
    const md = `layout: full-image\nbackground: expression(alert(1)) url(images/hero.png)\n@main\n<img src="images/hero.png">`;
    const result = applyVisualSystemIdentity(md, TEST_VISUAL_SYSTEM);
    expect(result).toContain("url(images/hero.png)");
    expect(result).not.toContain("expression");
    expect(result).toMatch(/^background: .*#1a1a2e/m);
  });
});
