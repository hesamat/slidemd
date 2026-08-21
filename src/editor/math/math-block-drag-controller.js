/**
 * MathBlockDragController
 *
 * interact.js drag setup for KaTeX display-math blocks.
 * Extends BlockDragController, which owns the shared drag lifecycle.
 */
import { BlockDragController } from "../core/block-drag-controller.js";

const DRAG_OPACITY = "0.4";

export class MathBlockDragController extends BlockDragController {
  static get _selector() {
    return ".slide__area .katex-display";
  }

  static get _indicatorClassName() {
    return "math-block-drop-indicator";
  }

  static get _extraSlotExcludes() {
    return ["editor-area-label", "text-block", "flex-row"];
  }

  static get _suppressesTextSelection() {
    return true;
  }

  static _getDragElement(e) {
    return e.target.closest(".katex-display");
  }

  static _shouldIgnore(el) {
    // Skip math inside text blocks, flex rows, and editor chrome.
    return !!el.closest(".text-block, .flex-row, .editor-area-label, .editor-slide-warning");
  }

  static _onAfterDragStart(el) {
    el.style.opacity = DRAG_OPACITY;
  }

  static _onAfterDragEnd(el) {
    if (el) el.style.opacity = "";
  }

  static _onCrossAreaDrop(el, fromArea, toArea, targetAreaEl, insertBeforeEl, _e) {
    const ctx = this._ctx;
    if (!ctx) return false;

    const newMd = ctx.buildMoveMarkdown(el, fromArea, toArea, insertBeforeEl);
    if (!newMd) return false;

    const targetIndex = this._indexOfElementBefore(targetAreaEl, insertBeforeEl, ".katex-display");
    const movedContent = el.textContent?.trim();

    ctx.onMoveArea?.(newMd);

    this._reselectAfterMove(
      this._container,
      toArea,
      targetIndex,
      ".katex-display",
      (match) => ctx.select(match),
      {
        onPreviewReady: ctx.onPreviewReady,
        getMatchValue: (m) => m.textContent?.trim(),
        expectedValue: movedContent,
        onNotFound: () => ctx.deselect?.(),
      },
    );

    return true;
  }

  static _onSameAreaReorder(el, targetEl) {
    const ctx = this._ctx;
    if (!ctx) return false;

    if (targetEl === this._dragStartInsertBefore) {
      if (el?.isConnected) ctx.select(el);
      return false;
    }

    ctx.reorderBlock(el, targetEl);
    if (el?.isConnected) {
      ctx.select(el);
    }
    return true;
  }
}
