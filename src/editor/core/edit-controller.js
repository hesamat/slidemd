/**
 * EditController
 * Manages edit mode with side-by-side markdown editor and live preview.
 */
import { MarkdownParser } from "../../data/markdown-parser.js";
import { Logger } from "../../core/logger.js";
import { DeckLoader } from "../../data/deck-loader.js";
import { Notification } from "../../renderer/notification.js";
import { StageScaler } from "../../renderer/stage-scaler.js";
import { ImagePicker } from "../image/image-picker.js";
import { ImageInteractionHandler } from "../image/image-interaction-handler.js";
import { ImagePropertiesPanel } from "../image/image-properties-panel.js";
import { SlideOperations } from "./slide-operations.js";
import { ImageBackgroundHandler } from "../image/image-background-handler.js";
import { ImageInserter } from "../image/image-inserter.js";
import { fitToWidth } from "../image/image-position-presets.js";
import { getStageScale } from "../../core/utils.js";
import { TextBlockHandler } from "../text/text-block-handler.js";
import { FencedBlockInteractionHandler } from "../codeblock/fenced-block-interaction-handler.js";
import { MathBlockInteractionHandler } from "../math/math-block-interaction-handler.js";
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
  areaSpansAllRows,
  buildSingleColumnCustomLayout,
  getMediaFullBleedInfo,
  makeAreaFullHeight,
  makeMediaFullBleed,
  parseSingleColumnLayout,
  removeAreaFromLayout,
  removeAreaBgForAreaDirective,
  updateAreaBgForAreaDirective,
  updateLayoutDirective,
} from "./directive-utils.js";
import { LayoutParser } from "../../data/layout-parser.js";
import { PanelResizer } from "../ui/panel-resizer.js";
import { SaveManager } from "../ui/save-manager.js";
import { SlideStylePanel } from "../ui/slide-style-panel.js";
import { SlidePreviewUpdater } from "./slide-preview-updater.js";
import { StoreSyncController } from "./store-sync-controller.js";
import { EditorBufferController } from "./editor-buffer-controller.js";
import { HistoryController } from "./history-controller.js";
import { AiEditController } from "./ai-edit-controller.js";
import { StyleApplier } from "./style-applier.js";
import { SourceJumpHandler } from "./source-jump-handler.js";

export class EditController {
  constructor(deck, controller, elements, { deckStore = null } = {}) {
    this.deck = deck;
    this.controller = controller;
    this.elements = elements;
    this.deckStore = deckStore;

    this.isEditMode = false;
    this.currentSlideIndex = controller.slideNavigator.currentIndex;
    this.hasUnsavedChanges = false;

    this.markdownEditor = null;

    this.unsavedMarkdown = new Map();
    this._pendingStructuralOperations = 0;
    this._deckRestoreDepth = 0;

    this.placeholderDialogEl = null;

    this._destroyed = false;
    this._lastEditorSlideIndex = -1;
    this._lastEditorDeck = null;
    this._cachedSourceMarkdown = null;
    this._cachedOriginalSlides = [];

    // Store-to-view sync module. Owns the store-change queue, suppress flag,
    // and last structural revision. Subscribes to DeckStore changes on
    // construction; unsubscribe via the returned disposer in destroy().
    this.storeSync = new StoreSyncController({
      getDeckStore: () => this.deckStore,
      getController: () => this.controller,
      getMarkdownEditor: () => this.markdownEditor,
      getSaveManager: () => this.saveManager,
      getPreviewUpdater: () => this.previewUpdater,
      getUnsavedMarkdown: () => this.unsavedMarkdown,
      setUnsavedMarkdown: (v) => {
        this.unsavedMarkdown = v;
      },
      setHasUnsavedChanges: (v) => {
        this.hasUnsavedChanges = v;
      },
      getCurrentSlideIndex: () => this.currentSlideIndex,
      setCurrentSlideIndex: (v) => {
        this.currentSlideIndex = v;
      },
      getIsEditMode: () => this.isEditMode,
      isDestroyed: () => this._destroyed,
      // Use the guarded capture: outside edit mode the buffer is never
      // refreshed on slide navigation, so it still holds a previously
      // edited slide's text and must not be attributed to the current
      // slide (save can now run outside edit mode).
      captureCurrentEditorMarkdown: () => this.buffer.captureCurrentEditorState(),
      loadSlideIntoEditor: () => this.buffer.loadSlideIntoEditor(),
      storeDiffersFromSource: () => this._storeDiffersFromSource(),
      getLastEditorSlideIndex: () => this._lastEditorSlideIndex,
      incrementDeckRestoreDepth: () => {
        this._deckRestoreDepth++;
      },
      decrementDeckRestoreDepth: () => {
        this._deckRestoreDepth--;
      },
      getPendingStructuralOperations: () => this._pendingStructuralOperations,
      setPendingStructuralOperations: (v) => {
        this._pendingStructuralOperations = v;
      },
    });

    // Editor buffer module. Owns slide loading, editor-to-overlay capture,
    // input handling, and the per-slide EditorState cache lifecycle.
    this.buffer = new EditorBufferController({
      getMarkdownEditor: () => this.markdownEditor,
      getDeckStore: () => this.deckStore,
      getDeck: () => this.deck,
      getUnsavedMarkdown: () => this.unsavedMarkdown,
      getCurrentSlideIndex: () => this.currentSlideIndex,
      getIsEditMode: () => this.isEditMode,
      getSaveManager: () => this.saveManager,
      getPreviewUpdater: () => this.previewUpdater,
      getAreaGuides: () => this.areaGuides,
      getLastEditorSlideIndex: () => this._lastEditorSlideIndex,
      setLastEditorSlideIndex: (v) => {
        this._lastEditorSlideIndex = v;
      },
      getLastEditorDeck: () => this._lastEditorDeck,
      setLastEditorDeck: (v) => {
        this._lastEditorDeck = v;
      },
      setHasUnsavedChanges: (v) => {
        this.hasUnsavedChanges = v;
      },
    });

    // History module. Owns the undo/redo guard and delegates to the
    // editor's local stack or the store-level history with a chained
    // view restore.
    this.history = new HistoryController({
      getMarkdownEditor: () => this.markdownEditor,
      getDeckStore: () => this.deckStore,
      getUnsavedMarkdown: () => this.unsavedMarkdown,
      getPendingStructuralOperations: () => this._pendingStructuralOperations,
      chainStoreChangeRestore: () => this.storeSync.chainStoreChangeRestore(),
      withSuppressedStoreChange: (fn) => this.storeSync.withSuppressedStoreChange(fn),
    });

    // AI edit module. Handles single-slide and whole-deck AI flows
    // (orchestrator construction, conflict resolution, patch application,
    // view restore).
    this.aiEdit = new AiEditController({
      getDeckStore: () => this.deckStore,
      getController: () => this.controller,
      getSaveManager: () => this.saveManager,
      getPreviewUpdater: () => this.previewUpdater,
      getUnsavedMarkdown: () => this.unsavedMarkdown,
      getCurrentSlideIndex: () => this.currentSlideIndex,
      setCurrentSlideIndex: (v) => {
        this.currentSlideIndex = v;
      },
      setHasUnsavedChanges: (v) => {
        this.hasUnsavedChanges = v;
      },
      prepareStoreOperation: () => this.prepareStoreOperation(),
      withSuppressedStoreChange: (fn) => this.storeSync.withSuppressedStoreChange(fn),
      chainStoreChangeRestore: () => this.storeSync.chainStoreChangeRestore(),
      syncStructuralRevision: () => this.storeSync.syncStructuralRevision(),
      loadSlideIntoEditor: () => this.buffer.loadSlideIntoEditor(),
      updateUnsavedChangesFlag: () => this.buffer.updateUnsavedChangesFlag(),
    });

    // Clear the per-slide editor-state cache whenever the store's
    // structural revision changes (add/delete/move/whole-deck load).
    // EditController is only used when a DeckStore is present; if deckStore
    // is null we are in a viewer/presenter/export window and there is no
    // per-slide cache to invalidate.
    this._offStructuralChange = this.deckStore?.onStructuralChange(() =>
      this.markdownEditor?.clearSlideStateCache(),
    );

    // Subscribe to store changes last, after all sub-controllers exist.
    // Every cross-reference is a lazy getter, but subscribing earlier
    // would be a hazard if onStoreChange ever replayed state synchronously.
    this._offStoreChange = this.storeSync.subscribe();

    this._onSlideChange = () => {
      this.currentSlideIndex = this.controller.slideNavigator.currentIndex;
      ImageInteractionHandler.deactivate();
      MathBlockInteractionHandler.deactivate();
      TextBlockHandler.deactivate();
      FencedBlockInteractionHandler.deactivate();
      SlideStylePanel.hide();
      // Skip loading when a deck restore is in progress — the explicit
      // loadSlideIntoEditor call at the end of storeSync.restoreStoreSnapshot
      // handles the load with the updated deck reference and correct index.
      if (!this._deckRestoreDepth) this.loadSlideIntoEditor();
    };
    this._onDeckChange = (data) => {
      this.deck = data.deck;
      // The DeckStore structural-revision listener (registered in the
      // constructor) already clears the per-slide editor-state cache for
      // structural changes. We only need to decide how to reconcile
      // unsaved overlays here.
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
      // loadSlideIntoEditor call at the end of storeSync.restoreStoreSnapshot
      // handles the load at the correct (restored) index.
      if (!this._deckRestoreDepth) this.loadSlideIntoEditor();
      this.imageBg.deckDirectoryHandle = null;
    };
    this._onSlidesContainerClick = (e) => {
      if (!this.isEditMode) return;

      // Clicks inside an inline-editing text block should not be processed
      // by the fenced/image handlers either (e.g. an <img> or <pre> inside
      // the contenteditable would otherwise be selected).
      const activeTextBlock = e.target.closest(".text-block");
      if (activeTextBlock?.isContentEditable) return;

      const blockHandlers = [
        {
          name: "text",
          handler: TextBlockHandler,
          getElement: (target) => {
            const textBlock = target.closest(".text-block");
            if (textBlock) {
              // Leave clicks alone while the block is being edited inline, otherwise
              // re-selecting it clears contenteditable and drops the typed text.
              if (textBlock.isContentEditable) return null;
              return textBlock;
            }
            return null;
          },
          onSelect: (el) => {
            TextBlockHandler.select(el);
            TextBlockHandler._showPanel();
          },
        },
        {
          name: "fenced",
          handler: FencedBlockInteractionHandler,
          getElement: (target) => FencedBlockInteractionHandler.elementFromTarget(target),
          onSelect: (el) => FencedBlockInteractionHandler.select(el),
        },
        {
          name: "math",
          handler: MathBlockInteractionHandler,
          getElement: (target) => MathBlockInteractionHandler.elementFromTarget(target),
          onSelect: (el) => MathBlockInteractionHandler.select(el),
        },
        {
          name: "image",
          handler: ImageInteractionHandler,
          getElement: (target) => {
            const img = target.closest("img");
            if (img && img.closest(".editor-area-label, .editor-slide-warning")) return null;
            return img;
          },
          onSelect: (el) => ImageInteractionHandler.select(el),
        },
      ];

      for (const entry of blockHandlers) {
        const el = entry.getElement(e.target);
        if (!el) continue;
        e.preventDefault();
        e.stopPropagation();
        for (const other of blockHandlers) {
          if (other !== entry) other.handler.deselect();
        }
        entry.onSelect(el);
        return;
      }
    };

    this._onSlidesContainerContextMenu = (e) => {
      if (!this.isEditMode) return;
      if (
        e.target.closest(
          ".editor-area-label, .editor-slide-warning, img, .text-block, .mermaid, pre",
        )
      )
        return;
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
      onToggleFullBleed: (name) => this._toggleFullBleed(name),
      canFullBleed: (name) => this._canFullBleed(name),
      getFullBleedLabel: (name) => this._getFullBleedLabel(name),
      onAlignMain: (name, align) => this._alignMainInMarkdown(name, align),
      onSetBackground: (name, cssBackground) => this._setAreaBackground(name, cssBackground),
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
        importResult: () => this.importAiResult(),
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
      Logger.error("Failed to cache markdown:", error);
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
      getAreaOffsets: (md) => MarkdownParser.parseAreas(md).areaOffsets,
      onPreviewReady: (callback) => this.previewUpdater.onReadyOnce(callback),
    });

    // Fenced-block (Mermaid + code block) interaction — drag/reorder/delete
    FencedBlockInteractionHandler.init(
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

    // Math (KaTeX display) block interaction — drag/reorder/delete
    MathBlockInteractionHandler.init(
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
        onPreviewReady: (callback) => this.previewUpdater.onReadyOnce(callback),
      },
    );

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

    // Store subscriptions
    this._offStoreChange?.();
    this._offStructuralChange?.();

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

    // Tear down the CodeMirror view and capture listener, but leave the
    // editor panel container in place. EditController.destroy() is terminal
    // (beforeunload / deck switch) so the panel is not reused.
    this.markdownEditor?.teardown?.();
  }

  /**
   * Toggle edit mode on/off
   */
  toggleEditMode() {
    if (!this.isEditMode && !this._getSourceMarkdown()) {
      Notification.warning("Open a markdown file first to enable the editor");
      return;
    }

    // Flush the pending debounced editor buffer BEFORE toggling edit mode:
    // onEditModeChanged may navigate away from a hidden slide (updating
    // currentSlideIndex), so capturing afterwards would attribute the
    // buffer to the slide the app jumped to instead of the one it belongs
    // to. At this point currentSlideIndex still matches the buffer.
    if (this.isEditMode && this.markdownEditor) {
      this._captureCurrentEditorMarkdown();
      this.markdownEditor.cancelOnChange?.();
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
      MathBlockInteractionHandler.deactivate();
      TextBlockHandler.deactivate();
      FencedBlockInteractionHandler.deactivate();
      SlideStylePanel.hide();
      this.placeholderDialogEl?.remove();
      this.placeholderDialogEl = null;

      // Restore presenter panel visibility based on editor role
      if (this.controller.roleManager.isEditorWindow) {
        this.elements.presenterPanel?.classList.remove("webdeck-hidden");
      }

      // Keep the dirty state on exit: the edits stay live in unsavedMarkdown
      // and the editor buffer, and save now works outside edit mode (Ctrl+S,
      // menu, command palette), so resetting the flag here would silently
      // discard the user's work while pretending it was dropped.
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

  /**
   * Capture the editor's current value into unsavedMarkdown for a specific
   * slide index.
   * @param {number} index
   */
  _captureEditorMarkdown(index) {
    this.buffer.captureEditorMarkdown(index);
  }

  _captureCurrentEditorMarkdown() {
    this.buffer.captureCurrentEditorMarkdown();
  }

  /**
   * Public guard for code that needs the current editor buffer captured before
   * reading the deck markdown.
   */
  captureCurrentEditorState() {
    this.buffer.captureCurrentEditorState();
  }

  prepareStoreOperation(recordHistory = false) {
    this.storeSync.prepareStoreOperation(recordHistory);
  }

  recordStoreOperation() {
    this.storeSync.recordStoreOperation();
  }

  /**
   * Prune out-of-range or identical unsaved overlays, keeping only those
   * that genuinely differ from the supplied source.
   * @param {string[]} source
   */
  _reconcileUnsavedOverlays(source) {
    this.storeSync.reconcileUnsavedOverlays(source);
  }

  /**
   * Chain an explicit store-to-view restore onto the store-change queue.
   * @returns {Promise<boolean>}
   */
  _chainStoreChangeRestore() {
    return this.storeSync.chainStoreChangeRestore();
  }

  /**
   * Run a synchronous store mutation with the queued store-change restore
   * suppressed. The callback **must be synchronous**.
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  _withSuppressedStoreChange(fn) {
    return this.storeSync.withSuppressedStoreChange(fn);
  }

  async undo() {
    return this.history.undo();
  }

  async redo() {
    return this.history.redo();
  }

  /**
   * Run a single-slide AI operation (enhanceSlide, addSpeakerNotes).
   * @param {string} intent — one of the single-slide intents
   */
  async runSingleSlideAi(intent) {
    return this.aiEdit.runSingleSlideAi(intent);
  }

  /**
   * Run a whole-deck AI generate operation (Refine all slides).
   */
  async runWholeDeckAi() {
    return this.aiEdit.runWholeDeckAi();
  }

  /**
   * Import an AI-generated deck markdown produced by an external tool.
   */
  async importAiResult() {
    return this.aiEdit.importWholeDeckResult();
  }

  /**
   * Load the current slide's markdown into the editor.
   */
  loadSlideIntoEditor() {
    this.buffer.loadSlideIntoEditor();
  }

  /**
   * Handle editor input events
   */
  onEditorInput(value) {
    this.buffer.onEditorInput(value);
  }

  /**
   * Update the hasUnsavedChanges flag based on whether any slide has unsaved changes
   */
  updateUnsavedChangesFlag() {
    this.buffer.updateUnsavedChangesFlag();
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
    if (!name || name === "main") return false;
    if (!this.markdownEditor) return false;

    const markdown = this.markdownEditor.getValue();
    const parser = new MarkdownParser();
    const { value: layoutValue = "" } = parser.extractDirective(markdown, "layout");
    if (parseSingleColumnLayout(layoutValue)) return false;

    // Only offer the action on the right-most column area, and only when it
    // does not already span every grid row (e.g. the media column of a
    // media-span layout, which is full height by design).
    if (areaSpansAllRows(markdown, name)) return false;

    const resolved = LayoutParser.resolvePreset(layoutValue);
    const layout = LayoutParser.parse(resolved);
    const rowMatches = layout.gridTemplateAreas.match(/"[^"]*"|'[^']*'/g) || [];
    if (rowMatches.length < 2) return false;
    const contentRow = rowMatches.find((q) => {
      const cells = q.slice(1, -1).split(/\s+/).filter(Boolean);
      return cells.some((c) => c !== "header" && c !== "footer" && c !== "title");
    });
    if (!contentRow) return false;
    const cells = contentRow.slice(1, -1).split(/\s+/).filter(Boolean);
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

  _canFullBleed(areaName) {
    if (!this.markdownEditor) return false;
    const markdown = this.markdownEditor.getValue();
    return getMediaFullBleedInfo(markdown, areaName).can;
  }

  _getFullBleedLabel(areaName) {
    if (!this.markdownEditor) return "";
    const markdown = this.markdownEditor.getValue();
    return getMediaFullBleedInfo(markdown, areaName).label || "";
  }

  _toggleFullBleed(areaName) {
    if (!this.markdownEditor) return;
    const markdown = this.markdownEditor.getValue();
    const updated = makeMediaFullBleed(markdown, areaName);
    if (updated === markdown) return;
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

  _setAreaBackground(areaName, cssBackground) {
    if (!this.markdownEditor || !areaName) return;
    const markdown = this.markdownEditor.getValue();
    const updated = cssBackground
      ? updateAreaBgForAreaDirective(markdown, areaName, cssBackground)
      : removeAreaBgForAreaDirective(markdown, areaName);
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
          label: "Make column full height",
          action: () => this._makeAreaFullHeight(name),
        });
      }
      if (name === "media" && this._canFullBleed(name)) {
        items.push({
          label: this._getFullBleedLabel(name),
          action: () => this._toggleFullBleed(name),
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
