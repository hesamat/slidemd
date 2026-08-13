import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LayoutData, getMediaFullBleedSideFromGrid } from "../data/layout-data.js";

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
    });

    it("includes common layouts", () => {
      const layouts = LayoutData.getAllLayouts();
      expect(layouts).toContain("two-column");
      expect(layouts).toContain("title-slide");
      expect(layouts).toContain("focus");
      expect(layouts).toContain("media-span-left");
      expect(layouts).toContain("media-span-right");
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

    it("mirrors media-span grids around the midpoint", () => {
      const right = LayoutData.getGridTemplate("media-span-right");
      const left = LayoutData.getGridTemplate("media-span-left");
      expect(right).toBe('"header media" "main media" "footer media" / 1.2fr 0.8fr');
      expect(left).toBe('"media header" "media main" "media footer" / 0.8fr 1.2fr');
    });

    it("returns null for unknown layout", () => {
      expect(LayoutData.getGridTemplate("nonexistent")).toBeNull();
    });

    it("derives media-span sides from grid geometry", () => {
      expect(getMediaFullBleedSideFromGrid('"media main" "media footer"')).toBe("left");
      expect(getMediaFullBleedSideFromGrid('"main media" "footer media"')).toBe("right");
      expect(getMediaFullBleedSideFromGrid('"main media" "media main"')).toBeNull();
      expect(getMediaFullBleedSideFromGrid('"main media"')).toBeNull();
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

    it("replaces every hyphen in multi-hyphen names", () => {
      expect(LayoutData.formatLayoutName("media-span-left")).toBe("Media Span Left");
      expect(LayoutData.formatLayoutName("media-span-right")).toBe("Media Span Right");
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

  describe("getValidLayoutNames", () => {
    it("returns the same names as getAllLayouts when nothing is stale", () => {
      expect(LayoutData.getValidLayoutNames()).toEqual(LayoutData.getAllLayouts());
    });

    describe("with a stale custom layout", () => {
      let originalLocalStorage;

      beforeEach(() => {
        originalLocalStorage = globalThis.localStorage;
      });

      afterEach(() => {
        if (originalLocalStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = originalLocalStorage;
        LayoutData.deleteCustomLayout("stale-custom");
        LayoutData._customMap = null;
      });

      it("excludes a custom layout name whose stored grid template is empty", () => {
        // getAllLayouts() lists every custom layout name regardless of
        // whether its stored grid template is a non-empty string;
        // hasLayout() rejects an empty template. getValidLayoutNames()
        // must apply that filter so callers never advertise a name that
        // hasLayout()/the validator would then reject.
        const store = {};
        globalThis.localStorage = {
          getItem: (key) => store[key] ?? null,
          setItem: (key, value) => {
            store[key] = value;
          },
        };
        LayoutData._customMap = null;
        LayoutData.setCustomLayout("stale-custom", "");

        expect(LayoutData.getAllLayouts()).toContain("stale-custom");
        expect(LayoutData.getValidLayoutNames()).not.toContain("stale-custom");
      });
    });
  });
});
