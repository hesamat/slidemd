import { describe, it, expect } from "vitest";
import {
  buildVisionMessage,
  extractBase64FromDataUri,
  mapContentForAnthropic,
  mapContentForGemini,
  stripImages,
  estimateImageTokens,
  estimateTotalImageTokens,
} from "../data/ai/ai-vision-message.js";

const JPEG_DATA_URI = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const PNG_DATA_URI = "data:image/png;base64,iVBORw0KGgo=";

describe("buildVisionMessage", () => {
  it("builds a content array with text + image blocks per slide", () => {
    const content = buildVisionMessage("Analyze this deck", [
      [JPEG_DATA_URI],
      null,
      [PNG_DATA_URI, JPEG_DATA_URI],
    ]);
    expect(content[0]).toEqual({ type: "text", text: "Analyze this deck" });
    // Slide 1 has 1 image
    expect(content[1]).toEqual({ type: "text", text: "Slide 1 images:" });
    expect(content[2]).toEqual({ type: "image_url", image_url: { url: JPEG_DATA_URI } });
    // Slide 2 has no images — skipped
    // Slide 3 has 2 images
    expect(content[3]).toEqual({ type: "text", text: "Slide 3 images:" });
    expect(content[4]).toEqual({ type: "image_url", image_url: { url: PNG_DATA_URI } });
    expect(content[5]).toEqual({ type: "image_url", image_url: { url: JPEG_DATA_URI } });
  });

  it("returns text-only content when no slides have images", () => {
    const content = buildVisionMessage("Analyze", [null, null, []]);
    expect(content).toHaveLength(1);
    expect(content[0]).toEqual({ type: "text", text: "Analyze" });
  });

  it("handles empty slideImages array", () => {
    const content = buildVisionMessage("Analyze", []);
    expect(content).toEqual([{ type: "text", text: "Analyze" }]);
  });
});

describe("extractBase64FromDataUri", () => {
  it("extracts mime type and base64 data from a JPEG data URI", () => {
    const result = extractBase64FromDataUri(JPEG_DATA_URI);
    expect(result).toEqual({ mimeType: "image/jpeg", data: "/9j/4AAQSkZJRg==" });
  });

  it("extracts from a PNG data URI", () => {
    const result = extractBase64FromDataUri(PNG_DATA_URI);
    expect(result).toEqual({ mimeType: "image/png", data: "iVBORw0KGgo=" });
  });

  it("returns null for a non-data URI", () => {
    expect(extractBase64FromDataUri("https://example.com/image.jpg")).toBeNull();
  });

  it("returns null for a non-base64 data URI", () => {
    expect(extractBase64FromDataUri("data:image/svg+xml,%3Csvg%3E")).toBeNull();
  });
});

describe("mapContentForAnthropic", () => {
  it("maps text blocks unchanged", () => {
    const result = mapContentForAnthropic([{ type: "text", text: "Hello" }]);
    expect(result).toEqual([{ type: "text", text: "Hello" }]);
  });

  it("maps image_url blocks to Anthropic image format", () => {
    const result = mapContentForAnthropic([
      { type: "image_url", image_url: { url: JPEG_DATA_URI } },
    ]);
    expect(result).toEqual([
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: "/9j/4AAQSkZJRg==",
        },
      },
    ]);
  });

  it("skips non-data-URI image blocks", () => {
    const result = mapContentForAnthropic([
      { type: "image_url", image_url: { url: "https://example.com/img.jpg" } },
    ]);
    expect(result).toEqual([]);
  });

  it("passes through a plain string", () => {
    const result = mapContentForAnthropic("Hello world");
    expect(result).toEqual([{ type: "text", text: "Hello world" }]);
  });

  it("handles mixed content", () => {
    const result = mapContentForAnthropic([
      { type: "text", text: "Slide 1:" },
      { type: "image_url", image_url: { url: PNG_DATA_URI } },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: "text", text: "Slide 1:" });
    expect(result[1].type).toBe("image");
  });
});

describe("mapContentForGemini", () => {
  it("maps text blocks to { text }", () => {
    const result = mapContentForGemini([{ type: "text", text: "Hello" }]);
    expect(result).toEqual([{ text: "Hello" }]);
  });

  it("maps image_url blocks to inline_data", () => {
    const result = mapContentForGemini([
      { type: "image_url", image_url: { url: JPEG_DATA_URI } },
    ]);
    expect(result).toEqual([
      { inline_data: { mime_type: "image/jpeg", data: "/9j/4AAQSkZJRg==" } },
    ]);
  });

  it("skips non-data-URI image blocks", () => {
    const result = mapContentForGemini([
      { type: "image_url", image_url: { url: "https://example.com/img.jpg" } },
    ]);
    expect(result).toEqual([]);
  });

  it("passes through a plain string", () => {
    const result = mapContentForGemini("Hello");
    expect(result).toEqual([{ text: "Hello" }]);
  });
});

describe("stripImages", () => {
  it("joins all text blocks from a content array", () => {
    const result = stripImages([
      { type: "text", text: "Analyze" },
      { type: "text", text: "Slide 1 images:" },
      { type: "image_url", image_url: { url: JPEG_DATA_URI } },
    ]);
    expect(result).toBe("Analyze\nSlide 1 images:");
  });

  it("passes through a plain string", () => {
    expect(stripImages("Hello")).toBe("Hello");
  });

  it("returns empty string for non-array non-string", () => {
    expect(stripImages(null)).toBe("");
    expect(stripImages(undefined)).toBe("");
  });
});

describe("estimateImageTokens", () => {
  it("calculates tokens for a 768x576 image (4 tiles)", () => {
    // ceil(768/512)=2, ceil(576/512)=2 → 4 tiles → 4*170+85 = 765
    expect(estimateImageTokens(768, 576)).toBe(765);
  });

  it("calculates tokens for a 512x384 image (1 tile)", () => {
    // ceil(512/512)=1, ceil(384/512)=1 → 1 tile → 1*170+85 = 255
    expect(estimateImageTokens(512, 384)).toBe(255);
  });

  it("calculates tokens for a 256x256 image (1 tile)", () => {
    expect(estimateImageTokens(256, 256)).toBe(255);
  });

  it("calculates tokens for a 1024x1024 image (4 tiles)", () => {
    // ceil(1024/512)=2, ceil(1024/512)=2 → 4 tiles → 765
    expect(estimateImageTokens(1024, 1024)).toBe(765);
  });
});

describe("estimateTotalImageTokens", () => {
  it("returns 0 for 0 images", () => {
    expect(estimateTotalImageTokens(0)).toBe(0);
  });

  it("estimates tokens for 16 images at default 768px", () => {
    // 768x576 → 765 tokens per image → 16 * 765 = 12240
    expect(estimateTotalImageTokens(16)).toBe(12240);
  });

  it("uses custom dimensions when provided", () => {
    // 512x384 → 255 tokens per image → 10 * 255 = 2550
    expect(estimateTotalImageTokens(10, 512, 384)).toBe(2550);
  });

  it("defaults to 4:3 aspect ratio when height not given", () => {
    // 768 width → 576 height (4:3) → 765 per image
    const tokens = estimateTotalImageTokens(1);
    expect(tokens).toBe(765);
  });
});
