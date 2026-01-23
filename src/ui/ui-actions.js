/**
 * UiActions
 * Simple UI actions that don't require state management.
 */

export class UiActions {
    /**
     * Updates the deck title in the UI.
     * @param {Object} elements - DOM element references
     * @param {string} title - The title to display
     */
    static updateDeckTitle(elements, title) {
        if (elements.deckTitleEl) elements.deckTitleEl.textContent = title;
    }

    /**
     * Updates the slide count in the UI.
     * @param {Object} elements - DOM element references
     * @param {number} count - The slide count to display
     */
    static updateSlideCount(elements, count) {
        if (elements.slideCountEl) elements.slideCountEl.textContent = String(count);
    }

    /**
     * Toggles fullscreen mode on the stage host element.
     * @param {HTMLElement} stageHost - The stage host element
     */
    static toggleFullscreen(stageHost) {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else if (stageHost?.requestFullscreen) {
            stageHost.requestFullscreen();
        }
    }

    /**
     * Shows or hides a dropdown menu element.
     * @param {HTMLElement} menuDropdown - The menu dropdown element
     * @param {boolean} show - Whether to show the menu
     */
    static toggleMenu(menuDropdown, show = null) {
        if (!menuDropdown) return;
        if (show === null) {
            menuDropdown.classList.toggle("webdeck-hidden");
        } else if (show) {
            menuDropdown.classList.remove("webdeck-hidden");
        } else {
            menuDropdown.classList.add("webdeck-hidden");
        }
    }
}
