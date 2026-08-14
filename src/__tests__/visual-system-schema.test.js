import { describe, it, expect } from "vitest";
import {
  validateVisualSystem,
  parseVisualSystem,
  DEFAULT_VISUAL_SYSTEM,
  visualSystemToComment,
  extractVisualSystemFromMarkdown,
} from "../data/ai/visual-system-schema.js";

const VALID_STYLE = {
  mood: "Dark, technical, with bright accent walls.",
  styleNotes:
    "Use dark backgrounds for continuation and content slides. Use bright or light backgrounds sparingly for punctuation, transition, climax, and call-to-action moments.",
};

const LEGACY_PALETTE = {
  base: "#0f172a",
  accent: "#06b6d4",
  highlight: "#ffffff",
};

describe("validateVisualSystem", () => {
  it("returns a normalized visual system for the new style-note shape", () => {
    const result = validateVisualSystem(VALID_STYLE);
    expect(result).not.toBeNull();
    expect(result.mood).toBe(VALID_STYLE.mood);
    expect(result.styleNotes).toBe(VALID_STYLE.styleNotes);
    expect(result.palette).toBeUndefined();
  });

  it("treats a legacy palette as a valid style note", () => {
    const result = validateVisualSystem({ palette: LEGACY_PALETTE });
    expect(result).not.toBeNull();
    expect(result.mood).toContain("#0f172a");
    expect(result.styleNotes).toContain("#0f172a");
    expect(result.styleNotes).toContain("#06b6d4");
    expect(result.styleNotes).toContain("#ffffff");
  });

  it("ignores an empty or partial legacy palette", () => {
    const result = validateVisualSystem({ palette: { base: "#0f172a" } });
    expect(result).not.toBeNull();
    expect(result.mood).toContain("#0f172a");
    expect(result.styleNotes).toContain("#0f172a");
  });

  it("returns null for non-object input", () => {
    expect(validateVisualSystem(null)).toBeNull();
    expect(validateVisualSystem("string")).toBeNull();
    expect(validateVisualSystem(42)).toBeNull();
    expect(validateVisualSystem(undefined)).toBeNull();
  });

  it("ignores extra fields beyond mood and styleNotes", () => {
    const result = validateVisualSystem({
      ...VALID_STYLE,
      typography: { character: "bold" },
      imagery: { mood: "moody" },
    });
    expect(result).not.toBeNull();
    expect(Object.keys(result)).toEqual(["mood", "styleNotes"]);
  });
});

describe("parseVisualSystem", () => {
  it("returns the parsed visual system for valid style-note input", () => {
    const result = parseVisualSystem(VALID_STYLE);
    expect(result.mood).toBe(VALID_STYLE.mood);
    expect(result.styleNotes).toBe(VALID_STYLE.styleNotes);
  });

  it("converts a legacy palette into a style note", () => {
    const result = parseVisualSystem({ palette: LEGACY_PALETTE });
    expect(result.mood).toContain("#0f172a");
    expect(result.styleNotes).toContain("#06b6d4");
  });

  it("falls back to DEFAULT_VISUAL_SYSTEM for invalid input", () => {
    const result = parseVisualSystem(null);
    expect(result).toBe(DEFAULT_VISUAL_SYSTEM);
  });

  it("falls back to DEFAULT_VISUAL_SYSTEM for empty input", () => {
    const result = parseVisualSystem({});
    expect(result).toBe(DEFAULT_VISUAL_SYSTEM);
  });

  it("falls back to DEFAULT_VISUAL_SYSTEM for undefined", () => {
    const result = parseVisualSystem(undefined);
    expect(result).toBe(DEFAULT_VISUAL_SYSTEM);
  });
});

describe("visualSystemToComment", () => {
  it("serializes a valid visual system as a top-of-markdown HTML comment", () => {
    const comment = visualSystemToComment(VALID_STYLE);
    expect(comment).toMatch(/^<!-- visual-system: /);
    expect(comment).toMatch(/ -->$/);
    expect(comment).toContain('"mood"');
    expect(comment).toContain('"styleNotes"');
  });
});

describe("extractVisualSystemFromMarkdown", () => {
  it("extracts the visual system and removes the comment", () => {
    const comment = visualSystemToComment(VALID_STYLE);
    const markdown = `${comment}\n\n# Slide 1\n\n---\n\n# Slide 2`;
    const { visualSystem, markdown: withoutComment } = extractVisualSystemFromMarkdown(markdown);
    expect(visualSystem).toEqual(VALID_STYLE);
    expect(withoutComment).not.toContain("visual-system");
    expect(withoutComment.startsWith("# Slide 1")).toBe(true);
  });

  it("returns null and original markdown when no comment is present", () => {
    const markdown = "# Slide 1\n\n---\n\n# Slide 2";
    const { visualSystem, markdown: withoutComment } = extractVisualSystemFromMarkdown(markdown);
    expect(visualSystem).toBeNull();
    expect(withoutComment).toBe(markdown);
  });

  it("ignores invalid visual-system comments", () => {
    const markdown = "<!-- visual-system: not-json -->\n# Slide 1";
    const { visualSystem, markdown: withoutComment } = extractVisualSystemFromMarkdown(markdown);
    expect(visualSystem).toBeNull();
    expect(withoutComment).toBe(markdown);
  });
});
