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

    async function init() {
        // Load raw data and normalize
        const raw = await DeckLoader.loadDeckData();
        const url = new URL(window.location.href);
        const includeHidden = ["1", "true", "yes", "on"].includes((url.searchParams.get("showHidden") || "").toLowerCase());
        const deck = DeckLoader.normalizeDeck(raw, { includeHidden });

        // Gather Elements & Setup handlers
        const elements = DeckController.gatherElements();

        if (elements.openFileBtn && elements.fileInput) {
            DeckLoader.setupLocalFileHandler(elements.openFileBtn, elements.fileInput);
        }
        if (elements.openRemoteBtn) {
            DeckLoader.setupRemoteFileHandler(elements.openRemoteBtn);
        }

        DeckController.updateSlideCount(elements, deck.slides.length);

        // Initialize Controller
        // Note: Controller calculates and sets the title inside .init()
        const controller = new DeckController(deck, elements);
        await controller.init();

        // Initialize optional Editor
        try {
            const editController = new EditController(deck, controller, elements);
            window.__WEBDECK_EDIT_CONTROLLER__ = editController;
        } catch (e) {
            // Edit controller is optional
        }

        // Lazy load enhancers
        const textForScan = ContentEnhancer.deckHtmlText(deck);
        if (ContentEnhancer.needsEnhancers(textForScan)) {
            await AssetLoader.ensureRichTextEnhancers();
            await ContentEnhancer.enhanceRenderedContent(elements.slidesContainer);
        }

        // Signal readiness
        window.__WEBDECK_READY__ = true;
        window.dispatchEvent(new Event("webdeck:ready"));

        return controller;
    }

    // Public API
    window.WebDeck = Object.assign(window.WebDeck || {}, {
        DESIGN_SIZE,
        normalizeCodeLanguage,
        ensureRichTextEnhancers: AssetLoader.ensureRichTextEnhancers,
        enhanceRenderedContent: ContentEnhancer.enhanceRenderedContent,
        renderSlide: SlideRenderer.renderSlide,
        normalizeDeck: DeckLoader.normalizeDeck,
        deckHtmlText: ContentEnhancer.deckHtmlText,
    });

    document.addEventListener("DOMContentLoaded", () => {
        if (!DeckController.hasViewerShell()) return;

        // Auto-redirect to presenter mode for dev (unless ?role is already set or disabled)
        const url = new URL(window.location.href);
        if (!url.searchParams.has("role") && !url.searchParams.has("noAutoRedirect")) {
            url.searchParams.set("role", "presenter");
            window.location.href = url.toString();
            return;
        }

        // Immediate UI setup
        DeckController.initRole();
        window.__WEBDECK_RELOAD_CHANNEL__ = DeckController.initReloadChannel();
        DeckController.showLoadingState();

        // Start App
        init().then((ctrl) => {
            window.__WEBDECK_CONTROLLER__ = ctrl;
        }).catch((e) => {
            console.error("Deck init failed:", e);
            DeckController.showBootError(e);
        });
    });
})();