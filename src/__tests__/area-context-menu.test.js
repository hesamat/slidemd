// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AreaContextMenu } from "../editor/navigation/area-context-menu.js";

function makeAreaElement(bg) {
  const el = document.createElement("div");
  el.className = "slide__area";
  el.dataset.areaName = "media";
  el.style.background = bg;
  return el;
}

describe("AreaContextMenu background popover", () => {
  let menu;
  let areaEl;
  let committed;

  beforeEach(() => {
    committed = null;
    areaEl = makeAreaElement("rgb(0, 0, 0)");
    document.body.appendChild(areaEl);
    menu = new AreaContextMenu({
      onDeleteArea: () => {},
      onSwapArea: () => {},
      onMakeFullHeight: () => {},
      onAlignMain: () => {},
      onSetBackground: (name, value) => {
        committed = { name, value };
      },
      onToggleFullBleed: () => {},
      getAreaElement: () => areaEl,
    });
    menu.init();
  });

  afterEach(() => {
    menu.destroy();
    document.body.innerHTML = "";
  });

  function openPopover() {
    menu.open(100, 100, "media", {
      canSetBackground: true,
      currentBackground: "",
      hasBackground: false,
    });
    const setBackgroundBtn = [...menu._menuEl.querySelectorAll("button")].find((b) =>
      b.textContent.includes("Set background"),
    );
    expect(setBackgroundBtn).toBeTruthy();
    setBackgroundBtn.click();
    return menu._popoverEl;
  }

  function pickSwatch() {
    const swatch = menu._popoverEl.querySelector('.style-swatch[data-value="#1e293b"]');
    expect(swatch).toBeTruthy();
    swatch.click();
    // jsdom normalizes the hex to an rgb() string in the inline style.
    expect(areaEl.style.background).toMatch(/#1e293b|rgb\(30, 41, 59\)/);
  }

  it("restores the original background when dismissed by outside click", () => {
    openPopover();
    pickSwatch();

    // Dismiss via outside click (the document click handler path).
    document.body.click();
    expect(menu._popoverEl).toBeNull();
    // Original background restored; nothing committed.
    expect(areaEl.style.background).toBe("rgb(0, 0, 0)");
    expect(committed).toBeNull();
  });

  it("restores the original background when dismissed by Escape", () => {
    openPopover();
    pickSwatch();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(menu._popoverEl).toBeNull();
    expect(areaEl.style.background).toBe("rgb(0, 0, 0)");
    expect(committed).toBeNull();
  });

  it("commits the chosen background on Apply", () => {
    openPopover();
    pickSwatch();

    const applyBtn = menu._popoverEl.querySelector(".area-bg-popover__btn--primary");
    applyBtn.click();
    expect(committed).toEqual({ name: "media", value: "#1e293b" });
    expect(menu._popoverEl).toBeNull();
  });
});
