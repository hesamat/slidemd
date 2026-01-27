/**
 * FreezeManager
 * Manages freeze state for viewer window synchronization.
 * When frozen, slide changes in the presenter window won't be broadcast to viewer windows.
 */
import { getDeckId } from "../core/utils.js";

export class FreezeManager {
    /**
     * Creates a new FreezeManager instance.
     * @param {Object} deck - The deck object for context
     * @param {Object} elements - DOM element references
     * @param {HTMLButtonElement} elements.freezeBtn - The freeze toggle button
     * @param {Function} onStateChange - Optional callback when freeze state changes
     */
    constructor(deck, elements, onStateChange = null) {
        this.deck = deck;
        this.elements = elements;
        this.onStateChange = onStateChange;

        this.freezeStateKey = `webdeck:${getDeckId(deck)}:freeze`;

        this.isFrozen = false;

        // Broadcast channel is set by DeckController, not owned by FreezeManager
        this._broadcastChannel = null;
    }

    /**
     * Sets the broadcast channel reference for cross-window freeze state sync.
     * The channel is owned by DeckController, we just hold a reference.
     * @param {BroadcastChannel} channel - The broadcast channel to use
     */
    setBroadcastChannel(channel) {
        this._broadcastChannel = channel;
    }

    /**
     * Sets the freeze state and optionally broadcasts to other windows.
     * @param {boolean} frozen - Whether viewer should be frozen
     * @param {Object} options - Optional parameters
     * @param {boolean} options.broadcast - Whether to broadcast the state change
     */
    setFrozen(frozen, { broadcast = true } = {}) {
        this.isFrozen = !!frozen;

        // Update button state if available
        if (this.elements.freezeBtn) {
            this.elements.freezeBtn.classList.toggle("active", this.isFrozen);
            this.elements.freezeBtn.setAttribute("aria-pressed", String(this.isFrozen));
            this.elements.freezeBtn.title = this.isFrozen ? "Unfreeze Viewer" : "Freeze Viewer";
        }

        if (broadcast) {
            const payload = {
                type: "freeze",
                frozen: this.isFrozen
            };
            localStorage.setItem(this.freezeStateKey, JSON.stringify(payload));
            this._broadcastChannel?.postMessage(payload);
        }

        if (this.onStateChange) {
            this.onStateChange({ isFrozen: this.isFrozen });
        }
    }

    /**
     * Handles incoming freeze state from other windows.
     * @param {Object} state - The incoming freeze state
     */
    handleIncomingState(state) {
        this.setFrozen(state.frozen, { broadcast: false });
    }

    /**
     * Toggles the freeze state.
     */
    toggle() {
        this.setFrozen(!this.isFrozen);
    }

    /**
     * Gets the current freeze state.
     * @returns {{ isFrozen: boolean }}
     */
    getState() {
        return {
            isFrozen: this.isFrozen
        };
    }

    /**
     * Cleans up resources.
     * Note: Does not close the broadcast channel as it is owned by DeckController.
     */
    destroy() {
        this._broadcastChannel = null;
        this.isFrozen = false;
        this.elements = null;
        this.deck = null;
        this.onStateChange = null;
    }
}
