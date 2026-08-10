/**
 * Deck Event Bindings
 *
 * Sets up DOM event listeners and handles events for the deck.
 * Uses dependency injection — receives handler callbacks via constructor.
 */
import { ThemeManager } from "../renderer/theme-manager.js";
import { Notification } from "../renderer/notification.js";

export class DeckEvents {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.elements - DOM elements
   * @param {Function} opts.handleKeyboard - Keyboard event handler
   * @param {Function} opts.handleWheel - Wheel event handler
   * @param {Function} opts.handleDocumentClick - Document click handler
   * @param {Function} opts.handleStorage - Storage event handler
   * @param {Function} opts.handleBeforePrint - Before print handler
   * @param {Function} opts.handleLocalFileLoad - Local file load handler
   * @param {Function} opts.applyStageScale - Apply stage scale callback
   * @param {Function} opts.toggleFullscreen - Toggle fullscreen callback
   * @param {Function} opts.toggleMenu - Toggle menu callback
   * @param {Function} opts.closeMenu - Close menu callback
   * @param {Function} opts.toggleEditMode - Toggle edit mode callback
   * @param {Function} opts.handlePrint - Print handler
   * @param {Function} opts.handleHtmlExport - HTML export handler
   * @param {Function} opts.handleTextpackExport - Textpack export handler
   * @param {Function} opts.handleNewPresentation - New presentation handler
   * @param {Function} opts.handleConvertPptx - PPTX convert handler
   * @param {Function} opts.handleCommandPalette - Open command palette
   * @param {object} opts.roleManager - Role manager
   * @param {object} opts.breakManager - Break manager
   * @param {object} opts.freezeManager - Freeze manager
   * @param {object} opts.reloadManager - Reload manager
   * @param {Function} opts.isEditMode - Check edit mode callback
   */
  constructor({
    elements,
    handleKeyboard,
    handleWheel,
    handleDocumentClick,
    handleStorage,
    handleBeforePrint,
    handleLocalFileLoad,
    applyStageScale,
    toggleFullscreen,
    toggleMenu,
    closeMenu,
    toggleEditMode,
    handlePrint,
    handleHtmlExport,
    handleTextpackExport,
    handleNewPresentation,
    handleConvertPptx,
    handleCommandPalette,
    roleManager,
    breakManager,
    freezeManager,
    reloadManager,
    isEditMode,
  }) {
    this._elements = elements;
    this._handleKeyboard = handleKeyboard;
    this._handleWheel = handleWheel;
    this._handleDocumentClick = handleDocumentClick;
    this._handleStorage = handleStorage;
    this._handleBeforePrint = handleBeforePrint;
    this._handleLocalFileLoad = handleLocalFileLoad;
    this._applyStageScale = applyStageScale;
    this._toggleFullscreen = toggleFullscreen;
    this._toggleMenu = toggleMenu;
    this._closeMenu = closeMenu;
    this._toggleEditMode = toggleEditMode;
    this._handlePrint = handlePrint;
    this._handleHtmlExport = handleHtmlExport;
    this._handleTextpackExport = handleTextpackExport;
    this._handleNewPresentation = handleNewPresentation;
    this._handleConvertPptx = handleConvertPptx;
    this._handleCommandPalette = handleCommandPalette;
    this._roleManager = roleManager;
    this._breakManager = breakManager;
    this._freezeManager = freezeManager;
    this._reloadManager = reloadManager;
    this._isEditMode = isEditMode;

    // Store bound handlers for cleanup
    this._boundHandlers = [];
  }

  setup() {
    const listen = (el, evt, fn) => el?.addEventListener(evt, fn);
    const bind = (target, evt, fn, opts) => {
      target.addEventListener(evt, fn, opts);
      this._boundHandlers.push({ target, evt, fn, opts });
    };

    // Document-level events
    bind(document, "keydown", this._handleKeyboard);
    bind(document, "wheel", this._handleWheel, { passive: false });
    bind(document, "click", this._handleDocumentClick);
    bind(document, "fullscreenchange", this._applyStageScale);
    bind(window, "storage", this._handleStorage);
    bind(window, "resize", this._applyStageScale);
    bind(window, "beforeprint", this._handleBeforePrint);
    bind(window, "webdeck-load-local", this._handleLocalFileLoad);

    // Button events
    listen(this._elements.presentBtn, "click", () => this._roleManager.togglePresentWindow());
    listen(this._elements.printBtn, "click", this._handlePrint);
    listen(this._elements.breakBtn, "click", () => this._breakManager.toggle());
    listen(this._elements.freezeBtn, "click", () => this._freezeManager.toggle());
    listen(this._elements.toggleFullscreenBtn, "click", this._toggleFullscreen);
    listen(this._elements.themeToggleBtn, "click", () => ThemeManager.toggleTheme());

    // Menu events
    listen(this._elements.menuBtn, "click", this._toggleMenu);
    listen(this._elements.menuOpenFileBtn, "click", this._closeMenu);
    listen(this._elements.menuReloadDeckBtn, "click", () => {
      this._reloadManager.handleReloadDeck();
      this._closeMenu();
    });
    listen(this._elements.menuToggleEditModeBtn, "click", () => {
      this._toggleEditMode();
      this._closeMenu();
    });
    listen(this._elements.menuSaveBtn, "click", () => {
      const editCtrl = window.__WEBDECK_EDIT_CONTROLLER__;
      // Saving works whenever an editor exists — edit mode on or off —
      // mirroring the Ctrl+S shortcut. Only windows without an editor
      // (viewer/presenter) cannot save.
      if (editCtrl?.saveManager) {
        editCtrl.saveManager.save();
      } else {
        Notification.info("Open edit mode (E) to save changes");
      }
      this._closeMenu();
    });
    listen(this._elements.menuPrintBtn, "click", () => {
      this._handlePrint();
      this._closeMenu();
    });
    listen(this._elements.menuExportHtmlBtn, "click", () => {
      this._handleHtmlExport();
      this._closeMenu();
    });
    listen(this._elements.menuExportTextpackBtn, "click", () => {
      this._handleTextpackExport();
      this._closeMenu();
    });
    listen(this._elements.menuNewPresentationBtn, "click", () => {
      this._handleNewPresentation();
      this._closeMenu();
    });
    listen(this._elements.menuConvertPptxBtn, "click", () => {
      this._handleConvertPptx();
      this._closeMenu();
    });
    listen(this._elements.menuCommandPaletteBtn, "click", () => {
      this._handleCommandPalette();
      this._closeMenu();
    });
    listen(this._elements.menuSettingsBtn, "click", async () => {
      const { SettingsModal } = await import("../editor/settings-modal.js");
      SettingsModal.show();
      this._closeMenu();
    });

    // Other controls
    listen(this._elements.breakDurationSelect, "change", (e) => {
      this._breakManager.setDuration(parseInt(e.target.value, 10) || 10);
    });

    listen(this._elements.fileInput, "change", (e) => {
      if (e.target.files?.[0]) {
        localStorage.setItem("webdeck_local_file_name", e.target.files[0].name);
      }
    });
  }

  teardown() {
    for (const { target, evt, fn, opts } of this._boundHandlers) {
      target.removeEventListener(evt, fn, opts);
    }
    this._boundHandlers = [];
  }
}
