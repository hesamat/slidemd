// Deterministic HTML deck runtime (Markdown deck schema)
import { DESIGN_SIZE, normalizeCodeLanguage, isEmbedded } from "./src/core/utils.js";
import { AssetLoader } from "./src/core/asset-loader.js";
import { ContentEnhancer } from "./src/renderer/content-enhancer.js";
import { DeckLoader } from "./src/data/deck-loader.js";
import { DeckController } from "./src/engine/deck-controller.js";
import { SlideRenderer } from "./src/renderer/slide-renderer.js";
import { EditController } from "./src/editor/core/edit-controller.js";
import { ThemeManager } from "./src/renderer/theme-manager.js";
import { Notification } from "./src/renderer/notification.js";
import { RoleManager } from "./src/engine/role-manager.js";
import { ReloadManager } from "./src/engine/reload-manager.js";
import { ElementGatherer } from "./src/core/element-gatherer.js";
import { UiActions } from "./src/ui/ui-actions.js";
import { OpenDeckModal } from "./src/editor/ui/open-deck-modal.js";
import { DeckImagesResolver } from "./src/editor/image/deck-images-resolver.js";
import { ImagePicker } from "./src/editor/image/image-picker.js";
import { NewPresentationModal } from "./src/editor/new-presentation-modal.js";
import { ConversionModal } from "./src/editor/conversion-modal.js";
import { SlideStylePanel } from "./src/editor/ui/slide-style-panel.js";
import { TextBlockHandler } from "./src/editor/text/text-block-handler.js";
import { SettingsModal } from "./src/editor/settings-modal.js";
import { ImageInteractionHandler } from "./src/editor/image/image-interaction-handler.js";
import { DeckStore } from "./src/data/store/deck-store.js";
import { Logger } from "./src/core/logger.js";
import { hydrateIcons } from "./src/core/icon.js";
(() => {
  "use strict";

  const OVERLAY_ID = "deck-boot-error-overlay";
  const STYLE_ID = "deck-boot-error-styles";

  function injectErrorStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
            #${OVERLAY_ID} {
                position: fixed; inset: 0; z-index: 99999;
                display: flex; align-items: center; justify-content: center;
                height: 100vh; background: #1a1a1a;
                font-family: sans-serif; padding: 20px;
            }
            .${OVERLAY_ID}-container {
                max-width: 600px; background: #2a2a2a;
                padding: 30px; border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            }
            .${OVERLAY_ID}-container h2 {
                margin-top: 0; color: #ff6b6b;
            }
            .${OVERLAY_ID}-message {
                background: #000; padding: 15px; border-radius: 4px;
                overflow: auto; color: #fff;
            }
            .${OVERLAY_ID}-reload {
                margin-top: 15px; padding: 8px 16px; cursor: pointer;
            }
        `;
    document.head.appendChild(style);
  }

  function createErrorOverlay() {
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = `
            <div class="${OVERLAY_ID}-container">
                <h2>Deck Initialization Failed</h2>
                <pre id="${OVERLAY_ID}-message" class="${OVERLAY_ID}-message"></pre>
                <button class="${OVERLAY_ID}-reload">Reload</button>
            </div>
        `;
    overlay.querySelector("button").addEventListener("click", () => location.reload());
    return overlay;
  }

  function showBootError(err) {
    // Log full error (including stack) to aid debugging
    Logger.error("Deck initialization failed:", err);

    const message = err instanceof Error ? err.message : String(err);
    const stackOrMessage = err instanceof Error && err.stack ? err.stack : message;

    injectErrorStyles();

    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = createErrorOverlay();
      document.body.appendChild(overlay);
    }

    document.getElementById(`${OVERLAY_ID}-message`).textContent = stackOrMessage;
  }

  async function init() {
    const isViewer = RoleManager.isViewerMode();
    const isExported = window.__WEBDECK_EXPORTED__;

    // 1. Load & Normalize Data
    // Exported files (HTML/PDF) and non-viewer windows load normally
    // Viewer windows receive deck data via broadcast from editor
    const deck =
      isViewer && !isExported
        ? await DeckLoader.loadDeckDataFromBroadcast()
        : await DeckLoader.loadDeckData();

    // 2. Gather DOM Elements
    const elements = ElementGatherer.gatherElements();

    const deckStore = !isExported && !isViewer ? new DeckStore({ maxHistory: 100 }) : null;
    const initialMarkdown = DeckLoader.getSourceMarkdown();
    if (deckStore && initialMarkdown) deckStore.loadFromMarkdown(initialMarkdown);

    // 3. Setup Open Deck Modal (only in the live editor, not in exported HTML)
    if (!window.__WEBDECK_EXPORTED__) {
      OpenDeckModal.init();
      if (elements.menuOpenFileBtn) {
        elements.menuOpenFileBtn.addEventListener("click", () => OpenDeckModal.show());
      }
    }

    // 4. Update UI Initial State
    DeckController.updateSlideCount(elements, deck.slides.length, null, UiActions);
    UiActions.renderShortcutHints();

    // 5. Initialize Controller
    // Editor/ui dependencies are only wired in the live app — exported HTML
    // is a read-only viewer and JS_BUNDLE_ORDER (src/data/bundle-order.js)
    // doesn't include editor files. The isExported ternary is load-bearing:
    // it prevents ReferenceError for undeclared identifiers in the exported
    // bundle. Do NOT refactor these into a shared object or remove the guard
    // without also adding the editor files to JS_BUNDLE_ORDER.
    const controller = new DeckController(deck, elements, {
      deckStore,
      uiActions: UiActions,
      deckImagesResolver: isExported ? null : DeckImagesResolver,
      imagePicker: isExported ? null : ImagePicker,
      newPresentationModal: isExported ? null : NewPresentationModal,
      conversionModal: isExported ? null : ConversionModal,
      slideStylePanel: isExported ? null : SlideStylePanel,
      textBlockHandler: isExported ? null : TextBlockHandler,
      settingsModal: isExported ? null : SettingsModal,
      imageInteractionHandler: isExported ? null : ImageInteractionHandler,
    });
    await controller.init();
    deckStore?.setActiveIndex(controller.slideNavigator.currentIndex);

    // 5b. Wire up footer shortcut buttons
    document.querySelectorAll(".footer-shortcut").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.shortcut;
        if (action === "prev") controller.slideNavigator.prev();
        else if (action === "next") controller.slideNavigator.next();
        else if (action === "present") controller.roleManager.togglePresentWindow();
        else if (action === "edit") controller.toggleEditMode();
        else if (action === "reload") controller.reloadManager.handleReloadDeck();
        else if (action === "theme") ThemeManager.toggleTheme();
        else if (action === "fullscreen") controller.toggleFullscreen();
        else if (action === "goto") controller.slideNavigator.openGoToPrompt();
        else if (action === "search") controller.slideNavigator.openSearchPrompt();
        else if (action === "break") {
          if (controller.isEditMode()) {
            Notification.info("Break is unavailable in edit mode");
          } else {
            controller.breakManager.toggle();
          }
        }
      });
    });

    // 5c. Wire presenter-panel Go-to-Slide button
    const gotoSlideBtn = document.getElementById("gotoSlideBtn");
    if (gotoSlideBtn) {
      gotoSlideBtn.addEventListener("click", () => {
        controller.slideNavigator.openGoToPrompt();
      });
    }

    // 5d. Sync footer theme toggle icon on every slide change
    const syncFooterThemeIcon = () => {
      const slide = controller.deck.slides[controller.slideNavigator.currentIndex];
      const theme = slide?.theme || "";
      const btn = document.getElementById("toggleThemeMenuItem");
      if (!btn) return;
      const sunIcon = btn.querySelector(".theme-icon-light");
      const moonIcon = btn.querySelector(".theme-icon-dark");
      if (sunIcon) sunIcon.style.display = theme === "dark" ? "" : "none";
      if (moonIcon) moonIcon.style.display = theme === "dark" ? "none" : "";
    };
    controller.addEventListener("slidechange", syncFooterThemeIcon);
    syncFooterThemeIcon();

    // 6. Initialize Editor (Optional, only in the live editor, not viewer)
    if (!window.__WEBDECK_EXPORTED__ && !isViewer) {
      try {
        const editController = new EditController(deck, controller, elements, { deckStore });
        window.__WEBDECK_EDIT_CONTROLLER__ = editController;
        // Tear down the editor (and all its sub-module listeners) on
        // page navigation so we don't leak document/window listeners
        // back into a fresh page load.
        window.addEventListener("beforeunload", () => {
          editController.destroy();
        });
      } catch (e) {
        Logger.error("EditController initialization failed:", e);
      }
    }

    // 7. PRELOAD / WARMUP ENHANCERS
    // We scan the deck now to see what we need.
    // We trigger downloads immediately in the background (no await)
    const features = ContentEnhancer.scanDeck(deck);

    if (features.hasMath || features.hasCode) {
      AssetLoader.ensureRichTextEnhancers().catch((e) => Logger.warn(e));
    }

    if (features.hasMermaid) {
      // This starts the Mermaid initialization immediately so it's ready when we reach the slide
      ContentEnhancer.initializeMermaid().catch((e) =>
        Logger.warn("Mermaid initialization failed:", e),
      );
    }

    // 8. Signal Readiness FIRST
    // Don't block initialization on Mermaid rendering - it runs in background
    window.__WEBDECK_READY__ = true;
    window.dispatchEvent(new Event("webdeck:ready"));

    // 9. Normalize emoji sizing, then apply rich-text enhancers to the CURRENT view
    // in background (non-blocking).
    ContentEnhancer.normalizeEmojiText(elements.slidesContainer);
    const needsEnhancement = features.hasMermaid || features.hasMath || features.hasCode;
    if (!isExported && needsEnhancement) {
      ContentEnhancer.enhanceRenderedContent(elements.slidesContainer).catch((e) => Logger.warn(e));
    } else if (!needsEnhancement) {
      elements.slidesContainer.dataset.webdeckEnhanced = "1";
    }

    // 10. Setup deck data communication (editor listens for viewer requests)
    if (!isViewer) {
      controller.reloadManager.initEditorDeckListener();
    }

    return controller;
  }

  window.WebDeck = Object.assign(window.WebDeck || {}, {
    DESIGN_SIZE,
    normalizeCodeLanguage,
    ensureRichTextEnhancers: AssetLoader.ensureRichTextEnhancers,
    enhanceRenderedContent: ContentEnhancer.enhanceRenderedContent,
    renderSlide: SlideRenderer.renderSlide,
    normalizeDeck: DeckLoader.normalizeDeck,
  });

  document.addEventListener("DOMContentLoaded", () => {
    if (!RoleManager.hasViewerShell()) return;

    // Detect and mark embedded mode to prevent scroll conflicts
    const embedded = isEmbedded();
    if (embedded) {
      document.documentElement.setAttribute("data-embedded", "true");
      // Touch events still need to be prevented from bubbling
      window.addEventListener("touchmove", (e) => e.stopPropagation(), {
        passive: true,
        capture: true,
      });
    }

    // Parse URL once for all URL-based checks
    const url = new URL(window.location.href);

    // Check for showHidden URL parameter (before auto-redirect so it's preserved)
    if (url.searchParams.has("showHidden") && url.searchParams.get("showHidden") === "1") {
      document.documentElement.setAttribute("data-show-hidden", "true");
    }

    // Auto-redirect checks (optional)
    // Skip auto-redirect for exported HTML files (marked with __WEBDECK_EXPORTED__)
    if (
      !url.searchParams.has("role") &&
      !url.searchParams.has("noAutoRedirect") &&
      !window.__WEBDECK_EXPORTED__
    ) {
      url.searchParams.set("role", "editor");
      window.history.replaceState({}, "", url.toString());
    }

    RoleManager.initRole();
    ThemeManager.initTheme();

    // Hydrate <i data-icon="..."> placeholders into SVG icons.
    // Runs early so icons are present before modals/dropdowns open.
    // Skipped in exported HTML — the export bundle doesn't include the
    // Lucide dependency, and exported HTML has no toolbar placeholders.
    if (!window.__WEBDECK_EXPORTED__ && typeof hydrateIcons === "function") {
      hydrateIcons(document);
    }

    window.__WEBDECK_RELOAD_CHANNEL__ = ReloadManager.initReloadChannel();

    if (SlideRenderer.showLoadingState) {
      SlideRenderer.showLoadingState();
    } else {
      const container = document.getElementById("slidesContainer");
      if (container) container.innerHTML = '<div class="loader">Loading...</div>';
    }

    init()
      .then((ctrl) => {
        window.__WEBDECK_CONTROLLER__ = ctrl;

        // Connect to CLI dev server SSE for live reload
        connectLiveReload();
      })
      .catch((e) => {
        Logger.error("Deck init failed:", e);
        showBootError(e);
      });
  });

  /**
   * Connect to the CLI dev server's SSE endpoint for live reload.
   * Silently does nothing if no CLI server is running.
   */
  function connectLiveReload() {
    // Skip live reload in exported HTML files
    if (window.__WEBDECK_EXPORTED__) return;
    try {
      const evtSource = new EventSource("/api/events");
      evtSource.onmessage = (event) => {
        if (event.data === "reload") {
          Logger.info("[LiveReload] Change detected, reloading...");
          window.location.reload();
        }
      };
      evtSource.onerror = () => {
        // EventSource auto-reconnects by default.
        // If server is not running, errors keep firing — log once,
        // then stop reporting to avoid console noise.
        if (!evtSource._reconnectWarned) {
          evtSource._reconnectWarned = true;
          Logger.info("[LiveReload] Disconnected — will retry automatically");
        }
      };
    } catch {
      // EventSource not available or server not running
    }
  }
})();
