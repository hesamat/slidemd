import { describe, it, expect } from "vitest";
import { formatTable, formatImage } from "../data/pptx-element-formatters.js";

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
  it("renders a table with meaningful fills as a markdown table (no HTML)", () => {
    const out = formatTable(coloredTable(), 960, 540);
    expect(out).toContain("table {width: 27%}");
    expect(out).toContain("| 00 | 01 | 02 |");
    expect(out).not.toContain("fullpage-grid");
    expect(out).not.toContain("<div");
  });

  it("renders a plain table as a markdown table", () => {
    const out = formatTable(plainTable, 960, 540);
    expect(out).toContain("table {width: 31%}");
    expect(out).toContain("| a | b |");
    expect(out).not.toContain("fullpage-grid");
  });

  it("renders a full-screen coloured table as a markdown table at full width", () => {
    // A near-full-slide matrix keeps the default styling (no width directive)
    // and still becomes a markdown table.
    const out = formatTable(coloredTable({ width: 900, height: 520 }), 960, 540);
    expect(out.startsWith("|")).toBe(true);
    expect(out).not.toContain("table {width:");
    expect(out).not.toContain("fullpage-grid");
  });

  it("marks headerless tables with no-header directive", () => {
    // A table where the first row has long cells (data, not labels) is
    // headerless — the no-header directive hides the empty thead.
    const dataOnlyTable = {
      width: 300,
      height: 200,
      rows: [
        [{ text: "assert total == expected_total" }, { text: "some long value" }],
        [{ text: "assert actual != expected" }, { text: "another value" }],
      ],
    };
    const out = formatTable(dataOnlyTable, 960, 540);
    expect(out).toContain("table {width: 31%; no-header}");
    expect(out).toContain("|  |  |");
  });

  it("keeps header for tables with short label first rows", () => {
    const labelTable = {
      width: 300,
      height: 200,
      rows: [
        [{ text: "Name" }, { text: "Value" }],
        [{ text: "a long descriptive sentence here" }, { text: "another long one" }],
      ],
    };
    const out = formatTable(labelTable, 960, 540);
    expect(out).toContain("| Name | Value |");
    expect(out).not.toContain("no-header");
  });

  it("returns empty string for an empty table", () => {
    expect(formatTable({ rows: [] }, 960, 540)).toBe("");
  });
});

describe("formatImage", () => {
  it("emits a plain img tag with pixel dimensions", () => {
    const out = formatImage({ ref: "image1.png", width: 200, height: 150 }, "deck");
    expect(out).toMatch(/^<img /);
    expect(out).toContain('width="267"');
    expect(out).toContain('height="200"');
    expect(out).not.toContain("position:relative");
  });

  it("keeps the plain img when dimensions are omitted", () => {
    const out = formatImage({ ref: "diagram-0-1.png" }, "deck", { omitDimensions: true });
    expect(out).toMatch(/^<img /);
    expect(out).not.toContain("position:relative");
  });
});
