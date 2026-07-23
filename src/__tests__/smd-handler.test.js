import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { SmdHandler } from "../core/smd-handler.js";

describe("SmdHandler", () => {
  async function createTestSmd(markdown, images = {}) {
    const zip = new JSZip();
    zip.file("deck.md", markdown);
    const imgFolder = zip.folder("images");
    for (const [name, content] of Object.entries(images)) {
      imgFolder.file(name, content);
    }
    return new Blob([await zip.generateAsync({ type: "uint8array" })], {
      type: "application/octet-stream",
    });
  }

  describe("extractFromSmd", () => {
    it("extracts markdown from .smd file", async () => {
      const blob = await createTestSmd("# Hello\n\nSlide content");
      const result = await SmdHandler.extractFromSmd(blob);
      expect(result.markdown).toBe("# Hello\n\nSlide content");
    });

    it("extracts images as Map<string, Blob>", async () => {
      const imgContent = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      const blob = await createTestSmd("# Deck", { "photo.png": imgContent });
      const result = await SmdHandler.extractFromSmd(blob);
      expect(result.images).toBeInstanceOf(Map);
      expect(result.images.has("images/photo.png")).toBe(true);
      expect(result.images.get("images/photo.png")).toBeInstanceOf(Blob);
    });

    it("handles .smd with no images folder", async () => {
      const zip = new JSZip();
      zip.file("deck.md", "# No images");
      const blob = new Blob([await zip.generateAsync({ type: "uint8array" })], {
        type: "application/octet-stream",
      });
      const result = await SmdHandler.extractFromSmd(blob);
      expect(result.markdown).toBe("# No images");
      expect(result.images.size).toBe(0);
    });

    it("extracts multiple images", async () => {
      const blob = await createTestSmd("# Deck", {
        "a.png": new Uint8Array([1]),
        "b.jpg": new Uint8Array([2]),
      });
      const result = await SmdHandler.extractFromSmd(blob);
      expect(result.images.size).toBe(2);
      expect(result.images.has("images/a.png")).toBe(true);
      expect(result.images.has("images/b.jpg")).toBe(true);
    });
  });

  describe("buildSmd", () => {
    it("creates a valid .smd ZIP with deck.md", async () => {
      const images = new Map();
      const blob = await SmdHandler.buildSmd("# My Deck", images);
      expect(blob).toBeInstanceOf(Blob);
      const extracted = await SmdHandler.extractFromSmd(blob);
      expect(extracted.markdown).toBe("# My Deck");
    });

    it("includes images in images/ folder", async () => {
      const images = new Map([
        ["images/photo.png", new Blob([new Uint8Array([0x89])])],
      ]);
      const blob = await SmdHandler.buildSmd("# Deck", images);
      const extracted = await SmdHandler.extractFromSmd(blob);
      expect(extracted.images.has("images/photo.png")).toBe(true);
    });

    it("round-trips: build then extract preserves content", async () => {
      const originalMd = "# Title\n\n---\n\n## Slide 2\n\nContent here.";
      const images = new Map([
        ["images/img1.png", new Blob([new Uint8Array([1, 2, 3])])],
        ["images/img2.jpg", new Blob([new Uint8Array([4, 5, 6])])],
      ]);
      const built = await SmdHandler.buildSmd(originalMd, images);
      const extracted = await SmdHandler.extractFromSmd(built);
      expect(extracted.markdown).toBe(originalMd);
      expect(extracted.images.size).toBe(2);
    });
  });
});
