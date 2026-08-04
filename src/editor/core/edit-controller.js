/**
 * EditController
 * Manages edit mode with side-by-side markdown editor and live preview.
 */
import { MarkdownParser } from "../../data/markdown-parser.js";
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

export class EditController {
  constructor(deck, controller, elements) {
    this.deck = deck;
    this.controller = controller;
    this.elements = elements;

    this.isEditMode = false;
    this.currentSlideIndex = controller.slideNavigator.currentIndex;
    this.hasUnsavedChanges = false;

    this.markdownEditor = null;

    this.originalMarkdown = this._cacheOriginalMarkdown();
    this.unsavedMarkdown = new Map();

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
      this.originalMarkdown = this._cacheOriginalMarkdown();
      this.unsavedMarkdown.clear();
      this.hasUnsavedChanges = false;
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
    return localStorage.getItem("webdeck_local_file") || window.__WEBDECK_MARKDOWN__ || "";
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
