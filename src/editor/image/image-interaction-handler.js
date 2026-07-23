/**
 * ImageInteractionHandler
 *
 * Drag-and-drop repositioning and resize handles for images in edit mode.
 * Works directly on <img> elements with a selection overlay.
 * No wrappers — the overlay tracks the image's position/size.
 */
import interact from "interactjs";
import { ImagePropertiesPanel } from "./image-properties-panel.js";

export class ImageInteractionHandler {
  static _initialized = false;
  static _selectedImg = null;
  static _slideContainer = null;
  static _getMarkdown = null;
  static _setMarkdown = null;
  static _onDelete = null;
  static _onMoveArea = null;
  static _overlay = null;
  static _resizeState = null;
  static _pendingSelectSrc = null;
  static _aspectLocked = true;
  static _dragSourceArea = null;
  static _dragTargetArea = null;
  static _dragStartX = 0;
  static _dragStartY = 0;
  static _dragSnapped = false;
  static _dropInsertBeforeEl = null;
  static _dragStartInsertBefore = null;
  static _dropTargetAreaEl = null;

  static init(getMarkdown, setMarkdown, { onDelete, onMoveArea } = {}) {
    if (this._initialized) return;
    this._initialized = true;
    this._getMarkdown = getMarkdown;
    this._setMarkdown = setMarkdown;
    this._onDelete = onDelete || null;
    this._onMoveArea = onMoveArea || null;

    document.addEventListener("mousedown", (e) => {
      if (
        this._selectedImg &&
        !e.target.closest(".image-overlay") &&
        !e.target.closest("img") &&
        !e.target.closest(".image-properties-panel")
      ) {
        // If _selectedImg was removed by a preview re-render, clear the
        // stale reference so the next image click can start fresh.
        if (!this._selectedImg.isConnected) {
          this._selectedImg = null;
          if (this._overlay) this._overlay.style.display = "none";
          ImagePropertiesPanel.hide();
          return;
        }
        this.deselect();
      }
    });
  }

  static activate(slideContainer) {
    this._slideContainer = slideContainer;
    this._createOverlay(slideContainer);
    this._setupDraggable(slideContainer);
    this._setupResizeHandles();

    // If an image was already selected (e.g., clicked before activate ran),
    // position the overlay on it now that the overlay exists.
    if (this._selectedImg) {
      this._updateOverlay();
    }
  }

  static deactivate() {
    this.deselect();
    if (this._slideContainer) {
      interact(".slide__area img", { context: this._slideContainer }).draggable(false);
    }
    this._removeOverlay();
    this._slideContainer = null;
  }

  // ── Overlay ─────────────────────────────────────────────────────────────

  static _createOverlay(container) {
    this._removeOverlay();
    const overlay = document.createElement("div");
    overlay.className = "image-overlay";
    overlay.innerHTML = `
            <div class="oh-l" data-edge="left"></div>
            <div class="oh-r" data-edge="right"></div>
            <div class="oh-t" data-edge="top"></div>
            <div class="oh-b" data-edge="bottom"></div>
            <div class="oh-tl" data-edge="top-left"></div>
            <div class="oh-tr" data-edge="top-right"></div>
            <div class="oh-bl" data-edge="bottom-left"></div>
            <div class="oh-br" data-edge="bottom-right"></div>
        `;
    overlay.style.display = "none";
    container.appendChild(overlay);
    this._overlay = overlay;
  }

  static _removeOverlay() {
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
  }

  static _updateOverlay() {
    const img = this._selectedImg;
    const overlay = this._overlay;
    const grid = this._slideContainer;
    if (!img || !overlay || !grid) return;

    const imgRect = img.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const scale = this._getStageScale();

    const left = (imgRect.left - gridRect.left) / scale;
    const top = (imgRect.top - gridRect.top) / scale;
    const w = imgRect.width / scale;
    const h = imgRect.height / scale;

    overlay.style.display = "block";
    overlay.style.left = `${left - 2}px`;
    overlay.style.top = `${top - 2}px`;
    overlay.style.width = `${w + 4}px`;
    overlay.style.height = `${h + 4}px`;
  }

  // ── Selection ───────────────────────────────────────────────────────────

  static select(img) {
    if (this._selectedImg === img) {
      this._updateOverlay();
      ImagePropertiesPanel.show(img, this._readSettings(img));
      return;
    }
    // If _selectedImg is stale (removed by a re-render), force a clean
    // deselect before selecting the new image.
    if (this._selectedImg && !this._selectedImg.isConnected) {
      this._selectedImg = null;
      if (this._overlay) this._overlay.style.display = "none";
    } else {
      this.deselect();
    }

    // If this is a markdown image (no position style), convert to HTML
    // in the markdown source and apply styles to the existing DOM element.
    // Existing HTML <img> tags (from PPTX import) already have correct
    // dimensions and position — skip conversion to avoid layout shift.
    const isExistingHtmlImg =
      img.getAttribute("width") && img.getAttribute("height") && !img.style.position;
    if (!img.style.position && !isExistingHtmlImg) {
      this._convertMdImgToHtml(img);
      img.classList.add("img-positioned");
    }

    this._selectedImg = img;
    img.classList.add("image-selected");
    this._updateOverlay();
    ImagePropertiesPanel.show(img, this._readSettings(img));
  }

  static deselect() {
    if (this._selectedImg) {
      // If the element was removed by a preview re-render, skip
      // classList removal to avoid errors on orphaned nodes.
      if (this._selectedImg.isConnected) {
        this._selectedImg.classList.remove("image-selected");
        this._selectedImg.classList.remove("img-positioned");
      }
      this._selectedImg = null;
    }
    if (this._overlay) {
      this._overlay.style.display = "none";
    }
    ImagePropertiesPanel.hide();
  }

  static isSelected() {
    return !!this._selectedImg;
  }

  // ── Drag (via interact.js on the grid container) ─────────────────────────

  static _setupDraggable(container) {
    interact(".slide__area img", { context: container }).draggable({
      listeners: {
        start: (e) => {
          const img = e.target.closest("img");
          if (img) {
            // If _selectedImg is stale (removed by a preview re-render),
            // clear it so select() can start fresh with the new element.
            if (this._selectedImg && !this._selectedImg.isConnected) {
              this._selectedImg = null;
            }

            // For markdown-rendered images (no position style yet), apply
            // the positioning styles directly to the DOM element BEFORE
            // calling select().  This lets select() see that the image is
            // already an "HTML" image and skip _convertMdImgToHtml(), which
            // would write markdown mid-drag and disrupt the interact.js
            // session.  The markdown write is deferred to _syncToMarkdown()
            // at drag end.
            if (!img.style.position) {
              this._prepareMdImgForDrag(img);
              img.classList.add("img-positioned");
            }
            this.select(img);
            // Hide properties panel during drag — it would be in the wrong
            // position and add visual clutter while the image is moving.
            ImagePropertiesPanel.hide();
            const sourceArea = img.closest(".slide__area");
            this._dragSourceArea = sourceArea?.dataset.areaName || null;
            this._dragTargetArea = null;
            this._dragStartX = e.clientX;
            this._dragStartY = e.clientY;
            this._dragSnapped = false;

            // Track which element the image is currently before (its "slot")
            const areaEl = img.closest(".slide__area");
            if (areaEl) {
              const allElements = [...areaEl.children].filter(
                (el) => el !== img && !el.classList.contains("image-drop-indicator"),
              );
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
        },
        move: (e) => {
          const img = this._selectedImg;
          if (!img) return;

          // Detect which area the cursor is over
          this._updateDragTarget(e.clientX, e.clientY);

          const targetArea = this._dragTargetArea;
          const sourceArea = this._dragSourceArea;
          const isCrossArea = targetArea && sourceArea && targetArea !== sourceArea;

          if (isCrossArea) {
            // Show gap in the target area at cursor position
            const targetAreaEl = container.querySelector(
              `.slide__area[data-area-name="${targetArea}"]`,
            );
            if (targetAreaEl) {
              // Find which element to insert before in the target area
              const allElements = [...targetAreaEl.children].filter(
                (el) => !el.classList.contains("image-drop-indicator"),
              );

              let insertBefore = null;
              const cursorY = e.clientY;
              for (const el of allElements) {
                const rect = el.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (cursorY < midY) {
                  insertBefore = el;
                  break;
                }
              }

              this._showDropGap(targetAreaEl, insertBefore);
              this._dropInsertBeforeEl = insertBefore;
              this._dropTargetAreaEl = targetAreaEl;
            }
          } else if (!isCrossArea && this._dropTargetAreaEl) {
            // Moved back to source area — clear the gap
            this._hideDropGap();
            this._dropTargetAreaEl = null;
          }

          // Within-area reorder: move image visually and track drop slot
          const scale = this._getStageScale();
          const dDesignX = e.dx / scale;
          const dDesignY = e.dy / scale;

          const curStyleLeft = parseFloat(img.style.left) || 0;
          const curStyleTop = parseFloat(img.style.top) || 0;

          img.style.left = `${curStyleLeft + dDesignX}px`;
          img.style.top = `${curStyleTop + dDesignY}px`;

          this._updateOverlay();

          // If still in source area, track slot for within-area reorder
          if (!isCrossArea) {
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

                this._showDropGap(areaEl, insertBefore);
                this._dropInsertBeforeEl = insertBefore;
              }
            }
          }
        },
        end: () => {
          this._clearDropTargetHighlight();

          const img = this._selectedImg;
          const fromArea = this._dragSourceArea;
          const toArea = this._dragTargetArea;
          const targetAreaEl = this._dropTargetAreaEl;
          const insertBeforeEl = this._dropInsertBeforeEl;
          const isCrossArea = fromArea && toArea && fromArea !== toArea;

          if (isCrossArea && targetAreaEl) {
            // Cross-area drop: move image in DOM, then update markdown
            const movedSrc = img?.dataset?.originalSrc || img?.getAttribute("src") || "";

            if (insertBeforeEl && insertBeforeEl.parentNode === targetAreaEl) {
              targetAreaEl.insertBefore(img, insertBeforeEl);
            } else {
              targetAreaEl.appendChild(img);
            }
            img.style.left = "0px";
            img.style.top = "0px";
            this._updateOverlay();
            this._hideDropGap();

            // Build markdown with image inserted at the target position
            const newMd = this._buildMoveMarkdownAtPosition(img, fromArea, toArea, insertBeforeEl);
            if (newMd) {
              if (this._onMoveArea) {
                this._onMoveArea(newMd);
              } else {
                this._setMarkdown?.(newMd);
              }
              // Re-select the moved image by src after re-render
              const targetName = toArea;
              setTimeout(() => {
                if (!movedSrc) return;
                const imgs = this._slideContainer?.querySelectorAll(
                  `.slide__area[data-area-name="${targetName}"] img`,
                );
                const match = Array.from(imgs || []).find((el) => {
                  const elSrc = el.dataset.originalSrc || el.getAttribute("src") || "";
                  return elSrc === movedSrc;
                });
                if (match) this.select(match);
              }, 400);
            }
          } else if (insertBeforeEl !== undefined) {
            // Within-area: check if the image actually moved to a different slot
            this._hideDropGap();

            // Compare current slot to the slot at drag start
            if (insertBeforeEl !== this._dragStartInsertBefore) {
              // Image moved to a different slot — reorder + snap
              this._reorderImageInMarkdown(img, insertBeforeEl);
            } else {
              // Image stayed in the same slot — free positioning
              this._syncToMarkdown();
              if (img?.isConnected) {
                this.select(img);
              }
            }
          } else {
            // No drop indicator — free positioning
            this._hideDropGap();
            this._syncToMarkdown();
            if (img?.isConnected) {
              this.select(img);
            }
          }

          this._dragSourceArea = null;
          this._dragTargetArea = null;
          this._dragSnapped = false;
          this._dragStartInsertBefore = null;
          this._dropInsertBeforeEl = null;
          this._dropTargetAreaEl = null;
        },
      },
    });
  }

  /**
   * Build the updated markdown for a cross-area image move.
   * Finds the image by src within the source area's content range
   * (not by DOM index, which can mismatch markdown order).
   */
  static _buildMoveMarkdown(img, fromAreaName, toAreaName) {
    const md = this._getMarkdown?.();
    if (!md) return null;

    const src = img.dataset.originalSrc || img.getAttribute("src") || "";

    // Find the image entry within the source area
    const entries = this._findAllImages(md);
    const sourceRange = this._getAreaContentRange(md, fromAreaName);
    const entry = entries.find(
      (e) => e.src === src && e.start >= sourceRange.from && e.start < sourceRange.to,
    );
    if (!entry) return null;

    // Remove from source
    const withoutImage = md.slice(0, entry.start) + md.slice(entry.end);

    // Build a fresh <img> tag at origin (CSS centers it in the area)
    const alt = img.getAttribute("alt") ?? entry.fullTag.match(/alt=["']([^"']*)["']/i)?.[1] ?? "";
    const w = Math.round(parseFloat(img.style.width) || img.offsetWidth || 480);
    const h = Math.round(parseFloat(img.style.height) || img.offsetHeight || 0);
    const styleParts = [
      "position: relative",
      "left: 0px",
      "top: 0px",
      `width: ${w}px`,
      h ? `height: ${h}px` : "",
      "border: none",
      "object-fit: contain",
      "cursor: move",
    ];
    const newTag = `<img src="${src}" alt="${alt}" style="${styleParts.filter(Boolean).join("; ")}" />`;

    let updated = withoutImage.replace(/\n{3,}/g, "\n\n");
    const targetRange = this._getAreaContentRange(updated, toAreaName);
    const insertAt = targetRange.to;
    const before = updated.slice(0, insertAt);
    const after = updated.slice(insertAt);
    const needsNewline = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
    return before + needsNewline + newTag + "\n" + after;
  }

  /**
   * Build updated markdown for a cross-area image move, inserting at a
   * specific position within the target area.
   */
  static _buildMoveMarkdownAtPosition(img, fromAreaName, toAreaName, insertBeforeEl) {
    const md = this._getMarkdown?.();
    if (!md) return null;

    const src = img.dataset.originalSrc || img.getAttribute("src") || "";

    // Find the image entry within the source area
    const entries = this._findAllImages(md);
    const sourceRange = this._getAreaContentRange(md, fromAreaName);
    const entry = entries.find(
      (e) => e.src === src && e.start >= sourceRange.from && e.start < sourceRange.to,
    );
    if (!entry) return null;

    // Remove from source
    let updated = md.slice(0, entry.start) + md.slice(entry.end);
    updated = updated.replace(/\n{3,}/g, "\n\n");

    // Build a fresh <img> tag
    const alt = img.getAttribute("alt") ?? entry.fullTag.match(/alt=["']([^"']*)["']/i)?.[1] ?? "";
    const w = Math.round(parseFloat(img.style.width) || img.offsetWidth || 480);
    const h = Math.round(parseFloat(img.style.height) || img.offsetHeight || 0);
    const styleParts = [
      "position: relative",
      "left: 0px",
      "top: 0px",
      `width: ${w}px`,
      h ? `height: ${h}px` : "",
      "border: none",
      "object-fit: contain",
      "cursor: move",
    ];
    const newTag = `<img src="${src}" alt="${alt}" style="${styleParts.filter(Boolean).join("; ")}" />`;

    // Find insert position in target area
    const targetRange = this._getAreaContentRange(updated, toAreaName);
    let insertAt = targetRange.to; // default: end of area

    if (insertBeforeEl) {
      // Find the markdown position of the target element
      const targetMdPos = this._findElementMarkdownPosition(updated, insertBeforeEl);
      if (targetMdPos >= targetRange.from && targetMdPos <= targetRange.to) {
        insertAt = targetMdPos;
      }
    }

    const before = updated.slice(0, insertAt);
    const after = updated.slice(insertAt);
    const needsNewline = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
    return before + needsNewline + newTag + "\n" + after;
  }

  // ── Resize (manual mouse events on overlay handles) ─────────────────────

  static _setupResizeHandles() {
    const overlay = this._overlay;
    if (!overlay) return;

    overlay.addEventListener("mousedown", (e) => {
      const handle = e.target.closest("[data-edge]");
      if (!handle) return;

      e.preventDefault();
      e.stopPropagation();

      const img = this._selectedImg;
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
        const scale = this._getStageScale();

        const sdx = dx / scale;
        const sdy = dy / scale;

        let newLeft = s.startLeft;
        let newTop = s.startTop;
        let newW = s.startW;
        let newH = s.startH;

        const isCorner = s.edge.length > 4; // top-left, top-right, etc.
        const lockRatio = this._aspectLocked || (ev.shiftKey && isCorner);

        if (s.edge.includes("right")) newW = Math.max(50, s.startW + sdx);
        if (s.edge.includes("left")) {
          newW = Math.max(50, s.startW - sdx);
          newLeft = s.startLeft + s.startW - newW;
        }
        if (s.edge.includes("bottom")) newH = Math.max(50, s.startH + sdy);
        if (s.edge.includes("top")) {
          newH = Math.max(50, s.startH - sdy);
          newTop = s.startTop + s.startH - newH;
        }

        // Aspect-ratio lock: derive the unfixed dimension from the fixed one.
        // For corner drags we let the dominant axis (the one with the larger
        // mouse delta) drive; for edge drags we adjust the cross axis.
        if (lockRatio && s.startH) {
          if (isCorner) {
            if (Math.abs(sdx) >= Math.abs(sdy)) {
              newH = newW / s.ratio;
            } else {
              newW = newH * s.ratio;
            }
            // Re-anchor left/top for left/top edges after ratio adjust
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

        this._updateOverlay();
        ImagePropertiesPanel._syncUI(this._readSettings(img));
      };

      const onUp = () => {
        this._resizeState = null;
        this._syncToMarkdown();
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  static _getStageScale() {
    const stage = document.querySelector(".stage__inner");
    if (!stage) return 1;
    const transform = getComputedStyle(stage).transform;
    if (!transform || transform === "none") return 1;
    const match = transform.match(/matrix\(([^,]+),/);
    return match ? parseFloat(match[1]) : 1;
  }

  // ── Cross-area drag helpers ────────────────────────────────────────────────

  /**
   * Detect which .slide__area the cursor is over during a drag and
   * toggle the drop-target highlight class.
   */
  static _updateDragTarget(clientX, clientY) {
    const img = this._selectedImg;
    // Temporarily hide the dragged image so elementFromPoint hits the area below
    if (img) img.style.pointerEvents = "none";
    const el = document.elementFromPoint(clientX, clientY);
    if (img) img.style.pointerEvents = "";
    const area = el?.closest?.(".slide__area");
    const rawName = area?.dataset.areaName || null;
    // Only allow content columns as drop targets — reject header / footer
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

  /**
   * Remove the drop-target highlight from all areas.
   */
  static _clearDropTargetHighlight() {
    if (!this._slideContainer) return;
    this._slideContainer
      .querySelectorAll(".slide__area--drop-target")
      .forEach((el) => el.classList.remove("slide__area--drop-target"));
  }

  // ── Within-area reorder ────────────────────────────────────────────────────

  /**
   * Show a gap element in the area to indicate where the image will land.
   * @param {HTMLElement} areaEl
   * @param {HTMLElement|null} insertBeforeEl - Element to insert before, or null for end
   */
  static _showDropGap(areaEl, insertBeforeEl) {
    this._hideDropGap();

    const gap = document.createElement("div");
    gap.className = "image-drop-indicator";
    gap.style.height = "40px";
    gap.style.minHeight = "40px";
    gap.style.margin = "4px 0";
    gap.style.borderRadius = "8px";
    gap.style.border = "2px dashed rgba(2, 132, 199, 0.4)";
    gap.style.background = "rgba(2, 132, 199, 0.06)";
    gap.style.pointerEvents = "none";
    gap.style.flexShrink = "0";

    if (insertBeforeEl) {
      insertBeforeEl.parentNode.insertBefore(gap, insertBeforeEl);
    } else {
      areaEl.appendChild(gap);
    }

    this._dropIndicator = gap;
  }

  static _hideDropGap() {
    if (this._dropIndicator) {
      this._dropIndicator.remove();
      this._dropIndicator = null;
    }
  }

  /**
   * Reorder an image within its area by moving its tag in the markdown source.
   * The image snaps to its new position (left/top reset to 0).
   * @param {HTMLElement} img - The image being moved
   * @param {HTMLElement|null} targetEl - Element to insert before, or null for end
   */
  static _reorderImageInMarkdown(img, targetEl) {
    const md = this._getMarkdown?.();
    if (!md || !img) return;

    const entries = this._findAllImages(md);
    const draggedIdx = this._getImageIndex(img);
    if (draggedIdx < 0 || draggedIdx >= entries.length) return;

    const draggedEntry = entries[draggedIdx];

    // Find the markdown position of the target element
    let insertAt = -1;
    if (targetEl) {
      if (targetEl.tagName === "IMG") {
        // Target is another image - find its entry
        const targetIdx = this._getImageIndex(targetEl);
        if (targetIdx >= 0 && targetIdx < entries.length) {
          // Adjust if target was after dragged
          const adjustedIdx = targetIdx > draggedIdx ? targetIdx - 1 : targetIdx;
          if (adjustedIdx >= 0 && adjustedIdx < entries.length) {
            insertAt = entries[adjustedIdx].start;
            // Offset for the removed dragged entry
            if (entries[adjustedIdx].start > draggedEntry.start) {
              insertAt -= draggedEntry.fullTag.length;
            }
          }
        }
      } else {
        // Target is a text/code block - find its content in markdown
        insertAt = this._findElementMarkdownPosition(md, targetEl);
      }
    }

    // If target not found, insert at end of area
    if (insertAt < 0) {
      const area = img.closest(".slide__area");
      const areaName = area?.dataset.areaName || "main";
      const withoutImage = md.slice(0, draggedEntry.start) + md.slice(draggedEntry.end);
      const range = this._getAreaContentRange(withoutImage, areaName);
      insertAt = range.to;
    }

    // Remove the dragged entry from the markdown
    const withoutImage = md.slice(0, draggedEntry.start) + md.slice(draggedEntry.end);

    // Adjust insertAt if it was after the dragged entry
    if (insertAt > draggedEntry.start) {
      insertAt -= draggedEntry.fullTag.length;
    }
    insertAt = Math.max(0, insertAt);

    // Build a new image tag with left/top reset to 0 (snap to new position)
    const src = img.dataset.originalSrc || draggedEntry.src || "";
    const alt =
      img.getAttribute("alt") || draggedEntry.fullMatch.match(/alt=["']([^"']*)["']/i)?.[1] || "";
    const w = Math.round(parseFloat(img.style.width) || img.offsetWidth || 480);
    const h = Math.round(parseFloat(img.style.height) || img.offsetHeight || 0);
    const styleParts = [
      "position: relative",
      "left: 0px",
      "top: 0px",
      `width: ${w}px`,
      h ? `height: ${h}px` : "",
      "border: none",
      "object-fit: contain",
      "cursor: move",
    ];
    const newTag = `<img src="${src}" alt="${alt}" style="${styleParts.filter(Boolean).join("; ")}" />`;

    // Insert the new tag at the new position
    const before = withoutImage.slice(0, insertAt);
    const after = withoutImage.slice(insertAt);
    const needsNewline = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
    const updated = before + needsNewline + newTag + "\n" + after;

    // Move the image in the DOM immediately for visual snap, then update markdown.
    // The markdown update uses suppressOnChange so it won't trigger a re-render
    // that would undo the DOM manipulation.
    if (targetEl && targetEl.parentNode) {
      targetEl.parentNode.insertBefore(img, targetEl);
    }
    img.style.left = "0px";
    img.style.top = "0px";
    this._updateOverlay();

    if (this._onMoveArea) {
      this._onMoveArea(updated);
    } else {
      this._setMarkdown?.(updated);
    }
  }

  /**
   * Find the markdown position of a non-image DOM element.
   * Uses data-source-line if available, otherwise falls back to text matching.
   */
  static _findElementMarkdownPosition(md, element) {
    const area = element.closest(".slide__area");
    if (!area) return -1;

    const areaName = area.dataset.areaName || "main";
    const range = this._getAreaContentRange(md, areaName);

    // Prefer data-source-line attribute (set by markdown parser)
    const sourceLine = parseInt(element.dataset?.sourceLine, 10);
    if (!isNaN(sourceLine)) {
      // Convert line number to character position within the area
      const lines = md.slice(range.from, range.to).split("\n");
      let charOffset = 0;
      for (let i = 0; i < Math.min(sourceLine, lines.length); i++) {
        charOffset += lines[i].length + 1; // +1 for newline
      }
      return range.from + charOffset;
    }

    // Fallback: find by text content
    const text = element.textContent?.trim();
    if (!text) return -1;

    const areaContent = md.slice(range.from, range.to);
    const lines = areaContent.split("\n");
    let charOffset = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && text.startsWith(trimmed.slice(0, 50))) {
        return range.from + charOffset;
      }
      charOffset += line.length + 1;
    }

    return -1;
  }

  // ── Arrow key movement ─────────────────────────────────────────────────────

  /**
   * Handle arrow key presses to move the selected image.
   * @param {KeyboardEvent} e
   * @returns {boolean} true if the event was consumed
   */
  static handleKeyDown(e) {
    if (!this._selectedImg || !this._selectedImg.isConnected) return false;

    const step = e.shiftKey ? 1 : 10;
    let dx = 0;
    let dy = 0;

    switch (e.key) {
      case "ArrowLeft":
        dx = -step;
        break;
      case "ArrowRight":
        dx = step;
        break;
      case "ArrowUp":
        dy = -step;
        break;
      case "ArrowDown":
        dy = step;
        break;
      default:
        return false;
    }

    e.preventDefault();
    e.stopPropagation();

    const img = this._selectedImg;
    const curLeft = parseFloat(img.style.left) || 0;
    const curTop = parseFloat(img.style.top) || 0;

    img.style.left = `${curLeft + dx}px`;
    img.style.top = `${curTop + dy}px`;

    this._updateOverlay();
    this._syncToMarkdown();
    return true;
  }

  /**
   * Return the character range for the content inside a named @area block.
   * Same logic as AreaNavigation.getAreaContentRange but standalone.
   */
  static _getAreaContentRange(markdown, areaName) {
    const text = String(markdown || "").replace(/\r\n?/g, "\n");
    const lines = text.split("\n");
    const target = String(areaName || "main")
      .trim()
      .toLowerCase();

    const markerRegex = /^\s*@([a-zA-Z_][a-zA-Z0-9_-]*)\s*$/;
    let areaMarkerIdx = -1;
    let nextMarkerIdx = lines.length;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(markerRegex);
      if (!match) continue;
      if (match[1].toLowerCase() === target) {
        areaMarkerIdx = i;
      } else if (areaMarkerIdx >= 0 && i > areaMarkerIdx) {
        nextMarkerIdx = i;
        break;
      }
    }

    if (areaMarkerIdx < 0) {
      return { from: text.length, to: text.length };
    }

    const lineToChar = (lineIndex) => {
      let pos = 0;
      for (let i = 0; i < lineIndex; i++) {
        pos += lines[i].length + 1;
      }
      return pos;
    };

    return {
      from: lineToChar(areaMarkerIdx + 1),
      to: lineToChar(nextMarkerIdx),
    };
  }

  // ── Delete ──────────────────────────────────────────────────────────────

  static deleteSelected() {
    const md = this._getMarkdown?.();
    if (!md || !this._selectedImg) return;

    const entries = this._findAllImages(md);
    const idx = this._getImageIndex(this._selectedImg);
    if (idx < 0 || idx >= entries.length) return;

    const entry = entries[idx];
    const before = md.slice(0, entry.start);
    const after = md.slice(entry.end);
    const updated = before.replace(/\n\s*$/, "\n") + after.replace(/^\s*\n/, "\n");
    this.deselect();
    if (this._onDelete) {
      this._onDelete(updated);
    } else {
      this._setMarkdown?.(updated);
    }
  }

  // ── Markdown sync ───────────────────────────────────────────────────────

  static _syncToMarkdown() {
    const md = this._getMarkdown?.();
    if (!md || !this._selectedImg) return;

    const entries = this._findAllImages(md);
    const idx = this._getImageIndex(this._selectedImg);
    if (idx < 0 || idx >= entries.length) return;

    const img = this._selectedImg;
    const entry = entries[idx];
    const alt = img.getAttribute("alt") ?? this._extractAlt(entry);

    // The preview rewrites `src="images/..."` to a `blob:` URL so the
    // browser can render it in dev mode (see DeckImagesResolver).  The
    // original relative path is preserved on `data-original-src`; fall
    // back to the entry parsed from markdown to avoid persisting the
    // throwaway blob URL into the saved markdown.
    const src = img.dataset.originalSrc || entry.src || img.getAttribute("src") || "";

    const style = this._buildStyleString(img);
    const newTag = `<img src="${src}" alt="${alt}" style="${style}" />`;
    this._setMarkdown?.(md.slice(0, entry.start) + newTag + md.slice(entry.end));
  }

  /**
   * Build the inline `style` string for the selected image from its DOM state.
   * Preserves all supported style properties.
   */
  static _buildStyleString(img) {
    const s = this._readSettings(img);
    const parts = [
      "position: relative",
      `left: ${Math.round(s.left)}px`,
      `top: ${Math.round(s.top)}px`,
      `width: ${Math.round(s.width)}px`,
      s.height ? `height: ${Math.round(s.height)}px` : "",
      s.opacity != null && s.opacity !== 1 ? `opacity: ${s.opacity}` : "",
      s.borderRadius ? `border-radius: ${s.borderRadius}px` : "",
      s.boxShadow && s.boxShadow !== "none" ? `box-shadow: ${s.boxShadow}` : "",
      s.rotation ? `transform: rotate(${Math.round(s.rotation)}deg)` : "",
      s.zIndex ? `z-index: ${Math.round(s.zIndex)}` : "",
      "border: none",
      "object-fit: contain",
      "cursor: move",
    ];
    return parts.filter(Boolean).join("; ");
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Compute and apply inline positioning styles to a markdown-rendered
   * image **without** writing markdown.  Used by the drag-start handler
   * so that the interact.js drag session is not disrupted by a
   * CodeMirror transaction mid-drag.
   */
  static _prepareMdImgForDrag(img) {
    const md = this._getMarkdown?.();
    if (!md) return;

    const entries = this._findAllImages(md);
    const idx = this._getImageIndex(img);
    if (idx < 0 || idx >= entries.length) return;

    const area = img.closest(".slide__area");
    const scale = this._getStageScale();

    // Use the actual rendered size from the bounding rect so the image
    // keeps its current visual dimensions during the drag.  Using
    // naturalWidth/naturalHeight can fail (0 if not loaded) or produce
    // wrong sizes (full area for flex-centered markdown images).
    const imgRect = img.getBoundingClientRect();
    let w = Math.max(1, Math.round(imgRect.width / scale));
    let h = Math.max(1, Math.round(imgRect.height / scale));

    // Compute position relative to the area's content box
    let left = 0;
    let top = 0;
    if (area) {
      const areaRect = area.getBoundingClientRect();
      const cs = getComputedStyle(area);
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padT = parseFloat(cs.paddingTop) || 0;
      left = Math.round((imgRect.left - areaRect.left) / scale - padL / scale);
      top = Math.round((imgRect.top - areaRect.top) / scale - padT / scale);
    }

    img.style.position = "relative";
    img.style.left = `${left}px`;
    img.style.top = `${top}px`;
    img.style.width = `${w}px`;
    img.style.height = `${h}px`;
    img.style.border = "none";
    img.style.objectFit = "contain";
    img.style.cursor = "move";
  }

  static _convertMdImgToHtml(img) {
    const md = this._getMarkdown?.();
    if (!md) return;

    const entries = this._findAllImages(md);
    const idx = this._getImageIndex(img);
    if (idx < 0 || idx >= entries.length) return;

    const entry = entries[idx];

    // Grab the image's pre-conversion visual centre relative to its
    // containing slide area.  A markdown image renders inside a
    // <p> as `width:100%/height:100%/object-fit:contain` and is
    // flex-centred by the `.slide__area p > img:only-child` rule, so a
    // centred picture looks identical regardless of how big the area
    // is.  The moment we replace the markdown with a raw HTML <img>
    // carrying a small fixed-size inline style, the element drops out
    // of the <p> wrapper (no flex centring) and jumps to the area's
    // top-left corner — visibly noticeable as "image jumps left/up on
    // click".  We capture the centre BEFORE applying any inline style
    // and then choose left/top offsets that put the new fixed-size
    // element's centre at the same point, so the picture stays put.
    const area = img.closest(".slide__area");
    let areaW = 1920;
    let areaH = 1080;
    let visualCenterX = areaW / 2;
    let visualCenterY = areaH / 2;
    const scale = this._getStageScale();
    if (area) {
      const areaRect = area.getBoundingClientRect();
      areaW = Math.max(1, areaRect.width / scale);
      areaH = Math.max(1, areaRect.height / scale);
      const imgRect = img.getBoundingClientRect();
      visualCenterX = (imgRect.left + imgRect.width / 2 - areaRect.left) / scale;
      visualCenterY = (imgRect.top + imgRect.height / 2 - areaRect.top) / scale;
    }

    // Compute an initial width/height that preserves the image's
    // visual size after the md/html swap.
    //
    // • Markdown images (`![alt](src)`) render via
    //   `.slide__area p > img:only-child` as `width:100%; height:100%`
    //   so `offsetWidth`/`offsetHeight` would return the full area
    //   dimensions — way too large.  Using the natural file dimensions
    //   (capped by the area) keeps the visual size stable.
    //
    // • Raw HTML `<img>` tags (e.g. from PPTX conversion) carry explicit
    //   `width`/`height` attributes that express the intended design-pixel
    //   dimensions.  Read these directly so CSS constraints (e.g. the
    //   `p > img:only-child` rule) cannot shrink them before we convert.
    const isExistingHtmlImg =
      entry.type === "html" && img.getAttribute("width") && img.getAttribute("height");
    let natW;
    let natH;
    if (isExistingHtmlImg) {
      natW = parseInt(img.getAttribute("width"), 10) || img.offsetWidth || 320;
      natH = parseInt(img.getAttribute("height"), 10) || img.offsetHeight || 240;
    } else {
      natW = img.naturalWidth || img.offsetWidth || 320;
      natH = img.naturalHeight || img.offsetHeight || 240;
    }
    let w = natW;
    let h = natH;
    if (w > areaW) {
      w = areaW;
      h = Math.round((w * natH) / natW);
    }
    if (h > areaH) {
      h = areaH;
      w = Math.round((h * natW) / natH);
    }
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));

    // For existing HTML images (e.g. PPTX-imported), the element is already
    // positioned correctly by CSS.  Use left/top = 0 so `position: relative`
    // doesn't shift it — relative positioning offsets are added to the
    // element's in-flow position, so any non-zero value moves it.
    // For markdown images being converted, compute offsets that keep the
    // visual centre in the same place.
    const left = isExistingHtmlImg ? 0 : Math.round(visualCenterX - w / 2);
    const top = isExistingHtmlImg ? 0 : Math.round(visualCenterY - h / 2);

    const alt = this._extractAlt(entry);
    const src = entry.src;
    const style = [
      "position: relative",
      `left: ${left}px`,
      `top: ${top}px`,
      `width: ${w}px`,
      `height: ${h}px`,
      "border: none",
      "object-fit: contain",
      "cursor: move",
    ].join("; ");

    const newTag = `<img src="${src}" alt="${alt}" style="${style}" />`;
    const updated = md.slice(0, entry.start) + newTag + md.slice(entry.end);
    this._setMarkdown?.(updated);

    // Apply styles directly to the DOM element (no re-render with suppressOnChange)
    img.style.position = "relative";
    img.style.left = `${left}px`;
    img.style.top = `${top}px`;
    img.style.width = `${w}px`;
    img.style.height = `${h}px`;
    img.style.border = "none";
    img.style.objectFit = "contain";
    img.style.cursor = "move";
  }

  // ── Settings API (used by ImagePropertiesPanel) ─────────────────────────────────

  /**
   * Read the current style settings of an img element into a structured object.
   * @param {HTMLElement} img
   */
  static _readSettings(img) {
    const style = img.style;
    const transform = style.transform || "";
    const rotMatch = transform.match(/rotate\(([-\d.]+)deg\)/i);
    return {
      left: parseFloat(style.left) || 0,
      top: parseFloat(style.top) || 0,
      width: parseFloat(style.width) || img.offsetWidth || 320,
      height: parseFloat(style.height) || null,
      opacity: style.opacity !== "" ? parseFloat(style.opacity) : 1,
      borderRadius: parseFloat(style.borderRadius) || 0,
      boxShadow: style.boxShadow || "none",
      rotation: rotMatch ? parseFloat(rotMatch[1]) : 0,
      zIndex: parseInt(style.zIndex, 10) || 0,
      alt: img.getAttribute("alt") || "",
    };
  }

  /**
   * Apply a partial settings object to the currently selected image.
   * Updates DOM styles/attributes, the overlay, the toolbar UI, and syncs
   * the change back to the markdown source.
   * @param {object} settings
   */
  static applySettings(settings) {
    const img = this._selectedImg;
    if (!img) return;
    const s = settings || {};

    if (s.left != null) img.style.left = `${Math.round(s.left)}px`;
    if (s.top != null) img.style.top = `${Math.round(s.top)}px`;
    if (s.width != null) img.style.width = `${Math.round(s.width)}px`;
    if (s.height != null) img.style.height = `${Math.round(s.height)}px`;
    if (s.opacity != null) img.style.opacity = String(s.opacity);
    if (s.borderRadius != null) img.style.borderRadius = `${Math.round(s.borderRadius)}px`;
    if (s.boxShadow != null) img.style.boxShadow = s.boxShadow;
    if (s.rotation != null) {
      img.style.transform = s.rotation ? `rotate(${Math.round(s.rotation)}deg)` : "";
    }
    if (s.zIndex != null) img.style.zIndex = String(Math.round(s.zIndex));
    if (s.alt != null) img.setAttribute("alt", s.alt);

    this._updateOverlay();
    ImagePropertiesPanel._syncUI(this._readSettings(img));
    this._syncToMarkdown();
  }

  /**
   * Update a single HTML attribute (e.g. `src`, `alt`) on the selected
   * image and sync it back to markdown.  Used by Replace image and alt-text.
   */
  static updateAttribute(name, value) {
    const img = this._selectedImg;
    if (!img) return;
    img.setAttribute(name, value);

    // Rewrite src via the deck image resolver so the preview can show it
    if (name === "src") {
      import("./deck-images-resolver.js").then(({ DeckImagesResolver }) => {
        DeckImagesResolver.rewriteImgSrcs(img.closest(".slide")).catch(() => {});
      });
    }

    ImagePropertiesPanel._syncUI(this._readSettings(img));
    this._syncToMarkdown();
  }

  static setAspectLock(locked) {
    this._aspectLocked = !!locked;
  }

  // ── Position presets ───────────────────────────────────────────────────

  /**
   * Center the image vertically within its area. Left stays at 0.
   */
  static centerOnSlide() {
    const img = this._selectedImg;
    if (!img) return;
    const area = img.closest(".slide__area");
    if (!area) return;

    const scale = this._getStageScale();
    const areaRect = area.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();

    const currentCenterY = (imgRect.top + imgRect.height / 2 - areaRect.top) / scale;
    const areaCenterY = areaRect.height / scale / 2;
    const deltaY = areaCenterY - currentCenterY;

    const curTop = parseFloat(img.style.top) || 0;

    this.applySettings({
      left: 0,
      top: Math.round(curTop + deltaY),
    });
  }

  /**
   * Align the image to the left of its area.
   */
  static alignLeft() {
    const img = this._selectedImg;
    if (!img) return;

    this.applySettings({ left: 0 });
  }

  /**
   * Align the image to the right of its area.
   */
  static alignRight() {
    const img = this._selectedImg;
    if (!img) return;
    const area = img.closest(".slide__area");
    if (!area) return;

    const scale = this._getStageScale();
    const areaWidth = area.getBoundingClientRect().width / scale;
    const imgWidth = parseFloat(img.style.width) || img.offsetWidth || 0;

    this.applySettings({ left: Math.round(areaWidth - imgWidth) });
  }

  /**
   * Fit the selected image within its containing `.slide__area`, using the
   * widest size that still keeps the full image inside the slide bounds.
   */
  static fitToWidth() {
    const img = this._selectedImg;
    if (!img) return;
    const area = img.closest(".slide__area");
    if (!area) return;

    const scale = this._getStageScale();
    const areaRect = area.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();

    // getBoundingClientRect() returns the border box; subtract padding to
    // get the content-box dimensions the image is actually positioned within.
    const cs = getComputedStyle(area);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    // Convert rendered px → design px first, then subtract design-unit padding
    const areaWidthDesign = areaRect.width / scale - padX;
    const areaHeightDesign = areaRect.height / scale - padY;
    const ratio =
      (img.naturalWidth || imgRect.width || 1) / (img.naturalHeight || imgRect.height || 1);
    const width = Math.min(areaWidthDesign, areaHeightDesign * ratio);
    const height = width / ratio;
    const top = (areaHeightDesign - height) / 2;

    this.applySettings({
      width: Math.round(width),
      height: Math.round(height),
      left: 0,
      top: Math.round(top),
    });
  }

  /**
   * Rotate the selected image by `delta` degrees (typically ±90).
   * For 90°/270° increments, swap width/height so the bounding box stays
   * consistent.  Free rotation just adjusts the transform.
   */
  static rotateBy(delta) {
    const img = this._selectedImg;
    if (!img) return;
    const s = this._readSettings(img);
    const newRot = (((Math.round(s.rotation) + delta) % 360) + 360) % 360;

    const settings = { rotation: newRot };

    // For 90°/270° swaps, the visible bounding box swaps W/H.  Keep the
    // stored width/height matching the rotated box so resize handles
    // remain sensible.
    if (Math.abs(newRot) % 180 === 90 && s.height) {
      settings.width = s.height;
      settings.height = s.width;
    }

    this.applySettings(settings);
  }

  static _getImageIndex(img) {
    const slide = img.closest(".slide");
    if (!slide) return -1;
    return Array.from(slide.querySelectorAll("img")).indexOf(img);
  }

  static _extractAlt(entry) {
    if (entry.type === "html") {
      return entry.fullTag.match(/alt=["']([^"']*)["']/i)?.[1] || "";
    }
    return entry.fullMatch.match(/!\[([^\]]*)\]/)?.[1] || "";
  }

  static _findAllImages(md) {
    const results = [];
    const htmlRe = /<img\b([^>]*?)>/gi;
    let m;
    while ((m = htmlRe.exec(md)) !== null) {
      const srcMatch = m[1].match(/src=["']([^"']*)["']/i);
      if (!srcMatch) continue;
      results.push({
        type: "html",
        src: srcMatch[1],
        fullMatch: m[0],
        fullTag: m[0],
        start: m.index,
        end: m.index + m[0].length,
      });
    }
    const mdRe = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
    while ((m = mdRe.exec(md)) !== null) {
      results.push({
        type: "md",
        src: m[2],
        fullMatch: m[0],
        fullTag: m[0],
        start: m.index,
        end: m.index + m[0].length,
      });
    }
    results.sort((a, b) => a.start - b.start);
    return results;
  }
}
