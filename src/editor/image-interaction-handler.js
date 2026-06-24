/**
 * ImageInteractionHandler
 *
 * Drag-and-drop repositioning and resize handles for images in edit mode.
 * Works directly on <img> elements with a selection overlay.
 * No wrappers — the overlay tracks the image's position/size.
 */
import interact from 'interactjs';

const SLIDE_W = 1920;
const SLIDE_H = 1080;

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

    static init(getMarkdown, setMarkdown, { onDelete } = {}) {
        if (this._initialized) return;
        this._initialized = true;
        this._getMarkdown = getMarkdown;
        this._setMarkdown = setMarkdown;
        this._onDelete = onDelete || null;

        document.addEventListener('mousedown', (e) => {
            if (this._selectedImg && !e.target.closest('.image-overlay') && !e.target.closest('img')) {
                this.deselect();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (!this._selectedImg) return;

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

        // Restore selection if we navigated away and back to the same slide
        if (this._pendingSelectSrc) {
            const src = this._pendingSelectSrc;
            setTimeout(() => {
                // If already selected by another path, bail
                if (this._selectedImg) { this._pendingSelectSrc = null; return; }
                const slide = slideContainer.closest('.slide');
                if (!slide) return;
                const imgs = slide.querySelectorAll('.slide__area img');
                for (const img of imgs) {
                    if (img.src === src || img.getAttribute('src') === src) {
                        this._pendingSelectSrc = null;
                        this.select(img);
                        return;
                    }
                }
            }, 100);
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
        if (this._selectedImg === img) return;
        this.deselect();

        // If this is a markdown image (no position style), convert to HTML
        // in the markdown source and apply styles to the existing DOM element
        if (!img.style.position) {
            this._convertMdImgToHtml(img);
        }

        this._selectedImg = img;
        img.classList.add('image-selected');
        this._updateOverlay();
    }

    static deselect() {
        if (this._selectedImg) {
            this._pendingSelectSrc = this._selectedImg.src || null;
            this._selectedImg.classList.remove('image-selected');
            this._selectedImg = null;
        }
        if (this._overlay) {
            this._overlay.style.display = 'none';
        }
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

                    const left = parseFloat(img.style.left) || 0;
                    const top = parseFloat(img.style.top) || 0;

                    img.style.left = `${left + e.dx}px`;
                    img.style.top = `${top + e.dy}px`;

                    this._updateOverlay();
                },
                end: () => {
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

                if (s.edge.includes('right'))  newW = Math.max(50, s.startW + sdx);
                if (s.edge.includes('left'))  { newW = Math.max(50, s.startW - sdx); newLeft = s.startLeft + s.startW - newW; }
                if (s.edge.includes('bottom')) newH = Math.max(50, s.startH + sdy);
                if (s.edge.includes('top'))    { newH = Math.max(50, s.startH - sdy); newTop = s.startTop + s.startH - newH; }

                img.style.left = `${Math.max(0, newLeft)}px`;
                img.style.top = `${Math.max(0, newTop)}px`;
                img.style.width = `${newW}px`;
                img.style.height = `${newH}px`;

                this._updateOverlay();
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
        const alt = this._extractAlt(entry);

        const left = Math.round(parseFloat(img.style.left) || 0);
        const top = Math.round(parseFloat(img.style.top) || 0);
        const w = parseInt(img.style.width, 10);
        const h = parseInt(img.style.height, 10);

        const style = [
            'position: relative',
            `left: ${left}px`,
            `top: ${top}px`,
            `width: ${w}px`,
            h ? `height: ${h}px` : '',
            'border: none',
            'object-fit: contain',
            'cursor: move',
        ].filter(Boolean).join('; ');

        const newTag = `<img src="${entry.src}" alt="${alt}" style="${style}" />`;
        this._setMarkdown?.(md.slice(0, entry.start) + newTag + md.slice(entry.end));
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
