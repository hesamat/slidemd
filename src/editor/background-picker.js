/**
 * BackgroundPicker
 *
 * Modal that lets the user pick a background for the current slide.  Three
 * tabs:
 *   1. Solid color — a curated palette + native color input.
 *   2. Gradient   — preset linear gradients.
 *   3. Custom CSS — a textarea that accepts any CSS `background:` value.
 *
 * The chosen value is emitted as a plain CSS string (e.g. "#ff0000" or
 * "linear-gradient(...)").  The caller is responsible for writing it into
 * the slide markdown via `updateBackgroundDirective`.
 */

const COLOR_SWATCHES = [
    { name: 'White', value: '#ffffff' },
    { name: 'Slate', value: '#1e293b' },
    { name: 'Ink', value: '#0f172a' },
    { name: 'Sky', value: '#0ea5e9' },
    { name: 'Indigo', value: '#6366f1' },
    { name: 'Violet', value: '#8b5cf6' },
    { name: 'Pink', value: '#ec4899' },
    { name: 'Rose', value: '#f43f5e' },
    { name: 'Amber', value: '#f59e0b' },
    { name: 'Lime', value: '#84cc16' },
    { name: 'Emerald', value: '#10b981' },
    { name: 'Teal', value: '#14b8a6' },
    { name: 'Sand', value: '#f5f5dc' },
    { name: 'Paper', value: '#f8fafc' },
    { name: 'Slate-100', value: '#f1f5f9' },
    { name: 'Slate-800', value: '#1e293b' },
    { name: 'Slate-900', value: '#0f172a' },
    { name: 'Transparent', value: 'transparent' },
];

const GRADIENT_PRESETS = [
    {
        name: 'Sunset',
        value: 'linear-gradient(135deg, #fb923c 0%, #ec4899 50%, #8b5cf6 100%)',
    },
    {
        name: 'Ocean',
        value: 'linear-gradient(135deg, #0ea5e9 0%, #1e3a8a 100%)',
    },
    {
        name: 'Forest',
        value: 'linear-gradient(135deg, #064e3b 0%, #10b981 100%)',
    },
    {
        name: 'Peach',
        value: 'linear-gradient(135deg, #fde68a 0%, #f9a8d4 100%)',
    },
    {
        name: 'Lavender',
        value: 'linear-gradient(135deg, #c7d2fe 0%, #f5d0fe 100%)',
    },
    {
        name: 'Slate Fade',
        value: 'linear-gradient(135deg, #f8fafc 0%, #cbd5e1 50%, #475569 100%)',
    },
    {
        name: 'Midnight',
        value: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
    },
    {
        name: 'Aurora',
        value: 'linear-gradient(135deg, #14b8a6 0%, #6366f1 50%, #ec4899 100%)',
    },
];

export class BackgroundPicker {
    static modal = null;
    static tabButtons = null;
    static tabPanels = null;
    static colorGrid = null;
    static gradientGrid = null;
    static customInput = null;
    static clearBtn = null;
    static applyBtn = null;
    static onApplyCallback = null;
    static pickImageBtn = null;
    static imageStatusEl = null;

    /** Currently selected background CSS (the value the user picked). */
    static selectedValue = '';

    /** Background position / size for image backgrounds. */
    static bgImagePosition = 'center';
    static bgImageSize = 'cover';

    /** Currently selected image path (relative, e.g. "images/foo.png"). */
    static selectedImage = '';

    /** Callback invoked when user clicks "Pick image…". */
    static onPickImageCallback = null;

    static init() {
        if (this.modal) return;
        this._buildDom();
        this._wireEvents();
    }

    static _buildDom() {
        const wrapper = document.createElement('div');
        wrapper.id = 'backgroundPickerModal';
        wrapper.className = 'modal background-picker-modal webdeck-hidden';
        wrapper.setAttribute('role', 'dialog');
        wrapper.setAttribute('aria-modal', 'true');
        wrapper.setAttribute('aria-labelledby', 'backgroundPickerTitle');

        const colorButtons = COLOR_SWATCHES.map((c) => `
            <button type="button" class="bg-swatch" data-value="${escapeAttr(c.value)}"
                title="${escapeAttr(c.name)}" aria-label="${escapeAttr(c.name)}"
                style="background: ${escapeAttr(c.value)};"></button>
        `).join('');

        const gradientButtons = GRADIENT_PRESETS.map((g) => `
            <button type="button" class="bg-gradient" data-value="${escapeAttr(g.value)}"
                title="${escapeAttr(g.name)}" aria-label="${escapeAttr(g.name)}"
                style="background: ${escapeAttr(g.value)};">
                <span class="bg-gradient-label">${escapeText(g.name)}</span>
            </button>
        `).join('');

        wrapper.innerHTML = `
            <div class="modal__overlay" id="backgroundPickerOverlay"></div>
            <div class="modal__dialog">
                <div class="modal__header">
                    <h2 id="backgroundPickerTitle" class="modal__title">Slide Background</h2>
                    <button id="closeBackgroundPickerBtn" class="modal__close" type="button"
                        aria-label="Close">&times;</button>
                </div>

                <div class="bg-picker-tabs" role="tablist">
                    <button class="bg-picker-tab active" type="button" data-tab="color" role="tab">Color & Gradient</button>
                    <button class="bg-picker-tab" type="button" data-tab="image" role="tab">Image</button>
                    <button class="bg-picker-tab" type="button" data-tab="custom" role="tab">Custom CSS</button>
                </div>

                <div class="bg-picker-tab-panel active" data-panel="color" role="tabpanel">
                    <div class="bg-picker-section">
                        <div class="bg-picker-section-label">Solid colors</div>
                        <div class="bg-color-grid">${colorButtons}</div>
                        <div class="bg-picker-color-row">
                            <label class="bg-picker-color-label" for="bgPickerColorInput">Custom color</label>
                            <input id="bgPickerColorInput" type="color" class="bg-color-input" value="#0ea5e9" />
                            <input id="bgPickerColorText" type="text" class="bg-color-text-input" placeholder="#0ea5e9" />
                        </div>
                    </div>
                    <div class="bg-picker-section">
                        <div class="bg-picker-section-label">Gradients</div>
                        <div class="bg-gradient-grid">${gradientButtons}</div>
                    </div>
                </div>

                <div class="bg-picker-tab-panel" data-panel="image" role="tabpanel">
                    <div id="bgPickerImageStatus" class="bg-picker-image-status">No image selected.</div>
                    <div class="bg-picker-image-actions">
                        <button id="bgPickerPickImageBtn" class="bg-picker-image-btn" type="button">
                            <span>📁</span> Pick image…
                        </button>
                        <button id="bgPickerClearImageBtn" class="bg-picker-image-btn bg-picker-image-btn--secondary" type="button">
                            Remove image
                        </button>
                    </div>
                    <div class="bg-picker-image-options">
                        <div class="bg-picker-option-group">
                            <span class="bg-picker-option-label">Position</span>
                            <div class="bg-picker-pos-group" role="group" aria-label="Position">
                                <button type="button" class="bg-picker-pos-btn active" data-pos="center" title="Center">⏺</button>
                                <button type="button" class="bg-picker-pos-btn" data-pos="top" title="Top">↑</button>
                                <button type="button" class="bg-picker-pos-btn" data-pos="bottom" title="Bottom">↓</button>
                                <button type="button" class="bg-picker-pos-btn" data-pos="left" title="Left">←</button>
                                <button type="button" class="bg-picker-pos-btn" data-pos="right" title="Right">→</button>
                            </div>
                        </div>
                        <div class="bg-picker-option-group">
                            <span class="bg-picker-option-label">Size</span>
                            <div class="bg-picker-size-group" role="group" aria-label="Size">
                                <button type="button" class="bg-picker-size-btn active" data-size="cover" title="Cover (fill, may crop)">Cover</button>
                                <button type="button" class="bg-picker-size-btn" data-size="contain" title="Contain (fit, may letterbox)">Contain</button>
                                <button type="button" class="bg-picker-size-btn" data-size="auto" title="Auto (natural size)">Auto</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="bg-picker-tab-panel" data-panel="custom" role="tabpanel">
                    <label class="bg-picker-label" for="bgPickerCustomInput">CSS <code>background</code> value</label>
                    <textarea id="bgPickerCustomInput" class="bg-picker-textarea" rows="3"
                        placeholder="linear-gradient(135deg, #0ea5e9 0%, #1e3a8a 100%)&#10;#0ea5e9&#10;url('images/foo.jpg') center / cover"></textarea>
                    <div class="bg-picker-hint">Accepts any valid CSS <code>background</code> shorthand.</div>
                </div>

                <div class="bg-picker-footer">
                    <button id="bgPickerClearBtn" class="bg-picker-clear-btn" type="button">Clear background</button>
                    <button id="bgPickerApplyBtn" class="bg-picker-apply-btn" type="button" disabled>Apply</button>
                </div>
            </div>
        `;

        document.body.appendChild(wrapper);

        this.modal = wrapper;
        this.tabButtons = wrapper.querySelectorAll('.bg-picker-tab');
        this.tabPanels = wrapper.querySelectorAll('.bg-picker-tab-panel');
        this.colorGrid = wrapper.querySelector('.bg-color-grid');
        this.gradientGrid = wrapper.querySelector('.bg-gradient-grid');
        this.customInput = wrapper.querySelector('#bgPickerCustomInput');
        this.colorInput = wrapper.querySelector('#bgPickerColorInput');
        this.colorText = wrapper.querySelector('#bgPickerColorText');
        this.clearBtn = wrapper.querySelector('#bgPickerClearBtn');
        this.applyBtn = wrapper.querySelector('#bgPickerApplyBtn');
        this.pickImageBtn = wrapper.querySelector('#bgPickerPickImageBtn');
        this.clearImageBtn = wrapper.querySelector('#bgPickerClearImageBtn');
        this.imageStatusEl = wrapper.querySelector('#bgPickerImageStatus');
        this.posButtons = wrapper.querySelectorAll('.bg-picker-pos-btn');
        this.bgSizeButtons = wrapper.querySelectorAll('.bg-picker-size-btn');
    }

    static _wireEvents() {
        if (!this.modal || this.modal.dataset.wired === '1') return;
        this.modal.dataset.wired = '1';

        const close = () => this.hide();
        this.modal.querySelector('#backgroundPickerOverlay').addEventListener('click', close);
        this.modal.querySelector('#closeBackgroundPickerBtn').addEventListener('click', close);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.modal.classList.contains('webdeck-hidden')) {
                close();
            }
        });

        // Tabs
        this.tabButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.tab;
                this.tabButtons.forEach((b) => b.classList.toggle('active', b === btn));
                this.tabPanels.forEach((p) => p.classList.toggle('active', p.dataset.panel === target));
            });
        });

        // Swatches
        this.colorGrid.addEventListener('click', (e) => {
            const btn = e.target.closest('.bg-swatch');
            if (!btn) return;
            this.colorGrid.querySelectorAll('.bg-swatch').forEach((s) => s.classList.remove('selected'));
            btn.classList.add('selected');
            this._setSelection(btn.dataset.value);
        });

        // Gradient presets
        this.gradientGrid.addEventListener('click', (e) => {
            const btn = e.target.closest('.bg-gradient');
            if (!btn) return;
            this.gradientGrid.querySelectorAll('.bg-gradient').forEach((g) => g.classList.remove('selected'));
            btn.classList.add('selected');
            this._setSelection(btn.dataset.value);
        });

        // Custom color picker — keep text input in sync
        this.colorInput.addEventListener('input', () => {
            this.colorText.value = this.colorInput.value;
            this._setSelection(this.colorInput.value);
        });
        this.colorText.addEventListener('input', () => {
            const v = this.colorText.value.trim();
            if (/^#[0-9a-fA-F]{3,8}$/.test(v)) {
                this.colorInput.value = v.length === 4
                    ? '#' + v.slice(1).split('').map((c) => c + c).join('')
                    : v;
                this._setSelection(v);
            }
        });

        // Custom CSS textarea
        this.customInput.addEventListener('input', () => {
            this._setSelection(this.customInput.value);
        });

        // Image tab — pick image (delegated to a callback provided in show())
        this.pickImageBtn.addEventListener('click', () => {
            if (typeof this.onPickImageCallback === 'function') {
                this.onPickImageCallback();
            }
        });
        this.clearImageBtn.addEventListener('click', () => {
            this._setImageSelection('');
        });

        // Image position buttons
        this.posButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                this.bgImagePosition = btn.dataset.pos || 'center';
                this.posButtons.forEach((b) => b.classList.toggle('active', b === btn));
                if (this.selectedImage) this._refreshImageBackground();
            });
        });

        // Image size buttons
        this.bgSizeButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                this.bgImageSize = btn.dataset.size || 'cover';
                this.bgSizeButtons.forEach((b) => b.classList.toggle('active', b === btn));
                if (this.selectedImage) this._refreshImageBackground();
            });
        });

        // Clear
        this.clearBtn.addEventListener('click', () => {
            this._setSelection('');
        });

        // Apply
        this.applyBtn.addEventListener('click', () => this._confirm());
    }

    /**
     * Open the picker.  If `currentValue` is provided, it's used as the
     * initial selection.
     *
     * @param {(value: string) => void} onApply - Called with the chosen CSS
     *   value, or empty string if the user clicked Clear.
     * @param {object} [options]
     * @param {string} [options.currentValue=''] - Initial CSS background.
     * @param {() => void} [options.onPickImage] - Called when user clicks
     *   "Pick image…" in the Image tab.  The caller is expected to open the
     *   foreground Image Picker and then call `setImageSelection(path)`.
     */
    static show(onApply, { currentValue = '', onPickImage = null } = {}) {
        this.init();
        this.onApplyCallback = onApply;
        this.onPickImageCallback = onPickImage;
        this.selectedValue = String(currentValue || '').trim();
        this.customInput.value = this.selectedValue;
        this.colorText.value = this.selectedValue;
        if (this.selectedValue) {
            this.colorInput.value = this.selectedValue.startsWith('#')
                ? this.selectedValue
                : '#0ea5e9';
        }
        // Try to detect an existing image in the background value and seed
        // the image tab.
        const detected = this._parseBackgroundImage(this.selectedValue);
        if (detected) {
            this.selectedImage = detected.path;
            this.bgImagePosition = detected.position;
            this.bgImageSize = detected.size;
            this._refreshImageButtonsActive();
            this._renderImageStatus();
        } else {
            this.selectedImage = '';
            this._renderImageStatus();
        }
        this._syncApplyButton();
        // Default to Color tab
        this.tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === 'color'));
        this.tabPanels.forEach((p) => p.classList.toggle('active', p.dataset.panel === 'color'));
        this.modal.classList.remove('webdeck-hidden');
    }

    static hide() {
        if (this.modal) this.modal.classList.add('webdeck-hidden');
    }

    static _setSelection(value) {
        this.selectedValue = String(value || '').trim();
        this._syncApplyButton();
    }

    static _syncApplyButton() {
        this.applyBtn.disabled = false; // Always allow apply — empty == clear.
    }

    static _confirm() {
        const value = this.selectedValue || '';
        const cb = this.onApplyCallback;
        this.hide();
        if (cb) cb(value);
    }

    // ─── Image tab ─────────────────────────────────────────────────────────────

    /**
     * Called by the host (edit-controller) after the Image Picker modal
     * returns a path.  Stores the path and rebuilds the CSS background value.
     */
    static setImageSelection(imagePath) {
        this._setImageSelection(imagePath);
    }

    static _setImageSelection(imagePath) {
        this.selectedImage = String(imagePath || '').trim();
        this._renderImageStatus();
        this._refreshImageBackground();
    }

    static _refreshImageBackground() {
        if (!this.selectedImage) {
            this._setSelection('');
            return;
        }
        const css = this._buildImageBackground(this.selectedImage);
        this._setSelection(css);
    }

    static _buildImageBackground(imagePath) {
        const url = `url('${String(imagePath).replace(/'/g, "\\'")}')`;
        const pos = this.bgImagePosition || 'center';
        const size = this.bgImageSize || 'cover';
        return `${url} ${pos} / ${size} no-repeat`;
    }

    static _renderImageStatus() {
        if (!this.imageStatusEl) return;
        if (this.selectedImage) {
            const name = this.selectedImage.split('/').pop();
            this.imageStatusEl.innerHTML = `✓ Using <code>${escapeText(this.selectedImage)}</code>`;
            this.imageStatusEl.classList.add('has-image');
        } else {
            this.imageStatusEl.textContent = 'No image selected.';
            this.imageStatusEl.classList.remove('has-image');
        }
    }

    static _refreshImageButtonsActive() {
        if (this.posButtons) {
            this.posButtons.forEach((b) =>
                b.classList.toggle('active', b.dataset.pos === this.bgImagePosition)
            );
        }
        if (this.bgSizeButtons) {
            this.bgSizeButtons.forEach((b) =>
                b.classList.toggle('active', b.dataset.size === this.bgImageSize)
            );
        }
    }

    /**
     * Parse an existing `background:` value to detect a single-image
     * shorthand and recover its path / position / size.  Returns null when
     * no image is found.
     */
    static _parseBackgroundImage(cssValue) {
        if (!cssValue) return null;
        // Find the first url(...) argument, ignore escaped quotes inside.
        const urlMatch = cssValue.match(/url\(\s*(['"]?)(.+?)\1\s*\)/i);
        if (!urlMatch) return null;
        // Strip the url(...) portion and try to read position / size from
        // what follows.
        const remainder = cssValue.slice(0, urlMatch.index) + cssValue.slice(urlMatch.index + urlMatch[0].length);
        const tokens = remainder.trim().split(/\s+/).filter(Boolean);

        // Position keywords (subset used by the picker)
        const positions = ['top', 'bottom', 'left', 'right', 'center'];
        let position = 'center';
        const posToken = tokens.find((t) => positions.includes(t));
        if (posToken) position = posToken;

        // Size — pick from /cover, /contain, /auto or a pixel/percent pair
        let size = 'cover';
        const sizeMatch = cssValue.match(/\/\s*(cover|contain|auto)/i);
        if (sizeMatch) size = sizeMatch[1].toLowerCase();

        return { path: urlMatch[2], position, size };
    }
}

function escapeText(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeAttr(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;');
}
