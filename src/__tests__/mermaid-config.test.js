import { describe, it, expect } from "vitest";
import { MERMAID_INIT_OPTIONS, buildMermaidScriptTag } from "../core/mermaid-config.js";

describe("MERMAID_INIT_OPTIONS", () => {
  it("has startOnLoad disabled", () => {
    expect(MERMAID_INIT_OPTIONS.startOnLoad).toBe(false);
  });

  it("has expected top-level keys", () => {
    expect(MERMAID_INIT_OPTIONS).toHaveProperty("theme");
    expect(MERMAID_INIT_OPTIONS).toHaveProperty("securityLevel");
    expect(MERMAID_INIT_OPTIONS).toHaveProperty("flowchart");
    expect(MERMAID_INIT_OPTIONS).toHaveProperty("themeVariables");
  });

  it("has themeVariables with fontFamily", () => {
    expect(MERMAID_INIT_OPTIONS.themeVariables).toHaveProperty("fontFamily");
  });
});

describe("buildMermaidScriptTag", () => {
  it("returns a string containing a script tag", () => {
    const result = buildMermaidScriptTag("11.14.0");
    expect(result).toContain("<script");
    expect(result).toContain("</script>");
  });

  it("includes the versioned CDN URL in the import", () => {
    const result = buildMermaidScriptTag("11.14.0");
    expect(result).toContain("mermaid@11.14.0");
    expect(result).toContain(".mjs");
  });

  it("includes mermaid.initialize call", () => {
    const result = buildMermaidScriptTag("11.14.0");
    expect(result).toContain("mermaid.initialize(");
  });

  it("applies indent prefix when provided", () => {
    const result = buildMermaidScriptTag("11.14.0", "  ");
    expect(result.startsWith("  <script")).toBe(true);
  });

  it("defaults to empty indent", () => {
    const result = buildMermaidScriptTag("11.14.0");
    expect(result.startsWith("<script")).toBe(true);
  });
});
