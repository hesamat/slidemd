/**
 * ImageDragController
 *
 * Drag-and-drop repositioning and resize handles for images in edit mode.
 * Handles interact.js draggable setup, overlay resize handle mousedown
 * events, cross-area drag target detection, and drop-target highlighting.
 *
 * All mutable drag/resize state lives here, not in ImageInteractionHandler.
 * The handler injects callbacks via a context object.
 */
import interact from "interactjs";
import { ImagePropertiesPanel } from "./image-properties-panel.js";
import { ImageInteractionHandler } from "./image-interaction-handler.js";
import { getStageScale } from "./image-position-presets.js";
import { readImageSettings, isMediaSpanFillImage } from "./image-markdown-utils.js";
import { DragDropHelpers } from "../core/drag-common.js";

const MIN_RESIZE_DIM = 50;
const CROSS_AREA_RESELECT_MS = 400;
const CORNER_EDGE_LEN_THRESHOLD = 4;

export class ImageDragController {
  static _drop = null;
  static _dragSourceArea = null;
  static _dragStartX = 0;
  static _dragStartY = 0;
  static _dragSnapped = false;
  static _dragMoved = false;
  static _dragPrepared = false;
  static _dragIgnored = false;
  static _dragStartInsertBefore = null;
  static _dragStartImgRect = null;
  static _dropInsertBeforeEl = null;
  static _resizeState = null;

  /**
   * Activate drag/resize on a slide container.
   * @param {HTMLElement} container - The .slides-stage or slide container
   * @param {object} ctx
   * @param {() => HTMLElement|null} ctx.getSelectedImg
   * @param {(img: HTMLElement) => void} ctx.select
   * @param {() => void} ctx.updateOverlay
   * @param {() => void} ctx.syncToMarkdown
   * @param {(img: HTMLElement) => void} ctx.prepareMdImgForDrag
   * @param {(img, fromAreaName, toAreaName, insertBeforeEl) => string|null} ctx.buildMoveMarkdownAtPosition
   * @param {(img, targetEl) => void} ctx.reorderImageInMarkdown
   * @param {(areaEl, referenceEl, clientY) => HTMLElement|null} ctx.findInsertBeforeSlot
   * @param {() => string|null} ctx.getMarkdown
   * @param {(md: string) => void} ctx.setMarkdown
   * @param {(md: string) => void} ctx.onMoveArea
   * @param {() => HTMLElement|null} ctx.getOverlay
   * @param {() => boolean} ctx.isAspectLocked
   */
  static activate(container, ctx) {
    this._ctx = ctx;
    this._container = container;
    this._drop = new DragDropHelpers(container, { indicatorClassName: "image-drop-indicator" });

    interact(".slide__area img", { context: container }).draggable({
      listeners: {
        start: (e) => this._onDragStart(e),
        move: (e) => this._onDragMove(e),
        end: (e) => this._onDragEnd(e),
      },
    });

    this._setupResizeHandles();
  }

  static deactivate() {
    if (this._container) {
      interact(".slide__area img", { context: this._container }).draggable(false);
    }
    this._ctx = null;
    this._container = null;
    this._drop = null;
    this._clearDragState();
    this._resizeState = null;
  }

  static _onDragStart(e) {
    const img = e.target.closest("img");
    const ctx = this._ctx;
    if (!img || !ctx) return;
    // Ignored gestures (non-draggable images) must not fall through to
    // whatever image was selected before: interact.js still fires move/end,
    // and without an ignored marker the move handler would translate the
    // previously selected image and rewrite its markdown on mouseup.
    if (img.closest(".flex-row")) {
      this._dragIgnored = true;
      return;
    }
    this._dragIgnored = false;

    if (ctx.getSelectedImg() && !ctx.getSelectedImg().isConnected) {
      this._selectedImg = null;
    }

    ctx.select(img);
    ImagePropertiesPanel.hide();
    const sourceArea = img.closest(".slide__area");
    this._dragSourceArea = sourceArea?.dataset.areaName || null;
    this._dragStartX = e.clientX;
    this._dragStartY = e.clientY;
    this._dragSnapped = false;
    this._dragMoved = false;
    this._dragPrepared = false;
    // Capture the image's pre-conversion rect so the first drag move can
    // counteract the layout shift caused by switching a markdown image to
    // position:relative + .img-positioned (which changes the surrounding
    // flex/block layout and would otherwise make the image jump).
    this._dragStartImgRect = img.getBoundingClientRect();

    const areaEl = img.closest(".slide__area");
    if (areaEl) {
      const allElements = [...areaEl.children].filter((el) => el !== img);
      const cursorY = e.clientY;
      let insertBefore = null;
      for (const el of allElements) {
        const rect = el.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (cursorY < midY) {
          insertBefore = el;
          break;
        }
      }
      this._dragStartInsertBefore = insertBefore;
    }
  }

  static _onDragMove(e) {
    const ctx = this._ctx;
    const img = ctx?.getSelectedImg();
    if (!img || !ctx) return;
    if (this._dragIgnored) return;

    // interact.js emits dragstart on pointer-down. Do not convert a
    // markdown image until the pointer has actually moved; changing its
    // positioning mode during a plain click changes the surrounding flex
    // layout and makes the image jump before it is selected.
    if (!this._dragPrepared && !img.style.position) {
      ctx.prepareMdImgForDrag(img);
      img.classList.add("img-positioned");
      // Counteract the layout shift caused by the position:relative +
      // .img-positioned conversion so the picture stays visually in place
      // and only moves by the pointer delta from here on. Add the delta to
      // the left/top that prepareMdImgForDrag already set, since
      // position:relative offsets from the in-flow position, not from the
      // area origin. The CSS rule (margin-bottom:auto on the positioned
      // <p>) minimizes this shift, but a residual remains from the image
      // size change (100%/100% → explicit px) and the flex→block switch.
      this._compensateLayoutShift(img);
      this._dragPrepared = true;
    }
    this._dragMoved = true;

    const isFreeflow = ImageInteractionHandler.isFreeflow(img);
    this._drop?.updateDragTarget(
      () => this._ctx?.getSelectedImg(),
      e.clientX,
      e.clientY,
      this._dragSourceArea,
    );

    const targetArea = this._drop?.targetArea;
    const sourceArea = this._dragSourceArea;
    const isCrossArea = targetArea && sourceArea && targetArea !== sourceArea;

    // Cross-area highlight only for non-freeflow images
    if (isCrossArea && !isFreeflow) {
      const targetAreaEl = this._container?.querySelector(
        `.slide__area[data-area-name="${targetArea}"]`,
      );
      if (targetAreaEl) {
        this._drop?.highlightDropTarget(targetAreaEl);
        this._drop.dropTargetAreaEl = targetAreaEl;
      }
    } else if (!isCrossArea && this._drop?.dropTargetAreaEl) {
      this._drop?.clearDropTargetHighlight();
      this._drop.dropTargetAreaEl = null;
    }

    const scale = getStageScale();
    const dDesignX = e.dx / scale;
    const dDesignY = e.dy / scale;

    const curStyleLeft = parseFloat(img.style.left) || 0;
    const curStyleTop = parseFloat(img.style.top) || 0;

    img.style.left = `${curStyleLeft + dDesignX}px`;
    img.style.top = `${curStyleTop + dDesignY}px`;

    ctx.updateOverlay();

    // Gap indicator for non-freeflow images within the same area
    if (!isFreeflow && !isCrossArea) {
      const areaEl = img.closest(".slide__area");
      if (areaEl) {
        const allElements = [...areaEl.children].filter(
          (el) => el !== img && !el.classList.contains("image-drop-indicator"),
        );

        if (allElements.length > 0) {
          const cursorY = e.clientY;
          let insertBefore = null;

          for (const el of allElements) {
            const rect = el.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (cursorY < midY) {
              insertBefore = el;
              break;
            }
          }

          if (insertBefore !== this._dropInsertBeforeEl) {
            this._drop?.showDropGap(areaEl, insertBefore);
          }
          this._dropInsertBeforeEl = insertBefore;
        }
      }
    }
  }

  static _onDragEnd(e) {
    const ctx = this._ctx;
    const img = ctx?.getSelectedImg();
    if (!img || !ctx) return;

    this._drop?.clearDropTargetHighlight();
    this._drop?.hideDropGap();

    // An ignored gesture (flex-row or media-span fill image) never selected
    // or moved anything — skip markdown sync entirely.
    if (this._dragIgnored) {
      this._clearDragState();
      return;
    }

    // A pointer click still produces interact.js drag events. It should
    // only select the image, not rewrite its markdown or positioning.
    if (!this._dragMoved) {
      this._clearDragState();
      return;
    }

    const fromArea = this._dragSourceArea;
    const toArea = this._drop?.targetArea;
    const targetAreaEl = this._drop?.dropTargetAreaEl;

    const currentAreaEl = img?.closest?.(".slide__area");
    const isCrossArea = fromArea && toArea && fromArea !== toArea;

    if (isCrossArea && targetAreaEl) {
      // For cross-area drops, compute the slot relative to the target
      // area's children (the image is still in the source area's DOM).
      const crossSlot = this._dropInsertBeforeEl
        ? this._dropInsertBeforeEl
        : ctx.findInsertBeforeSlot(targetAreaEl, null, e.clientY);

      const movedSrc = img?.dataset?.originalSrc || img?.getAttribute("src") || "";

      if (crossSlot && crossSlot.parentNode === targetAreaEl) {
        targetAreaEl.insertBefore(img, crossSlot);
      } else {
        targetAreaEl.appendChild(img);
      }
      // Only reset position for non-freeflow images
      if (!ImageInteractionHandler.isFreeflow(img)) {
        img.style.left = "0px";
        img.style.top = "0px";
      }
      // Reset positions of remaining non-freeflow images in the source area
      // so old top/left values from previous fit-to-column or manual positioning
      // don't create flow gaps after the area's content changed.
      const sourceAreaEl =
        currentAreaEl || document.querySelector(`.slide__area[data-area-name="${fromArea}"]`);
      if (sourceAreaEl) {
        sourceAreaEl.querySelectorAll("img").forEach((sibling) => {
          if (sibling !== img && !ImageInteractionHandler.isFreeflow(sibling)) {
            sibling.style.left = "0px";
            sibling.style.top = "0px";
          }
        });
      }
      requestAnimationFrame(() => ctx.updateOverlay());

      const newMd = ctx.buildMoveMarkdownAtPosition(img, fromArea, toArea, crossSlot);
      if (newMd) {
        ctx.onMoveArea?.(newMd);

        const targetName = toArea;
        setTimeout(() => {
          if (!movedSrc) return;
          const imgs = this._container?.querySelectorAll(
            `.slide__area[data-area-name="${targetName}"] img`,
          );
          const match = Array.from(imgs || []).find((el) => {
            const elSrc = el.dataset.originalSrc || el.getAttribute("src") || "";
            return elSrc === movedSrc;
          });
          if (match) ctx.select(match);
        }, CROSS_AREA_RESELECT_MS);
      }
    } else {
      // Within-area: free-flow just syncs position, normal images reorder
      if (ImageInteractionHandler.isFreeflow(img)) {
        ctx.syncToMarkdown();
      } else {
        const currentSlot = currentAreaEl
          ? ctx.findInsertBeforeSlot(currentAreaEl, img, e.clientY)
          : null;

        if (currentSlot !== this._dragStartInsertBefore) {
          ctx.reorderImageInMarkdown(img, currentSlot);
        } else {
          ctx.syncToMarkdown();
        }
      }
      if (img?.isConnected) {
        ctx.select(img);
      }
    }

    this._clearDragState();
  }

  static _clearDragState() {
    this._dragSourceArea = null;
    this._dragSnapped = false;
    this._dragStartInsertBefore = null;
    this._dropInsertBeforeEl = null;
    this._dragMoved = false;
    this._dragPrepared = false;
    this._dragIgnored = false;
    this._dragStartImgRect = null;
    this._drop?.clearDragState();
  }

  /**
   * Counteract the layout shift caused by switching an image to
   * position:relative + .img-positioned (or just position:relative for
   * fill images). The conversion changes the surrounding flex/block
   * layout and the image size (100%/100% → explicit px), which would
   * otherwise make the picture jump. Adds the shift delta to the
   * existing left/top so the image stays visually in place.
   * @param {HTMLElement} img - The image element, already converted.
   * @param {DOMRect|null} startRect - Pre-conversion rect; falls back to
   *   this._dragStartImgRect. Null-safe: no-op if no rect is available.
   */
  static _compensateLayoutShift(img, startRect = null) {
    const rect = startRect || this._dragStartImgRect;
    if (!rect || !img) return;
    const scale = getStageScale();
    const newRect = img.getBoundingClientRect();
    const curLeft = parseFloat(img.style.left) || 0;
    const curTop = parseFloat(img.style.top) || 0;
    img.style.left = `${curLeft + (rect.left - newRect.left) / scale}px`;
    img.style.top = `${curTop + (rect.top - newRect.top) / scale}px`;
  }

  // ── Resize (manual mouse events on overlay handles) ─────────────────────

  static _setupResizeHandles() {
    const ctx = this._ctx;
    const overlay = ctx?.getOverlay();
    if (!overlay) return;

    overlay.addEventListener("mousedown", (e) => {
      const handle = e.target.closest("[data-edge]");
      if (!handle) return;

      e.preventDefault();
      e.stopPropagation();

      const img = ctx.getSelectedImg();
      if (!img) return;
      // A resize handle on a full-bleed fill image takes it out of fill mode
      // (the fill CSS only matches :not([style*="position"])), so give it an
      // inline position first; otherwise the forced fill geometry would hide
      // the new size. Only do this for actual fill images — setting
      // position:relative on a plain markdown image that was never dragged
      // would switch its paragraph from flex-centred to block layout (via
      // the CSS p:has(> img[style*="position: relative"]) selector) and
      // cause a visual jump. For fill images, capture the pre-conversion
      // rect and compensate the layout shift so the resize starts from the
      // image's current visual position instead of jumping.
      if (isMediaSpanFillImage(img)) {
        const fillStartRect = img.getBoundingClientRect();
        img.style.position = "relative";
        this._compensateLayoutShift(img, fillStartRect);
      }

      this._resizeState = {
        edge: handle.dataset.edge,
        startX: e.clientX,
        startY: e.clientY,
        startLeft: parseFloat(img.style.left) || 0,
        startTop: parseFloat(img.style.top) || 0,
        startW: img.offsetWidth,
        startH: img.offsetHeight,
        ratio: img.offsetWidth / (img.offsetHeight || 1),
        shiftHeld: e.shiftKey,
      };

      const onMove = (ev) => {
        const s = this._resizeState;
        if (!s) return;

        const dx = ev.clientX - s.startX;
        const dy = ev.clientY - s.startY;
        const scale = getStageScale();

        const sdx = dx / scale;
        const sdy = dy / scale;

        let newLeft = s.startLeft;
        let newTop = s.startTop;
        let newW = s.startW;
        let newH = s.startH;

        const isCorner = s.edge.length > CORNER_EDGE_LEN_THRESHOLD;
        const lockRatio = ctx.isAspectLocked() || (ev.shiftKey && isCorner);

        if (s.edge.includes("right")) newW = Math.max(MIN_RESIZE_DIM, s.startW + sdx);
        if (s.edge.includes("left")) {
          newW = Math.max(MIN_RESIZE_DIM, s.startW - sdx);
          newLeft = s.startLeft + s.startW - newW;
        }
        if (s.edge.includes("bottom")) newH = Math.max(MIN_RESIZE_DIM, s.startH + sdy);
        if (s.edge.includes("top")) {
          newH = Math.max(MIN_RESIZE_DIM, s.startH - sdy);
          newTop = s.startTop + s.startH - newH;
        }

        if (lockRatio && s.startH) {
          if (isCorner) {
            if (Math.abs(sdx) >= Math.abs(sdy)) {
              newH = newW / s.ratio;
            } else {
              newW = newH * s.ratio;
            }
            if (s.edge.includes("left")) newLeft = s.startLeft + s.startW - newW;
            if (s.edge.includes("top")) newTop = s.startTop + s.startH - newH;
          } else if (s.edge === "left" || s.edge === "right") {
            newH = newW / s.ratio;
          } else if (s.edge === "top" || s.edge === "bottom") {
            newW = newH * s.ratio;
          }
        }

        img.style.left = `${Math.max(0, newLeft)}px`;
        img.style.top = `${newTop}px`;
        img.style.width = `${newW}px`;
        img.style.height = `${newH}px`;

        ctx.updateOverlay();
        ImagePropertiesPanel._syncUI(readImageSettings(img));
      };

      const onUp = () => {
        this._resizeState = null;
        ctx.syncToMarkdown();
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }
}
