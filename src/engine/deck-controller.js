import { getDeckId, EventEmitter, escapeHtml, DESIGN_SIZE } from "../core/utils.js";
import { Logger } from "../core/logger.js";
import { SlideRenderer } from "../renderer/slide-renderer.js";
import { ContentEnhancer } from "../renderer/content-enhancer.js";
import { DeckLoader } from "../data/deck-loader.js";
import { StageScaler } from "../renderer/stage-scaler.js";
import { BreakManager } from "./break-manager.js";
import { FreezeManager } from "./freeze-manager.js";
import { PresenterTimer } from "./presenter-timer.js";
import { WheelHandler } from "./wheel-handler.js";
import { RoleManager } from "./role-manager.js";
import { SlideNavigator } from "./slide-navigator.js";
import { PrintManager } from "../renderer/print-manager.js";
import { HtmlExportManager } from "../renderer/html-export-manager.js";
import { TextpackExportManager } from "../renderer/textpack-export-manager.js";
import { waitForImageUpload } from "../core/image-upload-promise.js";
import { ReloadManager } from "./reload-manager.js";
import { applyOpenInNewTabToLinks } from "../data/markdown-parser.js";
import { Notification } from "../renderer/notification.js";
import { createKeyboardHandler } from "./deck-keyboard.js";
import { DeckEvents } from "./deck-events.js";
import { CommandPalette } from "./command-palette.js";
import { buildPaletteCommands } from "./command-registry.js";

export class DeckController extends EventEmitter {
  static updateDeckTitle(elements, title, uiActions) {
    if (!uiActions) {
      Logger.warn("DeckController.updateDeckTitle called without uiActions");
      return;
    }
    uiActions.updateDeckTitle(elements, title);
  }

  static updateSlideCount(elements, count, deck = null, uiActions) {
    if (!uiActions) {
      Logger.warn("DeckController.updateSlideCount called without uiActions");
      return;
    }
    // If deck is provided, count only visible slides
    if (deck) {
      const visibleSlideCount = deck.slides.filter((s) => !s.hidden).length;
      count = visibleSlideCount;
    }
    uiActions.updateSlideCount(elements, count);
  }

  constructor(
    deck,
    elements,
    {
      deckStore = null,
      uiActions = null,
      deckImagesResolver = null,
      imagePicker = null,
      newPresentationModal = null,
      conversionModal = null,
      slideStylePanel = null,
      textBlockHandler = null,
      settingsModal = null,
      imageInteractionHandler = null,
    } = {},
  ) {
    super();

    if (elements.reloadDeckBtn && navigator.userAgent.includes("Firefox")) {
      elements.reloadDeckBtn.style.display = "none";
    }

    this.deck = deck;
    this.elements = elements;
    this.deckStore = deckStore;
    this._uiActions = uiActions;
    this._deckImagesResolver = deckImagesResolver;
    this._imagePicker = imagePicker;
    this._newPresentationModal = newPresentationModal;
    this._conversionModal = conversionModal;
    this._slideStylePanel = slideStylePanel;
    this._textBlockHandler = textBlockHandler;
    this._settingsModal = settingsModal;
    this._imageInteractionHandler = imageInteractionHandler;
    this._enhanceIdleId = null;

    this.initIds();
    this.initSlideNavigator();
    this.initRoleManager();
    this.initReloadManager();
    this.initKeyboardHandler();
    this.initCommandPalette();
    this.initWheelHandler();
    this.initBreakManager();
    this.initFreezeManager();
    this.initPresenterTimer();
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
      isEditMode: () => this.isEditMode(),
    });
    // Listen for slide changes to trigger render
    this.slideNavigator.addEventListener("slidechange", (e) => {
      this.deckStore?.setActiveIndex(this.slideNavigator.currentIndex);
      this.render();
      this.enhanceActiveSlideNow();
      this.dispatchEvent("slidechange", e);
    });
    // Listen for render requests (e.g., when edit mode changes)
    this.slideNavigator.addEventListener("renderneeded", () => {
      this.render();
    });
  }

  initRoleManager() {
    this.roleManager = new RoleManager(this.elements);
    this.roleManager.applyRoleFromUrl();
    // Re-render the next-slide preview when the panel is resized
    this.roleManager.addEventListener("panelresize", () => {
      if (this.roleManager.isEditorWindow) this.updateNextPreview();
    });
    // Single screen: enter presentation-style fullscreen (stage fills the
    // screen) when the user explicitly chooses "Present fullscreen".
    this.roleManager.addEventListener("singleScreenPresent", () => {
      this.enterPresentFullscreen();
    });
    // Dual screen: when a viewer window opens, auto-exit edit mode so the
    // presenter panel becomes visible.
    this.roleManager.addEventListener("viewerwindowchange", (e) => {
      if (e?.open && this.isEditMode()) {
        this.toggleEditMode();
      }
    });
  }

  initReloadManager() {
    this.reloadManager = new ReloadManager(this.deck, this.elements, {
      slideNavigator: this.slideNavigator,
      breakManager: null, // Will be set after breakManager is initialized
      freezeManager: null, // Will be set after freezeManager is initialized
      getDeckId: getDeckId,
      deckStore: this.deckStore,
      uiActions: this._uiActions,
      deckImagesResolver: this._deckImagesResolver,
      imagePicker: this._imagePicker,
    });
    // Listen for deck changes
    this.reloadManager.addEventListener("deckchange", (e) => {
      this.deck = e.deck;
      this.dispatchEvent("deckchange", e);
      // Re-rewrite image srcs to blob URLs on the freshly created DOM
      this.#rewriteImages();
      // render() already ran during replaceDeck's goTo() while this.deck was
      // still the old deck, so the next-slide preview and notes panel are
      // stale until the next navigation — re-render with the new deck now.
      this.render();
    });
    // Note: broadcast channel initialized later, after breakManager exists
  }

  initCommandPalette() {
    const actions = {
      ...this.keyboardHandler.actions,
      print: () => this.handlePrint(),
      htmlExport: () => this.handleHtmlExport(),
      textpackExport: () => this.handleTextpackExport(),
      enhanceSlide: () => window.__WEBDECK_EDIT_CONTROLLER__?.runSingleSlideAi("enhanceSlide"),
      addSpeakerNotes: () =>
        window.__WEBDECK_EDIT_CONTROLLER__?.runSingleSlideAi("addSpeakerNotes"),
      polish: () => window.__WEBDECK_EDIT_CONTROLLER__?.runWholeDeckAi(),
      importAiResult: () => window.__WEBDECK_EDIT_CONTROLLER__?.importAiResult(),
    };

    this.commandPalette = new CommandPalette({
      commands: buildPaletteCommands(this, actions),
    });
  }

  handleCommandPalette() {
    this.commandPalette?.open();
  }

  initKeyboardHandler() {
    this.keyboardHandler = createKeyboardHandler({
      getSlideNavigator: () => this.slideNavigator,
      getRoleManager: () => this.roleManager,
      getBreakManager: () => this.breakManager,
      getReloadManager: () => this.reloadManager,
      getCommandPalette: () => this.commandPalette,
      toggleEditMode: () => this.toggleEditMode(),
      toggleFullscreen: () => this.toggleFullscreen(),
      isEditMode: () => this.isEditMode(),
      slideStylePanel: this._slideStylePanel,
      textBlockHandler: this._textBlockHandler,
    });
  }

  initWheelHandler() {
    this.wheelHandler = new WheelHandler({
      next: () => this.slideNavigator.next(),
      prev: () => this.slideNavigator.prev(),
      isBreakActive: () => this.breakManager.isActive,
      endBreak: () => this.breakManager.setActive(false),
    });
  }

  initBreakManager() {
    this.breakManager = new BreakManager(this.deck, this.elements, (state) => {
      this.dispatchEvent("breakchange", state);
    });
    // Set breakManager on reloadManager
    if (this.reloadManager) {
      this.reloadManager.breakManager = this.breakManager;
    }
    // Update break button text to reflect active state
    this.addEventListener("breakchange", ({ isActive }) => {
      const btn = this.elements.breakBtn;
      if (!btn) return;
      btn.textContent = isActive ? "End Break" : "Break";
      btn.setAttribute("aria-pressed", String(isActive));
    });
  }

  initFreezeManager() {
    this.freezeManager = new FreezeManager(this.deck, this.elements, (state) => {
      this.dispatchEvent("freezechange", state);
    });
    // Set freezeManager on slideNavigator and reloadManager
    if (this.slideNavigator) {
      this.slideNavigator.freezeManager = this.freezeManager;
    }
    if (this.reloadManager) {
      this.reloadManager.freezeManager = this.freezeManager;
    }
  }

  initPresenterTimer() {
    this.presenterTimer = new PresenterTimer(this.elements);
    this.presenterTimer.tick();
    let wasPresenting = false;
    const syncState = () => {
      const viewerOpen = !!(
        this.roleManager.viewerWindowRef && !this.roleManager.viewerWindowRef.closed
      );
      // In the editor, fullscreen alone should not count as presenting.
      // Single-screen "Present" still opens a viewer window or uses
      // browser fullscreen, but that is just a view state, not a mode
      // change. In viewer/export windows, the existing behavior is kept.
      const presenting = this.roleManager.isEditorWindow
        ? viewerOpen
        : viewerOpen || !!document.fullscreenElement;
      // Only start/stop on transitions — start() resets the elapsed
      // time, so calling it every tick would freeze the timer at 00:00.
      if (presenting && !wasPresenting) {
        this.presenterTimer.start();
      } else if (!presenting && wasPresenting) {
        this.presenterTimer.stop();
      }
      wasPresenting = presenting;
    };
    this._presenterTimerInterval = setInterval(() => {
      syncState();
      this.presenterTimer.tick();
    }, 1000);
    this._timerFullscreenHandler = () => {
      syncState();
      this.presenterTimer.tick();
    };
    document.addEventListener("fullscreenchange", this._timerFullscreenHandler);
    // Listen for viewer window open/close via EventEmitter (no monkey-patch)
    this.roleManager.addEventListener("viewerwindowchange", () => {
      syncState();
      this.presenterTimer.tick();
    });
    syncState();
  }

  async init() {
    // Initialize broadcast channel after breakManager is ready
    this.reloadManager.initBroadcastChannel();
    // Initialize deck data channel for viewer windows
    this.reloadManager.initDeckDataChannel();
    // Store reference to bc for backward compatibility
    this.bc = this.reloadManager.getBroadcastChannel();

    const url = new URL(window.location.href);
    const hash = window.location.hash.match(/#slide-(\d+)/);
    const stored = localStorage.getItem(this.SLIDE_STATE_KEY);
    const restoreIndex = sessionStorage.getItem("webdeck_restore_slide_index");

    sessionStorage.removeItem("webdeck_restore_slide_index");

    let initialIndex = hash
      ? parseInt(hash[1], 10) - 1
      : restoreIndex !== null
        ? parseInt(restoreIndex, 10)
        : parseInt(stored, 10) || 0;

    // Ensure we start on a visible slide (unless in edit mode)
    const visibleIndex = this.slideNavigator.getVisibleIndex(initialIndex);
    this.slideNavigator.currentIndex = visibleIndex;

    this.breakManager.setDuration(parseInt(url.searchParams.get("breakMins"), 10) || 10);
    this.breakManager.setActive(url.searchParams.get("break") === "1", { broadcast: false });

    // Note: Freeze state is not persisted or initialized from URL - it's temporary per session

    const title = DeckLoader.getDisplayTitle(this.deck);
    document.title = title;
    DeckController.updateDeckTitle(this.elements, title, this._uiActions);

    this.preloadEnhancers();

    this.elements.slidesContainer.innerHTML = "";
    this.deck.slides.forEach((s, i) => {
      this.elements.slidesContainer.appendChild(
        SlideRenderer.createSlideElement(this.deck, s, i, i === this.slideNavigator.currentIndex),
      );
    });

    this.slideNavigator.goTo(this.slideNavigator.currentIndex, { broadcast: false });
    this.applyStageScale();

    // Boot render: resolve images/... refs against the deck folder (picker
    // handle) now that init is past data load. In-session deck swaps get this
    // via the deckchange listener; a refresh restores slides straight from
    // localStorage and would otherwise leave every stage image unresolved.
    this.#rewriteImages();

    // Immediately enhance the first slide (don't wait for idle)
    requestAnimationFrame(() => this.enhanceActiveSlideNow());
  }

  async #rewriteImages() {
    try {
      const resolver = this._deckImagesResolver;
      if (!resolver) return;
      // Viewer windows share localStorage and IndexedDB with the editor, so
      // re-attaching the persisted folder handle on every rewrite picks up
      // images the presenter added (and saved) after this window was opened.
      // Idempotent, and a no-op for decks not opened through the picker.
      if (RoleManager.isViewerMode() && resolver.restorePersistedHandle) {
        await resolver.restorePersistedHandle();
      }
      await resolver.rewriteImgSrcs(this.elements.slidesContainer);
      await resolver.rewriteBackgroundUrls(this.elements.slidesContainer);
    } catch {
      // ignore
    }
  }

  preloadEnhancers() {
    const loaderPromise = window.AssetLoader
      ? Promise.resolve(window.AssetLoader)
      : import("../core/asset-loader.js").then(({ AssetLoader }) => AssetLoader);

    loaderPromise
      .then((AssetLoader) => {
        AssetLoader.ensureRichTextEnhancers().catch((error) => Logger.warn(error));
        // Scan deck and warmup Mermaid if needed
        const { hasMermaid } = ContentEnhancer.scanDeck(this.deck);
        if (hasMermaid) ContentEnhancer.initializeMermaid().catch((error) => Logger.warn(error));
      })
      .catch((error) => Logger.warn(error));
  }

  setupEventListeners() {
    this._deckEvents = new DeckEvents({
      elements: this.elements,
      handleKeyboard: (e) => this.handleKeyboard(e),
      handleWheel: (e) => this.handleWheel(e),
      handleDocumentClick: (e) => this.handleDocumentClick(e),
      handleStorage: (e) => this.handleStorage(e),
      handleBeforePrint: () => this.handleBeforePrint(),
      handleLocalFileLoad: (e) => this.handleLocalFileLoad(e),
      applyStageScale: () => this.applyStageScale(),
      toggleFullscreen: () => this.toggleFullscreen(),
      toggleMenu: () => this.toggleMenu(),
      closeMenu: () => this.closeMenu(),
      toggleEditMode: () => this.toggleEditMode(),
      handlePrint: () => this.handlePrint(),
      handleHtmlExport: () => this.handleHtmlExport(),
      handleTextpackExport: () => this.handleTextpackExport(),
      handleNewPresentation: () => this.handleNewPresentation(),
      handleConvertPptx: () => this.handleConvertPptx(),
      handleCommandPalette: () => this.handleCommandPalette(),
      roleManager: this.roleManager,
      breakManager: this.breakManager,
      freezeManager: this.freezeManager,
      reloadManager: this.reloadManager,
      settingsModal: this._settingsModal,
    });
    this._deckEvents.setup();
  }

  async handleLocalFileLoad(event) {
    await this.reloadManager.handleLocalFileLoad(event);
  }

  handleKeyboard(e) {
    // Arrow keys move the selected image when an image is selected in edit mode.
    // The handler inside handleKeyDown calls preventDefault when an image is
    // actually selected. When no image is selected, the event falls through to
    // the normal keyboard handler for slide navigation.
    if (e.key.startsWith("Arrow") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const edit = window.__WEBDECK_EDIT_CONTROLLER__;
      if (edit?.isEditMode && this._imageInteractionHandler) {
        const handler = this._imageInteractionHandler;
        if (handler.isSelected()) {
          handler.handleKeyDown(e);
        } else {
          this.keyboardHandler?.handleKeyboard(e);
        }
        return;
      }
    }
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
    if (
      this.elements.menuDropdown &&
      !this.elements.menuDropdown.classList.contains("webdeck-hidden")
    ) {
      if (
        !this.elements.menuDropdown.contains(e.target) &&
        !this.elements.menuBtn.contains(e.target)
      ) {
        this.elements.menuDropdown.classList.add("webdeck-hidden");
      }
    }
  }

  async handleBeforePrint() {
    if (this.elements.slidesContainer) {
      await PrintManager.handlePrint(this.elements.slidesContainer, this.deck?.meta?.title, {
        triggerBrowserPrint: false,
      });
    }
  }

  /**
   * Check if we're in edit mode
   */
  isEditMode() {
    return document.body.getAttribute("data-edit-mode") === "true";
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

  /**
   * Renders speaker notes as markdown HTML.
   * @param {string} notes - Raw markdown notes text
   * @returns {string} Rendered HTML
   */
  renderNotes(notes) {
    if (!notes) return "<p class='notes-empty'>No notes</p>";

    // Use markdown-it if available (loaded via AssetLoader)
    if (typeof window.markdownit === "function") {
      try {
        // Get or create markdown-it instance
        if (!this._md) {
          this._md = window.markdownit({
            html: true,
            linkify: false,
            typographer: false,
            breaks: true,
          });
          applyOpenInNewTabToLinks(this._md);
        }
        return SlideRenderer.sanitizeAreaHtml(
          `<div class="notes-content">${this._md.render(notes)}</div>`,
        );
      } catch (e) {
        Logger.warn("Failed to render notes as markdown:", e);
      }
    }

    // Fallback to plain text with line breaks — still sanitize since it
    // goes into .innerHTML.
    return SlideRenderer.sanitizeAreaHtml(
      `<div class="notes-content"><pre>${escapeHtml(notes)}</pre></div>`,
    );
  }

  render() {
    this.elements.slideNumberEl.textContent = String(this.slideNavigator.currentIndex + 1);
    const slides = this.elements.slidesContainer.querySelectorAll(".slide");
    slides.forEach((s, i) => s.classList.toggle("active", i === this.slideNavigator.currentIndex));

    if (this.elements.slideAnnouncer) {
      this.elements.slideAnnouncer.textContent = this.getSlideAnnouncement();
    }

    if (this.elements.floatSlideCounter) {
      this.elements.floatSlideCounter.textContent = `${this.slideNavigator.currentIndex + 1} / ${this.deck.slides.length}`;
    }

    if (this.roleManager.isEditorWindow) {
      const next = this.deck.slides[this.slideNavigator.currentIndex + 1];
      const slide = this.deck.slides[this.slideNavigator.currentIndex];
      if (this.elements.nextPreview) {
        this.updateNextPreview(next);
      }
      if (this.elements.notesContainer) {
        this.elements.notesContainer.innerHTML = slide?.notes
          ? this.renderNotes(slide.notes)
          : "<p class='notes-empty'>No notes</p>";
      }
    }
  }

  /**
   * Screen-reader announcement for the active slide. Mirrors the slide
   * wrapper's aria-label built in SlideRenderer.createSlideElement so the
   * live region and the slide itself never disagree.
   * @returns {string}
   */
  getSlideAnnouncement() {
    const index = this.slideNavigator.currentIndex;
    const visibleSlideCount = this.deck.slides.filter((s) => !s.hidden).length;
    const title = String(this.deck.slides[index]?.title ?? "").replace(/<[^>]*>/g, "");
    return `Slide ${index + 1} of ${visibleSlideCount}${title ? `: ${title}` : ""}`;
  }

  updateNextPreview(nextSlide) {
    const container = this.elements.nextPreview;
    if (!container) return;
    // Allow calling with no args to re-derive the next slide (e.g. on resize)
    if (nextSlide === undefined) {
      nextSlide = this.deck.slides[this.slideNavigator.currentIndex + 1];
    }
    container.innerHTML = "";
    container.onclick = null;
    container.style.height = "";
    container.style.cursor = "";
    if (!nextSlide) {
      container.textContent = "(End)";
      container.classList.add("next-preview--empty");
      return;
    }
    container.classList.remove("next-preview--empty");
    const idx = this.slideNavigator.currentIndex + 1;
    const previewEl = SlideRenderer.createSlideElement(this.deck, nextSlide, idx, false);
    previewEl.classList.add("next-preview__slide");
    previewEl.style.position = "absolute";
    previewEl.style.width = `${DESIGN_SIZE.width}px`;
    previewEl.style.height = `${DESIGN_SIZE.height}px`;
    previewEl.style.pointerEvents = "none";
    previewEl.style.transformOrigin = "top left";
    // Fit the design-size slide into the container width
    const scale = (container.clientWidth || 220) / DESIGN_SIZE.width;
    previewEl.style.transform = `scale(${scale})`;
    container.style.height = `${Math.round(DESIGN_SIZE.height * scale)}px`;
    container.appendChild(previewEl);
    container.onclick = () => this.slideNavigator.goTo(idx);
    container.style.cursor = "pointer";
    // Route the preview's images/... references through the resolver like the
    // main stage does, otherwise a picker-opened deck's preview resolves them
    // against the dev server and shows the previously loaded deck's images.
    this._deckImagesResolver?.rewriteImgSrcs(previewEl).catch(() => {});
    this._deckImagesResolver?.rewriteBackgroundUrls(previewEl).catch(() => {});
    ContentEnhancer.enhanceRenderedContent(previewEl).catch(() => {});
  }

  toggleFullscreen() {
    // The generic fullscreen shortcut (F key / toolbar button) should not
    // act as present mode. In the editor it full-screens the whole page so
    // the editor/presenter controls remain accessible; in viewer/export it
    // full-screens the stage as before.
    if (this.roleManager.isEditorWindow) {
      this._uiActions?.toggleFullscreen(document.documentElement);
    } else {
      this._uiActions?.toggleFullscreen(this.elements.stageHost);
    }
  }

  enterPresentFullscreen() {
    // "Present fullscreen" from the single-screen prompt still fills the
    // stage and hides the editor shell, but it does not start the presenter
    // timer. Edit mode is exited because we are starting a presentation.
    if (this.isEditMode()) this.toggleEditMode();
    this._uiActions?.toggleFullscreen(this.elements.stageHost);
  }

  toggleEditMode() {
    const editController = window.__WEBDECK_EDIT_CONTROLLER__;
    if (!editController) {
      Notification.info("Editing is not available in this view");
      return;
    }
    editController.toggleEditMode();
    // Notify the navigator that edit mode has changed
    this.slideNavigator.onEditModeChanged();
  }

  toggleMenu() {
    this._uiActions?.toggleMenu(this.elements.menuDropdown);
  }

  closeMenu() {
    this._uiActions?.toggleMenu(this.elements.menuDropdown, false);
  }

  async handlePrint({ triggerBrowserPrint = true } = {}) {
    await PrintManager.handlePrint(this.elements.slidesContainer, this.deck?.meta?.title, {
      triggerBrowserPrint,
    });
  }

  async handleHtmlExport({ filename = null } = {}) {
    await HtmlExportManager.handleHtmlExport(this.elements.slidesContainer, this.deck, {
      filename,
      // Picker-opened decks resolve images through the directory handle; the
      // dev server only serves images for the deck it was launched with.
      readImage: (relPath) => this._deckImagesResolver?.getImageFile(relPath) ?? null,
    });
  }

  async handleTextpackExport({ filename = null } = {}) {
    await waitForImageUpload();
    const editController = window.__WEBDECK_EDIT_CONTROLLER__;
    // Capture any in-flight editor edits before reading the full markdown,
    // otherwise unsaved text changes are missed by the export. Only capture
    // when the editor is active to avoid attributing a stale buffer to the
    // current slide.
    editController?.captureCurrentEditorState?.();
    const markdown =
      editController?.saveManager?.getFullMarkdown() ??
      localStorage.getItem("webdeck_local_file") ??
      "";
    await TextpackExportManager.handleTextpackExport(markdown, this.deck, {
      filename,
      readImage: (relPath) => this._deckImagesResolver?.getImageFile(relPath) ?? null,
    });
  }

  async handleNewPresentation() {
    const { PresentationCreator } = await import("./presentation-creator.js");
    const creator = new PresentationCreator({
      reloadManager: this.reloadManager,
      newPresentationModal: this._newPresentationModal,
      imagePicker: this._imagePicker,
      onClearDeckImages: async () => {
        this._deckImagesResolver?.clearDirectoryHandle();
      },
    });
    await creator.create();
  }

  async handleConvertPptx() {
    const { PptxImporter } = await import("./pptx-importer.js");
    const importer = new PptxImporter({
      reloadManager: this.reloadManager,
      toggleEditMode: () => this.toggleEditMode(),
      conversionModal: this._conversionModal,
      deckImagesResolver: this._deckImagesResolver,
      imagePicker: this._imagePicker,
    });
    await importer.import();
  }

  destroy() {
    if (this._deckEvents) this._deckEvents.teardown();
    if (this._timerFullscreenHandler) {
      document.removeEventListener("fullscreenchange", this._timerFullscreenHandler);
    }
    if (this.reloadManager) this.reloadManager.destroy();
    if (this.breakManager) this.breakManager.destroy();
    if (this.freezeManager) this.freezeManager.destroy();
    if (this.roleManager) this.roleManager.destroy();
    if (this.presenterTimer) this.presenterTimer.destroy();
    if (this._presenterTimerInterval) clearInterval(this._presenterTimerInterval);
    if (window.__WEBDECK_EDIT_CONTROLLER__?.destroy) {
      window.__WEBDECK_EDIT_CONTROLLER__.destroy();
    }
    this.removeAllListeners();
  }
}
