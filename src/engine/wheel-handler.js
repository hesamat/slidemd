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
     * @param {Function} actions.isEmbedded - Callback to check if running in an iframe
     */
    constructor(actions) {
        this.actions = actions;
        this.isScrolling = false;
        this.scrollTimeout = null;
        this.DEBOUNCE_MS = 150; // Debounce time to prevent rapid scrolling
    }

    /**
     * Handles wheel events and dispatches to navigation actions.
     * @param {WheelEvent} e - The wheel event
     */
    handleWheel(e) {
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
            e.preventDefault();
            e.stopPropagation();
            this.actions.endBreak?.();
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
