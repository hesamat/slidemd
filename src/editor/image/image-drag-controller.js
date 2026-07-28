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
import { readImageSettings } from "./image-markdown-utils.js";

const MIN_RESIZE_DIM = 50;
const CROSS_AREA_RESELECT_MS = 400;
const CORNER_EDGE_LEN_THRESHOLD = 4;
const DROP_GAP_HEIGHT = 40;
const DROP_GAP_MARGIN = 4;
const DROP_GAP_RADIUS = 8;

export class ImageDragController {
  static _dropIndicator = null;
  static _dragSourceArea = null;
  static _dragTargetArea = null;
  static _dragStartX = 0;
  static _dragStartY = 0;
  static _dragSnapped = false;
  static _dragStartInsertBefore = null;
  static _dropInsertBeforeEl = null;
  static _dropTargetAreaEl = null;
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

    interact(".slide__area img", { context: container }).draggable({
      style: false,
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
    this._clearDragState();
    this._resizeState = null;
  }

  static _onDragStart(e) {
    const img = e.target.closest("img");
    const ctx = this._ctx;
    if (!img || !ctx) return;
    if (img.closest(".flex-row")) return;

    if (ctx.getSelectedImg() && !ctx.getSelectedImg().isConnected) {
      this._selectedImg = null;
    }

    if (!img.style.position) {
      ctx.prepareMdImgForDrag(img);
      img.classList.add("img-positioned");
    }
    ctx.select(img);
    ImagePropertiesPanel.hide();
    const sourceArea = img.closest(".slide__area");
    this._dragSourceArea = sourceArea?.dataset.areaName || null;
    this._dragTargetArea = null;
    this._dragStartX = e.clientX;
    this._dragStartY = e.clientY;
    this._dragSnapped = false;

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

    const isFreeflow = ImageInteractionHandler.isFreeflow(img);
    this._updateDragTarget(e.clientX, e.clientY);

    const targetArea = this._dragTargetArea;
    const sourceArea = this._dragSourceArea;
    const isCrossArea = targetArea && sourceArea && targetArea !== sourceArea;

    // Cross-area highlight only for non-freeflow images
    if (isCrossArea && !isFreeflow) {
      const targetAreaEl = this._container?.querySelector(
        `.slide__area[data-area-name="${targetArea}"]`,
      );
      if (targetAreaEl) {
        this._highlightDropTarget(targetAreaEl);
        this._dropTargetAreaEl = targetAreaEl;
      }
    } else if (!isCrossArea && this._dropTargetAreaEl) {
      this._clearDropTargetHighlight();
      this._dropTargetAreaEl = null;
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
            this._showDropGap(areaEl, insertBefore);
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

    this._clearDropTargetHighlight();
    this._hideDropGap();

    const fromArea = this._dragSourceArea;
    const toArea = this._dragTargetArea;
    const targetAreaEl = this._dropTargetAreaEl;

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
    this._dragTargetArea = null;
    this._dragSnapped = false;
    this._dragStartInsertBefore = null;
    this._dropInsertBeforeEl = null;
    this._dropTargetAreaEl = null;
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

  // ── Drop gap management ─────────────────────────────────────────────────

  static _highlightDropTarget(areaEl) {
    if (this._dropTargetAreaEl && this._dropTargetAreaEl !== areaEl) {
      this._dropTargetAreaEl.classList.remove("slide__area--drop-target");
    }
    areaEl.classList.add("slide__area--drop-target");
  }

  static _showDropGap(areaEl, insertBeforeEl) {
    let gap = this._dropIndicator;
    if (!gap) {
      const newGap = document.createElement("div");
      newGap.className = "image-drop-indicator";
      newGap.style.height = `${DROP_GAP_HEIGHT}px`;
      newGap.style.minHeight = `${DROP_GAP_HEIGHT}px`;
      newGap.style.margin = `${DROP_GAP_MARGIN}px 0`;
      newGap.style.borderRadius = `${DROP_GAP_RADIUS}px`;
      newGap.style.border = "2px dashed rgba(2, 132, 199, 0.4)";
      newGap.style.background = "rgba(2, 132, 199, 0.06)";
      newGap.style.pointerEvents = "none";
      newGap.style.flexShrink = "0";
      areaEl.appendChild(newGap);
      this._dropIndicator = newGap;
    }

    if (insertBeforeEl) {
      areaEl.insertBefore(gap, insertBeforeEl);
    } else {
      areaEl.appendChild(gap);
    }
  }

  static _hideDropGap() {
    if (this._dropIndicator) {
      this._dropIndicator.remove();
      this._dropIndicator = null;
    }
  }

  // ── Drag target tracking ────────────────────────────────────────────────

  static _updateDragTarget(clientX, clientY) {
    const img = this._ctx?.getSelectedImg();
    if (img) img.style.pointerEvents = "none";
    const el = document.elementFromPoint(clientX, clientY);
    if (img) img.style.pointerEvents = "";
    const area = el?.closest?.(".slide__area");
    const rawName = area?.dataset.areaName || null;
    const REJECTED_AREAS = ["header", "footer"];
    const targetName = rawName && !REJECTED_AREAS.includes(rawName) ? rawName : null;

    if (targetName !== this._dragTargetArea) {
      this._clearDropTargetHighlight();
      this._dragTargetArea = targetName;
      if (area && targetName !== this._dragSourceArea) {
        area.classList.add("slide__area--drop-target");
      }
    }
  }

  static _clearDropTargetHighlight() {
    if (!this._container) return;
    this._container
      .querySelectorAll(".slide__area--drop-target")
      .forEach((el) => el.classList.remove("slide__area--drop-target"));
  }
}
