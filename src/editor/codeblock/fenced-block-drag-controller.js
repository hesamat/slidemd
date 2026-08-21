/**
 * FencedBlockDragController
 *
 * interact.js drag setup for fenced blocks (Mermaid diagrams and code blocks).
 * Extends BlockDragController, which owns the shared cross-area drag target
 * detection, drop-target highlighting, and gap-indicator logic.
 *
 * Fenced blocks are block-level and stay in-flow — there is no absolute
 * positioning during drag.  The dragged element is dimmed and a drop-gap
 * indicator shows where it will land.
 */
import { BlockDragController } from "../core/block-drag-controller.js";

const CROSS_AREA_RESELECT_MS = 400;
const DRAG_OPACITY = "0.4";

export class FencedBlockDragController extends BlockDragController {
  static get _selector() {
    return ".slide__area .mermaid, .slide__area > pre";
  }

  static get _indicatorClassName() {
    return "fenced-block-drop-indicator";
  }

  static get _extraSlotExcludes() {
    return ["editor-area-label"];
  }

  static get _suppressesTextSelection() {
    return true;
  }

  static _getDragElement(e) {
    return e.target.closest(".mermaid, pre");
  }

  static _shouldIgnore(el) {
    // Skip non-content <pre> (text-block wrappers, flex rows, editor chrome).
    return !!el.closest(".text-block, .flex-row, .editor-area-label");
  }

  static _onAfterDragStart(el) {
    // Dim the dragged element so the user sees it being moved.
    el.style.opacity = DRAG_OPACITY;
  }

  static _onAfterDragEnd(el) {
    // Restore opacity.
    if (el) el.style.opacity = "";
  }

  static _onCrossAreaDrop(el, fromArea, toArea, targetAreaEl, insertBeforeEl, _e) {
    const ctx = this._ctx;
    if (!ctx) return false;

    const newMd = ctx.buildMoveMarkdown(el, fromArea, toArea, insertBeforeEl);
    if (!newMd) return false;

    ctx.onMoveArea?.(newMd);

    // Reselect the moved block after the preview re-renders by matching
    // its content (source lines change when the block moves areas).
    const movedIsMermaid = el.classList.contains("mermaid");
    const movedContent = movedIsMermaid ? el.dataset.mermaidSource : el.textContent;
    setTimeout(() => {
      if (movedContent == null) return;
      const targetName = toArea;
      const selector = movedIsMermaid
        ? `.slide__area[data-area-name="${targetName}"] .mermaid`
        : `.slide__area[data-area-name="${targetName}"] > pre`;
      const candidates = this._container?.querySelectorAll(selector);
      const match = Array.from(candidates || []).find((c) =>
        movedIsMermaid ? c.dataset.mermaidSource === movedContent : c.textContent === movedContent,
      );
      if (match) ctx.select(match);
    }, CROSS_AREA_RESELECT_MS);

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
