/**
 * AreaGuideManager
 *
 * Manages @area overlay labels and overflow indicators in edit mode.
 * Extracted from EditController.
 */
import { ImageInteractionHandler } from '../image/image-interaction-handler.js';

export class AreaGuideManager {
    /** @param {import('./edit-controller.js').EditController} ctrl */
    constructor(ctrl) {
        this.ctrl = ctrl;
    }

    get isEditMode() { return this.ctrl.isEditMode; }
    get currentSlideIndex() { return this.ctrl.currentSlideIndex; }
    get deck() { return this.ctrl.deck; }

    getSlideElementByIndex(index) {
        return this.ctrl.getSlideElementByIndex(index);
    }

    /**
     * Apply @area labels and click-to-navigate on a slide element.
     */
    applyAreaGuides(slideEl, slideData) {
        if (!this.isEditMode || !slideEl) return;

        const areaEls = slideEl.querySelectorAll('.slide__area');
        areaEls.forEach(areaEl => {
            const name = areaEl.style.gridArea || areaEl.dataset.areaName || 'main';
            areaEl.dataset.areaName = name;

            let label = areaEl.querySelector(':scope > .editor-area-label');
            if (!label) {
                label = document.createElement('button');
                label.type = 'button';
                label.className = 'editor-area-label';
                areaEl.prepend(label);
            }

            label.textContent = `@${name}`;
            label.setAttribute('title', `Jump to @${name}`);
            label.onclick = (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.ctrl.navigateToArea(name);
            };
        });

        if (slideData?.layout) {
            slideEl.dataset.layoutName = slideData.layout;
        }
    }

    /**
     * Update overflow indicators on area elements.
     */
    updateAreaOverflow(slideEl) {
        if (!this.isEditMode || !slideEl) return;
        const areas = slideEl.querySelectorAll('.slide__area');
        areas.forEach(area => {
            const label = area.querySelector(':scope > .editor-area-label');
            const verticalOverflow = area.scrollHeight - area.clientHeight > 6;
            const horizontalOverflow = area.scrollWidth - area.clientWidth > 6;
            const isOverflowing = verticalOverflow || horizontalOverflow;

            area.classList.toggle('editor-area-overflow', isOverflowing);
            if (label) {
                label.dataset.overflow = isOverflowing ? '1' : '0';
                label.setAttribute('aria-label', isOverflowing
                    ? `@${area.dataset.areaName} is overflowing`
                    : `@${area.dataset.areaName}`);
            }
        });
    }

    /**
     * Refresh all area guides for the current slide.
     */
    refresh() {
        if (!this.isEditMode) return;
        const slideEl = this.getSlideElementByIndex(this.currentSlideIndex);
        const slideData = this.deck?.slides?.[this.currentSlideIndex];
        if (!slideEl || !slideData) return;

        this.applyAreaGuides(slideEl, slideData);
        requestAnimationFrame(() => {
            this.updateAreaOverflow(slideEl);
            this.ctrl.gridResizer.attachForSlide(slideEl, slideData);
            // Activate image drag/resize on the current slide's grid.  This is
            // needed because updatePreview() (which normally calls activate) is
            // skipped when loadSlideIntoEditor() runs with suppressOnChange —
            // e.g. when entering edit mode or navigating slides.  Without this,
            // existing images can only be moved via keyboard arrows, not dragged
            // or resized.
            const grid = slideEl.querySelector('.slide__grid');
            if (grid) {
                ImageInteractionHandler.activate(grid);
            }
        });
    }
}
