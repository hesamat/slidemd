import { describe, it, expect } from "vitest";
import {
  validateVisualSystem,
  parseVisualSystem,
  DEFAULT_VISUAL_SYSTEM,
  extractVisualSystemFromMarkdown,
} from "../data/ai/visual-system-schema.js";

const VALID_VISUAL_SYSTEM = {
  visualDirection:
    "Dark, technical, with bright accent walls. Use dark backgrounds for continuation and content slides. Use bright or light backgrounds sparingly for punctuation, transition, climax, and call-to-action moments.",
};

const LEGACY_MOOD_STYLE = {
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
  it("returns a normalized visual system for the new visualDirection shape", () => {
    const result = validateVisualSystem(VALID_VISUAL_SYSTEM);
    expect(result).not.toBeNull();
    expect(result.visualDirection).toBe(VALID_VISUAL_SYSTEM.visualDirection);
    expect(result.palette).toBeUndefined();
  });

  it("merges a legacy {mood, styleNotes} input into a single visualDirection", () => {
    const result = validateVisualSystem(LEGACY_MOOD_STYLE);
    expect(result).not.toBeNull();
    expect(result.visualDirection).toContain(LEGACY_MOOD_STYLE.mood);
    expect(result.visualDirection).toContain(LEGACY_MOOD_STYLE.styleNotes);
    expect(result.mood).toBeUndefined();
    expect(result.styleNotes).toBeUndefined();
  });

  it("treats a legacy palette as a valid visual direction", () => {
    const result = validateVisualSystem({ palette: LEGACY_PALETTE });
    expect(result).not.toBeNull();
    expect(result.visualDirection).not.toContain("#0f172a");
    expect(result.visualDirection).not.toContain("#06b6d4");
    expect(result.visualDirection).not.toContain("#ffffff");
    expect(result.visualDirection).toMatch(/dark|light|bright/i);
  });

  it("ignores an empty or partial legacy palette", () => {
    const result = validateVisualSystem({ palette: { base: "#0f172a" } });
    expect(result).not.toBeNull();
    expect(result.visualDirection).not.toContain("#0f172a");
    expect(result.visualDirection).toMatch(/dark/i);
  });

  it("returns null for non-object input", () => {
    expect(validateVisualSystem(null)).toBeNull();
    expect(validateVisualSystem("string")).toBeNull();
    expect(validateVisualSystem(42)).toBeNull();
    expect(validateVisualSystem(undefined)).toBeNull();
  });

  it("ignores extra fields beyond visualDirection", () => {
    const result = validateVisualSystem({
      ...VALID_VISUAL_SYSTEM,
      typography: { character: "bold" },
      imagery: { mood: "moody" },
    });
    expect(result).not.toBeNull();
    expect(Object.keys(result)).toEqual(["visualDirection"]);
  });
});

describe("parseVisualSystem", () => {
  it("returns the parsed visual system for valid visualDirection input", () => {
    const result = parseVisualSystem(VALID_VISUAL_SYSTEM);
    expect(result.visualDirection).toBe(VALID_VISUAL_SYSTEM.visualDirection);
  });

  it("converts a legacy palette into a visual direction", () => {
    const result = parseVisualSystem({ palette: LEGACY_PALETTE });
    expect(result.visualDirection).not.toContain("#0f172a");
    expect(result.visualDirection).not.toContain("#06b6d4");
    expect(result.visualDirection).toMatch(/dark|light|bright/i);
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

describe("extractVisualSystemFromMarkdown", () => {
  it("extracts the visual system and removes the comment", () => {
    const comment = `<!-- visual-system: {"visualDirection":"${VALID_VISUAL_SYSTEM.visualDirection}"} -->`;
    const markdown = `${comment}\n\n# Slide 1\n\n---\n\n# Slide 2`;
    const { visualSystem, markdown: withoutComment } = extractVisualSystemFromMarkdown(markdown);
    expect(visualSystem).toEqual(VALID_VISUAL_SYSTEM);
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
