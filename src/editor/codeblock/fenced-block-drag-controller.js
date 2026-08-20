/**
 * FencedBlockDragController
 *
 * interact.js drag setup for fenced blocks (Mermaid diagrams and code blocks).
 * Cross-area drag target detection, drop-target highlighting, and gap
 * indicators are delegated to DragDropHelpers (shared with ImageDragController).
 *
 * Fenced blocks are block-level and stay in-flow — there is no absolute
 * positioning during drag.  The dragged element is dimmed and a drop-gap
 * indicator shows where it will land, matching the non-freeflow image
 * reorder path.
 */
import interact from "interactjs";
import { DragDropHelpers } from "../core/drag-common.js";
import { readSourceLine } from "./fenced-block-utils.js";

const CROSS_AREA_RESELECT_MS = 400;
const DRAG_OPACITY = "0.4";

export class FencedBlockDragController {
  static _drop = null;
  static _dragSourceArea = null;
  static _dragMoved = false;
  static _dragIgnored = false;
  static _dragStartInsertBefore = null;
  static _dropInsertBeforeEl = null;
  static _container = null;
  static _ctx = null;

  /**
   * Activate drag on a slide container.
   * @param {HTMLElement} container
   * @param {object} ctx
   */
  static activate(container, ctx) {
    this._ctx = ctx;
    this._container = container;
    this._drop = new DragDropHelpers(container, {
      indicatorClassName: "fenced-block-drop-indicator",
      extraSlotExcludes: ["editor-area-label"],
    });

    // Match both .mermaid divs and content <pre> blocks.  interact.js
    // accepts a comma-separated selector; the context option scopes it to
    // the current slide grid.
    interact(".slide__area .mermaid, .slide__area > pre", { context: container }).draggable({
      listeners: {
        start: (e) => this._onDragStart(e),
        move: (e) => this._onDragMove(e),
        end: (e) => this._onDragEnd(e),
      },
    });
  }

  static deactivate() {
    if (this._container) {
      interact(".slide__area .mermaid, .slide__area > pre", {
        context: this._container,
      }).draggable(false);
    }
    this._ctx = null;
    this._container = null;
    this._drop = null;
    this._clearDragState();
  }

  static _onDragStart(e) {
    const ctx = this._ctx;
    if (!ctx) return;
    const el = e.target.closest(".mermaid, pre");
    if (!el) return;

    // Skip non-content <pre> (text-block wrappers, flex rows, editor chrome).
    if (el.closest(".text-block, .flex-row, .editor-area-label")) {
      this._dragIgnored = true;
      return;
    }
    this._dragIgnored = false;

    // Prevent text selection while dragging fenced blocks (the browser
    // otherwise selects the text under the cursor).
    document.body.style.userSelect = "none";
    window.getSelection()?.removeAllRanges();

    ctx.select(el);
    const sourceArea = el.closest(".slide__area");
    this._dragSourceArea = sourceArea?.dataset.areaName || null;
    this._dragMoved = false;

    // Capture the initial insert-before slot so we can detect an actual
    // reorder on drag end (vs. a click that didn't move past the threshold).
    if (sourceArea) {
      this._dragStartInsertBefore = this._drop?.findInsertBeforeSlot(sourceArea, el, e.clientY);
    }

    // Dim the dragged element so the user sees it being moved.
    el.style.opacity = DRAG_OPACITY;
  }

  static _onDragMove(e) {
    const ctx = this._ctx;
    const el = ctx?.getSelected?.();
    if (!el || !ctx || !this._drop) return;
    if (this._dragIgnored) return;

    this._dragMoved = true;
    this._drop.updateDragTarget(() => el, e.clientX, e.clientY, this._dragSourceArea);

    const targetArea = this._drop.targetArea;
    const sourceArea = this._dragSourceArea;
    const isCrossArea = targetArea && sourceArea && targetArea !== sourceArea;

    if (isCrossArea) {
      const targetAreaEl = this._container?.querySelector(
        `.slide__area[data-area-name="${targetArea}"]`,
      );
      if (targetAreaEl) {
        this._drop.highlightDropTarget(targetAreaEl);
        this._drop.dropTargetAreaEl = targetAreaEl;
      }
    } else if (!isCrossArea && this._drop.dropTargetAreaEl) {
      this._drop.clearDropTargetHighlight();
      this._drop.dropTargetAreaEl = null;
    }

    // Gap indicator.
    if (!isCrossArea) {
      const areaEl = el.closest(".slide__area");
      if (areaEl) {
        const insertBefore = this._drop.findInsertBeforeSlot(areaEl, el, e.clientY);
        if (insertBefore !== this._dropInsertBeforeEl) {
          this._drop.showDropGap(areaEl, insertBefore);
        }
        this._dropInsertBeforeEl = insertBefore;
      }
    } else {
      const targetAreaEl = this._container?.querySelector(
        `.slide__area[data-area-name="${targetArea}"]`,
      );
      if (targetAreaEl) {
        const insertBefore = ctx.findInsertBeforeSlot(targetAreaEl, null, e.clientY);
        if (insertBefore !== this._dropInsertBeforeEl) {
          this._drop.showDropGap(targetAreaEl, insertBefore);
        }
        this._dropInsertBeforeEl = insertBefore;
      }
    }
  }

  static _onDragEnd(e) {
    const ctx = this._ctx;
    const el = ctx?.getSelected?.();
    if (!el || !ctx) return;

    // Restore opacity.
    el.style.opacity = "";

    this._drop?.clearDropTargetHighlight();
    this._drop?.hideDropGap();

    if (this._dragIgnored) {
      this._clearDragState();
      return;
    }

    // A click still produces interact.js drag events; only select, don't move.
    if (!this._dragMoved) {
      this._clearDragState();
      return;
    }

    const fromArea = this._dragSourceArea;
    const toArea = this._drop?.targetArea;
    const targetAreaEl = this._drop?.dropTargetAreaEl;
    const isCrossArea = fromArea && toArea && fromArea !== toArea;

    if (isCrossArea && targetAreaEl) {
      const crossSlot =
        this._dropInsertBeforeEl || ctx.findInsertBeforeSlot(targetAreaEl, null, e.clientY);

      const newMd = ctx.buildMoveMarkdown(el, fromArea, toArea, crossSlot);
      if (newMd) {
        ctx.onMoveArea?.(newMd);

        // Reselect the moved block after the preview re-renders.
        const movedSourceLine = parseInt(readSourceLine(el), 10);
        const movedIsMermaid = el.classList.contains("mermaid");
        setTimeout(() => {
          if (isNaN(movedSourceLine)) return;
          const targetName = toArea;
          const selector = movedIsMermaid
            ? `.slide__area[data-area-name="${targetName}"] .mermaid`
            : `.slide__area[data-area-name="${targetName}"] > pre`;
          const candidates = this._container?.querySelectorAll(selector);
          const match = Array.from(candidates || []).find(
            (c) => parseInt(readSourceLine(c), 10) === movedSourceLine,
          );
          if (match) ctx.select(match);
        }, CROSS_AREA_RESELECT_MS);
      }
    } else {
      // Within-area reorder.
      const currentAreaEl = el.closest(".slide__area");
      const currentSlot = currentAreaEl
        ? ctx.findInsertBeforeSlot(currentAreaEl, el, e.clientY)
        : null;

      if (currentSlot !== this._dragStartInsertBefore) {
        ctx.reorderBlock(el, currentSlot);
      }
      if (el?.isConnected) {
        ctx.select(el);
      }
    }

    this._clearDragState();
  }

  static _clearDragState() {
    this._dragSourceArea = null;
    this._dragStartInsertBefore = null;
    this._dropInsertBeforeEl = null;
    this._dragMoved = false;
    this._dragIgnored = false;
    this._drop?.clearDragState();
    document.body.style.userSelect = "";
  }
}
