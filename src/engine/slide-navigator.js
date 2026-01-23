/**
 * SlideNavigator
 * Handles slide navigation including visible/hidden slide logic.
 */

import { EventEmitter } from "../core/utils.js";

export class SlideNavigator extends EventEmitter {
    /**
     * Creates a new SlideNavigator.
     * @param {Object} deck - The deck object containing slides
     * @param {Object} options - Configuration options
     * @param {string} options.slideStateKey - The key for localStorage slide state
     * @param {BroadcastChannel} options.broadcastChannel - The broadcast channel for sync
     * @param {Function} options.isEditMode - Callback to check if edit mode is active
     */
    constructor(deck, options = {}) {
        super();
        this.deck = deck;
        this.slideStateKey = options.slideStateKey || "webdeck:slide";
        this.broadcastChannel = options.broadcastChannel;
        this.isEditMode = options.isEditMode || (() => false);
        this.currentIndex = 0;
    }

    /**
     * Check if we're in edit mode
     * @returns {boolean} True if edit mode is active
     */
    _isEditMode() {
        return typeof this.isEditMode === "function" ? this.isEditMode() : false;
    }

    /**
     * Find the next visible slide index (skips hidden slides)
     * @param {number} fromIndex - The index to start from
     * @returns {number} The next visible slide index
     */
    findNextVisibleIndex(fromIndex) {
        for (let i = fromIndex + 1; i < this.deck.slides.length; i++) {
            if (!this.deck.slides[i]?.hidden) return i;
        }
        return fromIndex; // No next visible slide, stay on current
    }

    /**
     * Find the previous visible slide index (skips hidden slides)
     * @param {number} fromIndex - The index to start from
     * @returns {number} The previous visible slide index
     */
    findPrevVisibleIndex(fromIndex) {
        for (let i = fromIndex - 1; i >= 0; i--) {
            if (!this.deck.slides[i]?.hidden) return i;
        }
        return fromIndex; // No previous visible slide, stay on current
    }

    /**
     * Get the actual visible slide index (skips hidden slides unless in edit mode)
     * @param {number} targetIndex - The target slide index
     * @returns {number} The visible slide index
     */
    getVisibleIndex(targetIndex) {
        const clamped = Math.max(0, Math.min(targetIndex, this.deck.slides.length - 1));
        // In edit mode, allow navigating to any slide including hidden ones
        if (this._isEditMode()) return clamped;
        // Outside edit mode, if the target slide is hidden, find the next visible one
        if (this.deck.slides[clamped]?.hidden) {
            return this.findNextVisibleIndex(clamped);
        }
        return clamped;
    }

    /**
     * Navigate to a specific slide index.
     * @param {number} index - The target slide index
     * @param {Object} options - Optional parameters
     * @param {boolean} options.broadcast - Whether to broadcast the state change
     */
    goTo(index, { broadcast = true } = {}) {
        const visibleIndex = this.getVisibleIndex(index);
        this.currentIndex = visibleIndex;

        if (broadcast) {
            localStorage.setItem(this.slideStateKey, String(this.currentIndex));
            this.broadcastChannel?.postMessage({ type: "slide", index: this.currentIndex });
        }

        const url = new URL(window.location.href);
        url.hash = `#slide-${this.currentIndex + 1}`;
        history.replaceState({}, "", url.toString());

        this.dispatchEvent("slidechange", { index: this.currentIndex });
        return this.currentIndex;
    }

    /**
     * Navigate to the next slide.
     */
    next() {
        const targetIndex = this._isEditMode()
            ? this.currentIndex + 1
            : this.findNextVisibleIndex(this.currentIndex);
        return this.goTo(targetIndex);
    }

    /**
     * Navigate to the previous slide.
     */
    prev() {
        const targetIndex = this._isEditMode()
            ? this.currentIndex - 1
            : this.findPrevVisibleIndex(this.currentIndex);
        return this.goTo(targetIndex);
    }

    /**
     * Opens a prompt to navigate to a specific slide.
     */
    openGoToPrompt() {
        const num = parseInt(prompt(`Go to slide (1–${this.deck.slides.length}):`), 10);
        if (num >= 1 && num <= this.deck.slides.length) this.goTo(num - 1);
    }

    /**
     * Handles incoming slide state from other windows.
     * @param {number} index - The incoming slide index
     */
    handleIncomingState(index) {
        if (index !== this.currentIndex && !isNaN(index)) {
            this.goTo(index, { broadcast: false });
        }
    }

    /**
     * Called when edit mode is toggled to ensure we're on a valid slide.
     */
    onEditModeChanged() {
        // If exiting edit mode and current slide is hidden, navigate to next visible
        if (!this._isEditMode() && this.deck.slides[this.currentIndex]?.hidden) {
            this.goTo(this.findNextVisibleIndex(this.currentIndex), { broadcast: false });
        }
        this.dispatchEvent("renderneeded");
    }

    /**
     * Updates the deck reference (used when deck is reloaded).
     * @param {Object} deck - The new deck object
     */
    setDeck(deck) {
        this.deck = deck;
        // Ensure current index is valid
        this.currentIndex = Math.min(this.currentIndex, deck.slides.length - 1);
    }

    /**
     * Sets the broadcast channel reference.
     * @param {BroadcastChannel} channel - The broadcast channel to use
     */
    setBroadcastChannel(channel) {
        this.broadcastChannel = channel;
    }

    /**
     * Sets the slide state key for localStorage.
     * @param {string} key - The localStorage key
     */
    setSlideStateKey(key) {
        this.slideStateKey = key;
    }
}
