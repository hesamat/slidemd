/**
 * LayoutData
 * Manages layout templates, descriptions, and grid template data.
 * Provides access to layout configuration without UI concerns.
 */

import LAYOUTS from './data/layouts.json' with { type: 'json' };

export class LayoutData {
    /**
     * Get the markdown template for a layout
     */
    static getTemplate(layoutName) {
        return LAYOUTS.layouts[layoutName]?.template || LAYOUTS.layouts.default?.template;
    }

    /**
     * Get all available layout names (excluding default)
     */
    static getAllLayouts() {
        return Object.keys(LAYOUTS.layouts).filter(key => key !== 'default');
    }

    /**
     * Get layout description
     */
    static getDescription(layoutName) {
        return LAYOUTS.layouts[layoutName]?.description || '';
    }

    /**
     * Get layout preview HTML
     */
    static getPreviewHTML(layoutName) {
        return LAYOUTS.layouts[layoutName]?.preview || '<div style="grid-area: main"></div>';
    }

    /**
     * Get grid template for a layout (for LayoutParser compatibility)
     */
    static getGridTemplate(layoutName) {
        return LAYOUTS.layouts[layoutName]?.gridTemplate || null;
    }

    /**
     * Get all layout presets as an object (for LayoutParser compatibility)
     */
    static getPresets() {
        return Object.fromEntries(
            Object.entries(LAYOUTS.layouts).map(([key, value]) => [key, value.gridTemplate])
        );
    }

    /**
     * Format layout name for display (e.g., "two-column" -> "Two Column")
     */
    static formatLayoutName(layoutName) {
        return layoutName.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    /**
     * Check if a layout exists
     */
    static hasLayout(layoutName) {
        return layoutName in LAYOUTS.layouts;
    }
}
