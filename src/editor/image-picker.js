/**
 * ImagePicker
 * Modal that lets the user pick an image from three sources:
 *   1. Existing images in the images/ folder (preloaded from server)
 *   2. Upload a new image (POSTed to /api/upload-image)
 *   3. Paste a URL or local path
 *
 * The selected image is emitted as an `<img src="..." width=... height=... />`
 * tag snippet ready to be inserted into markdown.
 */

export class ImagePicker {
    static modal = null;
    static tabButtons = null;
    static tabPanels = null;
    static grid = null;
    static urlInput = null;
    static urlPreview = null;
    static fileInput = null;
    static uploadZone = null;
    static widthInput = null;
    static heightInput = null;
    static insertBtn = null;
    static presetButtons = null;
    static alignButtons = null;
    static selectedAlign = 'center';
    static folderLabel = null;
    static changeFolderBtn = null;
    static onSelectCallback = null;

    /** Currently selected image path (or URL). */
    static selectedPath = '';

    /** Image cache so we can swap preview without re-fetching. */
    static _availableImages = [];

    /** Directory handle of the deck file's parent (FS Access API). */
    static _deckDirHandle = null;

    /** Map of `path` → `objectURL` for thumbnails sourced from FS Access API. */
    static _thumbUrls = new Map();

    /**
     * Initialize the image picker modal — call once on app start.
     */
    static init() {
        if (this.modal) return;
        this._buildDom();
        this._wireEvents();
    }

    /**
     * Build the modal DOM and append it to the body.
     * @private
     */
    static _buildDom() {
        const wrapper = document.createElement('div');
        wrapper.id = 'imagePickerModal';
        wrapper.className = 'modal image-picker-modal webdeck-hidden';
        wrapper.setAttribute('role', 'dialog');
        wrapper.setAttribute('aria-modal', 'true');
        wrapper.setAttribute('aria-labelledby', 'imagePickerTitle');

        wrapper.innerHTML = `
            <div class="modal__overlay" id="imagePickerOverlay"></div>
            <div class="modal__dialog">
                <div class="modal__header">
                    <h2 id="imagePickerTitle" class="modal__title">Insert Image</h2>
                    <button id="closeImagePickerBtn" class="modal__close" type="button" aria-label="Close">&times;</button>
                </div>

                <div class="image-picker-tabs" role="tablist">
                    <button class="image-picker-tab active" type="button" data-tab="existing" role="tab">Existing</button>
                    <button class="image-picker-tab" type="button" data-tab="upload" role="tab">Upload</button>
                    <button class="image-picker-tab" type="button" data-tab="url" role="tab">URL or Path</button>
                    <div class="image-picker-folder-label" id="imagePickerFolderLabel"></div>
                    <button id="imagePickerChangeFolderBtn" class="image-picker-change-folder-btn" type="button" title="Pick a different folder" hidden>Change folder</button>
                </div>

                <div class="image-picker-tab-panel active" data-panel="existing" role="tabpanel">
                    <div id="imagePickerGrid" class="image-picker-grid" aria-live="polite"></div>
                </div>

                <div class="image-picker-tab-panel" data-panel="upload" role="tabpanel">
                    <div id="imagePickerUploadZone" class="image-picker-upload-zone" tabindex="0">
                        <div class="image-picker-upload-icon">⬆</div>
                        <div>Click or drop an image to upload</div>
                        <div style="opacity: 0.7; margin-top: 4px; font-size: 11px;">.png .jpg .gif .webp .svg .avif</div>
                    </div>
                    <input id="imagePickerFileInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/avif" style="display:none" />
                </div>

                <div class="image-picker-tab-panel" data-panel="url" role="tabpanel">
                    <div class="image-picker-url-group">
                        <input id="imagePickerUrlInput" type="text" class="image-picker-url-input" placeholder="https://example.com/image.png  or  images/local.png" />
                        <img id="imagePickerUrlPreview" class="image-picker-url-preview" alt="" style="display:none" />
                    </div>
                </div>

                <div class="image-picker-footer">
                    <div class="image-picker-options">
                        <div class="image-picker-option-group">
                            <span class="image-picker-option-label">Size</span>
                            <div class="image-picker-presets" role="group" aria-label="Size preset">
                                <button type="button" class="image-picker-preset-btn" data-w="" data-h="">Auto</button>
                                <button type="button" class="image-picker-preset-btn" data-w="50" data-h="220">Small</button>
                                <button type="button" class="image-picker-preset-btn" data-w="70" data-h="220">Medium</button>
                                <button type="button" class="image-picker-preset-btn" data-w="90" data-h="220">Large</button>
                                <button type="button" class="image-picker-preset-btn" data-w="100" data-h="">Full</button>
                            </div>
                            <div class="image-picker-custom-size">
                                <input id="imagePickerWidth" type="number" class="image-picker-size-input" min="1" max="100" placeholder="auto" title="Width as percentage of slide" />
                                <span class="image-picker-size-label">% ×</span>
                                <input id="imagePickerHeight" type="number" class="image-picker-size-input" min="1" max="2000" placeholder="220" title="Max-height in pixels (aspect ratio is preserved)" />
                                <span class="image-picker-size-label" title="Max-height in pixels (aspect ratio is preserved)">px max</span>
                            </div>
                        </div>

                        <div class="image-picker-option-group">
                            <span class="image-picker-option-label">Align</span>
                            <div class="image-picker-align-group" role="group" aria-label="Alignment">
                                <button type="button" class="image-picker-align-btn" data-align="left" aria-label="Align left" title="Align left">⬅</button>
                                <button type="button" class="image-picker-align-btn active" data-align="center" aria-label="Align center" title="Align center">⏺</button>
                                <button type="button" class="image-picker-align-btn" data-align="right" aria-label="Align right" title="Align right">➡</button>
                                <button type="button" class="image-picker-align-btn" data-align="full" aria-label="Full width" title="Full width">↔</button>
                            </div>
                        </div>
                    </div>
                    <button id="imagePickerInsertBtn" class="image-picker-insert-btn" type="button" disabled>Insert</button>
                </div>
            </div>
        `;

        document.body.appendChild(wrapper);

        this.modal = wrapper;
        this.tabButtons = wrapper.querySelectorAll('.image-picker-tab');
        this.tabPanels = wrapper.querySelectorAll('.image-picker-tab-panel');
        this.grid = wrapper.querySelector('#imagePickerGrid');
        this.urlInput = wrapper.querySelector('#imagePickerUrlInput');
        this.urlPreview = wrapper.querySelector('#imagePickerUrlPreview');
        this.fileInput = wrapper.querySelector('#imagePickerFileInput');
        this.uploadZone = wrapper.querySelector('#imagePickerUploadZone');
        this.widthInput = wrapper.querySelector('#imagePickerWidth');
        this.heightInput = wrapper.querySelector('#imagePickerHeight');
        this.insertBtn = wrapper.querySelector('#imagePickerInsertBtn');
        this.presetButtons = wrapper.querySelectorAll('.image-picker-preset-btn');
        this.alignButtons = wrapper.querySelectorAll('.image-picker-align-btn');
        this.folderLabel = wrapper.querySelector('#imagePickerFolderLabel');
        this.changeFolderBtn = wrapper.querySelector('#imagePickerChangeFolderBtn');
    }

    /**
     * Wire up event handlers.  Idempotent.
     * @private
     */
    static _wireEvents() {
        if (!this.modal || this.modal.dataset.wired === '1') return;
        this.modal.dataset.wired = '1';

        const close = () => this.hide();

        this.modal.querySelector('#imagePickerOverlay').addEventListener('click', close);
        this.modal.querySelector('#closeImagePickerBtn').addEventListener('click', close);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.modal.classList.contains('webdeck-hidden')) {
                close();
            }
        });

        // Tab switching
        this.tabButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.tab;
                this.tabButtons.forEach((b) => b.classList.toggle('active', b === btn));
                this.tabPanels.forEach((p) => p.classList.toggle('active', p.dataset.panel === target));
                if (target === 'existing') this._refreshGrid();
            });
        });

        // URL input → preview + enable insert
        this.urlInput.addEventListener('input', () => {
            const url = this.urlInput.value.trim();
            this.selectedPath = url;
            if (url) {
                this.urlPreview.src = url;
                this.urlPreview.style.display = '';
                this.urlPreview.onerror = () => { this.urlPreview.style.display = 'none'; };
            } else {
                this.urlPreview.style.display = 'none';
            }
            this._syncInsertButton();
        });

        // Upload zone — click + drag-drop
        this.uploadZone.addEventListener('click', () => this.fileInput.click());
        this.uploadZone.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.fileInput.click();
            }
        });

        ['dragenter', 'dragover'].forEach((evt) => {
            this.uploadZone.addEventListener(evt, (e) => {
                e.preventDefault();
                this.uploadZone.classList.add('dragover');
            });
        });
        ['dragleave', 'drop'].forEach((evt) => {
            this.uploadZone.addEventListener(evt, (e) => {
                e.preventDefault();
                this.uploadZone.classList.remove('dragover');
            });
        });
        this.uploadZone.addEventListener('drop', (e) => {
            const file = e.dataTransfer?.files?.[0];
            if (file) this._handleUploadFile(file);
        });

        this.fileInput.addEventListener('change', () => {
            const file = this.fileInput.files?.[0];
            if (file) this._handleUploadFile(file);
            this.fileInput.value = '';
        });

        // Size presets — clicking applies the preset and updates the active state
        this.presetButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                const w = btn.dataset.w || '';
                const h = btn.dataset.h || '';
                this.widthInput.value = w;
                this.heightInput.value = h;
                this._syncPresetActive();
            });
        });

        // Custom size inputs clear any active preset
        [this.widthInput, this.heightInput].forEach((input) => {
            input.addEventListener('input', () => this._syncPresetActive());
        });

        // Alignment buttons
        this.alignButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                const align = btn.dataset.align || 'center';
                this.selectedAlign = align;
                this.alignButtons.forEach((b) => b.classList.toggle('active', b === btn));
                // "Full" alignment implies width=100
                if (align === 'full') {
                    this.widthInput.value = '100';
                    this.heightInput.value = '';
                }
                this._syncPresetActive();
            });
        });

        // Insert
        this.insertBtn.addEventListener('click', () => this._confirm());

        // Change folder
        this.changeFolderBtn.addEventListener('click', async () => {
            if (!this.onChangeFolderCallback) return;
            const result = await this.onChangeFolderCallback();
            if (result && result.handle) {
                this._deckDirHandle = result.handle;
                this._deckDirMode = result.mode || 'parent';
                this._renderFolderLabel();
                await this._refreshGrid();
            }
        });
    }

    /**
     * Update the folder indicator so the user knows where images are
     * coming from / going to.  Hides the label when no handle is available
     * (server fallback).
     */
    static _renderFolderLabel() {
        if (!this.folderLabel) return;
        if (this._deckDirHandle) {
            const name = this._deckDirHandle.name || 'deck folder';
            // In "images" mode the user picked the images folder directly.
            // In "parent" mode the user picked the deck folder.
            const displayPath = this._deckDirMode === 'images'
                ? `📁 ${name}/`
                : `📁 ${name}/images/`;
            this.folderLabel.textContent = displayPath;
            this.folderLabel.title = `Reading images from ${displayPath}`;
            this.folderLabel.hidden = false;
            if (this.changeFolderBtn) this.changeFolderBtn.hidden = false;
        } else {
            this.folderLabel.textContent = `📁 project images/`;
            this.folderLabel.title = `Reading from the project's images/ folder`;
            this.folderLabel.hidden = false;
            if (this.changeFolderBtn) this.changeFolderBtn.hidden = true;
        }
    }

    /** Callback invoked when the user wants to pick a different folder. */
    static onChangeFolderCallback = null;

    /**
     * Where the persisted handle points:
     *   "parent" — handle is the deck's parent folder; images live in
     *              `<handle>/images/`.
     *   "images" — handle IS the images folder itself.
     */
    static _deckDirMode = 'parent';

    /**
     * Show the picker and load existing images.  The callback receives the
     * rendered `<img>` snippet ready to be inserted into markdown.
     *
     * @param {(snippet: string) => void} onSelect
     * @param {object} [options]
     * @param {FileSystemDirectoryHandle} [options.deckDirHandle] - The
     *   directory handle (interpretation depends on `deckDirMode`).
     * @param {'parent'|'images'} [options.deckDirMode='parent'] - What the
     *   handle points to.
     * @param {() => Promise<{handle: FileSystemDirectoryHandle, mode: 'parent'|'images'}|null>} [options.onChangeFolder]
     *   Called when the user clicks "Change folder" in the modal.
     */
    static async show(onSelect, { deckDirHandle = null, deckDirMode = 'parent', onChangeFolder = null } = {}) {
        this.init();
        this.onSelectCallback = onSelect;
        this.onChangeFolderCallback = onChangeFolder;
        this._deckDirHandle = deckDirHandle;
        this._deckDirMode = deckDirMode;
        this.selectedPath = '';
        // Default sizing: 70% wide × 220px tall, centered.  Users can override.
        this.widthInput.value = '70';
        this.heightInput.value = '220';
        this.selectedAlign = 'center';
        if (this.alignButtons) {
            this.alignButtons.forEach((b) => b.classList.toggle('active', b.dataset.align === 'center'));
        }
        this.urlInput.value = '';
        this.urlPreview.style.display = 'none';
        this._syncInsertButton();
        this._syncPresetActive();
        this._renderFolderLabel();
        this.modal.classList.remove('webdeck-hidden');
        // Default to "Existing" tab
        this.tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === 'existing'));
        this.tabPanels.forEach((p) => p.classList.toggle('active', p.dataset.panel === 'existing'));
        await this._refreshGrid();
    }

    static hide() {
        if (this.modal) this.modal.classList.add('webdeck-hidden');
        // Revoke any object URLs we created
        for (const url of this._thumbUrls.values()) URL.revokeObjectURL(url);
        this._thumbUrls.clear();
    }

    /**
     * Read the list of image files via the FS Access API.  Returns
     * `[{ name, path, file }]` where `file` is a `File` object.
     *
     * Behaviour depends on `this._deckDirMode`:
     *  - "parent" — read from `<handle>/images/`, create it if missing.
     *  - "images" — read directly from `handle` itself.
     *
     * @private
     */
    static async _listImagesFromFs() {
        const dirHandle = this._deckDirHandle;
        if (!dirHandle) return null;

        try {
            const targetDir = this._deckDirMode === 'images'
                ? dirHandle
                : await dirHandle.getDirectoryHandle('images', { create: false });

            const out = [];
            for await (const [name, handle] of targetDir.entries()) {
                if (handle.kind !== 'file') continue;
                if (!/\.(jpe?g|png|gif|webp|svg|avif)$/i.test(name)) continue;
                const file = await handle.getFile();
                // Always emit paths relative to the deck file's parent — i.e.
                // "images/<file>".  This works whether the handle is the
                // parent folder or the images folder itself.
                out.push({ name, path: `images/${name}`, file });
            }
            return out;
        } catch (err) {
            if (err.name === 'NotFoundError') return [];
            throw err;
        }
    }

    /**
     * Fetch the list of existing images and render the grid.  Prefers the
     * FS Access API (deck directory) and falls back to the server endpoint
     * when no handle is available.
     *
     * @private
     */
    static async _refreshGrid() {
        if (!this.grid) return;
        this.grid.innerHTML = `<div class="image-picker-empty"><div class="image-picker-empty-icon">⏳</div>Loading…</div>`;

        try {
            // Revoke stale object URLs
            for (const url of this._thumbUrls.values()) URL.revokeObjectURL(url);
            this._thumbUrls.clear();

            let images = null;

            // Prefer the deck directory handle (reads from the actual deck folder)
            if (this._deckDirHandle) {
                images = await this._listImagesFromFs();
            }

            // Fallback to the server endpoint (project root images/)
            if (images === null) {
                const res = await fetch('/api/images');
                if (!res.ok) throw new Error(`Server returned ${res.status}`);
                const data = await res.json();
                images = (data.images || []).map(({ name, path }) => ({ name, path }));
            }

            this._availableImages = images;
            this._renderGrid();
        } catch (err) {
            console.warn('Failed to load images:', err);
            this.grid.innerHTML = `<div class="image-picker-empty"><div class="image-picker-empty-icon">⚠</div>Could not load images.<br/><small>${escapeText(err.message)}</small></div>`;
        }
    }

    static _renderGrid() {
        if (!this._availableImages.length) {
            const hint = this._deckDirHandle
                ? 'Upload to add files next to your deck.'
                : 'Upload or add files to <code>images/</code>.';
            this.grid.innerHTML = `<div class="image-picker-empty"><div class="image-picker-empty-icon">📁</div>No images yet.<br/><small>${hint}</small></div>`;
            return;
        }

        // Sort newest first when filename starts with a timestamp
        const sorted = [...this._availableImages].sort((a, b) => b.name.localeCompare(a.name));

        // For FS-API images we have a `File` object; build object URLs for thumbnails.
        this.grid.innerHTML = sorted.map((img) => {
            let thumbSrc;
            if (img.file) {
                const url = URL.createObjectURL(img.file);
                this._thumbUrls.set(img.path, url);
                thumbSrc = url;
            } else {
                thumbSrc = img.path;
            }
            return `
                <div class="image-picker-item" data-path="${escapeAttr(img.path)}" tabindex="0" role="button" aria-label="${escapeAttr(img.name)}">
                    <img src="${escapeAttr(thumbSrc)}" alt="${escapeAttr(img.name)}" loading="lazy" />
                    <div class="image-picker-item-name">${escapeText(img.name)}</div>
                </div>
            `;
        }).join('');

        this.grid.querySelectorAll('.image-picker-item').forEach((el) => {
            el.addEventListener('click', () => this._selectExisting(el));
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this._selectExisting(el);
                }
            });
        });
    }

    static _selectExisting(el) {
        const path = el.dataset.path;
        this.selectedPath = path;
        this.grid.querySelectorAll('.image-picker-item').forEach((i) => i.classList.toggle('selected', i === el));
        this._syncInsertButton();
    }

    /**
     * Upload a file and select the resulting path.  The file is always written
     * directly into the deck's `images/` folder via the File System Access
     * API (so it stays next to the deck file and never ends up in the
     * project's `images/` folder).  We also tell the dev server where the
     * deck folder lives, so the preview can serve `images/<file>` from there.
     *
     * @private
     */
    static async _handleUploadFile(file) {
        const allowed = /\.(jpe?g|png|gif|webp|svg|avif)$/i;
        if (!allowed.test(file.name)) {
            this.uploadZone.innerHTML = `<div class="image-picker-upload-icon">✗</div><div>Unsupported image type: ${escapeText(file.name)}</div>`;
            return;
        }

        this.uploadZone.innerHTML = `<div class="image-picker-upload-icon">⏳</div><div>Uploading…</div>`;

        const ext = (file.name.match(/\.[^.]+$/)?.[0] || '.png').toLowerCase();
        const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
        const targetPath = `images/${safeName}`;

        try {
            // Write directly into the deck's folder via FS Access API so the
            // image stays next to the deck file (not in the project folder).
            if (!this._deckDirHandle) {
                throw new Error('No deck folder is set. Please pick a folder first.');
            }

            const targetDir = this._deckDirMode === 'images'
                ? this._deckDirHandle
                : await this._deckDirHandle.getDirectoryHandle('images', { create: true });

            const fh = await targetDir.getFileHandle(safeName, { create: true });
            const writable = await fh.createWritable();
            await writable.write(file);
            await writable.close();

            this.selectedPath = targetPath;
            this._availableImages.push({ name: safeName, path: targetPath });

            // Refresh the existing tab so the new image is visible immediately
            await this._refreshGrid();
        } catch (err) {
            this.uploadZone.innerHTML = `
                <div class="image-picker-upload-icon">✗</div>
                <div>Upload failed: ${escapeText(err.message)}</div>
                <div style="opacity: 0.7; margin-top: 4px; font-size: 11px;">Click to try again.</div>
            `;
            return;
        }

        this.uploadZone.innerHTML = `
            <div class="image-picker-upload-icon">✓</div>
            <div>Uploaded ${escapeText(file.name)}</div>
            <div style="opacity: 0.7; margin-top: 4px; font-size: 11px;">Click Insert to add, or pick another file.</div>
        `;
        this._syncInsertButton();
    }

    static _syncInsertButton() {
        const ok = !!this.selectedPath;
        this.insertBtn.disabled = !ok;
    }

    static _confirm() {
        if (!this.selectedPath || !this.onSelectCallback) return;
        const snippet = this._buildSnippet(this.selectedPath);
        const cb = this.onSelectCallback;
        this.hide();
        cb(snippet);
    }

    /**
     * Build the `<img>` markdown/HTML snippet with controlled width, max-height,
     * and alignment.  Always emits an inline `style` so the result renders
     * the same regardless of the markdown-to-HTML pipeline.
     *
     * We use `max-height` instead of `height` so images preserve their
     * aspect ratio (no stretching).  `object-fit: contain` keeps the image
     * fully visible inside the bounding box.
     *
     * @private
     */
    static _buildSnippet(src) {
        const alt = src.split('/').pop().replace(/\.[^.]+$/, '').replace(/^\d+[-_]?/, '') || 'image';

        let w = parseInt(this.widthInput.value, 10);
        let h = parseInt(this.heightInput.value, 10);
        const align = this.selectedAlign || 'center';

        // Apply alignment defaults when the user hasn't entered a width.
        if (!Number.isFinite(w) || w <= 0) {
            if (align === 'left' || align === 'right') w = 50;
            else if (align === 'full') w = 100;
            else w = 70; // center default
        }

        // Default max-height — applies whenever the user leaves the field
        // empty or the chosen preset has no height (Auto / Full).
        if (!Number.isFinite(h) || h <= 0) {
            if (align === 'full') h = null; // let it scale freely
            else h = 220;
        }

        const hasW = Number.isFinite(w) && w > 0;
        const hasH = Number.isFinite(h) && h > 0;

        // HTML attributes — `width` as a percentage hint; no raw `height`
        // attribute because it would stretch the image.
        const attrs = [];
        if (hasW) attrs.push(`width="${w}%"`);

        // Inline style — alignment + dimensions, with aspect-ratio preserved.
        const styleParts = [
            'display: block',
            'border: none',
            'max-width: 100%',
            'height: auto',
            'object-fit: contain',
        ];
        if (align === 'left') styleParts.push('margin: 10px auto 10px 0');
        else if (align === 'right') styleParts.push('margin: 10px 0 10px auto');
        else if (align === 'full') styleParts.push('margin: 10px 0', 'width: 100%');
        else styleParts.push('margin: 10px auto');

        if (align !== 'full' && hasW) {
            styleParts.push(`width: ${w}%`);
        }
        if (hasH) {
            // `max-height` caps the image without forcing it to that size;
            // `height: auto` plus `object-fit: contain` keeps the aspect ratio.
            styleParts.push(`max-height: ${h}px`);
        } else if (align !== 'full') {
            styleParts.push('max-height: 480px');
        }

        const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
        return `<img src="${src}" alt="${alt}" style="${styleParts.join('; ')}"${attrStr} />`;
    }

    /**
     * Mark the size preset button (if any) that matches the current
     * width/height inputs as active; deactivate the rest.
     */
    static _syncPresetActive() {
        if (!this.presetButtons) return;
        const w = this.widthInput.value;
        const h = this.heightInput.value;
        let matched = false;
        this.presetButtons.forEach((btn) => {
            const bw = btn.dataset.w || '';
            const bh = btn.dataset.h || '';
            const isMatch = bw === w && bh === h;
            btn.classList.toggle('active', isMatch);
            if (isMatch) matched = true;
        });
        if (!matched) {
            // No preset matches — leave all inactive.
        }
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
