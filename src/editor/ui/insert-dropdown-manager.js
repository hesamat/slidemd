/**
 * InsertDropdownManager
 *
 * Manages the editor-header dropdowns:
 *   • Slide actions  — icon-only trigger; New / Duplicate / Delete on the
 *                      current slide
 *   • "Format"       — modify the current slide (Layout, Columns,
 *                      Appearance, Insert)
 *
 * Each dropdown is a `<button>` paired with a `<div>` content panel.  Both
 * follow the same DOM pattern (`.segmented.insert-dropdown` with a button
 * carrying `aria-controls` pointing at a content div with the
 * `.insert-dropdown__content` class), so the wiring is shared.
 *
 * Extracted from EditController.
 */

export class InsertDropdownManager {
  /** @param {import('./edit-controller.js').EditController} ctrl */
  constructor(ctrl) {
    this.ctrl = ctrl;
  }

  get elements() {
    return this.ctrl.elements;
  }

  /**
   * Initialize the editor's header dropdowns.
   *
   * The slide-lifecycle menu (New / Duplicate / Delete) is also
   * reachable from the right-click context menu on slide thumbnails
   * and from the keyboard shortcuts (Alt+N / Alt+D / Alt+⌫) — this
   * dropdown is the in-panel UI surface for the same actions.
   */
  init() {
    this._dropdowns = [
      {
        btn: this.elements.slideActionsDropdownBtn,
        content: this.elements.slideActionsDropdownContent,
        attr: "data-slide-action",
      },
      {
        btn: this.elements.insertDropdownBtn,
        content: this.elements.insertDropdownContent,
        attr: "data-insert-action",
      },
    ].filter((d) => d.btn && d.content);

    this._wireDropdowns();
  }

  /**
   * Close every managed dropdown and reset its trigger's `aria-expanded`.
   */
  _closeAll() {
    for (const d of this._dropdowns) {
      d.content.classList.add("webdeck-hidden");
      d.btn.setAttribute("aria-expanded", "false");
    }
  }

  /**
   * Wire up open/close behaviour + per-item action handlers for every
   * managed dropdown.  Opening one closes the others so the UI stays tidy.
   */
  _wireDropdowns() {
    for (const d of this._dropdowns) {
      const { btn, content, attr } = d;

      // Toggle open/closed when the trigger is clicked.  We close every
      // other dropdown first so only one panel is visible at a time.
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasOpen = !content.classList.contains("webdeck-hidden");
        this._closeAll();
        if (!wasOpen) {
          content.classList.remove("webdeck-hidden");
          btn.setAttribute("aria-expanded", "true");
        }
      });

      // Wire up every item in this dropdown to its edit-controller
      // action.  Picking an item always closes the panel.  Each
      // dropdown's items are identified by its own data-* attribute
      // (data-insert-action for Format, data-slide-action for the
      // slide-management menu) so the two menus can share a single
      // dispatcher without name collisions.
      content.querySelectorAll(`[${attr}]`).forEach((item) => {
        item.addEventListener("click", () => {
          content.classList.add("webdeck-hidden");
          btn.setAttribute("aria-expanded", "false");
          this._dispatch(item.getAttribute(attr));
        });
      });
    }

    // Close on any click that lands outside a managed dropdown.
    document.addEventListener("click", () => this._closeAll());
  }

  /**
   * Map a dropdown action value to the corresponding edit-controller
   * method.  Centralized here so the two dropdowns share one action
   * table.
   * @param {string} action
   */
  _dispatch(action) {
    switch (action) {
      // Format dropdown
      case "layout":
        this.ctrl.showLayoutPickerForCurrentSlide();
        break;
      case "adjust-columns":
        this.ctrl.gridResizer.toggle();
        break;
      case "image":
        this.ctrl.pickAndInsertImage();
        break;
      case "mermaid":
        this.ctrl.mermaidHelper.toggle();
        break;
      case "background":
        this.ctrl.pickBackground();
        break;
      case "theme":
        // Per-slide theme (`theme:` directive on the current slide)
        this.ctrl.themeManager.toggle();
        break;
      case "area-style":
        this.ctrl.openSlideStylePanel();
        break;
      // Slide-management dropdown
      case "new":
        // Show the layout picker so the user can pick a layout.
        // The new slide is inserted after the current one (the
        // standard `addSlideWithLayout` behaviour).  This is
        // different from the footer "+ Add Slide" button, which
        // navigates to the last slide first so the new slide
        // ends up at the end of the deck.
        this.ctrl.showLayoutPicker();
        break;
      case "duplicate":
        this.ctrl.duplicateSlide();
        break;
      case "delete":
        this.ctrl.deleteSlide();
        break;
    }
  }
}
