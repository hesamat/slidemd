// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  shrinkTextToFit,
  cropIsBlank,
  replaceFontsInDOM,
  findRenderedShapeElement,
} from "../data/pptx-diagram-cropper.js";

const PT_TO_PX = 96 / 72;
const px = (pt) => pt * PT_TO_PX;

/** Build a slide root whose direct child mimics the @aiden0z/pptx-renderer
 * shape DOM: an absolutely-positioned shape div containing an SVG placeholder
 * and a flex text container with an overflow-wrap paragraph div + span. */
function buildShapeDom({ shape, fontSizePt = 20, label = "Label text" }) {
  const root = document.createElement("div");
  const shapeEl = document.createElement("div");
  shapeEl.style.left = `${px(shape.left || 0)}px`;
  shapeEl.style.top = `${px(shape.top || 0)}px`;
  shapeEl.style.width = `${px(shape.width || 100)}px`;
  shapeEl.style.height = `${px(shape.height || 50)}px`;

  const svg = document.createElement("div");
  const flex = document.createElement("div");
  flex.style.flexDirection = "column";
  const text = document.createElement("div");
  text.style.overflowWrap = "anywhere";
  text.style.fontSize = `${fontSizePt}pt`;
  const span = document.createElement("span");
  span.style.fontSize = `${fontSizePt}pt`;
  span.textContent = label;
  text.appendChild(span);
  flex.appendChild(text);
  shapeEl.appendChild(svg);
  shapeEl.appendChild(flex);
  root.appendChild(shapeEl);
  return { root, shapeEl, flex, text, span };
}

/** Replace document.createRange + getBoundingClientRect with a layout mock that
 * reports line rects that scale proportionally with the current font size. */
function installMeasurement(text, { baseWidth, baseHeight, basePt, lineCount = 1 }) {
  const readFactor = () => {
    const m = text.style.fontSize.match(/([\d.]+)pt/);
    const cur = m ? parseFloat(m[1]) : basePt;
    return cur / basePt;
  };
  const originalCreateRange = document.createRange.bind(document);
  document.createRange = () => ({
    selectNodeContents: () => {},
    getClientRects: () => {
      const f = readFactor();
      const h = (baseHeight * f) / lineCount;
      return Array.from({ length: lineCount }, (_, i) => ({
        width: baseWidth * f,
        height: h,
        top: i * h,
        bottom: (i + 1) * h,
        left: 0,
        right: baseWidth * f,
      }));
    },
  });
  text.getBoundingClientRect = () => {
    const f = readFactor();
    const h = baseHeight * f;
    return { width: baseWidth * f, height: h, top: 0, bottom: h, left: 0, right: baseWidth * f };
  };
  return originalCreateRange;
}

describe("findRenderedShapeElement", () => {
  /** Build a group container with a group-relative child, mimicking the
   * renderer's grouped-shape DOM: the container sits at the group's slide
   * offset, the child at its group-local position. */
  function buildGroupDom({ groupPos, childPos, childSize }) {
    const root = document.createElement("div");
    const group = document.createElement("div");
    group.style.left = `${px(groupPos.x)}px`;
    group.style.top = `${px(groupPos.y)}px`;
    group.style.width = `${px(360)}px`;
    group.style.height = `${px(120)}px`;
    const child = document.createElement("div");
    child.style.left = `${px(childPos.x)}px`;
    child.style.top = `${px(childPos.y)}px`;
    child.style.width = `${px(childSize.w)}px`;
    child.style.height = `${px(childSize.h)}px`;
    group.appendChild(child);
    root.appendChild(group);
    return { root, group, child };
  }

  it("finds a top-level shape by absolute position", () => {
    const shape = { left: 10, top: 20, width: 100, height: 50 };
    const { root, shapeEl } = buildShapeDom({ shape });
    const found = findRenderedShapeElement(
      root,
      px(shape.left),
      px(shape.top),
      px(shape.width),
      px(shape.height),
    );
    expect(found).toBe(shapeEl);
  });

  it("finds a shape inside a group container via accumulated offsets", () => {
    // Group at (180,140); child at group-local (0,30) — the same geometry as
    // the shape-diagram.pptx fixture. Slide-absolute box: (180,170).
    const { root, child } = buildGroupDom({
      groupPos: { x: 180, y: 140 },
      childPos: { x: 0, y: 30 },
      childSize: { w: 140, h: 60 },
    });
    const found = findRenderedShapeElement(root, px(180), px(170), px(140), px(60));
    expect(found).toBe(child);
  });

  it("returns null when nothing matches", () => {
    const { root } = buildGroupDom({
      groupPos: { x: 180, y: 140 },
      childPos: { x: 0, y: 30 },
      childSize: { w: 140, h: 60 },
    });
    expect(findRenderedShapeElement(root, px(10), px(10), px(50), px(50))).toBeNull();
  });
});

describe("shrinkTextToFit", () => {
  it("returns immediately when there are no shapes", () => {
    const root = document.createElement("div");
    expect(() => shrinkTextToFit(root, [], 1)).not.toThrow();
    expect(() => shrinkTextToFit(root, null, 1)).not.toThrow();
  });

  it("shrinks a single-line label that overflows an ellipse", () => {
    const shape = { shapType: "ellipse", left: 0, top: 0, width: 100, height: 50 };
    const { root, text, span } = buildShapeDom({ shape, fontSizePt: 20 });
    const restore = installMeasurement(text, { baseWidth: 160, baseHeight: 30, basePt: 20 });
    try {
      shrinkTextToFit(root, [shape], 1);
      const size = parseFloat(text.style.fontSize);
      // 20pt * (119.07/160) ≈ 14.9pt — shrunk but far above the 7pt floor.
      expect(size).toBeGreaterThan(7);
      expect(size).toBeLessThan(20);
      expect(size).toBeCloseTo(14.9, 1);
      // Relative span size is preserved.
      expect(parseFloat(span.style.fontSize)).toBeCloseTo(size, 1);
    } finally {
      document.createRange = restore;
    }
  });

  it("leaves text that already fits untouched", () => {
    const shape = { shapType: "ellipse", left: 0, top: 0, width: 100, height: 50 };
    const { root, text } = buildShapeDom({ shape, fontSizePt: 20 });
    const restore = installMeasurement(text, { baseWidth: 100, baseHeight: 30, basePt: 20 });
    try {
      shrinkTextToFit(root, [shape], 1);
      expect(text.style.fontSize).toBe("20pt");
    } finally {
      document.createRange = restore;
    }
  });

  it("scales a wrapping multi-line block gently and preserves its line structure", () => {
    const shape = { shapType: "ellipse", left: 0, top: 0, width: 100, height: 50 };
    const { root, text, span } = buildShapeDom({
      shape,
      fontSizePt: 20,
      label: "Line\nLine\nLine",
    });
    // 3 lines nearly filling the shape's height — the shrink is proportional,
    // so the lines stay as a block instead of collapsing to a tiny single line.
    const restore = installMeasurement(text, {
      baseWidth: 120,
      baseHeight: 48,
      basePt: 20,
      lineCount: 3,
    });
    try {
      shrinkTextToFit(root, [shape], 1);
      const size = parseFloat(text.style.fontSize);
      expect(size).toBeGreaterThan(7);
      expect(size).toBeLessThan(20);
      // The DOM structure (the line span) is untouched — only font sizes move.
      expect(text.querySelectorAll("span").length).toBe(1);
      expect(parseFloat(span.style.fontSize)).toBeCloseTo(size, 1);
    } finally {
      document.createRange = restore;
    }
  });

  it("clamps the shrink to the legibility floor (MIN_FONT_PT)", () => {
    const shape = { shapType: "ellipse", left: 0, top: 0, width: 100, height: 50 };
    const { root, text } = buildShapeDom({ shape, fontSizePt: 20 });
    // A pathologically wide line — the fit scale would collapse the text far
    // below the 7pt floor; the clamp must apply 7pt to the DOM.
    const restore = installMeasurement(text, { baseWidth: 20000, baseHeight: 30, basePt: 20 });
    try {
      shrinkTextToFit(root, [shape], 1);
      expect(parseFloat(text.style.fontSize)).toBeCloseTo(7, 0);
    } finally {
      document.createRange = restore;
    }
  });

  it("never enlarges text already below the legibility floor", () => {
    // A 5pt overflowing label: the floor ratio (7/5) must not scale the text
    // UP to 7pt — the floor stops further shrinking, it never enlarges.
    const shape = { shapType: "ellipse", left: 0, top: 0, width: 100, height: 50 };
    const { root, text } = buildShapeDom({ shape, fontSizePt: 5 });
    const restore = installMeasurement(text, { baseWidth: 2000, baseHeight: 12, basePt: 5 });
    try {
      shrinkTextToFit(root, [shape], 1);
      expect(parseFloat(text.style.fontSize)).toBeCloseTo(5, 1);
    } finally {
      document.createRange = restore;
    }
  });

  it("skips shapes that are not curved (rect)", () => {
    const shape = { shapType: "rect", left: 0, top: 0, width: 100, height: 50 };
    const { root, text } = buildShapeDom({ shape, fontSizePt: 20 });
    const restore = installMeasurement(text, { baseWidth: 160, baseHeight: 30, basePt: 20 });
    try {
      shrinkTextToFit(root, [shape], 1);
      expect(text.style.fontSize).toBe("20pt");
    } finally {
      document.createRange = restore;
    }
  });

  it("applies the vertical nudge to the flex container of an ellipse shape", () => {
    const shape = { shapType: "ellipse", left: 0, top: 0, width: 100, height: 50 };
    const { root, flex, text } = buildShapeDom({ shape, fontSizePt: 20 });
    const restore = installMeasurement(text, { baseWidth: 100, baseHeight: 30, basePt: 20 });
    try {
      shrinkTextToFit(root, [shape], 1);
      // nudge = shapeH_px * 0.1 = (50 * 4/3) * 0.1 ≈ 6.67px
      expect(parseFloat(flex.style.paddingTop)).toBeCloseTo(px(50) * 0.1, 1);
    } finally {
      document.createRange = restore;
    }
  });

  it("does nothing when no DOM element matches the shape position", () => {
    const shape = { shapType: "ellipse", left: 0, top: 0, width: 100, height: 50 };
    // Build the DOM but at a different position so no child matches.
    const { root, text } = buildShapeDom({
      shape: { ...shape, left: 500, top: 500 },
      fontSizePt: 20,
    });
    const restore = installMeasurement(text, { baseWidth: 160, baseHeight: 30, basePt: 20 });
    try {
      expect(() => shrinkTextToFit(root, [shape], 1)).not.toThrow();
      expect(text.style.fontSize).toBe("20pt");
    } finally {
      document.createRange = restore;
    }
  });
});

describe("replaceFontsInDOM", () => {
  it("replaces a simple quoted Microsoft font", () => {
    const root = document.createElement("div");
    root.style.fontFamily = '"Calibri"';
    replaceFontsInDOM(root);
    expect(root.style.fontFamily).toBe('"Carlito"');
  });

  it("replaces multi-word font variants without mangling them", () => {
    const root = document.createElement("div");
    root.style.fontFamily =
      '"Calibri Light", "Cambria Math", "Segoe UI Light", "Tw Cen MT Condensed", "Aptos Display"';
    replaceFontsInDOM(root);
    // Each variant must map to its Google Font as a complete, valid family
    // name — never a prefix-mangled value like `"Carlito" Light"`.
    expect(root.style.fontFamily).toBe(
      '"Carlito", "Caladea", "Open Sans", "League Spartan", "Carlito"',
    );
  });

  it("replaces unquoted names in a family list", () => {
    const root = document.createElement("div");
    root.style.fontFamily = "Calibri, sans-serif";
    replaceFontsInDOM(root);
    expect(root.style.fontFamily).toBe('"Carlito", sans-serif');
  });

  it("does not match inside longer or hyphenated family names", () => {
    const root = document.createElement("div");
    root.style.fontFamily = '"MyCalibri", "Calibri-2", "Arial"';
    replaceFontsInDOM(root);
    expect(root.style.fontFamily).toBe('"MyCalibri", "Calibri-2", "Arial"');
  });

  it("walks nested elements", () => {
    const root = document.createElement("div");
    const child = document.createElement("span");
    root.style.fontFamily = '"Tahoma"';
    child.style.fontFamily = '"Segoe UI Light"';
    root.appendChild(child);
    replaceFontsInDOM(root);
    expect(root.style.fontFamily).toBe('"Verdana"');
    expect(child.style.fontFamily).toBe('"Open Sans"');
  });

  it("keeps valid CSS when the same font appears twice in a list", () => {
    const root = document.createElement("div");
    root.style.fontFamily = '"Calibri", "Calibri"';
    replaceFontsInDOM(root);
    expect(root.style.fontFamily).toBe('"Carlito", "Carlito"');
  });
});

describe("cropIsBlank", () => {
  const makeCtx = (alphas) => ({
    getImageData: () => {
      const data = new Uint8ClampedArray(alphas.length * 4);
      for (let i = 0; i < alphas.length; i++) data[i * 4 + 3] = alphas[i];
      return { data };
    },
  });

  it("flags a fully transparent crop as blank", () => {
    expect(cropIsBlank(makeCtx([0, 0, 0, 0]), 2, 2)).toBe(true);
  });

  it("keeps a crop with meaningful opaque content", () => {
    // 3 of 4 pixels opaque → 75% coverage, well above the 0.2% threshold.
    expect(cropIsBlank(makeCtx([255, 255, 255, 0]), 2, 2)).toBe(false);
  });

  it("flags a crop with negligible opaque content as blank", () => {
    // 1 opaque pixel in a large crop is below the threshold.
    const alphas = new Array(10_000).fill(0);
    alphas[0] = 255;
    expect(cropIsBlank(makeCtx(alphas), 100, 100)).toBe(true);
  });

  it("returns false when getImageData throws (tainted canvas)", () => {
    const ctx = {
      getImageData: () => {
        throw new Error("tainted");
      },
    };
    expect(cropIsBlank(ctx, 10, 10)).toBe(false);
  });
});
