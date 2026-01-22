import { getDeckId, EventEmitter } from "./utils.js";
import { SlideRenderer } from "./slide-renderer.js";
import { ContentEnhancer } from "./content-enhancer.js";
import { DeckLoader } from "./deck-loader.js";
import { StageScaler } from "./stage-scaler.js";
import { BreakManager } from "./break-manager.js";
import { Notification } from "./notification.js";

/**
 * Manages deck navigation, state synchronization between windows,
 * responsive scaling, and the presenter/viewer roles.
 */
export class DeckController extends EventEmitter {
    // Keyboard mapping for navigation shortcuts
    static #KEYBOARD_ACTIONS = {
        "ArrowRight": "next",
        " ": "next",
        "PageDown": "next",
        "ArrowDown": "next",
        "ArrowLeft": "prev",
        "PageUp": "prev",
        "ArrowUp": "prev",
        "Backspace": "prev",
        "Home": "first",
        "End": "last",
        "g": "goto",
        "G": "goto",
        "p": "presenter",
        "P": "presenter",
        "b": "break",
        "B": "break",
        "f": "fullscreen",
        "r": "reload"
    };

    /**
     * Gathers all required DOM elements for the deck interface.
     * @returns {Object} Map of DOM element references
     */
    static gatherElements() {
        const $ = (id) => document.getElementById(id);
        return {
            stageHost: $("stageHost"),
            deckStage: $("deckStage"),
            stageInner: $("stageInner"),
            slidesContainer: $("slidesContainer"),
            slideNumberEl: $("slideNumber"),
            slideCountEl: $("slideCount"),
            deckTitleEl: $("deckTitle"),
            openFileBtn: $("openFileBtn"),
            openRemoteBtn: $("openRemoteBtn"),
            reloadDeckBtn: $("reloadDeckBtn"),
            fileInput: $("fileInput"),
            toggleEditModeBtn: $("toggleEditModeBtn"),
            togglePresenterBtn: $("togglePresenterBtn"),
            printBtn: $("printBtn"),
            editorPanel: $("editorPanel"),
            markdownEditor: $("markdownEditor"),
            addSlideBtn: $("addSlideBtn"),
            deleteSlideBtn: $("deleteSlideBtn"),
            saveSlideBtn: $("saveSlideBtn"),
            presenterPanel: $("presenterPanel"),
            nextPreview: $("nextPreview"),
            notesContainer: $("notesContainer"),
            viewerPresenterBtn: $("viewerPresenterBtn"),
            breakDurationSelect: $("breakDuration"),
            breakBtn: $("breakBtn"),
        };
    }

    /**
     * Sets up the reload channel listener for cross-window synchronization.
     * @returns {BroadcastChannel}
     */
    static initReloadChannel() {
        const reloadChannel = new BroadcastChannel("webdeck-reload");
        reloadChannel.onmessage = async (ev) => {
            if (ev.data?.type === "reload") {
                window.location.hash = "";

                if (ev.data.url) {
                    const newUrl = new URL(window.location.href);
                    newUrl.searchParams.set("url", ev.data.url);
                    window.location.href = newUrl.toString();
                } else {
                    const controller = window.__WEBDECK_CONTROLLER__;
                    if (controller) {
                        await controller.handleReloadDeck({ preferLocalStorage: true });
                    } else {
                        window.location.reload();
                    }
                }
            }
        };
        return reloadChannel;
    }

    static updateDeckTitle(elements, title) {
        if (elements.deckTitleEl) elements.deckTitleEl.textContent = title;
    }

    static updateSlideCount(elements, count) {
        if (elements.slideCountEl) elements.slideCountEl.textContent = String(count);
    }

    static hasViewerShell() {
        return !!(document.getElementById("slidesContainer") && document.getElementById("stageHost"));
    }

    static initRole() {
        const url = new URL(window.location.href);
        const isPresenter = url.searchParams.get("role") === "presenter";
        document.documentElement.setAttribute("data-webdeck-role", isPresenter ? "presenter" : "viewer");

        const presenterPanel = document.getElementById("presenterPanel");
        if (presenterPanel) presenterPanel.classList.toggle("webdeck-hidden", !isPresenter);

        const btn = document.getElementById("togglePresenterBtn");
        if (btn) btn.textContent = isPresenter ? "Open Viewer Window" : "Open Presenter Window";
    }

    constructor(deck, elements) {
        super();

        if (elements.reloadDeckBtn && navigator.userAgent.includes('Firefox')) {
            elements.reloadDeckBtn.style.display = 'none';
        }

        this.deck = deck;
        this.elements = elements;
        this.currentIndex = 0;
        this.isPresenterWindow = false;
        this.presenterWindowRef = null;

        this.initIds();
        this.initBreakManager();
        this.initBroadcastChannel();
        this.applyRoleFromUrl();
        this.setupEventListeners();
    }

    initIds() {
        const id = getDeckId(this.deck);
        this.SLIDE_STATE_KEY = `webdeck:${id}:slide`;
    }

    initBreakManager() {
        this.breakManager = new BreakManager(this.deck, this.elements, (state) => {
            this.dispatchEvent('breakchange', state);
        });
    }

    initBroadcastChannel() {
        if (this.bc) this.bc.close();
        this.bc = new BroadcastChannel(getDeckId(this.deck));
        // Share the broadcast channel with BreakManager
        this.breakManager.setBroadcastChannel(this.bc);
        // Listen for break messages from other windows
        this.bc.onmessage = (ev) => {
            if (ev.data?.type === "slide") this.handleIncomingState(ev.data.index);
            if (ev.data?.type === "break") this.breakManager.handleIncomingState(ev.data);
        };
    }

    applyRoleFromUrl() {
        const url = new URL(window.location.href);
        this.isPresenterWindow = url.searchParams.get("role") === "presenter";
        requestAnimationFrame(() => this.applyStageScale());
    }

    setupEventListeners() {
        const listen = (el, evt, fn) => el?.addEventListener(evt, fn);

        document.addEventListener("keydown", (e) => this.handleKeyboard(e));
        window.addEventListener("storage", (e) => this.handleStorage(e));
        window.addEventListener("resize", () => this.applyStageScale());
        window.addEventListener("beforeprint", () => this.handleBeforePrint());
        window.addEventListener("webdeck-load-local", (e) => this.handleLocalFileLoad(e));

        listen(this.elements.togglePresenterBtn, "click", () => this.togglePresenterWindow());
        listen(this.elements.viewerPresenterBtn, "click", () => this.togglePresenterWindow());
        listen(this.elements.printBtn, "click", () => this.handlePrint());
        listen(this.elements.breakBtn, "click", () => this.breakManager.toggle());
        listen(this.elements.reloadDeckBtn, "click", () => this.handleReloadDeck());

        listen(this.elements.breakDurationSelect, "change", (e) => {
            this.breakManager.setDuration(parseInt(e.target.value, 10) || 10);
        });

        // Specific fix for Firefox/Legacy Input: Capture filename directly from the input
        listen(this.elements.fileInput, "change", (e) => {
            if (e.target.files && e.target.files.length > 0) {
                const name = e.target.files[0].name;
                localStorage.setItem("webdeck_local_file_name", name);
            }
        });
    }

    /**
     * Reloads the current deck from its source.
     */
    async handleReloadDeck({ preferLocalStorage = false } = {}) {
        const url = new URL(window.location.href);
        const deckUrl = url.searchParams.get("url");

        try {
            let raw;
            if (deckUrl) {
                raw = await DeckLoader.loadFromUrl(deckUrl, { bypassCache: true });
                this.broadcastReload();
            } else {
                const deckId = getDeckId(this.deck);
                raw = await DeckLoader.reloadFromFileHandle(deckId);
                if (!raw || preferLocalStorage) {
                    raw = await DeckLoader.loadFromLocalStorage();
                }
            }

            if (!raw) {
                throw new Error("No deck source available for reload");
            }

            const newDeck = await DeckLoader.processRawData(raw);
            await this.replaceDeck(newDeck);
        } catch (err) {
            console.error("Failed to reload deck:", err);
            Notification.error("Failed to reload deck: " + (err instanceof Error ? err.message : String(err)));
        }
    }

    /**
     * Replaces the current deck, updates title/UI, and preserves position.
     */
    async replaceDeck(newDeck) {
        const currentSlideIndex = this.currentIndex;
        const newSlideCount = newDeck.slides.length;
        const preservedIndex = Math.min(currentSlideIndex, newSlideCount - 1);

        this.deck = newDeck;

        // Update break manager with new deck context
        this.breakManager.deck = newDeck;
        this.breakManager.breakStateKey = `webdeck:${getDeckId(newDeck)}:break`;

        // Calculate and Apply Title
        const deckTitleText = DeckLoader.getDisplayTitle(newDeck);
        document.title = deckTitleText;
        DeckController.updateDeckTitle(this.elements, deckTitleText);

        // Re-render
        this.elements.slidesContainer.innerHTML = "";
        newDeck.slides.forEach((s, i) => {
            this.elements.slidesContainer.appendChild(
                SlideRenderer.createSlideElement(newDeck, s, i, i === preservedIndex)
            );
        });

        DeckController.updateSlideCount(this.elements, newDeck.slides.length);

        // Reset channels
        this.initIds();
        this.initBroadcastChannel();

        this.goTo(preservedIndex, { broadcast: false });
        this.dispatchEvent('deckchange', { deck: newDeck });
    }

    broadcastReload() {
        const reloadChannel = new BroadcastChannel("webdeck-reload");
        reloadChannel.postMessage({ type: "reload" });
        reloadChannel.close();
        localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
        localStorage.setItem("webdeck_reload_flag", "1");
    }

    async handleLocalFileLoad(event) {
        const { text, fileName } = event.detail || {};
        try {
            if (fileName) {
                localStorage.setItem("webdeck_local_file_name", fileName);
            }

            // Use DeckLoader to parse the markdown
            const newDeck = await DeckLoader.parseMarkdown(text);

            await this.replaceDeck(newDeck);
            this.broadcastReload();
        } catch (err) {
            console.error("Failed to load local file:", err);
            Notification.error("Failed to load file: " + err.message);
        }
    }

    handleKeyboard(e) {
        if (["input", "textarea"].includes(e.target.tagName.toLowerCase())) return;

        const action = DeckController.#KEYBOARD_ACTIONS[e.key];
        if (!action) return;

        if (this.breakManager.isActive) {
            e.preventDefault();
            this.breakManager.setActive(false);
            return;
        }

        e.preventDefault();
        switch (action) {
            case "next": this.next(); break;
            case "prev": this.prev(); break;
            case "first": this.goTo(0); break;
            case "last": this.goTo(this.deck.slides.length - 1); break;
            case "goto": this.openGoToPrompt(); break;
            case "presenter": this.togglePresenterWindow(); break;
            case "break": this.breakManager.toggle(); break;
            case "fullscreen": this.toggleFullscreen(); break;
            case "reload": this.handleReloadDeck(); break;
        }
    }

    toggleFullscreen() {
        if (document.fullscreenElement) document.exitFullscreen();
        else this.elements.stageHost?.requestFullscreen?.();
    }

    async handleBeforePrint() {
        if (this.elements.slidesContainer) {
            try {
                const { AssetLoader } = await import("./asset-loader.js");
                await AssetLoader.ensureRichTextEnhancers();
                const allSlides = this.elements.slidesContainer.querySelectorAll(".slide");
                for (const slide of allSlides) {
                    if (slide.dataset.webdeckEnhanced === "1") continue;
                    await ContentEnhancer.enhanceRenderedContent(slide, { renderAllSlides: true });
                    slide.dataset.webdeckEnhanced = "1";
                }
            } catch (e) { console.error("Print prep failed:", e); }
        }
    }

    handleStorage(ev) {
        try {
            if (ev.key === this.SLIDE_STATE_KEY) {
                this.handleIncomingState(parseInt(ev.newValue, 10));
            } else if (ev.key === this.breakManager.breakStateKey) {
                this.breakManager.handleIncomingState(JSON.parse(ev.newValue));
            } else if (ev.key === "webdeck_local_file_timestamp" && ev.newValue) {
                this.handleReloadDeck({ preferLocalStorage: true });
            }
        } catch (e) { /* ignore */ }
    }

    goTo(index, { broadcast = true } = {}) {
        this.currentIndex = Math.max(0, Math.min(index, this.deck.slides.length - 1));

        if (broadcast) {
            localStorage.setItem(this.SLIDE_STATE_KEY, String(this.currentIndex));
            this.bc.postMessage({ type: "slide", index: this.currentIndex });
        }

        const url = new URL(window.location.href);
        url.hash = `#slide-${this.currentIndex + 1}`;
        history.replaceState({}, "", url.toString());

        this.render();
        this.lazyEnhanceActiveSlide();
        this.dispatchEvent('slidechange', { index: this.currentIndex });
    }

    lazyEnhanceActiveSlide() {
        if (this._enhanceTimeout) clearTimeout(this._enhanceTimeout);
        this._enhanceTimeout = setTimeout(() => {
            const activeSlide = this.elements.slidesContainer?.querySelector(".slide.active");
            if (activeSlide && activeSlide.dataset.webdeckEnhanced !== "1") {
                ContentEnhancer.enhanceRenderedContent(activeSlide).then((fullyFinished) => {
                    if (fullyFinished) {
                        activeSlide.dataset.webdeckEnhanced = "1";
                    }
                });
            }
        }, 20);
    }

    handleIncomingState(index) {
        if (index !== this.currentIndex && !isNaN(index)) this.goTo(index, { broadcast: false });
    }

    next() {
        if (this.breakManager.isActive) {
            this.breakManager.setActive(false);
        } else {
            this.goTo(this.currentIndex + 1);
        }
    }

    prev() {
        if (this.breakManager.isActive) {
            this.breakManager.setActive(false);
        } else {
            this.goTo(this.currentIndex - 1);
        }
    }

    applyStageScale() {
        StageScaler.applyStageScale(this.elements);
    }

    render() {
        this.elements.slideNumberEl.textContent = String(this.currentIndex + 1);
        const slides = this.elements.slidesContainer.querySelectorAll(".slide");
        slides.forEach((s, i) => s.classList.toggle("active", i === this.currentIndex));

        if (this.isPresenterWindow) {
            const next = this.deck.slides[this.currentIndex + 1];
            const slide = this.deck.slides[this.currentIndex];
            if (this.elements.nextPreview) {
                this.elements.nextPreview.textContent = next ? SlideRenderer.getSlideTitleForUi(next, this.currentIndex + 1) : "(End)";
            }
            if (this.elements.notesContainer) {
                this.elements.notesContainer.innerHTML = slide?.notes ? `<pre>${slide.notes}</pre>` : "<p>No notes</p>";
            }
        }
    }

    togglePresenterWindow() {
        if (this.presenterWindowRef && !this.presenterWindowRef.closed) {
            return this.presenterWindowRef.close();
        }
        const url = new URL(window.location.href);
        url.searchParams.set("role", this.isPresenterWindow ? "viewer" : "presenter");
        this.presenterWindowRef = window.open(url.toString(), "_blank", "width=1100,height=700");
    }

    openGoToPrompt() {
        const input = prompt(`Go to slide (1–${this.deck.slides.length}):`);
        const num = parseInt(input, 10);
        if (num >= 1 && num <= this.deck.slides.length) this.goTo(num - 1);
    }

    async handlePrint() {
        if (!window.__WEBDECK_D2__) {
            try {
                const { AssetLoader } = await import("./asset-loader.js");
                await AssetLoader.ensureD2Loaded();
            } catch (e) {
                console.warn("D2 failed to load for print:", e);
            }
        }
        try {
            await ContentEnhancer.renderD2Diagrams(this.elements.slidesContainer, { renderAllSlides: true });
        } catch (e) {
            console.warn("D2 render failed:", e);
        }
        window.print();
    }

    async init() {
        const url = new URL(window.location.href);
        const hash = window.location.hash.match(/#slide-(\d+)/);
        const stored = localStorage.getItem(this.SLIDE_STATE_KEY);
        const restoreIndex = sessionStorage.getItem("webdeck_restore_slide_index");
        sessionStorage.removeItem("webdeck_restore_slide_index");

        this.currentIndex = hash ? parseInt(hash[1], 10) - 1 :
            restoreIndex !== null ? parseInt(restoreIndex, 10) :
                (parseInt(stored, 10) || 0);

        // Initialize break manager with URL params
        const breakMins = parseInt(url.searchParams.get("breakMins"), 10) || 10;
        const breakActive = url.searchParams.get("break") === "1";
        this.breakManager.setDuration(breakMins);
        this.breakManager.setActive(breakActive, { broadcast: false });

        // Determine title using the same logic as updates
        const deckTitleText = DeckLoader.getDisplayTitle(this.deck);
        document.title = deckTitleText;
        DeckController.updateDeckTitle(this.elements, deckTitleText);

        // Initial render
        this.elements.slidesContainer.innerHTML = "";
        this.deck.slides.forEach((s, i) => {
            this.elements.slidesContainer.appendChild(SlideRenderer.createSlideElement(this.deck, s, i, i === this.currentIndex));
        });

        this.goTo(this.currentIndex, { broadcast: false });
        this.applyStageScale();
    }

    /**
     * Cleanup method to release resources when the controller is destroyed.
     */
    destroy() {
        if (this.bc) {
            this.bc.close();
        }
        if (this.breakManager) {
            this.breakManager.destroy();
        }
        if (this._enhanceTimeout) {
            clearTimeout(this._enhanceTimeout);
        }
        this.removeAllListeners();
    }
}
