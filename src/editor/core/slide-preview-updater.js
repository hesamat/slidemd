/**
 * SlidePreviewUpdater
 *
 * Parses the editor markdown, validates layout/areas, re-renders the
 * current slide element, re-enhances content, and attaches preview overlays
 * (area guides, grid resizer, image drag/resize).
 *
 * Extracted from EditController.updatePreview().
 */

import { MarkdownParser } from "../../data/markdown-parser.js";
import { LayoutParser } from "../../data/layout-parser.js";
import { LayoutData } from "../../data/layout-data.js";
import { SlideRenderer } from "../../renderer/slide-renderer.js";
import { ContentEnhancer } from "../../renderer/content-enhancer.js";
import { AssetLoader } from "../../core/asset-loader.js";
import { DeckImagesResolver } from "../image/deck-images-resolver.js";
import { ImageInteractionHandler } from "../image/image-interaction-handler.js";
import { Notification } from "../../renderer/notification.js";

export class SlidePreviewUpdater {
  /**
   * @param {object} opts
   * @param {() => object|null} opts.getMarkdownEditor
   * @param {() => object} opts.getWarnings
   * @param {() => object} opts.getDeck
   * @param {() => number} opts.getCurrentSlideIndex
   * @param {() => object} opts.getThumbnails
   * @param {() => object} opts.getAreaGuides
   * @param {() => object} opts.getGridResizer
   */
  constructor({
    getMarkdownEditor,
    getWarnings,
    getDeck,
    getCurrentSlideIndex,
    getThumbnails,
    getAreaGuides,
    getGridResizer,
  }) {
    this._getMarkdownEditor = getMarkdownEditor;
    this._getWarnings = getWarnings;
    this._getDeck = getDeck;
    this._getCurrentSlideIndex = getCurrentSlideIndex;
    this._getThumbnails = getThumbnails;
    this._getAreaGuides = getAreaGuides;
    this._getGridResizer = getGridResizer;
    this._pendingReadyCallback = null;
  }

  get markdownEditor() {
    return this._getMarkdownEditor();
  }
  get warnings() {
    return this._getWarnings();
  }
  get deck() {
    return this._getDeck();
  }
  get currentSlideIndex() {
    return this._getCurrentSlideIndex();
  }
  get thumbnails() {
    return this._getThumbnails();
  }
  get areaGuides() {
    return this._getAreaGuides();
  }
  get gridResizer() {
    return this._getGridResizer();
  }

  /**
   * Register a one-shot callback to run after the next preview update
   * finishes attaching overlays (image handlers, area guides, etc.).
   */
  onReadyOnce(callback) {
    this._pendingReadyCallback = callback;
  }

  async update() {
    const markdown = this.markdownEditor?.getValue() ?? "";
    this.warnings.clearSlideWarning();
    this.warnings.resetPending();

    try {
      await AssetLoader.ensureMarkdownItLoaded();
      const parser = new MarkdownParser();

      const slideCount = parser.splitSlides(markdown).length;
      if (slideCount > 1) {
        this.warnings.showEditorWarning(
          "multi-slide-preview",
          "This editor previews a single slide. Split slides with --- in the full deck, not inside the editor.",
        );
      }

      const fullDeckData = parser.parseDeckMarkdown(markdown);

      if (!fullDeckData.slides || fullDeckData.slides.length === 0) {
        Notification.warning("Invalid markdown: Unable to generate slide from current content");
        return;
      }

      const slideData = fullDeckData.slides[0];

      const layoutSpec = (slideData.layout || "").trim();
      const layoutKey = layoutSpec.toLowerCase();
      const looksLikeGridSpec = /["']/.test(layoutSpec) || layoutSpec.includes("/");
      if (layoutSpec && !looksLikeGridSpec && !LayoutData.hasLayout(layoutKey)) {
        this.warnings.showEditorWarning(
          `unknown-layout-${layoutKey}`,
          `Unknown layout "${layoutSpec}". Pick a preset or use a full grid template.`,
        );
      }

      const areaNames = Object.keys(slideData.areas || {});
      const resolvedLayout = LayoutParser.resolvePreset(layoutSpec);
      const layoutInfo = LayoutParser.parse(resolvedLayout, {
        fallbackAreas: areaNames.length ? areaNames : ["main"],
      });
      const layoutAreas = layoutInfo.orderedAreas || [];

      if (areaNames.length) {
        const unknownAreas = areaNames.filter((name) => !layoutAreas.includes(name));
        if (unknownAreas.length) {
          this.warnings.showEditorWarning(
            `unknown-areas-${unknownAreas.join("-")}`,
            `Areas not in layout: ${unknownAreas.map((name) => `@${name}`).join(", ")}.`,
          );
        }

        const optionalAreas = ["footer", "header"];
        const missingAreas = layoutAreas.filter(
          (name) => !areaNames.includes(name) && !optionalAreas.includes(name),
        );
        if (missingAreas.length) {
          this.warnings.showEditorWarning(
            `missing-areas-${missingAreas.join("-")}`,
            `Layout expects: ${missingAreas.map((name) => `@${name}`).join(", ")}.`,
          );
        }
      }

      this.deck.slides[this.currentSlideIndex] = slideData;

      this.thumbnails.updateThumbnailTitle(this.currentSlideIndex, slideData.title);

      const slidesContainer = document.getElementById("slidesContainer");
      if (!slidesContainer) return;

      const allSlides = slidesContainer.querySelectorAll(":scope > .slide");
      const slideEl = allSlides[this.currentSlideIndex];

      if (slideEl) {
        const wasActive = slideEl.classList.contains("active");
        const newSlideEl = SlideRenderer.createSlideElement(
          this.deck,
          slideData,
          this.currentSlideIndex,
          wasActive,
        );
        slideEl.replaceWith(newSlideEl);

        this.warnings.applyPendingSlideWarning(newSlideEl);
        this.areaGuides.applyAreaGuides(newSlideEl, slideData);

        // Rewrite image srcs and background url()s to blob URLs the
        // browser can render in the preview (since the deck file lives
        // outside the project root, the dev server can't serve them).
        DeckImagesResolver.rewriteImgSrcs(newSlideEl).catch((err) => {
          console.warn("Image rewrite failed:", err);
        });
        DeckImagesResolver.rewriteBackgroundUrls(newSlideEl).catch((err) => {
          console.warn("Background image rewrite failed:", err);
        });

        const attachPreviewOverlays = () => {
          // Attach overlays after paint so layout geometry is measurable.
          requestAnimationFrame(() => {
            this.areaGuides.updateAreaOverflow(newSlideEl);
            this.gridResizer.attachForSlide(newSlideEl, slideData);
            const grid = newSlideEl.querySelector(".slide__grid");
            if (grid) {
              ImageInteractionHandler.activate(grid);
            }
            if (this._pendingReadyCallback) {
              const cb = this._pendingReadyCallback;
              this._pendingReadyCallback = null;
              cb(newSlideEl);
            }
          });
        };

        ContentEnhancer.enhanceRenderedContent(newSlideEl)
          .then(() => {
            this.areaGuides.applyAreaGuides(newSlideEl, slideData);
            DeckImagesResolver.rewriteImgSrcs(newSlideEl).catch(() => {});
            DeckImagesResolver.rewriteBackgroundUrls(newSlideEl).catch(() => {});
          })
          .catch((err) => {
            console.warn("Failed to enhance slide preview:", err);
          })
          .finally(() => {
            attachPreviewOverlays();
          });
      } else {
        this.warnings.applyPendingSlideWarning();
      }
    } catch (error) {
      console.error("Failed to update preview:", error);
      Notification.error("Failed to parse markdown: " + (error.message || "Unknown error"));
    }
  }
}
