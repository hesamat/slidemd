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
   * @param {HTMLElement} _el
   * @param {string} _markdown
   * @returns {{start:number, end:number, fullTag:string}|null}
   */
  static _findBlockForElement(_el, _markdown) {
    return null;
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

  // ── Lifecycle ───────────────────────────────────────────────────────────

  static init(getMarkdown, setMarkdown, { onDelete, onMoveArea } = {}) {
    if (this._initialized) return;
    this._initialized = true;
    this._getMarkdown = getMarkdown;
    this._setMarkdown = setMarkdown;
    this._onDelete = onDelete || null;
    this._onMoveArea = onMoveArea || null;

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
    // Subclasses with overlays must implement geometry updates.
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
