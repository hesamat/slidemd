/**
 * PrintManager
 * Handles print preparation and browser print triggering.
 */

import { ContentEnhancer } from "./content-enhancer.js";

export class PrintManager {
    static _isPrinting = false;

    /**
     * Regex to match emoji characters
     */
    static EMOJI_REGEX = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;

    /**
     * Removes emojis from text nodes for PDF.js compatibility.
     * Emojis get converted to complex font patterns that old PDF.js can't handle.
     */
    static removeEmojis(element) {
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    if (node.parentElement.tagName === 'SCRIPT' || node.parentElement.tagName === 'STYLE') {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return PrintManager.EMOJI_REGEX.test(node.textContent)
                        ? NodeFilter.FILTER_ACCEPT
                        : NodeFilter.FILTER_REJECT;
                }
            }
        );

        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) {
            textNodes.push(node);
        }

        for (const textNode of textNodes) {
            textNode.textContent = textNode.textContent.replace(PrintManager.EMOJI_REGEX, '');
        }
    }

    /**
     * Handles print preparation and optionally triggers browser print.
     * @param {HTMLElement} slidesContainer - The container holding all slides
     * @param {string} deckTitle - The title of the deck
     * @param {Object} options - Optional parameters
     * @param {boolean} options.triggerBrowserPrint - Whether to trigger window.print()
     */
    static async handlePrint(slidesContainer, deckTitle, { triggerBrowserPrint = true } = {}) {
        if (PrintManager._isPrinting) return;
        PrintManager._isPrinting = true;

        try {
            const slides = slidesContainer.querySelectorAll('.slide');
            for (const slide of slides) {
                await ContentEnhancer.enhanceRenderedContent(slide, { renderAllSlides: true });
                // Remove emojis for PDF.js compatibility
                PrintManager.removeEmojis(slide);
            }

            document.title = deckTitle;
        } finally {
            PrintManager._isPrinting = false;
        }

        if (triggerBrowserPrint) window.print();
    }

    static isPrinting() {
        return PrintManager._isPrinting;
    }
}
