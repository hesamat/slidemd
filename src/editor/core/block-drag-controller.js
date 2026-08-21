/**
 * BlockDragController
 *
 * Base class for interact.js drag controllers used in edit mode.  It owns
 * the shared lifecycle (start / move / end), drop-gap indicator, drop-target
 * highlighting, insert-slot detection, and text-selection suppression.
 *
 * Subclasses provide:
 *   - the interact.js selector
 *   - element selection / ignore rules
 *   - per-element move updates (e.g. free-flow image translation)
 *   - cross-area and same-area drop handling
 *
 * ImageDragController and FencedBlockDragController both extend this class,
 * and future block types (e.g. KaTeX display math) can be added by
 * overriding a small set of hooks.
 */
import interact from "interactjs";
import { DragDropHelpers } from "./drag-common.js";

const CROSS_AREA_RESELECT_MS = 400;

export class BlockDragController {
  // ── Per-controller mutable state ─────────────────────────────────────────
  static _drop = null;
  static _dragSourceArea = null;
  static _dragMoved = false;
  static _dragIgnored = false;
  static _dragStartInsertBefore = null;
  static _dropInsertBeforeEl = null;
  static _container = null;
  static _ctx = null;

  // ── Hooks that subclasses override ───────────────────────────────────────

  /** @returns {string} interact.js selector for draggable elements. */
  static get _selector() {
    return "";
  }

  /** @returns {string} CSS class for the drop-gap indicator. */
  static get _indicatorClassName() {
    return "block-drop-indicator";
  }

  /** @returns {string[]} Extra child classes to skip in insert-slot detection. */
  static get _extraSlotExcludes() {
    return [];
  }

  /** @returns {boolean} Whether the base class should suppress text selection. */
  static get _suppressesTextSelection() {
    return false;
  }

  /**
   * Return the dragged DOM element from an interact.js event.
   * @param {InteractEvent} e
   * @returns {HTMLElement|null}
   */
  static _getDragElement(_e) {
    return null;
  }

  /**
   * Return true to ignore this drag entirely (no selection, no markdown sync).
   * @param {HTMLElement} _el
   * @returns {boolean}
   */
  static _shouldIgnore(_el) {
    return false;
  }

  /**
   * Called before the dragged element is selected.
   * @param {HTMLElement} _el
   */
  static _onBeforeDragStart(_el) {}

  /**
   * Called after the dragged element is selected and source area is recorded.
   * @param {HTMLElement} el
   */
  static _onAfterDragStart(_el) {}

  /**
   * Return the currently selected element from the context.
   * @returns {HTMLElement|null}
   */
  static _getSelected() {
    return this._ctx?.getSelected?.() ?? null;
  }

  /**
   * Return true if the drag should show a drop gap / reorder UI within an
   * area.  Images skip the gap for freeflow elements; fenced blocks always
   * show it.
   * @param {HTMLElement} el
   * @returns {boolean}
   */
  static _shouldShowReorderGap(_el) {
    return true;
  }

  /**
   * Optional per-frame update while the element is being dragged (e.g. update
   * an overlay or move a free-flow element).
   * @param {HTMLElement} el
   * @param {InteractEvent} e
   */
  static _onDragMoveUpdate(_el, _e) {}

  /**
   * Return true if the cross-area target should be highlighted while the
   * pointer is over it.  Images skip the highlight for freeflow elements
   * (they stay visually under the cursor), but the drop still runs on
   * drag end.
   * @param {HTMLElement} el
   * @param {string} fromArea
   * @param {string} toArea
   * @returns {boolean}
   */
  static _shouldHighlightCrossAreaTarget(_el, _fromArea, _toArea) {
    return true;
  }

  /**
   * Return the element to insert before in a cross-area drop.  The default
   * uses the tracked drop insert-before element or computes it from the
   * target area.
   * @param {HTMLElement} el
   * @param {HTMLElement} targetAreaEl
   * @param {InteractEvent} e
   * @returns {HTMLElement|null}
   */
  static _getCrossAreaInsertBefore(_el, targetAreaEl, e) {
    return (
      this._dropInsertBeforeEl || this._drop?.findInsertBeforeSlot(targetAreaEl, null, e.clientY)
    );
  }

  /**
   * Handle a cross-area drop.  Subclasses update markdown and DOM.
   * @param {HTMLElement} el
   * @param {string} fromArea
   * @param {string} toArea
   * @param {HTMLElement} targetAreaEl
   * @param {HTMLElement|null} insertBeforeEl
   * @param {InteractEvent} e
   * @returns {boolean} true if handled
   */
  static _onCrossAreaDrop(_el, _fromArea, _toArea, _targetAreaEl, _insertBeforeEl, _e) {
    return false;
  }

  /**
   * Handle a same-area reorder.  Subclasses update markdown and DOM.
   * @param {HTMLElement} el
   * @param {HTMLElement|null} targetEl
   * @returns {boolean} true if handled
   */
  static _onSameAreaReorder(_el, _targetEl) {
    return false;
  }

  /**
   * Called at the very end of _onDragEnd, after drop logic or early returns.
   * @param {HTMLElement} _el
   */
  static _onAfterDragEnd(_el) {}

  /**
   * Called during _clearDragState before dropping state.
   */
  static _onClearDragState() {}

  // ── Activation ──────────────────────────────────────────────────────────

  static activate(container, ctx) {
    this._ctx = ctx;
    this._container = container;
    this._drop = new DragDropHelpers(container, {
      indicatorClassName: this._indicatorClassName,
      extraSlotExcludes: this._extraSlotExcludes,
    });

    interact(this._selector, { context: container }).draggable({
      listeners: {
        start: (e) => this._onDragStart(e),
        move: (e) => this._onDragMove(e),
        end: (e) => this._onDragEnd(e),
      },
    });
  }

  static deactivate() {
    if (this._container) {
      interact(this._selector, { context: this._container }).draggable(false);
    }
    this._ctx = null;
    this._container = null;
    this._drop = null;
    this._clearDragState();
  }

  // ── Drag lifecycle ──────────────────────────────────────────────────────

  static _onDragStart(e) {
    const ctx = this._ctx;
    if (!ctx) return;
    const el = this._getDragElement(e);
    if (!el) return;

    if (this._shouldIgnore(el)) {
      this._dragIgnored = true;
      return;
    }
    this._dragIgnored = false;

    if (this._suppressesTextSelection) {
      document.body.style.userSelect = "none";
      window.getSelection()?.removeAllRanges();
    }

    this._onBeforeDragStart(el);

    // If the previously selected element was removed by a re-render, clear
    // the stale reference so the drag context starts fresh.
    const selected = this._getSelected();
    if (selected && !selected.isConnected) {
      this._clearSelection?.();
    }

    ctx.select(el);
    const sourceArea = el.closest(".slide__area");
    this._dragSourceArea = sourceArea?.dataset.areaName || null;
    this._dragMoved = false;

    if (sourceArea) {
      this._dragStartInsertBefore = this._drop?.findInsertBeforeSlot(sourceArea, el, e.clientY);
    }

    this._onAfterDragStart(el);
  }

  static _onDragMove(e) {
    const ctx = this._ctx;
    const el = this._getSelected();
    if (!el || !ctx) return;
    if (this._dragIgnored) return;

    this._dragMoved = true;
    this._drop?.updateDragTarget(() => el, e.clientX, e.clientY, this._dragSourceArea);

    const targetArea = this._drop?.targetArea;
    const sourceArea = this._dragSourceArea;
    const isCrossArea = targetArea && sourceArea && targetArea !== sourceArea;

    if (isCrossArea && this._shouldHighlightCrossAreaTarget(el, sourceArea, targetArea)) {
      const targetAreaEl = this._container?.querySelector(
        `.slide__area[data-area-name="${targetArea}"]`,
      );
      if (targetAreaEl && this._drop) {
        this._drop.highlightDropTarget(targetAreaEl);
        this._drop.dropTargetAreaEl = targetAreaEl;
      }
    } else if (!isCrossArea && this._drop?.dropTargetAreaEl) {
      this._drop.clearDropTargetHighlight();
      this._drop.dropTargetAreaEl = null;
    }

    this._onDragMoveUpdate(el, e);

    if (this._drop && this._shouldShowReorderGap(el) && !isCrossArea) {
      const areaEl = el.closest(".slide__area");
      if (areaEl) {
        const insertBefore = this._drop.findInsertBeforeSlot(areaEl, el, e.clientY);
        if (insertBefore !== this._dropInsertBeforeEl) {
          this._drop.showDropGap(areaEl, insertBefore);
        }
        this._dropInsertBeforeEl = insertBefore;
      }
    } else if (this._drop && isCrossArea) {
      // Track the insert-before slot in the target area too, for cross-area drops.
      const targetAreaEl = this._drop.dropTargetAreaEl;
      if (targetAreaEl) {
        const insertBefore = this._drop.findInsertBeforeSlot(targetAreaEl, null, e.clientY);
        if (insertBefore !== this._dropInsertBeforeEl) {
          this._drop.showDropGap(targetAreaEl, insertBefore);
        }
        this._dropInsertBeforeEl = insertBefore;
      }
    }
  }

  static _onDragEnd(e) {
    const ctx = this._ctx;
    const el = this._getSelected();
    if (!el || !ctx) return;

    this._drop?.clearDropTargetHighlight();
    this._drop?.hideDropGap();

    if (this._dragIgnored) {
      this._clearDragState();
      return;
    }

    // A pointer click still produces interact.js drag events.  It should
    // only select, not move.
    if (!this._dragMoved) {
      this._clearDragState();
      return;
    }

    const fromArea = this._dragSourceArea;
    const toArea = this._drop?.targetArea;
    const targetAreaEl = this._drop?.dropTargetAreaEl;
    const isCrossArea = fromArea && toArea && fromArea !== toArea;

    let handled = false;
    let attemptedCrossArea = false;

    if (isCrossArea && targetAreaEl) {
      const insertBeforeEl = this._getCrossAreaInsertBefore(el, targetAreaEl, e);
      handled = this._onCrossAreaDrop(el, fromArea, toArea, targetAreaEl, insertBeforeEl, e);
      attemptedCrossArea = true;
    }

    if (!handled && !attemptedCrossArea) {
      const areaEl = el.closest(".slide__area");
      const insertBeforeEl = areaEl
        ? this._drop?.findInsertBeforeSlot(areaEl, el, e.clientY)
        : null;
      handled = this._onSameAreaReorder(el, insertBeforeEl);
    }

    this._onAfterDragEnd(el);

    if (!handled) {
      // Subclass didn't move the element; at least reselect it.
      if (el.isConnected) ctx.select(el);
    }

    this._clearDragState();
  }

  // ── State management ────────────────────────────────────────────────────

  static _clearDragState() {
    this._onClearDragState();
    this._dragSourceArea = null;
    this._dragStartInsertBefore = null;
    this._dropInsertBeforeEl = null;
    this._dragMoved = false;
    this._dragIgnored = false;
    this._drop?.clearDragState();
    if (this._suppressesTextSelection && document.body?.style) {
      document.body.style.userSelect = "";
    }
  }

  /**
   * Reselect a moved element after a cross-area re-render.
   * @param {HTMLElement} container
   * @param {string} targetArea
   * @param {number} sourceIndex
   * @param {string} selector
   * @param {(el: HTMLElement) => void} select
   * @param {number} delayMs
   */
  static _reselectAfterMove(
    container,
    targetArea,
    sourceIndex,
    selector,
    select,
    delayMs = CROSS_AREA_RESELECT_MS,
  ) {
    if (isNaN(sourceIndex) || sourceIndex < 0) return;
    setTimeout(() => {
      const candidates = container?.querySelectorAll(
        `.slide__area[data-area-name="${targetArea}"] ${selector}`,
      );
      const match = candidates?.[sourceIndex];
      if (match) select(match);
    }, delayMs);
  }
}
