// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getStageScale,
  centerOnSlide,
  alignLeft,
  alignRight,
  fitToWidth,
  rotateBy,
} from "../editor/image/image-position-presets.js";

function toRect(l, t, w, h) {
  return { left: l, top: t, width: w, height: h, right: l + w, bottom: t + h };
}

const areaEl = {
  getBoundingClientRect: () => toRect(0, 0, 1920, 1080),
};

function mockImg(styleOverrides, rect, natW, natH) {
  const style = {
    left: "",
    top: "",
    width: "",
    height: "",
    opacity: "",
    borderRadius: "",
    boxShadow: "",
    transform: "",
    zIndex: "",
    ...styleOverrides,
  };
  return {
    closest: (sel) => (sel === ".slide__area" ? areaEl : null),
    style,
    getBoundingClientRect: () => toRect(rect.left, rect.top, rect.width, rect.height),
    naturalWidth: natW || rect.width,
    naturalHeight: natH || rect.height,
    getAttribute: () => null,
  };
}

describe("getStageScale", () => {
  it("returns 1 when no .stage__inner exists", () => {
    expect(getStageScale()).toBe(1);
  });

  it("returns 1 when transform is none", () => {
    const el = document.createElement("div");
    el.className = "stage__inner";
    document.body.appendChild(el);
    expect(getStageScale()).toBe(1);
    document.body.removeChild(el);
  });

  it("parses scale from matrix transform", () => {
    const el = document.createElement("div");
    el.className = "stage__inner";
    el.style.transform = "matrix(0.5, 0, 0, 0.5, 0, 0)";
    document.body.appendChild(el);
    expect(getStageScale()).toBe(0.5);
    document.body.removeChild(el);
  });
});

describe("centerOnSlide", () => {
  it("centers image horizontally", () => {
    const img = mockImg({ left: "100px" }, { left: 200, top: 100, width: 200, height: 150 });
    const applySettings = vi.fn();
    centerOnSlide(img, 1, applySettings);
    // area center = 1920/2 = 960; img center = (200 + 200/2) = 300; delta = 660
    // curLeft = 100; new left = 100 + 660 = 760
    expect(applySettings).toHaveBeenCalledWith({ left: 760 });
  });

  it("does nothing when no area found", () => {
    const img = { closest: () => null };
    const applySettings = vi.fn();
    centerOnSlide(img, 1, applySettings);
    expect(applySettings).not.toHaveBeenCalled();
  });
});

describe("alignLeft", () => {
  it("aligns image to left edge", () => {
    const img = mockImg({ left: "100px" }, { left: 200, top: 100, width: 200, height: 150 });
    const applySettings = vi.fn();
    alignLeft(img, 1, applySettings);
    // currentLeftX = (200 - 0) / 1 = 200; curLeft = 100; new left = 100 - 200 = -100
    expect(applySettings).toHaveBeenCalledWith({ left: -100 });
  });
});

describe("alignRight", () => {
  it("aligns image to right edge", () => {
    const img = mockImg({ left: "100px" }, { left: 200, top: 100, width: 200, height: 150 });
    const applySettings = vi.fn();
    alignRight(img, 1, applySettings);
    // currentRightX = (200 + 200 - 0) / 1 = 400; areaWidth = 1920; deltaX = 1520
    // curLeft = 100; new left = 100 + 1520 = 1620
    expect(applySettings).toHaveBeenCalledWith({ left: 1620 });
  });
});

describe("fitToWidth", () => {
  beforeEach(() => {
    globalThis.getComputedStyle = () => ({
      paddingLeft: "0px",
      paddingRight: "0px",
      paddingTop: "0px",
      paddingBottom: "0px",
    });
  });

  it("fits a landscape image to area width", () => {
    const img = mockImg(
      { left: "100px", top: "50px" },
      { left: 100, top: 50, width: 800, height: 400 },
      1600,
      800,
    );
    const applySettings = vi.fn();
    fitToWidth(img, 1, applySettings);
    // ratio = 1600/800 = 2; areaWidthDesign = 1920; areaHeightDesign = 1080
    // width = min(1920, 1080 * 2) = 1920; height = 1920/2 = 960
    // top = (1080 - 960)/2 = 60
    expect(applySettings).toHaveBeenCalledWith({
      width: 1920,
      height: 960,
      left: 0,
      top: 60,
    });
  });

  it("fits a portrait image constrained by height", () => {
    const img = mockImg(
      { left: "100px", top: "50px" },
      { left: 100, top: 50, width: 400, height: 600 },
      800,
      1200,
    );
    const applySettings = vi.fn();
    fitToWidth(img, 1, applySettings);
    // ratio = 800/1200 = 0.667; areaWidthDesign = 1920; areaHeightDesign = 1080
    // width = min(1920, 1080 * 0.667) = 720; height = 720/0.667 = 1080
    // top = (1080 - 1080)/2 = 0
    expect(applySettings).toHaveBeenCalledWith({
      width: 720,
      height: 1080,
      left: 0,
      top: 0,
    });
  });

  it("accounts for area padding", () => {
    globalThis.getComputedStyle = () => ({
      paddingLeft: "10px",
      paddingRight: "10px",
      paddingTop: "10px",
      paddingBottom: "10px",
    });
    const img = mockImg(
      { left: "100px", top: "50px" },
      { left: 100, top: 50, width: 800, height: 400 },
      1600,
      800,
    );
    const applySettings = vi.fn();
    fitToWidth(img, 1, applySettings);
    // Content box: 1900 x 1060 after 20px padding
    // width = min(1900, 1060*2) = 1900; height = 950; top = (1060-950)/2 = 55
    expect(applySettings).toHaveBeenCalledWith({
      width: 1900,
      height: 950,
      left: 0,
      top: 55,
    });
  });
});

describe("rotateBy", () => {
  it("rotates 90 swapping width and height", () => {
    const img = mockImg(
      { width: "120px", height: "80px" },
      { left: 0, top: 0, width: 120, height: 80 },
    );
    const applySettings = vi.fn();
    rotateBy(img, 90, applySettings);
    expect(applySettings).toHaveBeenCalledWith({
      rotation: 90,
      width: 80,
      height: 120,
    });
  });

  it("wraps negative rotation into 0-359 range", () => {
    const img = mockImg(
      { width: "120px", height: "80px" },
      { left: 0, top: 0, width: 120, height: 80 },
    );
    const applySettings = vi.fn();
    rotateBy(img, -90, applySettings);
    expect(applySettings).toHaveBeenCalledWith({
      rotation: 270,
      width: 80,
      height: 120,
    });
  });

  it("wraps rotation past 360 back to zero", () => {
    const img = mockImg(
      { width: "120px", height: "80px", transform: "rotate(270deg)" },
      { left: 0, top: 0, width: 120, height: 80 },
    );
    const applySettings = vi.fn();
    rotateBy(img, 90, applySettings);
    expect(applySettings).toHaveBeenCalledWith({ rotation: 0 });
  });

  it("preserves original dimensions when rotation is not a right angle", () => {
    const img = mockImg(
      { width: "120px", height: "80px" },
      { left: 0, top: 0, width: 120, height: 80 },
    );
    const applySettings = vi.fn();
    rotateBy(img, 45, applySettings);
    expect(applySettings).toHaveBeenCalledWith({
      rotation: 45,
    });
  });
});
