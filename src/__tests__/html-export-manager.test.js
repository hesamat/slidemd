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
      const html = "<div>No images</div>";
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
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          blob: () => Promise.resolve(new Blob(["fake-image-data"], { type: "image/png" })),
        }),
      );
      vi.stubGlobal(
        "FileReader",
        class {
          readAsDataURL() {
            this.result = "data:image/png;base64,ZmFrZS1pbWFnZS1kYXRh";
            if (this.onloadend) this.onloadend();
          }
        },
      );

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

    it("replaces blob: src with data URI", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          blob: () => Promise.resolve(new Blob(["blob-data"], { type: "image/png" })),
        }),
      );
      vi.stubGlobal(
        "FileReader",
        class {
          readAsDataURL() {
            this.result = "data:image/png;base64,ZmFrZS1pbWFnZS1kYXRh";
            if (this.onloadend) this.onloadend();
          }
        },
      );

      const html = '<img src="blob:http://localhost:8000/abc-123" alt="test">';
      const result = await HtmlExportManager.inlineImagesInHtml(html);

      expect(result).toContain("data:image/png;base64,");
      expect(result).not.toContain("blob:");
      expect(fetch).toHaveBeenCalledWith("blob:http://localhost:8000/abc-123", expect.any(Object));
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
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          blob: () => Promise.resolve(new Blob(["fake-data"], { type: "image/png" })),
        }),
      );
      vi.stubGlobal(
        "FileReader",
        class {
          readAsDataURL() {
            this.result = "data:image/png;base64,ZmFrZQ==";
            if (this.onloadend) this.onloadend();
          }
        },
      );

      const deck = {
        slides: [{ areas: { main: '<img src="images/logo.png" alt="Logo">' } }],
      };

      const result = await HtmlExportManager.inlineImagesInDeck(deck);

      expect(result.slides[0].areas.main).toContain("data:image/png;base64,");
      expect(result.slides[0].areas.main).not.toContain("images/logo.png");
    });

    it("inlines background images", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          blob: () => Promise.resolve(new Blob(["fake-data"], { type: "image/jpeg" })),
        }),
      );
      vi.stubGlobal(
        "FileReader",
        class {
          readAsDataURL() {
            this.result = "data:image/jpeg;base64,ZmFrZQ==";
            if (this.onloadend) this.onloadend();
          }
        },
      );

      const deck = {
        slides: [{ background: "url(images/bg.jpg)" }],
      };

      const result = await HtmlExportManager.inlineImagesInDeck(deck);

      expect(result.slides[0].background).toContain("data:image/jpeg;base64,");
    });

    it("inlines blob: src in slide areas", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          blob: () => Promise.resolve(new Blob(["blob-data"], { type: "image/png" })),
        }),
      );
      vi.stubGlobal(
        "FileReader",
        class {
          readAsDataURL() {
            this.result = "data:image/png;base64,ZmFrZQ==";
            if (this.onloadend) this.onloadend();
          }
        },
      );

      const deck = {
        slides: [{ areas: { main: '<img src="blob:http://localhost:8000/abc-123" alt="Blob">' } }],
      };

      const result = await HtmlExportManager.inlineImagesInDeck(deck);

      expect(result.slides[0].areas.main).toContain("data:image/png;base64,");
      expect(result.slides[0].areas.main).not.toContain("blob:");
      expect(fetch).toHaveBeenCalledWith("blob:http://localhost:8000/abc-123", expect.any(Object));
    });

    it("inlines blob: background images", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          blob: () => Promise.resolve(new Blob(["blob-data"], { type: "image/jpeg" })),
        }),
      );
      vi.stubGlobal(
        "FileReader",
        class {
          readAsDataURL() {
            this.result = "data:image/jpeg;base64,ZmFrZQ==";
            if (this.onloadend) this.onloadend();
          }
        },
      );

      const deck = {
        slides: [{ background: "linear-gradient(...), url(blob:http://localhost:8000/abc-123)" }],
      };

      const result = await HtmlExportManager.inlineImagesInDeck(deck);

      expect(result.slides[0].background).toContain("data:image/jpeg;base64,");
      expect(result.slides[0].background).not.toContain("blob:");
      expect(fetch).toHaveBeenCalledWith("blob:http://localhost:8000/abc-123", expect.any(Object));
    });

    it("handles multiple images in same deck", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          blob: () => Promise.resolve(new Blob(["fake-data"], { type: "image/png" })),
        }),
      );
      vi.stubGlobal(
        "FileReader",
        class {
          readAsDataURL() {
            this.result = "data:image/png;base64,ZmFrZQ==";
            if (this.onloadend) this.onloadend();
          }
        },
      );

      const deck = {
        slides: [
          {
            areas: {
              main: '<img src="images/a.png" alt="A">',
              media: '<img src="images/b.png" alt="B">',
            },
          },
          { areas: { main: '<img src="images/a.png" alt="A again">' } },
        ],
      };

      const _result = await HtmlExportManager.inlineImagesInDeck(deck);

      expect(fetch).toHaveBeenCalledTimes(2);
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

      const _result = HtmlExportManager.escapeHtml('<script>alert("xss")</script>');
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

  describe("_getVendorVersion", () => {
    it("returns the installed version from node_modules", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: "9.9.9" }) }),
      );
      const version = await HtmlExportManager._getVendorVersion("katex");
      expect(version).toBe("9.9.9");
    });

    it("falls back to a known-good version when node_modules is not served", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
      const version = await HtmlExportManager._getVendorVersion("katex");
      expect(version).toBe(HtmlExportManager.FALLBACK_VENDOR_VERSIONS.katex);
    });

    it("returns null for packages without a fallback version", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
      const version = await HtmlExportManager._getVendorVersion("unknown-pkg");
      expect(version).toBeNull();
    });
  });

  describe("fetchVendorJs", () => {
    it("fails the export when DOMPurify cannot be loaded", async () => {
      vi.spyOn(HtmlExportManager, "_getVendorVersion").mockResolvedValue("3.4.12");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

      await expect(HtmlExportManager.fetchVendorJs({ slides: [] })).rejects.toThrow(
        "HTML export requires DOMPurify",
      );
    });
  });

  describe("getInitScript", () => {
    it("reuses ContentEnhancer.enhanceRenderedContent for all slides", () => {
      const init = HtmlExportManager.getInitScript();
      expect(init).toContain("ContentEnhancer.normalizeEmojiText");
      expect(init).toContain("webdeck:ready");
      expect(init).toContain("ContentEnhancer.enhanceRenderedContent");
      expect(init).toContain("renderAllSlides: true");
      expect(init).toContain("force: true");
      expect(init).not.toContain("window.Prism.highlightAll");
      expect(init).not.toContain("mermaid.render");
    });
  });

  describe("escapeInlineScriptText", () => {
    it("escapes literal </script to prevent premature script tag closing", () => {
      const input = "const s = `<script>alert(1)</script>`;";
      const escaped = HtmlExportManager.escapeInlineScriptText(input);
      expect(escaped).toContain("<\\/script");
      expect(escaped).not.toContain("</script>");
    });
  });

  describe("buildMermaidScriptTagIfNeeded", () => {
    const mermaidDeck = {
      slides: [{ areas: { main: "<pre><code>mermaid\ngraph TD;</code></pre>" } }],
    };

    it("inlines the Mermaid IIFE bundle from node_modules (no CDN URL)", async () => {
      const fakeMermaidJs = "var mermaid = { initialize: function() {} };";
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(fakeMermaidJs) }),
      );
      const tag = await HtmlExportManager.buildMermaidScriptTagIfNeeded(mermaidDeck);
      expect(tag).toContain(fakeMermaidJs);
      expect(tag).not.toContain("cdn.jsdelivr.net");
      expect(tag).not.toContain("import mermaid from");
      expect(tag).toContain("mermaid.initialize(");
    });

    it("returns an empty string when node_modules is unavailable (no CDN fallback)", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
      const tag = await HtmlExportManager.buildMermaidScriptTagIfNeeded(mermaidDeck);
      expect(tag).toBe("");
    });

    it("returns an empty string when the deck has no Mermaid content", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
      const tag = await HtmlExportManager.buildMermaidScriptTagIfNeeded({
        slides: [{ areas: { main: "<p>hello</p>" } }],
      });
      expect(tag).toBe("");
    });
  });

  describe("prismDependencies", () => {
    it("includes markup-templating for php", () => {
      expect(HtmlExportManager.prismDependencies("php")).toEqual([
        "clike",
        "markup",
        "markup-templating",
        "php",
      ]);
    });
  });
});
