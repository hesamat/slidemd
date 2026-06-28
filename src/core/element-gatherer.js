/**
 * ElementGatherer
 * Gathers all DOM element references used by the application.
 */

export class ElementGatherer {
  /**
   * Gathers all DOM element references used by the application.
   * @returns {Object} An object containing all element references
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
      slideActionsDropdownBtn: $("slideActionsDropdownBtn"),
      slideActionsDropdownContent: $("slideActionsDropdownContent"),
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
      menuCourseProfilesBtn: $("menuCourseProfilesBtn"),
      menuAIConfigBtn: $("menuAIConfigBtn"),
      menuGenerateDeckBtn: $("menuGenerateDeckBtn"),
      menuNewPresentationBtn: $("menuNewPresentationBtn"),
      printBtn: $("printBtn"),
      reloadDeckBtn: $("reloadDeckBtn"),

      // Theme
      themeToggleBtn: $("themeToggleBtn"),
    };
  }
}
