/**
 * GridResizerManager
 *
 * Manages column/row resize handles on slide grids in edit mode.
 * Extracted from EditController.
 */
import { LayoutParser } from "../../data/layout-parser.js";
import { LayoutData } from "../../data/layout-data.js";
import { attachGridResizer, buildLayoutSpec } from "./grid-resizer.js";
import {
  updateLayoutDirective,
  updateMediaSpanDirective,
  readMediaSpanDirective,
} from "../core/directive-utils.js";

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

    attachGridResizer(
      slideEl,
      layoutInfo,
      this._deckStage,
      (change) => this._onGridResize(change, layoutInfo, layoutSpec),
      layoutSpec,
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

  _onGridResize(change, layoutInfo, layoutSpec) {
    if (!this.markdownEditor) return;
    const markdown = this.markdownEditor.getValue();
    let newSpec;
    if (change.spec) {
      newSpec = change.spec;
    } else {
      newSpec = buildLayoutSpec(layoutInfo, change.cols, change.rows);
    }
    // A resized media-span preset becomes a custom grid spec, so on later
    // resizes the original layout name is gone. Preserve the intent from an
    // already-written media-span directive (previous resize) or derive it
    // from the named preset being resized; updateLayoutDirective strips the
    // directive, so it must be re-added here or the bleed would be lost.
    const existingSide = readMediaSpanDirective(markdown);
    const namedSide = LayoutData.isBuiltIn(layoutSpec)
      ? LayoutData.getMediaSpanSide(layoutSpec)
      : null;
    const mediaSpanSide = existingSide || namedSide;
    let newMarkdown = updateLayoutDirective(markdown, newSpec);
    if (mediaSpanSide) {
      newMarkdown = updateMediaSpanDirective(newMarkdown, mediaSpanSide);
    }
    this.markdownEditor.setValue(newMarkdown, { suppressOnChange: false });
  }
}
