import { describe, it, expect } from "vitest";
import { isColorDark, hexToLuminance } from "../data/pptx-color-utils.js";

describe("isColorDark", () => {
  it("returns false for null/undefined/empty", () => {
    expect(isColorDark(null)).toBe(false);
    expect(isColorDark(undefined)).toBe(false);
    expect(isColorDark("")).toBe(false);
  });

  it("classifies solid 6-digit hex colors", () => {
    expect(isColorDark("#000000")).toBe(true);
    expect(isColorDark("#0f172a")).toBe(true);
    expect(isColorDark("#1e293b")).toBe(true);
    expect(isColorDark("#ffffff")).toBe(false);
    expect(isColorDark("#f1f5f9")).toBe(false);
  });

  it("expands 3-digit hex colors", () => {
    expect(isColorDark("#000")).toBe(true);
    expect(isColorDark("#fff")).toBe(false);
    expect(isColorDark("#abc")).toBe(false); // #aabbcc — light
  });

  it("strips 8-digit hex alpha suffix", () => {
    expect(isColorDark("#0f172aff")).toBe(true);
    expect(isColorDark("#ffffff00")).toBe(false);
  });

  it("returns false for non-hex strings without hex colors", () => {
    expect(isColorDark("red")).toBe(false);
    expect(isColorDark("rgb(0,0,0)")).toBe(false);
    expect(isColorDark("transparent")).toBe(false);
  });

  it("classifies gradients by the darkest color", () => {
    // First stop is light, second is dark → should be dark
    expect(isColorDark("linear-gradient(#96b23c 0%, #768c2f 97%)")).toBe(true);
    // Both stops are light → should be light
    expect(isColorDark("linear-gradient(#ffffff 0%, #f1f5f9 100%)")).toBe(false);
    // Both stops are dark → should be dark
    expect(isColorDark("linear-gradient(#0f172a, #1e293b)")).toBe(true);
  });

  it("classifies gradients with 3-digit hex stops", () => {
    expect(isColorDark("linear-gradient(#fff, #000)")).toBe(true);
    expect(isColorDark("linear-gradient(#fff, #fff)")).toBe(false);
  });

  it("classifies mixed color+image backgrounds by the hex color", () => {
    expect(isColorDark("#0f172a url(images/hero.png) center/cover")).toBe(true);
    expect(isColorDark("#ffffff url(images/hero.png) center/cover")).toBe(false);
  });
});

describe("hexToLuminance", () => {
  it("returns luminance for valid 6-digit hex", () => {
    expect(hexToLuminance("ffffff")).toBe(255);
    expect(hexToLuminance("000000")).toBe(0);
  });

  it("returns Infinity for invalid input", () => {
    expect(hexToLuminance("")).toBe(Infinity);
    expect(hexToLuminance("fff")).toBe(Infinity);
    expect(hexToLuminance(null)).toBe(Infinity);
  });
});
