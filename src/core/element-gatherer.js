/**
 * ElementGatherer
 * Gathers all DOM element references used by the application.
 * Each call queries `document.getElementById` for every known UI element.
 */

/** @class */
export class ElementGatherer {
  /**
   * Gather all DOM element references used by the application.
   * @static
   * @returns {import('../types.js').GatheredElements} An object containing all element references.
   */
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
      insertDropdownBtn: $("insertDropdownBtn"),
      insertDropdownContent: $("insertDropdownContent"),
      aiDropdownBtn: $("aiDropdownBtn"),
      aiDropdownContent: $("aiDropdownContent"),
      addSlideFooterBtn: $("addSlideFooterBtn"),
      toggleThumbnailsBtn: $("toggleThumbnailsBtn"),
      adjustColumnsMenuItem: $("adjustColumnsMenuItem"),
      mermaidHelperPanel: $("mermaidHelperPanel"),

      // Presenter / Modes
      presenterPanel: $("presenterPanel"),
      presentBtn: $("presentBtn"),
      toggleEditModeBtn: $("toggleEditModeBtn"),
      toggleFullscreenBtn: $("toggleFullscreenBtn"),

      // Break Timer
      breakDurationSelect: $("breakDuration"),
      breakBtn: $("breakBtn"),

      // Freeze
      freezeBtn: $("freezeBtn"),

      // Menu
      menuBtn: $("menuBtn"),
      menuDropdown: $("menuDropdown"),
      menuOpenFileBtn: $("menuOpenFileBtn"),
      menuReloadDeckBtn: $("menuReloadDeckBtn"),
      menuToggleEditModeBtn: $("menuToggleEditModeBtn"),
      menuSaveBtn: $("menuSaveBtn"),
      menuPrintBtn: $("menuPrintBtn"),
      menuExportHtmlBtn: $("menuExportHtmlBtn"),
      menuExportTextpackBtn: $("menuExportTextpackBtn"),
      menuNewPresentationBtn: $("menuNewPresentationBtn"),
      menuConvertPptxBtn: $("menuConvertPptxBtn"),
      menuCommandPaletteBtn: $("menuCommandPaletteBtn"),
      menuSettingsBtn: $("menuSettingsBtn"),
      printBtn: $("printBtn"),
      reloadDeckBtn: $("reloadDeckBtn"),
      toggleEditModeLabel: $("toggleEditModeLabel"),

      // Theme
      themeToggleBtn: $("themeToggleBtn"),
    };
  }
}
