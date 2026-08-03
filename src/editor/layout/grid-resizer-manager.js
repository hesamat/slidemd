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
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.adjustColumnsMenuItem
   * @param {HTMLElement} opts.deckStage
   * @param {() => object|null} opts.getMarkdownEditor
   * @param {() => number} opts.getCurrentSlideIndex
   * @param {(index: number) => HTMLElement|null} opts.getSlideElementByIndex
   */
  constructor({
    adjustColumnsMenuItem,
    deckStage,
    getMarkdownEditor,
    getCurrentSlideIndex,
    getSlideElementByIndex,
  }) {
    this._adjustColumnsMenuItem = adjustColumnsMenuItem;
    this._deckStage = deckStage;
    this._getMarkdownEditor = getMarkdownEditor;
    this._getCurrentSlideIndex = getCurrentSlideIndex;
    this._getSlideElementByIndex = getSlideElementByIndex;
    this._gridResizerVisible = true;
  }

  get markdownEditor() {
    return this._getMarkdownEditor();
  }
  get currentSlideIndex() {
    return this._getCurrentSlideIndex();
  }

  getSlideElementByIndex(index) {
    return this._getSlideElementByIndex(index);
  }

  attachForSlide(slideEl, slideData) {
    if (!slideEl || !slideData) return;

    const layoutSpec = (slideData.layout || "").trim();
    const resolvedLayout = LayoutParser.resolvePreset(layoutSpec);
    const areaNames = Object.keys(slideData.areas || {});
    const layoutInfo = LayoutParser.parse(resolvedLayout, {
      fallbackAreas: areaNames.length ? areaNames : ["main"],
    });

    attachGridResizer(slideEl, layoutInfo, this._deckStage, (change) =>
      this._onGridResize(change, layoutInfo),
    );

    slideEl.querySelectorAll(".grid-resize-handle").forEach((h) => {
      h.style.display = this._gridResizerVisible ? "" : "none";
    });
    slideEl.classList.toggle("grid-visible", this._gridResizerVisible);
    this._updateAdjustColumnsToggleUI();
  }

  toggle() {
    this._gridResizerVisible = !this._gridResizerVisible;

    const slideEl = this.getSlideElementByIndex(this.currentSlideIndex);
    if (slideEl) {
      slideEl.querySelectorAll(".grid-resize-handle").forEach((h) => {
        h.style.display = this._gridResizerVisible ? "" : "none";
      });
      slideEl.classList.toggle("grid-visible", this._gridResizerVisible);
    }

    this._updateAdjustColumnsToggleUI();
  }

  _updateAdjustColumnsToggleUI() {
    const btn = this._adjustColumnsMenuItem;
    if (!btn) return;
    btn.classList.toggle("active", this._gridResizerVisible);
  }

  _onGridResize(change, layoutInfo) {
    if (!this.markdownEditor) return;
    const markdown = this.markdownEditor.getValue();
    let newSpec;
    if (change.spec) {
      newSpec = change.spec;
    } else {
      newSpec = buildLayoutSpec(layoutInfo, change.cols, change.rows);
    }
    const newMarkdown = updateLayoutDirective(markdown, newSpec);
    this.markdownEditor.setValue(newMarkdown, { suppressOnChange: false });
  }
}
