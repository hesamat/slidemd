import { getStageScale } from "../../core/utils.js";
import {
  getAreaContentRange,
  findMarkdownPosition,
  removeAndInsertBlock,
} from "./markdown-utils.js";

/**
 * BlockInteractionHandler
 *
 * Base class for interaction handlers used in edit mode (images, fenced
 * blocks, and future block types).  It owns shared selection state, overlay
 * lifecycle, deselection on outside clicks, and delete handling.
 *
 * Subclasses override hooks for:
 *   - overlay CSS class / inner HTML
 *   - selected CSS class
 *   - drag controller class and its context
 *   - block lookup and markdown removal
 *   - extra select/deselect side effects (e.g. property panels)
 */
export class BlockInteractionHandler {
  static _initialized = false;
  static _selected = null;
  static _slideContainer = null;
  static _getMarkdown = null;
  static _setMarkdown = null;
  static _onDelete = null;
  static _onMoveArea = null;
  static _overlay = null;

  /** @returns {number} Border width (in px) used when sizing the overlay. */
  static get _overlayBorder() {
    return 2;
  }

  // ── Hooks ───────────────────────────────────────────────────────────────

  /** @returns {string} CSS class for the overlay element. */
  static get _overlayClassName() {
    return "";
  }

  /** @returns {string} Initial innerHTML for the overlay. */
  static get _overlayInnerHTML() {
    return "";
  }

  /** @returns {string} CSS class added to the selected element. */
  static get _selectedClassName() {
    return "";
  }

  /**
   * Return the drag controller class to activate/deactivate.
   * @returns {typeof import("./block-drag-controller.js").BlockDragController|null}
   */
  static get _DragController() {
    return null;
  }

  /**
   * Return the block element matching a click target (or null).
   * @param {EventTarget} target
   * @returns {HTMLElement|null}
   */
  static elementFromTarget(_target) {
    return null;
  }

  /**
   * Return true if the mousedown target is inside an overlay/editor chrome
   * that should not deselect this handler's selected block.
   * @param {EventTarget} _target
   * @returns {boolean}
   */
  static _isOverlayOrChromeTarget(_target) {
    return false;
  }

  /**
   * Called after an element is selected (after the selected class is added
   * and the overlay is shown).
   * @param {HTMLElement} _el
   */
  static _onSelectExtra(_el) {}

  /**
   * Called during deselect before the selected class is removed and the
   * overlay is hidden.
   */
  static _onDeselectExtra() {}

  /**
   * Find the parsed block representing this DOM element.
   * Subclasses may override this; the default uses _parseBlocksInArea and
   * _getBlockOrdinalIndexInArea.
   * @param {HTMLElement} el
   * @param {string} markdown
   * @returns {{start:number, end:number, fullTag:string}|null}
   */
  static _findBlockForElement(el, markdown) {
    const area = el?.closest?.(".slide__area");
    if (!area) return null;
    const areaName = area.dataset.areaName || "main";
    const blocks = this._parseBlocksInArea(markdown, areaName);
    const idx = this._getBlockOrdinalIndexInArea(el);
    return idx >= 0 ? (blocks[idx] ?? null) : null;
  }

  /**
   * Remove a parsed block from markdown and return the updated text.
   * @param {{start:number, end:number, fullTag:string}} block
   * @param {string} markdown
   * @returns {string}
   */
  static _removeBlockFromMarkdown(block, markdown) {
    return markdown.slice(0, block.start) + markdown.slice(block.end);
  }

  /**
   * Parse all blocks of this handler's type within an area.
   * @param {string} _markdown
   * @param {string} _areaName
   * @returns {Array<{start:number, end:number, fullTag:string}>}
   */
  static _parseBlocksInArea(_markdown, _areaName) {
    return [];
  }

  /**
   * Return the ordinal index of a block element among draggable blocks in its
   * parent area.
   * @param {HTMLElement} _el
   * @returns {number}
   */
  static _getBlockOrdinalIndexInArea(_el) {
    return -1;
  }

  /**
   * If `targetEl` is a block of this handler's type, return its ordinal index
   * in the target area.  This is used to insert before the corresponding
   * markdown block.  Return -1 if the target is not a block of this type.
   * @param {HTMLElement} _targetEl
   * @returns {number}
   */
  static _getTargetBlockIndexInArea(_targetEl) {
    return -1;
  }

  /**
   * Find the markdown character position of a target element inside its area.
   * Subclasses can override to control whether `data-source-line` is preferred.
   * @param {string} markdown
   * @param {HTMLElement} element
   * @returns {number}
   */
  static _findMarkdownPosition(markdown, element) {
    return findMarkdownPosition(markdown, element, { preferSourceLine: false });
  }

  /**
   * Insert a block's fullTag into markdown at the given offset.
   * @param {string} markdown
   * @param {number} insertAt
   * @param {string} blockText
   * @returns {string}
   */
  static _insertBlockAt(markdown, insertAt, blockText) {
    return removeAndInsertBlock(
      markdown,
      { start: insertAt, end: insertAt, fullTag: blockText },
      insertAt,
      blockText,
    );
  }

  /**
   * Move a block's DOM representation after reorder.  Subclasses with special
   * wrapping (e.g., display math inside a mixed paragraph) can override.
   * @param {HTMLElement} sourceEl
   * @param {HTMLElement|null} targetEl
   * @param {HTMLElement} areaEl
   */
  static _onAfterReorder(sourceEl, targetEl, areaEl) {
    if (targetEl && targetEl.parentNode === areaEl) {
      areaEl.insertBefore(sourceEl, targetEl);
    } else {
      areaEl.appendChild(sourceEl);
    }
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

    const withoutBlock = this._removeBlockFromMarkdown(block, md);
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
        const targetIdx = this._getTargetBlockIndexInArea(insertBeforeEl);
        if (targetIdx >= 0) {
          const targetBlocks = this._parseBlocksInArea(withoutBlock, toAreaName);
          if (targetBlocks[targetIdx]) {
            insertAt = targetBlocks[targetIdx].start;
          }
        } else {
          const pos = this._findMarkdownPosition(withoutBlock, insertBeforeEl);
          if (pos >= 0) {
            insertAt = pos;
          }
        }
      }
    }

    return this._insertBlockAt(withoutBlock, insertAt, block.fullTag);
  }

  /**
   * Reorder a block within its area.
   */
  static _reorderBlock(el, targetEl) {
    const md = this._getMarkdown?.();
    if (!md || !el) return;

    const area = el.closest(".slide__area");
    const areaName = area?.dataset.areaName || "main";

    const originalBlocks = this._parseBlocksInArea(md, areaName);
    const srcIdx = this._getBlockOrdinalIndexInArea(el);
    if (srcIdx < 0 || srcIdx >= originalBlocks.length) return;

    const targetIdx =
      targetEl && area && area.contains(targetEl) ? this._getTargetBlockIndexInArea(targetEl) : -1;

    const withoutBlock = this._removeBlockFromMarkdown(originalBlocks[srcIdx], md);
    const range = getAreaContentRange(withoutBlock, areaName);
    if (range.from === range.to && range.from === withoutBlock.length) return;

    let insertAt = range.to;
    if (targetEl && area && area.contains(targetEl)) {
      if (targetIdx >= 0) {
        const newBlocks = this._parseBlocksInArea(withoutBlock, areaName);
        const adjustedIdx = srcIdx < targetIdx ? targetIdx - 1 : targetIdx;
        if (newBlocks[adjustedIdx]) {
          insertAt = newBlocks[adjustedIdx].start;
        }
      } else {
        const pos = this._findMarkdownPosition(withoutBlock, targetEl);
        if (pos >= 0) {
          insertAt = pos;
        }
      }
    }

    const updated = this._insertBlockAt(withoutBlock, insertAt, originalBlocks[srcIdx].fullTag);

    this._onAfterReorder(el, targetEl, area);
    requestAnimationFrame(() => this._updateOverlay());

    this._setMarkdown?.(updated);
  }

  /**
   * Find which child element in an area the cursor Y position falls before.
   */
  static _findInsertBeforeSlot(areaEl, referenceEl, clientY) {
    const helpers = this._DragController?._drop;
    if (helpers) return helpers.findInsertBeforeSlot(areaEl, referenceEl, clientY);
    return this._findInsertBeforeSlotFallback(areaEl, referenceEl, clientY);
  }

  static _findInsertBeforeSlotFallback(areaEl, referenceEl, clientY) {
    const indicatorClass = this._DragController?._indicatorClassName || "block-drop-indicator";
    const allElements = [...areaEl.children].filter(
      (el) =>
        el !== referenceEl &&
        !el.classList.contains(indicatorClass) &&
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

  // ── Lifecycle ───────────────────────────────────────────────────────────

  static init(getMarkdown, setMarkdown, { onDelete, onMoveArea, onPreviewReady } = {}) {
    if (this._initialized) return;
    this._initialized = true;
    this._getMarkdown = getMarkdown;
    this._setMarkdown = setMarkdown;
    this._onDelete = onDelete || null;
    this._onMoveArea = onMoveArea || null;
    this._onPreviewReady = onPreviewReady || null;

    document.addEventListener("mousedown", (e) => {
      if (!this._selected) return;
      if (this._isOverlayOrChromeTarget(e.target)) return;
      if (this.elementFromTarget(e.target) === this._selected) return;
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
    this._DragController?.activate(slideContainer, this._dragControllerContext());

    if (this._selected && !this._slideContainer.contains(this._selected)) {
      this.deselect();
    }
    if (this._selected) {
      this._updateOverlay();
    }
  }

  static deactivate() {
    this.deselect();
    this._DragController?.deactivate();
    this._removeOverlay();
    this._slideContainer = null;
  }

  /**
   * Build the context object passed to the drag controller.  Subclasses
   * compose the specific callbacks needed by their drag controller.
   * @returns {object}
   */
  static _dragControllerContext() {
    return {};
  }

  // ── Overlay ─────────────────────────────────────────────────────────────

  static _createOverlay(container) {
    this._removeOverlay();
    const overlay = document.createElement("div");
    overlay.className = this._overlayClassName;
    if (this._overlayInnerHTML) {
      overlay.innerHTML = this._overlayInnerHTML;
    }
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

    const border = this._overlayBorder;
    const double = border * 2;
    const elRect = el.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const scale = getStageScale();

    const left = (elRect.left - gridRect.left) / scale;
    const top = (elRect.top - gridRect.top) / scale;
    const w = elRect.width / scale;
    const h = elRect.height / scale;

    overlay.style.display = "block";
    overlay.style.left = `${left - border}px`;
    overlay.style.top = `${top - border}px`;
    overlay.style.width = `${w + double}px`;
    overlay.style.height = `${h + double}px`;
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
    if (this._selectedClassName) {
      el.classList.add(this._selectedClassName);
    }
    this._updateOverlay();
    this._onSelectExtra(el);
  }

  static deselect() {
    this._onDeselectExtra();
    if (this._selected) {
      if (this._selected.isConnected && this._selectedClassName) {
        this._selected.classList.remove(this._selectedClassName);
      }
      this._selected = null;
    }
    if (this._overlay) {
      this._overlay.style.display = "none";
    }
  }

  static deselectIfOrphaned() {
    if (this._selected && this._slideContainer && !this._slideContainer.contains(this._selected)) {
      this.deselect();
    }
  }

  static isSelected() {
    return !!this._selected;
  }

  static getSelected() {
    return this._selected;
  }

  // ── Delete ──────────────────────────────────────────────────────────────

  static deleteSelected() {
    const md = this._getMarkdown?.();
    if (!md || !this._selected) return;

    const block = this._findBlockForElement(this._selected, md);
    if (!block) return;

    const updated = this._removeBlockFromMarkdown(block, md);
    this.deselect();
    if (this._onDelete) {
      this._onDelete(updated);
    } else {
      this._setMarkdown?.(updated);
    }
  }
}
