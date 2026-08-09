// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { SlideRenderer } from "../renderer/slide-renderer.js";

/**
 * Regression guard for the user-authored Markdown sanitization perimeter.
 *
 * AGENTS.md invariant: every slide area's user-authored HTML is sanitized
 * with DOMPurify before it is assigned to innerHTML. Mermaid/UI markup is
 * trusted, but anything a deck author writes must be stripped of executable
 * content. These tests lock that contract so a future DOMPurify config change
 * or a move to innerHTML-without-sanitize cannot silently reintroduce XSS.
 */
describe("SlideRenderer.sanitizeAreaHtml (XSS perimeter)", () => {
  it("strips <script> tags from user-authored area HTML", () => {
    const dirty = `<p>Hello</p><script>alert('xss')</script>`;
    const clean = SlideRenderer.sanitizeAreaHtml(dirty);
    expect(clean).not.toMatch(/<script/i);
    expect(clean).toContain("Hello");
  });

  it("strips inline event handlers (onerror) from <img>", () => {
    const dirty = `<img src="x" onerror="alert(1)">`;
    const clean = SlideRenderer.sanitizeAreaHtml(dirty);
    expect(clean).not.toMatch(/onerror/i);
    // The img element itself may be kept (harmless), but the handler must be gone.
    expect(clean.toLowerCase()).not.toContain("onerror=");
  });

  it("strips javascript: URIs in href/src attributes", () => {
    const dirty = `<a href="javascript:alert(1)">click</a>`;
    const clean = SlideRenderer.sanitizeAreaHtml(dirty);
    expect(clean.toLowerCase()).not.toContain("javascript:");
  });

  it("strips <iframe> and other embedding vectors", () => {
    const dirty = `<iframe src="https://evil.example"></iframe><object data="x"></object>`;
    const clean = SlideRenderer.sanitizeAreaHtml(dirty);
    expect(clean.toLowerCase()).not.toContain("<iframe");
    expect(clean.toLowerCase()).not.toContain("<object");
  });

  it("never returns executable markup for an attacker-controlled payload", () => {
    // Defense-in-depth: regardless of which sink is used, the output must not
    // contain script/event-handler/javascript-uri executables.
    const payloads = [
      `<img src=x onerror=alert(1)>`,
      `<svg/onload=alert(1)>`,
      `<a href="javascript:alert(1)">x</a>`,
      `<details open ontoggle=alert(1)>x</details>`,
    ];
    for (const payload of payloads) {
      const out = SlideRenderer.sanitizeAreaHtml(payload);
      expect(out.toLowerCase(), `payload: ${payload}`).not.toContain("onerror");
      expect(out.toLowerCase(), `payload: ${payload}`).not.toContain("onload");
      expect(out.toLowerCase(), `payload: ${payload}`).not.toContain("ontoggle");
      expect(out.toLowerCase(), `payload: ${payload}`).not.toContain("javascript:");
    }
  });

  it("preserves legitimate formatting (lists, headings, links) while sanitizing", () => {
    const dirty = `<h2>Title</h2><ul><li>one</li><li>two</li></ul><a href="https://example.com">link</a>`;
    const clean = SlideRenderer.sanitizeAreaHtml(dirty);
    expect(clean).toContain("<h2>Title</h2>");
    expect(clean).toContain("<li>one</li>");
    expect(clean).toContain('href="https://example.com"');
  });
});
