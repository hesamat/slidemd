/**
 * MathBlockInteractionHandler
 *
 * Selection, overlay, and drag handling for KaTeX display-math blocks.
 * Most of the lifecycle is inherited from BlockInteractionHandler; this class
 * only provides the math-specific parser, ordinal, and DOM-move hooks.
 */
import { BlockInteractionHandler } from "../core/block-interaction-handler.js";
import { MathBlockDragController } from "./math-block-drag-controller.js";
import {
  parseDisplayMathBlocksInArea,
  getDisplayMathOrdinalIndexInArea,
  getDraggableDisplayMathElement,
  insertDisplayMathBlockAt,
  removeDisplayMathBlock,
} from "./math-block-utils.js";

export class MathBlockInteractionHandler extends BlockInteractionHandler {
  static get _overlayClassName() {
    return "math-block-overlay";
  }

  static get _selectedClassName() {
    return "math-block-selected";
  }

  static get _DragController() {
    return MathBlockDragController;
  }

  static _dragControllerContext() {
    return {
      getSelected: () => this._selected,
      select: (el) => this.select(el),
      deselect: () => this.deselect(),
      updateOverlay: () => this._updateOverlay(),
      getMarkdown: () => this._getMarkdown?.(),
      setMarkdown: (md) => this._setMarkdown?.(md),
      onMoveArea: (md) => this._onMoveArea?.(md),
      getOverlay: () => this._overlay,
      onPreviewReady: (cb) => this._onPreviewReady?.(cb),
      reorderBlock: (el, targetEl) => this._reorderBlock(el, targetEl),
      buildMoveMarkdown: (el, fromAreaName, toAreaName, insertBeforeEl) =>
        this._buildMoveMarkdown(el, fromAreaName, toAreaName, insertBeforeEl),
    };
  }

  static elementFromTarget(target) {
    return getDraggableDisplayMathElement(target);
  }

  static _isOverlayOrChromeTarget(target) {
    return !!target.closest(".math-block-overlay");
  }

  static _parseBlocksInArea(markdown, areaName) {
    return parseDisplayMathBlocksInArea(markdown, areaName);
  }

  static _getBlockOrdinalIndexInArea(el) {
    return getDisplayMathOrdinalIndexInArea(el);
  }

  static _getTargetBlockIndexInArea(targetEl) {
    const targetMathEl =
      targetEl?.closest?.(".katex-display") || targetEl?.querySelector?.(".katex-display");
    if (
      !targetMathEl ||
      targetMathEl.closest(".text-block, .editor-area-label, .editor-slide-warning, .flex-row")
    ) {
      return -1;
    }
    return getDisplayMathOrdinalIndexInArea(targetMathEl);
  }

  static _insertBlockAt(markdown, insertAt, blockText) {
    return insertDisplayMathBlockAt(markdown, insertAt, blockText);
  }

  static _removeBlockFromMarkdown(block, markdown) {
    const { markdown: updated } = removeDisplayMathBlock(markdown, block);
    return updated;
  }

  static _onAfterReorder(sourceEl, targetEl, area) {
    // If the display math is the only content of its parent block (e.g. a
    // standalone `<p>`), move the whole parent.  Otherwise move the math
    // element itself; the preview will correct the wrapping on the next full
    // re-render.
    const displayParent = sourceEl.parentElement;
    const isStandaloneDisplay =
      displayParent &&
      displayParent !== area &&
      displayParent.textContent?.trim() === sourceEl.textContent?.trim();
    const blockEl = isStandaloneDisplay ? displayParent : sourceEl;

    if (targetEl && targetEl.parentNode === area) {
      area.insertBefore(blockEl, targetEl);
    } else if (area) {
      area.appendChild(blockEl);
    }
  }
}
