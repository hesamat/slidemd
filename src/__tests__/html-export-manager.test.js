import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HtmlExportManager } from "../renderer/html-export-manager.js";

describe("HtmlExportManager", () => {
  beforeEach(() => {
    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    vi.stubGlobal("localStorage", localStorageMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("extractSlidesHtml", () => {
    it("returns empty slide div when no container", () => {
      const result = HtmlExportManager.extractSlidesHtml(null);
      expect(result).toBe('<div class="slide"></div>');
    });

    it("returns empty string when container has no slides", () => {
      const container = { querySelectorAll: () => [] };
      const result = HtmlExportManager.extractSlidesHtml(container);
      expect(result).toBe("");
    });

    it("extracts slide HTML from container", () => {
      const slide1 = { outerHTML: '<div class="slide">Slide 1</div>' };
      const slide2 = { outerHTML: '<div class="slide">Slide 2</div>' };
      const container = {
        querySelectorAll: () => [slide1, slide2],
      };
      const result = HtmlExportManager.extractSlidesHtml(container);
      expect(result).toContain("Slide 1");
      expect(result).toContain("Slide 2");
    });
  });

  describe("inlineImagesInHtml", () => {
    it("returns html unchanged when no images", async () => {
      const html = '<div>No images</div>';
      const result = await HtmlExportManager.inlineImagesInHtml(html);
      expect(result).toBe(html);
    });

    it("returns html unchanged when html is empty", async () => {
      const result = await HtmlExportManager.inlineImagesInHtml("");
      expect(result).toBe("");
    });

    it("returns html unchanged when html is null", async () => {
      const result = await HtmlExportManager.inlineImagesInHtml(null);
      expect(result).toBeNull();
    });

    it("replaces image src with data URI when fetch succeeds", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(["fake-image-data"], { type: "image/png" })),
      }));
      vi.stubGlobal("FileReader", class {
        readAsDataURL() {
          this.result = "data:image/png;base64,ZmFrZS1pbWFnZS1kYXRh";
          if (this.onloadend) this.onloadend();
        }
      });

      const html = '<img src="images/test.png" alt="test">';
      const result = await HtmlExportManager.inlineImagesInHtml(html);

      expect(result).toContain("data:image/png;base64,");
      expect(result).not.toContain('src="images/test.png"');
    });

    it("keeps original src when fetch fails", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

      const html = '<img src="images/missing.png" alt="test">';
      const result = await HtmlExportManager.inlineImagesInHtml(html);

      expect(result).toContain('src="images/missing.png"');
    });

    it("keeps original src when fetch throws", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

      const html = '<img src="images/error.png" alt="test">';
      const result = await HtmlExportManager.inlineImagesInHtml(html);

      expect(result).toContain('src="images/error.png"');
    });
  });

  describe("inlineImagesInDeck", () => {
    it("returns deck unchanged when no slides", async () => {
      const deck = { slides: [] };
      const result = await HtmlExportManager.inlineImagesInDeck(deck);
      expect(result).toEqual(deck);
    });

    it("returns deck unchanged when no images in slides", async () => {
      const deck = {
        slides: [{ areas: { main: "<p>No images</p>" } }],
      };
      const result = await HtmlExportManager.inlineImagesInDeck(deck);
      expect(result).toEqual(deck);
    });

    it("inlines images in slide areas", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(["fake-data"], { type: "image/png" })),
      }));
      vi.stubGlobal("FileReader", class {
        readAsDataURL() {
          this.result = "data:image/png;base64,ZmFrZQ==";
          if (this.onloadend) this.onloadend();
        }
      });

      const deck = {
        slides: [
          { areas: { main: '<img src="images/logo.png" alt="Logo">' } },
        ],
      };

      const result = await HtmlExportManager.inlineImagesInDeck(deck);

      expect(result.slides[0].areas.main).toContain("data:image/png;base64,");
      expect(result.slides[0].areas.main).not.toContain("images/logo.png");
    });

    it("inlines background images", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(["fake-data"], { type: "image/jpeg" })),
      }));
      vi.stubGlobal("FileReader", class {
        readAsDataURL() {
          this.result = "data:image/jpeg;base64,ZmFrZQ==";
          if (this.onloadend) this.onloadend();
        }
      });

      const deck = {
        slides: [{ background: "url(images/bg.jpg)" }],
      };

      const result = await HtmlExportManager.inlineImagesInDeck(deck);

      expect(result.slides[0].background).toContain("data:image/jpeg;base64,");
    });

    it("handles multiple images in same deck", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(["fake-data"], { type: "image/png" })),
      }));
      vi.stubGlobal("FileReader", class {
        readAsDataURL() {
          this.result = "data:image/png;base64,ZmFrZQ==";
          if (this.onloadend) this.onloadend();
        }
      });

      const deck = {
        slides: [
          { areas: { main: '<img src="images/a.png" alt="A">', media: '<img src="images/b.png" alt="B">' } },
          { areas: { main: '<img src="images/a.png" alt="A again">' } },
        ],
      };

      const result = await HtmlExportManager.inlineImagesInDeck(deck);

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("skips failed image fetches gracefully", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

      const deck = {
        slides: [{ areas: { main: '<img src="images/missing.png" alt="Missing">' } }],
      };

      const result = await HtmlExportManager.inlineImagesInDeck(deck);

      expect(result.slides[0].areas.main).toContain("images/missing.png");
    });
  });

  describe("escapeJsonForHtml", () => {
    it("escapes < characters", () => {
      const result = HtmlExportManager.escapeJsonForHtml('{"key": "<div>"}');
      expect(result).toContain("\\u003C");
    });

    it("escapes <!-- comments", () => {
      const result = HtmlExportManager.escapeJsonForHtml("<!-- comment -->");
      expect(result).not.toContain("<!--");
    });
  });

  describe("escapeHtml", () => {
    it("escapes HTML special characters", () => {
      const mockDiv = {};
      vi.stubGlobal("document", {
        createElement: () => mockDiv,
      });

      const result = HtmlExportManager.escapeHtml('<script>alert("xss")</script>');
      // The implementation sets textContent and reads innerHTML
      expect(mockDiv.textContent).toBe('<script>alert("xss")</script>');
    });
  });

  describe("generateFilename", () => {
    it("generates filename from deck title", () => {
      const deck = { meta: { title: "My Presentation" } };
      const result = HtmlExportManager.generateFilename(deck);
      expect(result).toBe("my-presentation");
    });

    it("sanitizes special characters", () => {
      const deck = { meta: { title: "Hello World! (v2.0)" } };
      const result = HtmlExportManager.generateFilename(deck);
      expect(result).toBe("hello-world-v2-0");
    });

    it("uses default name when no title", () => {
      const deck = { meta: {} };
      const result = HtmlExportManager.generateFilename(deck);
      // DeckLoader.getDisplayTitle returns "Slide Deck" as fallback
      expect(result).toBe("slide-deck");
    });
  });
});
