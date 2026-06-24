/**
 * LayoutManager
 *
 * Handles layout picker, layout application, and layout compatibility checks.
 * Extracted from EditController.
 */
import { MarkdownParser } from '../../data/markdown-parser.js';
import { Notification } from '../../renderer/notification.js';
import { LayoutParser } from '../../data/layout-parser.js';
import { LayoutPicker } from './layout-picker.js';
import { updateLayoutDirective } from '../core/directive-utils.js';

export class LayoutManager {
    /** @param {import('./edit-controller.js').EditController} ctrl */
    constructor(ctrl) {
        this.ctrl = ctrl;
    }

    get markdownEditor() { return this.ctrl.markdownEditor; }
    get deck() { return this.ctrl.deck; }
    get currentSlideIndex() { return this.ctrl.currentSlideIndex; }
    get slideOps() { return this.ctrl.slideOps; }

    /**
     * Show the layout picker for adding a new slide.
     */
    showPicker() {
        LayoutPicker.show((layoutName) => this.slideOps.addSlideWithLayout(layoutName));
    }

    /**
     * Show the layout picker for the current slide.
     */
    showPickerForCurrentSlide() {
        LayoutPicker.show((layoutName) => this.applyToCurrentSlide(layoutName));
    }

    /**
     * Apply a layout to the current slide, with compatibility check and auto-area creation.
     */
    async applyToCurrentSlide(layoutName) {
        if (!this.markdownEditor) return;

        const markdown = this.markdownEditor.getValue();
        const warning = this.getCompatibilityWarning(markdown, layoutName);
        if (warning) {
            const confirmed = await Notification.showModal({
                title: 'Layout may break this slide',
                message: warning,
                buttons: [
                    { label: 'Cancel', isPrimary: false, resolvesTo: false },
                    { label: 'Apply anyway', isPrimary: true, resolvesTo: true },
                ],
                focusPrimary: true,
                closeResolvesTo: false,
            });

            if (!confirmed) return;
        }

        let updatedMarkdown = updateLayoutDirective(markdown, layoutName);

        // Auto-add missing required areas (e.g. @secondary for three-column)
        const parser = new MarkdownParser();
        const currentAreas = parser.parseAreas(updatedMarkdown);
        const resolvedLayout = LayoutParser.parse(LayoutParser.resolvePreset(layoutName), {
            fallbackAreas: Object.keys(currentAreas).length ? Object.keys(currentAreas) : ["main"],
        });
        const requiredAreas = resolvedLayout.orderedAreas || [];

        let appendedContent = '';
        const areaPlaceholders = {
            secondary: '\n@secondary\n\n### Column Three\n\nContent for third column\n',
            media: '\n@media\n\n### Column Two\n\nContent for second column\n',
            sidebar: '\n@sidebar\n\n### Sidebar\n\nSidebar content\n',
            main: '\n@main\n\n### Main Content\n\nContent here\n'
        };

        for (const area of requiredAreas) {
            // Skip title/header checks as they are symmetric
            if (area === 'header' || area === 'title' || area === 'footer') continue;

            if (!currentAreas[area] && areaPlaceholders[area]) {
                appendedContent += areaPlaceholders[area];
            }
        }

        if (appendedContent) {
            updatedMarkdown = updatedMarkdown.trim() + '\n' + appendedContent;
        }

        this.markdownEditor.setValue(updatedMarkdown, { suppressOnChange: false });
        Notification.success(`Layout changed to "${layoutName}"`);
    }

    /**
     * Check if a layout is compatible with the current slide's areas.
     */
    getCompatibilityWarning(markdown, layoutName) {
        const currentAreas = this._normalizeAreasForLayout(markdown, layoutName);
        const resolvedLayout = LayoutParser.parse(LayoutParser.resolvePreset(layoutName), {
            fallbackAreas: Object.keys(currentAreas).length ? Object.keys(currentAreas) : ["main"],
        });
        const allowedAreas = new Set(resolvedLayout.orderedAreas);
        const unsupportedAreas = Object.entries(currentAreas)
            .filter(([areaName, content]) => content && !allowedAreas.has(areaName))
            .map(([areaName]) => `@${areaName}`);

        if (!unsupportedAreas.length) return '';

        const renderedList = unsupportedAreas.join(', ');
        return `This layout does not include ${renderedList}. Their content may be moved, hidden, or rendered as extra blocks after the layout change.`;
    }

    _normalizeAreasForLayout(markdown, layoutName) {
        const parser = new MarkdownParser();
        const areas = parser.parseAreas(markdown);
        const resolvedLayout = LayoutParser.parse(LayoutParser.resolvePreset(layoutName), {
            fallbackAreas: Object.keys(areas).length ? Object.keys(areas) : ["main"],
        });

        const allowsTitle = resolvedLayout.orderedAreas.includes('title');
        if (allowsTitle) {
            if (!areas.title && areas.header) {
                areas.title = areas.header;
            }
            delete areas.header;
        } else {
            if (!areas.header && areas.title) {
                areas.header = areas.title;
            }
            delete areas.title;
        }

        return areas;
    }
}
