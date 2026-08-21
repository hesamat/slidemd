/**
 * FencedBlockInteractionHandler
 *
 * Selection, overlay, and delete support for draggable fenced blocks
 * (Mermaid diagrams and code blocks) in edit mode.  Drag itself is handled by
 * FencedBlockDragController, which receives a context object (mirroring the
 * ImageInteractionHandler / ImageDragController split).
 *
 * Unlike images, fenced blocks stay in-flow (block-level) — there is no
 * free-flow positioning or resize in this version.  Drag is reorder /
 * cross-area only, matching issue #123's "move between columns" requirement.
 */
import { FencedBlockDragController } from "./fenced-block-drag-controller.js";
import {
  removeFencedBlock,
  getAreaContentRange,
  getDraggableFencedBlockElement,
  parseFencedBlocksInArea,
  insertFencedBlockAt,
  getFencedBlockOrdinalIndexInArea,
} from "./fenced-block-utils.js";
import { getStageScale } from "../image/image-position-presets.js";

const OVERLAY_BORDER = 2;
const OVERLAY_BORDER_DOUBLE = OVERLAY_BORDER * 2;

export class FencedBlockInteractionHandler {
  static _initialized = false;
  static _selected = null;
  static _slideContainer = null;
  static _getMarkdown = null;
  static _setMarkdown = null;
  static _onDelete = null;
  static _onMoveArea = null;
  static _overlay = null;

  static init(getMarkdown, setMarkdown, { onDelete, onMoveArea } = {}) {
    if (this._initialized) return;
    this._initialized = true;
    this._getMarkdown = getMarkdown;
    this._setMarkdown = setMarkdown;
    this._onDelete = onDelete || null;
    this._onMoveArea = onMoveArea || null;

    document.addEventListener("mousedown", (e) => {
      if (!this._selected) return;
      if (e.target.closest(".fenced-block-overlay")) return;
      if (e.target.closest(".mermaid, pre") === this._selected) return;
      if (!this._selected.isConnected) {
        this._selected = null;
        if (this._overlay) this._overlay.style.display = "none";
        return;
      }
      this.deselect();
    });
  }

  static activate(slideContainer) {
    this._slideContainer = slideContainer;
    this._createOverlay(slideContainer);
    FencedBlockDragController.activate(slideContainer, {
      getSelected: () => this._selected,
      select: (el) => this.select(el),
      updateOverlay: () => this._updateOverlay(),
      getMarkdown: () => this._getMarkdown?.(),
      setMarkdown: (md) => this._setMarkdown?.(md),
      onMoveArea: (md) => this._onMoveArea?.(md),
      getOverlay: () => this._overlay,
      findInsertBeforeSlot: (areaEl, ref, y) => this._findInsertBeforeSlot(areaEl, ref, y),
      reorderBlock: (el, targetEl) => this._reorderBlock(el, targetEl),
      buildMoveMarkdown: (el, fromArea, toArea, insertBeforeEl) =>
        this._buildMoveMarkdown(el, fromArea, toArea, insertBeforeEl),
    });

    if (this._selected) {
      this._updateOverlay();
    }
  }

  static deactivate() {
    this.deselect();
    FencedBlockDragController.deactivate();
    this._removeOverlay();
    this._slideContainer = null;
  }

  // ── Overlay ─────────────────────────────────────────────────────────────

  static _createOverlay(container) {
    this._removeOverlay();
    const overlay = document.createElement("div");
    overlay.className = "fenced-block-overlay";
    overlay.style.display = "none";
    container.appendChild(overlay);
    this._overlay = overlay;
  }

  static _removeOverlay() {
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
  }

  static _updateOverlay() {
    const el = this._selected;
    const overlay = this._overlay;
    const grid = this._slideContainer;
    if (!el || !overlay || !grid) return;

    const elRect = el.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const scale = getStageScale();

    const left = (elRect.left - gridRect.left) / scale;
    const top = (elRect.top - gridRect.top) / scale;
    const w = elRect.width / scale;
    const h = elRect.height / scale;

    overlay.style.display = "block";
    overlay.style.left = `${left - OVERLAY_BORDER}px`;
    overlay.style.top = `${top - OVERLAY_BORDER}px`;
    overlay.style.width = `${w + OVERLAY_BORDER_DOUBLE}px`;
    overlay.style.height = `${h + OVERLAY_BORDER_DOUBLE}px`;
  }

  // ── Selection ───────────────────────────────────────────────────────────

  static select(el) {
    if (this._selected === el) {
      this._updateOverlay();
      return;
    }
    if (this._selected && !this._selected.isConnected) {
      this._selected = null;
      if (this._overlay) this._overlay.style.display = "none";
    } else if (this._selected) {
      this.deselect();
    }

    this._selected = el;
    el.classList.add("fenced-block-selected");
    this._updateOverlay();
  }

  static deselect() {
    if (this._selected) {
      if (this._selected.isConnected) {
        this._selected.classList.remove("fenced-block-selected");
      }
      this._selected = null;
    }
    if (this._overlay) {
      this._overlay.style.display = "none";
    }
  }

  static isSelected() {
    return !!this._selected;
  }

  /**
   * Resolve the fenced block element from a click target, accounting for
   * the SVG-inside-.mermaid structure and <code>-inside-<pre> structure.
   */
  static elementFromTarget(target) {
    return getDraggableFencedBlockElement(target);
  }

  // ── Delete ──────────────────────────────────────────────────────────────

  static deleteSelected() {
    const md = this._getMarkdown?.();
    if (!md || !this._selected) return;

    const block = this._findBlockForElement(this._selected, md);
    if (!block) return;

    const { markdown: updated } = removeFencedBlock(md, block);
    this.deselect();
    if (this._onDelete) {
      this._onDelete(updated);
    } else {
      this._setMarkdown?.(updated);
    }
  }

  // ── Markdown helpers ────────────────────────────────────────────────────

  /**
   * Find the FencedBlock entry matching a rendered DOM element by its
   * position among the area's fenced blocks.  The area's `.mermaid`/`<pre>`
   * elements render in markdown order, so the DOM ordinal maps 1:1 to the
   * parsed block list — no source-line math (which is relative to the
   * rendered area and drifts with directives/edits).
   */
  static _findBlockForElement(el, markdown) {
    const area = el.closest(".slide__area");
    if (!area) return null;
    const areaName = area.dataset.areaName || "main";
    const blocks = parseFencedBlocksInArea(markdown, areaName);
    const idx = getFencedBlockOrdinalIndexInArea(el);
    return idx >= 0 ? (blocks[idx] ?? null) : null;
  }

  /**
   * Build the updated markdown for a cross-area move, inserting before a
   * specific element in the target area (or appending).
   */
  static _buildMoveMarkdown(el, fromAreaName, toAreaName, insertBeforeEl) {
    const md = this._getMarkdown?.();
    if (!md || !el) return null;

    const block = this._findBlockForElement(el, md);
    if (!block) return null;

    // Compute the insert offset in the post-removal markdown.
    const { markdown: withoutBlock } = removeFencedBlock(md, block);
    const targetRange = getAreaContentRange(withoutBlock, toAreaName);
    if (targetRange.from === targetRange.to && targetRange.from === withoutBlock.length) {
      return null;
    }

    let insertAt = targetRange.to;
    if (insertBeforeEl) {
      const targetAreaEl = this._slideContainer?.querySelector(
        `.slide__area[data-area-name="${toAreaName}"]`,
      );
      if (targetAreaEl && insertBeforeEl.parentNode === targetAreaEl) {
        // Match the drop target by its DOM ordinal so the insert offset is
        // correct even for default (marker-less) @main areas.
        const targetIdx = getFencedBlockOrdinalIndexInArea(insertBeforeEl);
        const targetBlocks = parseFencedBlocksInArea(withoutBlock, toAreaName);
        if (targetIdx >= 0 && targetBlocks[targetIdx]) {
          insertAt = targetBlocks[targetIdx].start;
        }
      }
    }

    return insertFencedBlockAt(withoutBlock, insertAt, block.fullTag);
  }

  /**
   * Reorder a fenced block within its area by moving its text in the
   * markdown source.  `targetEl` is the element to insert before, or null
   * for end-of-area.
   */
  static _reorderBlock(el, targetEl) {
    const md = this._getMarkdown?.();
    if (!md || !el) return;

    const area = el.closest(".slide__area");
    const areaName = area?.dataset.areaName || "main";

    // Locate the source and target blocks by their DOM ordinal (the area's
    // fenced elements render in markdown order).  Re-finding the target by
    // its ordinal in the post-removal markdown avoids source-line drift when
    // the removed block comes before the target.
    const originalBlocks = parseFencedBlocksInArea(md, areaName);
    const srcIdx = getFencedBlockOrdinalIndexInArea(el);
    if (srcIdx < 0 || srcIdx >= originalBlocks.length) return;

    let targetIdx = -1;
    if (targetEl && targetEl.parentNode === area) {
      targetIdx = getFencedBlockOrdinalIndexInArea(targetEl);
    }

    const { markdown: withoutBlock } = removeFencedBlock(md, originalBlocks[srcIdx]);
    const range = getAreaContentRange(withoutBlock, areaName);
    if (range.from === range.to && range.from === withoutBlock.length) return;

    let insertAt = range.to;
    if (targetIdx >= 0) {
      const newBlocks = parseFencedBlocksInArea(withoutBlock, areaName);
      const adjustedIdx = srcIdx < targetIdx ? targetIdx - 1 : targetIdx;
      if (newBlocks[adjustedIdx]) {
        insertAt = newBlocks[adjustedIdx].start;
      }
    }

    const updated = insertFencedBlockAt(withoutBlock, insertAt, originalBlocks[srcIdx].fullTag);

    // Move the element in the DOM immediately for visual snap, then update
    // markdown.  The markdown update uses suppressOnChange so it won't
    // trigger a re-render that would undo the DOM manipulation.
    if (targetEl && targetEl.parentNode) {
      targetEl.parentNode.insertBefore(el, targetEl);
    } else if (area) {
      area.appendChild(el);
    }
    requestAnimationFrame(() => this._updateOverlay());

    this._setMarkdown?.(updated);
  }

  /**
   * Find which child element in an area the cursor Y position falls before.
   * Returns the element to insert before, or null to append at the end.
   */
  static _findInsertBeforeSlot(areaEl, referenceEl, clientY) {
    // Delegate to the drag controller's shared DragDropHelpers instance,
    // which owns the indicator-class exclusion list.  Falls back to a local
    // implementation if the controller hasn't been activated yet.
    const helpers = FencedBlockDragController._drop;
    if (helpers) return helpers.findInsertBeforeSlot(areaEl, referenceEl, clientY);
    return this._findInsertBeforeSlotFallback(areaEl, referenceEl, clientY);
  }

  static _findInsertBeforeSlotFallback(areaEl, referenceEl, clientY) {
    const allElements = [...areaEl.children].filter(
      (el) =>
        el !== referenceEl &&
        !el.classList.contains("fenced-block-drop-indicator") &&
        !el.classList.contains("editor-area-label"),
    );
    if (allElements.length === 0) return null;
    for (const el of allElements) {
      const rect = el.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (clientY < midY) return el;
    }
    return null;
  }
}
