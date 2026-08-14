import { describe, it, expect } from "vitest";
import {
  validateVisualSystem,
  parseVisualSystem,
  DEFAULT_VISUAL_SYSTEM,
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
