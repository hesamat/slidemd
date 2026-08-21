/**
 * MathBlockDragController
 *
 * interact.js drag setup for KaTeX display-math blocks.
 * Extends BlockDragController for cross-area target detection and drop-gap
 * indicators, and mirrors the fenced-block interaction pattern.
 */
import { BlockDragController } from "../core/block-drag-controller.js";

const CROSS_AREA_RESELECT_MS = 400;
const DRAG_OPACITY = "0.4";

export class MathBlockDragController extends BlockDragController {
  static get _selector() {
    return ".slide__area .katex-display";
  }

  static get _indicatorClassName() {
    return "math-block-drop-indicator";
  }

  static get _extraSlotExcludes() {
    return ["editor-area-label"];
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

    ctx.onMoveArea?.(newMd);

    // Reselect the moved math after the preview re-renders by matching the
    // rendered text content.  Use onPreviewReady if available so the overlay
    // snaps to the correct new location; fall back to a timeout otherwise.
    const movedContent = el.textContent?.trim();
    const reselect = () => {
      const candidates = this._container?.querySelectorAll(
        `.slide__area[data-area-name="${toArea}"] .katex-display`,
      );
      const match = Array.from(candidates || []).find(
        (m) => m.textContent?.trim() === movedContent,
      );
      if (match) {
        ctx.select(match);
      } else {
        ctx.deselect?.();
      }
    };

    if (movedContent && ctx.onPreviewReady) {
      ctx.onPreviewReady(reselect);
    } else if (movedContent) {
      setTimeout(reselect, CROSS_AREA_RESELECT_MS);
    } else {
      ctx.deselect?.();
    }

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
