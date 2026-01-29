// Deterministic HTML deck runtime (Markdown deck schema)
import { DESIGN_SIZE, normalizeCodeLanguage } from "./src/core/utils.js";
import { AssetLoader } from "./src/core/asset-loader.js";
import { ContentEnhancer } from "./src/renderer/content-enhancer.js";
import { DeckLoader } from "./src/data/deck-loader.js";
import { DeckController } from "./src/engine/deck-controller.js";
import { SlideRenderer } from "./src/renderer/slide-renderer.js";
import { EditController } from "./src/editor/edit-controller.js";
import { ThemeManager } from "./src/renderer/theme-manager.js";
import { RoleManager } from "./src/engine/role-manager.js";
import { ReloadManager } from "./src/engine/reload-manager.js";
import { ElementGatherer } from "./src/core/element-gatherer.js";

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
        // Viewer windows receive deck data via broadcast from presenter
        const deck = (isViewer && !isExported)
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

        // 6. Initialize Editor (Optional)
        try {
            const editController = new EditController(deck, controller, elements);
            window.__WEBDECK_EDIT_CONTROLLER__ = editController;
        } catch (e) {
            // Editor skipped. Likely not in editor mode.;
        }

        // 7. PRELOAD / WARMUP ENHANCERS
        // We scan the deck now to see what we need.
        // We trigger downloads immediately in the background (no await)
        const features = ContentEnhancer.scanDeck(deck);

        if (features.hasMath || features.hasCode) {
            AssetLoader.ensureRichTextEnhancers().catch(e => console.warn(e));
        }

        if (features.hasMermaid) {
            // This starts the Mermaid initialization immediately so it's ready when we reach the slide
            ContentEnhancer.initializeMermaid().catch(e => console.warn("Mermaid initialization failed:", e));
        }

        // 8. Signal Readiness FIRST
        // Don't block initialization on Mermaid rendering - it runs in background
        window.__WEBDECK_READY__ = true;
        window.dispatchEvent(new Event("webdeck:ready"));

        // 9. Apply enhancers to the CURRENT view in background (non-blocking)
        if (features.hasMermaid || features.hasMath || features.hasCode) {
            ContentEnhancer.enhanceRenderedContent(elements.slidesContainer).catch(e => console.warn(e));
        }

        // 10. Broadcast deck data to viewer windows (presenter only)
        if (!isViewer) {
            const channel = new BroadcastChannel("webdeck-deck");
            channel.postMessage({ type: "deck", deck });
            channel.close();
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

        // Auto-redirect checks (optional)
        // Skip auto-redirect for exported HTML files (marked with __WEBDECK_EXPORTED__)
        const url = new URL(window.location.href);
        if (!url.searchParams.has("role") && !url.searchParams.has("noAutoRedirect") && !window.__WEBDECK_EXPORTED__) {
            url.searchParams.set("role", "presenter");
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

        init().then((ctrl) => {
            window.__WEBDECK_CONTROLLER__ = ctrl;
        }).catch((e) => {
            console.error("Deck init failed:", e);
            showBootError(e);
        });
    });
})();