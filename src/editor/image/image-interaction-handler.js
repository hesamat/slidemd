/**
 * ImageInteractionHandler
 *
 * Drag-and-drop repositioning and resize handles for images in edit mode.
 * Works directly on <img> elements with a selection overlay.
 * No wrappers — the overlay tracks the image's position/size.
 */
import interact from 'interactjs';
import { ImagePropertiesPanel } from './image-properties-panel.js';

const DEFAULT_STYLE = {
    position: 'relative',
    left: 0,
    top: 0,
    width: 320,
    height: null,
    opacity: 1,
    borderRadius: 0,
    boxShadow: 'none',
    rotation: 0,
    zIndex: 0,
    border: 'none',
    objectFit: 'contain',
    cursor: 'move',
};

export class ImageInteractionHandler {
    static _initialized = false;
    static _selectedImg = null;
    static _slideContainer = null;
    static _getMarkdown = null;
    static _setMarkdown = null;
    static _onDelete = null;
    static _overlay = null;
    static _resizeState = null;
    static _pendingSelectSrc = null;
    static _aspectLocked = false;

    static init(getMarkdown, setMarkdown, { onDelete } = {}) {
        if (this._initialized) return;
        this._initialized = true;
        this._getMarkdown = getMarkdown;
        this._setMarkdown = setMarkdown;
        this._onDelete = onDelete || null;

        document.addEventListener('mousedown', (e) => {
            if (this._selectedImg && !e.target.closest('.image-overlay') && !e.target.closest('img') && !e.target.closest('.image-properties-panel')) {
                this.deselect();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (!this._selectedImg) return;

            // Don't intercept keys when the user is interacting with an input
            // (e.g. typing a width value in the properties panel).  Let the
            // input handle arrows/Escape/Delete naturally.
            if (e.target.closest('input, textarea, [contenteditable="true"]')) return;

            if (e.key === 'Escape') {
                this.deselect();
                return;
            }
            if (e.key === 'Delete') {
                this.deleteSelected();
                return;
            }

            // Arrow keys: move image instead of navigating slides
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                e.stopImmediatePropagation();
                e.preventDefault();
                const step = e.shiftKey ? 10 : 1;
                const prop = (e.key === 'ArrowLeft' || e.key === 'ArrowRight') ? 'left' : 'top';
                const dir = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 1;
                const cur = parseFloat(this._selectedImg.style[prop]) || 0;
                this._selectedImg.style[prop] = `${cur + dir * step}px`;
                this._updateOverlay();
                this._syncToMarkdown();
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
            interact('.slide__area img', { context: this._slideContainer }).draggable(false);
        }
        this._removeOverlay();
        this._slideContainer = null;
    }

    // ── Overlay ─────────────────────────────────────────────────────────────

    static _createOverlay(container) {
        this._removeOverlay();
        const overlay = document.createElement('div');
        overlay.className = 'image-overlay';
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
        overlay.style.display = 'none';
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

        overlay.style.display = 'block';
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
        this.deselect();

        // If this is a markdown image (no position style), convert to HTML
        // in the markdown source and apply styles to the existing DOM element
        if (!img.style.position) {
            this._convertMdImgToHtml(img);
        }

        this._selectedImg = img;
        img.classList.add('image-selected');
        this._updateOverlay();
        ImagePropertiesPanel.show(img, this._readSettings(img));
    }

    static deselect() {
        if (this._selectedImg) {
            this._selectedImg.classList.remove('image-selected');
            this._selectedImg = null;
        }
        if (this._overlay) {
            this._overlay.style.display = 'none';
        }
        ImagePropertiesPanel.hide();
    }

    static isSelected() { return !!this._selectedImg; }

    // ── Drag (via interact.js on the grid container) ─────────────────────────

    static _setupDraggable(container) {
        interact('.slide__area img', { context: container }).draggable({
            listeners: {
                start: (e) => {
                    const img = e.target.closest('img');
                    if (img) this.select(img);
                },
                move: (e) => {
                    const img = this._selectedImg;
                    if (!img) return;

                    const grid = this._slideContainer;
                    if (!grid) return;

                    const scale = this._getStageScale();
                    const curStyleLeft = parseFloat(img.style.left) || 0;
                    const curStyleTop = parseFloat(img.style.top) || 0;

                    // interact.js reports pointer motion in screen px.  Because
                    // the stage is rendered with a CSS transform, we must scale
                    // pointer delta to design px so the image tracks the cursor
                    // 1:1 regardless of zoom level.
                    const dDesignX = e.dx / scale;
                    const dDesignY = e.dy / scale;

                    // Visual position of the image's box relative to the grid
                    // container (which is the positioning context for overlay &&
                    // snap guides), at the pre-move state.
                    const gridRect = grid.getBoundingClientRect();
                    const imgRect = img.getBoundingClientRect();
                    const curVisualLeft = (imgRect.left - gridRect.left) / scale;
                    const curVisualTop = (imgRect.top - gridRect.top) / scale;
                    const w = imgRect.width / scale;
                    const h = imgRect.height / scale;

                    let proposedVisualLeft = curVisualLeft + dDesignX;
                    let proposedVisualTop = curVisualTop + dDesignY;

                    let newLeft;
                    let newTop;

                    // Snapping (disabled while Alt is held).  Snapping returns
                    // a desired *visual* left/top; convert back to a style
                    // offset using the relationship that style.left maps 1:1 to
                    // visual shift.
                    if (!e.altKey) {
                        const snap = this._computeSnap(img, proposedVisualLeft, proposedVisualTop, w, h);
                        const snappedVisualLeft = snap.x != null ? snap.x : proposedVisualLeft;
                        const snappedVisualTop = snap.y != null ? snap.y : proposedVisualTop;
                        newLeft = curStyleLeft + (snappedVisualLeft - curVisualLeft);
                        newTop = curStyleTop + (snappedVisualTop - curVisualTop);
                        this._renderSnapGuides(snap.guides);
                    } else {
                        newLeft = curStyleLeft + dDesignX;
                        newTop = curStyleTop + dDesignY;
                        this._clearSnapGuides();
                    }

                    img.style.left = `${newLeft}px`;
                    img.style.top = `${newTop}px`;

                    this._updateOverlay();
                    ImagePropertiesPanel._syncUI(this._readSettings(img));
                },
                end: () => {
                    this._clearSnapGuides();
                    this._syncToMarkdown();
                },
            },
        });
    }

    // ── Resize (manual mouse events on overlay handles) ─────────────────────

    static _setupResizeHandles() {
        const overlay = this._overlay;
        if (!overlay) return;

        overlay.addEventListener('mousedown', (e) => {
            const handle = e.target.closest('[data-edge]');
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

                if (s.edge.includes('right'))  newW = Math.max(50, s.startW + sdx);
                if (s.edge.includes('left'))  { newW = Math.max(50, s.startW - sdx); newLeft = s.startLeft + s.startW - newW; }
                if (s.edge.includes('bottom')) newH = Math.max(50, s.startH + sdy);
                if (s.edge.includes('top'))    { newH = Math.max(50, s.startH - sdy); newTop = s.startTop + s.startH - newH; }

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
                        if (s.edge.includes('left'))  newLeft = s.startLeft + s.startW - newW;
                        if (s.edge.includes('top'))   newTop = s.startTop + s.startH - newH;
                    } else if (s.edge === 'left' || s.edge === 'right') {
                        newH = newW / s.ratio;
                    } else if (s.edge === 'top' || s.edge === 'bottom') {
                        newW = newH * s.ratio;
                    }
                }

                img.style.left = `${Math.max(0, newLeft)}px`;
                img.style.top = `${Math.max(0, newTop)}px`;
                img.style.width = `${newW}px`;
                img.style.height = `${newH}px`;

                this._updateOverlay();
                ImagePropertiesPanel._syncUI(this._readSettings(img));
            };

            const onUp = () => {
                this._resizeState = null;
                this._syncToMarkdown();
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    static _getStageScale() {
        const stage = document.querySelector('.stage__inner');
        if (!stage) return 1;
        const transform = getComputedStyle(stage).transform;
        if (!transform || transform === 'none') return 1;
        const match = transform.match(/matrix\(([^,]+),/);
        return match ? parseFloat(match[1]) : 1;
    }

    // ── Snapping ────────────────────────────────────────────────────────────

    static _SNAP_THRESHOLD = 6; // design px

    /**
     * Compute snap-adjusted left/top for the dragged image.
     *
     * All coordinates are expressed relative to the slide grid container
     * (`.slide__grid`), which is the same coordinate system used for the
     * overlay and snap-guide elements.  Working in *visual* coordinates (rather
     * than the image's `position: relative` style offsets) ensures snapping
     * works across images that live in different `.slide__area` cells and at
     * any stage scale.
     *
     * @param {HTMLImageElement} img    – the image being dragged (for finding sibling targets)
     * @param {number} visualLeft       – proposed visual left edge (design px, grid-relative)
     * @param {number} visualTop        – proposed visual top edge
     * @param {number} w                – image width in design px
     * @param {number} h                – image height in design px
     * @returns {{x: number|null, y: number|null, guides: Array}} `x`/`y` are the
     *   desired *visual* positions of the image's left/top edge after snapping
     *   (or null when no snap target is close enough).  `guides` is a list of
     *   `{ axis, pos }` for drawing guide lines.
     */
    static _computeSnap(img, visualLeft, visualTop, w, h) {
        const grid = this._slideContainer;
        if (!grid) return { x: null, y: null, guides: [] };

        const scale = this._getStageScale();
        const gridRect = grid.getBoundingClientRect();
        const gridW = gridRect.width / scale;
        const gridH = gridRect.height / scale;

        // Slide-grid edges and center are the primary snap targets.
        const xTargets = [
            { v: 0, kind: 'edge' },               // grid left
            { v: gridW / 2, kind: 'center' },     // grid center X
            { v: gridW, kind: 'edge' },           // grid right
        ];
        const yTargets = [
            { v: 0, kind: 'edge' },
            { v: gridH / 2, kind: 'center' },
            { v: gridH, kind: 'edge' },
        ];

        // Add other images' visible centers/edges on the same slide.  We use
        // getBoundingClientRect so images in different grid cells compare on the
        // same coordinate axis.
        const slide = img.closest('.slide');
        if (slide) {
            slide.querySelectorAll('img').forEach((other) => {
                if (other === img) return;
                const oRect = other.getBoundingClientRect();
                const oL = (oRect.left - gridRect.left) / scale;
                const oT = (oRect.top - gridRect.top) / scale;
                const oW = oRect.width / scale;
                const oH = oRect.height / scale;
                xTargets.push({ v: oL, kind: 'edge' });
                xTargets.push({ v: oL + oW / 2, kind: 'center' });
                xTargets.push({ v: oL + oW, kind: 'edge' });
                yTargets.push({ v: oT, kind: 'edge' });
                yTargets.push({ v: oT + oH / 2, kind: 'center' });
                yTargets.push({ v: oT + oH, kind: 'edge' });
            });
        }

        // The dragged image exposes three reference lines along each axis.
        const xRefs = [
            { ref: visualLeft, offset: 0 },
            { ref: visualLeft + w / 2, offset: w / 2 },
            { ref: visualLeft + w, offset: w },
        ];
        const yRefs = [
            { ref: visualTop, offset: 0 },
            { ref: visualTop + h / 2, offset: h / 2 },
            { ref: visualTop + h, offset: h },
        ];

        // Choose the closest candidate within the threshold (not the first in
        // iteration order) so the most relevant edge/center snaps.
        let bestX = null;
        let bestXDist = Infinity;
        let bestXGuide = null;
        for (const ref of xRefs) {
            for (const t of xTargets) {
                const d = Math.abs(ref.ref - t.v);
                if (d <= this._SNAP_THRESHOLD && d < bestXDist) {
                    bestXDist = d;
                    bestX = t.v - ref.offset;
                    bestXGuide = { axis: 'v', pos: t.v };
                }
            }
        }

        let bestY = null;
        let bestYDist = Infinity;
        let bestYGuide = null;
        for (const ref of yRefs) {
            for (const t of yTargets) {
                const d = Math.abs(ref.ref - t.v);
                if (d <= this._SNAP_THRESHOLD && d < bestYDist) {
                    bestYDist = d;
                    bestY = t.v - ref.offset;
                    bestYGuide = { axis: 'h', pos: t.v };
                }
            }
        }

        const guides = [];
        if (bestXGuide) guides.push(bestXGuide);
        if (bestYGuide) guides.push(bestYGuide);

        return { x: bestX, y: bestY, guides };
    }

    static _renderSnapGuides(guides) {
        this._clearSnapGuides();
        const grid = this._slideContainer;
        if (!grid) return;
        for (const g of guides) {
            const el = document.createElement('div');
            el.className = 'image-snap-guide';
            el.dataset.axis = g.axis;
            if (g.axis === 'v') {
                el.style.left = `${g.pos}px`;
                el.style.top = '0';
                el.style.width = '1px';
                el.style.height = '100%';
            } else {
                el.style.top = `${g.pos}px`;
                el.style.left = '0';
                el.style.height = '1px';
                el.style.width = '100%';
            }
            grid.appendChild(el);
        }
    }

    static _clearSnapGuides() {
        const grid = this._slideContainer;
        if (!grid) return;
        grid.querySelectorAll('.image-snap-guide').forEach((el) => el.remove());
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
        const updated = before.replace(/\n\s*$/, '\n') + after.replace(/^\s*\n/, '\n');
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
        const alt = img.getAttribute('alt') ?? this._extractAlt(entry);
        const src = img.getAttribute('src') ?? entry.src;

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
            'position: relative',
            `left: ${Math.round(s.left)}px`,
            `top: ${Math.round(s.top)}px`,
            `width: ${Math.round(s.width)}px`,
            s.height ? `height: ${Math.round(s.height)}px` : '',
            s.opacity != null && s.opacity !== 1 ? `opacity: ${s.opacity}` : '',
            s.borderRadius ? `border-radius: ${s.borderRadius}px` : '',
            s.boxShadow && s.boxShadow !== 'none' ? `box-shadow: ${s.boxShadow}` : '',
            s.rotation ? `transform: rotate(${Math.round(s.rotation)}deg)` : '',
            s.zIndex ? `z-index: ${Math.round(s.zIndex)}` : '',
            'border: none',
            'object-fit: contain',
            'cursor: move',
        ];
        return parts.filter(Boolean).join('; ');
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    static _convertMdImgToHtml(img) {
        const md = this._getMarkdown?.();
        if (!md) return;

        const entries = this._findAllImages(md);
        const idx = this._getImageIndex(img);
        if (idx < 0 || idx >= entries.length) return;

        const entry = entries[idx];
        if (entry.type !== 'md') return;

        const alt = this._extractAlt(entry);
        const src = entry.src;
        const w = img.offsetWidth || 320;
        const style = [
            'position: relative',
            'left: 0px',
            'top: 0px',
            `width: ${w}px`,
            'border: none',
            'object-fit: contain',
            'cursor: move',
        ].join('; ');

        const newTag = `<img src="${src}" alt="${alt}" style="${style}" />`;
        const updated = md.slice(0, entry.start) + newTag + md.slice(entry.end);
        this._setMarkdown?.(updated);

        // Apply styles directly to the DOM element (no re-render with suppressOnChange)
        img.style.position = 'relative';
        img.style.left = '0px';
        img.style.top = '0px';
        img.style.width = `${w}px`;
        img.style.border = 'none';
        img.style.objectFit = 'contain';
        img.style.cursor = 'move';
    }

    // ── Settings API (used by ImagePropertiesPanel) ─────────────────────────────────

    /**
     * Read the current style settings of an img element into a structured object.
     * @param {HTMLElement} img
     */
    static _readSettings(img) {
        const style = img.style;
        const transform = style.transform || '';
        const rotMatch = transform.match(/rotate\(([-\d.]+)deg\)/i);
        return {
            left: parseFloat(style.left) || 0,
            top: parseFloat(style.top) || 0,
            width: parseFloat(style.width) || img.offsetWidth || 320,
            height: parseFloat(style.height) || null,
            opacity: style.opacity !== '' ? parseFloat(style.opacity) : 1,
            borderRadius: parseFloat(style.borderRadius) || 0,
            boxShadow: style.boxShadow || 'none',
            rotation: rotMatch ? parseFloat(rotMatch[1]) : 0,
            zIndex: parseInt(style.zIndex, 10) || 0,
            alt: img.getAttribute('alt') || '',
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
            img.style.transform = s.rotation ? `rotate(${Math.round(s.rotation)}deg)` : '';
        }
        if (s.zIndex != null) img.style.zIndex = String(Math.round(s.zIndex));
        if (s.alt != null) img.setAttribute('alt', s.alt);

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
        if (name === 'src') {
            import('./deck-images-resolver.js').then(({ DeckImagesResolver }) => {
                DeckImagesResolver.rewriteImgSrcs(img.closest('.slide')).catch(() => {});
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
     * Center the selected image within its containing `.slide__area`.
     * Uses a delta-based approach that works with `position: relative`:
     * compute how far the image's current center is from the area's center,
     * then add that delta to the existing left/top offsets.
     */
    static centerOnSlide() {
        const img = this._selectedImg;
        if (!img) return;
        const area = img.closest('.slide__area');
        if (!area) return;

        const scale = this._getStageScale();
        const areaRect = area.getBoundingClientRect();
        const imgRect = img.getBoundingClientRect();

        const currentCenterX = (imgRect.left + imgRect.width / 2 - areaRect.left) / scale;
        const currentCenterY = (imgRect.top + imgRect.height / 2 - areaRect.top) / scale;

        const areaCenterX = (areaRect.width / scale) / 2;
        const areaCenterY = (areaRect.height / scale) / 2;

        const deltaX = areaCenterX - currentCenterX;
        const deltaY = areaCenterY - currentCenterY;

        const curLeft = parseFloat(img.style.left) || 0;
        const curTop = parseFloat(img.style.top) || 0;

        this.applySettings({
            left: Math.round(curLeft + deltaX),
            top: Math.round(curTop + deltaY),
        });
    }

    /**
     * Fit the selected image to the full width of its containing
     * `.slide__area`, left-aligned and vertically centered within the area.
     */
    static fitToWidth() {
        const img = this._selectedImg;
        if (!img) return;
        const area = img.closest('.slide__area');
        if (!area) return;

        const scale = this._getStageScale();
        const areaRect = area.getBoundingClientRect();
        const imgRect = img.getBoundingClientRect();

        const areaWidthDesign = areaRect.width / scale;
        const currentLeft = (imgRect.left - areaRect.left) / scale;
        const currentCenterY = (imgRect.top + imgRect.height / 2 - areaRect.top) / scale;
        const areaCenterY = (areaRect.height / scale) / 2;

        const deltaX = 0 - currentLeft;
        const deltaY = areaCenterY - currentCenterY;

        const curLeft = parseFloat(img.style.left) || 0;
        const curTop = parseFloat(img.style.top) || 0;

        this.applySettings({
            width: Math.round(areaWidthDesign),
            left: Math.round(curLeft + deltaX),
            top: Math.round(curTop + deltaY),
        });
    }

    static bringToFront() {
        const img = this._selectedImg;
        if (!img) return;
        const slide = img.closest('.slide');
        if (!slide) return;
        let max = 0;
        slide.querySelectorAll('img').forEach((i) => {
            const z = parseInt(getComputedStyle(i).zIndex, 10) || 0;
            if (z > max) max = z;
        });
        this.applySettings({ zIndex: max + 1 });
    }

    static sendToBack() {
        const img = this._selectedImg;
        if (!img) return;
        const slide = img.closest('.slide');
        if (!slide) return;
        let min = 0;
        slide.querySelectorAll('img').forEach((i) => {
            if (i === img) return;
            const z = parseInt(getComputedStyle(i).zIndex, 10) || 0;
            if (z < min) min = z;
        });
        this.applySettings({ zIndex: min - 1 });
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
        const newRot = (Math.round(s.rotation) + delta) % 360;

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
        const slide = img.closest('.slide');
        if (!slide) return -1;
        return Array.from(slide.querySelectorAll('img')).indexOf(img);
    }

    static _extractAlt(entry) {
        if (entry.type === 'html') {
            return entry.fullTag.match(/alt=["']([^"']*)["']/i)?.[1] || '';
        }
        return entry.fullMatch.match(/!\[([^\]]*)\]/)?.[1] || '';
    }

    static _findAllImages(md) {
        const results = [];
        const htmlRe = /<img\b([^>]*?)>/gi;
        let m;
        while ((m = htmlRe.exec(md)) !== null) {
            const srcMatch = m[1].match(/src=["']([^"']*)["']/i);
            if (!srcMatch) continue;
            results.push({
                type: 'html', src: srcMatch[1],
                fullMatch: m[0], fullTag: m[0],
                start: m.index, end: m.index + m[0].length,
            });
        }
        const mdRe = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
        while ((m = mdRe.exec(md)) !== null) {
            results.push({
                type: 'md', src: m[2],
                fullMatch: m[0], fullTag: m[0],
                start: m.index, end: m.index + m[0].length,
            });
        }
        results.sort((a, b) => a.start - b.start);
        return results;
    }
}
