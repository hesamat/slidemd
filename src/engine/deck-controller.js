import { getDeckId, EventEmitter, isEmbedded } from "../core/utils.js";
import { SlideRenderer } from "../renderer/slide-renderer.js";
import { ContentEnhancer } from "../renderer/content-enhancer.js";
import { DeckLoader } from "../data/deck-loader.js";
import { StageScaler } from "../renderer/stage-scaler.js";
import { BreakManager } from "./break-manager.js";
import { FreezeManager } from "./freeze-manager.js";
import { ThemeManager } from "../renderer/theme-manager.js";
import { KeyboardHandler } from "./keyboard-handler.js";
import { WheelHandler } from "./wheel-handler.js";
import { RoleManager } from "./role-manager.js";
import { SlideNavigator } from "./slide-navigator.js";
import { PrintManager } from "../renderer/print-manager.js";
import { HtmlExportManager } from "../renderer/html-export-manager.js";
import { ReloadManager } from "./reload-manager.js";
import { UiActions } from "../ui/ui-actions.js";
import { AIGenerationController } from "../generation/ai-generation-controller.js";
import { GenerationActions } from "../ui/generation-actions.js";

export class DeckController extends EventEmitter {

    static updateDeckTitle(elements, title) {
        UiActions.updateDeckTitle(elements, title);
    }

    static updateSlideCount(elements, count) {
        UiActions.updateSlideCount(elements, count);
    }

    constructor(deck, elements) {
        super();

        if (elements.reloadDeckBtn && navigator.userAgent.includes('Firefox')) {
            elements.reloadDeckBtn.style.display = 'none';
        }

        this.deck = deck;
        this.elements = elements;
        this._enhanceIdleId = null;

        this.initIds();
        this.initSlideNavigator();
        this.initRoleManager();
        this.initReloadManager();
        this.initKeyboardHandler();
        this.initWheelHandler();
        this.initBreakManager();
        this.initFreezeManager();
        this.setupEventListeners();
    }

    initIds() {
        const id = getDeckId(this.deck);
        this.SLIDE_STATE_KEY = `webdeck:${id}:slide`;
    }

    initSlideNavigator() {
        this.slideNavigator = new SlideNavigator(this.deck, {
            slideStateKey: this.SLIDE_STATE_KEY,
            broadcastChannel: null, // Will be set in initBroadcastChannel
            isEditMode: () => this.isEditMode()
        });
        // Listen for slide changes to trigger render
        this.slideNavigator.addEventListener("slidechange", (e) => {
            this.render();
            this.enhanceActiveSlideNow();
            this.dispatchEvent('slidechange', e);
        });
        // Listen for render requests (e.g., when edit mode changes)
        this.slideNavigator.addEventListener("renderneeded", () => {
            this.render();
        });
    }

    initRoleManager() {
        this.roleManager = new RoleManager(this.elements);
        this.roleManager.applyRoleFromUrl();
    }

    initReloadManager() {
        this.reloadManager = new ReloadManager(this.deck, this.elements, {
            slideNavigator: this.slideNavigator,
            breakManager: null, // Will be set after breakManager is initialized
            freezeManager: null, // Will be set after freezeManager is initialized
            getDeckId: getDeckId
        });
        // Listen for deck changes
        this.reloadManager.addEventListener('deckchange', (e) => {
            this.deck = e.deck;
            this.dispatchEvent('deckchange', e);
        });
        // Note: broadcast channel initialized later, after breakManager exists
    }

    initKeyboardHandler() {
        this.keyboardHandler = new KeyboardHandler({
            next: () => this.slideNavigator.next(),
            prev: () => this.slideNavigator.prev(),
            first: () => this.slideNavigator.goTo(0),
            last: () => this.slideNavigator.goTo(this.deck.slides.length - 1),
            goto: () => this.slideNavigator.openGoToPrompt(),
            viewer: () => this.roleManager.togglePresentWindow(),
            edit: () => this.toggleEditMode(),
            break: () => this.breakManager.toggle(),
            fullscreen: () => this.toggleFullscreen(),
            reload: () => this.reloadManager.handleReloadDeck(),
            theme: () => ThemeManager.toggleTheme(),
            isBreakActive: () => this.breakManager.isActive,
            endBreak: () => this.breakManager.setActive(false),
            isEditorWindow: () => this.roleManager.isEditorWindow,
            isEmbedded: isEmbedded
        });
    }

    initWheelHandler() {
        this.wheelHandler = new WheelHandler({
            next: () => this.slideNavigator.next(),
            prev: () => this.slideNavigator.prev(),
            isBreakActive: () => this.breakManager.isActive,
            endBreak: () => this.breakManager.setActive(false)
        });
    }

    initBreakManager() {
        this.breakManager = new BreakManager(this.deck, this.elements, (state) => {
            this.dispatchEvent('breakchange', state);
        });
        // Set breakManager on reloadManager
        if (this.reloadManager) {
            this.reloadManager.breakManager = this.breakManager;
        }
    }

    initFreezeManager() {
        this.freezeManager = new FreezeManager(this.deck, this.elements, (state) => {
            this.dispatchEvent('freezechange', state);
        });
        // Set freezeManager on slideNavigator and reloadManager
        if (this.slideNavigator) {
            this.slideNavigator.freezeManager = this.freezeManager;
        }
        if (this.reloadManager) {
            this.reloadManager.freezeManager = this.freezeManager;
        }
    }

    initGenerationManager() {
        // Initialize AI generation controller
        this.generationController = new AIGenerationController(this.deck, this, this.elements);
        // Initialize generation actions (menu handlers)
        GenerationActions.init(this.generationController);
    }

    async init() {
        // Initialize broadcast channel after breakManager is ready
        this.reloadManager.initBroadcastChannel();
        // Initialize deck data channel for viewer windows
        this.reloadManager.initDeckDataChannel();
        // Store reference to bc for backward compatibility
        this.bc = this.reloadManager.getBroadcastChannel();
        // Initialize AI generation system
        this.initGenerationManager();

        const url = new URL(window.location.href);
        const hash = window.location.hash.match(/#slide-(\d+)/);
        const stored = localStorage.getItem(this.SLIDE_STATE_KEY);
        const restoreIndex = sessionStorage.getItem("webdeck_restore_slide_index");

        sessionStorage.removeItem("webdeck_restore_slide_index");

        let initialIndex = hash ? parseInt(hash[1], 10) - 1
            : restoreIndex !== null ? parseInt(restoreIndex, 10)
                : (parseInt(stored, 10) || 0);

        // Ensure we start on a visible slide (unless in edit mode)
        const visibleIndex = this.slideNavigator.getVisibleIndex(initialIndex);
        this.slideNavigator.currentIndex = visibleIndex;

        this.breakManager.setDuration(parseInt(url.searchParams.get("breakMins"), 10) || 10);
        this.breakManager.setActive(url.searchParams.get("break") === "1", { broadcast: false });

        // Note: Freeze state is not persisted or initialized from URL - it's temporary per session

        const title = DeckLoader.getDisplayTitle(this.deck);
        document.title = title;
        DeckController.updateDeckTitle(this.elements, title);

        this.preloadEnhancers();

        this.elements.slidesContainer.innerHTML = "";
        this.deck.slides.forEach((s, i) => {
            this.elements.slidesContainer.appendChild(
                SlideRenderer.createSlideElement(this.deck, s, i, i === this.slideNavigator.currentIndex)
            );
        });

        this.slideNavigator.goTo(this.slideNavigator.currentIndex, { broadcast: false });
        this.applyStageScale();

        // Immediately enhance the first slide (don't wait for idle)
        requestAnimationFrame(() => this.enhanceActiveSlideNow());
    }

    preloadEnhancers() {
        const loaderPromise = window.AssetLoader
            ? Promise.resolve(window.AssetLoader)
            : import("../core/asset-loader.js").then(({ AssetLoader }) => AssetLoader);

        loaderPromise
            .then((AssetLoader) => {
                AssetLoader.ensureRichTextEnhancers().catch(console.warn);
                // Scan deck and warmup Mermaid if needed
                const { hasMermaid } = ContentEnhancer.scanDeck(this.deck);
                if (hasMermaid) ContentEnhancer.initializeMermaid().catch(console.warn);
            })
            .catch(console.warn);
    }

    setupEventListeners() {
        const listen = (el, evt, fn) => el?.addEventListener(evt, fn);

        document.addEventListener("keydown", (e) => this.handleKeyboard(e));
        document.addEventListener("wheel", (e) => this.handleWheel(e), { passive: false });
        document.addEventListener("click", (e) => this.handleDocumentClick(e));
        document.addEventListener("fullscreenchange", () => this.applyStageScale());
        window.addEventListener("storage", (e) => this.handleStorage(e));
        window.addEventListener("resize", () => this.applyStageScale());
        window.addEventListener("beforeprint", () => this.handleBeforePrint());
        window.addEventListener("webdeck-load-local", (e) => this.handleLocalFileLoad(e));

        listen(this.elements.presentBtn, "click", () => this.roleManager.togglePresentWindow());
        listen(this.elements.printBtn, "click", () => this.handlePrint());
        listen(this.elements.breakBtn, "click", () => this.breakManager.toggle());
        listen(this.elements.freezeBtn, "click", () => this.freezeManager.toggle());
        listen(this.elements.toggleFullscreenBtn, "click", () => this.toggleFullscreen());
        listen(this.elements.themeToggleBtn, "click", () => ThemeManager.toggleTheme());

        listen(this.elements.menuBtn, "click", () => this.toggleMenu());
        listen(this.elements.menuOpenFileBtn, "click", () => this.closeMenu());
        listen(this.elements.menuReloadDeckBtn, "click", () => { this.handleReloadDeck(); this.closeMenu(); });
        listen(this.elements.menuPrintBtn, "click", () => { this.handlePrint(); this.closeMenu(); });
        listen(this.elements.menuExportHtmlBtn, "click", () => { this.handleHtmlExport(); this.closeMenu(); });

        listen(this.elements.breakDurationSelect, "change", (e) => {
            this.breakManager.setDuration(parseInt(e.target.value, 10) || 10);
        });

        listen(this.elements.fileInput, "change", (e) => {
            if (e.target.files?.[0]) {
                localStorage.setItem("webdeck_local_file_name", e.target.files[0].name);
            }
        });
    }

    async handleLocalFileLoad(event) {
        await this.reloadManager.handleLocalFileLoad(event);
    }

    handleKeyboard(e) {
        this.keyboardHandler?.handleKeyboard(e);
    }

    handleWheel(e) {
        this.wheelHandler?.handleWheel(e);
    }

    handleStorage(ev) {
        if (ev.key === this.SLIDE_STATE_KEY) {
            this.slideNavigator.handleIncomingState(parseInt(ev.newValue, 10));
        } else if (ev.key === "webdeck_local_file_timestamp" && ev.newValue) {
            this.reloadManager.handleStorage(ev);
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
            await PrintManager.handlePrint(this.elements.slidesContainer, this.deck?.meta?.title, { triggerBrowserPrint: false });
        }
    }

    /**
     * Check if we're in edit mode
     */
    isEditMode() {
        return document.body.getAttribute('data-edit-mode') === 'true';
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

    applyStageScale() {
        StageScaler.applyStageScale(this.elements);
    }

    render() {
        this.elements.slideNumberEl.textContent = String(this.slideNavigator.currentIndex + 1);
        const slides = this.elements.slidesContainer.querySelectorAll(".slide");
        slides.forEach((s, i) => s.classList.toggle("active", i === this.slideNavigator.currentIndex));

        if (this.elements.floatSlideCounter) {
            this.elements.floatSlideCounter.textContent = `${this.slideNavigator.currentIndex + 1} / ${this.deck.slides.length}`;
        }

        if (this.roleManager.isEditorWindow) {
            const next = this.deck.slides[this.slideNavigator.currentIndex + 1];
            const slide = this.deck.slides[this.slideNavigator.currentIndex];
            if (this.elements.nextPreview) {
                this.elements.nextPreview.textContent = next ? SlideRenderer.getSlideTitleForUi(next, this.slideNavigator.currentIndex + 1) : "(End)";
            }
            if (this.elements.notesContainer) {
                this.elements.notesContainer.innerHTML = slide?.notes ? `<pre>${slide.notes}</pre>` : "<p>No notes</p>";
            }
        }
    }

    toggleFullscreen() {
        UiActions.toggleFullscreen(this.elements.stageHost);
    }

    toggleEditMode() {
        window.__WEBDECK_EDIT_CONTROLLER__?.toggleEditMode();
        // Notify the navigator that edit mode has changed
        this.slideNavigator.onEditModeChanged();
    }

    toggleMenu() {
        UiActions.toggleMenu(this.elements.menuDropdown);
    }

    closeMenu() {
        UiActions.toggleMenu(this.elements.menuDropdown, false);
    }

    async handlePrint({ triggerBrowserPrint = true } = {}) {
        await PrintManager.handlePrint(this.elements.slidesContainer, this.deck?.meta?.title, { triggerBrowserPrint });
    }

    async handleHtmlExport({ filename = null } = {}) {
        await HtmlExportManager.handleHtmlExport(this.elements.slidesContainer, this.deck, { filename });
    }

    destroy() {
        if (this.reloadManager) this.reloadManager.destroy();
        if (this.breakManager) this.breakManager.destroy();
        if (this.freezeManager) this.freezeManager.destroy();
        if (this.roleManager) this.roleManager.destroy();
        this.removeAllListeners();
    }
}
