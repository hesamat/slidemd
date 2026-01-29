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
            addSlideBtn: $("addSlideBtn"),
            duplicateSlideBtn: $("duplicateSlideBtn"),
            deleteSlideBtn: $("deleteSlideBtn"),
            saveSlideBtn: $("saveSlideBtn"),
            toggleThumbnailsBtn: $("toggleThumbnailsBtn"),

            // Presenter / Modes
            presenterPanel: $("presenterPanel"),
            openViewerBtn: $("openViewerBtn"),
            toggleEditModeBtn: $("toggleEditModeBtn"),
            toggleFullscreenBtn: $("toggleFullscreenBtn"),

            // Break Timer
            breakDurationSelect: $("breakDuration"),
            breakBtn: $("breakBtn"),

            // Menu
            menuBtn: $("menuBtn"),
            menuDropdown: $("menuDropdown"),
            menuOpenFileBtn: $("menuOpenFileBtn"),
            menuReloadDeckBtn: $("menuReloadDeckBtn"),
            menuPrintBtn: $("menuPrintBtn"),
            menuExportHtmlBtn: $("menuExportHtmlBtn"),
            printBtn: $("printBtn"),
            reloadDeckBtn: $("reloadDeckBtn"),

            // Theme
            themeToggleBtn: $("themeToggleBtn")
        };
    }
}
