import { getDeckId, DESIGN_SIZE } from "./utils.js";
import { SlideRenderer } from "./slide-renderer.js";
import { ContentEnhancer } from "./content-enhancer.js";

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
    }

    /**
     * Initializes the role state (viewer vs presenter) and updates the DOM accordingly.
     */
    static initRole() {
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
    }

    /**
     * Sets up the reload channel listener for cross-window synchronization.
     * @returns {BroadcastChannel} The created reload channel
     */
    static initReloadChannel() {
        const reloadChannel = new BroadcastChannel("webdeck-reload");
        reloadChannel.onmessage = (ev) => {
            if (ev.data?.type === "reload") {
                window.location.hash = "";
                if (ev.data.url) {
                    const newUrl = new URL(window.location.href);
                    newUrl.searchParams.set("url", ev.data.url);
                    window.location.href = newUrl.toString();
                } else {
                    window.location.reload();
                }
            }
        };
        return reloadChannel;
    }

    /**
     * Shows a minimal loading state in the slides container.
     */
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

    /**
     * Displays a boot error in the slides container.
     * @param {Error|string} err - The error to display
     */
    static showBootError(err) {
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
                    <pre style="margin:0; white-space:pre-wrap; font-size:12px; line-height:1.4;">${msg.replace(/</g, "<").replace(/>/g, ">")}</pre>
                </div>
            </div>
        `;
    }

    /**
     * Updates the deck title in the UI.
     * @param {Object} elements - DOM elements map
     * @param {string} title - The deck title
     */
    static updateDeckTitle(elements, title) {
        if (elements.deckTitleEl) {
            elements.deckTitleEl.textContent = title;
        }
    }

    /**
     * Updates the slide count in the UI.
     * @param {Object} elements - DOM elements map
     * @param {number} count - The total slide count
     */
    static updateSlideCount(elements, count) {
        if (elements.slideCountEl) {
            elements.slideCountEl.textContent = String(count);
        }
    }

    /**
     * Checks if the viewer shell is present in the DOM.
     * @returns {boolean} True if the viewer shell exists
     */
    static hasViewerShell() {
        return !!(
            document.getElementById("slidesContainer") &&
            document.getElementById("stageHost") &&
            document.getElementById("deckStage")
        );
    }
    /**
     * @param {Object} deck - The normalized deck data object.
     * @param {Object} elements - Map of DOM elements required for UI updates.
     */
    constructor(deck, elements) {
        this.deck = deck;
        this.elements = elements;
        this.currentIndex = 0;
        this.isPresenterWindow = false;
        this.isBreakActive = false;
        this.breakMinutes = 10;
        this.breakEndsAt = null;

        this.SLIDE_STATE_KEY = `webdeck:${getDeckId(deck)}:slide`;
        this.BREAK_STATE_KEY = `webdeck:${getDeckId(deck)}:break`;

        this.initBroadcastChannel();
        this.initRole();
        this.setupEventListeners();
    }

    /**
     * Determines the user role (viewer vs presenter) from URL parameters
     * and updates the document UI state accordingly.
     */
    initRole() {
        const url = new URL(window.location.href);
        this.isPresenterWindow = url.searchParams.get("role") === "presenter";

        document.documentElement.setAttribute("data-webdeck-role", this.isPresenterWindow ? "presenter" : "viewer");
        this.elements.presenterPanel?.classList.toggle("webdeck-hidden", !this.isPresenterWindow);

        if (this.elements.togglePresenterBtn) {
            this.elements.togglePresenterBtn.textContent = this.isPresenterWindow
                ? "Open Viewer Window"
                : "Open Presenter Window";
        }

        requestAnimationFrame(() => this.applyStageScale());
    }

    /**
     * Initializes the BroadcastChannel API for real-time synchronization 
     * across different tabs or windows of the same deck.
     */
    initBroadcastChannel() {
        this.bc = new BroadcastChannel(getDeckId(this.deck));
        this.bc.onmessage = (ev) => {
            if (ev.data?.type === "slide") this.handleIncomingState(ev.data.index);
            if (ev.data?.type === "break") this.handleIncomingBreakState(ev.data);
        };
    }

    /**
     * Attaches global event listeners for keyboard navigation, window resizing,
     * and storage sync.
     */
    setupEventListeners() {
        const listen = (el, evt, fn) => el?.addEventListener(evt, fn);

        document.addEventListener("keydown", (e) => this.handleKeyboard(e));
        window.addEventListener("storage", (e) => this.handleStorage(e));
        window.addEventListener("resize", () => this.applyStageScale());

        listen(this.elements.prevBtn, "click", () => this.prev());
        listen(this.elements.nextBtn, "click", () => this.next());
        listen(this.elements.gotoBtn, "click", () => this.openGoToPrompt());
        listen(this.elements.togglePresenterBtn, "click", () => this.togglePresenterWindow());
        listen(this.elements.viewerPresenterBtn, "click", () => this.togglePresenterWindow());
        listen(this.elements.printBtn, "click", () => window.print());
        listen(this.elements.breakBtn, "click", () => this.toggleBreak());

        listen(this.elements.breakDurationSelect, "change", (e) => {
            this.breakMinutes = parseInt(e.target.value, 10) || 10;
        });
    }

    /**
     * Maps physical keys to deck actions (navigation, fullscreen, break mode).
     * @param {KeyboardEvent} e 
     */
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
            "f": () => this.toggleFullscreen()
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

    /**
     * Requests or exits fullscreen mode for the slide stage.
     */
    toggleFullscreen() {
        if (document.fullscreenElement) document.exitFullscreen();
        else this.elements.stageHost?.requestFullscreen?.();
    }

    /**
     * Syncs state when localStorage changes (e.g., in a different tab).
     * @param {StorageEvent} ev 
     */
    handleStorage(ev) {
        try {
            if (ev.key === this.SLIDE_STATE_KEY) {
                this.handleIncomingState(parseInt(ev.newValue, 10));
            } else if (ev.key === this.BREAK_STATE_KEY) {
                this.handleIncomingBreakState(JSON.parse(ev.newValue));
            }
        } catch (e) { /* ignore malformed storage */ }
    }

    /**
     * Toggles the "Break" overlay and calculates the return time.
     * @param {boolean} active - Target state.
     * @param {Object} options
     * @param {boolean} options.broadcast - Whether to sync this change to other windows.
     * @param {number|null} options.endsAt - Specific timestamp for break end.
     */
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

    /**
     * Lazily creates the break overlay DOM element when first needed.
     */
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

    /**
     * Processes incoming break state from other windows.
     * @param {Object} state - The break state payload.
     */
    handleIncomingBreakState(state) {
        if (state.mins) this.breakMinutes = state.mins;
        if (this.elements.breakDurationSelect) this.elements.breakDurationSelect.value = String(this.breakMinutes);
        this.setBreakActive(state.active, { broadcast: false, endsAt: state.endsAt });
    }

    /**
     * Toggles the break mode on or off.
     */
    toggleBreak() { this.setBreakActive(!this.isBreakActive); }

    /**
     * Transitions the deck to a specific slide index.
     * Updates URL hash, local state, and triggers UI renders.
     * @param {number} index - The slide index to navigate to.
     * @param {Object} options
     * @param {boolean} options.broadcast - Whether to sync this move to other windows.
     */
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
    }

    /**
     * Runs ContentEnhancer (for code highlighting, math, etc.) only on 
     * the currently active slide to improve performance.
     */
    lazyEnhanceActiveSlide() {
        const activeSlide = this.elements.slidesContainer?.querySelector(".slide.active");
        if (activeSlide && activeSlide.dataset.webdeckEnhanced !== "1") {
            ContentEnhancer.enhanceRenderedContent(activeSlide).then(() => {
                activeSlide.dataset.webdeckEnhanced = "1";
            });
        }
    }

    /**
     * Responds to slide navigation requests from external tabs.
     * @param {number} index 
     */
    handleIncomingState(index) {
        if (index !== this.currentIndex && !isNaN(index)) this.goTo(index, { broadcast: false });
    }

    /** Navigates to the next slide. Dismisses break if active. */
    next() { this.isBreakActive ? this.setBreakActive(false) : this.goTo(this.currentIndex + 1); }

    /** Navigates to the previous slide. Dismisses break if active. */
    prev() { this.isBreakActive ? this.setBreakActive(false) : this.goTo(this.currentIndex - 1); }

    /**
     * Computes the CSS scale required to fit the 16:9 stage into the 
     * current viewport while maintaining aspect ratio.
     */
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

    /**
     * Updates slide visibility and refreshes the Presenter Panel (notes, previews).
     */
    render() {
        this.elements.slideNumberEl.textContent = String(this.currentIndex + 1);

        const slides = this.elements.slidesContainer.querySelectorAll(".slide");
        slides.forEach((s, i) => s.classList.toggle("active", i === this.currentIndex));

        if (this.isPresenterWindow) {
            const slide = this.deck.slides[this.currentIndex];
            const next = this.deck.slides[this.currentIndex + 1];

            if (this.elements.nextPreview) {
                this.elements.nextPreview.textContent = next ? SlideRenderer.getSlideTitleForUi(next, this.currentIndex + 1) : "(End)";
            }
            if (this.elements.notesContainer) {
                this.elements.notesContainer.innerHTML = slide?.notes ? `<pre>${slide.notes}</pre>` : "<p>No notes</p>";
            }
        }
    }

    /**
     * Opens a new window with the opposite role (Presenter -> Viewer or vice versa).
     */
    togglePresenterWindow() {
        if (this.presenterWindowRef && !this.presenterWindowRef.closed) {
            return this.presenterWindowRef.close();
        }
        const url = new URL(window.location.href);
        url.searchParams.set("role", this.isPresenterWindow ? "viewer" : "presenter");
        this.presenterWindowRef = window.open(url.toString(), "_blank", "width=1100,height=700");
    }

    /**
     * Displays a native browser prompt to navigate to a specific slide number.
     */
    openGoToPrompt() {
        const input = prompt(`Go to slide (1–${this.deck.slides.length}):`);
        const num = parseInt(input, 10);
        if (num >= 1 && num <= this.deck.slides.length) this.goTo(num - 1);
    }

    /**
     * Main bootstrapper for the controller. 
     * Loads initial state, renders the slide list, and applies scaling.
     */
    async init() {
        const url = new URL(window.location.href);

        // Load initial index from hash or storage
        const hash = window.location.hash.match(/#slide-(\d+)/);
        const stored = localStorage.getItem(this.SLIDE_STATE_KEY);
        this.currentIndex = hash ? parseInt(hash[1], 10) - 1 : (parseInt(stored, 10) || 0);

        // Load break settings from URL
        this.breakMinutes = parseInt(url.searchParams.get("breakMins"), 10) || 10;
        this.isBreakActive = url.searchParams.get("break") === "1";

        // Initial DOM generation for all slides
        this.elements.slidesContainer.innerHTML = "";
        this.deck.slides.forEach((s, i) => {
            this.elements.slidesContainer.appendChild(SlideRenderer.createSlideElement(this.deck, s, i, i === this.currentIndex));
        });

        // Sync initial UI state
        this.setBreakActive(this.isBreakActive, { broadcast: false });
        this.goTo(this.currentIndex, { broadcast: false });
        this.applyStageScale();
    }
}
