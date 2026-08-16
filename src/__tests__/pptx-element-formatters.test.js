import { describe, it, expect } from "vitest";
import { formatTable } from "../data/pptx-element-formatters.js";

/** A 3x3 grid where every third cell carries a real (dark) fill. */
const coloredTable = (overrides = {}) => ({
  width: 260,
  height: 238,
  rows: Array.from({ length: 3 }, (_, i) =>
    Array.from({ length: 3 }, (_, j) => ({
      text: `${i}${j}`,
      fillColor: (i + j) % 3 === 0 ? "#003C68" : "#ffffff",
    })),
  ),
  ...overrides,
});

const plainTable = {
  width: 300,
  height: 200,
  rows: [
    [{ text: "a" }, { text: "b" }],
    [{ text: "c" }, { text: "d" }],
  ],
};

describe("formatTable", () => {
  it("renders a table with meaningful fills as a CSS grid", () => {
    const out = formatTable(coloredTable(), 960, 540);
    expect(out).toContain('class="fullpage-grid fullpage-grid--content"');
    expect(out).toContain("aspect-ratio:260/238");
    expect(out).toContain("grid-template-columns:repeat(3,1fr)");
    // Dark fills get the high-contrast modifier.
    expect(out).toContain("fullpage-grid__cell--on-color");
  });

  it("preserves the source aspect ratio for a non-fullscreen coloured grid", () => {
    const out = formatTable(coloredTable({ width: 120, height: 300 }), 960, 540);
    expect(out).toContain("aspect-ratio:120/300");
  });

  it("renders a plain table as a markdown table", () => {
    const out = formatTable(plainTable, 960, 540);
    expect(out.startsWith("|")).toBe(true);
    expect(out).toContain("| a | b |");
    expect(out).not.toContain("fullpage-grid");
  });

  it("keeps full-screen tables as grids without the content modifier", () => {
    // 900x520 on a 960x540 slide → well over the 80% threshold.
    const out = formatTable(coloredTable({ width: 900, height: 520 }), 960, 540);
    expect(out).toContain('class="fullpage-grid"');
    expect(out).not.toContain("fullpage-grid--content");
  });

  it("treats near-white fills as not meaningful (markdown output)", () => {
    const light = {
      width: 260,
      height: 238,
      rows: Array.from({ length: 3 }, () =>
        Array.from({ length: 3 }, () => ({ text: "", fillColor: "#F2F2F2" })),
      ),
    };
    const out = formatTable(light, 960, 540);
    expect(out.startsWith("|")).toBe(true);
    expect(out).not.toContain("fullpage-grid");
  });

  it("returns empty string for an empty table", () => {
    expect(formatTable({ rows: [] }, 960, 540)).toBe("");
  });
});
