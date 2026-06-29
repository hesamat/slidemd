import { describe, it, expect } from "vitest";
import { LayoutData } from "../data/layout-data.js";

describe("LayoutData", () => {
  describe("getTemplate", () => {
    it("returns template for known layout", () => {
      const template = LayoutData.getTemplate("two-column");
      expect(template).toBeDefined();
      expect(typeof template).toBe("string");
    });

    it("falls back to default template for unknown layout", () => {
      const template = LayoutData.getTemplate("nonexistent");
      const defaultTemplate = LayoutData.getTemplate("default");
      expect(template).toBe(defaultTemplate);
    });
  });

  describe("getAllLayouts", () => {
    it("returns array of layout names", () => {
      const layouts = LayoutData.getAllLayouts();
      expect(Array.isArray(layouts)).toBe(true);
      expect(layouts.length).toBeGreaterThan(0);
    });

    it("excludes hidden layouts", () => {
      const layouts = LayoutData.getAllLayouts();
      expect(layouts).not.toContain("default");
      expect(layouts).not.toContain("header-two-column");
      expect(layouts).not.toContain("sidebar-content");
      expect(layouts).not.toContain("content-sidebar");
      expect(layouts).not.toContain("focus");
    });

    it("includes common layouts", () => {
      const layouts = LayoutData.getAllLayouts();
      expect(layouts).toContain("two-column");
      expect(layouts).toContain("title-slide");
    });
  });

  describe("getDescription", () => {
    it("returns description for known layout", () => {
      const desc = LayoutData.getDescription("two-column");
      expect(typeof desc).toBe("string");
    });

    it("returns empty string for unknown layout", () => {
      expect(LayoutData.getDescription("nonexistent")).toBe("");
    });
  });

  describe("getPreviewHTML", () => {
    it("returns HTML string", () => {
      const html = LayoutData.getPreviewHTML("two-column");
      expect(typeof html).toBe("string");
      expect(html.length).toBeGreaterThan(0);
    });
  });

  describe("getGridTemplate", () => {
    it("returns grid template for known layout", () => {
      const grid = LayoutData.getGridTemplate("two-column");
      expect(grid).toBeDefined();
      expect(grid).toContain('"');
    });

    it("returns null for unknown layout", () => {
      expect(LayoutData.getGridTemplate("nonexistent")).toBeNull();
    });
  });

  describe("getAreaNames", () => {
    it("returns area names for a layout", () => {
      const areas = LayoutData.getAreaNames("two-column");
      expect(Array.isArray(areas)).toBe(true);
      expect(areas.length).toBeGreaterThan(0);
    });

    it("returns ['main'] for unknown layout", () => {
      expect(LayoutData.getAreaNames("nonexistent")).toEqual(["main"]);
    });
  });

  describe("getPresets", () => {
    it("returns object with layout presets", () => {
      const presets = LayoutData.getPresets();
      expect(typeof presets).toBe("object");
      expect(presets).toHaveProperty("two-column");
    });
  });

  describe("formatLayoutName", () => {
    it("formats hyphenated names", () => {
      expect(LayoutData.formatLayoutName("two-column")).toBe("Two Column");
    });
  });

  describe("hasLayout", () => {
    it("returns true for existing layout", () => {
      expect(LayoutData.hasLayout("two-column")).toBe(true);
    });

    it("returns false for missing layout", () => {
      expect(LayoutData.hasLayout("nonexistent")).toBe(false);
    });
  });
});
