// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DESIGN_SIZE } from "../core/utils.js";

// We test DeckController.updateNextPreview by binding the method to a stub
// that provides only the fields the method reads. This avoids constructing
// the full DeckController (which wires up many subsystems).
import { DeckController } from "../engine/deck-controller.js";

describe("DeckController.updateNextPreview", () => {
  let container;
  let stub;
  const slide0 = { id: "s0", title: "First", areas: { main: "<p>Hello</p>" } };
  const slide1 = { id: "s1", title: "Second", areas: { main: "<p>World</p>" } };

  beforeEach(() => {
    container = document.createElement("div");
    // Simulate a visible panel with a real width
    Object.defineProperty(container, "clientWidth", { value: 360, configurable: true });

    stub = {
      elements: { nextPreview: container },
      deck: { slides: [slide0, slide1] },
      slideNavigator: {
        currentIndex: 0,
        goTo: vi.fn(),
      },
    };
  });

  it("renders a scaled slide element for the next slide", () => {
    DeckController.prototype.updateNextPreview.call(stub, slide1);
    const slideEl = container.querySelector(".next-preview__slide");
    expect(slideEl).toBeTruthy();
    expect(slideEl.style.width).toBe(`${DESIGN_SIZE.width}px`);
    expect(slideEl.style.height).toBe(`${DESIGN_SIZE.height}px`);
    // Scale = 360 / 1920
    const expectedScale = 360 / DESIGN_SIZE.width;
    expect(slideEl.style.transform).toBe(`scale(${expectedScale})`);
    expect(container.style.height).toBe(`${Math.round(DESIGN_SIZE.height * expectedScale)}px`);
  });

  it("shows (End) and adds empty class when there is no next slide", () => {
    DeckController.prototype.updateNextPreview.call(stub, null);
    expect(container.textContent).toBe("(End)");
    expect(container.classList.contains("next-preview--empty")).toBe(true);
    expect(container.querySelector(".next-preview__slide")).toBeNull();
  });

  it("clicking the preview navigates to the next slide", () => {
    DeckController.prototype.updateNextPreview.call(stub, slide1);
    container.onclick();
    expect(stub.slideNavigator.goTo).toHaveBeenCalledWith(1);
  });

  it("re-derives next slide when called with no arguments", () => {
    DeckController.prototype.updateNextPreview.call(stub);
    const slideEl = container.querySelector(".next-preview__slide");
    expect(slideEl).toBeTruthy();
  });

  it("is a no-op when nextPreview element is missing", () => {
    stub.elements.nextPreview = null;
    expect(() => DeckController.prototype.updateNextPreview.call(stub, slide1)).not.toThrow();
  });

  it("clears the empty class when rendering a real slide", () => {
    container.classList.add("next-preview--empty");
    DeckController.prototype.updateNextPreview.call(stub, slide1);
    expect(container.classList.contains("next-preview--empty")).toBe(false);
  });

  it("does not set cursor pointer on empty state", () => {
    DeckController.prototype.updateNextPreview.call(stub, null);
    expect(container.style.cursor).toBe("");
  });

  it("sets cursor pointer on non-empty state", () => {
    DeckController.prototype.updateNextPreview.call(stub, slide1);
    expect(container.style.cursor).toBe("pointer");
  });

  it("routes preview images through DeckImagesResolver like the main stage", async () => {
    const rewriteImgSrcs = vi.fn().mockResolvedValue(undefined);
    const rewriteBackgroundUrls = vi.fn().mockResolvedValue(undefined);
    stub._deckImagesResolver = { rewriteImgSrcs, rewriteBackgroundUrls };
    DeckController.prototype.updateNextPreview.call(stub, slide1);
    const previewEl = container.querySelector(".next-preview__slide");
    expect(rewriteImgSrcs).toHaveBeenCalledWith(previewEl);
    expect(rewriteBackgroundUrls).toHaveBeenCalledWith(previewEl);
  });

  it("does not throw when no DeckImagesResolver is wired", () => {
    expect(() => DeckController.prototype.updateNextPreview.call(stub, slide1)).not.toThrow();
  });
});
