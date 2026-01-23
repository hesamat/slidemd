/**
 * BreakManager
 * Manages break state, timers, and slide rendering for presentation breaks.
 * Handles cross-window synchronization of break state via localStorage and BroadcastChannel.
 */
import { getDeckId } from "./utils.js";
import { SlideRenderer } from "./slide-renderer.js";

export class BreakManager {
    /**
     * Creates a new BreakManager instance.
     * @param {Object} deck - The deck object for context
     * @param {Object} elements - DOM element references
     * @param {HTMLElement} elements.stageInner - The stage inner container
     * @param {HTMLSelectElement} elements.breakDurationSelect - The duration select element
     * @param {Function} onStateChange - Optional callback when break state changes
     */
    constructor(deck, elements, onStateChange = null) {
        this.deck = deck;
        this.elements = elements;
        this.onStateChange = onStateChange;

        this.breakStateKey = `webdeck:${getDeckId(deck)}:break`;

        this.isActive = false;
        this.minutes = 10;
        this.endsAt = null;
        this.breakSlideEl = null;

        // Broadcast channel is set by DeckController, not owned by BreakManager
        this._broadcastChannel = null;
    }

    /**
     * Sets the broadcast channel reference for cross-window break state sync.
     * The channel is owned by DeckController, we just hold a reference.
     * @param {BroadcastChannel} channel - The broadcast channel to use
     */
    setBroadcastChannel(channel) {
        this._broadcastChannel = channel;
    }

    /**
     * Sets the break active state and optionally broadcasts to other windows.
     * @param {boolean} active - Whether break should be active
     * @param {Object} options - Optional parameters
     * @param {boolean} options.broadcast - Whether to broadcast the state change
     * @param {number} options.endsAt - Timestamp when break ends
     */
    setActive(active, { broadcast = true, endsAt = null } = {}) {
        this.isActive = !!active;

        if (this.isActive) {
            if (!this.breakSlideEl) {
                this.createBreakSlide();
            }
            this.endsAt = endsAt || (Date.now() + this.minutes * 60000);

            const timeStr = new Date(this.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const titleEl = this.breakSlideEl.querySelector(".break-mins");
            const timeEl = this.breakSlideEl.querySelector(".break-end-time");

            if (titleEl) titleEl.textContent = `${this.minutes} Minute Break`;
            if (timeEl) timeEl.textContent = timeStr;
        }

        if (this.breakSlideEl) {
            this.breakSlideEl.classList.toggle("webdeck-hidden", !this.isActive);
        }

        if (broadcast) {
            const payload = {
                type: "break",
                active: this.isActive,
                mins: this.minutes,
                endsAt: this.endsAt
            };
            localStorage.setItem(this.breakStateKey, JSON.stringify(payload));
            this._broadcastChannel?.postMessage(payload);
        }

        if (this.onStateChange) {
            this.onStateChange({ isActive: this.isActive, minutes: this.minutes, endsAt: this.endsAt });
        }
    }

    /**
     * Creates the break slide element and appends it to the stage.
     */
    createBreakSlide() {
        this.breakSlideEl = SlideRenderer.createBreakSlide(
            this.deck,
            { background: "#333", theme: "dark" }
        );
        this.breakSlideEl.classList.add("webdeck-hidden");
        this.breakSlideEl.style.zIndex = "80";
        this.elements.stageInner?.appendChild(this.breakSlideEl);
    }

    /**
     * Handles incoming break state from other windows.
     * @param {Object} state - The incoming break state
     */
    handleIncomingState(state) {
        if (state.mins) {
            this.minutes = state.mins;
            if (this.elements.breakDurationSelect) {
                this.elements.breakDurationSelect.value = String(this.minutes);
            }
        }
        this.setActive(state.active, { broadcast: false, endsAt: state.endsAt });
    }

    /**
     * Toggles the break state.
     */
    toggle() {
        this.setActive(!this.isActive);
    }

    /**
     * Updates the break duration in minutes.
     * @param {number} minutes - The new duration in minutes
     */
    setDuration(minutes) {
        this.minutes = Math.max(1, Math.min(120, parseInt(minutes, 10) || 10));
    }

    /**
     * Gets the current break state.
     * @returns {{ isActive: boolean, minutes: number, endsAt: number|null }}
     */
    getState() {
        return {
            isActive: this.isActive,
            minutes: this.minutes,
            endsAt: this.endsAt
        };
    }

    /**
     * Cleans up resources (removes break slide).
     * Note: Does not close the broadcast channel as it is owned by DeckController.
     */
    destroy() {
        if (this.breakSlideEl && this.breakSlideEl.parentNode) {
            this.breakSlideEl.parentNode.removeChild(this.breakSlideEl);
        }
        this.breakSlideEl = null;
        this._broadcastChannel = null;

        this.isActive = false;
        this.minutes = null;
        this.endsAt = null;
        this.elements = null;
        this.deck = null;
        this.onStateChange = null;
    }
}
