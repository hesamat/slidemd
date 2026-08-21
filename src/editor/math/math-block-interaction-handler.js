/**
 * MathBlockInteractionHandler
 *
 * Selection, overlay, and delete handling for KaTeX display-math blocks in
 * edit mode.  Display math is block-level and stays in-flow, so the UX is
 * intentionally close to fenced-block drag.
 */
import { getStageScale } from "../../core/utils.js";
import { BlockInteractionHandler } from "../core/block-interaction-handler.js";
import { getAreaContentRange, findMarkdownPosition } from "../core/markdown-utils.js";
import { MathBlockDragController } from "./math-block-drag-controller.js";
import {
  parseDisplayMathBlocksInArea,
  getDisplayMathOrdinalIndexInArea,
  getDraggableDisplayMathElement,
  removeDisplayMathBlock,
  insertDisplayMathBlockAt,
} from "./math-block-utils.js";

const OVERLAY_BORDER = 2;
const OVERLAY_BORDER_DOUBLE = OVERLAY_BORDER * 2;

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
      findInsertBeforeSlot: (areaEl, ref, y) => this._findInsertBeforeSlot(areaEl, ref, y),
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
    const blocks = parseDisplayMathBlocksInArea(markdown, areaName);
    const idx = getDisplayMathOrdinalIndexInArea(el);
    return idx >= 0 ? (blocks[idx] ?? null) : null;
  }

  static _removeBlockFromMarkdown(block, markdown) {
    const { markdown: updated } = removeDisplayMathBlock(markdown, block);
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

    const { markdown: withoutBlock } = removeDisplayMathBlock(md, block);
    const targetRange = getAreaContentRange(withoutBlock, toAreaName);
    if (targetRange.from === targetRange.to && targetRange.from === withoutBlock.length) {
      return null;
    }

    let insertAt = targetRange.to;
    if (insertBeforeEl) {
      const targetAreaEl = this._slideContainer?.querySelector(
        `.slide__area[data-area-name="${toAreaName}"]`,
      );
      if (targetAreaEl && targetAreaEl.contains(insertBeforeEl)) {
        const targetMathEl =
          insertBeforeEl.closest(".katex-display") ||
          insertBeforeEl.querySelector?.(".katex-display");
        if (
          targetMathEl &&
          !targetMathEl.closest(".text-block, .editor-area-label, .editor-slide-warning")
        ) {
          const targetIdx = getDisplayMathOrdinalIndexInArea(targetMathEl);
          const targetBlocks = parseDisplayMathBlocksInArea(withoutBlock, toAreaName);
          if (targetIdx >= 0 && targetBlocks[targetIdx]) {
            insertAt = targetBlocks[targetIdx].start;
          }
        } else {
          const pos = findMarkdownPosition(withoutBlock, insertBeforeEl, {
            preferSourceLine: false,
          });
          if (pos >= 0) {
            insertAt = pos;
          }
        }
      }
    }

    return insertDisplayMathBlockAt(withoutBlock, insertAt, block.fullTag);
  }

  /**
   * Reorder a display-math block within its area.
   */
  static _reorderBlock(el, targetEl) {
    const md = this._getMarkdown?.();
    if (!md || !el) return;

    const area = el.closest(".slide__area");
    const areaName = area?.dataset.areaName || "main";

    const originalBlocks = parseDisplayMathBlocksInArea(md, areaName);
    const srcIdx = getDisplayMathOrdinalIndexInArea(el);
    if (srcIdx < 0 || srcIdx >= originalBlocks.length) return;

    let targetMathEl =
      targetEl?.closest?.(".katex-display") || targetEl?.querySelector?.(".katex-display");
    if (targetMathEl?.closest?.(".text-block, .editor-area-label, .editor-slide-warning")) {
      targetMathEl = null;
    }
    const targetIdx =
      targetMathEl && area?.contains?.(targetMathEl)
        ? getDisplayMathOrdinalIndexInArea(targetMathEl)
        : -1;

    const { markdown: withoutBlock } = removeDisplayMathBlock(md, originalBlocks[srcIdx]);
    const range = getAreaContentRange(withoutBlock, areaName);
    if (range.from === range.to && range.from === withoutBlock.length) return;

    let insertAt = range.to;
    if (targetEl && area && area.contains(targetEl)) {
      if (targetMathEl) {
        if (targetIdx >= 0) {
          const newBlocks = parseDisplayMathBlocksInArea(withoutBlock, areaName);
          const adjustedIdx = srcIdx < targetIdx ? targetIdx - 1 : targetIdx;
          if (newBlocks[adjustedIdx]) {
            insertAt = newBlocks[adjustedIdx].start;
          }
        }
      } else {
        const pos = findMarkdownPosition(withoutBlock, targetEl, { preferSourceLine: false });
        if (pos >= 0) {
          insertAt = pos;
        }
      }
    }

    const updated = insertDisplayMathBlockAt(
      withoutBlock,
      insertAt,
      originalBlocks[srcIdx].fullTag,
    );

    // Move the math in the DOM immediately for visual snap, then update
    // markdown.  The markdown update uses suppressOnChange so it won't
    // trigger a re-render that would undo the DOM manipulation.
    //
    // If the display math is the only content of its parent block (e.g. a
    // standalone `<p>`), move the whole parent.  Otherwise move the math
    // element itself; the preview will correct the wrapping on the next
    // full re-render.
    const displayParent = el.parentElement;
    const isStandaloneDisplay =
      displayParent &&
      displayParent !== area &&
      displayParent.textContent?.trim() === el.textContent?.trim();
    const blockEl = isStandaloneDisplay ? displayParent : el;
    if (targetEl && targetEl.parentNode === area) {
      area.insertBefore(blockEl, targetEl);
    } else if (area) {
      area.appendChild(blockEl);
    }
    requestAnimationFrame(() => this._updateOverlay());

    this._setMarkdown?.(updated);
  }

  /**
   * Find which child element in an area the cursor Y position falls before.
   */
  static _findInsertBeforeSlot(areaEl, referenceEl, clientY) {
    const helpers = MathBlockDragController._drop;
    if (helpers) return helpers.findInsertBeforeSlot(areaEl, referenceEl, clientY);
    return this._findInsertBeforeSlotFallback(areaEl, referenceEl, clientY);
  }

  static _findInsertBeforeSlotFallback(areaEl, referenceEl, clientY) {
    const allElements = [...areaEl.children].filter(
      (el) =>
        el !== referenceEl &&
        !el.classList.contains("math-block-drop-indicator") &&
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
