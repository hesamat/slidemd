import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { ICONS, ICON_SIZES, icon, iconString, hydrateIcons } from "../core/icon.js";

describe("icon", () => {
  beforeEach(() => {
    const { window } = new JSDOM("<!doctype html><html><body></body></html>");
    vi.stubGlobal("window", window);
    vi.stubGlobal("document", window.document);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("returns an <svg> element with default size and aria-hidden", () => {
    const svg = icon("close");
    expect(svg).toBeInstanceOf(window.SVGSVGElement);
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("width")).toBe(String(ICON_SIZES.md));
    expect(svg.getAttribute("height")).toBe(String(ICON_SIZES.md));
    expect(svg.getAttribute("stroke")).toBe("currentColor");
  });

  it("honors size tokens and numeric sizes", () => {
    expect(icon("plus", { size: "sm" }).getAttribute("width")).toBe(String(ICON_SIZES.sm));
    expect(icon("plus", { size: "2xl" }).getAttribute("width")).toBe(String(ICON_SIZES["2xl"]));
    expect(icon("plus", { size: 28 }).getAttribute("width")).toBe("28");
  });

  it("adds extra class and stroke-width override", () => {
    const svg = icon("save", { class: "btn-icon", strokeWidth: 2.5 });
    expect(svg.getAttribute("class")).toBe("btn-icon");
    expect(svg.getAttribute("stroke-width")).toBe("2.5");
  });

  it("switches to role=img with aria-label when label is provided", () => {
    const svg = icon("close", { label: "Close dialog" });
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("Close dialog");
    expect(svg.getAttribute("aria-hidden")).toBeNull();
  });

  it("returns null and warns for unknown icon names", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(icon("does-not-exist")).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("does-not-exist"));
    warn.mockRestore();
  });

  it("exposes a frozen, non-empty ICONS map", () => {
    expect(Object.isFrozen(ICONS)).toBe(true);
    expect(Object.keys(ICONS).length).toBeGreaterThan(20);
  });

  it("iconString returns sanitized SVG markup with the same attrs", () => {
    const markup = iconString("close", { size: "sm" });
    expect(markup.startsWith("<svg ")).toBe(true);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain(`width="${ICON_SIZES.sm}"`);
    expect(markup).toContain("</svg>");
  });

  it("iconString returns empty string for unknown names", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(iconString("nope")).toBe("");
    warn.mockRestore();
  });

  describe("hydrateIcons", () => {
    it("replaces [data-icon] placeholders with SVG elements", () => {
      document.body.innerHTML = '<i data-icon="close" data-size="sm"></i>';
      const count = hydrateIcons(document);
      expect(count).toBe(1);
      const svg = document.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg.getAttribute("width")).toBe(String(ICON_SIZES.sm));
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    });

    it("preserves class, style, and other attributes from the placeholder", () => {
      document.body.innerHTML =
        '<i data-icon="sun" class="theme-icon-light" style="display: none" data-custom="x"></i>';
      hydrateIcons(document);
      const svg = document.querySelector("svg");
      expect(svg.getAttribute("class")).toBe("theme-icon-light");
      expect(svg.getAttribute("style")).toBe("display: none");
      expect(svg.getAttribute("data-custom")).toBe("x");
      // data-icon/data-size should NOT be transferred
      expect(svg.getAttribute("data-icon")).toBeNull();
    });

    it("uses data-label for accessible labels", () => {
      document.body.innerHTML = '<i data-icon="close" data-label="Close dialog"></i>';
      hydrateIcons(document);
      const svg = document.querySelector("svg");
      expect(svg.getAttribute("role")).toBe("img");
      expect(svg.getAttribute("aria-label")).toBe("Close dialog");
      expect(svg.getAttribute("aria-hidden")).toBeNull();
    });

    it("returns 0 and leaves unknown icons in place", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      document.body.innerHTML = '<i data-icon="unknown-icon"></i>';
      const count = hydrateIcons(document);
      expect(count).toBe(0);
      expect(document.querySelector("i")).not.toBeNull();
      warn.mockRestore();
    });
  });
});
