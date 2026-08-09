// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

// Force the DOMPurify import to be unavailable so sanitizeAreaHtml takes its
// documented degrade path (escapeHtml) instead of the real sanitizer. This must
// be hoisted above the static import of slide-renderer, so the module captures
// the mocked factory at load time.
vi.mock("dompurify", () => ({
  default: () => null,
}));

import { SlideRenderer } from "../renderer/slide-renderer.js";

/**
 * Regression guard for the sanitizer fallback path. When DOMPurify is not
 * available (e.g. the self-contained HTML/PDF bundle failed to load it),
 * slide-renderer.js degrades to escapeHtml rather than assigning raw HTML.
 * This test ensures that fallback still neutralizes executable markup (it must
 * escape, not silently drop or pass through).
 */
describe("SlideRenderer.sanitizeAreaHtml fallback (no DOMPurify)", () => {
  let _savedDomPurify;
  beforeAll(() => {
    // Explicitly remove any ambient window.DOMPurify so the degrade path is
    // deterministic. getDOMPurify() would otherwise fall back to a vendor
    // global if one were attached by a setup file or imported module.
    _savedDomPurify = window.DOMPurify;
    delete window.DOMPurify;
  });
  afterAll(() => {
    if (_savedDomPurify !== undefined) window.DOMPurify = _savedDomPurify;
  });

  it("escapes executable markup instead of passing it through or dropping it", () => {
    const dirty = `<img src=x onerror=alert(1)><script>alert(2)</script>`;
    const out = SlideRenderer.sanitizeAreaHtml(dirty);
    // No raw, parseable tags survive — the markup is escaped to inert text.
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    // But content is preserved as escaped text, not discarded.
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("&lt;img");
  });

  it("escapes javascript: URIs in the fallback path", () => {
    const dirty = `<a href="javascript:alert(1)">x</a>`;
    const out = SlideRenderer.sanitizeAreaHtml(dirty);
    // The tag is escaped to entities, so no real <a> element (and thus no
    // executable javascript: href) survives — the text is inert.
    expect(out).not.toContain("<a");
    expect(out).toContain("&lt;a");
    expect(out).toContain("&quot;javascript:alert(1)&quot;");
  });
});
