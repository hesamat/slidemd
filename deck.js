// Deterministic HTML deck runtime (Markdown deck schema)
import { DESIGN_SIZE, normalizeCodeLanguage } from "./src/utils.js";
import { AssetLoader } from "./src/asset-loader.js";
import { ContentEnhancer } from "./src/content-enhancer.js";
import { DeckLoader } from "./src/deck-loader.js";
import { DeckController } from "./src/deck-controller.js";
import { SlideRenderer } from "./src/slide-renderer.js";

(() => {
    "use strict";

    function applyRoleUiFromUrl() {
        const url = new URL(window.location.href);
        const roleFromUrl = url.searchParams.get("role");
        const isPresenter = roleFromUrl !== "viewer";

        document.documentElement.setAttribute("data-webdeck-role", isPresenter ? "presenter" : "viewer");

        const roleLabelEl = document.getElementById("roleLabel");
        if (roleLabelEl) {
            roleLabelEl.textContent = isPresenter ? "Presenter" : "Viewer";
            roleLabelEl.className = `pill pill--${isPresenter ? "presenter" : "viewer"}`;
        }

        const presenterPanel = document.getElementById("presenterPanel");
        if (presenterPanel) {
            presenterPanel.classList.toggle("webdeck-hidden", !isPresenter);
        }

        const togglePresenterBtn = document.getElementById("togglePresenterBtn");
        if (togglePresenterBtn) {
            togglePresenterBtn.textContent = isPresenter ? "Open Viewer Window" : "Open Presenter Window";
        }
    }

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
        const deck = DeckLoader.normalizeDeck(raw);

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
            roleLabelEl: $("roleLabel"),
            deckTitleEl: $("deckTitle"),
            deckSelectEl: $("deckSelect"),
            prevBtn: $("prevBtn"),
            nextBtn: $("nextBtn"),
            gotoBtn: $("gotoBtn"),
            togglePresenterBtn: $("togglePresenterBtn"),
            printBtn: $("printBtn"),
            presenterPanel: $("presenterPanel"),
            nextPreview: $("nextPreview"),
            notesContainer: $("notesContainer"),
            viewerPresenterBtn: $("viewerPresenterBtn"),
            timeDisplay: $("timeDisplay"),
            timerToggle: $("timerToggle"),
        };

        // Deck switching UI (works in dev via decks/catalog.json, and in build via embedded #deckCatalog)
        if (elements.deckSelectEl) {
            try {
                const catalogRaw = await DeckLoader.loadDeckCatalog();
                const catalog = DeckLoader.normalizeCatalog(catalogRaw);
                const currentKey = DeckLoader.getDeckKeyFromUrl() || catalog?.default || "deck.md";

                const decks = catalog?.decks || [];
                if (decks.length === 0) {
                    elements.deckSelectEl.innerHTML = "";
                    elements.deckSelectEl.disabled = true;
                } else {
                    elements.deckSelectEl.innerHTML = decks
                        .map((d) => `<option value="${String(d.key).replace(/"/g, "&quot;")}">${String(d.title).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</option>`)
                        .join("");
                    elements.deckSelectEl.value = currentKey;
                    elements.deckSelectEl.disabled = false;

                    elements.deckSelectEl.addEventListener("change", () => {
                        const nextKey = elements.deckSelectEl.value;
                        const url = new URL(window.location.href);
                        url.searchParams.set("deck", nextKey);
                        // Reset slide hash when changing decks.
                        url.hash = "#slide-1";
                        window.location.href = url.toString();
                    });
                }
            } catch {
                // If catalog fails, keep deck working; just disable the selector.
                elements.deckSelectEl.disabled = true;
            }
        }

        if (elements.deckTitleEl) {
            elements.deckTitleEl.textContent = deckTitleText;
        }

        elements.slideCountEl.textContent = String(deck.slides.length);

        // Create controller and initialize
        const controller = new DeckController(deck, elements);
        await controller.init();

        const deckHtmlText = (d) => {
            if (!d || !Array.isArray(d.slides)) return "";
            const parts = [];
            for (const s of d.slides) {
                if (!s || typeof s !== "object") continue;
                if (s.areas && typeof s.areas === "object") {
                    for (const v of Object.values(s.areas)) {
                        if (typeof v === "string" && v) parts.push(v);
                    }
                }
                if (typeof s.notes === "string" && s.notes) parts.push(s.notes);
                if (typeof s.background === "string" && s.background) parts.push(s.background);
            }
            return parts.join("\n");
        };

        const needsEnhancers = (text) => {
            if (!text) return false;
            // Prism: code blocks, KaTeX: math delimiters, D2: .d2 blocks
            return (
                /<pre\b[\s\S]*?<code\b/i.test(text) ||
                /\$\$|\$|\\\(|\\\[|\\begin\{/.test(text) ||
                /class=["'][^"']*\bd2\b[^"']*["']/i.test(text)
            );
        };

        // Load optional enhancers after first render so a slow/failed asset doesn't blank the deck.
        const textForScan = deckHtmlText(deck);
        if (needsEnhancers(textForScan)) {
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

    function renderSlide(slide, { index = 0, isActive = true, deck = null } = {}) {
        const normalizedSlide = slide && typeof slide === "object" ? slide : {
            title: "",
            notes: "",
            layout: "",
            areas: { main: "" }
        };
        const d = deck && typeof deck === "object" ? deck : DeckLoader.normalizeDeck({
            meta: { id: "webdeck", title: "", course: "", aspect: "16:9", stage: { ...DESIGN_SIZE } },
            slides: [{
                id: normalizedSlide.id ?? 1,
                title: normalizedSlide.title ?? "",
                notes: normalizedSlide.notes ?? "",
                layout: normalizedSlide.layout ?? "",
                areas: normalizedSlide.areas && typeof normalizedSlide.areas === "object" ? normalizedSlide.areas : { main: "" },
            }],
        });

        const s = d.slides[index] || d.slides[0];
        return SlideRenderer.createSlideElement(d, s, index, isActive);
    }

    // Public API for editor tooling (non-module global)
    window.WebDeck = Object.assign(window.WebDeck || {}, {
        DESIGN_SIZE,
        normalizeCodeLanguage,
        ensureRichTextEnhancers: () => AssetLoader.ensureRichTextEnhancers(),
        enhanceRenderedContent: (rootEl) => ContentEnhancer.enhanceRenderedContent(rootEl),
        renderSlide,
        normalizeDeck: (raw) => DeckLoader.normalizeDeck(raw),
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
        applyRoleUiFromUrl();

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
