import { describe, it, expect } from "vitest";
import { MERMAID_INIT_OPTIONS, buildInlinedMermaidScriptTag } from "../core/mermaid-config.js";

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

describe("buildInlinedMermaidScriptTag", () => {
  it("returns a string containing script tags", () => {
    const result = buildInlinedMermaidScriptTag("var x = 1;");
    expect(result).toContain("<script");
    expect(result).toContain("</script>");
  });

  it("inlines the Mermaid JS source directly (no CDN URL)", () => {
    const js = "var mermaid = { render: function() {} };";
    const result = buildInlinedMermaidScriptTag(js);
    expect(result).toContain(js);
    expect(result).not.toContain("cdn.jsdelivr.net");
    expect(result).not.toContain("import mermaid from");
  });

  it("includes mermaid.initialize call", () => {
    const result = buildInlinedMermaidScriptTag("var x = 1;");
    expect(result).toContain("mermaid.initialize(");
  });

  it("sets the __WEBDECK_HAS_MERMAID__ synchronously and __WEBDECK_MERMAID__ after load", () => {
    const result = buildInlinedMermaidScriptTag("var x = 1;");
    expect(result).toContain("window.__WEBDECK_HAS_MERMAID__ = true");
    expect(result).toContain("window.__WEBDECK_MERMAID__={mermaid:window.mermaid}");
  });

  it("applies indent prefix when provided", () => {
    const result = buildInlinedMermaidScriptTag("var x = 1;", "  ");
    expect(result.startsWith("  <script")).toBe(true);
  });

  it("defaults to empty indent", () => {
    const result = buildInlinedMermaidScriptTag("var x = 1;");
    expect(result.startsWith("<script")).toBe(true);
  });
});
