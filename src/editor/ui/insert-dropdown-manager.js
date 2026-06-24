/**
 * InsertDropdownManager
 *
 * Manages the Insert dropdown menu (Layout / Image / Mermaid / etc.).
 * Extracted from EditController.
 */

export class InsertDropdownManager {
    /** @param {import('./edit-controller.js').EditController} ctrl */
    constructor(ctrl) {
        this.ctrl = ctrl;
    }

    get elements() { return this.ctrl.elements; }

    /**
     * Initialize the insert dropdown button and item actions.
     */
    init() {
        const btn = this.elements.insertDropdownBtn;
        const content = this.elements.insertDropdownContent;
        if (!btn || !content) return;

        // Toggle dropdown on button click
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = !content.classList.contains('webdeck-hidden');
            content.classList.toggle('webdeck-hidden');
            btn.setAttribute('aria-expanded', String(!isOpen));
        });

        // Dropdown item actions
        content.querySelectorAll('[data-insert-action]').forEach((item) => {
            item.addEventListener('click', () => {
                content.classList.add('webdeck-hidden');
                btn.setAttribute('aria-expanded', 'false');
                const action = item.dataset.insertAction;
                if (action === 'layout') {
                    this.ctrl.showLayoutPickerForCurrentSlide();
                } else if (action === 'adjust-columns') {
                    this.ctrl.gridResizer.toggle();
                } else if (action === 'image') {
                    this.ctrl.pickAndInsertImage();
                } else if (action === 'mermaid') {
                    this.ctrl.mermaidHelper.toggle();
                } else if (action === 'background') {
                    this.ctrl.pickBackground();
                } else if (action === 'theme') {
                    this.ctrl.themeManager.toggle();
                }
            });
        });

        // Close on outside click
        document.addEventListener('click', () => {
            content.classList.add('webdeck-hidden');
            btn.setAttribute('aria-expanded', 'false');
        });
    }
}
