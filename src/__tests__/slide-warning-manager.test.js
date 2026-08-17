// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { SlideWarningManager } from "../editor/navigation/slide-warning-manager.js";

function makeManager(slideEl) {
  const getCurrentSlideIndex = () => 0;
  const getSlideElementByIndex = vi.fn(() => slideEl);
  return new SlideWarningManager({ getCurrentSlideIndex, getSlideElementByIndex });
}

function makeSlideEl() {
  const el = document.createElement("div");
  el.className = "slide";
  return el;
}

describe("SlideWarningManager", () => {
  it("showEditorWarning sets pendingSlideWarning", () => {
    const mgr = makeManager(makeSlideEl());
    mgr.showEditorWarning("test-key", "Test warning");
    expect(mgr.pendingSlideWarning).toBe("Test warning");
  });

  it("showEditorWarning is debounced by key", () => {
    const mgr = makeManager(makeSlideEl());
    mgr.showEditorWarning("dup-key", "First", 5000);
    mgr.showEditorWarning("dup-key", "Second", 5000);
    expect(mgr.pendingSlideWarning).toBe("First");
  });

  it("showSlideWarning creates a banner on the slide element", () => {
    const slideEl = makeSlideEl();
    const mgr = makeManager(slideEl);
    mgr.showSlideWarning("Something is wrong");
    const banner = slideEl.querySelector(":scope > .editor-slide-warning");
    expect(banner).not.toBeNull();
    expect(banner.textContent).toBe("Something is wrong");
  });

  it("showSlideWarning with onClick makes the banner clickable", () => {
    const slideEl = makeSlideEl();
    const mgr = makeManager(slideEl);
    const onClick = vi.fn();
    mgr.showSlideWarning("Click me", onClick);
    const banner = slideEl.querySelector(":scope > .editor-slide-warning");
    expect(banner.classList.contains("editor-slide-warning--clickable")).toBe(true);
    expect(banner.getAttribute("role")).toBe("button");
    expect(banner.getAttribute("tabindex")).toBe("0");
  });

  it("clearSlideWarning removes the banner", () => {
    const slideEl = makeSlideEl();
    const mgr = makeManager(slideEl);
    mgr.showSlideWarning("Temporary");
    mgr.clearSlideWarning();
    expect(slideEl.querySelector(":scope > .editor-slide-warning")).toBeNull();
  });

  it("applyPendingSlideWarning renders the pending message", () => {
    const slideEl = makeSlideEl();
    const mgr = makeManager(slideEl);
    mgr.showEditorWarning("key", "Pending message");
    mgr.applyPendingSlideWarning(slideEl);
    const banner = slideEl.querySelector(":scope > .editor-slide-warning");
    expect(banner).not.toBeNull();
    expect(banner.textContent).toBe("Pending message");
  });

  it("applyPendingSlideWarning does nothing when no pending message", () => {
    const slideEl = makeSlideEl();
    const mgr = makeManager(slideEl);
    mgr.applyPendingSlideWarning(slideEl);
    expect(slideEl.querySelector(":scope > .editor-slide-warning")).toBeNull();
  });

  it("resetPending clears the pending message", () => {
    const mgr = makeManager(makeSlideEl());
    mgr.showEditorWarning("key", "Pending");
    mgr.resetPending();
    expect(mgr.pendingSlideWarning).toBe("");
  });

  it("showEditorWarning does nothing when warnings are disabled", () => {
    const mgr = makeManager(makeSlideEl());
    mgr.editorWarningsEnabled = false;
    mgr.showEditorWarning("key", "Should not show");
    expect(mgr.pendingSlideWarning).toBe("");
  });

  it("showSlideWarning replaces existing banner content", () => {
    const slideEl = makeSlideEl();
    const mgr = makeManager(slideEl);
    mgr.showSlideWarning("First message");
    mgr.showSlideWarning("Second message");
    const banners = slideEl.querySelectorAll(":scope > .editor-slide-warning");
    expect(banners).toHaveLength(1);
    expect(banners[0].textContent).toBe("Second message");
  });

  it("accumulates pending warnings from different keys", () => {
    const mgr = makeManager(makeSlideEl());
    mgr.showEditorWarning("layout", "Unknown layout");
    mgr.showEditorWarning("images", "Missing images: foo.png");
    mgr.showEditorWarning("empty", "Empty slide");
    expect(mgr.pendingSlideWarning).toBe(
      "Unknown layout; Missing images: foo.png; Empty slide",
    );
  });

  it("updates a pending warning when the same key fires again", () => {
    const mgr = makeManager(makeSlideEl());
    mgr.showEditorWarning("layout", "Unknown layout A");
    // Same key, different message — should replace, not accumulate
    mgr.lastDiagnostics.delete("layout"); // clear debounce
    mgr.showEditorWarning("layout", "Unknown layout B");
    expect(mgr.pendingSlideWarning).toBe("Unknown layout B");
  });

  it("applyPendingSlideWarning renders all accumulated warnings joined", () => {
    const slideEl = makeSlideEl();
    const mgr = makeManager(slideEl);
    mgr.showEditorWarning("a", "Warning A");
    mgr.showEditorWarning("b", "Warning B");
    mgr.applyPendingSlideWarning(slideEl);
    const banner = slideEl.querySelector(":scope > .editor-slide-warning");
    expect(banner.textContent).toBe("Warning A; Warning B");
  });

  it("resetPending clears all accumulated warnings", () => {
    const mgr = makeManager(makeSlideEl());
    mgr.showEditorWarning("a", "Warning A");
    mgr.showEditorWarning("b", "Warning B");
    mgr.resetPending();
    expect(mgr.pendingSlideWarning).toBe("");
  });

  it("pendingSlideWarning setter clears all and sets single default key", () => {
    const mgr = makeManager(makeSlideEl());
    mgr.showEditorWarning("a", "Warning A");
    mgr.showEditorWarning("b", "Warning B");
    mgr.pendingSlideWarning = "Override";
    expect(mgr.pendingSlideWarning).toBe("Override");
  });

  it("pendingSlideWarning setter with empty string clears all", () => {
    const mgr = makeManager(makeSlideEl());
    mgr.showEditorWarning("a", "Warning A");
    mgr.pendingSlideWarning = "";
    expect(mgr.pendingSlideWarning).toBe("");
  });
});
