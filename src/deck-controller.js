// Deck navigation and state management
import { getDeckId, DESIGN_SIZE } from "./utils.js";
import { SlideRenderer } from "./slide-renderer.js";
import { ContentEnhancer } from "./content-enhancer.js";

export class DeckController {
    constructor(deck, elements) {
        this.deck = deck;
        this.elements = elements;
        this.currentIndex = 0;
        // Default role is viewer unless URL explicitly sets presenter.
        this.isPresenterWindow = false;
        this.presenterWindowRef = null;
        this.bc = null;
        this.timerInterval = null;
        this.timerStart = null;
        this._stageScaleRetry = 0;

        this.isBreakActive = false;
        this.breakSlideEl = null;

        this.SLIDE_STATE_KEY = `webdeck:${getDeckId(deck)}:slide`;
        this.BREAK_STATE_KEY = `webdeck:${getDeckId(deck)}:break`;

        this.initBroadcastChannel();
        this.initRole();
        this.setupEventListeners();
    }

    updateRoleUi() {
        document.documentElement.setAttribute("data-webdeck-role", this.isPresenterWindow ? "presenter" : "viewer");

        if (this.elements.presenterPanel) {
            this.elements.presenterPanel.classList.toggle("webdeck-hidden", !this.isPresenterWindow);
        }

        if (this.elements.roleLabelEl) {
            this.elements.roleLabelEl.textContent = this.isPresenterWindow ? "Presenter" : "Viewer";
            this.elements.roleLabelEl.className = `pill pill--${this.isPresenterWindow ? "presenter" : "viewer"}`;
        }

        if (this.elements.togglePresenterBtn) {
            this.elements.togglePresenterBtn.textContent = this.isPresenterWindow
                ? "Open Viewer Window"
                : "Open Presenter Window";
        }
    }

    initBroadcastChannel() {
        try {
            this.bc = new BroadcastChannel(getDeckId(this.deck));
        } catch {
            // BroadcastChannel not supported
        }

        if (this.bc) {
            this.bc.addEventListener("message", (ev) => {
                if (ev.data?.type === "slide" && typeof ev.data.index === "number") {
                    this.handleIncomingState(ev.data.index);
                } else if (ev.data?.type === "break" && typeof ev.data.active === "boolean") {
                    this.handleIncomingBreakState(ev.data.active);
                }
            });
        }
    }

    initRole() {
        const url = new URL(window.location.href);
        const roleFromUrl = url.searchParams.get("role");

        // Role is controlled only by URL. Default to viewer.
        this.isPresenterWindow = roleFromUrl === "presenter";

        this.updateRoleUi();

        // Role changes affect layout (topbar/footer/presenter panel visibility). Recompute scaling after layout settles.
        requestAnimationFrame(() => this.applyStageScale());
    }

    setupEventListeners() {
        document.addEventListener("keydown", (e) => this.handleKeyboard(e));
        document.addEventListener("wheel", (e) => this.handleWheel(e), { passive: false });
        window.addEventListener("storage", (ev) => this.handleStorage(ev));
        window.addEventListener("resize", () => this.applyStageScale());
        window.addEventListener("load", () => this.applyStageScale());

        if (this.elements.prevBtn) this.elements.prevBtn.addEventListener("click", () => this.prev());
        if (this.elements.nextBtn) this.elements.nextBtn.addEventListener("click", () => this.next());
        if (this.elements.gotoBtn) this.elements.gotoBtn.addEventListener("click", () => this.openGoToPrompt());
        if (this.elements.togglePresenterBtn) {
            this.elements.togglePresenterBtn.addEventListener("click", () => this.togglePresenterWindow());
        }
        if (this.elements.viewerPresenterBtn) {
            this.elements.viewerPresenterBtn.addEventListener("click", () => this.togglePresenterWindow());
        }
        if (this.elements.printBtn) {
            this.elements.printBtn.addEventListener("click", () => this.exportPdfViaPrint());
        }
        if (this.elements.timerToggle) {
            this.elements.timerToggle.addEventListener("click", () => this.toggleTimer());
        }
        if (this.elements.breakBtn) {
            this.elements.breakBtn.addEventListener("click", () => this.toggleBreak());
        }
    }

    handleKeyboard(e) {
        const tag = e.target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea") return;

        // If break overlay is active, Space (and navigation keys) dismiss it without changing slides.
        if (this.isBreakActive) {
            const dismissKeys = new Set([
                " ",
                "ArrowRight",
                "ArrowDown",
                "PageDown",
                "ArrowLeft",
                "ArrowUp",
                "PageUp",
            ]);
            if (dismissKeys.has(e.key)) {
                e.preventDefault();
                this.setBreakActive(false);
                return;
            }
        }

        if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " " || e.key === "ArrowDown") {
            e.preventDefault();
            this.next();
        } else if (e.key === "ArrowLeft" || e.key === "PageUp" || e.key === "ArrowUp") {
            e.preventDefault();
            this.prev();
        } else if (e.key === "Home") {
            e.preventDefault();
            this.goTo(0);
        } else if (e.key === "End") {
            e.preventDefault();
            this.goTo(this.deck.slides.length - 1);
        } else if (e.key === "g" || e.key === "G") {
            e.preventDefault();
            this.openGoToPrompt();
        } else if (e.key === "p" || e.key === "P") {
            e.preventDefault();
            this.togglePresenterWindow();
        } else if (e.key === "f" || e.key === "F") {
            e.preventDefault();
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                this.elements.stageHost?.requestFullscreen?.();
            }
        } else if (e.key === "t" || e.key === "T") {
            e.preventDefault();
            this.toggleTimer();
        }
    }

    handleWheel(e) {
        const tag = e.target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea") return;

        e.preventDefault();
        if (this.isBreakActive) {
            this.setBreakActive(false);
            return;
        }
        if (e.deltaY > 0) {
            this.next();
        } else if (e.deltaY < 0) {
            this.prev();
        }
    }

    handleStorage(ev) {
        if (ev.key === this.SLIDE_STATE_KEY) {
            const idx = parseInt(ev.newValue || "0", 10);
            if (!isNaN(idx)) this.handleIncomingState(idx);
        } else if (ev.key === this.BREAK_STATE_KEY) {
            const active = (ev.newValue || "").trim() === "1";
            this.handleIncomingBreakState(active);
        }
    }

    ensureBreakSlideEl() {
        if (this.breakSlideEl) return;
        if (!this.elements.stageInner) return;

        const breakSlide = {
            layout: "title-slide",
            background: "#333",
            theme: "dark",
            align: "center",
            areas: {
                main: "<h1>10 Minute Break</h1>",
            },
        };

        const el = SlideRenderer.createSlideElement(this.deck, breakSlide, 0, true);
        el.classList.add("webdeck-break-slide", "webdeck-hidden");
        el.style.zIndex = "80";
        el.style.pointerEvents = "auto";

        this.elements.stageInner.appendChild(el);
        this.breakSlideEl = el;
    }

    broadcastBreakState(active) {
        localStorage.setItem(this.BREAK_STATE_KEY, active ? "1" : "0");
        if (this.bc) {
            this.bc.postMessage({ type: "break", active });
        }
    }

    setBreakActive(active, { broadcast = true } = {}) {
        if (Boolean(active) && !this.breakSlideEl) {
            // Create break slide on-demand when first activated
            this.ensureBreakSlideEl();
        }
        this.isBreakActive = Boolean(active);

        if (this.breakSlideEl) {
            this.breakSlideEl.classList.toggle("webdeck-hidden", !this.isBreakActive);
        }

        if (broadcast) {
            this.broadcastBreakState(this.isBreakActive);
        }
    }

    handleIncomingBreakState(active) {
        if (Boolean(active) === this.isBreakActive) return;
        this.setBreakActive(Boolean(active), { broadcast: false });
    }

    toggleBreak() {
        this.setBreakActive(!this.isBreakActive);
    }

    broadcastState(index) {
        localStorage.setItem(this.SLIDE_STATE_KEY, String(index));
        if (this.bc) {
            this.bc.postMessage({ type: "slide", index });
        }
    }

    setHash(index) {
        const url = new URL(window.location.href);
        url.hash = `#slide-${index + 1}`;
        history.replaceState({}, "", url.toString());
    }

    parseHash() {
        const m = window.location.hash.match(/#slide-(\d+)/);
        return m ? parseInt(m[1], 10) - 1 : null;
    }

    goTo(index, { broadcast = true, updateUrl = true } = {}) {
        this.currentIndex = Math.max(0, Math.min(index, this.deck.slides.length - 1));
        if (broadcast) this.broadcastState(this.currentIndex);
        if (updateUrl) this.setHash(this.currentIndex);
        this.render();

        // Enhance content lazily for the active slide only. Rendering diagrams inside
        // `display:none` slides can fail due to zero-sized layout.
        const activeSlide = this.elements.slidesContainer?.querySelector(".slide.active");
        if (activeSlide && activeSlide.dataset.webdeckEnhanced !== "1") {
            requestAnimationFrame(() => {
                ContentEnhancer.enhanceRenderedContent(activeSlide)
                    .then(() => {
                        activeSlide.dataset.webdeckEnhanced = "1";
                    })
                    .catch(() => {
                        // ignore
                    });
            });
        }
    }

    handleIncomingState(index) {
        if (index === this.currentIndex) return;
        this.goTo(index, { broadcast: false, updateUrl: true });
    }

    next() {
        if (this.isBreakActive) {
            this.setBreakActive(false);
            return;
        }
        if (this.currentIndex < this.deck.slides.length - 1) {
            this.goTo(this.currentIndex + 1);
        }
    }

    prev() {
        if (this.isBreakActive) {
            this.setBreakActive(false);
            return;
        }
        if (this.currentIndex > 0) {
            this.goTo(this.currentIndex - 1);
        }
    }

    applyStageScale() {
        const host = this.elements.stageHost;
        const stage = this.elements.deckStage;
        const inner = this.elements.stageInner;
        if (!host || !stage || !inner) return;

        const rect = host.getBoundingClientRect();
        const pad = 16;
        const availW = Math.max(0, rect.width - pad * 2);
        const availH = Math.max(0, rect.height - pad * 2);

        // If layout isn't ready yet (e.g., just toggled role/UI), retry a few times.
        if ((availW === 0 || availH === 0) && this._stageScaleRetry < 8) {
            this._stageScaleRetry++;
            setTimeout(() => this.applyStageScale(), 50);
            return;
        }
        this._stageScaleRetry = 0;

        const scaleX = availW / DESIGN_SIZE.width;
        const scaleY = availH / DESIGN_SIZE.height;
        const scale = Math.min(scaleX, scaleY, 1);

        const scaledW = Math.round(DESIGN_SIZE.width * scale);
        const scaledH = Math.round(DESIGN_SIZE.height * scale);

        stage.style.width = `${scaledW}px`;
        stage.style.height = `${scaledH}px`;
        stage.style.setProperty("--stage-scale", String(scale));
        inner.style.transform = `scale(${scale})`;
        inner.style.transformOrigin = "top left";
    }

    renderSlides() {
        const container = this.elements.slidesContainer;
        container.innerHTML = "";

        this.deck.slides.forEach((slide, i) => {
            const el = SlideRenderer.createSlideElement(this.deck, slide, i, i === this.currentIndex);
            container.appendChild(el);
        });
    }

    renderPresenterBits() {
        if (!this.isPresenterWindow) return;

        const slide = this.deck.slides[this.currentIndex];
        const nextSlide = this.deck.slides[this.currentIndex + 1];

        if (this.elements.nextPreview) {
            if (nextSlide) {
                this.elements.nextPreview.textContent = SlideRenderer.getSlideTitleForUi(nextSlide, this.currentIndex + 1);
            } else {
                this.elements.nextPreview.textContent = "(Last slide)";
            }
        }

        if (this.elements.notesContainer) {
            const notes = slide?.notes || "";
            this.elements.notesContainer.innerHTML = notes ? `<pre>${notes}</pre>` : "<p>No notes</p>";
        }
    }

    render() {
        this.elements.slideNumberEl.textContent = String(this.currentIndex + 1);

        const slides = this.elements.slidesContainer.querySelectorAll(".slide");
        slides.forEach((s, i) => {
            s.classList.toggle("active", i === this.currentIndex);
        });

        this.renderPresenterBits();
    }

    togglePresenterWindow() {
        if (this.presenterWindowRef && !this.presenterWindowRef.closed) {
            this.presenterWindowRef.close();
            this.presenterWindowRef = null;
            return;
        }

        const url = new URL(window.location.href);
        // Presenter window opens a viewer window; viewer window opens a presenter window.
        url.searchParams.set("role", this.isPresenterWindow ? "viewer" : "presenter");
        url.hash = `#slide-${this.currentIndex + 1}`;

        this.presenterWindowRef = window.open(
            url.toString(),
            this.isPresenterWindow ? "webdeck-viewer" : "webdeck-presenter",
            "width=1200,height=800,menubar=no,toolbar=no,location=no,status=no"
        );
    }

    openGoToPrompt() {
        const input = prompt(`Go to slide (1–${this.deck.slides.length}):`);
        if (!input) return;
        const num = parseInt(input, 10);
        if (!isNaN(num) && num >= 1 && num <= this.deck.slides.length) {
            this.goTo(num - 1);
        }
    }

    exportPdfViaPrint() {
        window.print();
    }

    // Timer
    updateTimer() {
        if (!this.timerStart || !this.elements.timeDisplay) return;
        const elapsed = Math.floor((Date.now() - this.timerStart) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        this.elements.timeDisplay.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    startTimer() {
        if (this.timerInterval) return;
        this.timerStart = Date.now();
        this.timerInterval = setInterval(() => this.updateTimer(), 1000);
        this.updateTimer();
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        this.timerStart = null;
    }

    toggleTimer() {
        if (this.timerInterval) {
            this.stopTimer();
            if (this.elements.timeDisplay) this.elements.timeDisplay.textContent = "00:00";
        } else {
            this.startTimer();
        }
    }

    async init() {
        // Initial slide from hash / storage
        const hashIndex = this.parseHash();
        if (hashIndex != null && hashIndex >= 0 && hashIndex < this.deck.slides.length) {
            this.currentIndex = hashIndex;
        } else {
            const stored = localStorage.getItem(this.SLIDE_STATE_KEY);
            if (stored) {
                const idx = parseInt(stored, 10);
                if (!isNaN(idx) && idx >= 0 && idx < this.deck.slides.length) {
                    this.currentIndex = idx;
                }
            }
        }

        // Break overlay: honor explicit URL `?break=1`; otherwise start with break off.
        // This prevents stale break state in localStorage from showing the break
        // overlay unexpectedly on a fresh serve/load.
        const url = new URL(window.location.href);
        const breakParam = url.searchParams.get("break");
        if (breakParam !== null) {
            this.isBreakActive = String(breakParam).trim() === "1";
        } else {
            this.isBreakActive = false;
        }

        // Normalize role in URL (preserve any explicit break param)
        url.searchParams.set("role", this.isPresenterWindow ? "presenter" : "viewer");
        history.replaceState({}, "", url.toString());

        this.updateRoleUi();

        this.renderSlides();
        // Break slide is created on-demand when first activated
        this.setBreakActive(this.isBreakActive, { broadcast: false });
        const activeSlide = this.elements.slidesContainer?.querySelector(".slide.active");
        if (activeSlide) {
            await ContentEnhancer.enhanceRenderedContent(activeSlide);
            activeSlide.dataset.webdeckEnhanced = "1";
        }
        this.applyStageScale();
        this.render();
        this.setHash(this.currentIndex);
    }
}
