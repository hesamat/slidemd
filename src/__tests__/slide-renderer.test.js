// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { SlideRenderer } from "../renderer/slide-renderer.js";
import { base64Encode } from "../core/utils.js";

describe("SlideRenderer", () => {
  it("sanitizes raw user HTML while preserving SlideMD structural attributes", () => {
    const slide = {
      id: "xss-check",
      title: "XSS Check",
      areas: {
        main: `<img src="images/icon.png" alt="Icon" style="width:100px; height:100px;" class="slide-img" data-source-line="0" />
               <script>alert('xss')</script>
               <a href="https://example.com" target="_blank" rel="noopener noreferrer" onclick="alert('xss')">link</a>`,
      },
    };
    const deck = { slides: [slide] };
    const el = SlideRenderer.createSlideElement(deck, slide, 0, true);
    const html = el.outerHTML;

    expect(html).toContain('style="width:100px; height:100px;"');
    expect(html).toContain('class="slide-img"');
    expect(html).toContain('data-source-line="0"');
    expect(html).toContain('src="images/icon.png"');
    expect(html).toContain('alt="Icon"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onclick");
  });

  it("preserves base64-encoded mermaid source through DOMPurify", () => {
    const source = "graph TD\n    A[Start] --> B[End]";
    const encoded = `b64:${base64Encode(source)}`;
    const slide = {
      id: "mermaid-check",
      title: "Mermaid Check",
      areas: {
        main: `<div class="mermaid" data-mermaid-source="${encoded}"></div>`,
      },
    };
    const deck = { slides: [slide] };
    const el = SlideRenderer.createSlideElement(deck, slide, 0, true);
    const html = el.outerHTML;

    expect(html).toContain(`data-mermaid-source="${encoded}"`);
    expect(html).toContain('class="mermaid"');
  });
});
