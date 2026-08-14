import { describe, it, expect } from "vitest";
import {
  validateVisualSystem,
  parseVisualSystem,
  DEFAULT_VISUAL_SYSTEM,
  visualSystemToComment,
  extractVisualSystemFromMarkdown,
} from "../data/ai/visual-system-schema.js";

const VALID_PALETTE = {
  base: "#0f172a",
  accent: "#06b6d4",
  highlight: "#ffffff",
};

const VALID_SYSTEM = {
  palette: VALID_PALETTE,
};

describe("validateVisualSystem", () => {
  it("returns a normalized visual system for valid input", () => {
    const result = validateVisualSystem(VALID_SYSTEM);
    expect(result).not.toBeNull();
    expect(result.palette.base).toBe("#0f172a");
    expect(result.palette.accent).toBe("#06b6d4");
    expect(result.palette.highlight).toBe("#ffffff");
  });

  it("returns null for missing palette", () => {
    const result = validateVisualSystem({});
    expect(result).toBeNull();
  });

  it("returns null for invalid hex color in palette", () => {
    const result = validateVisualSystem({
      palette: { ...VALID_PALETTE, base: "not-a-hex" },
    });
    expect(result).toBeNull();
  });

  it("accepts 3-digit and 8-digit hex colors", () => {
    const result = validateVisualSystem({
      palette: { ...VALID_PALETTE, base: "#fff", accent: "#ffffff00" },
    });
    expect(result).not.toBeNull();
    expect(result.palette.base).toBe("#fff");
    expect(result.palette.accent).toBe("#ffffff00");
  });

  it("returns null for missing palette color", () => {
    const result = validateVisualSystem({
      palette: { base: "#0f172a", accent: "#06b6d4" },
    });
    expect(result).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(validateVisualSystem(null)).toBeNull();
    expect(validateVisualSystem("string")).toBeNull();
    expect(validateVisualSystem(42)).toBeNull();
    expect(validateVisualSystem(undefined)).toBeNull();
  });

  it("ignores extra fields beyond the palette", () => {
    const result = validateVisualSystem({
      palette: VALID_PALETTE,
      typography: { character: "bold" },
      imagery: { mood: "moody" },
    });
    expect(result).not.toBeNull();
    expect(Object.keys(result)).toEqual(["palette"]);
  });
});

describe("parseVisualSystem", () => {
  it("returns the parsed visual system for valid input", () => {
    const result = parseVisualSystem(VALID_SYSTEM);
    expect(result.palette.base).toBe("#0f172a");
  });

  it("falls back to DEFAULT_VISUAL_SYSTEM for invalid input", () => {
    const result = parseVisualSystem(null);
    expect(result).toBe(DEFAULT_VISUAL_SYSTEM);
  });

  it("falls back to DEFAULT_VISUAL_SYSTEM for missing palette", () => {
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
    const comment = visualSystemToComment(VALID_SYSTEM);
    expect(comment).toMatch(/^<!-- visual-system: /);
    expect(comment).toMatch(/ -->$/);
    expect(comment).toContain('"base"');
    expect(comment).toContain('"#0f172a"');
  });
});

describe("extractVisualSystemFromMarkdown", () => {
  it("extracts the visual system and removes the comment", () => {
    const comment = visualSystemToComment(VALID_SYSTEM);
    const markdown = `${comment}\n\n# Slide 1\n\n---\n\n# Slide 2`;
    const { visualSystem, markdown: withoutComment } = extractVisualSystemFromMarkdown(markdown);
    expect(visualSystem).toEqual(VALID_SYSTEM);
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
