import { describe, it, expect } from "vitest";
import { MarkdownParser } from "../data/markdown-parser.js";

const parser = new MarkdownParser();

describe("MarkdownParser.parseBooleanDirectiveValue", () => {
  it("returns true for truthy values", () => {
    expect(parser.parseBooleanDirectiveValue("true")).toBe(true);
    expect(parser.parseBooleanDirectiveValue("1")).toBe(true);
    expect(parser.parseBooleanDirectiveValue("yes")).toBe(true);
    expect(parser.parseBooleanDirectiveValue("y")).toBe(true);
    expect(parser.parseBooleanDirectiveValue("on")).toBe(true);
  });

  it("returns false for falsy values", () => {
    expect(parser.parseBooleanDirectiveValue("false")).toBe(false);
    expect(parser.parseBooleanDirectiveValue("0")).toBe(false);
    expect(parser.parseBooleanDirectiveValue("no")).toBe(false);
    expect(parser.parseBooleanDirectiveValue("n")).toBe(false);
    expect(parser.parseBooleanDirectiveValue("off")).toBe(false);
  });

  it("returns null for unrecognized values", () => {
    expect(parser.parseBooleanDirectiveValue("maybe")).toBeNull();
    expect(parser.parseBooleanDirectiveValue("")).toBeNull();
    expect(parser.parseBooleanDirectiveValue(null)).toBeNull();
    expect(parser.parseBooleanDirectiveValue(undefined)).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(parser.parseBooleanDirectiveValue("TRUE")).toBe(true);
    expect(parser.parseBooleanDirectiveValue("FALSE")).toBe(false);
    expect(parser.parseBooleanDirectiveValue("Yes")).toBe(true);
  });
});

describe("MarkdownParser.extractTitle", () => {
  it("extracts first heading", () => {
    expect(parser.extractTitle("# Hello World")).toBe("Hello World");
  });

  it("extracts h2-h6 headings", () => {
    expect(parser.extractTitle("## Subtitle")).toBe("Subtitle");
    expect(parser.extractTitle("### Level 3")).toBe("Level 3");
  });

  it("returns empty string when no heading found", () => {
    expect(parser.extractTitle("Just plain text")).toBe("");
    expect(parser.extractTitle("")).toBe("");
  });

  it("skips headings inside code fences", () => {
    const md = "```\n# Not a title\n```\n# Real Title";
    expect(parser.extractTitle(md)).toBe("Real Title");
  });

  it("handles null/undefined input", () => {
    expect(parser.extractTitle(null)).toBe("");
    expect(parser.extractTitle(undefined)).toBe("");
  });
});

describe("MarkdownParser.splitSlides", () => {
  it("splits on --- separator", () => {
    const md = "# Slide 1\n---\n# Slide 2";
    const slides = parser.splitSlides(md);
    expect(slides).toHaveLength(2);
    expect(slides[0]).toBe("# Slide 1");
    expect(slides[1]).toBe("# Slide 2");
  });

  it("returns single slide when no separators", () => {
    const md = "# Just one slide";
    const slides = parser.splitSlides(md);
    expect(slides).toHaveLength(1);
    expect(slides[0]).toBe("# Just one slide");
  });

  it("ignores --- inside code fences", () => {
    const md = "# Slide 1\n```\n---\n```\n# Slide 2";
    const slides = parser.splitSlides(md);
    expect(slides).toHaveLength(1);
  });

  it("ignores --- inside tilde fences", () => {
    const md = "# Slide 1\n~~~\n---\n~~~\n# Slide 2";
    const slides = parser.splitSlides(md);
    expect(slides).toHaveLength(1);
  });

  it("skips empty segments between separators", () => {
    const md = "# A\n---\n\n---\n# B";
    const slides = parser.splitSlides(md);
    expect(slides).toHaveLength(2);
  });

  it("handles empty input", () => {
    expect(parser.splitSlides("")).toHaveLength(0);
    expect(parser.splitSlides(null)).toHaveLength(0);
  });
});

describe("MarkdownParser.splitFenceAwareSegments", () => {
  it("returns plain text as non-fence segment", () => {
    const segments = parser.splitFenceAwareSegments("hello world");
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({ inFence: false, text: "hello world" });
  });

  it("splits code fences into fence segments", () => {
    const md = "before\n```\ncode\n```\nafter";
    const segments = parser.splitFenceAwareSegments(md);
    expect(segments.length).toBeGreaterThanOrEqual(3);
    expect(segments[0].inFence).toBe(false);
    expect(segments[1].inFence).toBe(true);
    expect(segments[segments.length - 1].inFence).toBe(false);
  });

  it("handles tilde fences", () => {
    const md = "before\n~~~\ncode\n~~~\nafter";
    const segments = parser.splitFenceAwareSegments(md);
    expect(segments.some((s) => s.inFence)).toBe(true);
  });

  it("handles empty input", () => {
    const segments = parser.splitFenceAwareSegments("");
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe("");
  });
});

describe("MarkdownParser.extractNotes", () => {
  it("extracts speaker notes from HTML comments", () => {
    const md = "# Slide\n<!-- notes: Remember to explain this -->";
    expect(parser.extractNotes(md)).toBe("Remember to explain this");
  });

  it("joins multiple notes with double newline", () => {
    const md = "<!-- notes: First -->\n<!-- notes: Second -->";
    expect(parser.extractNotes(md)).toBe("First\n\nSecond");
  });

  it("returns empty string when no notes", () => {
    expect(parser.extractNotes("# Just a slide")).toBe("");
    expect(parser.extractNotes("")).toBe("");
  });

  it("ignores notes inside code fences", () => {
    const md = "```\n<!-- notes: not real -->\n```\n<!-- notes: real -->";
    expect(parser.extractNotes(md)).toBe("real");
  });
});

describe("MarkdownParser.stripNotes", () => {
  it("removes speaker notes from markdown", () => {
    const md = "# Slide\n<!-- notes: Remove me -->\nContent";
    const result = parser.stripNotes(md);
    expect(result).not.toContain("notes:");
    expect(result).toContain("# Slide");
    expect(result).toContain("Content");
  });

  it("preserves code fences with notes-like content", () => {
    const md = "```\n<!-- notes: keep -->\n```\n<!-- notes: remove -->";
    const result = parser.stripNotes(md);
    expect(result).toContain("<!-- notes: keep -->");
    expect(result).not.toContain("<!-- notes: remove -->");
  });
});

describe("MarkdownParser.extractDirective", () => {
  it("extracts a directive value", () => {
    const md = "layout: two-column\n# Hello";
    const result = parser.extractDirective(md, "layout");
    expect(result.value).toBe("two-column");
    expect(result.found).toBe(true);
    expect(result.markdown).not.toContain("layout:");
  });

  it("returns found=false when directive missing", () => {
    const md = "# Hello";
    const result = parser.extractDirective(md, "layout");
    expect(result.value).toBe("");
    expect(result.found).toBe(false);
  });

  it("is case-insensitive on directive name", () => {
    const md = "Theme: dark\n# Hello";
    const result = parser.extractDirective(md, "theme");
    expect(result.found).toBe(true);
    expect(result.value).toBe("dark");
  });

  it("ignores directives inside code fences", () => {
    const md = "```\nlayout: fake\n```\nlayout: real\n# Hello";
    const result = parser.extractDirective(md, "layout");
    expect(result.value).toBe("real");
  });

  it("handles empty input", () => {
    const result = parser.extractDirective("", "layout");
    expect(result.found).toBe(false);
    expect(result.markdown).toBe("");
  });
});

describe("MarkdownParser.escapeKatexBracketDelimiters", () => {
  it("escapes \\[ and \\] delimiters", () => {
    const result = parser.escapeKatexBracketDelimiters("\\[x^2\\]");
    expect(result).toContain("\\\\[x^2\\\\]");
  });

  it("leaves plain text unchanged", () => {
    const result = parser.escapeKatexBracketDelimiters("hello world");
    expect(result).toBe("hello world");
  });

  it("leaves code fences unchanged", () => {
    const md = "```\n\\[x\\]\n```";
    const result = parser.escapeKatexBracketDelimiters(md);
    expect(result).toBe(md);
  });

  it("converts $$ math blocks to single-line format", () => {
    const md = "$$\nx^2 + y^2\n$$";
    const result = parser.escapeKatexBracketDelimiters(md);
    expect(result).toContain("$$x^2 + y^2$$");
  });
});

describe("MarkdownParser.parseAreas", () => {
  it("returns all content in main when no area markers", () => {
    const md = "# Hello\nSome content";
    const result = parser.parseAreas(md);
    expect(result.areas).toHaveProperty("main");
    expect(result.areas.main).toContain("# Hello");
  });

  it("splits content by @area markers", () => {
    const md = "Header text\n@sidebar\nSide content\n@main\nMain content";
    const result = parser.parseAreas(md);
    expect(result.areas).toHaveProperty("sidebar");
    expect(result.areas).toHaveProperty("main");
    expect(result.areas.sidebar).toContain("Side content");
    expect(result.areas.main).toContain("Main content");
  });

  it("ignores @area markers inside code fences", () => {
    const md = "```\n@fake\n```\n@real\nContent";
    const result = parser.parseAreas(md);
    expect(result.areas).not.toHaveProperty("fake");
    expect(result.areas).toHaveProperty("real");
  });

  it("skips empty areas", () => {
    const md = "@sidebar\n\n@main\nContent";
    const result = parser.parseAreas(md);
    expect(result.areas).not.toHaveProperty("sidebar");
    expect(result.areas).toHaveProperty("main");
  });

  it("records areaOffsets", () => {
    const md = "@sidebar\nSide\n@main\nMain";
    const result = parser.parseAreas(md);
    expect(result.areaOffsets).toHaveProperty("sidebar");
    expect(result.areaOffsets).toHaveProperty("main");
  });
});

describe("MarkdownParser.collapseUnsupportedAreas", () => {
  it("strips unsupported area markers but preserves their content", () => {
    const md = "@main\nMain\n@secondary\nExtra";
    const result = parser.collapseUnsupportedAreas(md, ["main", "media"]);
    expect(result).toContain("@main");
    expect(result).toContain("Main");
    expect(result).not.toContain("@secondary");
    // Content from @secondary is absorbed into @main
    expect(result).toContain("Extra");
  });

  it("renames @header to @title when layout expects title", () => {
    const md = "@header\nTitle content";
    const result = parser.collapseUnsupportedAreas(md, ["title", "footer"]);
    expect(result).toContain("@title");
    expect(result).not.toContain("@header");
    expect(result).toContain("Title content");
  });

  it("renames @title to @header when layout expects header", () => {
    const md = "@title\nTitle content";
    const result = parser.collapseUnsupportedAreas(md, ["header", "main", "footer"]);
    expect(result).toContain("@header");
    expect(result).not.toContain("@title");
    expect(result).toContain("Title content");
  });

  it("preserves content before first area marker", () => {
    const md = "Preamble\n@media\nMedia content";
    const result = parser.collapseUnsupportedAreas(md, ["main", "media"]);
    expect(result).toContain("Preamble");
    expect(result).toContain("@media");
  });

  it("ignores @area markers inside code fences", () => {
    const md = "```\n@fake\n```\n@main\nContent";
    const result = parser.collapseUnsupportedAreas(md, ["main"]);
    expect(result).toContain("@fake");
    expect(result).toContain("@main");
  });

  it("returns unchanged when all areas are supported", () => {
    const md = "@main\nHello\n@media\nWorld";
    const result = parser.collapseUnsupportedAreas(md, ["main", "media"]);
    expect(result).toBe(md);
  });

  it("handles multiple unsupported areas — content absorbed into main", () => {
    const md = "@main\nA\n@secondary\nB\n@sidebar\nC";
    const result = parser.collapseUnsupportedAreas(md, ["main"]);
    expect(result).toContain("@main");
    expect(result).not.toContain("@secondary");
    expect(result).not.toContain("@sidebar");
    expect(result).toContain("B");
    expect(result).toContain("C");
  });

  it("does not rename alias when layout already supports both", () => {
    const md = "@header\nHello";
    const result = parser.collapseUnsupportedAreas(md, ["header", "main"]);
    expect(result).toContain("@header");
    expect(result).not.toContain("@title");
  });
});

describe("MarkdownParser.computeAreaOffsets", () => {
  it("returns main offset at 0 for simple content", () => {
    const offsets = parser.computeAreaOffsets("# Hello\nWorld");
    expect(offsets.main).toBe(1);
  });

  it("skips directives when computing main offset", () => {
    const md = "layout: two-column\n# Hello";
    const offsets = parser.computeAreaOffsets(md);
    expect(offsets.main).toBe(1);
  });

  it("records offsets for named areas", () => {
    const md = "@sidebar\nContent\n@main\nMain content";
    const offsets = parser.computeAreaOffsets(md);
    expect(offsets.sidebar).toBe(1);
    expect(offsets.main).toBe(3);
  });
});

describe("MarkdownParser.convertMermaidCodeBlocksToDiv", () => {
  it("converts mermaid code blocks to divs", () => {
    const html = '<pre><code class="language-mermaid">graph TD</code></pre>';
    const result = parser.convertMermaidCodeBlocksToDiv(html);
    expect(result).toContain('<div class="mermaid"');
    expect(result).toContain("data-mermaid-source");
    expect(result).not.toContain("<pre>");
  });

  it("leaves non-mermaid code blocks unchanged", () => {
    const html = '<pre><code class="language-javascript">const x = 1;</code></pre>';
    const result = parser.convertMermaidCodeBlocksToDiv(html);
    expect(result).toBe(html);
  });

  it("preserves data-source-line attribute", () => {
    const html = '<pre><code class="language-mermaid" data-source-line="5">graph TD</code></pre>';
    const result = parser.convertMermaidCodeBlocksToDiv(html);
    expect(result).toContain('data-source-line="5"');
  });

  it("handles lang-mermaid class variant", () => {
    const html = '<pre><code class="lang-mermaid">graph TD</code></pre>';
    const result = parser.convertMermaidCodeBlocksToDiv(html);
    expect(result).toContain('<div class="mermaid"');
  });
});
