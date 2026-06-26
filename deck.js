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
import { initializeDefaultProviders } from "./src/generation/ai-provider-registry.js";

// Initialize AI providers on startup (only in dev mode - stripped in exports)
if (typeof initializeDefaultProviders === "function") {
  initializeDefaultProviders();
}

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
    console.error("Deck initialization failed:", err);

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

    // 3. Setup File Handlers
    if (elements.menuOpenFileBtn && elements.fileInput) {
      DeckLoader.setupLocalFileHandler(elements.menuOpenFileBtn, elements.fileInput);
    }

    // 4. Update UI Initial State
    DeckController.updateSlideCount(elements, deck.slides.length);

    // 5. Initialize Controller
    const controller = new DeckController(deck, elements);
    await controller.init();

    // 5b. Wire up Welcome Slide "Open Example" button (if present)
    const openExampleBtn = document.getElementById("openExampleBtn");
    if (openExampleBtn) {
      openExampleBtn.addEventListener("click", () => DeckLoader.openExampleFile());
    }

    // 5c. Wire up footer shortcut buttons
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
        else if (action === "break") {
          if (controller.isEditMode()) {
            Notification.info("Break is unavailable in edit mode");
          } else {
            controller.breakManager.toggle();
          }
        }
      });
    });

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

    // 6. Initialize Editor (Optional)
    try {
      const editController = new EditController(deck, controller, elements);
      window.__WEBDECK_EDIT_CONTROLLER__ = editController;
    } catch (e) {
      console.error("EditController initialization failed:", e);
    }

    // 7. PRELOAD / WARMUP ENHANCERS
    // We scan the deck now to see what we need.
    // We trigger downloads immediately in the background (no await)
    const features = ContentEnhancer.scanDeck(deck);

    if (features.hasMath || features.hasCode) {
      AssetLoader.ensureRichTextEnhancers().catch((e) => console.warn(e));
    }

    if (features.hasMermaid) {
      // This starts the Mermaid initialization immediately so it's ready when we reach the slide
      ContentEnhancer.initializeMermaid().catch((e) =>
        console.warn("Mermaid initialization failed:", e),
      );
    }

    // 8. Signal Readiness FIRST
    // Don't block initialization on Mermaid rendering - it runs in background
    window.__WEBDECK_READY__ = true;
    window.dispatchEvent(new Event("webdeck:ready"));

    // 9. Apply enhancers to the CURRENT view in background (non-blocking)
    if (features.hasMermaid || features.hasMath || features.hasCode) {
      ContentEnhancer.enhanceRenderedContent(elements.slidesContainer).catch((e) =>
        console.warn(e),
      );
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
      window.location.href = url.toString();
      return;
    }

    RoleManager.initRole();
    ThemeManager.initTheme();
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
      })
      .catch((e) => {
        console.error("Deck init failed:", e);
        showBootError(e);
      });
  });
})();
