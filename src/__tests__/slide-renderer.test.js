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

  it("keeps safe image data while rejecting active and unknown URI schemes", () => {
    const slide = {
      id: "uri-check",
      title: "URI Check",
      areas: {
        main: `<img src="data:image/png;base64,ZmFrZQ==" />
          <img src="data:image/svg+xml,<svg/onload=alert(1)>" />
          <a href="filesystem:secret">filesystem</a>
          <a href="custom:payload">custom</a>`,
      },
    };
    const el = SlideRenderer.createSlideElement({ slides: [slide] }, slide, 0, true);
    const html = el.outerHTML;

    expect(html).toContain("data:image/png;base64,ZmFrZQ==");
    expect(html).not.toContain("data:image/svg+xml");
    expect(html).not.toContain("filesystem:secret");
    expect(html).not.toContain("custom:payload");
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

  it("keeps media-span intent when a resized custom grid is rendered", () => {
    const slide = {
      id: "resized-media",
      layout: '"main media" "main media" / 3fr 2fr',
      mediaSpan: "right",
      areas: {
        main: "<p>Body</p>",
        media: '<img src="images/photo.png" alt="Photo" />',
      },
    };
    const el = SlideRenderer.createSlideElement({ slides: [slide] }, slide, 0, true);
    const area = el.querySelector('.slide__area[data-area-name="media"]');

    expect(el.dataset.mediaSpan).toBe("right");
    expect(area.style.paddingRight).toBe("0px");
  });

  it("removes border-side padding for custom span-all-rows grids without media bleed", () => {
    const slide = {
      id: "custom-full-height",
      layout: '"main sidebar" "main sidebar" / 2fr 1fr',
      areas: { main: "<p>Body</p>", sidebar: "<p>Aside</p>" },
    };
    const el = SlideRenderer.createSlideElement({ slides: [slide] }, slide, 0, true);
    const area = el.querySelector('.slide__area[data-area-name="sidebar"]');

    expect(el.dataset.mediaSpan).toBeUndefined();
    expect(area.style.paddingRight).toBe("0px");
  });

  it("keeps the footer in its named cell next to a full-height media column", () => {
    const slide = {
      id: "media-span-left-footer",
      layout: "media-span-left",
      areas: {
        media: '<img src="images/photo.png" alt="Photo" />',
        main: "<p>Body</p>",
        footer: "<p>Footer</p>",
      },
    };
    const el = SlideRenderer.createSlideElement({ slides: [slide] }, slide, 0, true);
    const footer = el.querySelector('.slide__area[data-area-name="footer"]');

    expect(el.dataset.mediaSpan).toBe("left");
    expect(footer.style.gridColumn).toBe("");
  });
});
