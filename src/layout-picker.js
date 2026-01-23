/**
 * LayoutPicker
 * Manages the layout picker modal UI for selecting layouts in edit mode.
 * Handles modal display, grid rendering, and user interactions.
 */

import { LayoutData } from './layout-data.js';
import LAYOUTS from './data/layouts.json' with { type: 'json' };

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
            const gridStyle = this.getGridTemplateStyle(layout);

            return `
                <div class="layout-option" data-layout="${layout}" tabindex="0" role="button" aria-label="Select ${layout} layout">
                    <div class="layout-option__preview" style="${gridStyle}">
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
     * Get grid template style for preview rendering
     * Converts grid shorthand like '"main" / 1fr' to proper grid property 'grid: 'main' 1fr / 1fr'
     * Uses single quotes to avoid conflicts with HTML attribute double quotes
     * Scales down fixed pixel widths for preview contexts
     */
    static getGridTemplateStyle(layoutName) {
        const gridTemplate = LAYOUTS.layouts[layoutName]?.gridTemplate;
        if (!gridTemplate) return '';

        // The grid property needs row heights: "areas" row-height / columns
        // If format is '"areas" / cols', convert to '"areas" 1fr / cols'
        if (gridTemplate.includes('/')) {
            const [areasPart, colsPart] = gridTemplate.split('/');
            const areas = areasPart.trim();
            let cols = colsPart.trim();

            // Scale down fixed pixel widths for previews (e.g., 300px -> 60px)
            cols = cols.replace(/(\d+)px/g, (_, pixels) => {
                const scaled = Math.round(parseInt(pixels) / 5);
                return `${scaled}px`;
            });

            // If areasPart doesn't include row height (no space after closing quote), add 1fr for each row
            if (areas.endsWith('"') || areas.endsWith("'")) {
                // Convert double quotes to single quotes
                const areasSingle = areas.replace(/"/g, "'");

                // Parse the grid template areas
                // Each quoted string is a row definition (may contain multiple areas)
                // e.g., "'sidebar main'" is one row with two areas
                // e.g., "'header' 'main'" are two rows
                const rowDefinitions = [];

                // Match complete quoted strings (rows)
                const rowRegex = /'([^']+)'/g;
                let match;

                while ((match = rowRegex.exec(areasSingle)) !== null) {
                    const fullRowDef = match[0]; // e.g., 'sidebar main' or 'header'
                    rowDefinitions.push(fullRowDef);
                }

                // Each row definition needs a height
                const rowsWithHeights = rowDefinitions.map(rowDef => `${rowDef} 1fr`).join(' ');
                return `grid: ${rowsWithHeights} / ${cols};`;
            }
            // Convert any double quotes to single quotes for HTML compatibility
            return `grid: ${gridTemplate.replace(/"/g, "'")};`;
        }

        // Convert any double quotes to single quotes for HTML compatibility
        return `grid: ${gridTemplate.replace(/"/g, "'")};`;
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
