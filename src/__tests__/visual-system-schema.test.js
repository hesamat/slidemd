import { describe, it, expect } from "vitest";
import {
  validateVisualSystem,
  parseVisualSystem,
  DEFAULT_VISUAL_SYSTEM,
} from "../data/ai/visual-system-schema.js";

const VALID_PALETTE = {
  base: "#0f172a",
  surface: "#1e293b",
  accent: "#06b6d4",
  contrast: "#f59e0b",
  highlight: "#ffffff",
};

const VALID_SYSTEM = {
  palette: VALID_PALETTE,
  typography: {
    character: "bold editorial",
    headline: "large, compact",
    body: "clean sans-serif",
  },
  composition: {
    density: "medium",
    whitespace: "generous",
    alignment: "left-dominant",
  },
  imagery: {
    role: "emotional punctuation",
    mood: "moody, atmospheric",
    treatment: "full-bleed",
  },
  motifs: ["accent divider lines", "oversized chapter numbers"],
  contrastRules: ["Use stark white for takeaways", "Avoid 3 consecutive identical slides"],
};

describe("validateVisualSystem", () => {
  it("returns a normalized visual system for valid input", () => {
    const result = validateVisualSystem(VALID_SYSTEM);
    expect(result).not.toBeNull();
    expect(result.palette.base).toBe("#0f172a");
    expect(result.palette.accent).toBe("#06b6d4");
    expect(result.typography.character).toBe("bold editorial");
    expect(result.composition.density).toBe("medium");
    expect(result.imagery.mood).toBe("moody, atmospheric");
    expect(result.motifs).toHaveLength(2);
    expect(result.contrastRules).toHaveLength(2);
  });

  it("returns null for missing palette", () => {
    const result = validateVisualSystem({ typography: VALID_SYSTEM.typography });
    expect(result).toBeNull();
  });

  it("returns null for invalid hex color in palette", () => {
    const result = validateVisualSystem({
      ...VALID_SYSTEM,
      palette: { ...VALID_PALETTE, base: "not-a-hex" },
    });
    expect(result).toBeNull();
  });

  it("accepts 3-digit and 8-digit hex colors", () => {
    const result = validateVisualSystem({
      ...VALID_SYSTEM,
      palette: { ...VALID_PALETTE, base: "#fff", surface: "#ffffff00" },
    });
    expect(result).not.toBeNull();
    expect(result.palette.base).toBe("#fff");
    expect(result.palette.surface).toBe("#ffffff00");
  });

  it("returns null for missing palette color", () => {
    const result = validateVisualSystem({
      ...VALID_SYSTEM,
      palette: { base: "#0f172a", surface: "#1e293b", accent: "#06b6d4", contrast: "#f59e0b" },
    });
    expect(result).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(validateVisualSystem(null)).toBeNull();
    expect(validateVisualSystem("string")).toBeNull();
    expect(validateVisualSystem(42)).toBeNull();
    expect(validateVisualSystem(undefined)).toBeNull();
  });

  it("fills missing typography from default while keeping valid palette", () => {
    const result = validateVisualSystem({ palette: VALID_PALETTE });
    expect(result).not.toBeNull();
    expect(result.palette.base).toBe("#0f172a");
    expect(result.typography.character).toBe(DEFAULT_VISUAL_SYSTEM.typography.character);
    expect(result.typography.headline).toBe(DEFAULT_VISUAL_SYSTEM.typography.headline);
  });

  it("fills missing composition from default, clamps invalid enum to default", () => {
    const result = validateVisualSystem({
      palette: VALID_PALETTE,
      composition: { density: "invalid", whitespace: "generous", alignment: "centered" },
    });
    expect(result).not.toBeNull();
    expect(result.composition.density).toBe(DEFAULT_VISUAL_SYSTEM.composition.density);
    expect(result.composition.whitespace).toBe("generous");
    expect(result.composition.alignment).toBe("centered");
  });

  it("fills missing imagery from default", () => {
    const result = validateVisualSystem({ palette: VALID_PALETTE });
    expect(result).not.toBeNull();
    expect(result.imagery.role).toBe(DEFAULT_VISUAL_SYSTEM.imagery.role);
    expect(result.imagery.mood).toBe(DEFAULT_VISUAL_SYSTEM.imagery.mood);
  });

  it("clamps motifs to max 3 items", () => {
    const result = validateVisualSystem({
      ...VALID_SYSTEM,
      motifs: ["one", "two", "three", "four", "five"],
    });
    expect(result).not.toBeNull();
    expect(result.motifs).toHaveLength(3);
    expect(result.motifs).toEqual(["one", "two", "three"]);
  });

  it("clamps contrastRules to max 3 items", () => {
    const result = validateVisualSystem({
      ...VALID_SYSTEM,
      contrastRules: ["rule1", "rule2", "rule3", "rule4"],
    });
    expect(result).not.toBeNull();
    expect(result.contrastRules).toHaveLength(3);
  });

  it("falls back to default motifs when array is empty", () => {
    const result = validateVisualSystem({
      ...VALID_SYSTEM,
      motifs: [],
      contrastRules: [],
    });
    expect(result).not.toBeNull();
    expect(result.motifs).toEqual(DEFAULT_VISUAL_SYSTEM.motifs);
    expect(result.contrastRules).toEqual(DEFAULT_VISUAL_SYSTEM.contrastRules);
  });

  it("filters out non-string items from motifs", () => {
    const result = validateVisualSystem({
      ...VALID_SYSTEM,
      motifs: ["valid", 42, null, "also valid"],
    });
    expect(result).not.toBeNull();
    expect(result.motifs).toEqual(["valid", "also valid"]);
  });

  it("clamps overly long strings", () => {
    const longString = "a".repeat(500);
    const result = validateVisualSystem({
      ...VALID_SYSTEM,
      typography: { character: longString, headline: "ok", body: "ok" },
    });
    expect(result).not.toBeNull();
    expect(result.typography.character.length).toBe(300);
  });
});

describe("parseVisualSystem", () => {
  it("returns the parsed visual system for valid input", () => {
    const result = parseVisualSystem(VALID_SYSTEM);
    expect(result.palette.base).toBe("#0f172a");
    expect(result.typography.character).toBe("bold editorial");
  });

  it("falls back to DEFAULT_VISUAL_SYSTEM for invalid input", () => {
    const result = parseVisualSystem(null);
    expect(result).toBe(DEFAULT_VISUAL_SYSTEM);
  });

  it("falls back to DEFAULT_VISUAL_SYSTEM for missing palette", () => {
    const result = parseVisualSystem({ typography: VALID_SYSTEM.typography });
    expect(result).toBe(DEFAULT_VISUAL_SYSTEM);
  });

  it("falls back to DEFAULT_VISUAL_SYSTEM for undefined", () => {
    const result = parseVisualSystem(undefined);
    expect(result).toBe(DEFAULT_VISUAL_SYSTEM);
  });
});
