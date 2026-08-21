/**
 * AreaGuideManager
 *
 * Manages @area overlay labels and overflow indicators in edit mode.
 * Extracted from EditController.
 */
import { ImageInteractionHandler } from "../image/image-interaction-handler.js";
import { TextBlockHandler } from "../text/text-block-handler.js";
import { FencedBlockInteractionHandler } from "../codeblock/fenced-block-interaction-handler.js";
import { AreaContextMenu } from "./area-context-menu.js";
import { LayoutParser } from "../../data/layout-parser.js";
import { parseSingleColumnLayout } from "../core/directive-utils.js";

export class AreaGuideManager {
  /**
   * @param {object} opts
   * @param {() => boolean} opts.getIsEditMode
   * @param {() => number} opts.getCurrentSlideIndex
   * @param {() => object} opts.getDeck
   * @param {(index: number) => HTMLElement|null} opts.getSlideElementByIndex
   * @param {(areaName: string) => void} opts.onNavigateToArea
   * @param {(slideEl: HTMLElement, slideData: object) => void} opts.onAttachGridResizer
   * @param {(areaName: string) => void} opts.onDeleteArea
   * @param {(areaName: string) => boolean} opts.canDeleteArea
   * @param {(areaName: string) => void} opts.onSwapArea
   * @param {(areaName: string) => boolean} opts.canSwapArea
   * @param {(areaName: string) => void} opts.onMakeFullHeight
   * @param {(areaName: string) => boolean} opts.canMakeFullHeight
   * @param {(areaName: string) => void} opts.onToggleFullBleed
   * @param {(areaName: string) => boolean} opts.canFullBleed
   * @param {(areaName: string) => string} opts.getFullBleedLabel
   * @param {(areaName: string, align: string) => void} [opts.onAlignMain]
   * @param {(areaName: string, cssBackground: string) => void} [opts.onSetBackground]
   * @param {() => object} opts.getWarnings
   * @param {(allowedAreas: string[]) => void} [opts.onFixAreaMismatch]
   */
  constructor({
    getIsEditMode,
    getCurrentSlideIndex,
    getDeck,
    getSlideElementByIndex,
    onNavigateToArea,
    onAttachGridResizer,
    onDeleteArea,
    canDeleteArea,
    onSwapArea,
    canSwapArea,
    onMakeFullHeight,
    canMakeFullHeight,
    onToggleFullBleed,
    canFullBleed,
    getFullBleedLabel,
    onAlignMain,
    onSetBackground,
    getWarnings,
    onFixAreaMismatch,
  }) {
    this._getIsEditMode = getIsEditMode;
    this._getCurrentSlideIndex = getCurrentSlideIndex;
    this._getDeck = getDeck;
    this._getSlideElementByIndex = getSlideElementByIndex;
    this._onNavigateToArea = onNavigateToArea;
    this._onAttachGridResizer = onAttachGridResizer;
    this._onDeleteArea = onDeleteArea;
    this._canDeleteArea = canDeleteArea;
    this._onSwapArea = onSwapArea;
    this._canSwapArea = canSwapArea;
    this._onMakeFullHeight = onMakeFullHeight;
    this._canMakeFullHeight = canMakeFullHeight;
    this._onToggleFullBleed = onToggleFullBleed;
    this._canFullBleed = canFullBleed;
    this._getFullBleedLabel = getFullBleedLabel;
    this._onAlignMain = onAlignMain;
    this._onSetBackground = onSetBackground;
    this._getWarnings = getWarnings;
    this._onFixAreaMismatch = onFixAreaMismatch;

    this._contextMenu = new AreaContextMenu({
      onDeleteArea: (areaName) => this._onDeleteArea?.(areaName),
      onSwapArea: (areaName) => this._onSwapArea?.(areaName),
      onMakeFullHeight: (areaName) => this._onMakeFullHeight?.(areaName),
      onToggleFullBleed: (areaName) => this._onToggleFullBleed?.(areaName),
      onAlignMain: (areaName, align) => this._onAlignMain?.(areaName, align),
      onSetBackground: (areaName, cssBackground) =>
        this._onSetBackground?.(areaName, cssBackground),
      getAreaElement: (areaName) => this._getAreaElementByName(areaName),
    });
    this._contextMenu.init();
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

  /**
   * Find an area element by name on the current slide. Used by the
   * background popover for live preview.
   * @param {string} areaName
   * @returns {HTMLElement|null}
   */
  _getAreaElementByName(areaName) {
    const slideEl = this.getSlideElementByIndex(this.currentSlideIndex);
    if (!slideEl) return null;
    return slideEl.querySelector(`.slide__area[data-area-name="${areaName}"]`) || null;
  }

  applyAreaGuides(slideEl, slideData) {
    if (!this.isEditMode || !slideEl) return;

    // Detect full-height areas from the layout grid template
    const resolvedLayout = LayoutParser.resolvePreset(slideData?.layout);
    const layout = LayoutParser.parse(resolvedLayout);
    const rowMatches = layout.gridTemplateAreas.match(/"[^"]*"|'[^']*'/g) || [];
    const allRowCells = rowMatches.map((q) => q.slice(1, -1).split(/\s+/).filter(Boolean));
    const fullHeightAreas = new Set();
    if (allRowCells.length > 1) {
      const numCols = allRowCells[0]?.length || 0;
      for (let col = 0; col < numCols; col++) {
        const areaName = allRowCells[0][col];
        if (!areaName || areaName === ".") continue;
        const spansAll = allRowCells.every((row) => row[col] === areaName);
        if (spansAll) fullHeightAreas.add(areaName);
      }
    }

    const areaEls = slideEl.querySelectorAll(".slide__area");
    areaEls.forEach((areaEl) => {
      const name = areaEl.dataset.areaName || areaEl.style.gridArea || "main";
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

      // Nudge header/footer labels left to avoid overlapping the full-height area's label
      // Nudge header labels left to avoid overlapping the full-height area's label.
      // Footer spans full width so no nudge needed.
      if (
        fullHeightAreas.size > 0 &&
        !fullHeightAreas.has(name) &&
        name !== "main" &&
        name !== "footer"
      ) {
        label.style.right = "90px";
      } else {
        label.style.right = "";
      }

      label.textContent = `@${name}`;
      label.setAttribute("title", `Jump to @${name}`);
      label.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this._onNavigateToArea(name);
      };
      label.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const canDelete = this._canDeleteArea ? this._canDeleteArea(name) : name !== "main";
        const canSwap = this._canSwapArea ? this._canSwapArea(name) : false;
        const canMakeFullHeight = this._canMakeFullHeight ? this._canMakeFullHeight(name) : false;
        const canFullBleed = this._canFullBleed ? this._canFullBleed(name) : false;
        const fullBleedLabel = this._getFullBleedLabel ? this._getFullBleedLabel(name) : "";
        const active = parseSingleColumnLayout(slideData?.layout);
        const canAlignMain = name === "main" && Boolean(active);
        const activeAlign = active?.align;

        const rawBackground = slideData?.areaStyles?.[name] || "";
        const hasBackground = Boolean(rawBackground);

        this._contextMenu.open(e.clientX, e.clientY, name, {
          canDelete,
          canSwap,
          canMakeFullHeight,
          canFullBleed,
          fullBleedLabel,
          canAlignMain,
          canSetBackground: name !== "footer",
          activeAlign,
          currentBackground: rawBackground,
          hasBackground,
        });
      });
    });

    if (slideData?.layout) {
      slideEl.dataset.layoutName = slideData.layout;
    }
  }

  updateAreaOverflow(slideEl) {
    if (!this.isEditMode || !slideEl) return;
    const areas = slideEl.querySelectorAll(".slide__area");
    const overflowing = [];
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
      if (isOverflowing) overflowing.push(`@${name}`);
      if (label) {
        label.dataset.overflow = isOverflowing ? "1" : "0";
        label.setAttribute(
          "aria-label",
          isOverflowing ? `@${area.dataset.areaName} is overflowing` : `@${area.dataset.areaName}`,
        );
      }
    });

    // Detect @area markers that do not exist in the resolved layout.
    const slideData = this.deck?.slides?.[this.currentSlideIndex];
    let mismatchMessage = "";
    let allowedAreas = null;
    if (slideData?.layout !== undefined) {
      const resolved = LayoutParser.resolvePreset(slideData.layout);
      const markerNames = slideData._markerNames || [];
      const fallback = markerNames.length ? [...new Set([...markerNames, "main"])] : ["main"];
      const layout = LayoutParser.parse(resolved, { fallbackAreas: fallback });
      const allowed = new Set(layout.orderedAreas);
      const mismatched = markerNames.filter((a) => {
        let normalized = a;
        if (a === "header" && !allowed.has("header") && allowed.has("title")) {
          normalized = "title";
        } else if (a === "title" && !allowed.has("title") && allowed.has("header")) {
          normalized = "header";
        }
        return !allowed.has(normalized);
      });
      if (mismatched.length > 0) {
        mismatchMessage = `Unsupported @area markers: ${mismatched
          .map((a) => `@${a}`)
          .join(", ")} — click to convert`;
        allowedAreas = [...allowed];
      }
    }

    const warnings = this._getWarnings?.();
    if (!warnings) return;

    const onFix = allowedAreas ? () => this._onFixAreaMismatch?.(allowedAreas) : null;
    if (overflowing.length > 0 && mismatchMessage) {
      warnings.showSlideWarning(
        `Content overflows: ${overflowing.join(", ")}. ${mismatchMessage}`,
        onFix,
      );
    } else if (mismatchMessage) {
      warnings.showSlideWarning(mismatchMessage, onFix);
    } else if (overflowing.length > 0) {
      warnings.showSlideWarning(`Content overflows: ${overflowing.join(", ")}`);
    } else {
      // No overflow or mismatch. Don't unconditionally clear the banner —
      // it may have been created by applyPendingSlideWarning (advisory
      // messages like missing images, empty slide, style-lint). Re-apply
      // pending warnings so they survive; only clear if there's nothing
      // pending.
      if (warnings.pendingSlideWarning) {
        warnings.applyPendingSlideWarning();
      } else {
        warnings.clearSlideWarning();
      }
    }
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
      // Re-activate image and text-block interaction on the current slide's
      // grid.  This is needed because updatePreview() (which normally calls
      // activate) is skipped when loadSlideIntoEditor() runs with
      // suppressOnChange — e.g. when entering edit mode or navigating
      // slides.  Without this, existing images can only be moved via
      // keyboard arrows and text blocks respond to neither drag nor
      // double-click.
      const grid = slideEl.querySelector(".slide__grid");
      if (grid) {
        ImageInteractionHandler.activate(grid);
        TextBlockHandler.activate(grid);
        FencedBlockInteractionHandler.activate(grid);
      }
    });
  }

  destroy() {
    this._contextMenu?.destroy();
  }
}
