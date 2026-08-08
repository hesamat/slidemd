/**
 * SlideOperations
 *
 * Slide lifecycle helpers extracted from EditController: add, delete,
 * move, duplicate, and layout-based creation.
 */

import { Notification } from "../../renderer/notification.js";
import { LayoutData } from "../../data/layout-data.js";
import { SlideStylePanel } from "../ui/slide-style-panel.js";
import { createDeletePatch, createInsertPatch } from "../../data/store/slide-patch.js";

export class SlideOperations {
  /**
   * @param {object} opts
   * @param {() => object} opts.getDeck
   * @param {() => object} opts.getElements
   * @param {() => object} opts.getController
   * @param {() => object} opts.getThumbnails
   * @param {() => object|null} opts.getMarkdownEditor
   * @param {() => number} opts.getCurrentSlideIndex
   * @param {(v: number) => void} opts.setCurrentSlideIndex
   * @param {() => Map} opts.getUnsavedMarkdown
   * @param {(v: Map) => void} opts.setUnsavedMarkdown
   * @param {() => boolean} opts.getHasUnsavedChanges
   * @param {(v: boolean) => void} opts.setHasUnsavedChanges
   * @param {() => object} opts.getSaveManager
   * @param {import('../../data/store/deck-store.js').DeckStore|null} opts.deckStore
   * @param {() => void} opts.prepareStoreOperation
   * @param {() => void} opts.recordStoreOperation
   */
  constructor({
    getDeck,
    getElements,
    getController,
    getThumbnails,
    getMarkdownEditor,
    getCurrentSlideIndex,
    setCurrentSlideIndex,
    getUnsavedMarkdown,
    setUnsavedMarkdown,
    getHasUnsavedChanges,
    setHasUnsavedChanges,
    getSaveManager,
    deckStore = null,
    prepareStoreOperation = null,
    recordStoreOperation = null,
  }) {
    this._getDeck = getDeck;
    this._getElements = getElements;
    this._getController = getController;
    this._getThumbnails = getThumbnails;
    this._getMarkdownEditor = getMarkdownEditor;
    this._getCurrentSlideIndex = getCurrentSlideIndex;
    this._setCurrentSlideIndex = setCurrentSlideIndex;
    this._getUnsavedMarkdown = getUnsavedMarkdown;
    this._setUnsavedMarkdown = setUnsavedMarkdown;
    this._getHasUnsavedChanges = getHasUnsavedChanges;
    this._setHasUnsavedChanges = setHasUnsavedChanges;
    this._getSaveManager = getSaveManager;
    this._deckStore = deckStore;
    this._prepareStoreOperation = prepareStoreOperation;
    this._recordStoreOperation = recordStoreOperation;
  }

  _prepareStoreMutation() {
    this._prepareStoreOperation?.();
  }

  /**
   * @param {boolean | { success: boolean, reason?: string }} result
   * @returns {boolean}
   */
  _isPatchSuccess(result) {
    if (!result) return false;
    if (typeof result === "object" && result.success === false) return false;
    return true;
  }

  /**
   * Apply structural patches to the canonical store.
   * If the first attempt is rejected, re-sync the store once from the
   * current working state and retry. If the retry also fails, fail closed:
   * warn the user and stop the operation.
   * @param {object[]} patches
   * @returns {boolean} true when the patches were committed, false otherwise
   */
  _applyStorePatches(patches) {
    if (!this._deckStore) return true;

    if (this._isPatchSuccess(this._deckStore.applyPatches(patches))) {
      this._recordStoreOperation?.();
      return true;
    }

    // Drift detected — re-sync the store from the editor's current state and retry once.
    const fullSlides = this._getWorkingSlides();
    this._deckStore.syncSlides(fullSlides, this._getCurrentSlideIndex());

    if (this._isPatchSuccess(this._deckStore.applyPatches(patches))) {
      this._recordStoreOperation?.();
      return true;
    }

    // Still failing — stop. Do not proceed against a diverged store.
    Notification.warning(
      "Store change could not be applied. Please try again or reload the deck.",
      5000,
    );
    return false;
  }

  get deck() {
    return this._getDeck();
  }
  get elements() {
    return this._getElements();
  }
  get controller() {
    return this._getController();
  }
  get thumbnails() {
    return this._getThumbnails();
  }
  get markdownEditor() {
    return this._getMarkdownEditor();
  }
  get currentSlideIndex() {
    return this._getCurrentSlideIndex();
  }
  set currentSlideIndex(v) {
    this._setCurrentSlideIndex(v);
  }
  get unsavedMarkdown() {
    return this._getUnsavedMarkdown();
  }
  set unsavedMarkdown(v) {
    this._setUnsavedMarkdown(v);
  }
  get hasUnsavedChanges() {
    return this._getHasUnsavedChanges();
  }
  set hasUnsavedChanges(v) {
    this._setHasUnsavedChanges(v);
  }
  get saveManager() {
    return this._getSaveManager();
  }

  /**
   * Return the current working Markdown for a single slide, layering the
   * editor's unsaved buffer over the canonical store.
   * @param {number} index
   * @returns {object}
   */
  _getWorkingSlide(index) {
    if (this._deckStore) {
      const markdown = this._deckStore.getSlides()[index] ?? "";
      const baseSlide = { index, markdown };
      return this.saveManager?.getFullSlide
        ? this.saveManager.getFullSlide(index, baseSlide)
        : baseSlide;
    }
    const sourceSlides = this.saveManager?.getFullSlides() ?? [];
    const markdown = sourceSlides[index] ?? "";
    return { index, markdown };
  }

  /**
   * Return all current working Markdown strings in index order.
   * @returns {string[]}
   */
  _getWorkingSlides() {
    if (this._deckStore) {
      const sourceSlides = this._deckStore.getSlides();
      const storeSlideObjects = sourceSlides.map((markdown, index) => ({ index, markdown }));
      return this.saveManager?.getFullSlides
        ? this.saveManager.getFullSlides(storeSlideObjects).map((slide) => slide.markdown ?? "")
        : sourceSlides;
    }
    return this.saveManager?.getFullSlides() ?? [];
  }

  _getWorkingMarkdown(index) {
    return this._getWorkingSlide(index).markdown;
  }

  _requireDeckStore() {
    if (!this._deckStore) {
      Notification.warning("Slide operations require a deck store in this window.");
      return false;
    }
    return true;
  }

  addSlide() {
    if (!this._requireDeckStore()) return;
    const slideCount = this._deckStore?.getSlideCount() ?? this.deck.slides.length;
    if (slideCount === 0) return;

    const insertIndex = this.currentSlideIndex + 1;
    const newSlideMarkdown = "## New Slide\n\nAdd your content here";

    this._prepareStoreMutation();
    if (!this._applyStorePatches([createInsertPatch(insertIndex, newSlideMarkdown, "user")]))
      return;

    this._deckStore?.setActiveIndex(insertIndex);
    this.hasUnsavedChanges = true;
    this.saveManager.updateButton();
    Notification.success("Slide added");
  }

  async deleteSlide() {
    if (!this._requireDeckStore()) return;
    const slideCount = this._deckStore?.getSlideCount() ?? this.deck.slides.length;
    if (slideCount <= 1) {
      Notification.warning("Cannot delete the only slide");
      return;
    }

    const confirmed = await Notification.confirm("Are you sure you want to delete this slide?");
    if (!confirmed) return;

    const indexToDelete = this.currentSlideIndex;

    this._prepareStoreMutation();
    const deletedMarkdown = this._getWorkingMarkdown(indexToDelete);
    this.rebuildUnsavedMarkdownMap(-1, indexToDelete);
    if (!this._applyStorePatches([createDeletePatch(indexToDelete, deletedMarkdown, "user")]))
      return;

    this.hasUnsavedChanges = true;
    this.saveManager.updateButton();
  }

  moveSlideUp() {
    if (!this._requireDeckStore()) return;
    if (this.currentSlideIndex <= 0) {
      Notification.warning("Cannot move the first slide up");
      return;
    }

    const currentIndex = this.currentSlideIndex;
    const targetIndex = currentIndex - 1;

    if (!this._swapSlides(currentIndex, targetIndex)) return;

    Notification.success("Slide moved up");
  }

  moveSlideDown() {
    if (!this._requireDeckStore()) return;
    const slideCount = this._deckStore?.getSlideCount() ?? this.deck.slides.length;
    if (this.currentSlideIndex >= slideCount - 1) {
      Notification.warning("Cannot move the last slide down");
      return;
    }

    const currentIndex = this.currentSlideIndex;
    const targetIndex = currentIndex + 1;

    if (!this._swapSlides(currentIndex, targetIndex)) return;

    Notification.success("Slide moved down");
  }

  /** Swap two adjacent slides through one patch transaction. */
  _swapSlides(a, b) {
    this._prepareStoreMutation();
    const movedMarkdown = this._getWorkingMarkdown(a);
    if (
      !this._applyStorePatches([
        createDeletePatch(a, movedMarkdown, "user", "move"),
        createInsertPatch(b, movedMarkdown, "user", "move"),
      ])
    )
      return false;

    const newMap = new Map();
    for (const [idx, content] of this.unsavedMarkdown) {
      if (idx === a) newMap.set(b, content);
      else if (idx === b) newMap.set(a, content);
      else newMap.set(idx, content);
    }
    this.unsavedMarkdown = newMap;
    this.hasUnsavedChanges = true;
    this.saveManager.updateButton();
    return true;
  }

  async duplicateSlide() {
    if (!this._requireDeckStore()) return;
    const sourceIndex = this.currentSlideIndex;
    const insertIndex = sourceIndex + 1;

    const markdown = this._getWorkingMarkdown(sourceIndex);
    if (!markdown) {
      Notification.warning("Cannot duplicate empty slide");
      return;
    }

    this._prepareStoreMutation();
    if (!this._applyStorePatches([createInsertPatch(insertIndex, markdown, "user")])) return;

    this._deckStore?.setActiveIndex(insertIndex);
    this.hasUnsavedChanges = true;
    this.saveManager.updateButton();
    Notification.success("Slide duplicated successfully");
  }

  addSlideWithLayout(layoutName) {
    if (!this._requireDeckStore()) return;
    const slideCount = this._deckStore?.getSlideCount() ?? this.deck.slides.length;
    if (slideCount === 0) return;

    const template = LayoutData.getTemplate(layoutName);
    const insertIndex = this.currentSlideIndex + 1;

    const defaultAreaStyle = SlideStylePanel.getDefaultAreaStyle();
    const defaultHeaderStyle = SlideStylePanel.getDefaultHeaderStyle();
    const defaultBackground = SlideStylePanel.getDefaultBackground();
    const defaultTheme = SlideStylePanel.getDefaultTheme();
    let styledTemplate = template;
    if (defaultAreaStyle || defaultHeaderStyle !== "line" || defaultBackground || defaultTheme) {
      styledTemplate = template.replace(/^(layout: .+)$/gm, (match) => {
        let result = match;
        if (defaultAreaStyle) result += `\narea-style: ${defaultAreaStyle}`;
        if (defaultHeaderStyle && defaultHeaderStyle !== "line")
          result += `\nheader-style: ${defaultHeaderStyle}`;
        if (defaultBackground) result += `\nbackground: ${defaultBackground}`;
        if (defaultTheme) result += `\ntheme: ${defaultTheme}`;
        return result;
      });
    }

    this._prepareStoreMutation();
    if (!this._applyStorePatches([createInsertPatch(insertIndex, styledTemplate, "user")])) return;

    this._deckStore?.setActiveIndex(insertIndex);
    this.hasUnsavedChanges = true;
    this.saveManager.updateButton();
    Notification.success(`Added new slide with "${layoutName}" layout`);
  }

  rebuildUnsavedMarkdownMap(
    insertAtIndex = -1,
    deleteAtIndex = -1,
    newSlideIndex = -1,
    newSlideMarkdown = "",
  ) {
    const newMap = new Map();

    for (const [index, content] of this.unsavedMarkdown) {
      let newIndex = index;

      if (deleteAtIndex >= 0 && index > deleteAtIndex) newIndex = index - 1;
      if (insertAtIndex >= 0 && newIndex >= insertAtIndex) newIndex = newIndex + 1;
      if (deleteAtIndex >= 0 && index === deleteAtIndex) continue;

      newMap.set(newIndex, content);
    }

    if (newSlideIndex >= 0 && newSlideMarkdown) {
      newMap.set(newSlideIndex, newSlideMarkdown);
    }

    this.unsavedMarkdown = newMap;
    this.hasUnsavedChanges = this.unsavedMarkdown.size > 0;
    this.saveManager.updateButton();
  }
}
