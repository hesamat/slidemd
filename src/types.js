/**
 * Shared type definitions for SlideMD.
 */

/**
 * @typedef {Object} Slide
 * @property {string} id - URL-safe slug derived from the title.
 * @property {string} title - Display title (from heading or auto-generated).
 * @property {string} notes - Speaker notes (HTML comments stripped from content).
 * @property {string} layout - Layout spec string or preset name (e.g. "two-column").
 * @property {boolean} mediaFullBleed - Persisted full-bleed intent for resized media-span grids.
 * @property {string} background - CSS background value for the slide.
 * @property {'dark'|'light'|''} theme - Theme override for this slide.
 * @property {string} headerStyle - Header style override (e.g. "thick", "none").
 * @property {boolean} hidden - Whether the slide is hidden in presentation mode.
 * @property {Object<string, string>} areas - Map of area names to rendered HTML content.
 * @property {string} areaStyle - CSS applied to all areas uniformly.
 * @property {Object<string, string>} areaStyles - Background CSS value per area name (from `area-bg-<name>:` directives).
 * @property {Object<string, string>} [areaInks] - Text color CSS value per area name (from `area-ink-<name>:` directives).
 * @property {Object<string, number>} [_areaOffsets] - 0-indexed editor line offsets per area (internal).
 */

/**
 * @typedef {Object} Deck
 * @property {DeckMeta} meta - Deck-level metadata.
 * @property {Slide[]} slides - Ordered list of slides.
 * @property {import('./data/ai/visual-system-schema.js').VisualSystem|null} [visualSystem] - Optional deck-wide visual system.
 */

/**
 * @typedef {Object} DeckMeta
 * @property {string} id - URL-safe slug derived from the deck title.
 * @property {string} title - Display title (from first slide or file name).
 * @property {string} [course] - Optional course name.
 * @property {string} aspect - Aspect ratio string (e.g. "16:9").
 * @property {{ width: number, height: number }} stage - Design dimensions in pixels.
 */

/**
 * @typedef {Object} Layout
 * @property {string} gridTemplate - CSS grid-template-areas value.
 * @property {string} description - Human-readable description.
 * @property {string} preview - HTML string for layout preview thumbnail.
 * @property {string} template - Markdown template for new slides using this layout.
 * @property {string[]} orderedAreas - Ordered list of area names parsed from gridTemplate.
 */

/**
 * @typedef {Object} DirectiveResult
 * @property {string} value - Extracted directive value (empty string if not found).
 * @property {boolean} found - Whether the directive was present.
 * @property {number} from - Start index of the directive line in the original text (or -1 if not found).
 * @property {number} to - End index of the directive line in the original text (or -1 if not found).
 * @property {string} markdown - Remaining markdown after directive removal.
 */

/**
 * @typedef {Object} AreaParseResult
 * @property {Object<string, string>} areas - Map of area names to raw markdown content.
 * @property {Object<string, number>} areaOffsets - 0-indexed line offsets per area.
 */

/**
 * @typedef {'parent'|'images'} DirectoryMode
 * What the saved directory handle points to:
 * - "parent" — the parent folder containing the deck .md file.
 * - "images" — the handle IS the images folder itself.
 */

/**
 * @typedef {Object} GatheredElements
 * @property {HTMLElement} stageHost
 * @property {HTMLElement} deckStage
 * @property {HTMLElement} stageInner
 * @property {HTMLElement} slidesContainer
 * @property {HTMLElement} slideNumberEl
 * @property {HTMLElement} slideCountEl
 * @property {HTMLElement} slideAnnouncer
 * @property {HTMLElement} deckTitleEl
 * @property {HTMLElement} notesContainer
 * @property {HTMLElement} nextPreview
 * @property {HTMLInputElement} fileInput
 * @property {HTMLElement} editorPanel
 * @property {HTMLElement} markdownEditor
 * @property {HTMLElement} insertDropdownBtn
 * @property {HTMLElement} insertDropdownContent
 * @property {HTMLElement} addSlideFooterBtn
 * @property {HTMLElement} toggleThumbnailsBtn
 * @property {HTMLElement} adjustColumnsMenuItem
 * @property {HTMLElement} mermaidHelperPanel
 * @property {HTMLElement} presenterPanel
 * @property {HTMLElement} presentBtn
 * @property {HTMLElement} toggleEditModeBtn
 * @property {HTMLElement} toggleFullscreenBtn
 * @property {HTMLSelectElement} breakDurationSelect
 * @property {HTMLElement} breakBtn
 * @property {HTMLElement} presenterElapsed
 * @property {HTMLElement} presenterClock
 * @property {HTMLElement} freezeBtn
 * @property {HTMLElement} menuBtn
 * @property {HTMLElement} menuDropdown
 * @property {HTMLElement} menuOpenFileBtn
 * @property {HTMLElement} menuReloadDeckBtn
 * @property {HTMLElement} menuToggleEditModeBtn
 * @property {HTMLElement} menuSaveBtn
 * @property {HTMLElement} menuPrintBtn
 * @property {HTMLElement} menuExportHtmlBtn
 * @property {HTMLElement} menuExportTextpackBtn
 * @property {HTMLElement} menuNewPresentationBtn
 * @property {HTMLElement} menuConvertPptxBtn
 * @property {HTMLElement} menuCommandPaletteBtn
 * @property {HTMLElement} menuSettingsBtn
 * @property {HTMLElement} printBtn
 * @property {HTMLElement} reloadDeckBtn
 * @property {HTMLElement} toggleEditModeLabel
 * @property {HTMLElement} themeToggleBtn
 */

// Export empty object so `import('../types.js').*` resolves in TypeScript/IDE tooling.
// JSDoc @typedef declarations are type-only and don't create runtime exports.
export {};
