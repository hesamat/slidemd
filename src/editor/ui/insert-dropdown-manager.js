/**
 * InsertDropdownManager
 *
 * Manages the editor-header dropdowns:
 *   • "Slide"  — modify the current slide (Layout, Columns, Appearance, Insert)
 *   • "Slides" — slide lifecycle (New, Duplicate, Delete)
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

    get elements() { return this.ctrl.elements; }

    /**
     * Initialize the editor's "Format" dropdown (modify the current slide).
     *
     * The slide-lifecycle dropdown used to live here too but has been
     * replaced by a right-click context menu on the slide thumbnails plus
     * a pinned "+ Add Slide" button below the thumbnail list — see
     * `slide-thumbnails.js`.
     */
    init() {
        this._dropdowns = [
            { btn: this.elements.insertDropdownBtn, content: this.elements.insertDropdownContent },
        ].filter((d) => d.btn && d.content);

        this._wireDropdowns();
    }

    /**
     * Close every managed dropdown and reset its trigger's `aria-expanded`.
     */
    _closeAll() {
        for (const d of this._dropdowns) {
            d.content.classList.add('webdeck-hidden');
            d.btn.setAttribute('aria-expanded', 'false');
        }
    }

    /**
     * Wire up open/close behaviour + per-item action handlers for every
     * managed dropdown.  Opening one closes the others so the UI stays tidy.
     */
    _wireDropdowns() {
        for (const d of this._dropdowns) {
            const { btn, content } = d;

            // Toggle open/closed when the trigger is clicked.  We close every
            // other dropdown first so only one panel is visible at a time.
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const wasOpen = !content.classList.contains('webdeck-hidden');
                this._closeAll();
                if (!wasOpen) {
                    content.classList.remove('webdeck-hidden');
                    btn.setAttribute('aria-expanded', 'true');
                }
            });

            // Wire up every item in this dropdown to its edit-controller
            // action.  Picking an item always closes the panel.
            content.querySelectorAll('[data-insert-action]').forEach((item) => {
                item.addEventListener('click', () => {
                    content.classList.add('webdeck-hidden');
                    btn.setAttribute('aria-expanded', 'false');
                    this._dispatch(item.dataset.insertAction);
                });
            });
        }

        // Close on any click that lands outside a managed dropdown.
        document.addEventListener('click', () => this._closeAll());
    }

    /**
     * Map a `data-insert-action` value to the corresponding edit-controller
     * method.  Centralized here so the dropdown shares one action table.
     * @param {string} action
     */
    _dispatch(action) {
        switch (action) {
            case 'layout':
                this.ctrl.showLayoutPickerForCurrentSlide();
                break;
            case 'adjust-columns':
                this.ctrl.gridResizer.toggle();
                break;
            case 'image':
                this.ctrl.pickAndInsertImage();
                break;
            case 'mermaid':
                this.ctrl.mermaidHelper.toggle();
                break;
            case 'background':
                this.ctrl.pickBackground();
                break;
            case 'theme':
                // Per-slide theme (`theme:` directive on the current slide)
                this.ctrl.themeManager.toggle();
                break;
            case 'area-style':
                this.ctrl.openSlideStylePanel();
                break;
        }
    }
}
