/**
 * PrintManager
 * Handles print preparation, content enhancement before printing, and browser print triggering.
 */

import { yieldToMain } from "./utils.js";
import { ContentEnhancer } from "./content-enhancer.js";

export class PrintManager {
    static _isPrinting = false;

    /**
     * Handles print preparation and optionally triggers browser print.
     * Enhances all slides with content (D2 diagrams, syntax highlighting, math) before printing.
     * @param {HTMLElement} slidesContainer - The container element holding all slides
     * @param {Object} options - Optional parameters
     * @param {boolean} options.triggerBrowserPrint - Whether to trigger window.print() after preparation
     * @returns {Promise<void>}
     */
    static async handlePrint(slidesContainer, { triggerBrowserPrint = true } = {}) {
        if (PrintManager._isPrinting) return;
        PrintManager._isPrinting = true;

        try {
            // Ensure D2 is loaded before printing
            if (!window.__WEBDECK_D2__) {
                await import("./asset-loader.js").then(m => m.AssetLoader.ensureD2Loaded());
            }

            const slides = slidesContainer.querySelectorAll('.slide');
            for (let i = 0; i < slides.length; i++) {
                await ContentEnhancer.enhanceRenderedContent(slides[i], { renderAllSlides: true });
                // CRITICAL: Yield to main thread to prevent freezing
                await yieldToMain();
            }
        } catch (e) {
            console.warn("Print prep failed:", e);
        } finally {
            PrintManager._isPrinting = false;
        }

        if (triggerBrowserPrint) window.print();
    }

    /**
     * Checks if print preparation is currently in progress.
     * @returns {boolean} True if currently preparing for print
     */
    static isPrinting() {
        return PrintManager._isPrinting;
    }
}
