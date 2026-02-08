/**
 * WheelHandler
 * Handles mouse wheel events for slide navigation with debouncing.
 */

export class WheelHandler {
    /**
     * Creates a new WheelHandler.
     * @param {Object} actions - Callback functions for wheel actions
     * @param {Function} actions.next - Navigate to next slide
     * @param {Function} actions.prev - Navigate to previous slide
     * @param {Function} actions.isBreakActive - Callback to check if break mode is active
     * @param {Function} actions.endBreak - Callback to end break mode
     */
    constructor(actions) {
        this.actions = actions;
        this.isScrolling = false;
        this.scrollTimeout = null;
        this.DEBOUNCE_MS = 150; // Debounce time to prevent rapid scrolling
    }

    /**
     * Checks if any modal is currently open.
     * @returns {boolean} True if a modal is open
     */
    isModalOpen() {
        // Check for main modals (layout picker, go-to-slide, etc.)
        const modal = document.querySelector('.modal:not(.webdeck-hidden)');
        if (modal) return true;

        // Check for notification modal
        const notificationModal = document.querySelector('.notification-modal-backdrop');
        if (notificationModal) return true;

        return false;
    }

    /**
     * Checks if the wheel event is over an area that should handle its own scrolling.
     * @param {WheelEvent} e - The wheel event
     * @returns {boolean} True if the event is over a scrollable area that should not trigger navigation
     */
    isOverScrollableArea(e) {
        // Check if the wheel event is over the thumbnails panel
        const thumbnailsPanel = e.target.closest('.slide-thumbnails, .editor__thumbnails');
        if (thumbnailsPanel) return true;

        return false;
    }

    /**
     * Handles wheel events and dispatches to navigation actions.
     * @param {WheelEvent} e - The wheel event
     */
    handleWheel(e) {
        // Ignore wheel events when a modal is open
        if (this.isModalOpen()) {
            return;
        }

        // Ignore wheel events over scrollable areas like thumbnails
        if (this.isOverScrollableArea(e)) {
            return;
        }

        // Ignore wheel events when already processing one
        if (this.isScrolling) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // Ignore horizontal scrolling
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            return;
        }

        // If break mode is active, any wheel action ends the break
        if (this.actions.isBreakActive?.()) {
            this.actions.endBreak?.();
            // Don't navigate, just end the break
            return;
        }

        // Determine scroll direction
        const isScrollDown = e.deltaY > 0;
        const isScrollUp = e.deltaY < 0;

        if (!isScrollDown && !isScrollUp) {
            return;
        }

        // Prevent default scrolling and stop propagation
        e.preventDefault();
        e.stopPropagation();

        // Navigate based on scroll direction
        if (isScrollDown) {
            this.actions.next?.();
        } else if (isScrollUp) {
            this.actions.prev?.();
        }

        // Set debounce flag
        this.isScrolling = true;
        clearTimeout(this.scrollTimeout);
        this.scrollTimeout = setTimeout(() => {
            this.isScrolling = false;
        }, this.DEBOUNCE_MS);
    }

    /**
     * Cleanup method to clear timeouts
     */
    destroy() {
        clearTimeout(this.scrollTimeout);
    }
}
