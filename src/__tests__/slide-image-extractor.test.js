// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  extractSlideImageSrcs,
  extractAllImageSrcs,
  countContentImages,
  compressImage,
  extractAll,
} from "../data/ai/slide-image-extractor.js";

// Mock DeckImagesResolver to avoid localStorage access in jsdom
vi.mock("../../editor/image/deck-images-resolver.js", () => ({
  DeckImagesResolver: {
    resolvePreviewSrc: vi.fn(async (src) => {
      if (src.startsWith("images/")) return `/${src}`;
      return src;
    }),
  },
}));

/**
 * Mock Image class that triggers onload asynchronously when src is set.
 */
class MockImage {
  constructor() {
    this._src = "";
    this.onload = null;
    this.onerror = null;
    this.naturalWidth = 1024;
    this.naturalHeight = 768;
    this.width = 1024;
    this.height = 768;
  }
  set src(value) {
    this._src = value;
    setTimeout(() => {
      if (this._shouldFail) {
        this.onerror && this.onerror();
      } else {
        this.onload && this.onload();
      }
    }, 0);
  }
  get src() {
    return this._src;
  }
  fail() {
    this._shouldFail = true;
  }
}

describe("extractSlideImageSrcs", () => {
  it("extracts HTML <img> srcs", () => {
    const slide = 'layout: header-content\n@main\n<img src="images/chart.png">';
    expect(extractSlideImageSrcs(slide)).toEqual(["images/chart.png"]);
  });

  it("extracts markdown image srcs", () => {
    const slide = "layout: header-content\n@main\n![diagram](images/diagram.png)";
    expect(extractSlideImageSrcs(slide)).toEqual(["images/diagram.png"]);
  });

  it("extracts both HTML and markdown images in document order", () => {
    const slide =
      'layout: two-column\n@main\n<img src="images/a.png">\n\n@media\n![b](images/b.jpg)';
    expect(extractSlideImageSrcs(slide)).toEqual(["images/a.png", "images/b.jpg"]);
  });

  it("filters out background images", () => {
    const slide =
      'layout: header-content\nbackground: linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(images/bg.jpg)\n@main\n<img src="images/fg.png">';
    expect(extractSlideImageSrcs(slide)).toEqual(["images/fg.png"]);
  });

  it("filters out SVG placeholder data URIs", () => {
    const slide = 'layout: header-content\n@main\n<img src="data:image/svg+xml,%3Csvg%3E">';
    expect(extractSlideImageSrcs(slide)).toEqual([]);
  });

  it("returns empty for slide with no images", () => {
    const slide = "layout: header-content\n@main\n- Just text";
    expect(extractSlideImageSrcs(slide)).toEqual([]);
  });
});

describe("extractAllImageSrcs", () => {
  it("extracts per-slide images from a multi-slide deck", () => {
    const md =
      'layout: header-content\n@main\n<img src="images/a.png">\n\n---\n\nlayout: header-content\n@main\n- No images\n\n---\n\nlayout: two-column\n@main\n<img src="images/b.png">\n\n@media\n![c](images/c.gif)';
    expect(extractAllImageSrcs(md)).toEqual([
      ["images/a.png"],
      [],
      ["images/b.png", "images/c.gif"],
    ]);
  });

  it("handles single slide", () => {
    const md = 'layout: header-content\n@main\n<img src="images/x.png">';
    expect(extractAllImageSrcs(md)).toEqual([["images/x.png"]]);
  });
});

describe("countContentImages", () => {
  it("counts all content images and estimates tokens", () => {
    const md =
      'layout: header-content\n@main\n<img src="images/a.png">\n\n---\n\nlayout: header-content\n@main\n<img src="images/b.png">\n\n@media\n<img src="images/c.png">';
    const { count, estimatedTokens } = countContentImages(md);
    expect(count).toBe(3);
    // 3 images at 768x576 (default) → 765 each → 2295
    expect(estimatedTokens).toBe(2295);
  });

  it("returns 0 for deck with no images", () => {
    const md = "layout: header-content\n@main\n- Just text";
    const { count, estimatedTokens } = countContentImages(md);
    expect(count).toBe(0);
    expect(estimatedTokens).toBe(0);
  });

  it("excludes background images from count", () => {
    const md =
      'layout: header-content\nbackground: url(images/bg.jpg)\n@main\n<img src="images/fg.png">';
    const { count } = countContentImages(md);
    expect(count).toBe(1);
  });
});

describe("compressImage", () => {
  let mockCanvas;
  let mockCtx;

  beforeEach(() => {
    globalThis.Image = MockImage;
    mockCtx = { drawImage: vi.fn() };
    mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => mockCtx),
      toDataURL: vi.fn(() => "data:image/jpeg;base64,/9j/short="),
    };
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      if (tag === "canvas") return mockCanvas;
      return origCreate(tag);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.Image;
  });

  it("compresses an image and returns a data URL under maxBytes", async () => {
    mockCanvas.toDataURL = vi.fn(() => "data:image/jpeg;base64,/9j/short=");
    const result = await compressImage("data:image/png;base64,iVBOR=");
    expect(result).toBe("data:image/jpeg;base64,/9j/short=");
    expect(mockCtx.drawImage).toHaveBeenCalled();
  });

  it("reduces quality when image exceeds maxBytes", async () => {
    const calls = [];
    mockCanvas.toDataURL = vi.fn((_mime, quality) => {
      calls.push(quality);
      if (quality >= 0.85) return "data:image/jpeg;base64," + "x".repeat(50000);
      return "data:image/jpeg;base64,/9j/small=";
    });
    const result = await compressImage("data:image/png;base64,iVBOR=");
    expect(result).toBe("data:image/jpeg;base64,/9j/small=");
    expect(calls[0]).toBe(0.85);
    expect(calls[1]).toBe(0.7);
  });

  it("returns null on load failure", async () => {
    globalThis.Image = class extends MockImage {
      constructor() {
        super();
        this._shouldFail = true;
      }
    };
    const result = await compressImage("https://broken.example.com/img.jpg");
    expect(result).toBeNull();
  });
});

describe("extractAll", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.Image;
  });

  it("returns per-slide compressed image arrays", async () => {
    globalThis.Image = MockImage;
    const mockCtx = { drawImage: vi.fn() };
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => mockCtx),
      toDataURL: vi.fn(() => "data:image/jpeg;base64,/9j/compressed="),
    };
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      if (tag === "canvas") return mockCanvas;
      return origCreate(tag);
    });

    const md =
      'layout: header-content\n@main\n<img src="images/a.png">\n\n---\n\nlayout: header-content\n@main\n- No images';
    const result = await extractAll(md);
    expect(result[0]).toEqual(["data:image/jpeg;base64,/9j/compressed="]);
    expect(result[1]).toBeNull();
  });

  it("returns null for slides with no images", async () => {
    const md = "layout: header-content\n@main\n- Just text";
    const result = await extractAll(md);
    expect(result).toEqual([null]);
  });
});
