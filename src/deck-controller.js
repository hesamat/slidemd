import { getDeckId, EventEmitter, yieldToMain } from "./utils.js";
import { SlideRenderer } from "./slide-renderer.js";
import { ContentEnhancer } from "./content-enhancer.js";
import { DeckLoader } from "./deck-loader.js";
import { StageScaler } from "./stage-scaler.js";
import { BreakManager } from "./break-manager.js";
import { Notification } from "./notification.js";

// Shim for requestIdleCallback (prevents UI jank during background tasks)
const requestIdleCallback = window.requestIdleCallback || function(cb) {
    return setTimeout(() => {
        const start = Date.now();
        cb({ 
            didTimeout: false, 
            timeRemaining: () => Math.max(0, 50 - (Date.now() - start)) 
        });
    }, 1);
};

const cancelIdleCallback = window.cancelIdleCallback || function(id) {
    clearTimeout(id);
};

export class DeckController extends EventEmitter {
    
    static #KEYBOARD_ACTIONS = {
        "ArrowRight": "next", " ": "next", "PageDown": "next", "ArrowDown": "next",
        "ArrowLeft": "prev", "PageUp": "prev", "ArrowUp": "prev", "Backspace": "prev",
        "Home": "first", "End": "last", 
        "g": "goto", "G": "goto",
        "p": "presenter", "P": "presenter", 
        "e": "edit", "E": "edit",
        "b": "break", "B": "break", 
        "f": "fullscreen", "r": "reload"
    };

    static gatherElements() {
        const $ = (id) => document.getElementById(id);
        return {
            // Stage & Layout
            stageHost: $("stageHost"),
            deckStage: $("deckStage"),
            stageInner: $("stageInner"),
            slidesContainer: $("slidesContainer"),
            
            // Info
            slideNumberEl: $("slideNumber"),
            slideCountEl: $("slideCount"),
            deckTitleEl: $("deckTitle"),
            notesContainer: $("notesContainer"),
            nextPreview: $("nextPreview"),
            
            // Tools
            fileInput: $("fileInput"),
            editorPanel: $("editorPanel"),
            markdownEditor: $("markdownEditor"),
            addSlideBtn: $("addSlideBtn"),
            duplicateSlideBtn: $("duplicateSlideBtn"),
            deleteSlideBtn: $("deleteSlideBtn"),
            saveSlideBtn: $("saveSlideBtn"),
            toggleThumbnailsBtn: $("toggleThumbnailsBtn"),
            
            // Presenter / Modes
            presenterPanel: $("presenterPanel"),
            viewerPresenterBtn: $("viewerPresenterBtn"),
            togglePresenterBtn: $("togglePresenterBtn"),
            toggleEditModeBtn: $("toggleEditModeBtn"),
            toggleFullscreenBtn: $("toggleFullscreenBtn"),
            
            // Break Timer
            breakDurationSelect: $("breakDuration"),
            breakBtn: $("breakBtn"),
            
            // Menu
            menuBtn: $("menuBtn"),
            menuDropdown: $("menuDropdown"),
            menuOpenFileBtn: $("menuOpenFileBtn"),
            menuOpenRemoteBtn: $("menuOpenRemoteBtn"),
            menuReloadDeckBtn: $("menuReloadDeckBtn"),
            menuPrintBtn: $("menuPrintBtn"),
            printBtn: $("printBtn"),
            reloadDeckBtn: $("reloadDeckBtn") 
        };
    }

    static initReloadChannel() {
        const channel = new BroadcastChannel("webdeck-reload");
        channel.onmessage = async (ev) => {
            if (ev.data?.type === "reload") {
                window.location.hash = "";
                if (ev.data.url) {
                    const newUrl = new URL(window.location.href);
                    newUrl.searchParams.set("url", ev.data.url);
                    window.location.href = newUrl.toString();
                } else {
                    const controller = window.__WEBDECK_CONTROLLER__;
                    if (controller) await controller.handleReloadDeck({ preferLocalStorage: true });
                    else window.location.reload();
                }
            }
        };
        return channel;
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
        
        const panel = document.getElementById("presenterPanel");
        if (panel) panel.classList.toggle("webdeck-hidden", !isPresenter);
        
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
        this._enhanceIdleId = null;
        this._isPrinting = false; 

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
        this.breakManager.setBroadcastChannel(this.bc);
        this.bc.onmessage = (ev) => {
            if (ev.data?.type === "slide") this.handleIncomingState(ev.data.index);
            if (ev.data?.type === "break") this.breakManager.handleIncomingState(ev.data);
        };
    }

    applyRoleFromUrl() {
        const url = new URL(window.location.href);
        this.isPresenterWindow = url.searchParams.get("role") === "presenter";
        document.documentElement.setAttribute("data-webdeck-role", this.isPresenterWindow ? "presenter" : "viewer");
        requestAnimationFrame(() => this.applyStageScale());
    }

    async init() {
        const url = new URL(window.location.href);
        const hash = window.location.hash.match(/#slide-(\d+)/);
        const stored = localStorage.getItem(this.SLIDE_STATE_KEY);
        const restoreIndex = sessionStorage.getItem("webdeck_restore_slide_index");
        
        sessionStorage.removeItem("webdeck_restore_slide_index");
        
        this.currentIndex = hash ? parseInt(hash[1], 10) - 1 
            : restoreIndex !== null ? parseInt(restoreIndex, 10) 
            : (parseInt(stored, 10) || 0);

        this.breakManager.setDuration(parseInt(url.searchParams.get("breakMins"), 10) || 10);
        this.breakManager.setActive(url.searchParams.get("break") === "1", { broadcast: false });

        const title = DeckLoader.getDisplayTitle(this.deck);
        document.title = title;
        DeckController.updateDeckTitle(this.elements, title);

        this.preloadEnhancers();

        this.elements.slidesContainer.innerHTML = "";
        this.deck.slides.forEach((s, i) => {
            this.elements.slidesContainer.appendChild(
                SlideRenderer.createSlideElement(this.deck, s, i, i === this.currentIndex)
            );
        });

        this.goTo(this.currentIndex, { broadcast: false });
        this.applyStageScale();
        
        // Immediately enhance the first slide (don't wait for idle)
        requestAnimationFrame(() => this.enhanceActiveSlideNow());
    }

    preloadEnhancers() {
        import("./asset-loader.js")
            .then(({ AssetLoader }) => {
                AssetLoader.ensureRichTextEnhancers().catch(console.warn);
                // Scan deck and warmup D2 if needed
                const { hasD2 } = ContentEnhancer.scanDeck(this.deck);
                if (hasD2) ContentEnhancer.warmupD2().catch(console.warn);
            })
            .catch(console.warn);
    }

    setupEventListeners() {
        const listen = (el, evt, fn) => el?.addEventListener(evt, fn);

        document.addEventListener("keydown", (e) => this.handleKeyboard(e));
        document.addEventListener("click", (e) => this.handleDocumentClick(e));
        document.addEventListener("fullscreenchange", () => this.applyStageScale());
        window.addEventListener("storage", (e) => this.handleStorage(e));
        window.addEventListener("resize", () => this.applyStageScale());
        window.addEventListener("beforeprint", () => this.handleBeforePrint());
        window.addEventListener("webdeck-load-local", (e) => this.handleLocalFileLoad(e));

        listen(this.elements.togglePresenterBtn, "click", () => this.togglePresenterWindow());
        listen(this.elements.viewerPresenterBtn, "click", () => this.togglePresenterWindow());
        listen(this.elements.printBtn, "click", () => this.handlePrint());
        listen(this.elements.breakBtn, "click", () => this.breakManager.toggle());
        listen(this.elements.toggleFullscreenBtn, "click", () => this.toggleFullscreen());
        
        listen(this.elements.menuBtn, "click", () => this.toggleMenu());
        listen(this.elements.menuOpenFileBtn, "click", () => this.closeMenu());
        listen(this.elements.menuOpenRemoteBtn, "click", () => this.closeMenu());
        listen(this.elements.menuReloadDeckBtn, "click", () => { this.handleReloadDeck(); this.closeMenu(); });
        listen(this.elements.menuPrintBtn, "click", () => { this.handlePrint(); this.closeMenu(); });

        listen(this.elements.breakDurationSelect, "change", (e) => {
            this.breakManager.setDuration(parseInt(e.target.value, 10) || 10);
        });
        
        listen(this.elements.fileInput, "change", (e) => {
            if (e.target.files?.[0]) {
                localStorage.setItem("webdeck_local_file_name", e.target.files[0].name);
            }
        });
    }

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

            if (!raw) throw new Error("No deck source available");
            
            const newDeck = await DeckLoader.processRawData(raw);
            await this.replaceDeck(newDeck);
        } catch (err) {
            console.error("Reload failed:", err);
            Notification.error("Failed to reload deck: " + err.message);
        }
    }

    async replaceDeck(newDeck) {
        const preservedIndex = Math.min(this.currentIndex, newDeck.slides.length - 1);
        this.deck = newDeck;
        
        this.breakManager.deck = newDeck;
        this.breakManager.breakStateKey = `webdeck:${getDeckId(newDeck)}:break`;
        
        const title = DeckLoader.getDisplayTitle(newDeck);
        document.title = title;
        DeckController.updateDeckTitle(this.elements, title);

        this.elements.slidesContainer.innerHTML = "";
        newDeck.slides.forEach((s, i) => {
            this.elements.slidesContainer.appendChild(
                SlideRenderer.createSlideElement(newDeck, s, i, i === preservedIndex)
            );
        });

        DeckController.updateSlideCount(this.elements, newDeck.slides.length);
        if (this.elements.floatSlideCounter) {
            this.elements.floatSlideCounter.textContent = `${this.currentIndex + 1} / ${newDeck.slides.length}`;
        }
        
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
        try {
            const { text, fileName } = event.detail || {};
            if (fileName) localStorage.setItem("webdeck_local_file_name", fileName);
            
            const newDeck = await DeckLoader.parseMarkdown(text);
            await this.replaceDeck(newDeck);
            this.broadcastReload();
        } catch (err) {
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
            case "edit": this.toggleEditMode(); break;
            case "break": this.breakManager.toggle(); break;
            case "fullscreen": this.toggleFullscreen(); break;
            case "reload": this.handleReloadDeck(); break;
        }
    }

    handleStorage(ev) {
        if (ev.key === this.SLIDE_STATE_KEY) {
            this.handleIncomingState(parseInt(ev.newValue, 10));
        } else if (ev.key === "webdeck_local_file_timestamp" && ev.newValue) {
            this.handleReloadDeck({ preferLocalStorage: true });
        }
    }

    handleDocumentClick(e) {
        if (this.elements.menuDropdown && !this.elements.menuDropdown.classList.contains("webdeck-hidden")) {
            if (!this.elements.menuDropdown.contains(e.target) && !this.elements.menuBtn.contains(e.target)) {
                this.elements.menuDropdown.classList.add("webdeck-hidden");
            }
        }
    }

    async handleBeforePrint() {
        if (this.elements.slidesContainer) {
            await this.handlePrint({ triggerBrowserPrint: false });
        }
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
        this.enhanceActiveSlideNow();
        this.dispatchEvent('slidechange', { index: this.currentIndex });
    }

    enhanceActiveSlideNow() {
        const activeSlide = this.elements.slidesContainer?.querySelector(".slide.active");
        if (activeSlide && activeSlide.dataset.webdeckEnhanced !== "1") {
            requestAnimationFrame(() => {
                ContentEnhancer.enhanceRenderedContent(activeSlide).then((success) => {
                    if (success) activeSlide.dataset.webdeckEnhanced = "1";
                });
            });
        }
    }

    handleIncomingState(index) {
        if (index !== this.currentIndex && !isNaN(index)) {
            this.goTo(index, { broadcast: false });
        }
    }

    next() { 
        if (this.breakManager.isActive) this.breakManager.setActive(false);
        else this.goTo(this.currentIndex + 1); 
    }

    prev() { 
        if (this.breakManager.isActive) this.breakManager.setActive(false);
        else this.goTo(this.currentIndex - 1); 
    }

    applyStageScale() { 
        StageScaler.applyStageScale(this.elements); 
    }

    render() {
        this.elements.slideNumberEl.textContent = String(this.currentIndex + 1);
        const slides = this.elements.slidesContainer.querySelectorAll(".slide");
        slides.forEach((s, i) => s.classList.toggle("active", i === this.currentIndex));
        
        if (this.elements.floatSlideCounter) {
            this.elements.floatSlideCounter.textContent = `${this.currentIndex + 1} / ${this.deck.slides.length}`;
        }
        
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

    openGoToPrompt() {
        const num = parseInt(prompt(`Go to slide (1–${this.deck.slides.length}):`), 10);
        if (num >= 1 && num <= this.deck.slides.length) this.goTo(num - 1);
    }

    toggleFullscreen() {
        if (document.fullscreenElement) document.exitFullscreen();
        else this.elements.stageHost?.requestFullscreen?.();
    }

    toggleEditMode() { 
        window.__WEBDECK_EDIT_CONTROLLER__?.toggleEditMode(); 
    }

    toggleMenu() { 
        this.elements.menuDropdown?.classList.toggle("webdeck-hidden"); 
    }

    closeMenu() { 
        this.elements.menuDropdown?.classList.add("webdeck-hidden"); 
    }

    togglePresenterWindow() {
        if (this.presenterWindowRef && !this.presenterWindowRef.closed) {
            return this.presenterWindowRef.close();
        }
        const url = new URL(window.location.href);
        url.searchParams.set("role", this.isPresenterWindow ? "viewer" : "presenter");
        this.presenterWindowRef = window.open(url.toString(), "_blank", "width=1100,height=700");
    }

    async handlePrint({ triggerBrowserPrint = true } = {}) {
        if (this._isPrinting) return;
        this._isPrinting = true;
        
        const notification = document.createElement('div');
        notification.style.cssText = "position:fixed;top:20px;right:20px;background:#333;color:white;padding:15px;border-radius:8px;z-index:9999;";
        notification.textContent = "Preparing slides for print...";
        document.body.appendChild(notification);
        
        try {
            if (!window.__WEBDECK_D2__) {
                await import("./asset-loader.js").then(m => m.AssetLoader.ensureD2Loaded());
            }

            const slides = this.elements.slidesContainer.querySelectorAll('.slide');
            for (let i = 0; i < slides.length; i++) {
                notification.textContent = `Rendering slide ${i+1}/${slides.length}...`;
                await ContentEnhancer.enhanceRenderedContent(slides[i], { renderAllSlides: true });
                // CRITICAL: Yield to main thread to prevent freezing
                await yieldToMain();
            }
        } catch (e) { 
            console.warn("Print prep failed:", e); 
        } finally { 
            notification.remove();
            this._isPrinting = false;
        }
        
        if (triggerBrowserPrint) window.print();
    }

    destroy() {
        if (this.bc) this.bc.close();
        if (this.breakManager) this.breakManager.destroy();
        this.removeAllListeners();
    }
}