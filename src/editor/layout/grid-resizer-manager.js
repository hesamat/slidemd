/**
 * GridResizerManager
 *
 * Manages column/row resize handles on slide grids in edit mode.
 * Extracted from EditController.
 */
import { LayoutParser } from "../../data/layout-parser.js";
import { attachGridResizer, buildLayoutSpec } from "./grid-resizer.js";
import { updateLayoutDirective } from "../core/directive-utils.js";

export class GridResizerManager {
  /** @param {import('./edit-controller.js').EditController} ctrl */
  constructor(ctrl) {
    this.ctrl = ctrl;
    this._gridResizerVisible = false;
  }

  get elements() {
    return this.ctrl.elements;
  }
  get markdownEditor() {
    return this.ctrl.markdownEditor;
  }
  get currentSlideIndex() {
    return this.ctrl.currentSlideIndex;
  }

  getSlideElementByIndex(index) {
    return this.ctrl.getSlideElementByIndex(index);
  }

  /**
   * Attach grid resize handles to a slide element.
   */
  attachForSlide(slideEl, slideData) {
    if (!slideEl || !slideData) return;

    const layoutSpec = (slideData.layout || "").trim();
    const resolvedLayout = LayoutParser.resolvePreset(layoutSpec);
    const areaNames = Object.keys(slideData.areas || {});
    const layoutInfo = LayoutParser.parse(resolvedLayout, {
      fallbackAreas: areaNames.length ? areaNames : ["main"],
    });

    attachGridResizer(slideEl, layoutInfo, this.elements.deckStage, (change) =>
      this._onGridResize(change, layoutInfo),
    );

    // Apply current toggle state to handles
    slideEl.querySelectorAll(".grid-resize-handle").forEach((h) => {
      h.style.display = this._gridResizerVisible ? "" : "none";
    });
    this._updateAdjustColumnsToggleUI();

    this.updateAdjustColumnsState(layoutInfo);
  }

  /**
   * Enable or disable the "Adjust Columns" menu item based on whether
   * the current slide has multiple column tracks.
   */
  updateAdjustColumnsState(layoutInfo) {
    const btn = this.elements.adjustColumnsMenuItem;
    if (!btn) return;

    const colStr = layoutInfo?.gridTemplateColumns || "1fr";
    let depth = 0;
    let count = 0;
    let hasToken = false;
    for (const ch of colStr) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === " " && depth === 0) {
        if (hasToken) count++;
        hasToken = false;
      } else {
        hasToken = true;
      }
    }
    if (hasToken) count++;

    const multiColumn = count >= 2;
    btn.disabled = !multiColumn;
    btn.title = multiColumn ? "Toggle column resize handles" : "Multiple columns required";
  }

  /**
   * Toggle column resize handles on the current slide only.
   */
  toggle() {
    const btn = this.elements.adjustColumnsMenuItem;
    if (btn && btn.disabled) return;

    this._gridResizerVisible = !this._gridResizerVisible;

    const slideEl = this.getSlideElementByIndex(this.currentSlideIndex);
    if (slideEl) {
      slideEl.querySelectorAll(".grid-resize-handle").forEach((h) => {
        h.style.display = this._gridResizerVisible ? "" : "none";
      });
    }

    this._updateAdjustColumnsToggleUI();
  }

  _updateAdjustColumnsToggleUI() {
    const btn = this.elements.adjustColumnsMenuItem;
    if (!btn) return;
    btn.classList.toggle("active", this._gridResizerVisible);
  }

  /**
   * Called by GridResizer when the user finishes dragging a column or row handle.
   */
  _onGridResize(change, layoutInfo) {
    if (!this.markdownEditor) return;
    const newSpec = buildLayoutSpec(layoutInfo, change.cols, change.rows);
    const markdown = this.markdownEditor.getValue();
    const newMarkdown = updateLayoutDirective(markdown, newSpec);
    this.markdownEditor.setValue(newMarkdown, { suppressOnChange: false });
  }
}
