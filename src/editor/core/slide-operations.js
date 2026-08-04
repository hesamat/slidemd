/**
 * SlideOperations
 *
 * Slide lifecycle helpers extracted from EditController: add, delete,
 * move, duplicate, and layout-based creation.
 */

import { MarkdownParser } from "../../data/markdown-parser.js";
import { AssetLoader } from "../../core/asset-loader.js";
import { SlideRenderer } from "../../renderer/slide-renderer.js";
import { ContentEnhancer } from "../../renderer/content-enhancer.js";
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
   * @param {() => string[]} opts.getOriginalMarkdown
   * @param {() => Map} opts.getUnsavedMarkdown
   * @param {(v: Map) => void} opts.setUnsavedMarkdown
   * @param {() => boolean} opts.getHasUnsavedChanges
   * @param {(v: boolean) => void} opts.setHasUnsavedChanges
   * @param {() => object} opts.getSaveManager
   * @param {import('../../data/store/deck-store.js').DeckStore|null} opts.deckStore
   */
  constructor({
    getDeck,
    getElements,
    getController,
    getThumbnails,
    getMarkdownEditor,
    getCurrentSlideIndex,
    setCurrentSlideIndex,
    getOriginalMarkdown,
    getUnsavedMarkdown,
    setUnsavedMarkdown,
    getHasUnsavedChanges,
    setHasUnsavedChanges,
    getSaveManager,
    deckStore = null,
  }) {
    this._getDeck = getDeck;
    this._getElements = getElements;
    this._getController = getController;
    this._getThumbnails = getThumbnails;
    this._getMarkdownEditor = getMarkdownEditor;
    this._getCurrentSlideIndex = getCurrentSlideIndex;
    this._setCurrentSlideIndex = setCurrentSlideIndex;
    this._getOriginalMarkdown = getOriginalMarkdown;
    this._getUnsavedMarkdown = getUnsavedMarkdown;
    this._setUnsavedMarkdown = setUnsavedMarkdown;
    this._getHasUnsavedChanges = getHasUnsavedChanges;
    this._setHasUnsavedChanges = setHasUnsavedChanges;
    this._getSaveManager = getSaveManager;
    this._deckStore = deckStore;
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
  get originalMarkdown() {
    return this._getOriginalMarkdown();
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

  addSlide() {
    if (this.deck.slides.length === 0) return;

    const currentSlide = this.deck.slides[this.currentSlideIndex];
    const newSlide = {
      id: Date.now(),
      title: "New Slide",
      notes: "",
      layout: currentSlide.layout || "",
      areas: { main: "<h2>New Slide</h2>\n\nAdd your content here" },
    };

    const insertIndex = this.currentSlideIndex + 1;

    const newSlideMarkdown = "## New Slide\n\nAdd your content here";
    this._deckStore?.applyPatch(createInsertPatch(insertIndex, newSlideMarkdown, "user"));
    this.deck.slides.splice(insertIndex, 0, newSlide);
    this.originalMarkdown.splice(insertIndex, 0, newSlideMarkdown);

    const visibleSlideCount = this.deck.slides.filter((s) => !s.hidden).length;
    if (this.elements.slideCountEl) {
      this.elements.slideCountEl.textContent = String(visibleSlideCount);
    }

    if (this.elements.slidesContainer) {
      const newSlideEl = SlideRenderer.createSlideElement(this.deck, newSlide, insertIndex, false);
      const allSlides = this.elements.slidesContainer.querySelectorAll(".slide");
      if (allSlides[this.currentSlideIndex]) {
        allSlides[this.currentSlideIndex].after(newSlideEl);
      } else {
        this.elements.slidesContainer.appendChild(newSlideEl);
      }
    }

    this.controller.slideNavigator.goTo(insertIndex);
  }

  async deleteSlide() {
    if (this.deck.slides.length <= 1) {
      Notification.warning("Cannot delete the only slide");
      return;
    }

    const confirmed = await Notification.confirm("Are you sure you want to delete this slide?");
    if (!confirmed) return;

    const indexToDelete = this.currentSlideIndex;
    const deletedMarkdown =
      this.unsavedMarkdown.get(indexToDelete) ?? this.originalMarkdown[indexToDelete] ?? "";

    this._deckStore?.applyPatch(createDeletePatch(indexToDelete, deletedMarkdown, "user"));
    this.deck.slides.splice(indexToDelete, 1);
    this.originalMarkdown.splice(indexToDelete, 1);

    const visibleSlideCount = this.deck.slides.filter((s) => !s.hidden).length;
    if (this.elements.slideCountEl) {
      this.elements.slideCountEl.textContent = String(visibleSlideCount);
    }

    const allSlides = document.querySelectorAll(".slide");
    if (allSlides[indexToDelete]) allSlides[indexToDelete].remove();

    const newIndex =
      indexToDelete >= this.deck.slides.length ? this.deck.slides.length - 1 : indexToDelete;
    this.controller.slideNavigator.goTo(newIndex);

    this.rebuildUnsavedMarkdownMap(-1, indexToDelete);

    if (this.unsavedMarkdown.size === 0) {
      this.unsavedMarkdown.set(0, this.originalMarkdown[0] || "");
    }
    this.hasUnsavedChanges = true;
    this.saveManager.updateButton();

    this.thumbnails.refresh();
  }

  moveSlideUp() {
    if (this.currentSlideIndex <= 0) {
      Notification.warning("Cannot move the first slide up");
      return;
    }

    const currentIndex = this.currentSlideIndex;
    const targetIndex = currentIndex - 1;

    this._swapSlides(currentIndex, targetIndex);

    this.controller.slideNavigator.goTo(targetIndex);
    this.thumbnails.refresh();
    Notification.success("Slide moved up");
  }

  moveSlideDown() {
    if (this.currentSlideIndex >= this.deck.slides.length - 1) {
      Notification.warning("Cannot move the last slide down");
      return;
    }

    const currentIndex = this.currentSlideIndex;
    const targetIndex = currentIndex + 1;

    this._swapSlides(currentIndex, targetIndex);

    this.controller.slideNavigator.goTo(targetIndex);
    this.thumbnails.refresh();
    Notification.success("Slide moved down");
  }

  /** Swap two adjacent slides in data, DOM, and unsaved-map. */
  _swapSlides(a, b) {
    const movedMarkdown = this.unsavedMarkdown.get(a) ?? this.originalMarkdown[a] ?? "";
    this._deckStore?.applyPatches([
      createDeletePatch(a, movedMarkdown, "user"),
      createInsertPatch(b, movedMarkdown, "user"),
    ]);
    [this.deck.slides[a], this.deck.slides[b]] = [this.deck.slides[b], this.deck.slides[a]];
    [this.originalMarkdown[a], this.originalMarkdown[b]] = [
      this.originalMarkdown[b],
      this.originalMarkdown[a],
    ];

    const allSlides = this.elements.slidesContainer.querySelectorAll(".slide");
    const elA = allSlides[a];
    const elB = allSlides[b];
    if (elA && elB) {
      const cloneA = elA.cloneNode(true);
      const cloneB = elB.cloneNode(true);
      elB.replaceWith(cloneA);
      elA.replaceWith(cloneB);
      cloneB.classList.remove("active");
      cloneA.classList.add("active");
    }

    const newMap = new Map();
    for (const [idx, content] of this.unsavedMarkdown) {
      if (idx === a) newMap.set(b, content);
      else if (idx === b) newMap.set(a, content);
      else newMap.set(idx, content);
    }
    this.unsavedMarkdown = newMap;
    this.hasUnsavedChanges = true;
    this.saveManager.updateButton();
  }

  async duplicateSlide() {
    const sourceIndex = this.currentSlideIndex;
    const insertIndex = sourceIndex + 1;

    const markdown =
      this.unsavedMarkdown.get(sourceIndex) ?? this.originalMarkdown[sourceIndex] ?? "";

    if (!markdown) {
      Notification.warning("Cannot duplicate empty slide");
      return;
    }

    try {
      await AssetLoader.ensureMarkdownItLoaded();
      const parser = new MarkdownParser();
      const deckData = parser.parseDeckMarkdown(markdown);

      if (!deckData.slides || deckData.slides.length === 0) {
        Notification.warning("Failed to parse slide for duplication");
        return;
      }

      const newSlide = { ...deckData.slides[0], id: Date.now() };

      this._deckStore?.applyPatch(createInsertPatch(insertIndex, markdown, "user"));
      this.deck.slides.splice(insertIndex, 0, newSlide);
      this.originalMarkdown.splice(insertIndex, 0, markdown);

      if (this.elements.slideCountEl) {
        this.elements.slideCountEl.textContent = String(this.deck.slides.length);
      }

      if (this.elements.slidesContainer) {
        const newSlideEl = SlideRenderer.createSlideElement(
          this.deck,
          newSlide,
          insertIndex,
          false,
        );
        const allSlides = this.elements.slidesContainer.querySelectorAll(".slide");
        if (allSlides[sourceIndex]) {
          allSlides[sourceIndex].after(newSlideEl);
        } else {
          this.elements.slidesContainer.appendChild(newSlideEl);
        }
        ContentEnhancer.enhanceRenderedContent(newSlideEl).catch((err) => {
          console.warn("Failed to enhance duplicated slide:", err);
        });
      }

      this.rebuildUnsavedMarkdownMap(insertIndex, -1, insertIndex, markdown);
      this.controller.slideNavigator.goTo(insertIndex);
      this.thumbnails.refresh();
      Notification.success("Slide duplicated successfully");
    } catch (error) {
      console.error("Failed to duplicate slide:", error);
      Notification.error("Failed to duplicate slide: " + (error.message || "Unknown error"));
    }
  }

  addSlideWithLayout(layoutName) {
    if (this.deck.slides.length === 0) return;

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

    try {
      const parser = new MarkdownParser();
      const deckData = parser.parseDeckMarkdown(styledTemplate);

      if (!deckData.slides || deckData.slides.length === 0) {
        const newSlide = {
          id: Date.now(),
          title: "New Slide",
          notes: "",
          layout: layoutName,
          areas: { main: "<h2>New Slide</h2>\n\nAdd your content here" },
        };
        this._deckStore?.applyPatch(createInsertPatch(insertIndex, styledTemplate, "user"));
        this.deck.slides.splice(insertIndex, 0, newSlide);
        this.originalMarkdown.splice(insertIndex, 0, styledTemplate);
      } else {
        const newSlide = deckData.slides[0];
        this._deckStore?.applyPatch(createInsertPatch(insertIndex, styledTemplate, "user"));
        this.deck.slides.splice(insertIndex, 0, newSlide);
        this.originalMarkdown.splice(insertIndex, 0, styledTemplate);
      }

      if (this.elements.slideCountEl) {
        this.elements.slideCountEl.textContent = String(this.deck.slides.length);
      }

      if (this.elements.slidesContainer) {
        const newSlideEl = SlideRenderer.createSlideElement(
          this.deck,
          this.deck.slides[insertIndex],
          insertIndex,
          false,
        );
        const allSlides = this.elements.slidesContainer.querySelectorAll(".slide");
        if (allSlides[this.currentSlideIndex]) {
          allSlides[this.currentSlideIndex].after(newSlideEl);
        } else {
          this.elements.slidesContainer.appendChild(newSlideEl);
        }
        ContentEnhancer.enhanceRenderedContent(newSlideEl).catch((err) => {
          console.warn("Failed to enhance new slide:", err);
        });
      }

      this.controller.slideNavigator.goTo(insertIndex);
      this.rebuildUnsavedMarkdownMap(insertIndex, -1, insertIndex, styledTemplate);
      this.thumbnails.refresh();
      Notification.success(`Added new slide with "${layoutName}" layout`);
    } catch (error) {
      console.error("Failed to create slide from template:", error);
      Notification.error("Failed to create slide: " + (error.message || "Unknown error"));
    }
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
