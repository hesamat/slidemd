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
import { TextBlockHandler } from "../text/text-block-handler.js";
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
    this._updateGeneration = 0;
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
    const generation = ++this._updateGeneration;
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

        // Check whether the layout/structure changed since the last render.
        // If not, we can patch the existing element in-place (no DOM removal,
        // no blink).  If yes, we fall back to a full replace.
        const prevLayoutName = slideEl.dataset.layoutName || "";
        const newLayoutName = (slideData.layout || "").trim();
        const layoutChanged = prevLayoutName !== newLayoutName;

        // Check whether area names changed (add/remove @area markers).
        const prevAreaNames = [...slideEl.querySelectorAll(".slide__area")]
          .map((el) => el.dataset.areaName)
          .sort()
          .join(",");
        const newAreaNames = Object.keys(slideData.areas || {})
          .sort()
          .join(",");
        const areasChanged = prevAreaNames !== newAreaNames;

        if (!layoutChanged && !areasChanged) {
          // ── Fast path: patch existing element in-place ────────────────
          // Update wrapper attributes — preserve existing classes (e.g. grid-visible)
          slideEl.classList.toggle("active", wasActive);
          slideEl.classList.toggle("slide--hidden", !!slideData?.hidden);
          if (slideData?.theme) slideEl.setAttribute("data-theme", slideData.theme);
          else slideEl.removeAttribute("data-theme");
          if (slideData?.headerStyle)
            slideEl.setAttribute("data-header-style", slideData.headerStyle);
          else slideEl.removeAttribute("data-header-style");
          if (slideData?.background) slideEl.style.background = slideData.background;
          else slideEl.style.removeProperty("background");
          const hasAreaStyle =
            slideData?.areaStyle || Object.keys(slideData?.areaStyles || {}).length;
          if (hasAreaStyle) slideEl.setAttribute("data-has-borders", "");
          else slideEl.removeAttribute("data-has-borders");

          const grid = slideEl.querySelector(".slide__grid");
          if (grid) {
            const resolvedLayout = LayoutParser.resolvePreset(slideData?.layout);
            const layout = LayoutParser.parse(resolvedLayout, {
              fallbackAreas: newAreaNames.length ? newAreaNames.split(",") : ["main"],
            });
            grid.style.gridTemplateAreas = layout.gridTemplateAreas;
            grid.style.gridTemplateColumns = layout.gridTemplateColumns;
            grid.style.gridTemplateRows = layout.gridTemplateRows;
          }

          // Enhance new HTML off-screen, then patch innerHTML once with
          // the fully enhanced result.  This avoids a flash of raw HTML
          // (un-styled code blocks, un-rendered math, etc.).
          const areas = slideData.areas || {};
          const globalAreaStyle = slideData?.areaStyle || "";
          const perAreaStyles = slideData?.areaStyles || {};
          for (const [name, html] of Object.entries(areas)) {
            const areaEl = slideEl.querySelector(`.slide__area[data-area-name="${name}"]`);
            if (!areaEl) continue;

            // Re-apply area styles in the fast path: clear the previous props,
            // then apply the current global and per-area directives.
            const prevStyle = areaEl.dataset.appliedAreaStyle || "";
            const newGlobal = name !== "footer" ? globalAreaStyle : "";
            const newPerArea = name !== "footer" ? perAreaStyles[name] || "" : "";

            for (const decl of prevStyle.split(";")) {
              const d = decl.trim();
              if (!d) continue;
              const idx = d.indexOf(":");
              if (idx === -1) continue;
              const prop = d.slice(0, idx).trim();
              if (prop) areaEl.style.removeProperty(prop);
            }

            if (newGlobal) SlideRenderer._applyAreaStyle(areaEl, newGlobal);
            if (newPerArea) SlideRenderer._applyAreaStyle(areaEl, newPerArea);
            areaEl.dataset.appliedAreaStyle = [newGlobal, newPerArea].filter(Boolean).join("; ");

            // Build a temporary off-screen container with the new HTML
            const temp = document.createElement("div");
            temp.innerHTML = html;
            try {
              await ContentEnhancer.enhanceRenderedContent(temp, { force: true });
            } catch {
              /* best-effort enhancement */
            }
            if (generation !== this._updateGeneration) return;
            const enhancedHtml = temp.innerHTML;
            if (areaEl.innerHTML !== enhancedHtml) {
              areaEl.innerHTML = enhancedHtml;
            }
          }

          // Rewrite image srcs to blob URLs in the fast path too
          DeckImagesResolver.rewriteImgSrcs(slideEl).catch(() => {});
          DeckImagesResolver.rewriteBackgroundUrls(slideEl).catch(() => {});

          // Re-apply area guides (innerHTML replacement destroyed label buttons)
          this.areaGuides.applyAreaGuides(slideEl, slideData);

          this.warnings.applyPendingSlideWarning(slideEl);

          requestAnimationFrame(() => {
            this.areaGuides.updateAreaOverflow(slideEl);
            if (this._pendingReadyCallback) {
              const cb = this._pendingReadyCallback;
              this._pendingReadyCallback = null;
              cb(slideEl);
            }
          });
        } else {
          // ── Slow path: layout or areas changed — full replace ──────────
          const newSlideEl = SlideRenderer.createSlideElement(
            this.deck,
            slideData,
            this.currentSlideIndex,
            wasActive,
          );

          try {
            await ContentEnhancer.enhanceRenderedContent(newSlideEl);
            this.areaGuides.applyAreaGuides(newSlideEl, slideData);
            DeckImagesResolver.rewriteImgSrcs(newSlideEl).catch(() => {});
            DeckImagesResolver.rewriteBackgroundUrls(newSlideEl).catch(() => {});
          } catch (err) {
            console.warn("Failed to enhance slide preview:", err);
          }

          if (generation !== this._updateGeneration) return;
          slideEl.replaceWith(newSlideEl);
          this.warnings.applyPendingSlideWarning(newSlideEl);

          requestAnimationFrame(() => {
            this.areaGuides.updateAreaOverflow(newSlideEl);
            this.gridResizer.attachForSlide(newSlideEl, slideData);
            const grid = newSlideEl.querySelector(".slide__grid");
            if (grid) {
              TextBlockHandler.activate(grid);
              ImageInteractionHandler.activate(grid);
            }
            if (this._pendingReadyCallback) {
              const cb = this._pendingReadyCallback;
              this._pendingReadyCallback = null;
              cb(newSlideEl);
            }
          });
        }
      } else {
        this.warnings.applyPendingSlideWarning();
      }
    } catch (error) {
      console.error("Failed to update preview:", error);
      Notification.error("Failed to parse markdown: " + (error.message || "Unknown error"));
    }
  }
}
