// Deterministic HTML deck runtime (Markdown deck schema)
import { DESIGN_SIZE, normalizeCodeLanguage } from "./src/utils.js";
import { AssetLoader } from "./src/asset-loader.js";
import { ContentEnhancer } from "./src/content-enhancer.js";
import { DeckLoader } from "./src/deck-loader.js";
import { DeckController } from "./src/deck-controller.js";
import { SlideRenderer } from "./src/slide-renderer.js";

(() => {
    "use strict";

    function showBootError(err) {
        try {
            window.__WEBDECK_LAST_ERROR__ = err;
        } catch {
            // ignore
        }

        const slidesContainer = document.getElementById("slidesContainer");
        if (!slidesContainer) return;

        const msg = err instanceof Error ? (err.stack || err.message) : String(err);
        slidesContainer.innerHTML = `
            <div style="position:absolute; inset:0; display:grid; place-items:center; padding:48px;">
                <div style="max-width:900px; width:100%; border:1px solid rgba(239,68,68,.35); background:rgba(254,242,242,.92); border-radius:16px; padding:18px 18px; color:rgba(127,29,29,.95);">
                    <div style="font-weight:800; margin-bottom:8px;">Deck failed to load</div>
                    <div style="font-size:12px; opacity:.9; margin-bottom:10px;">Open DevTools Console for details. This error is also available as <code>window.__WEBDECK_LAST_ERROR__</code>.</div>
                    <pre style="margin:0; white-space:pre-wrap; font-size:12px; line-height:1.4;">${msg.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
                </div>
            </div>
        `;
    }

    async function init() {
        const raw = await DeckLoader.loadDeckData();
        const url = new URL(window.location.href);
        const showHiddenRaw = (url.searchParams.get("showHidden") || "").trim().toLowerCase();
        const includeHidden = ["1", "true", "yes", "y", "on"].includes(showHiddenRaw);
        const deck = DeckLoader.normalizeDeck(raw, { includeHidden });

        // Set page title
        const deckTitleText = (deck?.meta?.title || "Slide Deck").trim() || "Slide Deck";
        document.title = deckTitleText;

        const $ = (id) => document.getElementById(id);

        const elements = {
            stageHost: $("stageHost"),
            deckStage: $("deckStage"),
            stageInner: $("stageInner"),
            slidesContainer: $("slidesContainer"),
            slideNumberEl: $("slideNumber"),
            slideCountEl: $("slideCount"),
            deckTitleEl: $("deckTitle"),
            openFileBtn: $("openFileBtn"),
            openRemoteBtn: $("openRemoteBtn"),
            fileInput: $("fileInput"),
            prevBtn: $("prevBtn"),
            nextBtn: $("nextBtn"),
            gotoBtn: $("gotoBtn"),
            togglePresenterBtn: $("togglePresenterBtn"),
            printBtn: $("printBtn"),
            presenterPanel: $("presenterPanel"),
            nextPreview: $("nextPreview"),
            notesContainer: $("notesContainer"),
            viewerPresenterBtn: $("viewerPresenterBtn"),
            breakDurationSelect: $("breakDuration"),
            breakBtn: $("breakBtn"),
        };

        // File loading handlers
        if (elements.openFileBtn && elements.fileInput) {
            elements.openFileBtn.addEventListener("click", () => {
                elements.fileInput.click();
            });

            elements.fileInput.addEventListener("change", async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                try {
                    const text = await file.text();
                    let fileType;
                    if (file.name.endsWith(".json")) {
                        fileType = "json";
                    } else if (file.name.endsWith(".md")) {
                        fileType = "md";
                    } else {
                        alert("Unsupported file type. Please use .md or .json files.");
                        return;
                    }

                    // Store file data in localStorage with timestamp (shared across windows)
                    localStorage.setItem("webdeck_local_file", text);
                    localStorage.setItem("webdeck_local_file_type", fileType);
                    localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
                    localStorage.removeItem("webdeck_local_file_loaded"); // Reset loaded count

                    // Send reload message to all other windows
                    const reloadChannel = new BroadcastChannel("webdeck-reload");
                    reloadChannel.postMessage({ type: "reload" });
                    reloadChannel.close();

                    // Clear the slide hash before reloading to start from slide 1
                    window.location.hash = "";
                    // Force a hard page reload
                    window.location.reload();
                } catch (err) {
                    console.error("Failed to load file:", err);
                    alert("Failed to load file: " + (err instanceof Error ? err.message : String(err)));
                }

                // Reset input so same file can be selected again
                elements.fileInput.value = "";
            });
        }

        if (elements.openRemoteBtn) {
            elements.openRemoteBtn.addEventListener("click", async () => {
                const url = prompt("Enter remote file URL (.md or .json):");
                if (!url) return;

                try {
                    // Validate URL by trying to load it
                    await DeckLoader.loadFromUrl(url);

                    // Send reload message to all other windows with URL
                    const reloadChannel = new BroadcastChannel("webdeck-reload");
                    reloadChannel.postMessage({ type: "reload", url });
                    reloadChannel.close();

                    // Reload with URL parameter, preserving other parameters
                    const newUrl = new URL(window.location.href);
                    newUrl.searchParams.set("url", url);
                    newUrl.hash = ""; // Clear slide hash to start from slide 1
                    window.location.href = newUrl.toString();
                } catch (err) {
                    alert("Failed to load remote file: " + (err instanceof Error ? err.message : String(err)));
                }
            });
        }

        if (elements.deckTitleEl) {
            elements.deckTitleEl.textContent = deckTitleText;
        }

        elements.slideCountEl.textContent = String(deck.slides.length);

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
        const hasViewerShell = !!(
            document.getElementById("slidesContainer") &&
            document.getElementById("stageHost") &&
            document.getElementById("deckStage")
        );
        if (!hasViewerShell) return;

        // Apply role immediately so UI is correct even if deck loading is slow.
        const url = new URL(window.location.href);
        const isPresenter = url.searchParams.get("role") === "presenter";
        document.documentElement.setAttribute("data-webdeck-role", isPresenter ? "presenter" : "viewer");

        const presenterPanel = document.getElementById("presenterPanel");
        if (presenterPanel) {
            presenterPanel.classList.toggle("webdeck-hidden", !isPresenter);
        }

        const togglePresenterBtn = document.getElementById("togglePresenterBtn");
        if (togglePresenterBtn) {
            togglePresenterBtn.textContent = isPresenter ? "Open Viewer Window" : "Open Presenter Window";
        }

        // Listen for reload messages from other windows
        const reloadChannel = new BroadcastChannel("webdeck-reload");
        reloadChannel.onmessage = (ev) => {
            if (ev.data?.type === "reload") {
                // Clear the slide hash before reloading
                window.location.hash = "";
                // Reload the page
                if (ev.data.url) {
                    // Remote file: update URL parameter
                    const newUrl = new URL(window.location.href);
                    newUrl.searchParams.set("url", ev.data.url);
                    window.location.href = newUrl.toString();
                } else {
                    // Local file: just reload (will read from localStorage)
                    window.location.reload();
                }
            }
        };

        // Show a minimal loading state until the controller renders slides.
        const slidesContainer = document.getElementById("slidesContainer");
        if (slidesContainer) {
            slidesContainer.innerHTML = `
                <div style="position:absolute; inset:0; display:grid; place-items:center; padding:48px; color:rgba(15,23,42,.75);">
                    <div style="font-weight:800;">Loading deck…</div>
                </div>
            `;
        }
        init().catch((e) => {
            console.error("Deck init failed:", e);
            showBootError(e);
        });
    });
})();
