/**
 * ReloadManager
 * Handles deck reloading from various sources and cross-window reload broadcasting.
 */

import { EventEmitter } from "../core/utils.js";
import { DeckLoader } from "../data/deck-loader.js";
import { SlideRenderer } from "../renderer/slide-renderer.js";
import { Notification } from "../renderer/notification.js";
import { UiActions } from "../ui/ui-actions.js";

export class ReloadManager extends EventEmitter {
    /**
     * Creates a new ReloadManager.
     * @param {Object} deck - The current deck object
     * @param {Object} elements - DOM element references
     * @param {Object} options - Configuration options
     * @param {SlideNavigator} options.slideNavigator - The slide navigator instance
     * @param {BreakManager} options.breakManager - The break manager instance
     * @param {Function} options.getDeckId - Function to get deck ID
     * @param {Function} options.updateDeckTitle - Function to update deck title UI
     * @param {Function} options.updateSlideCount - Function to update slide count UI
     */
    constructor(deck, elements, options = {}) {
        super();
        this.deck = deck;
        this.elements = elements;
        this.slideNavigator = options.slideNavigator;
        this.breakManager = options.breakManager;
        this.getDeckId = options.getDeckId || (() => "webdeck");
        this.bc = null;
    }

    /**
     * Initializes the broadcast channel for slide synchronization.
     */
    initBroadcastChannel() {
        const getDeckId = this.getDeckId;
        if (this.bc) this.bc.close();
        this.bc = new BroadcastChannel(getDeckId(this.deck));
        if (this.breakManager) this.breakManager.setBroadcastChannel(this.bc);
        if (this.slideNavigator) this.slideNavigator.setBroadcastChannel(this.bc);
        this.bc.onmessage = (ev) => {
            if (ev.data?.type === "slide") this.slideNavigator?.handleIncomingState(ev.data.index);
            if (ev.data?.type === "break") this.breakManager?.handleIncomingState(ev.data);
        };
    }

    /**
     * Handles deck reloading from URL, file handle, or localStorage.
     * @param {Object} options - Optional parameters
     * @param {boolean} options.preferLocalStorage - Whether to prefer localStorage over file handle
     * @param {boolean} options.skipConfirmation - Whether to skip the unsaved changes confirmation
     * @returns {Promise<void>}
     */
    async handleReloadDeck({ preferLocalStorage = false, skipConfirmation = false } = {}) {
        // Check for unsaved changes before reloading
        if (!skipConfirmation) {
            const editController = window.__WEBDECK_EDIT_CONTROLLER__;
            if (editController && editController.hasUnsavedChanges) {
                const confirmed = await Notification.confirm(
                    'You have unsaved changes. Reloading the deck will replace all your changes with the saved file. Continue?'
                );
                if (!confirmed) {
                    return;
                }
            }
        }

        const url = new URL(window.location.href);
        const deckUrl = url.searchParams.get("url");
        try {
            let raw;
            if (deckUrl) {
                raw = await DeckLoader.loadFromUrl(deckUrl, { bypassCache: true });
                this.broadcastReload();
            } else {
                const deckId = this.getDeckId(this.deck);
                raw = await DeckLoader.reloadFromFileHandle(deckId);
                if (!raw || preferLocalStorage) {
                    raw = await DeckLoader.loadFromLocalStorage();
                }
            }

            if (!raw) throw new Error("No deck source available");

            const newDeck = await DeckLoader.processRawData(raw);
            await this.replaceDeck(newDeck);
        } catch (err) {
            console.error("Reload failed:", err);
            Notification.error("Failed to reload deck: " + err.message);
        }
    }

    /**
     * Replaces the current deck with a new one.
     * @param {Object} newDeck - The new deck object
     * @returns {Promise<void>}
     */
    async replaceDeck(newDeck) {
        const preservedIndex = Math.min(this.slideNavigator.currentIndex, newDeck.slides.length - 1);
        // Ensure we land on a visible slide (unless in edit mode)
        const visibleIndex = this.slideNavigator.getVisibleIndex(preservedIndex);
        const oldDeck = this.deck;
        this.deck = newDeck;

        // Update the navigator's deck reference
        this.slideNavigator.setDeck(newDeck);

        if (this.breakManager) {
            this.breakManager.deck = newDeck;
            this.breakManager.breakStateKey = `webdeck:${this.getDeckId(newDeck)}:break`;
        }

        const title = DeckLoader.getDisplayTitle(newDeck);
        document.title = title;
        UiActions.updateDeckTitle(this.elements, title);

        this.elements.slidesContainer.innerHTML = "";
        newDeck.slides.forEach((s, i) => {
            this.elements.slidesContainer.appendChild(
                SlideRenderer.createSlideElement(newDeck, s, i, i === preservedIndex)
            );
        });

        UiActions.updateSlideCount(this.elements, newDeck.slides.length);
        if (this.elements.floatSlideCounter) {
            this.elements.floatSlideCounter.textContent = `${this.slideNavigator.currentIndex + 1} / ${newDeck.slides.length}`;
        }

        this.initBroadcastChannel();
        this.slideNavigator.goTo(visibleIndex, { broadcast: false });
        this.dispatchEvent('deckchange', { deck: newDeck });
    }

    /**
     * Broadcasts a reload event to all other windows.
     */
    broadcastReload() {
        const reloadChannel = new BroadcastChannel("webdeck-reload");
        reloadChannel.postMessage({ type: "reload" });
        reloadChannel.close();
        localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
        localStorage.setItem("webdeck_reload_flag", "1");
    }

    /**
     * Handles loading a local markdown file.
     * @param {CustomEvent} event - The webdeck-load-local event
     * @returns {Promise<void>}
     */
    async handleLocalFileLoad(event) {
        try {
            const { text, fileName } = event.detail || {};
            if (fileName) localStorage.setItem("webdeck_local_file_name", fileName);

            const newDeck = await DeckLoader.parseMarkdown(text);
            await this.replaceDeck(newDeck);
            this.broadcastReload();
        } catch (err) {
            Notification.error("Failed to load file: " + err.message);
        }
    }

    /**
     * Handles storage events related to deck reloading.
     * @param {StorageEvent} ev - The storage event
     */
    handleStorage(ev) {
        if (ev.key === "webdeck_local_file_timestamp" && ev.newValue) {
            this.handleReloadDeck({ preferLocalStorage: true });
        }
    }

    /**
     * Updates the deck reference.
     * @param {Object} deck - The new deck object
     */
    setDeck(deck) {
        this.deck = deck;
    }

    /**
     * Gets the broadcast channel.
     * @returns {BroadcastChannel} The broadcast channel
     */
    getBroadcastChannel() {
        return this.bc;
    }

    /**
     * Initializes the reload channel for cross-window reload coordination.
     * This is a static initializer for app startup.
     * @returns {BroadcastChannel} The reload channel
     */
    static initReloadChannel() {
        const channel = new BroadcastChannel("webdeck-reload");
        channel.onmessage = async (ev) => {
            if (ev.data?.type === "reload") {
                window.location.hash = "";
                if (ev.data.url) {
                    const newUrl = new URL(window.location.href);
                    newUrl.searchParams.set("url", ev.data.url);
                    window.location.href = newUrl.toString();
                } else {
                    const controller = window.__WEBDECK_CONTROLLER__;
                    if (controller && controller.reloadManager) {
                        await controller.reloadManager.handleReloadDeck({ preferLocalStorage: true });
                    } else if (controller) {
                        await controller.handleReloadDeck({ preferLocalStorage: true });
                    } else {
                        window.location.reload();
                    }
                }
            }
        };
        return channel;
    }

    /**
     * Cleans up resources.
     */
    destroy() {
        if (this.bc) this.bc.close();
        this.removeAllListeners();
        this.deck = null;
        this.elements = null;
        this.slideNavigator = null;
        this.breakManager = null;
    }
}
