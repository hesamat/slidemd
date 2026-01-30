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
        this.freezeManager = null;
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

        // Only broadcast if not frozen
        const shouldBroadcast = broadcast && !(this.freezeManager?.isFrozen);
        if (shouldBroadcast) {
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
     * Shows a modal with a scrollable list of slides.
     */
    openGoToPrompt() {
        this._closeGoToModal();

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'go-to-slide-modal';

        const overlay = document.createElement('div');
        overlay.className = 'modal__overlay';
        overlay.addEventListener('click', () => this._closeGoToModal());

        const dialog = document.createElement('div');
        dialog.className = 'modal__dialog modal__dialog--go-to-slide';

        const header = document.createElement('div');
        header.className = 'modal__header';

        const title = document.createElement('h2');
        title.className = 'modal__title';
        title.textContent = 'Go to Slide';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal__close';
        closeBtn.innerHTML = '&times;';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.addEventListener('click', () => this._closeGoToModal());

        header.appendChild(title);
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'modal__body';

        // Input field for quick navigation by number
        const inputContainer = document.createElement('div');
        inputContainer.className = 'go-to-slide__input-container';

        const inputLabel = document.createElement('label');
        inputLabel.className = 'go-to-slide__label';
        inputLabel.textContent = `Go to slide (1–${this.deck.slides.length}):`;

        const input = document.createElement('input');
        input.className = 'go-to-slide__input';
        input.type = 'number';
        input.min = '1';
        input.max = this.deck.slides.length;
        input.placeholder = 'Enter slide number...';
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const num = parseInt(input.value, 10);
                if (num >= 1 && num <= this.deck.slides.length) {
                    this.goTo(num - 1);
                    this._closeGoToModal();
                }
            } else if (e.key === 'Escape') {
                this._closeGoToModal();
            }
        });

        inputContainer.appendChild(inputLabel);
        inputContainer.appendChild(input);

        // Divider
        const divider = document.createElement('div');
        divider.className = 'go-to-slide__divider';
        divider.textContent = 'or select from list:';

        // Scrollable slide list
        const listContainer = document.createElement('div');
        listContainer.className = 'go-to-slide__list';

        this.deck.slides.forEach((slide, index) => {
            const item = document.createElement('div');
            item.className = 'go-to-slide__item';
            item.setAttribute('role', 'button');
            item.tabIndex = 0;

            const isCurrent = index === this.currentIndex;
            const isHidden = slide.hidden;

            if (isCurrent) item.classList.add('current');
            if (isHidden) item.classList.add('hidden');

            const number = document.createElement('div');
            number.className = 'go-to-slide__number';
            number.textContent = index + 1;

            const title = document.createElement('div');
            title.className = 'go-to-slide__title';
            title.textContent = slide.title || `Slide ${index + 1}`;

            const status = document.createElement('div');
            status.className = 'go-to-slide__status';
            if (isCurrent) {
                status.innerHTML = '<span class="go-to-slide__badge current">Current</span>';
            } else if (isHidden) {
                status.innerHTML = '<span class="go-to-slide__badge hidden">Hidden</span>';
            }

            item.appendChild(number);
            item.appendChild(title);
            item.appendChild(status);

            item.addEventListener('click', () => {
                this.goTo(index);
                this._closeGoToModal();
            });

            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.goTo(index);
                    this._closeGoToModal();
                } else if (e.key === 'Escape') {
                    this._closeGoToModal();
                }
            });

            listContainer.appendChild(item);
        });

        body.appendChild(inputContainer);
        body.appendChild(divider);
        body.appendChild(listContainer);

        dialog.appendChild(header);
        dialog.appendChild(body);

        modal.appendChild(overlay);
        modal.appendChild(dialog);

        // Append to fullscreen element if in fullscreen mode, otherwise to body
        const fullscreenElement = document.fullscreenElement;
        const targetParent = fullscreenElement || document.body;
        targetParent.appendChild(modal);

        // Focus input and select existing value
        input.focus();
        input.select();

        // Handle Escape key
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                this._closeGoToModal();
            }
        };
        document.addEventListener('keydown', escapeHandler);
        this._goToModalEscapeHandler = escapeHandler;
    }

    /**
     * Closes the go-to-slide modal.
     * @private
     */
    _closeGoToModal() {
        const modal = document.getElementById('go-to-slide-modal');
        if (modal) {
            modal.remove();
        }
        if (this._goToModalEscapeHandler) {
            document.removeEventListener('keydown', this._goToModalEscapeHandler);
            this._goToModalEscapeHandler = null;
        }
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
