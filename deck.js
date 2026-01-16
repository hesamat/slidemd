// Deterministic HTML deck runtime (Markdown deck schema)
import { DESIGN_SIZE, normalizeCodeLanguage } from "./src/utils.js";
import { AssetLoader } from "./src/asset-loader.js";
import { ContentEnhancer } from "./src/content-enhancer.js";
import { DeckLoader } from "./src/deck-loader.js";
import { DeckController } from "./src/deck-controller.js";
import { SlideRenderer } from "./src/slide-renderer.js";

(() => {
    "use strict";

    async function init() {
        // Load deck data
        const raw = await DeckLoader.loadDeckData();
        const url = new URL(window.location.href);
        const showHiddenRaw = (url.searchParams.get("showHidden") || "").trim().toLowerCase();
        const includeHidden = ["1", "true", "yes", "y", "on"].includes(showHiddenRaw);
        const deck = DeckLoader.normalizeDeck(raw, { includeHidden });

        // Set page title
        const deckTitleText = (deck?.meta?.title || "Slide Deck").trim() || "Slide Deck";
        document.title = deckTitleText;

        // Gather DOM elements
        const elements = DeckController.gatherElements();

        // Set up file handlers
        if (elements.openFileBtn && elements.fileInput) {
            DeckLoader.setupLocalFileHandler(elements.openFileBtn, elements.fileInput);
        }
        if (elements.openRemoteBtn) {
            DeckLoader.setupRemoteFileHandler(elements.openRemoteBtn);
        }

        // Update UI
        DeckController.updateDeckTitle(elements, deckTitleText);
        DeckController.updateSlideCount(elements, deck.slides.length);

        // Create controller and initialize
        const controller = new DeckController(deck, elements);
        await controller.init();

        // Load optional enhancers after first render so a slow/failed asset doesn't blank the deck.
        const textForScan = ContentEnhancer.deckHtmlText(deck);
        if (ContentEnhancer.needsEnhancers(textForScan)) {
            await AssetLoader.ensureRichTextEnhancers();
            await ContentEnhancer.enhanceRenderedContent(elements.slidesContainer);
        }

        // Signal readiness for automation/export (e.g. Playwright PDF capture)
        try {
            window.__WEBDECK_READY__ = true;
            window.dispatchEvent(new Event("webdeck:ready"));
        } catch {
            // ignore
        }
    }

    // Public API for editor tooling (non-module global)
    window.WebDeck = Object.assign(window.WebDeck || {}, {
        DESIGN_SIZE,
        normalizeCodeLanguage,
        ensureRichTextEnhancers: () => AssetLoader.ensureRichTextEnhancers(),
        enhanceRenderedContent: (rootEl) => ContentEnhancer.enhanceRenderedContent(rootEl),
        renderSlide: (slide, options) => SlideRenderer.renderSlide(slide, options),
        normalizeDeck: (raw) => DeckLoader.normalizeDeck(raw),
        deckHtmlText: (deck) => ContentEnhancer.deckHtmlText(deck),
        needsEnhancers: (text) => ContentEnhancer.needsEnhancers(text),
    });

    document.addEventListener("DOMContentLoaded", () => {
        // Only boot the viewer runtime on pages that have the viewer DOM
        if (!DeckController.hasViewerShell()) return;

        // Apply role immediately so UI is correct even if deck loading is slow.
        DeckController.initRole();

        // Set up reload channel
        DeckController.initReloadChannel();

        // Show a minimal loading state until the controller renders slides.
        DeckController.showLoadingState();

        // Initialize deck
        init().catch((e) => {
            console.error("Deck init failed:", e);
            DeckController.showBootError(e);
        });
    });
})();
