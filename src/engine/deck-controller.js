import { getDeckId, EventEmitter, escapeHtml } from "../core/utils.js";
import { Logger } from "../core/logger.js";
import { SlideRenderer } from "../renderer/slide-renderer.js";
import { ContentEnhancer } from "../renderer/content-enhancer.js";
import { DeckLoader } from "../data/deck-loader.js";
import { StageScaler } from "../renderer/stage-scaler.js";
import { BreakManager } from "./break-manager.js";
import { FreezeManager } from "./freeze-manager.js";
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
  static updateDeckTitle(elements, title, uiActions = null) {
    const actions = uiActions || DeckController._uiActions;
    actions?.updateDeckTitle(elements, title);
  }

  static updateSlideCount(elements, count, deck = null, uiActions = null) {
    // If deck is provided, count only visible slides
    if (deck) {
      const visibleSlideCount = deck.slides.filter((s) => !s.hidden).length;
      count = visibleSlideCount;
    }
    const actions = uiActions || DeckController._uiActions;
    actions?.updateSlideCount(elements, count);
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
    DeckController._uiActions = uiActions;
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
    });
    // Note: broadcast channel initialized later, after breakManager exists
  }

  initCommandPalette() {
    const actions = {
      ...this.keyboardHandler.actions,
      print: () => this.handlePrint(),
      htmlExport: () => this.handleHtmlExport(),
      textpackExport: () => this.handleTextpackExport(),
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
    DeckController.updateDeckTitle(this.elements, title);

    this.preloadEnhancers();

    this.elements.slidesContainer.innerHTML = "";
    this.deck.slides.forEach((s, i) => {
      this.elements.slidesContainer.appendChild(
        SlideRenderer.createSlideElement(this.deck, s, i, i === this.slideNavigator.currentIndex),
      );
    });

    this.slideNavigator.goTo(this.slideNavigator.currentIndex, { broadcast: false });
    this.applyStageScale();

    // Immediately enhance the first slide (don't wait for idle)
    requestAnimationFrame(() => this.enhanceActiveSlideNow());
  }

  async #rewriteImages() {
    try {
      const resolver = this._deckImagesResolver;
      if (!resolver) return;
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

    // Fallback to plain text with line breaks
    return `<div class="notes-content"><pre>${escapeHtml(notes)}</pre></div>`;
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
        this.elements.nextPreview.textContent = next
          ? SlideRenderer.getSlideTitleForUi(next, this.slideNavigator.currentIndex + 1)
          : "(End)";
      }
      if (this.elements.notesContainer) {
        this.elements.notesContainer.innerHTML = slide?.notes
          ? this.renderNotes(slide.notes)
          : "<p class='notes-empty'>No notes</p>";
      }
    }
  }

  toggleFullscreen() {
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
    await TextpackExportManager.handleTextpackExport(markdown, this.deck, { filename });
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
    if (this.reloadManager) this.reloadManager.destroy();
    if (this.breakManager) this.breakManager.destroy();
    if (this.freezeManager) this.freezeManager.destroy();
    if (this.roleManager) this.roleManager.destroy();
    if (window.__WEBDECK_EDIT_CONTROLLER__?.destroy) {
      window.__WEBDECK_EDIT_CONTROLLER__.destroy();
    }
    this.removeAllListeners();
  }
}
