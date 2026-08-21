/**
 * FencedBlockInteractionHandler
 *
 * Selection, overlay, and delete support for draggable fenced blocks
 * (Mermaid diagrams and code blocks) in edit mode.  Drag itself is handled by
 * FencedBlockDragController.
 *
 * Unlike images, fenced blocks stay in-flow (block-level) — there is no
 * free-flow positioning or resize in this version.  Drag is reorder /
 * cross-area only.
 */
import { FencedBlockDragController } from "./fenced-block-drag-controller.js";
import {
  removeFencedBlock,
  getAreaContentRange,
  getDraggableFencedBlockElement,
  parseFencedBlocksInArea,
  getFencedBlockOrdinalIndexInArea,
  findElementMarkdownPosition,
} from "./fenced-block-utils.js";
import { removeAndInsertBlock } from "../core/markdown-utils.js";
import { BlockInteractionHandler } from "../core/block-interaction-handler.js";
import { getStageScale } from "../../core/utils.js";

const OVERLAY_BORDER = 2;
const OVERLAY_BORDER_DOUBLE = OVERLAY_BORDER * 2;

export class FencedBlockInteractionHandler extends BlockInteractionHandler {
  static get _overlayClassName() {
    return "fenced-block-overlay";
  }

  static get _selectedClassName() {
    return "fenced-block-selected";
  }

  static get _DragController() {
    return FencedBlockDragController;
  }

  static _dragControllerContext() {
    return {
      getSelected: () => this._selected,
      select: (el) => this.select(el),
      updateOverlay: () => this._updateOverlay(),
      getMarkdown: () => this._getMarkdown?.(),
      setMarkdown: (md) => this._setMarkdown?.(md),
      onMoveArea: (md) => this._onMoveArea?.(md),
      getOverlay: () => this._overlay,
      findInsertBeforeSlot: (areaEl, ref, y) => this._findInsertBeforeSlot(areaEl, ref, y),
      reorderBlock: (el, targetEl) => this._reorderBlock(el, targetEl),
      buildMoveMarkdown: (el, fromAreaName, toAreaName, insertBeforeEl) =>
        this._buildMoveMarkdown(el, fromAreaName, toAreaName, insertBeforeEl),
    };
  }

  static elementFromTarget(target) {
    return getDraggableFencedBlockElement(target);
  }

  static _isOverlayOrChromeTarget(target) {
    return !!target.closest(".fenced-block-overlay");
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

  // ── Delete ──────────────────────────────────────────────────────────────

  static _findBlockForElement(el, markdown) {
    const area = el.closest(".slide__area");
    if (!area) return null;
    const areaName = area.dataset.areaName || "main";
    const blocks = parseFencedBlocksInArea(markdown, areaName);
    const idx = getFencedBlockOrdinalIndexInArea(el);
    return idx >= 0 ? (blocks[idx] ?? null) : null;
  }

  static _removeBlockFromMarkdown(block, markdown) {
    const { markdown: updated } = removeFencedBlock(markdown, block);
    return updated;
  }

  // ── Markdown helpers ────────────────────────────────────────────────────

  /**
   * Build the updated markdown for a cross-area move, inserting before a
   * specific element in the target area (or appending).
   */
  static _buildMoveMarkdown(el, fromAreaName, toAreaName, insertBeforeEl) {
    const md = this._getMarkdown?.();
    if (!md || !el) return null;

    const block = this._findBlockForElement(el, md);
    if (!block) return null;

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
        if (insertBeforeEl.matches(".mermaid, pre")) {
          const targetIdx = getFencedBlockOrdinalIndexInArea(insertBeforeEl);
          const targetBlocks = parseFencedBlocksInArea(withoutBlock, toAreaName);
          if (targetIdx >= 0 && targetBlocks[targetIdx]) {
            insertAt = targetBlocks[targetIdx].start;
          }
        } else {
          const pos = findElementMarkdownPosition(withoutBlock, insertBeforeEl);
          if (pos >= 0) {
            insertAt = pos;
          }
        }
      }
    }

    return removeAndInsertBlock(
      withoutBlock,
      { start: insertAt, end: insertAt, fullTag: block.fullTag },
      insertAt,
    );
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
    if (targetEl && targetEl.parentNode === area) {
      if (targetEl.matches(".mermaid, pre")) {
        if (targetIdx >= 0) {
          const newBlocks = parseFencedBlocksInArea(withoutBlock, areaName);
          const adjustedIdx = srcIdx < targetIdx ? targetIdx - 1 : targetIdx;
          if (newBlocks[adjustedIdx]) {
            insertAt = newBlocks[adjustedIdx].start;
          }
        }
      } else {
        const pos = findElementMarkdownPosition(withoutBlock, targetEl, {
          preferSourceLine: false,
        });
        if (pos >= 0) {
          insertAt = pos;
        }
      }
    }

    const updated = removeAndInsertBlock(
      withoutBlock,
      { start: insertAt, end: insertAt, fullTag: originalBlocks[srcIdx].fullTag },
      insertAt,
    );

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
