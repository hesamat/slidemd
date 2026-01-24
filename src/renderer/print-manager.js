/**
 * PrintManager
 * Handles print preparation and browser print triggering.
 */

import { ContentEnhancer } from "./content-enhancer.js";

export class PrintManager {
    static _isPrinting = false;

    /**
     * Handles print preparation and optionally triggers browser print.
     * @param {HTMLElement} slidesContainer - The container holding all slides
     * @param {Object} options - Optional parameters
     * @param {boolean} options.triggerBrowserPrint - Whether to trigger window.print()
     */
    static async handlePrint(slidesContainer, { triggerBrowserPrint = true } = {}) {
        if (PrintManager._isPrinting) return;
        PrintManager._isPrinting = true;

        try {
            const slides = slidesContainer.querySelectorAll('.slide');
            for (const slide of slides) {
                await ContentEnhancer.enhanceRenderedContent(slide, { renderAllSlides: true });
            }
        } finally {
            PrintManager._isPrinting = false;
        }

        if (triggerBrowserPrint) window.print();
    }

    static isPrinting() {
        return PrintManager._isPrinting;
    }
}
