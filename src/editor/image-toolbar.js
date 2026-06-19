/**
 * ImageToolbar
 *
 * A floating popover that appears when an <img> element is clicked in the
 * slide preview during edit mode.  Provides quick controls for resizing,
 * aligning, and removing inline images.
 */

export class ImageToolbar {
    static el = null;
    static activeImg = null;
    static activeCallback = null;
    static _wired = false;

    /** The original markdown src path (e.g. "images/foo.png") for the active image. */
    static _originalSrc = '';

    /**
     * Find the live <img> element by original src path.
     * Always queries the DOM fresh to avoid stale references.
     */
    static _getLiveImg() {
        if (!this._originalSrc) return this.activeImg;
        return document.querySelector(
            `#slidesContainer img[data-original-src="${CSS.escape(this._originalSrc)}"]`
        ) || this.activeImg;
    }

    /**
     * Parse an <img> element's inline style to extract the current settings.
     * @param {HTMLImageElement} img
     * @returns {{ width: string, maxHeight: string, align: string }}
     */
    static parseImgStyle(img) {
        const style = img.getAttribute('style') || '';
        let width = '';
        let maxHeight = '';
        let align = 'center';

        // Width
        const wMatch = style.match(/(?:^|;)\s*width:\s*(\d+)%/);
        if (wMatch) width = wMatch[1];

        // Max-height
        const hMatch = style.match(/max-height:\s*(\d+)px/);
        if (hMatch) maxHeight = hMatch[1];

        // Alignment via margin — be careful not to match 'max-width: 100%'
        if (/(?:^|;)\s*width:\s*100%/.test(style)) {
            align = 'full';
        } else if (style.includes('margin: 10px auto 10px 0') || style.includes('margin:10px auto 10px 0')) {
            align = 'left';
        } else if (style.includes('margin: 10px 0 10px auto') || style.includes('margin:10px 0 10px auto')) {
            align = 'right';
        } else {
            align = 'center';
        }

        return { width, maxHeight, align };
    }

    /**
     * Build the inline style string from the given settings.
     * @param {{ width: string, maxHeight: string, align: string }} opts
     * @returns {string}
     */
    static buildStyleString({ width, maxHeight, align }) {
        const parts = [
            'display: block',
            'border: none',
            'max-width: 100%',
            'height: auto',
            'object-fit: contain',
        ];

        // Alignment + margin
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

        // Width (non-full only)
        if (align !== 'full' && width) {
            parts.push(`width: ${width}%`);
        }

        // Max-height
        if (maxHeight) {
            parts.push(`max-height: ${maxHeight}px`);
        } else if (align !== 'full') {
            parts.push('max-height: 480px');
        }

        return parts.join('; ');
    }

    /**
     * Show the toolbar for the given <img> element.
     * @param {HTMLImageElement} img - The clicked image element
     * @param {function} onUpdate - Callback invoked with the new style string
     */
    static show(img, onUpdate) {
        this.activeImg = img;
        this.activeCallback = onUpdate;
        this._originalSrc = img.dataset.originalSrc || '';

        if (!this.el) this._buildDom();

        const settings = this.parseImgStyle(img);
        this._syncUI(settings);
        this.el.classList.remove('webdeck-hidden');

        // Position below the image
        const rect = img.getBoundingClientRect();
        const toolbarH = this.el.offsetHeight || 44;
        const toolbarW = this.el.offsetWidth || 280;

        let top = rect.bottom + window.scrollY + 6;
        let left = rect.left + window.scrollX + (rect.width - toolbarW) / 2;

        // Keep within viewport
        left = Math.max(8, Math.min(left, window.innerWidth - toolbarW - 8));
        if (top + toolbarH > window.innerHeight + window.scrollY) {
            top = rect.top + window.scrollY - toolbarH - 6;
        }

        this.el.style.top = `${top}px`;
        this.el.style.left = `${left}px`;
    }

    /** Hide the toolbar. */
    static hide() {
        if (this.el) this.el.classList.add('webdeck-hidden');
        this.activeImg = null;
        this.activeCallback = null;
        this._originalSrc = '';
    }

    /** Is the toolbar currently visible? */
    static isVisible() {
        return this.el && !this.el.classList.contains('webdeck-hidden');
    }

    // ── Private ─────────────────────────────────────────────────────────────

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

        // Close on outside click
        document.addEventListener('mousedown', (e) => {
            if (!this.isVisible()) return;
            if (this.el.contains(e.target)) return;
            if (this.activeImg && this.activeImg.contains(e.target)) return;
            this.hide();
        });

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible()) {
                this.hide();
            }
        });

        // Preset buttons — only change width, preserve current height
        this.el.querySelectorAll('.image-toolbar-preset').forEach((btn) => {
            btn.addEventListener('click', () => {
                const w = btn.dataset.w;
                const liveImg = this._getLiveImg();
                if (!liveImg || !this.activeCallback) return;
                this.activeImg = liveImg;
                const current = this.parseImgStyle(liveImg);
                const merged = { ...current, width: w };
                this._syncUI(merged);
                this.activeCallback(this.buildStyleString(merged));
            });
        });

        // Align buttons
        this.el.querySelectorAll('.image-toolbar-align-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const liveImg = this._getLiveImg();
                if (!liveImg || !this.activeCallback) return;
                this.activeImg = liveImg;
                const current = this.parseImgStyle(liveImg);
                const merged = { ...current, align: btn.dataset.align };
                this._syncUI(merged);
                this.activeCallback(this.buildStyleString(merged));
            });
        });

        // Custom inputs
        this.el.querySelectorAll('.image-toolbar-input').forEach((input) => {
            input.addEventListener('change', () => {
                const liveImg = this._getLiveImg();
                if (!liveImg || !this.activeCallback) return;
                this.activeImg = liveImg;
                const current = this.parseImgStyle(liveImg);
                const merged = { ...current, [input.dataset.field]: input.value };
                this._syncUI(merged);
                this.activeCallback(this.buildStyleString(merged));
            });
        });

        // Delete button
        this.el.querySelector('.image-toolbar-delete').addEventListener('click', () => {
            if (!this.activeImg || !this.activeCallback) return;
            this.activeCallback(null); // null signals deletion
            this.hide();
        });
    }

    /**
     * Apply partial settings changes and re-emit the updated style.
     * @param {object} partial - Partial settings to merge
     */
    static _applySettings(partial) {
        this._refreshActiveImg();
        if (!this.activeImg || !this.activeCallback) return;

        const current = this.parseImgStyle(this.activeImg);
        const merged = { ...current, ...partial };

        // Sync the UI to reflect merged state
        this._syncUI(merged);

        // Build and emit new style
        const newStyle = this.buildStyleString(merged);
        this.activeCallback(newStyle);
    }

    /**
     * Sync the toolbar UI to reflect the given settings.
     * @param {{ width: string, maxHeight: string, align: string }} settings
     */
    static _syncUI({ width, maxHeight, align }) {
        if (!this.el) return;

        // Preset buttons — match by width only
        this.el.querySelectorAll('.image-toolbar-preset').forEach((btn) => {
            const bw = btn.dataset.w;
            const isMatch = bw === width;
            btn.classList.toggle('active', isMatch);
        });

        // Align buttons
        this.el.querySelectorAll('.image-toolbar-align-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.align === align);
        });

        // Custom inputs
        const wInput = this.el.querySelector('[data-field="width"]');
        const hInput = this.el.querySelector('[data-field="maxHeight"]');
        if (wInput) wInput.value = width || '';
        if (hInput) hInput.value = maxHeight || '';
    }
}
