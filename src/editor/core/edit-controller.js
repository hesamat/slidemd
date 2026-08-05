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
import {
  createDeletePatch,
  createEditPatch,
  createInsertPatch,
} from "../../data/store/slide-patch.js";
import { AssetLoader } from "../../core/asset-loader.js";

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

    this.originalMarkdown = this._cacheOriginalMarkdown();
    this.unsavedMarkdown = new Map();
    this._pendingStructuralOperations = 0;
    this._historyOperation = null;

    this.placeholderDialogEl = null;

    this._destroyed = false;
    this._onSlideChange = () => {
      this.currentSlideIndex = this.controller.slideNavigator.currentIndex;
      ImageInteractionHandler.deactivate();
      TextBlockHandler.deactivate();
      SlideStylePanel.hide();
      this.loadSlideIntoEditor();
    };
    this._onDeckChange = (data) => {
      this.deck = data.deck;
      // A store-history restore (undo/redo) arrives with syncStore === false.
      // It brings the in-memory deck back in line with the store but does NOT
      // write to disk or localStorage, so the restored state diverges from what
      // is persisted.  Keep originalMarkdown in sync with the restored slides
      // (so the editor displays them) but mark the deck as having unsaved
      // changes so the reload guard prompts before discarding the undone state.
      const isStoreRestore = data.syncStore === false && this.deckStore;
      this.originalMarkdown = isStoreRestore
        ? this.deckStore.getSlides()
        : this._cacheOriginalMarkdown();
      this.unsavedMarkdown.clear();
      this._pendingStructuralOperations = 0;
      this.hasUnsavedChanges = isStoreRestore;
      this.saveManager.updateButton();
      this.currentSlideIndex = this.controller.slideNavigator.currentIndex;
      this.loadSlideIntoEditor();
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
      getUnsavedMarkdown: () => this.unsavedMarkdown,
      getOriginalMarkdown: () => this.originalMarkdown,
      setOriginalMarkdown: (v) => {
        this.originalMarkdown = v;
      },
      getHasUnsavedChanges: () => this.hasUnsavedChanges,
      setHasUnsavedChanges: (v) => {
        this.hasUnsavedChanges = v;
      },
      onBeforeSave: () => {
        this._captureCurrentEditorMarkdown();
        this.syncStoreFromSlides(this.saveManager.getFullSlides());
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
      getOriginalMarkdown: () => this.originalMarkdown,
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
        summarize: () => this.runSingleSlideAi("summarize"),
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
      getOriginalMarkdown: () => this.originalMarkdown,
      getUnsavedMarkdown: () => this.unsavedMarkdown,
      setUnsavedMarkdown: (v) => {
        this.unsavedMarkdown = v;
      },
      getDeck: () => this.deck,
      getCurrentSlideIndex: () => this.currentSlideIndex,
      getMarkdownEditor: () => this.markdownEditor,
      setHasUnsavedChanges: (v) => {
        this.hasUnsavedChanges = v;
      },
      onUpdateSaveButton: () => this.saveManager.updateButton(),
      getImageBg: () => this.imageBg,
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

  _cacheOriginalMarkdown() {
    const localFile = this._getSourceMarkdown();
    if (!localFile) return [];

    try {
      const parser = new MarkdownParser();
      return parser.splitSlides(localFile);
    } catch (error) {
      console.error("Failed to cache markdown:", error);
      return [];
    }
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

  /**
   * Sync the current slide array into the canonical store at a save boundary.
   * Keystrokes remain local to the editor until this method is called.
   * @param {string[]} slides
   * @param {string} source
   * @param {object} opts
   */
  syncStoreFromSlides(slides, source = "user", { recordHistory = true } = {}) {
    if (!this.deckStore) return;
    const desired = [...slides];
    if (!recordHistory) {
      this.deckStore.syncSlides(desired, this.currentSlideIndex);
      return;
    }

    const working = this.deckStore.getSlides();
    const patches = [];
    const shared = Math.min(working.length, desired.length);

    for (let i = 0; i < shared; i += 1) {
      if (working[i] !== desired[i]) {
        patches.push(createEditPatch(i, working[i], desired[i], source));
        working[i] = desired[i];
      }
    }
    for (let i = working.length - 1; i >= desired.length; i -= 1) {
      patches.push(createDeletePatch(i, working[i], source));
      working.splice(i, 1);
    }
    for (let i = working.length; i < desired.length; i += 1) {
      patches.push(createInsertPatch(i, desired[i], source));
      working.splice(i, 0, desired[i]);
    }
    if (patches.length) this.deckStore.applyPatches(patches);
  }

  _captureCurrentEditorMarkdown() {
    if (!this.markdownEditor) return;
    const markdown = this.markdownEditor.getValue();
    const original = this.originalMarkdown[this.currentSlideIndex] ?? "";
    if (markdown === original) {
      this.unsavedMarkdown.delete(this.currentSlideIndex);
      this.updateUnsavedChangesFlag();
      return;
    }
    if (markdown === this.unsavedMarkdown.get(this.currentSlideIndex)) return;
    this.unsavedMarkdown.set(this.currentSlideIndex, markdown);
    this.updateUnsavedChangesFlag();
  }

  prepareStoreOperation() {
    if (!this.deckStore) return;
    this._captureCurrentEditorMarkdown();
    this.syncStoreFromSlides(this.saveManager.getFullSlides(), "system", {
      recordHistory: false,
    });
  }

  recordStoreOperation() {
    this._pendingStructuralOperations += 1;
  }

  async _restoreStoreSnapshot() {
    if (!this.deckStore) return false;
    const markdown = this.deckStore.toMarkdown();
    const restoredActiveIndex = this.deckStore.getActiveIndex();
    await AssetLoader.ensureMarkdownItLoaded();
    const deck = await DeckLoader.parseMarkdown(markdown);
    await this.controller.reloadManager.replaceDeck(deck, { syncStore: false });
    this.controller.slideNavigator.goTo(restoredActiveIndex, { broadcast: false });
    return true;
  }

  async undo() {
    if (this._historyOperation) return false;
    if (this.unsavedMarkdown.size > 0 && this._pendingStructuralOperations === 0) {
      if (!this.markdownEditor) return false;
      this.markdownEditor.undo?.();
      return true;
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
      this.markdownEditor.redo?.();
      return true;
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
   * Run a single-slide AI operation (enhanceSlide, summarize, addSpeakerNotes).
   * Builds an AiOperation, runs it through the orchestrator, and applies the resulting
   * patch via DeckStore so it's undoable.
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

    // Sync editor state into the store so the patch's `before` matches
    this.prepareStoreOperation();

    const slideMarkdown = this.deckStore
      ? this.deckStore.getSlides()[this.currentSlideIndex]
      : (this.originalMarkdown[this.currentSlideIndex] ?? "");

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
    });

    const op = createOperation(intent, this.currentSlideIndex, slideMarkdown);

    try {
      const patches = await AiSidebar.showSingleSlideOperation(op, orchestrator, intent);
      if (patches && patches.length > 0 && this.deckStore) {
        this.deckStore.applyPatches(patches);
        // Restore the snapshot to reflect the applied patch in the editor
        await this._restoreStoreSnapshot();
        Notification.success(`AI ${intent} applied. Press Ctrl+Z to undo.`);
      }
    } catch (err) {
      console.error(`AI ${intent} failed:`, err);
      Notification.error(`AI ${intent} failed: ${err.message || err}`);
    }
  }

  /**
   * Run a whole-deck AI generate operation (Enhance all slides).
   * Delegates to AiSidebar.show() which handles the batch processing UI.
   */
  async runWholeDeckAi() {
    const { SettingsModal } = await import("../settings-modal.js");
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
      onGenerateAgenda: async () => {
        return this.#generateAgenda(fullMarkdown);
      },
    });
    if (!generateOpts) return; // user cancelled — no API call made

    try {
      const enhanced = await AiSidebar.show(fullMarkdown, "generate", {
        agenda: generateOpts.agenda,
        targetSlideCount: generateOpts.targetSlideCount,
        tone: generateOpts.tone,
        fidelity: generateOpts.fidelity,
      });
      if (enhanced && this.controller.reloadManager?.replaceDeck) {
        await AssetLoader.ensureMarkdownItLoaded();
        const deck = await DeckLoader.parseMarkdown(enhanced);
        await this.controller.reloadManager.replaceDeck(deck, { startAtFirstSlide: true });
        Notification.success("AI Enhance all slides applied.");
      }
    } catch (err) {
      console.error("AI generate failed:", err);
      Notification.error(`AI generate failed: ${err.message || err}`);
    }
  }

  /**
   * Use AI to generate a bullet-point agenda from the deck content.
   * Lightweight call — sends a short prompt with deck summary, not the full markdown.
   * @param {string} markdown
   * @returns {Promise<string|null>}
   */
  async #generateAgenda(markdown) {
    const { SettingsModal } = await import("../settings-modal.js");
    const { createAiProviderClient } = await import("../../data/ai/ai-provider-factory.js");
    const { buildDeckSummary } = await import("../../data/ai/ai-prompt-builder.js");

    const providerLabel = SettingsModal.getProvider();
    if (SettingsModal.requiresApiKey(providerLabel) && !SettingsModal.getApiKey()) {
      Notification.error("No API key — open Settings to configure AI.");
      return null;
    }

    const provider = createAiProviderClient(
      providerLabel,
      () => SettingsModal.getBaseUrl(),
      () => SettingsModal.getApiKey(),
      () => SettingsModal.getModel(),
    );

    const summary = buildDeckSummary(markdown);
    const systemMsg =
      "You are a presentation assistant. Generate a concise agenda (3-6 bullet points) that describes what the presentation should cover, based on the deck summary. Output only the bullet points, no preamble.";
    const userMsg = `Deck summary:\n${summary}\n\nGenerate a concise agenda for this presentation:`;

    try {
      const response = await provider.chat(
        {
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: userMsg },
          ],
          maxTokens: 500,
          responseFormat: null,
          reasoning: null,
        },
        undefined,
      );
      return response.content.trim();
    } catch (err) {
      console.error("Agenda generation failed:", err);
      Notification.error(`Agenda generation failed: ${err.message || err}`);
      return null;
    }
  }

  /**
   * Load the current slide's markdown into the editor
   */
  loadSlideIntoEditor() {
    if (!this.isEditMode || !this.markdownEditor) return;

    const markdown =
      this.unsavedMarkdown.get(this.currentSlideIndex) ??
      this.originalMarkdown[this.currentSlideIndex] ??
      "";

    this.markdownEditor.setValue(markdown, { suppressOnChange: true, clearHistory: true });
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
    const originalMarkdown = this.markdownEditor.getValue();

    const markerRange = this.areaNav.getAreaMarkerRange(originalMarkdown, areaName);
    if (!markerRange) return;

    const changes = [{ from: markerRange.from, to: markerRange.to, insert: "" }];

    const parser = new MarkdownParser();
    const layoutResult = parser.extractDirective(originalMarkdown, "layout");

    if (layoutResult.found) {
      // Compute the new layout directive without rewriting the whole document.
      const updatedMarkdown = removeAreaFromLayout(originalMarkdown, areaName);
      if (updatedMarkdown !== originalMarkdown) {
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
