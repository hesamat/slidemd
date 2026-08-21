/**
 * drag-common
 *
 * Shared helpers for interact.js-based drag controllers: drop-gap indicator,
 * drop-target highlighting, drag-target tracking, and insert-slot detection.
 *
 * Extracted from ImageDragController so FencedBlockDragController can reuse
 * the same cross-area drop UX without duplicating the indicator/highlight
 * logic.  Each controller owns a DragDropHelpers instance; mutable drop
 * state (indicator element, target area, target area element) lives here.
 */

const DROP_GAP_HEIGHT = 40;
const DROP_GAP_MARGIN = 4;
const DROP_GAP_RADIUS = 8;
const REJECTED_AREAS = ["header", "footer"];

export class DragDropHelpers {
  /**
   * @param {HTMLElement} container - The slide grid container, used for
   *   querying `.slide__area--drop-target` elements during cleanup.
   * @param {object} opts
   * @param {string} opts.indicatorClassName - CSS class for the drop-gap
   *   indicator element (e.g. "image-drop-indicator").
   * @param {string[]} [opts.extraSlotExcludes] - Additional class names to
   *   exclude when computing the insert-before slot (e.g. "editor-area-label").
   */
  constructor(container, { indicatorClassName, extraSlotExcludes = [] }) {
    this._container = container;
    this._indicatorClassName = indicatorClassName;
    this._slotExcludes = [indicatorClassName, ...extraSlotExcludes];
    this._dropIndicator = null;
    this._dropTargetAreaEl = null;
    this._dragTargetArea = null;
  }

  set container(container) {
    this._container = container;
  }

  // ── Drop gap indicator ──────────────────────────────────────────────────

  showDropGap(areaEl, insertBeforeEl) {
    let gap = this._dropIndicator;
    if (!gap) {
      gap = document.createElement("div");
      gap.className = this._indicatorClassName;
      gap.style.height = `${DROP_GAP_HEIGHT}px`;
      gap.style.minHeight = `${DROP_GAP_HEIGHT}px`;
      gap.style.margin = `${DROP_GAP_MARGIN}px 0`;
      gap.style.borderRadius = `${DROP_GAP_RADIUS}px`;
      gap.style.border = "2px dashed rgba(2, 132, 199, 0.4)";
      gap.style.background = "rgba(2, 132, 199, 0.06)";
      gap.style.pointerEvents = "none";
      gap.style.flexShrink = "0";
      this._dropIndicator = gap;
    }

    if (insertBeforeEl && insertBeforeEl.parentNode === areaEl) {
      areaEl.insertBefore(gap, insertBeforeEl);
    } else {
      areaEl.appendChild(gap);
    }
  }

  hideDropGap() {
    if (this._dropIndicator) {
      this._dropIndicator.remove();
      this._dropIndicator = null;
    }
  }

  // ── Drop target highlighting ────────────────────────────────────────────

  highlightDropTarget(areaEl) {
    if (this._dropTargetAreaEl && this._dropTargetAreaEl !== areaEl) {
      this._dropTargetAreaEl.classList.remove("slide__area--drop-target");
    }
    areaEl.classList.add("slide__area--drop-target");
  }

  clearDropTargetHighlight() {
    if (!this._container) return;
    this._container
      .querySelectorAll(".slide__area--drop-target")
      .forEach((el) => el.classList.remove("slide__area--drop-target"));
  }

  // ── Drag target tracking ────────────────────────────────────────────────

  /**
   * Track which slide area the pointer is over.  Temporarily disables
   * pointer events on the dragged element so elementFromPoint hits the area
   * beneath it.
   *
   * @param {() => HTMLElement|null} getDraggedEl
   * @param {number} clientX
   * @param {number} clientY
   * @param {string|null} sourceArea - The area the drag started in, so it
   *   is not highlighted as a drop target.
   * @returns {string|null} The target area name, or null.
   */
  updateDragTarget(getDraggedEl, clientX, clientY, sourceArea) {
    const el = getDraggedEl();
    if (el) el.style.pointerEvents = "none";
    const hit = document.elementFromPoint(clientX, clientY);
    if (el) el.style.pointerEvents = "";
    const area = hit?.closest?.(".slide__area");
    const rawName = area?.dataset.areaName || null;
    const targetName = rawName && !REJECTED_AREAS.includes(rawName) ? rawName : null;

    if (targetName !== this._dragTargetArea) {
      this.clearDropTargetHighlight();
      this._dragTargetArea = targetName;
      if (area && targetName !== sourceArea) {
        area.classList.add("slide__area--drop-target");
      }
    }
    return targetName;
  }

  // ── Insert slot detection ───────────────────────────────────────────────

  /**
   * Find which child element in an area the cursor Y falls before.
   * @returns {HTMLElement|null} Element to insert before, or null to append.
   */
  findInsertBeforeSlot(areaEl, referenceEl, clientY) {
    const allElements = [...areaEl.children].filter((el) => {
      if (el === referenceEl) return false;
      for (const cls of this._slotExcludes) {
        if (el.classList.contains(cls)) return false;
      }
      return true;
    });
    if (allElements.length === 0) return null;
    for (const el of allElements) {
      const rect = el.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (clientY < midY) return el;
    }
    return null;
  }

  // ── State accessors ─────────────────────────────────────────────────────

  get targetArea() {
    return this._dragTargetArea;
  }

  get dropTargetAreaEl() {
    return this._dropTargetAreaEl;
  }

  set dropTargetAreaEl(el) {
    this._dropTargetAreaEl = el;
  }

  /**
   * Reset per-drag state.  Does not remove the drop indicator (call
   * hideDropGap separately, typically on drag end before clearing).
   */
  clearDragState() {
    this._dragTargetArea = null;
    this._dropTargetAreaEl = null;
  }
}
