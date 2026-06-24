/**
 * ImageToolbar
 *
 * Floating popover for repositioning and resizing images in the slide preview.
 * Works with ImageInteractionHandler for drag/resize and provides
 * precise X/Y/W/H numeric inputs.
 *
 * Design principle: the markdown source is the single source of truth.
 * We always parse styles from the markdown, apply changes, and write back.
 */

export class ImageToolbar {
    static el = null;
    static _wired = false;
    static _getMarkdown = null;
    static _setMarkdown = null;

    /**
     * Initialize with callbacks that read/write the slide markdown.
     */
    static init(getMarkdown, setMarkdown) {
        this._getMarkdown = getMarkdown;
        this._setMarkdown = setMarkdown;
    }

    /**
     * Show the toolbar for the given image with its current settings.
     * @param {HTMLElement} img
     * @param {{ left: number, top: number, width: number, height: number }} settings
     */
    static show(img, settings) {
        if (!this.el) this._buildDom();
        this._syncUI(settings);
        this.el.classList.remove('webdeck-hidden');

        const rect = img.getBoundingClientRect();
        const toolbarH = this.el.offsetHeight || 44;
        const toolbarW = this.el.offsetWidth || 320;

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
    }

    static isVisible() {
        return this.el && !this.el.classList.contains('webdeck-hidden');
    }

    // ── Toolbar UI ────────────────────────────────────────────────────────

    static _buildDom() {
        const el = document.createElement('div');
        el.id = 'imageToolbar';
        el.className = 'image-toolbar webdeck-hidden';
        el.setAttribute('role', 'toolbar');
        el.setAttribute('aria-label', 'Image position and size');

        el.innerHTML = `
            <div class="image-toolbar-group">
                <span class="image-toolbar-label">Size</span>
                <input type="number" class="image-toolbar-input" data-field="width" min="50" max="1920" placeholder="W" title="Width (px)" />
                <span class="image-toolbar-x">×</span>
                <input type="number" class="image-toolbar-input" data-field="height" min="50" max="1080" placeholder="H" title="Height (px)" />
            </div>
            <div class="image-toolbar-sep"></div>
            <div class="image-toolbar-group">
                <button type="button" class="image-toolbar-preset" data-action="center" title="Center on slide">⊞</button>
                <button type="button" class="image-toolbar-preset" data-action="fit" title="Fit to slide width">↔</button>
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
            // Don't hide if clicking an image (that's handled by ImageInteractionHandler)
            if (e.target.closest('img')) return;
            this.hide();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible()) this.hide();
        });

        // Position/size inputs
        this.el.querySelectorAll('.image-toolbar-input').forEach((input) => {
            input.addEventListener('change', () => {
                this._applyFromInputs();
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this._applyFromInputs();
                }
            });
        });

        // Preset action buttons
        this.el.querySelectorAll('.image-toolbar-preset').forEach((btn) => {
            btn.addEventListener('click', () => {
                this._applyPreset(btn.dataset.action);
            });
        });

        // Delete
        this.el.querySelector('.image-toolbar-delete').addEventListener('click', () => {
            this._deleteImage();
        });
    }

    static _applyFromInputs() {
        const inputs = this.el.querySelectorAll('.image-toolbar-input');
        const settings = { left: 0, top: 0, width: 400, height: 300 };
        inputs.forEach((input) => {
            const val = parseInt(input.value, 10);
            if (Number.isFinite(val)) {
                settings[input.dataset.field] = val;
            }
        });

        // Import handler to apply changes
        import('./image-interaction-handler.js').then(({ ImageInteractionHandler }) => {
            ImageInteractionHandler.applySettings(settings);
        });
    }

    static _applyPreset(action) {
        import('./image-interaction-handler.js').then(({ ImageInteractionHandler }) => {
            const current = this._readCurrentSettings();
            let settings;
            if (action === 'center') {
                settings = {
                    ...current,
                    left: Math.round((1920 - current.width) / 2),
                    top: Math.round((1080 - current.height) / 2),
                };
            } else if (action === 'fit') {
                settings = {
                    ...current,
                    left: 0,
                    top: Math.round((1080 - current.height) / 2),
                    width: 1920,
                };
            } else {
                return;
            }
            ImageInteractionHandler.applySettings(settings);
        });
    }

    static _readCurrentSettings() {
        const inputs = this.el.querySelectorAll('.image-toolbar-input');
        const settings = { left: 0, top: 0, width: 400, height: 300 };
        inputs.forEach((input) => {
            const val = parseInt(input.value, 10);
            if (Number.isFinite(val)) {
                settings[input.dataset.field] = val;
            }
        });
        return settings;
    }

    static _deleteImage() {
        import('./image-interaction-handler.js').then(({ ImageInteractionHandler }) => {
            ImageInteractionHandler.deleteSelected();
        });
        this.hide();
    }

    /**
     * Sync the toolbar UI to reflect the given settings.
     */
    static _syncUI({ left, top, width, height }) {
        if (!this.el) return;
        const fields = { width: Math.round(width), height: Math.round(height) };
        this.el.querySelectorAll('.image-toolbar-input').forEach((input) => {
            const val = fields[input.dataset.field];
            if (val !== undefined) input.value = val;
        });
    }
}
