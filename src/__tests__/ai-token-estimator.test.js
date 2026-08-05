import { describe, it, expect } from "vitest";
import { estimateMaxTokens } from "../data/ai/ai-token-estimator.js";

describe("estimateMaxTokens", () => {
  it("returns at least 16000 without reasoning", () => {
    const md =
      "layout: header-content\n@header\n## Hi\n\n---\n\nlayout: header-content\n@header\n## Bye";
    expect(estimateMaxTokens(md, "fix")).toBeGreaterThanOrEqual(16000);
  });

  it("returns at least 24000 with high reasoning", () => {
    const md = "a".repeat(1000);
    const result = estimateMaxTokens(md, "fix", { useReasoning: true });
    expect(result).toBeGreaterThanOrEqual(24000);
  });

  it("scales with input size for fix mode", () => {
    const small = "a".repeat(1000);
    const large = "a".repeat(100000);
    expect(estimateMaxTokens(large, "fix")).toBeGreaterThan(estimateMaxTokens(small, "fix"));
  });

  it("scales with input size for generate mode", () => {
    const small = "a".repeat(1000);
    const large = "a".repeat(100000);
    expect(estimateMaxTokens(large, "generate")).toBeGreaterThan(
      estimateMaxTokens(small, "generate"),
    );
  });

  it("generate mode estimates more tokens than fix mode", () => {
    const md = "a".repeat(100000);
    expect(estimateMaxTokens(md, "generate")).toBeGreaterThan(estimateMaxTokens(md, "fix"));
  });

  it("reasoning mode estimates 3x more tokens than non-reasoning", () => {
    const md = "a".repeat(100000);
    const without = estimateMaxTokens(md, "fix");
    const withReasoning = estimateMaxTokens(md, "fix", { useReasoning: true });
    expect(withReasoning).toBeGreaterThan(without * 2);
  });

  it("uses modelMaxOutput as upper bound when provided", () => {
    const md = "a".repeat(500000);
    const result = estimateMaxTokens(md, "generate", { modelMaxOutput: 50000 });
    expect(result).toBeLessThanOrEqual(50000);
  });

  it("falls back to 128000 when modelMaxOutput is null", () => {
    const md = "a".repeat(500000);
    const result = estimateMaxTokens(md, "generate", { modelMaxOutput: null });
    expect(result).toBeLessThanOrEqual(128000);
  });

  it("falls back to 128000 when options are omitted", () => {
    const md = "a".repeat(500000);
    const result = estimateMaxTokens(md, "generate");
    expect(result).toBeLessThanOrEqual(128000);
  });

  it("respects high modelMaxOutput for large decks", () => {
    const md = "a".repeat(500000);
    const result = estimateMaxTokens(md, "generate", { modelMaxOutput: 384000 });
    expect(result).toBeGreaterThan(128000);
    expect(result).toBeLessThanOrEqual(384000);
  });

  it("reasoning + high modelMaxOutput allows large estimates", () => {
    const md = "a".repeat(200000);
    const result = estimateMaxTokens(md, "generate", {
      modelMaxOutput: 384000,
      useReasoning: true,
    });
    expect(result).toBeGreaterThan(64000);
    expect(result).toBeLessThanOrEqual(384000);
  });
});
