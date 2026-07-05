/**
 * AreaGuideManager
 *
 * Manages @area overlay labels and overflow indicators in edit mode.
 * Extracted from EditController.
 */
import { ImageInteractionHandler } from "../image/image-interaction-handler.js";

export class AreaGuideManager {
  /**
   * @param {object} opts
   * @param {() => boolean} opts.getIsEditMode
   * @param {() => number} opts.getCurrentSlideIndex
   * @param {() => object} opts.getDeck
   * @param {(index: number) => HTMLElement|null} opts.getSlideElementByIndex
   * @param {(areaName: string) => void} opts.onNavigateToArea
   * @param {(slideEl: HTMLElement, slideData: object) => void} opts.onAttachGridResizer
   */
  constructor({
    getIsEditMode,
    getCurrentSlideIndex,
    getDeck,
    getSlideElementByIndex,
    onNavigateToArea,
    onAttachGridResizer,
  }) {
    this._getIsEditMode = getIsEditMode;
    this._getCurrentSlideIndex = getCurrentSlideIndex;
    this._getDeck = getDeck;
    this._getSlideElementByIndex = getSlideElementByIndex;
    this._onNavigateToArea = onNavigateToArea;
    this._onAttachGridResizer = onAttachGridResizer;
  }

  get isEditMode() {
    return this._getIsEditMode();
  }
  get currentSlideIndex() {
    return this._getCurrentSlideIndex();
  }
  get deck() {
    return this._getDeck();
  }

  getSlideElementByIndex(index) {
    return this._getSlideElementByIndex(index);
  }

  applyAreaGuides(slideEl, slideData) {
    if (!this.isEditMode || !slideEl) return;

    const areaEls = slideEl.querySelectorAll(".slide__area");
    areaEls.forEach((areaEl) => {
      const name = areaEl.style.gridArea || areaEl.dataset.areaName || "main";
      areaEl.dataset.areaName = name;

      const hasContent =
        areaEl.textContent.trim().length > 0 ||
        areaEl.querySelectorAll(":scope > *:not(.editor-area-label)").length > 0;

      if (!hasContent && (name === "header" || name === "footer")) return;

      let label = areaEl.querySelector(":scope > .editor-area-label");
      if (!label) {
        label = document.createElement("button");
        label.type = "button";
        label.className = "editor-area-label";
        areaEl.prepend(label);
      }

      label.textContent = `@${name}`;
      label.setAttribute("title", `Jump to @${name}`);
      label.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this._onNavigateToArea(name);
      };
    });

    if (slideData?.layout) {
      slideEl.dataset.layoutName = slideData.layout;
    }
  }

  updateAreaOverflow(slideEl) {
    if (!this.isEditMode || !slideEl) return;
    const areas = slideEl.querySelectorAll(".slide__area");
    areas.forEach((area) => {
      const name = area.dataset.areaName;

      const hasContent =
        area.textContent.trim().length > 0 ||
        area.querySelectorAll(":scope > *:not(.editor-area-label)").length > 0;

      if (!hasContent && (name === "header" || name === "footer")) {
        area.classList.remove("editor-area-overflow");
        return;
      }

      const label = area.querySelector(":scope > .editor-area-label");
      const verticalOverflow = area.scrollHeight - area.clientHeight > 6;
      const horizontalOverflow = area.scrollWidth - area.clientWidth > 6;
      const isOverflowing = verticalOverflow || horizontalOverflow;

      area.classList.toggle("editor-area-overflow", isOverflowing);
      if (label) {
        label.dataset.overflow = isOverflowing ? "1" : "0";
        label.setAttribute(
          "aria-label",
          isOverflowing ? `@${area.dataset.areaName} is overflowing` : `@${area.dataset.areaName}`,
        );
      }
    });
  }

  refresh() {
    if (!this.isEditMode) return;
    const slideEl = this.getSlideElementByIndex(this.currentSlideIndex);
    const slideData = this.deck?.slides?.[this.currentSlideIndex];
    if (!slideEl || !slideData) return;

    this.applyAreaGuides(slideEl, slideData);
    requestAnimationFrame(() => {
      this.updateAreaOverflow(slideEl);
      this._onAttachGridResizer(slideEl, slideData);
      // Re-activate image drag/resize on the current slide's grid.
      // This is needed because updatePreview() (which normally calls
      // activate) is skipped when loadSlideIntoEditor() runs with
      // suppressOnChange — e.g. when entering edit mode or navigating
      // slides.  Without this, existing images can only be moved via
      // keyboard arrows, not dragged or resized.
      const grid = slideEl.querySelector(".slide__grid");
      if (grid) {
        ImageInteractionHandler.activate(grid);
      }
    });
  }
}
