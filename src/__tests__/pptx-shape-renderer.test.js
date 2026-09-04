// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildShapeSvg, renderSvgToPng, renderDiagramsToPng } from "../data/pptx-shape-renderer.js";

// Mock the slide-crop renderer so we can exercise `renderDiagramsToPng`'s
// crop → SVG fallback chain without a real PPTX or a real browser layout.
vi.mock("../data/pptx-diagram-cropper.js", () => ({
  cropSlideToDiagram: vi.fn(),
  parsePresentation: vi.fn(),
}));
import { cropSlideToDiagram, parsePresentation } from "../data/pptx-diagram-cropper.js";

/** Minimal shape factory matching the ExtractedElement geometry contract.
 * Coordinates are in points (matching pptxtojson's output for top-level elements). */
const shape = (overrides = {}) => ({
  type: "text",
  content: "",
  left: 0,
  top: 0,
  width: 100,
  height: 50,
  order: 0,
  shapType: "rect",
  fill: "FF0000",
  fillRaw: { type: "color", value: "FF0000" },
  strokeOnly: false,
  hasConnector: false,
  path: null,
  pathViewBox: null,
  borderColor: null,
  borderWidth: 0,
  borderType: null,
  rotate: 0,
  isFlipV: false,
  isFlipH: false,
  shadow: null,
  ...overrides,
});

const connector = (overrides = {}) =>
  shape({
    type: "connector",
    shapType: null,
    fill: null,
    fillRaw: null,
    strokeOnly: true,
    hasConnector: true,
    borderColor: "000000",
    borderWidth: 1,
    borderType: "solid",
    ...overrides,
  });

describe("buildShapeSvg", () => {
  it("returns empty string for no renderable shapes", () => {
    expect(buildShapeSvg([], { width: 100, height: 100 })).toBe("");
    expect(
      buildShapeSvg(
        [shape({ shapType: null, fill: null, fillRaw: null, path: null, hasConnector: false })],
        { width: 100, height: 100 },
      ),
    ).toBe("");
  });

  it("renders a rect shape as an SVG rect element", () => {
    const svg = buildShapeSvg(
      [shape({ shapType: "rect", left: 10, top: 20, width: 100, height: 50 })],
      { width: 200, height: 200 },
    );
    expect(svg).toContain("<svg");
    expect(svg).toContain("<rect");
    expect(svg).toContain('x="10"');
    expect(svg).toContain('y="20"');
    expect(svg).toContain('width="100"');
    expect(svg).toContain('height="50"');
    expect(svg).toContain('fill="#FF0000"');
  });

  it("renders an ellipse shape as an SVG ellipse element", () => {
    const svg = buildShapeSvg(
      [shape({ shapType: "ellipse", left: 0, top: 0, width: 100, height: 80 })],
      { width: 100, height: 80 },
    );
    expect(svg).toContain("<ellipse");
    expect(svg).toContain('rx="50"');
    expect(svg).toContain('ry="40"');
  });

  it("renders text inside shapes with shapType (e.g. ovals with labels)", () => {
    const svg = buildShapeSvg(
      [
        shape({
          shapType: "ellipse",
          content: "Tabulate values",
          left: 0,
          top: 0,
          width: 200,
          height: 100,
          fill: "#7B43EC",
        }),
      ],
      { width: 200, height: 100 },
    );
    expect(svg).toContain("<ellipse");
    expect(svg).toContain("Tabulate values");
    expect(svg).toContain("<text");
  });

  it("picks light text on dark fills and dark text on light fills", () => {
    // The SVG fallback has no theme context — `#222` text on a dark shape
    // was unreadable, so the ink contrasts the resolved fill.
    const darkFill = buildShapeSvg(
      [
        shape({
          shapType: "rect",
          content: "Dark box",
          left: 0,
          top: 0,
          width: 100,
          height: 50,
          fill: "#0F172A",
          fillRaw: { type: "color", value: "#0F172A" },
        }),
      ],
      { width: 100, height: 50 },
    );
    expect(darkFill).toContain('fill="#f1f5f9"');

    const lightFill = buildShapeSvg(
      [
        shape({
          shapType: "rect",
          content: "Light box",
          left: 0,
          top: 0,
          width: 100,
          height: 50,
          fill: "#F1F5F9",
          fillRaw: { type: "color", value: "#F1F5F9" },
        }),
      ],
      { width: 100, height: 50 },
    );
    expect(lightFill).toContain('fill="#222222"');

    const noFill = buildShapeSvg(
      [
        shape({
          shapType: "rect",
          content: "Bare",
          left: 0,
          top: 0,
          width: 100,
          height: 50,
          fill: null,
          fillRaw: null,
        }),
      ],
      { width: 100, height: 50 },
    );
    expect(noFill).toContain('fill="#222222"');
  });

  it("renders a triangle shape as an SVG polygon", () => {
    const svg = buildShapeSvg(
      [shape({ shapType: "triangle", left: 0, top: 0, width: 100, height: 50 })],
      { width: 100, height: 50 },
    );
    expect(svg).toContain("<polygon");
    expect(svg).toContain("0,50");
  });

  it("renders a diamond shape as an SVG polygon", () => {
    const svg = buildShapeSvg(
      [shape({ shapType: "diamond", left: 0, top: 0, width: 100, height: 100 })],
      { width: 100, height: 100 },
    );
    expect(svg).toContain("<polygon");
    expect(svg).toContain("50,0");
    expect(svg).toContain("100,50");
  });

  it("renders a connector as an SVG line", () => {
    const svg = buildShapeSvg([connector({ left: 0, top: 50, width: 200, height: 0 })], {
      width: 200,
      height: 100,
    });
    expect(svg).toContain("<line");
    expect(svg).toContain('x1="0"');
    expect(svg).toContain('x2="200"');
    expect(svg).toContain('stroke="#000000"');
  });

  it("renders a custom path with viewBox scaling", () => {
    const svg = buildShapeSvg(
      [
        shape({
          shapType: null,
          fill: null,
          fillRaw: { type: "color", value: "00FF00" },
          path: "M0,0 L100,0 L100,50 L0,50 Z",
          pathViewBox: { x: 0, y: 0, width: 100, height: 50 },
          left: 200,
          top: 100,
          width: 200,
          height: 100,
        }),
      ],
      { width: 400, height: 200 },
    );
    expect(svg).toContain("<path");
    expect(svg).toContain('d="M0,0 L100,0 L100,50 L0,50 Z"');
    expect(svg).toContain("translate(200,100)");
    expect(svg).toContain("scale(2,2)");
    expect(svg).toContain('fill="#00FF00"');
  });

  it("renders a custom path without viewBox as-is", () => {
    const svg = buildShapeSvg(
      [
        shape({
          shapType: null,
          fill: null,
          fillRaw: { type: "color", value: "0000FF" },
          path: "M0,0 L200,0 L200,100 L0,100 Z",
          pathViewBox: null,
          left: 0,
          top: 0,
          width: 200,
          height: 100,
        }),
      ],
      { width: 200, height: 100 },
    );
    expect(svg).toContain("<path");
    expect(svg).toContain('fill="#0000FF"');
    expect(svg).not.toContain("scale(");
  });

  it("renders border/stroke attributes", () => {
    const svg = buildShapeSvg(
      [shape({ shapType: "rect", borderColor: "333333", borderWidth: 2, borderType: "dashed" })],
      { width: 100, height: 100 },
    );
    expect(svg).toContain('stroke="#333333"');
    expect(svg).toContain('stroke-width="2"');
    expect(svg).toContain("stroke-dasharray");
  });

  it("renders dotted border type", () => {
    const svg = buildShapeSvg(
      [shape({ shapType: "rect", borderColor: "333333", borderWidth: 1, borderType: "dotted" })],
      { width: 100, height: 100 },
    );
    expect(svg).toContain('stroke-dasharray="1,2"');
  });

  it("renders rotation transform", () => {
    const svg = buildShapeSvg(
      [shape({ shapType: "rect", rotate: 45, left: 50, top: 50, width: 100, height: 100 })],
      { width: 200, height: 200 },
    );
    expect(svg).toContain("rotate(45");
    expect(svg).toContain("100 100"); // center point
  });

  it("renders flip transforms", () => {
    const svg = buildShapeSvg(
      [
        shape({
          shapType: "rect",
          isFlipH: true,
          isFlipV: true,
          left: 50,
          top: 50,
          width: 100,
          height: 100,
        }),
      ],
      { width: 200, height: 200 },
    );
    expect(svg).toContain("scale(-1 -1)");
  });

  it("renders fill=none for no fill", () => {
    const svg = buildShapeSvg([shape({ shapType: "rect", fill: null, fillRaw: null })], {
      width: 100,
      height: 100,
    });
    expect(svg).toContain('fill="none"');
  });

  it("renders gradient fill using first color as approximation", () => {
    const svg = buildShapeSvg(
      [
        shape({
          shapType: "rect",
          fill: null,
          fillRaw: {
            type: "gradient",
            value: {
              path: "line",
              rot: 90,
              colors: [
                { pos: "0", color: "FF0000" },
                { pos: "100", color: "0000FF" },
              ],
            },
          },
        }),
      ],
      { width: 100, height: 100 },
    );
    expect(svg).toContain('fill="#FF0000"');
  });

  it("renders multiple shapes in a single SVG", () => {
    const svg = buildShapeSvg(
      [
        shape({ shapType: "rect", left: 0, top: 0, width: 100, height: 50, fill: "FF0000" }),
        shape({ shapType: "ellipse", left: 100, top: 0, width: 80, height: 80, fill: "00FF00" }),
        connector({ left: 50, top: 60, width: 100, height: 0 }),
      ],
      { width: 200, height: 100 },
    );
    expect(svg).toContain("<rect");
    expect(svg).toContain("<ellipse");
    expect(svg).toContain("<line");
  });

  it("offsets shape coordinates by the group origin", () => {
    // Shapes have absolute slide coords (left=500); the group starts at
    // left=400. The SVG must subtract the origin so the shape lands at
    // x=100 inside the viewBox, not at x=500 (outside the viewBox).
    const svg = buildShapeSvg(
      [shape({ shapType: "rect", left: 500, top: 300, width: 100, height: 50 })],
      { left: 400, top: 250, width: 200, height: 100 },
    );
    expect(svg).toContain('x="100"');
    expect(svg).toContain('y="50"');
  });

  it("falls back to rect for unknown shapType", () => {
    const svg = buildShapeSvg(
      [shape({ shapType: "unknownWeirdType", left: 10, top: 10, width: 50, height: 30 })],
      { width: 100, height: 100 },
    );
    expect(svg).toContain("<rect");
  });

  it("sanitizes untrusted fill colors", () => {
    const svg = buildShapeSvg(
      [shape({ shapType: "rect", fillRaw: { type: "color", value: "javascript:alert(1)" } })],
      { width: 100, height: 100 },
    );
    // sanitizeCssColor returns "transparent" for invalid → fill="none"
    expect(svg).toContain('fill="none"');
    expect(svg).not.toContain("javascript:");
  });

  it("sanitizes untrusted border colors", () => {
    const svg = buildShapeSvg(
      [shape({ shapType: "rect", borderColor: "javascript:alert(1)", borderWidth: 1 })],
      { width: 100, height: 100 },
    );
    expect(svg).not.toContain("javascript:");
    expect(svg).not.toContain("stroke=");
  });
});

describe("renderSvgToPng", () => {
  it("returns null when canvas API is unavailable", async () => {
    const origCreate = document.createElement;
    document.createElement = () => ({ getContext: () => null });
    try {
      const result = await renderSvgToPng("<svg></svg>", 100, 100);
      expect(result).toBeNull();
    } finally {
      document.createElement = origCreate;
    }
  });
});

describe("renderDiagramsToPng", () => {
  let mockToDataURL;
  let mockGetContext;
  let origImage;
  let origCreate;

  beforeEach(() => {
    // Mock canvas to capture the drawn SVG and return a fake PNG data URL.
    mockToDataURL = vi.fn(() => "data:image/png;base64,ZmFrZQ==");
    mockGetContext = vi.fn(() => ({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })),
      putImageData: vi.fn(),
      createImageData: vi.fn(() => new ImageData(1, 1)),
    }));
    origCreate = document.createElement;
    origImage = window.Image;
    document.createElement = vi.fn((tag) => {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: mockGetContext,
          toDataURL: mockToDataURL,
        };
      }
      return origCreate.call(document, tag);
    });
    // jsdom's Image never fires onload for data: URLs. Replace with a mock
    // that fires onload synchronously when src is set.
    window.Image = vi.fn(function () {
      this.onload = null;
      this.onerror = null;
      Object.defineProperty(this, "src", {
        set(val) {
          this._src = val;
          // Fire onload on the next microtask, matching the real async behavior
          if (this.onload) queueMicrotask(() => this.onload());
        },
        get() {
          return this._src;
        },
      });
    });
  });

  afterEach(() => {
    document.createElement = origCreate;
    window.Image = origImage;
    vi.restoreAllMocks();
  });

  it("replaces a diagram element with an image element on successful render", async () => {
    const slides = [
      {
        index: 0,
        title: "Test",
        notes: "",
        elements: [
          {
            type: "diagram",
            content: "Step 1, Step 2",
            placeholderType: null,
            order: 1,
            left: 100,
            top: 100,
            width: 200,
            height: 100,
            shapes: [
              shape({
                shapType: "rect",
                left: 0,
                top: 0,
                width: 100,
                height: 50,
                fill: "FF0000",
              }),
              shape({
                shapType: "rect",
                left: 100,
                top: 0,
                width: 100,
                height: 50,
                fill: "00FF00",
              }),
            ],
          },
        ],
        background: "",
      },
    ];
    const images = [];
    await renderDiagramsToPng(slides, images);

    expect(slides[0].elements).toHaveLength(1);
    // Image element with caption as alt text
    expect(slides[0].elements[0].type).toBe("image");
    expect(slides[0].elements[0].mimeType).toBe("image/png");
    expect(slides[0].elements[0].ref).toMatch(/^diagram-0-1\.png$/);
    expect(slides[0].elements[0].base64).toBe("ZmFrZQ==");
    expect(slides[0].elements[0].caption).toBe("Step 1, Step 2");
    // Image registered in the images accumulator
    expect(images).toHaveLength(1);
    expect(images[0].ref).toBe("diagram-0-1.png");
  });

  it("does not emit text fallback when diagram has no text content", async () => {
    const slides = [
      {
        index: 0,
        title: "Test",
        notes: "",
        elements: [
          {
            type: "diagram",
            content: "",
            placeholderType: null,
            order: 1,
            left: 100,
            top: 100,
            width: 200,
            height: 100,
            shapes: [
              shape({
                shapType: "rect",
                left: 0,
                top: 0,
                width: 100,
                height: 50,
                fill: "FF0000",
              }),
            ],
          },
        ],
        background: "",
      },
    ];
    await renderDiagramsToPng(slides, []);
    expect(slides[0].elements).toHaveLength(1);
    expect(slides[0].elements[0].type).toBe("image");
  });

  it("leaves diagram element unchanged when shapes have no renderable data", async () => {
    const slides = [
      {
        index: 0,
        title: "Test",
        notes: "",
        elements: [
          {
            type: "diagram",
            content: "text",
            placeholderType: null,
            order: 1,
            left: 100,
            top: 100,
            width: 200,
            height: 100,
            shapes: [
              shape({
                shapType: null,
                fill: null,
                fillRaw: null,
                path: null,
                hasConnector: false,
                content: "",
              }),
            ],
          },
        ],
        background: "",
      },
    ];
    await renderDiagramsToPng(slides, []);
    expect(slides[0].elements).toHaveLength(1);
    expect(slides[0].elements[0].type).toBe("diagram");
  });

  it("leaves non-diagram elements unchanged", async () => {
    const textEl = {
      type: "text",
      content: "hello",
      order: 0,
      left: 0,
      top: 0,
      width: 100,
      height: 50,
    };
    const imgEl = {
      type: "image",
      base64: "abc",
      mimeType: "image/png",
      ref: "img1.png",
      order: 1,
      left: 0,
      top: 0,
      width: 100,
      height: 50,
    };
    const slides = [{ index: 0, title: "T", notes: "", elements: [textEl, imgEl], background: "" }];
    await renderDiagramsToPng(slides, []);
    expect(slides[0].elements[0]).toBe(textEl);
    expect(slides[0].elements[1]).toBe(imgEl);
  });

  it("skips diagrams smaller than the minimum render size", async () => {
    const slides = [
      {
        index: 0,
        title: "Test",
        notes: "",
        elements: [
          {
            type: "diagram",
            content: "tiny",
            placeholderType: null,
            order: 1,
            left: 0,
            top: 0,
            width: 2,
            height: 2,
            shapes: [shape({ shapType: "rect" })],
          },
        ],
        background: "",
      },
    ];
    await renderDiagramsToPng(slides, []);
    expect(slides[0].elements).toHaveLength(1);
    expect(slides[0].elements[0].type).toBe("diagram");
  });

  it("processes multiple diagrams in the same slide with incrementing refs", async () => {
    const mkDiagram = (order, shapes) => ({
      type: "diagram",
      content: "text",
      placeholderType: null,
      order,
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      shapes,
    });
    const slides = [
      {
        index: 0,
        title: "Test",
        notes: "",
        elements: [
          mkDiagram(1, [shape({ shapType: "rect", fill: "FF0000" })]),
          mkDiagram(2, [shape({ shapType: "ellipse", fill: "00FF00" })]),
        ],
        background: "",
      },
    ];
    const images = [];
    await renderDiagramsToPng(slides, images);
    expect(slides[0].elements.filter((e) => e.type === "image")).toHaveLength(2);
    expect(images.map((i) => i.ref)).toEqual(["diagram-0-1.png", "diagram-0-2.png"]);
  });

  describe("crop path", () => {
    const mkDiagram = (overrides = {}) => ({
      type: "diagram",
      content: "Step 1, Step 2",
      placeholderType: null,
      order: 1,
      left: 100,
      top: 100,
      width: 200,
      height: 100,
      shapes: [shape({ shapType: "rect", fill: "FF0000" })],
      ...overrides,
    });

    beforeEach(() => {
      vi.mocked(cropSlideToDiagram).mockReset();
      vi.mocked(parsePresentation).mockReset();
      vi.mocked(parsePresentation).mockResolvedValue({});
    });

    it("uses the crop path and shares a single presentation across diagrams", async () => {
      vi.mocked(cropSlideToDiagram).mockResolvedValue("data:image/png;base64,Y3JvcA==");
      const slides = [
        {
          index: 0,
          title: "Test",
          notes: "",
          elements: [mkDiagram({ order: 1 }), mkDiagram({ order: 2 })],
          background: "",
        },
      ];
      const images = [];
      await renderDiagramsToPng(slides, images, new ArrayBuffer(0));

      // One presentation parse for the whole import, not one per diagram.
      expect(parsePresentation).toHaveBeenCalledTimes(1);
      expect(cropSlideToDiagram).toHaveBeenCalledTimes(2);
      // The shared presentation is passed to every crop call.
      const presentation = await vi.mocked(parsePresentation).mock.results[0].value;
      for (const call of vi.mocked(cropSlideToDiagram).mock.calls) {
        expect(call[6]).toBe(presentation);
      }

      const imageEls = slides[0].elements.filter((e) => e.type === "image");
      expect(imageEls).toHaveLength(2);
      expect(imageEls[0].caption).toBe("Step 1, Step 2");
      expect(imageEls[0].base64).toBe("Y3JvcA==");
      expect(images.map((i) => i.ref)).toEqual(["diagram-0-1.png", "diagram-0-2.png"]);
    });

    it("falls back to the SVG path when the crop returns null", async () => {
      vi.mocked(cropSlideToDiagram).mockResolvedValue(null);
      const slides = [
        {
          index: 0,
          title: "Test",
          notes: "",
          elements: [mkDiagram()],
          background: "",
        },
      ];
      const images = [];
      await renderDiagramsToPng(slides, images, new ArrayBuffer(0));
      expect(cropSlideToDiagram).toHaveBeenCalledTimes(1);
      // SVG fallback produced an image.
      expect(slides[0].elements[0].type).toBe("image");
      expect(images).toHaveLength(1);
    });

    it("falls back to the SVG path when the crop throws", async () => {
      vi.mocked(cropSlideToDiagram).mockRejectedValue(new Error("renderer exploded"));
      const slides = [
        {
          index: 0,
          title: "Test",
          notes: "",
          elements: [mkDiagram()],
          background: "",
        },
      ];
      await renderDiagramsToPng(slides, [], new ArrayBuffer(0));
      expect(slides[0].elements[0].type).toBe("image");
    });

    it("uses the crop path for group-sourced diagrams (fromGroup)", async () => {
      // The cropper's matcher walks group containers with accumulated
      // offsets, so grouped diagrams get the high-fidelity crop too.
      const slides = [
        {
          index: 0,
          title: "Test",
          notes: "",
          elements: [mkDiagram({ fromGroup: true })],
          background: "",
        },
      ];
      await renderDiagramsToPng(slides, [], new ArrayBuffer(0));
      expect(cropSlideToDiagram).toHaveBeenCalled();
      expect(slides[0].elements[0].type).toBe("image");
    });

    it("leaves the diagram unchanged when both paths fail", async () => {
      vi.mocked(cropSlideToDiagram).mockResolvedValue(null);
      // Force the SVG path to fail too by breaking the canvas API.
      const origCreate = document.createElement;
      document.createElement = () => ({ getContext: () => null });
      try {
        const slides = [
          {
            index: 0,
            title: "Test",
            notes: "",
            elements: [mkDiagram()],
            background: "",
          },
        ];
        await renderDiagramsToPng(slides, [], new ArrayBuffer(0));
        expect(slides[0].elements[0].type).toBe("diagram");
      } finally {
        document.createElement = origCreate;
      }
    });
  });
});
