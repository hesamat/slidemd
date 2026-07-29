/**
 * ReloadManager
 * Handles deck reloading from various sources and cross-window reload broadcasting.
 */

import { EventEmitter } from "../core/utils.js";
import { DeckLoader } from "../data/deck-loader.js";
import { MarkdownParser } from "../data/markdown-parser.js";
import { AssetLoader } from "../core/asset-loader.js";
import { SlideRenderer } from "../renderer/slide-renderer.js";
import { Notification } from "../renderer/notification.js";
import { UiActions } from "../ui/ui-actions.js";
import { RoleManager } from "./role-manager.js";
import { DeckImagesResolver } from "../editor/image/deck-images-resolver.js";
import { ImagePicker } from "../editor/image/image-picker.js";

export class ReloadManager extends EventEmitter {
  /**
   * Creates a new ReloadManager.
   * @param {Object} deck - The current deck object
   * @param {Object} elements - DOM element references
   * @param {Object} options - Configuration options
   * @param {SlideNavigator} options.slideNavigator - The slide navigator instance
   * @param {BreakManager} options.breakManager - The break manager instance
   * @param {FreezeManager} options.freezeManager - The freeze manager instance
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
    this.freezeManager = options.freezeManager;
    this.getDeckId = options.getDeckId || (() => "webdeck");
    this.bc = null;
    this.deckChannel = null;
  }

  /**
   * Initializes the broadcast channel for slide synchronization.
   */
  initBroadcastChannel() {
    const getDeckId = this.getDeckId;
    if (this.bc) this.bc.close();
    this.bc = new BroadcastChannel(getDeckId(this.deck));
    if (this.breakManager) this.breakManager.setBroadcastChannel(this.bc);
    if (this.freezeManager) this.freezeManager.setBroadcastChannel(this.bc);
    if (this.slideNavigator) this.slideNavigator.setBroadcastChannel(this.bc);
    this.bc.onmessage = (ev) => {
      if (ev.data?.type === "slide") this.slideNavigator?.handleIncomingState(ev.data.index);
      if (ev.data?.type === "break") this.breakManager?.handleIncomingState(ev.data);
      if (ev.data?.type === "freeze") this.freezeManager?.handleIncomingState(ev.data);
    };
  }

  /**
   * Initializes the deck data channel for receiving deck updates from editor.
   * Only used by viewer windows.
   */
  initDeckDataChannel() {
    if (!RoleManager.isViewerMode()) return;

    // Close existing channel if it exists
    if (this.deckChannel) {
      this.deckChannel.close();
    }

    this.deckChannel = new BroadcastChannel("webdeck-deck");
    this.deckChannel.onmessage = async (ev) => {
      if (ev.data?.type === "deck") {
        const newDeck = ev.data.deck;
        await this.replaceDeck(newDeck, { startAtFirstSlide: false });
      }
    };
  }

  /**
   * Handles deck reloading from file handle or localStorage.
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
          "You have unsaved changes. Reloading the deck will replace all your changes with the saved file. Continue?",
        );
        if (!confirmed) {
          return;
        }
      }
    }

    try {
      let raw;
      // Try file handle first (only if supported by browser)
      if (DeckLoader.supportsFileSystemAPI) {
        try {
          const deckId = this.getDeckId(this.deck);
          raw = await DeckLoader.reloadFromFileHandle(deckId);
        } catch (e) {
          console.warn("[Reload] File handle check failed:", e.message);
          raw = null;
        }
      }

      // Try to re-fetch the original source before falling back to localStorage
      if (!raw) {
        const hasLocalData = localStorage.getItem("webdeck_local_file");

        if (!hasLocalData) {
          // No localStorage data and no file handle - show welcome deck
          Notification.info("No deck loaded. Use Menu → Open File to load a presentation.");
          return;
        }

        // Try to re-fetch the original source for fresh content
        if (!preferLocalStorage) {
          const sourceUrl = localStorage.getItem("webdeck_source_url");
          if (sourceUrl) {
            try {
              const response = await fetch(sourceUrl, { cache: "no-cache" });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const contentType = response.headers.get("content-type") || "";
              let freshText;
              if (contentType.includes("application/json")) {
                const data = await response.json();
                freshText = data?.markdown;
              } else {
                freshText = await response.text();
              }
              if (!freshText) throw new Error("No markdown content in response");
              await AssetLoader.ensureMarkdownItLoaded();
              const newDeck = new MarkdownParser().parseDeckMarkdown(freshText);
              // Update localStorage with fresh content
              localStorage.setItem("webdeck_local_file", freshText);
              localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
              const processed = await DeckLoader.processRawData(newDeck);
              await this.replaceDeck(processed);
              return;
            } catch (e) {
              console.warn("[Reload] Source URL fetch failed, falling back to cache:", e.message);
            }
          }
        }

        const isFileSystemAPINotSupported = !DeckLoader.supportsFileSystemAPI;

        // When file system API is not supported, prompt user to re-upload file before using cached version
        if (isFileSystemAPINotSupported) {
          const shouldReupload = await Notification.promptActionOrCancel(
            "Reload Deck",
            "Your browser does not support automatic file reloading. Do you want to re-upload the file to see the latest changes, or use the cached version?",
            "Re-upload file",
          );

          if (shouldReupload) {
            const fileInput = this.elements?.fileInput || window.__WEBDECK_ELEMENTS__?.fileInput;
            if (fileInput) {
              fileInput.click();
            } else {
              console.warn("[Reload] File input not found");
            }
            // Return early - don't reload from cache
            return;
          }
          // If user chose "Use cached version", fall through to localStorage reload
        }

        raw = await DeckLoader.loadFromLocalStorage();
        if (!raw) {
          throw new Error("Failed to parse the stored file. Check the markdown syntax.");
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
   * Broadcasts the deck data to viewer windows.
   * Called by the editor window after loading the deck.
   * @param {Object} deck - The deck object to broadcast
   */
  broadcastDeckData(deck) {
    const channel = new BroadcastChannel("webdeck-deck");
    channel.postMessage({ type: "deck", deck });
    channel.close();
  }

  /**
   * Initializes the presenter's deck request listener using request-response pattern.
   * The editor listens for "request-deck" messages from viewers and responds with deck data.
   * This ensures viewers can get deck data even if they open after the presenter.
   * Called by the presenter window after loading the deck.
   */
  initEditorDeckListener() {
    if (RoleManager.isViewerMode()) return;

    // Close existing channel if it exists
    if (this.deckChannel) {
      this.deckChannel.close();
    }

    this.deckChannel = new BroadcastChannel("webdeck-deck");
    this.deckChannel.onmessage = (ev) => {
      if (ev.data?.type === "request-deck") {
        // Respond to viewer's request with current deck data
        this.deckChannel.postMessage({ type: "deck", deck: this.deck });
      }
    };
  }

  /**
   * Replaces the current deck with a new one.
   * @param {Object} newDeck - The new deck object
   * @param {Object} options - Optional parameters
   * @param {boolean} options.startAtFirstSlide - If true, start at slide 0 instead of preserving current position
   * @returns {Promise<void>}
   */
  async replaceDeck(newDeck, { startAtFirstSlide = false } = {}) {
    const preservedIndex = startAtFirstSlide
      ? 0
      : Math.min(this.slideNavigator.currentIndex, newDeck.slides.length - 1);
    // Ensure we land on a visible slide (unless in edit mode)
    const visibleIndex = this.slideNavigator.getVisibleIndex(preservedIndex);
    this.deck = newDeck;

    // Update the navigator's deck reference
    this.slideNavigator.setDeck(newDeck);

    if (this.breakManager) {
      this.breakManager.deck = newDeck;
      this.breakManager.breakStateKey = `webdeck:${this.getDeckId(newDeck)}:break`;
    }

    if (this.freezeManager) {
      this.freezeManager.deck = newDeck;
      this.freezeManager.freezeStateKey = `webdeck:${this.getDeckId(newDeck)}:freeze`;
    }

    const title = DeckLoader.getDisplayTitle(newDeck);
    document.title = title;
    UiActions.updateDeckTitle(this.elements, title);

    this.elements.slidesContainer.innerHTML = "";
    newDeck.slides.forEach((s, i) => {
      this.elements.slidesContainer.appendChild(
        SlideRenderer.createSlideElement(newDeck, s, i, i === preservedIndex),
      );
    });

    // Count only visible slides for UI
    const visibleSlideCount = newDeck.slides.filter((s) => !s.hidden).length;
    UiActions.updateSlideCount(this.elements, visibleSlideCount, newDeck);
    if (this.elements.floatSlideCounter) {
      this.elements.floatSlideCounter.textContent = `${this.slideNavigator.currentIndex + 1} / ${visibleSlideCount}`;
    }

    this.initBroadcastChannel();
    this.slideNavigator.goTo(visibleIndex, { broadcast: false });
    this.dispatchEvent("deckchange", { deck: newDeck });

    // Broadcast deck data to viewer windows
    if (RoleManager.isEditorMode()) {
      this.broadcastDeckData(newDeck);
    }
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

      // Flush cached images so the new deck doesn't show stale thumbnails
      DeckImagesResolver.invalidateCache();
      ImagePicker.clearImageCache();

      const newDeck = await DeckLoader.parseMarkdown(text);
      await this.replaceDeck(newDeck, { startAtFirstSlide: true });
      // Note: No need to broadcastReload here since the file-open modal
      // already stored the data in localStorage with a timestamp,
      // which will trigger storage events in other tabs
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
        const controller = window.__WEBDECK_CONTROLLER__;
        if (controller && controller.reloadManager) {
          await controller.reloadManager.handleReloadDeck({ preferLocalStorage: true });
        } else if (controller) {
          await controller.handleReloadDeck({ preferLocalStorage: true });
        } else {
          window.location.reload();
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
    if (this.deckChannel) this.deckChannel.close();
    this.removeAllListeners();
    this.deck = null;
    this.elements = null;
    this.slideNavigator = null;
    this.breakManager = null;
  }
}
