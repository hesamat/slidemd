/**
 * EditController
 * Manages edit mode with side-by-side markdown editor and live preview.
 */
import { MarkdownParser } from "../../data/markdown-parser.js";
import { DeckLoader } from "../../data/deck-loader.js";
import { Notification } from "../../renderer/notification.js";
import { StageScaler } from "../../renderer/stage-scaler.js";
import { ImagePicker } from "../image/image-picker.js";
import { ImageInteractionHandler } from "../image/image-interaction-handler.js";
import { ImagePropertiesPanel } from "../image/image-properties-panel.js";
import { fitToWidth, getStageScale } from "../image/image-position-presets.js";
import { SlideOperations } from "./slide-operations.js";
import { ImageBackgroundHandler } from "../image/image-background-handler.js";
import { ImageInserter } from "../image/image-inserter.js";
import { TextBlockHandler } from "../text/text-block-handler.js";
import { AreaNavigation } from "../navigation/area-navigation.js";
import { MarkdownEditor } from "./markdown-editor.js";
import { SlideThumbnails } from "./slide-thumbnails.js";
import { LayoutPicker } from "../layout/layout-picker.js";

import { GridResizerManager } from "../layout/grid-resizer-manager.js";
import { AreaGuideManager } from "../navigation/area-guide-manager.js";
import { SlideWarningManager } from "../navigation/slide-warning-manager.js";
import { InsertDropdownManager } from "../ui/insert-dropdown-manager.js";
import { AiDropdownManager } from "../ui/ai-dropdown-manager.js";
import { MermaidHelperManager } from "../ui/mermaid-helper-manager.js";
import { LayoutManager } from "../layout/layout-manager.js";
import { ThemeManager } from "../ui/theme-manager.js";
import {
  buildSingleColumnCustomLayout,
  makeAreaFullHeight,
  parseSingleColumnLayout,
  removeAreaFromLayout,
  updateAreaStyleForAreaDirective,
  updateLayoutDirective,
} from "./directive-utils.js";
import { LayoutParser } from "../../data/layout-parser.js";
import { PanelResizer } from "../ui/panel-resizer.js";
import { SaveManager } from "../ui/save-manager.js";
import { SlideStylePanel } from "../ui/slide-style-panel.js";
import { SlidePreviewUpdater } from "./slide-preview-updater.js";
import { StyleApplier } from "./style-applier.js";
import { SourceJumpHandler } from "./source-jump-handler.js";
import { resolveConflict } from "../../data/store/conflict-resolver.js";
import { ConflictModal } from "../ui/conflict-modal.js";
import { AssetLoader } from "../../core/asset-loader.js";
import { createEditPatch } from "../../data/store/slide-patch.js";

export class EditController {
  constructor(deck, controller, elements, { deckStore = null } = {}) {
    this.deck = deck;
    this.controller = controller;
    this.elements = elements;
    this.deckStore = deckStore;
    this._offStoreChange = this.deckStore?.onStoreChange((slides) =>
      this._handleStoreChange(slides),
    );

    this.isEditMode = false;
    this.currentSlideIndex = controller.slideNavigator.currentIndex;
    this.hasUnsavedChanges = false;

    this.markdownEditor = null;

    this.unsavedMarkdown = new Map();
    this._pendingStructuralOperations = 0;
    this._historyOperation = null;
    this._deckRestoreDepth = 0;

    this.placeholderDialogEl = null;

    this._destroyed = false;
    this._lastEditorSlideIndex = -1;
    this._lastEditorDeck = null;
    this._cachedSourceMarkdown = null;
    this._cachedOriginalSlides = [];

    this._onSlideChange = () => {
      this.currentSlideIndex = this.controller.slideNavigator.currentIndex;
      ImageInteractionHandler.deactivate();
      TextBlockHandler.deactivate();
      SlideStylePanel.hide();
      // Skip loading when a deck restore is in progress — the explicit
      // loadSlideIntoEditor call at the end of _restoreStoreSnapshot
      // handles the load with the updated deck reference and correct index.
      if (!this._deckRestoreDepth) this.loadSlideIntoEditor();
    };
    this._onDeckChange = (data) => {
      this.deck = data.deck;
      // Only clear the per-slide state cache on real deck changes (new
      // file loaded, whole-deck AI refine). Store restores (undo/redo,
      // single-slide AI) use syncStore: false and don't need a full
      // cache clear — loadSlideState's mismatch branch handles doc drift.
      if (data.syncStore !== false) {
        this.markdownEditor?.clearSlideStateCache();
      }
      const isStoreRestore = data.syncStore === false && this.deckStore;
      if (this.deckStore) {
        if (isStoreRestore) {
          this._reconcileUnsavedOverlays(this.deckStore.getSlides());
        } else {
          this.unsavedMarkdown.clear();
        }
      } else {
        this.unsavedMarkdown.clear();
      }
      this._pendingStructuralOperations = 0;
      this.hasUnsavedChanges = this._storeDiffersFromSource() || this.unsavedMarkdown.size > 0;
      this.saveManager.updateButton();
      this.currentSlideIndex = this.controller.slideNavigator.currentIndex;
      // Skip loadSlideIntoEditor during a deck restore — the explicit
      // loadSlideIntoEditor call at the end of _restoreStoreSnapshot
      // handles the load at the correct (restored) index.
      if (!this._deckRestoreDepth) this.loadSlideIntoEditor();
      this.imageBg.deckDirectoryHandle = null;
    };
    this._onSlidesContainerClick = (e) => {
      if (!this.isEditMode) return;

      const textBlock = e.target.closest(".text-block");
      if (textBlock && !TextBlockHandler.isMultiColumn(textBlock)) {
        // Leave clicks alone while the block is being edited inline, otherwise
        // re-selecting it clears contenteditable and drops the typed text.
        if (textBlock.isContentEditable) return;
        e.preventDefault();
        e.stopPropagation();
        ImageInteractionHandler.deselect();
        TextBlockHandler.select(textBlock);
        TextBlockHandler._showPanel();
        return;
      }

      const img = e.target.closest("img");
      if (!img) return;
      if (img.closest(".editor-area-label, .editor-slide-warning")) return;

      e.preventDefault();
      e.stopPropagation();
      TextBlockHandler.deselect();
      ImageInteractionHandler.select(img);
    };

    this._onSlidesContainerContextMenu = (e) => {
      if (!this.isEditMode) return;
      if (e.target.closest(".editor-area-label, .editor-slide-warning, img, .text-block")) return;
      const slidesContainer = this.elements.slidesContainer;
      if (slidesContainer) {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
          const range = selection.getRangeAt(0);
          if (slidesContainer.contains(range.commonAncestorContainer)) return; // allow native copy/paste on selected slide text
        }
      }
      if (e.target.closest("a")) return; // allow native link context menu
      e.preventDefault();
      this.insertDropdown.openContextMenu(e.clientX, e.clientY);
    };

    this.thumbnails = new SlideThumbnails(deck, controller, elements, {
      onAddSlide: () => this.layoutManager.showPicker(),
      onDuplicateSlide: () => this.slideOps.duplicateSlide(),
      onDeleteSlide: () => this.slideOps.deleteSlide(),
      onMoveSlideUp: () => this.slideOps.moveSlideUp(),
      onMoveSlideDown: () => this.slideOps.moveSlideDown(),
    });

    this.imageBg = new ImageBackgroundHandler();

    this.saveManager = new SaveManager({
      getDeck: () => this.deck,
      getDeckStore: () => this.deckStore,
      getSourceMarkdown: () => this._getSourceMarkdown(),
      setSourceMarkdown: (markdown) => this._setSourceMarkdown(markdown),
      getUnsavedMarkdown: () => this.unsavedMarkdown,
      getHasUnsavedChanges: () => this.hasUnsavedChanges,
      setHasUnsavedChanges: (v) => {
        this.hasUnsavedChanges = v;
      },
      onBeforeSave: () => {
        this.prepareStoreOperation(true);
      },
      onSaveStateReset: () => {
        this._pendingStructuralOperations = 0;
      },
    });

    this.areaNav = new AreaNavigation({
      getMarkdownEditor: () => this.markdownEditor,
      onEditorInput: (v) => this.onEditorInput(v),
    });

    this.slideOps = new SlideOperations({
      getDeck: () => this.deck,
      getElements: () => this.elements,
      getController: () => this.controller,
      getThumbnails: () => this.thumbnails,
      getMarkdownEditor: () => this.markdownEditor,
      getCurrentSlideIndex: () => this.currentSlideIndex,
      setCurrentSlideIndex: (v) => {
        this.currentSlideIndex = v;
      },
      getUnsavedMarkdown: () => this.unsavedMarkdown,
      setUnsavedMarkdown: (v) => {
        this.unsavedMarkdown = v;
      },
      getHasUnsavedChanges: () => this.hasUnsavedChanges,
      setHasUnsavedChanges: (v) => {
        this.hasUnsavedChanges = v;
      },
      getSaveManager: () => this.saveManager,
      deckStore: this.deckStore,
      prepareStoreOperation: () => this.prepareStoreOperation(),
      recordStoreOperation: () => this.recordStoreOperation(),
    });

    this.imageInserter = new ImageInserter({
      getMarkdownEditor: () => this.markdownEditor,
      getIsEditMode: () => this.isEditMode,
      getCurrentSlideIndex: () => this.currentSlideIndex,
      getSlidesContainer: () => this.elements.slidesContainer,
      getSlideElementByIndex: (i) => this.getSlideElementByIndex(i),
      getImageBg: () => this.imageBg,
      getAreaNav: () => this.areaNav,
      getStageScale: () =>
        parseFloat(this.elements.deckStage?.style.getPropertyValue("--stage-scale")) || 1,
    });

    this.gridResizer = new GridResizerManager({
      adjustColumnsMenuItem: this.elements.adjustColumnsMenuItem,
      deckStage: this.elements.deckStage,
      getMarkdownEditor: () => this.markdownEditor,
      getCurrentSlideIndex: () => this.currentSlideIndex,
      getSlideElementByIndex: (i) => this.getSlideElementByIndex(i),
    });

    this.areaGuides = new AreaGuideManager({
      getIsEditMode: () => this.isEditMode,
      getCurrentSlideIndex: () => this.currentSlideIndex,
      getDeck: () => this.deck,
      getSlideElementByIndex: (i) => this.getSlideElementByIndex(i),
      onNavigateToArea: (name) => this.areaNav.navigateToArea(name),
      onAttachGridResizer: (el, data) => this.gridResizer.attachForSlide(el, data),
      onDeleteArea: (name) => this._deleteAreaFromMarkdown(name),
      canDeleteArea: (name) => this._canDeleteArea(name),
      onSwapArea: (name) => this._swapAreaInMarkdown(name),
      canSwapArea: (name) => this._canSwapArea(name),
      onMakeFullHeight: (name) => this._makeAreaFullHeight(name),
      canMakeFullHeight: (name) => this._canMakeFullHeight(name),
      onAlignMain: (name, align) => this._alignMainInMarkdown(name, align),
      onSetBackground: (name, color) => this._setAreaBackground(name, color),
      getWarnings: () => this.warnings,
      onFixAreaMismatch: (allowedAreas) => this._fixMismatchedAreas(allowedAreas),
    });

    this.warnings = new SlideWarningManager({
      getCurrentSlideIndex: () => this.currentSlideIndex,
      getSlideElementByIndex: (i) => this.getSlideElementByIndex(i),
    });

    this.insertDropdown = new InsertDropdownManager({
      btn: this.elements.insertDropdownBtn,
      content: this.elements.insertDropdownContent,
      actions: {
        layout: () => this.layoutManager.showPickerForCurrentSlide(),
        "adjust-columns": () => this.gridResizer.toggle(),
        image: () => this.imageInserter.pickAndInsert(),
        text: () => TextBlockHandler.insertTextBlock(),
        mermaid: () => this.mermaidHelper.toggle(),
        theme: () => this.themeManager.toggle(),
        "area-style": () => SlideStylePanel.toggle(),
        new: () => this.layoutManager.showPicker(),
        duplicate: () => this.slideOps.duplicateSlide(),
        delete: () => this.slideOps.deleteSlide(),
      },
    });

    this.aiDropdown = new AiDropdownManager({
      btn: this.elements.aiDropdownBtn,
      content: this.elements.aiDropdownContent,
      actions: {
        enhanceSlide: () => this.runSingleSlideAi("enhanceSlide"),
        addSpeakerNotes: () => this.runSingleSlideAi("addSpeakerNotes"),
        generate: () => this.runWholeDeckAi(),
      },
    });

    this.mermaidHelper = new MermaidHelperManager({
      mermaidHelperPanel: this.elements.mermaidHelperPanel,
      getMarkdownEditor: () => this.markdownEditor,
    });

    this.layoutManager = new LayoutManager({
      getMarkdownEditor: () => this.markdownEditor,
      onAddSlideWithLayout: (name) => this.slideOps.addSlideWithLayout(name),
    });

    this.themeManager = new ThemeManager({
      getMarkdownEditor: () => this.markdownEditor,
      getDeck: () => this.deck,
      getCurrentSlideIndex: () => this.currentSlideIndex,
      onPreviewUpdate: () => this.previewUpdater.update(),
    });

    this.panelResizer = new PanelResizer({
      editorPanel: this.elements.editorPanel,
      stageHost: this.elements.stageHost,
    });

    this.previewUpdater = new SlidePreviewUpdater({
      getMarkdownEditor: () => this.markdownEditor,
      getWarnings: () => this.warnings,
      getDeck: () => this.deck,
      getCurrentSlideIndex: () => this.currentSlideIndex,
      getThumbnails: () => this.thumbnails,
      getAreaGuides: () => this.areaGuides,
      getGridResizer: () => this.gridResizer,
    });

    this.styleApplier = new StyleApplier({
      getSaveManager: () => this.saveManager,
      getDeckStore: () => this.deckStore,
      getUnsavedMarkdown: () => this.unsavedMarkdown,
      setUnsavedMarkdown: (v) => {
        this.unsavedMarkdown = v;
      },
      setHasUnsavedChanges: (v) => {
        this.hasUnsavedChanges = v;
      },
      onUpdateSaveButton: () => this.saveManager.updateButton(),
      getImageBg: () => this.imageBg,
      prepareStoreOperation: () => this.prepareStoreOperation(),
    });

    this.sourceJump = new SourceJumpHandler({
      getSlidesContainer: () => this.elements.slidesContainer,
      getIsEditMode: () => this.isEditMode,
      getMarkdownEditor: () => this.markdownEditor,
    });

    this.init();
  }

  /**
   * Get the source markdown for editing.
   * Checks localStorage first, then falls back to the in-memory
   * global (used for large converted decks that exceed quota).
   */
  _getSourceMarkdown() {
    return DeckLoader.getSourceMarkdown();
  }

  /**
   * Update the source snapshot after a successful save so the dirty
   * baseline matches what was written to disk.
   * @param {string} markdown
   */
  _setSourceMarkdown(markdown) {
    this._cachedSourceMarkdown = null;
    try {
      localStorage.setItem("webdeck_local_file", markdown);
    } catch {
      localStorage.removeItem("webdeck_local_file");
      window.__WEBDECK_MARKDOWN__ = markdown;
    }
  }

  _cacheOriginalMarkdown() {
    const localFile = this._getSourceMarkdown();
    if (!localFile) return [];
    if (localFile === this._cachedSourceMarkdown) {
      return this._cachedOriginalSlides;
    }

    try {
      const parser = new MarkdownParser();
      this._cachedSourceMarkdown = localFile;
      this._cachedOriginalSlides = parser.splitSlides(localFile);
      return this._cachedOriginalSlides;
    } catch (error) {
      console.error("Failed to cache markdown:", error);
      this._cachedSourceMarkdown = null;
      this._cachedOriginalSlides = [];
      return [];
    }
  }

  /**
   * Compare the canonical store to the on-disk/on-load source markdown.
   * @returns {boolean}
   */
  _storeDiffersFromSource() {
    const store = this.deckStore.getSlides();
    const source = this._cacheOriginalMarkdown();
    if (store.length !== source.length) return true;
    const normalize = (s) => s.replace(/\r\n?/g, "\n").trim();
    return store.some((slide, i) => normalize(slide) !== normalize(source[i]));
  }

  /**
   * Initialize the edit controller
   */
  init() {
    this.panelResizer.init();

    this._toggleThumbnailsBound = () => this.toggleThumbnails();
    this._toggleEditModeBound = () => this.toggleEditMode();
    this._addSlideBound = () => this.layoutManager.showPicker();
    this._deleteSlideBound = () => this.slideOps.deleteSlide();
    this._duplicateSlideBound = () => this.slideOps.duplicateSlide();

    this.elements.toggleThumbnailsBtn?.addEventListener("click", this._toggleThumbnailsBound);
    this.elements.toggleEditModeBtn?.addEventListener("click", this._toggleEditModeBound);
    this.elements.addSlideBtn?.addEventListener("click", this._addSlideBound);
    this.elements.deleteSlideBtn?.addEventListener("click", this._deleteSlideBound);
    this.elements.duplicateSlideBtn?.addEventListener("click", this._duplicateSlideBound);

    this.controller.addEventListener("slidechange", this._onSlideChange);
    this.controller.addEventListener("deckchange", this._onDeckChange);

    this.insertDropdown.init();
    this.aiDropdown.init();
    this.mermaidHelper.init();

    LayoutPicker.initModal();

    ImagePicker.init();

    // Image interaction — drag/resize
    ImageInteractionHandler.init(
      () => this.markdownEditor?.getValue() ?? "",
      (updated) => {
        this.markdownEditor?.setValue(updated, { suppressOnChange: true });
        this.unsavedMarkdown.set(this.currentSlideIndex, updated);
        this.updateUnsavedChangesFlag();
        const slideEl = this.getSlideElementByIndex(this.currentSlideIndex);
        if (slideEl) this.areaGuides.updateAreaOverflow(slideEl);
      },
      {
        onDelete: (updated) => {
          this.markdownEditor?.setValue(updated, { suppressOnChange: false });
          this.unsavedMarkdown.set(this.currentSlideIndex, updated);
          this.updateUnsavedChangesFlag();
          this.previewUpdater.update();
        },
        onMoveArea: (updated) => {
          this.markdownEditor?.setValue(updated, { suppressOnChange: true });
          this.unsavedMarkdown.set(this.currentSlideIndex, updated);
          this.updateUnsavedChangesFlag();
          this.previewUpdater.update();
        },
      },
    );
    TextBlockHandler.init({
      getMarkdown: () => this.markdownEditor?.getValue() ?? "",
      setMarkdown: (updated) => {
        this.markdownEditor?.setValue(updated, { suppressOnChange: true });
        this.unsavedMarkdown.set(this.currentSlideIndex, updated);
        this.updateUnsavedChangesFlag();
      },
      onDelete: (updated) => {
        this.markdownEditor?.setValue(updated, { suppressOnChange: false });
      },
      getMarkdownEditor: () => this.markdownEditor,
      getCurrentSlideIndex: () => this.currentSlideIndex,
      getSlideElementByIndex: (i) => this.getSlideElementByIndex(i),
    });

    this._initImagePropertiesPanel();

    // Slide style panel — for styling all areas uniformly
    SlideStylePanel.init(
      () => this.markdownEditor?.getValue() ?? "",
      (updated) => {
        this.markdownEditor?.setValue(updated, { suppressOnChange: false });
      },
      (cssString, headerStyle, background, theme) =>
        this.styleApplier.applyToAll(cssString, headerStyle, background, theme),
      (onSelect) => this.styleApplier.pickImage(onSelect),
    );

    // Source-jump: click text in slide → jump to markdown source
    this.sourceJump.init();

    this.thumbnails.render();
  }

  /**
   * Tear down all sub-module listeners and clear the global handle.
   * Idempotent — safe to call more than once.
   */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    // Store subscription
    this._offStoreChange?.();

    // Controller EventEmitter listeners
    this.controller.removeEventListener("slidechange", this._onSlideChange);
    this.controller.removeEventListener("deckchange", this._onDeckChange);

    // DOM listeners on top-bar buttons
    this.elements.toggleThumbnailsBtn?.removeEventListener("click", this._toggleThumbnailsBound);
    this.elements.toggleEditModeBtn?.removeEventListener("click", this._toggleEditModeBound);
    this.elements.addSlideBtn?.removeEventListener("click", this._addSlideBound);
    this.elements.deleteSlideBtn?.removeEventListener("click", this._deleteSlideBound);
    this.elements.duplicateSlideBtn?.removeEventListener("click", this._duplicateSlideBound);

    // slidesContainer click → image selection
    this.elements.slidesContainer?.removeEventListener("click", this._onSlidesContainerClick);
    this.elements.slidesContainer?.removeEventListener(
      "contextmenu",
      this._onSlidesContainerContextMenu,
    );

    // Sub-modules with their own listeners
    this.thumbnails?.destroy();
    this.sourceJump?.destroy();
    this.imageInserter?.destroy();
    this.insertDropdown?.destroy();
    this.aiDropdown?.destroy();
    this.mermaidHelper?.destroy();
    this.panelResizer?.destroy();

    // Release the global handle so a recreated EditController can register
    if (window.__WEBDECK_EDIT_CONTROLLER__ === this) {
      window.__WEBDECK_EDIT_CONTROLLER__ = null;
    }

    this.markdownEditor?.view?.destroy?.();
  }

  /**
   * Toggle edit mode on/off
   */
  toggleEditMode() {
    if (!this.isEditMode && !this._getSourceMarkdown()) {
      Notification.warning("Open a markdown file first to enable the editor");
      return;
    }

    this.isEditMode = !this.isEditMode;

    this.controller.onEditModeChanged?.();

    if (this.isEditMode) {
      this.elements.editorPanel?.classList.remove("webdeck-hidden");
      this.elements.presenterPanel?.classList.add("webdeck-hidden");
      this.elements.toggleEditModeBtn.classList.add("active");
      if (this.elements.toggleEditModeLabel) this.elements.toggleEditModeLabel.textContent = "Done";
      this.elements.toggleEditModeBtn?.setAttribute("aria-label", "Exit edit mode");
      this.elements.toggleEditModeBtn?.setAttribute("title", "Exit edit mode (E)");
      document.body.setAttribute("data-edit-mode", "true");

      // Initialize the markdown editor if not already initialized
      if (!this.markdownEditor && this.elements.markdownEditor) {
        this.markdownEditor = new MarkdownEditor(this.elements.markdownEditor, {
          onChange: (value) => this.onEditorInput(value),
          debounceDelay: 300,
          getContextMenuItems: (lineText) => this._getCodeMirrorContextMenuItems(lineText),
        });
      }

      this.loadSlideIntoEditor();
    } else {
      this.elements.editorPanel?.classList.add("webdeck-hidden");
      this.elements.toggleEditModeBtn.classList.remove("active");
      if (this.elements.toggleEditModeLabel) this.elements.toggleEditModeLabel.textContent = "Edit";
      this.elements.toggleEditModeBtn?.setAttribute("aria-label", "Toggle edit mode");
      this.elements.toggleEditModeBtn?.setAttribute("title", "Edit Mode (E)");
      document.body.removeAttribute("data-edit-mode");
      this.mermaidHelper.hide();
      ImageInteractionHandler.deactivate();
      TextBlockHandler.deactivate();
      SlideStylePanel.hide();
      this.placeholderDialogEl?.remove();
      this.placeholderDialogEl = null;

      // Restore presenter panel visibility based on editor role
      if (this.controller.roleManager.isEditorWindow) {
        this.elements.presenterPanel?.classList.remove("webdeck-hidden");
      }

      // Discard unsaved changes when exiting edit mode
      if (this.hasUnsavedChanges) {
        this.hasUnsavedChanges = false;
        this.saveManager.updateButton();
      }
    }

    // Re-scale the stage to fit the new layout after toggling edit mode
    setTimeout(() => StageScaler.applyStageScale(this.elements), 50);
  }

  /**
   * Toggle slides preview collapse/expand
   */
  toggleThumbnails() {
    const thumbnailsContainer = document.querySelector(".editor__thumbnails");
    const toggleBtn = this.elements.toggleThumbnailsBtn;

    if (thumbnailsContainer && toggleBtn) {
      const isCollapsed = thumbnailsContainer.classList.toggle("collapsed");
      toggleBtn.setAttribute("aria-label", isCollapsed ? "Expand slides" : "Collapse slides");
      toggleBtn.setAttribute("title", isCollapsed ? "Expand slides" : "Collapse slides");
    }
  }

  _captureCurrentEditorMarkdown() {
    if (!this.markdownEditor) return;
    const markdown = this.markdownEditor.getValue();
    const original = this.deckStore.getSlides()[this.currentSlideIndex];
    if (markdown === (original ?? "")) {
      this.unsavedMarkdown.delete(this.currentSlideIndex);
      this.updateUnsavedChangesFlag();
      return;
    }
    if (markdown === this.unsavedMarkdown.get(this.currentSlideIndex)) return;
    this.unsavedMarkdown.set(this.currentSlideIndex, markdown);
    this.updateUnsavedChangesFlag();
  }

  /**
   * Public guard for code that needs the current editor buffer captured before
   * reading the deck markdown. Only captures when the editor is actually active
   * so a stale buffer from a previously viewed slide is not attributed to the
   * current slide.
   */
  captureCurrentEditorState() {
    if (this.isEditMode) this._captureCurrentEditorMarkdown();
  }

  prepareStoreOperation(recordHistory = false) {
    this._captureCurrentEditorMarkdown();
    const storeSlides = this.deckStore.getSlides();
    const storeSlideObjects = storeSlides.map((markdown, index) => ({ index, markdown }));
    const fullSlides = this.saveManager
      .getFullSlides(storeSlideObjects)
      .map((slide) => slide.markdown ?? "");

    if (recordHistory) {
      const patches = [];
      for (let i = 0; i < storeSlides.length; i++) {
        if (storeSlides[i] !== fullSlides[i]) {
          patches.push(createEditPatch(i, storeSlides[i], fullSlides[i], "user"));
        }
      }
      if (patches.length > 0) {
        const result = this.deckStore.applyPatches(patches, { emitStoreChange: false });
        const succeeded = result === true || (result && result.success === true);
        if (!succeeded) {
          // Patches were rejected (drift / before mismatch); fall back to a
          // silent full sync so the store stays in sync with the editor.
          this.deckStore.syncSlides(fullSlides, this.currentSlideIndex, { emitStoreChange: false });
        }
      }
    } else {
      this.deckStore.syncSlides(fullSlides, this.currentSlideIndex, { emitStoreChange: false });
    }

    this._reconcileUnsavedOverlays(this.deckStore.getSlides());
    this.hasUnsavedChanges = this._storeDiffersFromSource() || this.unsavedMarkdown.size > 0;
    this.saveManager.updateButton();
  }

  recordStoreOperation() {
    this._pendingStructuralOperations += 1;
  }

  /**
   * Prune out-of-range or identical unsaved overlays, keeping only those
   * that genuinely differ from the supplied source.
   * @param {string[]} source
   */
  _reconcileUnsavedOverlays(source) {
    const next = new Map();
    for (const [idx, value] of this.unsavedMarkdown) {
      if (idx >= 0 && idx < source.length && value !== source[idx]) {
        next.set(idx, value);
      }
    }
    this.unsavedMarkdown = next;
  }

  async _restoreStoreSnapshot() {
    if (!this.deckStore) return false;
    // Save the current editor state into the cache before the restore
    // potentially replaces it, so the most recent undo history is preserved
    // rather than a stale snapshot from the last navigation away.
    // Don't force-save: if SlideOperations._clearEditorHistoryCache() just
    // cleared the cache for a structural op, the current editor state belongs
    // to a pre-op slide at a pre-op index and would pollute the cache.
    // The slide-count guard below will clear again if needed.
    if (this._lastEditorSlideIndex >= 0 && this.markdownEditor) {
      this.markdownEditor.saveSlideState(this._lastEditorSlideIndex);
    }
    const markdown = this.deckStore.toMarkdown();
    const restoredActiveIndex = this.deckStore.getActiveIndex();
    // Capture the rendered deck's slide count (not the store's) since
    // replaceDeck with syncStore:false doesn't touch the store — both
    // store reads would return the same value. The rendered deck is
    // what changes when replaceDeck swaps in the new parsed deck.
    const renderedSlideCountBefore = this.deck?.slides?.length ?? 0;
    await AssetLoader.ensureMarkdownItLoaded();
    const deck = await DeckLoader.parseMarkdown(markdown);
    // Use a depth counter instead of a boolean so concurrent restores
    // don't clear the flag while an outer restore is still in progress.
    this._deckRestoreDepth++;
    try {
      await this.controller.reloadManager.replaceDeck(deck, { syncStore: false });
      // Clear the per-slide state cache when the slide count changed
      // (e.g. undo/redo of add/delete/move). Index-keyed cache entries
      // would otherwise attach to the wrong slide after a shift.
      if (deck.slides.length !== renderedSlideCountBefore) {
        this.markdownEditor?.clearSlideStateCache();
      }
      // Navigate to the restored index while the depth is still > 0 so
      // _onSlideChange is suppressed — the explicit loadSlideIntoEditor
      // below is the single load at the correct index.
      this.controller.slideNavigator.goTo(restoredActiveIndex, { broadcast: false });
    } finally {
      this._deckRestoreDepth--;
    }
    // Use the navigator's clamped index (which may differ from the store's
    // raw active index if hidden-slide adjustment was applied) and load
    // the editor at that index with the updated deck.
    this.currentSlideIndex = this.controller.slideNavigator.currentIndex;
    this.loadSlideIntoEditor();
    return true;
  }

  /**
   * Respond to a canonical DeckStore change by re-syncing the editor view.
   * Preserves unsaved editor overlays that still differ from the store and
   * re-renders thumbnails, the current slide, and the preview.
   * @param {string[]} slides
   */
  _handleStoreChange(slides) {
    if (this._destroyed) return;

    this._reconcileUnsavedOverlays([...slides]);
    this.hasUnsavedChanges = this._storeDiffersFromSource() || this.unsavedMarkdown.size > 0;
    this.saveManager.updateButton();

    if (this.isEditMode) {
      this._storeChangeQueue = (this._storeChangeQueue || Promise.resolve())
        .catch(() => {})
        .then(async () => {
          try {
            await this._restoreStoreSnapshot();
            this.previewUpdater?.update();
          } catch (error) {
            console.error("Store-to-view sync failed:", error);
            Notification.error("Failed to refresh the editor view.");
          }
        });
    }
  }

  async undo() {
    if (this._historyOperation) return false;
    if (this.unsavedMarkdown.size > 0 && this._pendingStructuralOperations === 0) {
      if (!this.markdownEditor) return false;
      // Only delegate to the editor's undo if it actually has history.
      // Otherwise fall through to store-level undo so the user can undo
      // structural operations even with unsaved overlays on other slides.
      if (this.markdownEditor.canUndo?.()) {
        this.markdownEditor.undo?.();
        return true;
      }
    }
    if (!this.deckStore || !this.deckStore.canUndo()) {
      if (!this.markdownEditor) return false;
      this.markdownEditor.undo?.();
      return true;
    }
    if (this._historyOperation || !this.deckStore.undo()) return false;
    this._historyOperation = "undo";
    try {
      return await this._restoreStoreSnapshot();
    } catch (error) {
      this.deckStore.redo();
      Notification.error(`Undo failed: ${error.message || error}`);
      return false;
    } finally {
      this._historyOperation = null;
    }
  }

  async redo() {
    if (this._historyOperation) return false;
    if (this.unsavedMarkdown.size > 0 && this._pendingStructuralOperations === 0) {
      if (!this.markdownEditor) return false;
      if (this.markdownEditor.canRedo?.()) {
        this.markdownEditor.redo?.();
        return true;
      }
    }
    if (!this.deckStore || !this.deckStore.canRedo()) {
      if (!this.markdownEditor) return false;
      this.markdownEditor.redo?.();
      return true;
    }
    if (!this.deckStore.redo()) return false;
    this._historyOperation = "redo";
    try {
      return await this._restoreStoreSnapshot();
    } catch (error) {
      this.deckStore.undo();
      Notification.error(`Redo failed: ${error.message || error}`);
      return false;
    } finally {
      this._historyOperation = null;
    }
  }

  /**
   * Run a single-slide AI operation (enhanceSlide, addSpeakerNotes).
   * Builds an AiOperation, runs it through the orchestrator, resolves any
   * conflict with the latest working slide, and applies the resulting patch
   * via DeckStore so it's undoable.
   * @param {string} intent — one of the single-slide intents
   */
  async runSingleSlideAi(intent) {
    const { SettingsModal } = await import("../settings-modal.js");
    const { createAiProviderClient } = await import("../../data/ai/ai-provider-factory.js");
    const { AiOrchestrator } = await import("../../data/ai/ai-orchestrator.js");
    const { createOperation } = await import("../../data/ai/ai-operation.js");
    const { AiSidebar } = await import("../ai-sidebar.js");

    const providerLabel = SettingsModal.getProvider();
    if (SettingsModal.requiresApiKey(providerLabel) && !SettingsModal.getApiKey()) {
      Notification.error("No API key — open Settings to configure AI.");
      return;
    }
    if (!this.deckStore) {
      Notification.error("AI editing requires a loaded deck. Open or create a deck first.");
      return;
    }

    // Sync editor state into the store so the patch's `before` matches and
    // capture the structural revision / overlay baseline before the request.
    this.prepareStoreOperation();
    const targetSlide = this.currentSlideIndex;
    const baselineRevision = this.deckStore.getStructuralRevision();

    const storeSlide = { index: targetSlide, markdown: this.deckStore.getSlides()[targetSlide] };
    const workingSlide = this.saveManager.getFullSlide(targetSlide, storeSlide);
    const slideMarkdown = workingSlide.markdown;
    this.saveManager.setUnsavedEditorOverlay(targetSlide, slideMarkdown);

    const provider = createAiProviderClient(
      providerLabel,
      () => SettingsModal.getBaseUrl(),
      () => SettingsModal.getApiKey(),
      () => SettingsModal.getModel(),
    );

    const model = SettingsModal.getModel();
    const orchestrator = new AiOrchestrator({
      provider,
      modelMaxOutput: SettingsModal.getModelMaxTokens(model),
      useReasoning: SettingsModal.getReasoning(),
      effort: SettingsModal.getReasoning() ? SettingsModal.getEffort() : "none",
      effortSupported: SettingsModal.getSupportedEfforts(model).length > 0,
    });

    const op = createOperation(intent, targetSlide, slideMarkdown);

    try {
      const patches = await AiSidebar.showSingleSlideOperation(op, orchestrator, intent);
      if (patches && patches.length > 0 && this.deckStore) {
        const patch = patches[0];

        const currentSlideMarkdown =
          this.unsavedMarkdown.get(targetSlide) ?? this.deckStore.getSlides()[targetSlide] ?? "";
        const structuralRevisionChanged =
          this.deckStore.getStructuralRevision() !== baselineRevision;

        let resolution = resolveConflict({
          patch,
          currentSlideMarkdown,
          intent,
          structuralRevisionChanged,
        });

        if (resolution.action === "reject") {
          if (structuralRevisionChanged || currentSlideMarkdown === patch.before) {
            this.saveManager.clearUnsavedEditorOverlay(targetSlide);
            Notification.warning(resolution.reason);
            return;
          }
          const choice = await ConflictModal.show(patch, intent);
          if (choice.action === "reject") {
            this.saveManager.clearUnsavedEditorOverlay(targetSlide);
            Notification.warning(resolution.reason);
            return;
          }
          const rebase = choice.action === "apply" ? "apply-to-latest" : choice.rebase;
          resolution = resolveConflict({
            patch,
            currentSlideMarkdown,
            intent,
            structuralRevisionChanged,
            rebase,
          });
        }

        if (resolution.action === "reject") {
          this.saveManager.clearUnsavedEditorOverlay(targetSlide);
          Notification.warning(resolution.reason);
          return;
        }

        const patchToApply = resolution.rebasedPatch ?? patch;

        // Safety check before mutating the store.
        if (
          this.deckStore.getStructuralRevision() !== baselineRevision ||
          targetSlide >= this.deckStore.getSlideCount()
        ) {
          this.saveManager.clearUnsavedEditorOverlay(targetSlide);
          Notification.warning(
            `AI ${intent} could not be applied — the slide changed since the request started.`,
          );
          return;
        }

        // If the rebased patch's `before` does not match the store, fast-forward
        // the store to the user's latest working markdown without history.
        if (patchToApply.before !== this.deckStore.getSlides()[targetSlide]) {
          const synced = [...this.deckStore.getSlides()];
          synced[targetSlide] = patchToApply.before;
          this.deckStore.syncSlides(synced, targetSlide);
        }

        const applied = this.deckStore.applyPatch(patchToApply, baselineRevision);
        if (!applied || (typeof applied === "object" && !applied.success)) {
          const reason = typeof applied === "object" ? applied.reason : "the slide changed";
          this.saveManager.clearUnsavedEditorOverlay(targetSlide);
          Notification.warning(
            `AI ${intent} could not be applied — ${reason || "the slide changed since the request started."}`,
          );
          return;
        }

        // The AI panel is non-blocking, so the user may have kept typing on
        // other slides while it was open. _restoreStoreSnapshot() below
        // reloads the deck from the store and clears unsavedMarkdown, which
        // would silently discard those edits. Snapshot everything except the
        // AI-patched slide (whose content is superseded by the patch) and
        // restore it afterwards.
        this.saveManager.clearUnsavedEditorOverlay(targetSlide);
        // The cached editor state for the patched slide will be dropped by
        // loadSlideState's doc-mismatch branch when the restore loads the
        // new AI content — no explicit invalidation needed.
        const preservedEdits = new Map(this.unsavedMarkdown);
        preservedEdits.delete(targetSlide);

        await this._restoreStoreSnapshot();
        for (const [index, markdown] of preservedEdits) {
          this.unsavedMarkdown.set(index, markdown);
        }
        this.updateUnsavedChangesFlag();
        // updateUnsavedChangesFlag() recomputes from unsavedMarkdown.size; when
        // the user had no other pending edits that drops to 0 and clears the
        // dirty flag. The AI-applied store state has not been written to the
        // file, so the deck is still unsaved and the reload guard must prompt.
        this.hasUnsavedChanges = true;
        this.saveManager.updateButton();
        this.loadSlideIntoEditor();
        Notification.success(`AI ${intent} applied. Press Ctrl+Z to undo.`);
      }
    } catch (err) {
      Notification.error(`AI ${intent} failed: ${err.message || err}`);
    } finally {
      this.saveManager?.clearUnsavedEditorOverlay(targetSlide);
    }
  }

  /**
   * Run a whole-deck AI generate operation (Refine all slides).
   * Builds an AiOperation, runs it through the orchestrator, and delegates to
   * AiSidebar.show() for the progress/retry UI — same pattern as runSingleSlideAi.
   */
  async runWholeDeckAi() {
    const { SettingsModal } = await import("../settings-modal.js");
    const { createAiProviderClient } = await import("../../data/ai/ai-provider-factory.js");
    const { AiOrchestrator } = await import("../../data/ai/ai-orchestrator.js");
    const { createOperation } = await import("../../data/ai/ai-operation.js");
    const { AiSidebar } = await import("../ai-sidebar.js");
    const { AiGenerateModal } = await import("../ui/ai-generate-modal.js");

    const providerLabel = SettingsModal.getProvider();
    if (SettingsModal.requiresApiKey(providerLabel) && !SettingsModal.getApiKey()) {
      Notification.error("No API key — open Settings to configure AI.");
      return;
    }

    // Sync editor state before running whole-deck AI
    this.prepareStoreOperation();

    const fullMarkdown = this.deckStore
      ? this.deckStore.toMarkdown()
      : this.saveManager.getFullSlides().join("\n\n---\n\n");

    // Show pre-flight modal so the user can set options and see cost estimate
    const generateOpts = await AiGenerateModal.show(fullMarkdown, {
      modelName: SettingsModal.getModel(),
      useReasoning: SettingsModal.getReasoning(),
      getModelName: () => SettingsModal.getModel(),
      getReasoning: () => SettingsModal.getReasoning(),
      onOpenSettings: async () => {
        await SettingsModal.show();
      },
    });
    if (!generateOpts) return; // user cancelled — no API call made

    const provider = createAiProviderClient(
      providerLabel,
      () => SettingsModal.getBaseUrl(),
      () => SettingsModal.getApiKey(),
      () => SettingsModal.getModel(),
    );

    const model = SettingsModal.getModel();
    const orchestrator = new AiOrchestrator({
      provider,
      modelMaxOutput: SettingsModal.getModelMaxTokens(model),
      useReasoning: SettingsModal.getReasoning(),
      effort: SettingsModal.getReasoning() ? SettingsModal.getEffort() : "none",
      effortSupported: SettingsModal.getSupportedEfforts(model).length > 0,
    });

    const op = createOperation("generate", null, fullMarkdown, {
      flow: generateOpts.flow,
      mode: generateOpts.mode,
      addSpeakerNotes: generateOpts.addSpeakerNotes || false,
      includeImages: generateOpts.includeImages || false,
      preserveVisualIdentity: generateOpts.preserveVisualIdentity ?? true,
    });

    try {
      const enhanced = await AiSidebar.show(op, orchestrator);
      if (enhanced && this.controller.reloadManager?.replaceDeck) {
        await AssetLoader.ensureMarkdownItLoaded();
        const deck = await DeckLoader.parseMarkdown(enhanced);
        // Update the deck store BEFORE firing deckchange via reloadManager so
        // the _onDeckChange handler reads the correct (post-refine) store
        // state. This makes the ordering explicit rather than relying on the
        // handler running synchronously during the awaited replaceDeck.
        this.unsavedMarkdown.clear();
        this.markdownEditor?.clearSlideStateCache();
        const parser = new MarkdownParser();
        const newSlides = parser.splitSlides(enhanced);
        // Route through replaceDeck so the refine is undoable (Ctrl+Z)
        // instead of loadFromMarkdown which clears history.
        this.deckStore.replaceDeck(newSlides, 0, {
          index: 0,
          before: null,
          after: enhanced,
          source: "ai",
          timestamp: Date.now(),
        });
        await this.controller.reloadManager.replaceDeck(deck, {
          startAtFirstSlide: true,
          syncStore: false,
        });
        this.currentSlideIndex = 0;
        this.loadSlideIntoEditor();
        this.saveManager?.updateButton();
        Notification.success("AI Refine all slides applied. Press Ctrl+Z to undo.");
      }
    } catch (err) {
      Notification.error(`AI generate failed: ${err.message || err}`);
    }
  }

  /**
   * Load the current slide's markdown into the editor
   */
  loadSlideIntoEditor() {
    if (!this.isEditMode || !this.markdownEditor) return;

    const base = this.deckStore.getSlides()[this.currentSlideIndex] ?? "";
    const markdown = this.unsavedMarkdown.get(this.currentSlideIndex) ?? base;

    const current = this.markdownEditor.getValue();
    if (markdown === current && this.currentSlideIndex === this._lastEditorSlideIndex) {
      this._lastEditorDeck = this.deck;
      this.saveManager.updateButton();
      this.areaGuides.refresh();
      return;
    }

    // Save the outgoing slide's EditorState (with undo history) before
    // switching, so navigating back restores its undo stack.
    // saveSlideState's index < 0 guard handles the initial -1 case.
    if (this._lastEditorSlideIndex !== this.currentSlideIndex) {
      this.markdownEditor.saveSlideState(this._lastEditorSlideIndex);
    }

    if (
      this.currentSlideIndex !== this._lastEditorSlideIndex ||
      this.deck !== this._lastEditorDeck
    ) {
      // Different slide or deck — use the per-slide state cache.
      // After a store restore (undo/redo/AI), this.deck is a fresh object
      // even for the same slide, so this branch is taken and loadSlideState
      // handles doc drift via its mismatch branch (preserving undo history).
      this.markdownEditor.loadSlideState(this.currentSlideIndex, markdown);
    } else {
      // Same slide and deck reference — update the document in-place.
      // This branch is reached on first edit-mode entry and when
      // loadSlideIntoEditor is called without a preceding deck change.
      this.markdownEditor.setValue(markdown, { suppressOnChange: true });
    }
    this._lastEditorSlideIndex = this.currentSlideIndex;
    this._lastEditorDeck = this.deck;
    // Don't reset hasUnsavedChanges - if there are unsaved changes, keep the flag
    this.saveManager.updateButton();
    this.areaGuides.refresh();
  }

  /**
   * Handle editor input events
   */
  onEditorInput(value) {
    this.unsavedMarkdown.set(this.currentSlideIndex, value);
    this.updateUnsavedChangesFlag();
    this.previewUpdater.update();
  }

  /**
   * Update the hasUnsavedChanges flag based on whether any slide has unsaved changes
   */
  updateUnsavedChangesFlag() {
    const hasUnsaved = this.unsavedMarkdown.size > 0;
    this.hasUnsavedChanges = hasUnsaved;
    this.saveManager.updateButton();
  }

  getSlideElementByIndex(index) {
    const slidesContainer = document.getElementById("slidesContainer");
    if (!slidesContainer) return null;
    const allSlides = slidesContainer.querySelectorAll(":scope > .slide");
    return allSlides[index] || null;
  }

  navigateToArea(areaName) {
    this.areaNav.navigateToArea(areaName);
  }

  _getAreaAtCursor(markdown, position) {
    return this.areaNav.getAreaAtCursor(markdown, position);
  }

  _initImagePropertiesPanel() {
    // Initialize the floating image toolbar with markdown access so it can
    // drive applySettings / updateAttribute via ImageInteractionHandler.
    ImagePropertiesPanel.init(
      () => this.markdownEditor?.getValue() ?? "",
      (updated) => {
        this.markdownEditor?.setValue(updated, { suppressOnChange: true });
        this.unsavedMarkdown.set(this.currentSlideIndex, updated);
        this.updateUnsavedChangesFlag();
        this.previewUpdater.update();
      },
    );

    const slidesContainer = this.elements.slidesContainer;
    if (!slidesContainer) return;

    slidesContainer.addEventListener("click", this._onSlidesContainerClick);
    slidesContainer.addEventListener("contextmenu", this._onSlidesContainerContextMenu);

    this.imageInserter.initDropAndPaste(slidesContainer);
  }

  _canDeleteArea(areaName) {
    const name = String(areaName || "")
      .trim()
      .toLowerCase();
    if (!name || name === "main") return false;

    // Check that the area actually has content in the markdown.
    const markdown = this.markdownEditor?.getValue() || "";
    const range = this.areaNav.getAreaContentRange(markdown, name);
    return range.from < range.to;
  }

  _deleteAreaFromMarkdown(areaName) {
    if (!this.markdownEditor?.view) return;
    const currentMarkdown = this.markdownEditor.getValue();

    const markerRange = this.areaNav.getAreaMarkerRange(currentMarkdown, areaName);
    if (!markerRange) return;

    const changes = [{ from: markerRange.from, to: markerRange.to, insert: "" }];

    const parser = new MarkdownParser();
    const layoutResult = parser.extractDirective(currentMarkdown, "layout");

    if (layoutResult.found) {
      // Compute the new layout directive without rewriting the whole document.
      const updatedMarkdown = removeAreaFromLayout(currentMarkdown, areaName);
      if (updatedMarkdown !== currentMarkdown) {
        const layoutLineEnd = updatedMarkdown.indexOf("\n") + 1;
        const newLayoutLine =
          layoutLineEnd > 0 ? updatedMarkdown.slice(0, layoutLineEnd) : updatedMarkdown;
        changes.push({
          from: layoutResult.from,
          to: layoutResult.to,
          insert: newLayoutLine,
        });
      }
    }

    // CodeMirror requires multi-change transactions to be in document order.
    changes.sort((a, b) => a.from - b.from);
    this.markdownEditor.view.dispatch({ changes });
    this.markdownEditor.focus();
  }

  _canSwapArea(areaName) {
    if (!this.markdownEditor) return false;
    const markdown = this.markdownEditor.getValue();
    const result = this.areaNav.swapAreas(markdown, areaName);
    return result !== null;
  }

  _swapAreaInMarkdown(areaName) {
    if (!this.markdownEditor) return;
    const markdown = this.markdownEditor.getValue();
    const updated = this.areaNav.swapAreas(markdown, areaName);
    if (updated === null) return;
    this.markdownEditor.setValue(updated, { suppressOnChange: false });
    this.markdownEditor.focus();
  }

  _canMakeFullHeight(areaName) {
    const name = String(areaName || "")
      .trim()
      .toLowerCase();
    if (!name) return false;
    if (!this.markdownEditor) return false;

    // Only allow full-height on the right-most column area
    const slide = this.deck?.slides?.[this.currentSlideIndex];
    const resolvedLayout = LayoutParser.resolvePreset(slide?.layout);
    if (parseSingleColumnLayout(resolvedLayout)) return false;
    const layout = LayoutParser.parse(resolvedLayout);
    const rowMatches = layout.gridTemplateAreas.match(/"[^"]*"|'[^']*'/g) || [];
    if (rowMatches.length === 0) return false;
    const contentRow = rowMatches.find((q) => {
      const cells = q.slice(1, -1).split(/\s+/);
      return cells.some((c) => c !== "header" && c !== "footer" && c !== "title");
    });
    if (!contentRow) return false;
    const cells = contentRow.slice(1, -1).split(/\s+/);
    const rightMostCol = cells[cells.length - 1];
    return name === rightMostCol;
  }

  _makeAreaFullHeight(areaName) {
    if (!this.markdownEditor) return;
    const markdown = this.markdownEditor.getValue();
    const updated = makeAreaFullHeight(markdown, areaName);
    if (updated === markdown) return;

    // After the preview re-renders, auto-fit any image that is the sole
    // content of the target area (e.g. @media with just an <img>).
    this.previewUpdater.onReadyOnce((slideEl) => {
      const areaEl = slideEl.querySelector(`.slide__area--${areaName}`);
      if (!areaEl) return;
      const imgs = areaEl.querySelectorAll("img");
      if (imgs.length !== 1) return;
      // Check for real content, ignoring the editor area-label overlay
      const clone = areaEl.cloneNode(true);
      clone.querySelectorAll(".editor-area-label").forEach((el) => el.remove());
      const textContent = clone.textContent.trim();
      if (textContent) return;
      const img = imgs[0];
      const fit = () => {
        ImageInteractionHandler._selectedImg = img;
        fitToWidth(img, getStageScale(), (s) => ImageInteractionHandler.applySettings(s));
      };
      if (img.complete && img.naturalWidth > 0) {
        fit();
      } else {
        img.addEventListener("load", fit, { once: true });
      }
    });

    this.markdownEditor.setValue(updated, { suppressOnChange: false });
    this.markdownEditor.focus();
  }

  _alignMainInMarkdown(areaName, align) {
    if (!this.markdownEditor) return;
    const markdown = this.markdownEditor.getValue();
    const parser = new MarkdownParser();
    const { value: layoutValue = "" } = parser.extractDirective(markdown, "layout");
    const parsed = parseSingleColumnLayout(layoutValue);
    if (!parsed) return;

    const resolved = LayoutParser.resolvePreset(layoutValue);
    const layoutInfo = LayoutParser.parse(resolved);
    const newLayout = buildSingleColumnCustomLayout(
      parsed.base,
      parsed.width,
      align,
      layoutInfo.gridTemplateRows,
    );
    if (!newLayout) return;

    const updated = updateLayoutDirective(markdown, newLayout);
    if (updated === markdown) return;
    this.markdownEditor.setValue(updated, { suppressOnChange: false });
    this.markdownEditor.focus();
  }

  _setAreaBackground(areaName, color) {
    if (!this.markdownEditor || !areaName) return;
    const markdown = this.markdownEditor.getValue();
    const cssText = color ? `background: ${color}` : "";
    const updated = updateAreaStyleForAreaDirective(markdown, areaName, cssText);
    if (updated === markdown) return;

    this.markdownEditor.setValue(updated, { suppressOnChange: false });
    this.markdownEditor.focus();
  }

  _fixMismatchedAreas(allowedAreas) {
    if (!this.markdownEditor) return;
    const markdown = this.markdownEditor.getValue();
    const fixed = new MarkdownParser().normalizeAreaMarkers(markdown, allowedAreas);
    if (fixed === markdown) return;

    this.markdownEditor.setValue(fixed, { suppressOnChange: false });
    this.markdownEditor.focus();
  }

  _getCodeMirrorContextMenuItems(lineText) {
    const trimmed = lineText.trim();

    const areaMatch = trimmed.match(/^@([a-zA-Z0-9_-]+)$/);
    if (areaMatch) {
      const name = areaMatch[1];
      const items = [];
      if (this._canDeleteArea(name)) {
        items.push({
          label: `Delete @${name}`,
          action: () => this._deleteAreaFromMarkdown(name),
        });
      }
      if (this._canSwapArea(name)) {
        items.push({
          label: "Swap with next",
          action: () => this._swapAreaInMarkdown(name),
        });
      }
      if (this._canMakeFullHeight(name)) {
        items.push({
          label: "Make full height",
          action: () => this._makeAreaFullHeight(name),
        });
      }
      return items.length ? items : null;
    }

    const directiveMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*:/);
    if (!directiveMatch) return null;

    const directive = directiveMatch[1].toLowerCase();
    switch (directive) {
      case "layout":
        return [
          {
            label: "Change layout",
            action: () => this.layoutManager.showPickerForCurrentSlide(),
          },
        ];
      case "theme":
        return [
          {
            label: "Toggle theme",
            action: () => this.themeManager.toggle(),
          },
        ];
      case "background":
        return [
          {
            label: "Edit background",
            action: () => SlideStylePanel.show(),
          },
        ];
      case "area-style":
        return [
          {
            label: "Edit area style",
            action: () => SlideStylePanel.show(),
          },
        ];
      case "header-style":
        return [
          {
            label: "Edit header style",
            action: () => SlideStylePanel.show(),
          },
        ];
      default:
        return null;
    }
  }
}
