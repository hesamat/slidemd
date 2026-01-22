// Deterministic HTML deck runtime (Markdown deck schema)
import { DESIGN_SIZE, normalizeCodeLanguage } from "./src/utils.js";
import { AssetLoader } from "./src/asset-loader.js";
import { ContentEnhancer } from "./src/content-enhancer.js";
import { DeckLoader } from "./src/deck-loader.js";
import { DeckController } from "./src/deck-controller.js";
import { SlideRenderer } from "./src/slide-renderer.js";
import { EditController } from "./src/edit-controller.js";

(() => {
    "use strict";

    function showBootError(err) {
        const msg = err instanceof Error ? err.message : String(err);
        document.body.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#1a1a1a;color:#ff6b6b;font-family:sans-serif;padding:20px;">
                <div style="max-width:600px;background:#2a2a2a;padding:30px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.3);">
                    <h2 style="margin-top:0;">Deck Initialization Failed</h2>
                    <pre style="background:#000;padding:15px;border-radius:4px;overflow:auto;color:#fff;">${msg}</pre>
                    <button onclick="location.reload()" style="margin-top:15px;padding:8px 16px;cursor:pointer;">Reload</button>
                </div>
            </div>
        `;
    }

    async function init() {
        // 1. Load & Normalize Data
        const deck = await DeckLoader.loadDeckData();

        // 2. Gather DOM Elements
        const elements = DeckController.gatherElements();

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

        // Apply enhancers to the CURRENT view immediately
        if (features.hasD2 || features.hasMath || features.hasCode) {
            await ContentEnhancer.enhanceRenderedContent(elements.slidesContainer);
        }

        // 8. Signal Readiness
        window.__WEBDECK_READY__ = true;
        window.dispatchEvent(new Event("webdeck:ready"));

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
        if (!DeckController.hasViewerShell()) return;

        // Auto-redirect checks (optional)
        const url = new URL(window.location.href);
        if (!url.searchParams.has("role") && !url.searchParams.has("noAutoRedirect")) {
            // url.searchParams.set("role", "presenter");
            // window.location.href = url.toString();
            // return;
        }

        DeckController.initRole();
        window.__WEBDECK_RELOAD_CHANNEL__ = DeckController.initReloadChannel();
        
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