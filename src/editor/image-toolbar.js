/**
 * ImageToolbar
 *
 * Floating popover for restyling inline images in the slide preview.
 *
 * Design principle: the markdown source is the single source of truth.
 * We never read styles from the rendered DOM — we always parse them from
 * the markdown, apply the change, and write back.  This avoids stale-
 * reference bugs after preview re-renders.
 *
 * Supports two image formats:
 *   - HTML:    <img src="..." style="..." />
 *   - Markdown: ![alt](src)
 *     On first edit, markdown images are converted to <img> HTML so the
 *     full style controls become available.
 */

export class ImageToolbar {
    static el = null;
    static _wired = false;

    /** Callback to get the current markdown for the slide being edited. */
    static _getMarkdown = null;
    /** Callback to set the updated markdown for the slide being edited. */
    static _setMarkdown = null;
    /** The 0-based index of the <img> element that was clicked (among all imgs in the slide). */
    static _imgIndex = -1;
    /** The original src path (e.g. "images/foo.png") of the clicked image. */
    static _srcPath = '';

    /**
     * Initialize with callbacks that read/write the slide markdown.
     * @param {function} getMarkdown - Returns the current slide's markdown
     * @param {function} setMarkdown - Sets the updated slide markdown
     */
    static init(getMarkdown, setMarkdown) {
        this._getMarkdown = getMarkdown;
        this._setMarkdown = setMarkdown;
    }

    /**
     * Find the image at the given click position in the rendered slide,
     * parse its current settings from markdown, and show the toolbar.
     *
     * @param {MouseEvent} e - The click event on an <img> element
     */
    static handleImageClick(e) {
        const img = e.target.closest('img');
        if (!img) return;
        if (img.closest('.editor-area-label, .editor-slide-warning')) return;

        const md = this._getMarkdown?.();
        if (!md) return;

        // Find which image was clicked by index among all <img> in the slide
        const slidesContainer = document.getElementById('slidesContainer');
        if (!slidesContainer) return;
        const activeSlide = slidesContainer.querySelector('.slide.active, .slide[data-active]');
        if (!activeSlide) return;

        const allImgs = activeSlide.querySelectorAll('img');
        const idx = Array.from(allImgs).indexOf(img);
        if (idx < 0) return;

        this._imgIndex = idx;

        // Find all image entries in the markdown (both <img> and ![alt](src))
        const entries = this._findAllImages(md);
        if (idx >= entries.length) return;

        const entry = entries[idx];
        this._srcPath = entry.src;

        const settings = entry.type === 'html'
            ? this._parseHtmlImgStyle(entry.fullTag)
            : { width: '', maxHeight: '', align: 'center' };

        this._show(img, settings);
    }

    // ── Markdown parsing ──────────────────────────────────────────────────

    /**
     * Find all images in the markdown, returning their positions and metadata.
     * @param {string} md
     * @returns {Array<{type:'html'|'md', src:string, fullMatch:string, fullTag:string, start:number, end:number}>}
     */
    static _findAllImages(md) {
        const results = [];

        // HTML <img> tags
        const htmlRe = /<img\b([^>]*?)>/gi;
        let m;
        while ((m = htmlRe.exec(md)) !== null) {
            const tag = m[0];
            const attrs = m[1];
            const srcMatch = attrs.match(/src=["']([^"']*)["']/i);
            if (!srcMatch) continue;
            results.push({
                type: 'html',
                src: srcMatch[1],
                fullMatch: m[0],
                fullTag: tag,
                start: m.index,
                end: m.index + m[0].length,
            });
        }

        // Markdown ![alt](src) or ![alt](src "title")
        const mdRe = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
        while ((m = mdRe.exec(md)) !== null) {
            results.push({
                type: 'md',
                src: m[2],
                fullMatch: m[0],
                fullTag: m[0],
                start: m.index,
                end: m.index + m[0].length,
            });
        }

        // Sort by position in the markdown
        results.sort((a, b) => a.start - b.start);
        return results;
    }

    /**
     * Parse an <img> tag's inline style to extract current settings.
     * @param {string} tag - The full <img ... /> tag
     * @returns {{ width: string, maxHeight: string, align: string }}
     */
    static _parseHtmlImgStyle(tag) {
        const styleMatch = tag.match(/style\s*=\s*(["'])([^"']*)\1/i);
        const style = styleMatch ? styleMatch[2] : '';

        let width = '';
        let maxHeight = '';
        let align = 'center';

        const wMatch = style.match(/(?:^|;)\s*width:\s*(\d+)%/);
        if (wMatch) width = wMatch[1];

        const hMatch = style.match(/max-height:\s*(\d+)px/);
        if (hMatch) maxHeight = hMatch[1];

        // Alignment: width:100% (but not max-width) with no side margins
        if (/(?:^|;)\s*width:\s*100%/.test(style)) {
            align = 'full';
        } else if (/margin:\s*10px\s+auto\s+10px\s+0/.test(style)) {
            align = 'left';
        } else if (/margin:\s*10px\s+0\s+10px\s+auto/.test(style)) {
            align = 'right';
        } else {
            align = 'center';
        }

        return { width, maxHeight, align };
    }

    /**
     * Build an <img> HTML tag from settings.
     */
    static _buildHtmlTag(src, alt, { width, maxHeight, align }) {
        const styleParts = [
            'display: block',
            'border: none',
            'max-width: 100%',
            'height: auto',
            'object-fit: contain',
        ];

        if (align === 'full') {
            styleParts.push('margin: 10px 0');
            styleParts.push('width: 100%');
        } else if (align === 'left') {
            styleParts.push('margin: 10px auto 10px 0');
        } else if (align === 'right') {
            styleParts.push('margin: 10px 0 10px auto');
        } else {
            styleParts.push('margin: 10px auto');
        }

        if (align !== 'full' && width) {
            styleParts.push(`width: ${width}%`);
        }

        if (maxHeight) {
            styleParts.push(`max-height: ${maxHeight}px`);
        } else if (align !== 'full') {
            styleParts.push('max-height: 480px');
        }

        return `<img src="${src}" alt="${alt || ''}" style="${styleParts.join('; ')}" />`;
    }

    /**
     * Build the style string from settings (for preview and comparison).
     */
    static _buildStyleString({ width, maxHeight, align }) {
        const parts = [
            'display: block',
            'border: none',
            'max-width: 100%',
            'height: auto',
            'object-fit: contain',
        ];

        if (align === 'full') {
            parts.push('margin: 10px 0');
            parts.push('width: 100%');
        } else if (align === 'left') {
            parts.push('margin: 10px auto 10px 0');
        } else if (align === 'right') {
            parts.push('margin: 10px 0 10px auto');
        } else {
            parts.push('margin: 10px auto');
        }

        if (align !== 'full' && width) {
            parts.push(`width: ${width}%`);
        }

        if (maxHeight) {
            parts.push(`max-height: ${maxHeight}px`);
        } else if (align !== 'full') {
            parts.push('max-height: 480px');
        }

        return parts.join('; ');
    }

    // ── Toolbar UI ────────────────────────────────────────────────────────

    static _show(anchorEl, settings) {
        if (!this.el) this._buildDom();
        this._syncUI(settings);
        this.el.classList.remove('webdeck-hidden');

        const rect = anchorEl.getBoundingClientRect();
        const toolbarH = this.el.offsetHeight || 44;
        const toolbarW = this.el.offsetWidth || 280;

        let top = rect.bottom + window.scrollY + 6;
        let left = rect.left + window.scrollX + (rect.width - toolbarW) / 2;

        left = Math.max(8, Math.min(left, window.innerWidth - toolbarW - 8));
        if (top + toolbarH > window.innerHeight + window.scrollY) {
            top = rect.top + window.scrollY - toolbarH - 6;
        }

        this.el.style.top = `${top}px`;
        this.el.style.left = `${left}px`;
    }

    static hide() {
        if (this.el) this.el.classList.add('webdeck-hidden');
        this._imgIndex = -1;
        this._srcPath = '';
    }

    static isVisible() {
        return this.el && !this.el.classList.contains('webdeck-hidden');
    }

    // ── Private: DOM + Events ─────────────────────────────────────────────

    static _buildDom() {
        const el = document.createElement('div');
        el.id = 'imageToolbar';
        el.className = 'image-toolbar webdeck-hidden';
        el.setAttribute('role', 'toolbar');
        el.setAttribute('aria-label', 'Image options');

        el.innerHTML = `
            <div class="image-toolbar-group">
                <span class="image-toolbar-label">Size</span>
                <div class="image-toolbar-presets">
                    <button type="button" class="image-toolbar-preset" data-w="">Auto</button>
                    <button type="button" class="image-toolbar-preset" data-w="50">S</button>
                    <button type="button" class="image-toolbar-preset" data-w="70">M</button>
                    <button type="button" class="image-toolbar-preset" data-w="90">L</button>
                    <button type="button" class="image-toolbar-preset" data-w="100">Full</button>
                </div>
            </div>
            <div class="image-toolbar-sep"></div>
            <div class="image-toolbar-group">
                <span class="image-toolbar-label">Align</span>
                <div class="image-toolbar-align">
                    <button type="button" class="image-toolbar-align-btn" data-align="left" title="Left">←</button>
                    <button type="button" class="image-toolbar-align-btn" data-align="center" title="Center">•</button>
                    <button type="button" class="image-toolbar-align-btn" data-align="right" title="Right">→</button>
                </div>
            </div>
            <div class="image-toolbar-sep"></div>
            <div class="image-toolbar-group image-toolbar-custom">
                <input type="number" class="image-toolbar-input" data-field="width" min="1" max="100" placeholder="W%" title="Width %" />
                <span class="image-toolbar-x">×</span>
                <input type="number" class="image-toolbar-input" data-field="maxHeight" min="1" max="2000" placeholder="Hpx" title="Max height px" />
            </div>
            <div class="image-toolbar-sep"></div>
            <button type="button" class="image-toolbar-delete" title="Remove image">✕</button>
        `;

        document.body.appendChild(el);
        this.el = el;
        this._wireEvents();
    }

    static _wireEvents() {
        if (this._wired) return;
        this._wired = true;

        document.addEventListener('mousedown', (e) => {
            if (!this.isVisible()) return;
            if (this.el.contains(e.target)) return;
            this.hide();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible()) this.hide();
        });

        // Preset buttons
        this.el.querySelectorAll('.image-toolbar-preset').forEach((btn) => {
            btn.addEventListener('click', () => {
                const current = this._readCurrentSettings();
                this._applyChange({ ...current, width: btn.dataset.w });
            });
        });

        // Align buttons
        this.el.querySelectorAll('.image-toolbar-align-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const current = this._readCurrentSettings();
                this._applyChange({ ...current, align: btn.dataset.align });
            });
        });

        // Custom inputs
        this.el.querySelectorAll('.image-toolbar-input').forEach((input) => {
            input.addEventListener('change', () => {
                const current = this._readCurrentSettings();
                this._applyChange({ ...current, [input.dataset.field]: input.value });
            });
        });

        // Delete
        this.el.querySelector('.image-toolbar-delete').addEventListener('click', () => {
            this._deleteImage();
        });
    }

    /**
     * Read the current settings for the active image directly from markdown.
     * This is always fresh — no stale DOM references.
     */
    static _readCurrentSettings() {
        const md = this._getMarkdown?.();
        if (!md) return { width: '', maxHeight: '', align: 'center' };

        const entries = this._findAllImages(md);
        const entry = entries[this._imgIndex];
        if (!entry) return { width: '', maxHeight: '', align: 'center' };

        if (entry.type === 'html') {
            return this._parseHtmlImgStyle(entry.fullTag);
        }
        // Markdown images have no style — return defaults
        return { width: '', maxHeight: '', align: 'center' };
    }

    /**
     * Apply updated settings to the active image in the markdown.
     * If the image is markdown ![alt](src), converts it to <img> HTML first.
     */
    static _applyChange(settings) {
        const md = this._getMarkdown?.();
        if (!md) return;

        const entries = this._findAllImages(md);
        const entry = entries[this._imgIndex];
        if (!entry) return;

        let newTag;
        if (entry.type === 'md') {
            // Convert markdown image to <img> HTML
            const alt = entry.fullMatch.match(/!\[([^\]]*)\]/)?.[1] || '';
            newTag = this._buildHtmlTag(entry.src, alt, settings);
        } else {
            // Replace existing <img> style (and strip stale width attr)
            const alt = entry.fullTag.match(/alt=["']([^"']*)["']/i)?.[1] || '';
            let tag = entry.fullTag.replace(/\s+width="[^"]*"/gi, '');
            const styleRe = /\bstyle\s*=\s*(["'])([^"']*)\1/i;
            if (styleRe.test(tag)) {
                tag = tag.replace(styleRe, `style="${this._buildStyleString(settings)}"`);
            } else {
                tag = tag.replace(/>$/, ` style="${this._buildStyleString(settings)}">`);
            }
            newTag = tag;
        }

        const updated = md.slice(0, entry.start) + newTag + md.slice(entry.end);
        this._setMarkdown?.(updated);
        this._syncUI(settings);
    }

    /**
     * Delete the active image from the markdown.
     */
    static _deleteImage() {
        const md = this._getMarkdown?.();
        if (!md) return;

        const entries = this._findAllImages(md);
        const entry = entries[this._imgIndex];
        if (!entry) return;

        // Remove the image tag and any surrounding blank lines
        const before = md.slice(0, entry.start);
        const after = md.slice(entry.end);
        const updated = before.replace(/\n\s*$/, '\n') + after.replace(/^\s*\n/, '\n');
        this._setMarkdown?.(updated);
        this.hide();
    }

    /**
     * Sync the toolbar UI to reflect the given settings.
     */
    static _syncUI({ width, maxHeight, align }) {
        if (!this.el) return;

        this.el.querySelectorAll('.image-toolbar-preset').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.w === width);
        });

        this.el.querySelectorAll('.image-toolbar-align-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.align === align);
        });

        const wInput = this.el.querySelector('[data-field="width"]');
        const hInput = this.el.querySelector('[data-field="maxHeight"]');
        if (wInput) wInput.value = width || '';
        if (hInput) hInput.value = maxHeight || '';
    }
}
