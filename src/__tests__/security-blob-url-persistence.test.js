// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { SlideStylePanel } from "../editor/ui/slide-style-panel.js";

/**
 * Regression guard for #187: blob URLs must never leak into persisted/apply-all
 * style directives. The Slide Style Panel previews images via a session-only
 * blob: URL, but the written `background:` directive must reference the on-disk
 * path. `_getPersistedBackgroundValue()` is the exact method the fix routed
 * persistence through; this test locks it.
 */
describe("SlideStylePanel persisted background never contains blob URLs (#187)", () => {
  function withState(patch) {
    const prev = {};
    for (const key of Object.keys(patch)) {
      prev[key] = SlideStylePanel[key];
      SlideStylePanel[key] = patch[key];
    }
    return () => {
      for (const key of Object.keys(patch)) SlideStylePanel[key] = prev[key];
    };
  }

  it("returns the on-disk image path (not the blob URL) when an image is set", () => {
    const restore = withState({
      _currentImagePath: "images/photo.png",
      _imageOverlay: null,
      _currentImageBlobUrl: "blob:https://example/abc-123",
      _currentBg: null,
    });
    try {
      const value = SlideStylePanel._getPersistedBackgroundValue();
      expect(value).toBeTruthy();
      expect(value).toContain("images/photo.png");
      expect(value).not.toContain("blob:");
      // Exact-match: the persisted directive must be the on-disk path only,
      // never embedding the blob URL alongside it.
      expect(value).toBe("url('images/photo.png') center / cover no-repeat");
    } finally {
      restore();
    }
  });

  it("never emits a blob: URL even when a preview blob is present", () => {
    const restore = withState({
      _currentImagePath: "images/diagram.png",
      _imageOverlay: 40,
      _currentImageBlobUrl: "blob:https://example/def-456",
      _currentBg: "linear-gradient(#000,#fff)",
    });
    try {
      const value = SlideStylePanel._getPersistedBackgroundValue();
      // Exact-match: path branch wins (ignores the blob preview and _currentBg),
      // and the opacity overlay is computed from the numeric percentage.
      expect(value).toBe(
        "linear-gradient(rgba(0,0,0,0.4),rgba(0,0,0,0.4)), url('images/diagram.png') center / cover no-repeat",
      );
      expect(value).not.toContain("blob:");
    } finally {
      restore();
    }
  });

  it("falls back to the stored background string (sans blob) when no image path is set", () => {
    const restore = withState({
      _currentImagePath: null,
      _imageOverlay: null,
      _currentImageBlobUrl: null,
      _currentBg: "linear-gradient(#000,#fff)",
    });
    try {
      const value = SlideStylePanel._getPersistedBackgroundValue();
      expect(value).toBe("linear-gradient(#000,#fff)");
      expect(value).not.toContain("blob:");
    } finally {
      restore();
    }
  });
});
