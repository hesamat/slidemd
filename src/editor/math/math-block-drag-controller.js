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

  static _mathIndexBefore(areaEl, insertBeforeEl) {
    if (!areaEl) return 0;
    const displays = areaEl.querySelectorAll(".katex-display");
    if (!insertBeforeEl) return displays.length;

    let count = 0;
    for (const d of displays) {
      if (d === insertBeforeEl) return count;
      const pos = insertBeforeEl.compareDocumentPosition(d);
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) {
        count++;
      } else {
        return count;
      }
    }
    return count;
  }

  static _onCrossAreaDrop(el, fromArea, toArea, targetAreaEl, insertBeforeEl, _e) {
    const ctx = this._ctx;
    if (!ctx) return false;

    const newMd = ctx.buildMoveMarkdown(el, fromArea, toArea, insertBeforeEl);
    if (!newMd) return false;

    // Remember where the math will land so we can reselect the exact new
    // element after the preview re-renders, even if there are duplicate
    // equations in the target area.
    const targetIndex = this._mathIndexBefore(targetAreaEl, insertBeforeEl);
    const movedContent = el.textContent?.trim();

    ctx.onMoveArea?.(newMd);

    const reselect = () => {
      const targetArea = this._container?.querySelector(`.slide__area[data-area-name="${toArea}"]`);
      const displays = targetArea?.querySelectorAll(".katex-display") || [];
      const byIndex = displays[targetIndex];
      if (byIndex && (!movedContent || byIndex.textContent?.trim() === movedContent)) {
        ctx.select(byIndex);
        return;
      }

      // Fallback for unusual cases (e.g., the math ended up in a mixed
      // paragraph and changed child order).
      if (!movedContent) {
        ctx.deselect?.();
        return;
      }
      const match = Array.from(displays).find((m) => m.textContent?.trim() === movedContent);
      if (match) {
        ctx.select(match);
      } else {
        ctx.deselect?.();
      }
    };

    if (ctx.onPreviewReady) {
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
