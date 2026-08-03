import { describe, it, expect } from "vitest";
import { LayoutParser } from "../data/layout-parser.js";

describe("LayoutParser", () => {
  describe("resolvePreset", () => {
    it("resolves known preset names", () => {
      const result = LayoutParser.resolvePreset("two-column");
      expect(result).toContain('"');
    });

    it("returns original spec for unknown names", () => {
      expect(LayoutParser.resolvePreset("unknown")).toBe("unknown");
    });

    it("handles empty input", () => {
      expect(LayoutParser.resolvePreset("")).toBe("");
    });

    it("is case-insensitive", () => {
      const result = LayoutParser.resolvePreset("TWO-COLUMN");
      expect(result).toContain('"');
    });
  });

  describe("parse", () => {
    it("returns default layout for empty spec", () => {
      const result = LayoutParser.parse("");
      expect(result.gridTemplateAreas).toBe('"main"');
      expect(result.gridTemplateColumns).toBe("1fr");
      expect(result.orderedAreas).toEqual(["main"]);
    });

    it("parses single-row layout", () => {
      const result = LayoutParser.parse('"header header" / 1fr 1fr');
      expect(result.gridTemplateAreas).toBe('"header header"');
      expect(result.gridTemplateColumns).toBe("1fr 1fr");
      expect(result.orderedAreas).toEqual(["header"]);
    });

    it("parses two-row layout", () => {
      const result = LayoutParser.parse('"header" "main" / 1fr');
      expect(result.gridTemplateAreas).toBe('"header" "main"');
      expect(result.orderedAreas).toEqual(["header", "main"]);
    });

    it("parses custom grid with explicit row sizes", () => {
      const result = LayoutParser.parse('"header" auto "main" 1fr / 1fr');
      expect(result.gridTemplateRows).toBe("auto 1fr");
      expect(result.gridTemplateColumns).toBe("1fr");
    });

    it("detects content rows for auto-sizing", () => {
      const result = LayoutParser.parse('"header" "main" / 1fr');
      // main should get minmax(0, 1fr) as content row
      expect(result.gridTemplateRows).toContain("minmax(0, 1fr)");
    });

    it("uses fallback areas when no areas found", () => {
      const result = LayoutParser.parse("invalid spec", { fallbackAreas: ["a", "b"] });
      expect(result.orderedAreas).toEqual(["a", "b"]);
    });

    it("skips dot-only area names", () => {
      const result = LayoutParser.parse('"header header" "main ." / 1fr 1fr');
      expect(result.orderedAreas).not.toContain(".");
    });

    it("handles single quotes", () => {
      const result = LayoutParser.parse("'header header' / 1fr 1fr");
      expect(result.gridTemplateAreas).toBe('"header header"');
    });

    it("treats custom area names as content rows", () => {
      const result = LayoutParser.parse('"header" "body" / 1fr');
      expect(result.gridTemplateRows).toBe("auto minmax(0, 1fr)");
      expect(result.orderedAreas).toEqual(["header", "body"]);
    });

    it("keeps header/footer rows auto when paired with a full-height span", () => {
      const result = LayoutParser.parse('"header media" "main media" "footer media" / 1fr 1fr');
      expect(result.gridTemplateRows).toBe("auto minmax(0, 1fr) auto");
      expect(result.orderedAreas).toEqual(["header", "media", "main", "footer"]);
    });
  });
});
