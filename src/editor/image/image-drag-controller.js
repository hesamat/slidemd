/**
 * ImageDragController
 *
 * Drag-and-drop repositioning and resize handles for images in edit mode.
 * Extends BlockDragController, which owns the shared drag lifecycle, and
 * adds image-specific behavior: markdown-image preparation, layout-shift
 * compensation, freeflow positioning, and overlay resize handles.
 *
 * All mutable drag/resize state lives here, not in ImageInteractionHandler.
 * The handler injects callbacks via a context object.
 */
import { ImagePropertiesPanel } from "./image-properties-panel.js";
import { ImageInteractionHandler } from "./image-interaction-handler.js";
import { getStageScale } from "./image-position-presets.js";
import { readImageSettings, isMediaSpanFillImage } from "./image-markdown-utils.js";
import { BlockDragController } from "../core/block-drag-controller.js";

const MIN_RESIZE_DIM = 50;
const CROSS_AREA_RESELECT_MS = 400;
const CORNER_EDGE_LEN_THRESHOLD = 4;

export class ImageDragController extends BlockDragController {
  // Image-specific drag state
  static _dragPrepared = false;
  static _dragStartImgRect = null;
  static _resizeState = null;

  static get _selector() {
    return ".slide__area img";
  }

  static get _indicatorClassName() {
    return "image-drop-indicator";
  }

  static get _suppressesTextSelection() {
    return false;
  }

  static _getSelected() {
    return this._ctx?.getSelectedImg?.() ?? null;
  }

  static _getDragElement(e) {
    const img = e.target.closest("img");
    if (!img) return null;
    // Editor chrome and slide warnings contain <img> icons; don't drag them.
    if (img.closest(".editor-area-label, .editor-slide-warning")) return null;
    return img;
  }

  static _shouldIgnore(img) {
    // Flex-row images from PPTX import are not draggable.
    return !!img.closest(".flex-row");
  }

  static _onBeforeDragStart(_img) {
    // Hide panel after select so the drag starts with the panel closed.
  }

  static _onAfterDragStart(img) {
    ImagePropertiesPanel.hide();
    this._dragPrepared = false;
    this._dragStartImgRect = img.getBoundingClientRect();
  }

  static _onDragMoveUpdate(img, e) {
    const ctx = this._ctx;
    if (!ctx) return;

    // interact.js emits dragstart on pointer-down. Do not convert a
    // markdown image until the pointer has actually moved; changing its
    // positioning mode during a plain click changes the surrounding flex
    // layout and makes the image jump.
    if (!this._dragPrepared && !img.style.position) {
      ctx.prepareMdImgForDrag(img);
      img.classList.add("img-positioned");
      this._compensateLayoutShift(img);
      this._dragPrepared = true;
    }

    const scale = getStageScale();
    const curStyleLeft = parseFloat(img.style.left) || 0;
    const curStyleTop = parseFloat(img.style.top) || 0;
    img.style.left = `${curStyleLeft + e.dx / scale}px`;
    img.style.top = `${curStyleTop + e.dy / scale}px`;

    ctx.updateOverlay();
  }

  static _shouldHighlightCrossAreaTarget(img, _fromArea, _toArea) {
    // Freeflow images stay visually under the cursor; don't highlight target.
    return !ImageInteractionHandler.isFreeflow(img);
  }

  static _shouldShowReorderGap(img) {
    // Freeflow images are positioned absolutely; they don't participate in
    // the flow, so a reorder gap would be spurious.
    return !ImageInteractionHandler.isFreeflow(img);
  }

  static _onClearDragState() {
    this._dragPrepared = false;
    this._dragStartImgRect = null;
    this._resizeState = null;
  }

  static _onAfterDragEnd(_img) {
    // Nothing to restore for images; the DOM and markdown sync handled it.
  }

  static activate(container, ctx) {
    super.activate(container, ctx);
    this._setupResizeHandles();
  }

  static _onCrossAreaDrop(img, fromArea, toArea, targetAreaEl, insertBeforeEl, _e) {
    const ctx = this._ctx;
    if (!ctx) return false;

    if (insertBeforeEl && insertBeforeEl.parentNode === targetAreaEl) {
      targetAreaEl.insertBefore(img, insertBeforeEl);
    } else {
      targetAreaEl.appendChild(img);
    }

    // Reset position for non-freeflow images.
    if (!ImageInteractionHandler.isFreeflow(img)) {
      img.style.left = "0px";
      img.style.top = "0px";
    }

    // Reset positions of remaining non-freeflow images in the source area
    // so old top/left values from previous positioning don't create flow gaps.
    const sourceAreaEl =
      img.closest(".slide__area") ||
      this._container?.querySelector(`.slide__area[data-area-name="${fromArea}"]`);
    if (sourceAreaEl) {
      sourceAreaEl.querySelectorAll("img").forEach((sibling) => {
        if (sibling !== img && !ImageInteractionHandler.isFreeflow(sibling)) {
          sibling.style.left = "0px";
          sibling.style.top = "0px";
        }
      });
    }
    requestAnimationFrame(() => ctx.updateOverlay());

    const newMd = ctx.buildMoveMarkdownAtPosition(img, fromArea, toArea, insertBeforeEl);
    if (!newMd) return false;

    ctx.onMoveArea?.(newMd);

    // Reselect the moved image after the preview re-renders.
    const movedSrc = img.dataset.originalSrc || img.getAttribute("src") || "";
    if (movedSrc) {
      setTimeout(() => {
        const imgs = this._container?.querySelectorAll(
          `.slide__area[data-area-name="${toArea}"] img`,
        );
        const match = Array.from(imgs || []).find((el) => {
          const elSrc = el.dataset.originalSrc || el.getAttribute("src") || "";
          return elSrc === movedSrc;
        });
        if (match) ctx.select(match);
      }, CROSS_AREA_RESELECT_MS);
    }
    return true;
  }

  static _onSameAreaReorder(img, targetEl) {
    const ctx = this._ctx;
    if (!ctx) return false;

    if (ImageInteractionHandler.isFreeflow(img)) {
      ctx.syncToMarkdown();
    } else if (targetEl !== this._dragStartInsertBefore) {
      ctx.reorderImageInMarkdown(img, targetEl);
    } else {
      ctx.syncToMarkdown();
    }

    if (img?.isConnected) {
      ctx.select(img);
    }
    return true;
  }

  /**
   * Counteract the layout shift caused by switching an image to
   * position:relative + .img-positioned. Adds the shift delta to the
   * existing left/top so the image stays visually in place.
   * @param {HTMLElement} img
   * @param {DOMRect|null} startRect
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

  /**
   * Set up mousedown listeners on the overlay resize handles.
   * Called after the overlay is created and the context is available.
   */
  static _setupResizeHandles() {
    const ctx = this._ctx;
    const overlay = ctx?.getOverlay?.();
    if (!overlay) return;

    overlay.addEventListener("mousedown", (e) => {
      const handle = e.target.closest("[data-edge]");
      if (!handle) return;

      e.preventDefault();
      e.stopPropagation();

      const img = ctx.getSelected?.();
      if (!img) return;

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
        const lockRatio = (ctx.isAspectLocked?.() ?? false) || (ev.shiftKey && isCorner);

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

        ctx.updateOverlay?.();
        ImagePropertiesPanel._syncUI(readImageSettings(img));
      };

      const onUp = () => {
        this._resizeState = null;
        ctx.syncToMarkdown?.();
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }
}
