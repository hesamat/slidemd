// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RoleManager } from "../engine/role-manager.js";

describe("RoleManager orphan handling", () => {
  let originalOpen;
  let originalOpener;
  let originalClose;

  beforeEach(() => {
    originalOpen = window.open;
    originalOpener = window.opener;
    originalClose = window.close;
    document.body.innerHTML = "";
  });

  afterEach(() => {
    window.open = originalOpen;
    window.opener = originalOpener;
    window.close = originalClose;
    vi.restoreAllMocks();
  });

  function createRoleManager(isEditor) {
    const url = new URL(window.location.href);
    url.searchParams.set("role", isEditor ? "editor" : "viewer");
    vi.spyOn(window, "location", "get").mockReturnValue(url);
    // RoleManager uses window.location.href at construction via applyRoleFromUrl
    const elements = {
      presenterPanel: document.createElement("aside"),
      presentBtn: document.createElement("button"),
      stageHost: document.createElement("div"),
      slidesContainer: document.createElement("div"),
    };
    elements.presentBtn.innerHTML = "<span>Present</span>";
    const rm = new RoleManager(elements);
    return rm;
  }

  it("shows orphan overlay with DOM-constructed content (no innerHTML)", () => {
    // Simulate viewer window whose opener is closed
    window.opener = { closed: true };
    const rm = createRoleManager(false);
    // Trigger the orphan check synchronously
    rm._showOrphanOverlay();
    const overlay = document.getElementById("viewerOrphan");
    expect(overlay).toBeTruthy();
    const heading = overlay.querySelector("h2");
    expect(heading).toBeTruthy();
    expect(heading.textContent).toBe("Presenter disconnected");
    const message = overlay.querySelector("p");
    expect(message).toBeTruthy();
    expect(message.textContent).toContain("orphaned");
    const btn = overlay.querySelector("button");
    expect(btn).toBeTruthy();
    expect(btn.textContent).toBe("Close viewer");
  });

  it("does not create duplicate overlays", () => {
    window.opener = { closed: true };
    const rm = createRoleManager(false);
    rm._showOrphanOverlay();
    rm._showOrphanOverlay();
    expect(document.querySelectorAll("#viewerOrphan").length).toBe(1);
  });

  it("close button calls window.close", () => {
    const closeSpy = vi.fn();
    window.close = closeSpy;
    window.opener = { closed: true };
    const rm = createRoleManager(false);
    rm._showOrphanOverlay();
    const btn = document.querySelector("#viewerOrphan button");
    btn.click();
    expect(closeSpy).toHaveBeenCalled();
  });

  it("editor window does not show orphan overlay on beforeunload", () => {
    const rm = createRoleManager(true);
    // Editor binds beforeunload to close viewer, not to show overlay
    window.dispatchEvent(new Event("beforeunload"));
    expect(document.getElementById("viewerOrphan")).toBeNull();
  });
});
