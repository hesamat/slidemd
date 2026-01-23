/**
 * LayoutPicker
 * Manages the layout picker modal UI for selecting layouts in edit mode.
 * Handles modal display, grid rendering, and user interactions.
 */

import { LayoutData } from './layout-data.js';

export class LayoutPicker {
    static modal = null;
    static overlay = null;
    static closeBtn = null;
    static grid = null;
    static onSelectCallback = null;

    /**
     * Initialize the layout picker modal
     */
    static initModal() {
        this.modal = document.getElementById('layoutPickerModal');
        this.overlay = document.getElementById('layoutPickerOverlay');
        this.closeBtn = document.getElementById('closeLayoutPickerBtn');
        this.grid = document.getElementById('layoutPickerGrid');

        if (!this.modal || !this.grid) {
            return;
        }

        // Close modal handlers
        const closeModal = () => {
            this.modal.classList.add('webdeck-hidden');
        };

        this.overlay?.addEventListener('click', closeModal);
        this.closeBtn?.addEventListener('click', closeModal);

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.modal.classList.contains('webdeck-hidden')) {
                closeModal();
            }
        });

        // Generate layout options
        this.renderGrid();
    }

    /**
     * Render the layout options grid
     */
    static renderGrid() {
        if (!this.grid) {
            return;
        }

        const layouts = LayoutData.getAllLayouts();

        this.grid.innerHTML = layouts.map(layout => {
            const description = LayoutData.getDescription(layout);
            const preview = LayoutData.getPreviewHTML(layout);
            const formattedName = LayoutData.formatLayoutName(layout);

            return `
                <div class="layout-option" data-layout="${layout}" tabindex="0" role="button" aria-label="Select ${layout} layout">
                    <div class="layout-option__preview">
                        ${preview}
                    </div>
                    <div class="layout-option__name">${formattedName}</div>
                    <div class="layout-option__description">${description}</div>
                </div>
            `;
        }).join('');

        // Add click handlers to layout options
        const options = this.grid.querySelectorAll('.layout-option');

        options.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const layout = option.dataset.layout;
                this.selectLayout(layout);
            });

            // Keyboard navigation
            option.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const layout = option.dataset.layout;
                    this.selectLayout(layout);
                }
            });
        });
    }

    /**
     * Show the layout picker modal
     * @param {Function} onSelectCallback - Callback function called with selected layout name
     */
    static show(onSelectCallback) {
        if (!this.modal) {
            this.initModal();
        }

        this.onSelectCallback = onSelectCallback;
        this.modal.classList.remove('webdeck-hidden');

        // Focus first layout option
        const firstOption = this.modal?.querySelector('.layout-option');
        firstOption?.focus();
    }

    /**
     * Hide the layout picker modal
     */
    static hide() {
        if (this.modal) {
            this.modal.classList.add('webdeck-hidden');
        }
        this.onSelectCallback = null;
    }

    /**
     * Select a layout and call the callback
     */
    static selectLayout(layoutName) {
        // Call callback BEFORE hiding, since hide() clears the callback
        if (this.onSelectCallback) {
            this.onSelectCallback(layoutName);
        }
        this.hide();
    }
}
