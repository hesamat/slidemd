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

    function showBootError(err) {
        // Log full error (including stack) to aid debugging
        console.error("Deck initialization failed:", err);

        const message = err instanceof Error ? err.message : String(err);
        const stackOrMessage = err instanceof Error && err.stack ? err.stack : message;

        const overlayId = "deck-boot-error-overlay";
        let overlay = document.getElementById(overlayId);

        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = overlayId;
            overlay.style.position = "fixed";
            overlay.style.inset = "0";
            overlay.style.zIndex = "99999";
            overlay.style.display = "flex";
            overlay.style.alignItems = "center";
            overlay.style.justifyContent = "center";
            overlay.style.height = "100vh";
            overlay.style.background = "#1a1a1a";
            overlay.style.color = "#ff6b6b";
            overlay.style.fontFamily = "sans-serif";
            overlay.style.padding = "20px";

            const container = document.createElement("div");
            container.style.maxWidth = "600px";
            container.style.background = "#2a2a2a";
            container.style.padding = "30px";
            container.style.borderRadius = "8px";
            container.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";

            const heading = document.createElement("h2");
            heading.style.marginTop = "0";
            heading.textContent = "Deck Initialization Failed";

            const pre = document.createElement("pre");
            pre.style.background = "#000";
            pre.style.padding = "15px";
            pre.style.borderRadius = "4px";
            pre.style.overflow = "auto";
            pre.style.color = "#fff";
            pre.id = overlayId + "-message";
            pre.textContent = stackOrMessage;

            const button = document.createElement("button");
            button.textContent = "Reload";
            button.style.marginTop = "15px";
            button.style.padding = "8px 16px";
            button.style.cursor = "pointer";
            button.addEventListener("click", () => {
                // Force a full reload to try initialization again
                location.reload();
            });

            container.appendChild(heading);
            container.appendChild(pre);
            container.appendChild(button);
            overlay.appendChild(container);
            document.body.appendChild(overlay);
        } else {
            const pre = document.getElementById(overlayId + "-message");
            if (pre) {
                pre.textContent = stackOrMessage;
            }
        }
    }

    async function init() {
        // 1. Load & Normalize Data
        const deck = await DeckLoader.loadDeckData();

        // 2. Gather DOM Elements
        const elements = ElementGatherer.gatherElements();

        // 3. Setup File Handlers
        if (elements.menuOpenFileBtn && elements.fileInput) {
            DeckLoader.setupLocalFileHandler(elements.menuOpenFileBtn, elements.fileInput);
        }
        if (elements.menuOpenRemoteBtn) {
            DeckLoader.setupRemoteFileHandler(elements.menuOpenRemoteBtn);
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
            console.log("Editor skipped.");
        }

        // 7. PRELOAD / WARMUP ENHANCERS
        // We scan the deck now to see what we need.
        // We trigger downloads immediately in the background (no await)
        const features = ContentEnhancer.scanDeck(deck);

        if (features.hasMath || features.hasCode) {
            AssetLoader.ensureRichTextEnhancers().catch(e => console.warn(e));
        }

        if (features.hasD2) {
            // This starts the D2 worker immediately so it's ready when we reach the slide
            ContentEnhancer.warmupD2();
        }

        // 8. Signal Readiness FIRST
        // Don't block initialization on D2 rendering - it runs in background
        window.__WEBDECK_READY__ = true;
        window.dispatchEvent(new Event("webdeck:ready"));

        // 9. Apply enhancers to the CURRENT view in background (non-blocking)
        if (features.hasD2 || features.hasMath || features.hasCode) {
            ContentEnhancer.enhanceRenderedContent(elements.slidesContainer).catch(e => console.warn(e));
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
        const url = new URL(window.location.href);
        if (!url.searchParams.has("role") && !url.searchParams.has("noAutoRedirect")) {
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