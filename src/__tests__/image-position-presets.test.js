// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getStageScale,
  centerOnSlide,
  alignLeft,
  alignRight,
  fitToWidth,
  fillContainer,
  rotateBy,
} from "../editor/image/image-position-presets.js";

function toRect(l, t, w, h) {
  return { left: l, top: t, width: w, height: h, right: l + w, bottom: t + h };
}

const areaEl = {
  getBoundingClientRect: () => toRect(0, 0, 1920, 1080),
  clientWidth: 1920,
  clientHeight: 1080,
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
  beforeEach(() => {
    globalThis.getComputedStyle = () => ({
      paddingLeft: "0px",
      paddingRight: "0px",
      paddingTop: "0px",
      paddingBottom: "0px",
    });
  });

  it("centers image horizontally", () => {
    const img = mockImg({ width: "200px" }, { left: 200, top: 100, width: 200, height: 150 });
    const applySettings = vi.fn();
    centerOnSlide(img, 1, applySettings);
    // contentWidth = 1920; imgWidth = parseFloat("200px") = 200
    // new left = (1920 - 200) / 2 = 860
    expect(applySettings).toHaveBeenCalledWith({ left: 860 });
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
    expect(applySettings).toHaveBeenCalledWith({ left: 0 });
  });
});

describe("alignRight", () => {
  beforeEach(() => {
    globalThis.getComputedStyle = () => ({
      paddingLeft: "0px",
      paddingRight: "0px",
      paddingTop: "0px",
      paddingBottom: "0px",
    });
  });

  it("aligns image to right edge", () => {
    const img = mockImg({ width: "200px" }, { left: 200, top: 100, width: 200, height: 150 });
    const applySettings = vi.fn();
    alignRight(img, 1, applySettings);
    // contentWidth = 1920; imgWidth = parseFloat("200px") = 200
    // new left = 1920 - 200 = 1720
    expect(applySettings).toHaveBeenCalledWith({ left: 1720 });
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
    expect(applySettings).toHaveBeenCalledWith({
      width: 1920,
      height: 960,
      left: 0,
      top: 0,
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
    // width = min(1900, 1060*2) = 1900; height = 950
    expect(applySettings).toHaveBeenCalledWith({
      width: 1900,
      height: 950,
      left: 0,
      top: 0,
    });
  });
});

describe("fillContainer", () => {
  beforeEach(() => {
    globalThis.getComputedStyle = () => ({
      paddingLeft: "0px",
      paddingRight: "0px",
      paddingTop: "0px",
      paddingBottom: "0px",
    });
  });

  it("sizes the image to the full area content box with object-fit cover", () => {
    const img = mockImg(
      { left: "100px", top: "50px", width: "400px", height: "300px" },
      { left: 100, top: 50, width: 400, height: 300 },
    );
    const applySettings = vi.fn();
    fillContainer(img, 1, applySettings);
    expect(applySettings).toHaveBeenCalledWith({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      objectFit: "cover",
    });
  });

  it("accounts for area padding and stage scale", () => {
    globalThis.getComputedStyle = () => ({
      paddingLeft: "10px",
      paddingRight: "10px",
      paddingTop: "10px",
      paddingBottom: "10px",
    });
    const img = mockImg(
      { left: "0px", top: "0px", width: "100px", height: "100px" },
      { left: 0, top: 0, width: 100, height: 100 },
    );
    const applySettings = vi.fn();
    fillContainer(img, 2, applySettings);
    // Content box: 1900 x 1060 design px at scale 2
    expect(applySettings).toHaveBeenCalledWith({
      left: 0,
      top: 0,
      width: 950,
      height: 530,
      objectFit: "cover",
    });
  });

  it("does nothing when no area found", () => {
    const img = { closest: () => null };
    const applySettings = vi.fn();
    fillContainer(img, 1, applySettings);
    expect(applySettings).not.toHaveBeenCalled();
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
