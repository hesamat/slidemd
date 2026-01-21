import { getDeckId, DESIGN_SIZE } from "./utils.js";
import { SlideRenderer } from "./slide-renderer.js";
import { ContentEnhancer } from "./content-enhancer.js";
import { DeckLoader } from "./deck-loader.js";
import { Notification } from "./notification.js";

/**
 * Manages deck navigation, state synchronization between windows,
 * responsive scaling, and the presenter/viewer roles.
 */
export class DeckController {
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
                console.log("BroadcastChannel: received reload message", ev.data);
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

    static showLoadingState() {
        const slidesContainer = document.getElementById("slidesContainer");
        if (slidesContainer) {
            slidesContainer.innerHTML = `
                <div style="position:absolute; inset:0; display:grid; place-items:center; padding:48px; color:rgba(15,23,42,.75);">
                    <div style="font-weight:800;">Loading deck…</div>
                </div>
            `;
        }
    }

    static showBootError(err) {
        try { window.__WEBDECK_LAST_ERROR__ = err; } catch { }
        const slidesContainer = document.getElementById("slidesContainer");
        if (!slidesContainer) return;
        const msg = err instanceof Error ? (err.stack || err.message) : String(err);
        slidesContainer.innerHTML = `
            <div style="position:absolute; inset:0; display:grid; place-items:center; padding:48px;">
                <div style="max-width:900px; width:100%; border:1px solid rgba(239,68,68,.35); background:rgba(254,242,242,.92); border-radius:16px; padding:18px 18px; color:rgba(127,29,29,.95);">
                    <div style="font-weight:800; margin-bottom:8px;">Deck failed to load</div>
                    <pre style="margin:0; white-space:pre-wrap; font-size:12px; line-height:1.4;">${msg.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
                </div>
            </div>
        `;
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
        if (elements.reloadDeckBtn && navigator.userAgent.includes('Firefox')) {
            elements.reloadDeckBtn.style.display = 'none';
        }

        this.deck = deck;
        this.elements = elements;
        this.currentIndex = 0;
        this.isPresenterWindow = false;
        this.isBreakActive = false;
        this.breakMinutes = 10;
        this.breakEndsAt = null;
        this._listeners = new Map();

        this.initIds();
        this.initBroadcastChannel();
        this.applyRoleFromUrl();
        this.setupEventListeners();
    }

    initIds() {
        const id = getDeckId(this.deck);
        this.SLIDE_STATE_KEY = `webdeck:${id}:slide`;
        this.BREAK_STATE_KEY = `webdeck:${id}:break`;
    }

    applyRoleFromUrl() {
        const url = new URL(window.location.href);
        this.isPresenterWindow = url.searchParams.get("role") === "presenter";
        requestAnimationFrame(() => this.applyStageScale());
    }

    initBroadcastChannel() {
        if (this.bc) this.bc.close();
        this.bc = new BroadcastChannel(getDeckId(this.deck));
        this.bc.onmessage = (ev) => {
            if (ev.data?.type === "slide") this.handleIncomingState(ev.data.index);
            if (ev.data?.type === "break") this.handleIncomingBreakState(ev.data);
        };
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
        listen(this.elements.breakBtn, "click", () => this.toggleBreak());
        listen(this.elements.reloadDeckBtn, "click", () => this.handleReloadDeck());

        listen(this.elements.breakDurationSelect, "change", (e) => {
            this.breakMinutes = parseInt(e.target.value, 10) || 10;
        });

        // Specific fix for Firefox/Legacy Input: Capture filename directly from the input
        // because the File System Access API isn't used here, and sometimes the loader
        // event doesn't carry the filename in this fallback mode.
        listen(this.elements.fileInput, "change", (e) => {
            if (e.target.files && e.target.files.length > 0) {
                const name = e.target.files[0].name;
                localStorage.setItem("webdeck_local_file_name", name);
            }
        });
    }

    /**
     * Determines the display title for the deck based on file source or metadata.
     * Priority: Local Filename > Remote URL Filename > Deck Metadata > Default
     */
    _determineTitle(deck) {
        // 1. Check for local file name (set by DeckLoader or handleLocalFileLoad)
        const localFileName = localStorage.getItem("webdeck_local_file_name");
        if (localFileName) {
            return localFileName;
        }

        // 2. Check for URL parameter file name
        const urlParam = new URL(window.location.href).searchParams.get("url");
        if (urlParam) {
            try {
                const pathParts = new URL(urlParam).pathname.split('/');
                const fileName = pathParts[pathParts.length - 1];
                if (fileName && fileName !== '/') {
                    return fileName;
                }
            } catch (e) { /* invalid url */ }
        }

        // 3. Deck metadata or default
        return (deck?.meta?.title || "Slide Deck").trim() || "Slide Deck";
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
                    raw = await this.loadFromLocalStorage();
                }
            }

            if (!raw) {
                throw new Error("No deck source available for reload");
            }

            await this.processRawData(raw);
            console.log("Deck reloaded successfully");
        } catch (err) {
            console.error("Failed to reload deck:", err);
            Notification.error("Failed to reload deck: " + (err instanceof Error ? err.message : String(err)));
        }
    }

    async processRawData(raw) {
        const url = new URL(window.location.href);
        const showHiddenRaw = (url.searchParams.get("showHidden") || "").trim().toLowerCase();
        const includeHidden = ["1", "true", "yes", "y", "on"].includes(showHiddenRaw);

        const newDeck = DeckLoader.normalizeDeck(raw, { includeHidden });
        await this.replaceDeck(newDeck);
    }

    /**
     * Replaces the current deck, updates title/UI, and preserves position.
     */
    async replaceDeck(newDeck) {
        const currentSlideIndex = this.currentIndex;
        const newSlideCount = newDeck.slides.length;
        const preservedIndex = Math.min(currentSlideIndex, newSlideCount - 1);

        this.deck = newDeck;

        // Calculate and Apply Title
        const deckTitleText = this._determineTitle(newDeck);
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
    }

    async loadFromLocalStorage() {
        const localFile = localStorage.getItem("webdeck_local_file");

        if (!localFile) return null;

        // Assume Markdown
        const { AssetLoader } = await import("./asset-loader.js");
        const { MarkdownParser } = await import("./markdown-parser.js");
        await AssetLoader.ensureMarkdownItLoaded();
        return new MarkdownParser().parseDeckMarkdown(localFile);
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
            // Save filename immediately so _determineTitle can use it
            // Note: If fileName is undefined (likely in Firefox via loader event),
            // the 'change' listener we added in setupEventListeners will have already 
            // saved it to localStorage, so we don't overwrite it here.
            if (fileName) {
                localStorage.setItem("webdeck_local_file_name", fileName);
            }

            // Always parse as Markdown (JSON logic removed)
            const { AssetLoader } = await import("./asset-loader.js");
            await AssetLoader.ensureMarkdownItLoaded();
            const { MarkdownParser } = await import("./markdown-parser.js");
            const raw = new MarkdownParser().parseDeckMarkdown(text);

            // Normalize and Replace
            const newDeck = DeckLoader.normalizeDeck(raw, { includeHidden: false });
            await this.replaceDeck(newDeck);

            console.log("Slides refreshed from local file");
        } catch (err) {
            console.error("Failed to load local file:", err);
            Notification.error("Failed to load file: " + err.message);
        }
    }

    handleKeyboard(e) {
        if (["input", "textarea"].includes(e.target.tagName.toLowerCase())) return;

        const navKeys = {
            "ArrowRight": () => this.next(),
            " ": () => this.next(),
            "PageDown": () => this.next(),
            "ArrowDown": () => this.next(),
            "ArrowLeft": () => this.prev(),
            "PageUp": () => this.prev(),
            "ArrowUp": () => this.prev(),
            "Backspace": () => this.prev(),
            "Home": () => this.goTo(0),
            "End": () => this.goTo(this.deck.slides.length - 1),
            "g": () => this.openGoToPrompt(), "G": () => this.openGoToPrompt(),
            "p": () => this.togglePresenterWindow(), "P": () => this.togglePresenterWindow(),
            "b": () => this.toggleBreak(), "B": () => this.toggleBreak(),
            "f": () => this.toggleFullscreen(),
            "r": () => this.handleReloadDeck()
        };

        if (this.isBreakActive && navKeys[e.key]) {
            e.preventDefault();
            this.setBreakActive(false);
            return;
        }
        if (navKeys[e.key]) {
            e.preventDefault();
            navKeys[e.key]();
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
            } else if (ev.key === this.BREAK_STATE_KEY) {
                this.handleIncomingBreakState(JSON.parse(ev.newValue));
            } else if (ev.key === "webdeck_local_file_timestamp" && ev.newValue) {
                this.handleReloadDeck({ preferLocalStorage: true });
            }
        } catch (e) { /* ignore */ }
    }

    setBreakActive(active, { broadcast = true, endsAt = null } = {}) {
        this.isBreakActive = !!active;

        if (this.isBreakActive) {
            if (!this.breakSlideEl) this.createBreakSlide();
            this.breakEndsAt = endsAt || (Date.now() + this.breakMinutes * 60000);

            const timeStr = new Date(this.breakEndsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            this.breakSlideEl.querySelector(".break-mins").textContent = `${this.breakMinutes} Minute Break`;
            this.breakSlideEl.querySelector(".break-end-time").textContent = timeStr;
        }

        this.breakSlideEl?.classList.toggle("webdeck-hidden", !this.isBreakActive);

        if (broadcast) {
            const payload = { type: "break", active: this.isBreakActive, mins: this.breakMinutes, endsAt: this.breakEndsAt };
            localStorage.setItem(this.BREAK_STATE_KEY, JSON.stringify(payload));
            this.bc.postMessage(payload);
        }
    }

    createBreakSlide() {
        const breakSlide = {
            layout: "title-slide", background: "#333", theme: "dark", align: "center",
            areas: { main: `<div class="break-title"><h1 class="break-mins"></h1><div class="break-end">Resume at <span class="break-end-time"></span></div></div>` }
        };
        this.breakSlideEl = SlideRenderer.createSlideElement(this.deck, breakSlide, 0, true);
        this.breakSlideEl.classList.add("webdeck-break-slide", "webdeck-hidden");
        this.breakSlideEl.style.zIndex = "80";
        this.elements.stageInner.appendChild(this.breakSlideEl);
    }

    handleIncomingBreakState(state) {
        if (state.mins) this.breakMinutes = state.mins;
        if (this.elements.breakDurationSelect) this.elements.breakDurationSelect.value = String(this.breakMinutes);
        this.setBreakActive(state.active, { broadcast: false, endsAt: state.endsAt });
    }

    toggleBreak() { this.setBreakActive(!this.isBreakActive); }

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
        const activeSlide = this.elements.slidesContainer?.querySelector(".slide.active");
        if (activeSlide && activeSlide.dataset.webdeckEnhanced !== "1") {
            ContentEnhancer.enhanceRenderedContent(activeSlide).then(() => {
                activeSlide.dataset.webdeckEnhanced = "1";
            });
        }
    }

    handleIncomingState(index) {
        if (index !== this.currentIndex && !isNaN(index)) this.goTo(index, { broadcast: false });
    }

    next() { this.isBreakActive ? this.setBreakActive(false) : this.goTo(this.currentIndex + 1); }
    prev() { this.isBreakActive ? this.setBreakActive(false) : this.goTo(this.currentIndex - 1); }

    applyStageScale() {
        const { stageHost: host, deckStage: stage, stageInner: inner } = this.elements;
        if (!host || !stage || !inner) return;

        const rect = host.getBoundingClientRect();
        const availW = rect.width - 32;
        const availH = rect.height - 32;

        if (availW <= 0 || availH <= 0) {
            setTimeout(() => this.applyStageScale(), 100);
            return;
        }

        const scale = Math.min(availW / DESIGN_SIZE.width, availH / DESIGN_SIZE.height, 1);
        stage.style.width = `${Math.round(DESIGN_SIZE.width * scale)}px`;
        stage.style.height = `${Math.round(DESIGN_SIZE.height * scale)}px`;
        stage.style.setProperty("--stage-scale", scale);
        inner.style.transform = `scale(${scale})`;
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

    addEventListener(event, callback) {
        if (!this._listeners.has(event)) this._listeners.set(event, []);
        this._listeners.get(event).push(callback);
    }

    removeEventListener(event, callback) {
        if (this._listeners.has(event)) {
            const listeners = this._listeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) listeners.splice(index, 1);
        }
    }

    dispatchEvent(event, detail) {
        if (this._listeners.has(event)) {
            this._listeners.get(event).forEach(cb => {
                try { cb(detail); } catch (e) { console.error(e); }
            });
        }
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

        this.breakMinutes = parseInt(url.searchParams.get("breakMins"), 10) || 10;
        this.isBreakActive = url.searchParams.get("break") === "1";

        // Determine title using the same logic as updates
        const deckTitleText = this._determineTitle(this.deck);
        document.title = deckTitleText;
        DeckController.updateDeckTitle(this.elements, deckTitleText);

        // Initial render
        this.elements.slidesContainer.innerHTML = "";
        this.deck.slides.forEach((s, i) => {
            this.elements.slidesContainer.appendChild(SlideRenderer.createSlideElement(this.deck, s, i, i === this.currentIndex));
        });

        this.setBreakActive(this.isBreakActive, { broadcast: false });
        this.goTo(this.currentIndex, { broadcast: false });
        this.applyStageScale();
    }
}