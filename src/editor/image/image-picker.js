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
import { DeckImagesResolver } from "./deck-images-resolver.js";
import { Logger } from "../../core/logger.js";
import { modalOpened, modalClosed } from "../ui/modal-state.js";

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
  static selectedAlign = "center";
  static selectedFreeflow = false;
  static onSelectCallback = null;
  static _preferredArea = null;

  /** Currently selected image path (or URL). */
  static selectedPath = "";

  /** Image cache so we can swap preview without re-fetching. */
  static _availableImages = [];

  /**
   * Clear the cached image list so the picker re-fetches on next open.
   */
  static clearImageCache() {
    this._availableImages = [];
  }

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
    const wrapper = document.createElement("div");
    wrapper.id = "imagePickerModal";
    wrapper.className = "modal image-picker-modal webdeck-hidden";
    wrapper.setAttribute("role", "dialog");
    wrapper.setAttribute("aria-modal", "true");
    wrapper.setAttribute("aria-labelledby", "imagePickerTitle");

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
                                <button type="button" class="image-picker-preset-btn" data-w="50" data-h="320">Small</button>
                                <button type="button" class="image-picker-preset-btn" data-w="70" data-h="320">Medium</button>
                                <button type="button" class="image-picker-preset-btn" data-w="90" data-h="320">Large</button>
                                <button type="button" class="image-picker-preset-btn" data-w="100" data-h="">Full</button>
                            </div>
                            <div class="image-picker-custom-size">
                                <input id="imagePickerWidth" type="number" class="image-picker-size-input" min="1" max="100" placeholder="auto" title="Width as percentage of slide" />
                                <span class="image-picker-size-label">% ×</span>
                                <input id="imagePickerHeight" type="number" class="image-picker-size-input" min="1" max="2000" placeholder="320" title="Max-height in pixels (aspect ratio is preserved)" />
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
                        <div class="image-picker-option-group">
                            <button type="button" class="image-picker-chip-btn" id="imagePickerFreeflowBtn" data-action="freeflow" aria-pressed="false" title="Float: image detaches from normal flow, other elements ignore it">✈ Float</button>
                        </div>
                    </div>
                    <button id="imagePickerInsertBtn" class="image-picker-insert-btn" type="button" disabled>Insert</button>
                </div>
            </div>
        `;

    document.body.appendChild(wrapper);

    this.modal = wrapper;
    this.tabButtons = wrapper.querySelectorAll(".image-picker-tab");
    this.tabPanels = wrapper.querySelectorAll(".image-picker-tab-panel");
    this.grid = wrapper.querySelector("#imagePickerGrid");
    this.urlInput = wrapper.querySelector("#imagePickerUrlInput");
    this.urlPreview = wrapper.querySelector("#imagePickerUrlPreview");
    this.fileInput = wrapper.querySelector("#imagePickerFileInput");
    this.uploadZone = wrapper.querySelector("#imagePickerUploadZone");
    this.widthInput = wrapper.querySelector("#imagePickerWidth");
    this.heightInput = wrapper.querySelector("#imagePickerHeight");
    this.insertBtn = wrapper.querySelector("#imagePickerInsertBtn");
    this.presetButtons = wrapper.querySelectorAll(".image-picker-preset-btn");
    this.alignButtons = wrapper.querySelectorAll(".image-picker-align-btn");
    this.freeflowBtn = wrapper.querySelector("#imagePickerFreeflowBtn");
  }

  /**
   * Wire up event handlers.  Idempotent.
   * @private
   */
  static _wireEvents() {
    if (!this.modal || this.modal.dataset.wired === "1") return;
    this.modal.dataset.wired = "1";

    const close = () => this.hide();

    this.modal.querySelector("#imagePickerOverlay").addEventListener("click", close);
    this.modal.querySelector("#closeImagePickerBtn").addEventListener("click", close);

    // Prevent browser default navigation when dropping files anywhere on the modal
    this.modal.addEventListener("dragover", (e) => e.preventDefault());
    this.modal.addEventListener("drop", (e) => e.preventDefault());

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.modal.classList.contains("webdeck-hidden")) {
        close();
      }
    });

    // Tab switching
    this.tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.tab;
        this.tabButtons.forEach((b) => b.classList.toggle("active", b === btn));
        this.tabPanels.forEach((p) => p.classList.toggle("active", p.dataset.panel === target));
        if (target === "existing") this._refreshGrid();
      });
    });

    // URL input → preview + enable insert
    this.urlInput.addEventListener("input", () => {
      const url = this.urlInput.value.trim();
      this.selectedPath = url;
      if (url) {
        this.urlPreview.src = url;
        this.urlPreview.style.display = "";
        this.urlPreview.onerror = () => {
          this.urlPreview.style.display = "none";
        };
      } else {
        this.urlPreview.style.display = "none";
      }
      this._syncInsertButton();
    });

    // Upload zone — click + drag-drop
    this.uploadZone.addEventListener("click", () => this.fileInput.click());
    this.uploadZone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.fileInput.click();
      }
    });

    ["dragenter", "dragover"].forEach((evt) => {
      this.uploadZone.addEventListener(evt, (e) => {
        e.preventDefault();
        this.uploadZone.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach((evt) => {
      this.uploadZone.addEventListener(evt, (e) => {
        e.preventDefault();
        this.uploadZone.classList.remove("dragover");
      });
    });
    this.uploadZone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer?.files?.[0];
      if (file) this._handleUploadFile(file);
    });

    this.fileInput.addEventListener("change", () => {
      const file = this.fileInput.files?.[0];
      if (file) this._handleUploadFile(file);
      this.fileInput.value = "";
    });

    // Size presets — clicking applies the preset and updates the active state
    this.presetButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const w = btn.dataset.w || "";
        const h = btn.dataset.h || "";
        this.widthInput.value = w;
        this.heightInput.value = h;
        this._syncPresetActive();
      });
    });

    // Custom size inputs clear any active preset
    [this.widthInput, this.heightInput].forEach((input) => {
      input.addEventListener("input", () => this._syncPresetActive());
    });

    // Alignment buttons
    this.alignButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const align = btn.dataset.align || "center";
        this.selectedAlign = align;
        this.alignButtons.forEach((b) => b.classList.toggle("active", b === btn));
        // "Full" alignment implies width=100
        if (align === "full") {
          this.widthInput.value = "100";
          this.heightInput.value = "";
        }
        this._syncPresetActive();
      });
    });

    // Free-flow toggle
    if (this.freeflowBtn) {
      this.freeflowBtn.addEventListener("click", () => {
        this.selectedFreeflow = !this.selectedFreeflow;
        this.freeflowBtn.classList.toggle("active", this.selectedFreeflow);
        this.freeflowBtn.setAttribute("aria-pressed", String(this.selectedFreeflow));
      });
    }

    // Insert
    this.insertBtn.addEventListener("click", () => this._confirm());
  }

  /**
   * Show the picker and load existing images.  The callback receives the
   * rendered `<img>` snippet ready to be inserted into markdown.
   *
   * @param {(snippet: string) => void} onSelect
   * @param {object} [options]
   * @param {boolean} [options.pathOnly=false] - When true, the picker
   *   hides size/alignment/insert controls and calls `onSelect(path)`
   *   with the chosen path string instead of a full `<img>` snippet.
   * @param {string|null} [options.areaName=null] - Target @area for the
   *   insertion (usually derived from the markdown cursor).  Used to measure
   *   the matching area and to report the destination back to the caller.
   */
  static async show(onSelect, { pathOnly = false, areaName = null } = {}) {
    this.init();
    this.onSelectCallback = onSelect;
    this._pathOnly = !!pathOnly;
    this._preferredArea = areaName || null;
    this.selectedPath = "";
    this.selectedFreeflow = false;

    // Default to "center" in @main areas and "left" in @title/secondary/...,
    // because non-main areas are narrow/centered and a left default puts the
    // image at the start of the content instead of floating in the middle.
    this.selectedAlign =
      this._resolveTargetArea()?.dataset?.areaName === "main" ? "center" : "left";

    // Default sizing: 800px wide, centered.  Users can override.
    this.widthInput.value = "320";
    this.heightInput.value = "";
    this.urlInput.value = "";
    this.urlPreview.style.display = "none";
    // Reset align buttons
    this.alignButtons.forEach((b) =>
      b.classList.toggle("active", b.dataset.align === this.selectedAlign),
    );
    // Reset freeflow button
    if (this.freeflowBtn) {
      this.freeflowBtn.classList.remove("active");
      this.freeflowBtn.setAttribute("aria-pressed", "false");
    }
    // Toggle UI mode
    this.modal.classList.toggle("image-picker-modal--path-only", this._pathOnly);
    this._syncInsertButton();
    this._syncPresetActive();
    this.modal.classList.remove("webdeck-hidden");
    modalOpened();
    // Default to "Existing" tab
    this.tabButtons.forEach((b) => b.classList.toggle("active", b.dataset.tab === "existing"));
    this.tabPanels.forEach((p) => p.classList.toggle("active", p.dataset.panel === "existing"));
    await this._refreshGrid();
  }

  static hide() {
    if (this.modal) {
      this.modal.classList.add("webdeck-hidden");
      modalClosed();
    }
  }

  /**
   * Fetch the list of existing images from the server and render the grid.
   * @private
   */
  static async _refreshGrid() {
    if (!this.grid) return;
    this.grid.innerHTML = `<div class="image-picker-empty"><div class="image-picker-empty-icon">⏳</div>Loading…</div>`;

    try {
      const res = await fetch("/api/images");
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      let images = (data.images || []).map(({ name, path }) => ({ name, path }));

      // Filter to only images referenced in the current deck markdown
      const markdown = localStorage.getItem("webdeck_local_file") || "";
      if (markdown) {
        const referenced = new Set();
        for (const img of images) {
          if (markdown.includes(img.name) || markdown.includes(img.path)) {
            referenced.add(img.name);
          }
        }
        if (referenced.size > 0) {
          images = images.filter((img) => referenced.has(img.name));
        }
      }

      this._availableImages = images;
      this._renderGrid();
    } catch (err) {
      Logger.warn("Failed to load images:", err);
      this.grid.innerHTML = `<div class="image-picker-empty"><div class="image-picker-empty-icon">⚠</div>Could not load images.<br/><small>${escapeText(err.message)}</small></div>`;
    }
  }

  static _renderGrid() {
    if (!this._availableImages.length) {
      this.grid.innerHTML = `<div class="image-picker-empty"><div class="image-picker-empty-icon">📁</div>No images yet.<br/><small>Upload or add files to <code>images/</code>.</small></div>`;
      return;
    }

    // Sort newest first when filename starts with a timestamp
    const sorted = [...this._availableImages].sort((a, b) => b.name.localeCompare(a.name));

    this.grid.innerHTML = sorted
      .map(
        (img) => `
                <div class="image-picker-item" data-path="${escapeAttr(img.path)}" tabindex="0" role="button" aria-label="${escapeAttr(img.name)}" draggable="true">
                    <img src="${escapeAttr(img.path)}?v=${DeckImagesResolver._cacheVersion}" alt="${escapeAttr(img.name)}" loading="lazy" />
                    <div class="image-picker-item-name">${escapeText(img.name)}</div>
                </div>
            `,
      )
      .join("");

    this.grid.querySelectorAll(".image-picker-item").forEach((el) => {
      el.addEventListener("click", () => this._selectExisting(el));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this._selectExisting(el);
        }
      });
      // Drag-to-insert: carry the path so the slide drop handler can
      // build an <img> snippet at the cursor position.
      el.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/x-webdeck-image", el.dataset.path);
        e.dataTransfer.effectAllowed = "copy";
        // Use the thumbnail as the drag image for nicer feedback.
        const thumb = el.querySelector("img");
        if (thumb) {
          try {
            e.dataTransfer.setDragImage(thumb, 24, 24);
          } catch (_) {
            /* ignore */
          }
        }
      });
    });
  }

  static _selectExisting(el) {
    const path = el.dataset.path;
    this.selectedPath = path;
    this.grid
      .querySelectorAll(".image-picker-item")
      .forEach((i) => i.classList.toggle("selected", i === el));
    this._syncInsertButton();
  }

  /**
   * Upload a file via the dev server endpoint and select the resulting path.
   * @private
   */
  static async _handleUploadFile(file) {
    const allowed = /\.(jpe?g|png|gif|webp|svg|avif)$/i;
    if (!allowed.test(file.name)) {
      this.uploadZone.innerHTML = `<div class="image-picker-upload-icon">✗</div><div>Unsupported image type: ${escapeText(file.name)}</div>`;
      return;
    }

    this.uploadZone.innerHTML = `<div class="image-picker-upload-icon">⏳</div><div>Uploading…</div>`;

    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/upload-image", { method: "POST", body: formData });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const result = await res.json();
      this.selectedPath = result.path;
      await this._refreshGrid();
      this.uploadZone.innerHTML = `
                    <img src="${escapeAttr(result.path)}" alt="${escapeAttr(file.name)}" class="image-picker-upload-preview" />
                    <div style="opacity: 0.7; margin-top: 4px; font-size: 11px;">Uploaded — click Insert or pick another file.</div>
                `;
      this._syncInsertButton();
      return;
    } catch (err) {
      this.uploadZone.innerHTML = `
                <div class="image-picker-upload-icon">✗</div>
                <div>Upload failed: ${escapeText(err.message)}</div>
                <div style="opacity: 0.7; margin-top: 4px; font-size: 11px;">Click to try again.</div>
            `;
      return;
    }
  }

  static _syncInsertButton() {
    const ok = !!this.selectedPath;
    this.insertBtn.disabled = !ok;
  }

  static _confirm() {
    if (!this.selectedPath || !this.onSelectCallback) return;
    const cb = this.onSelectCallback;
    this.hide();
    if (this._pathOnly) {
      // Caller wants just the relative path.
      cb(this.selectedPath);
      return;
    }
    const { snippet, areaName } = this._buildSnippet(this.selectedPath);
    cb(snippet, areaName);
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
    const alt =
      src
        .split("/")
        .pop()
        .replace(/\.[^.]+$/, "")
        .replace(/^\d+[-_]?/, "") || "image";

    let w = parseInt(this.widthInput.value, 10);
    let h = parseInt(this.heightInput.value, 10);

    if (!Number.isFinite(w) || w <= 0) w = 800;

    // Measure the area the image is being inserted into so alignment offsets
    // are computed against the correct content width.
    const targetArea = this._resolveTargetArea();
    const areaName = targetArea?.dataset?.areaName ?? this._preferredArea ?? "main";
    const cs = targetArea ? getComputedStyle(targetArea) : null;
    const padL = parseFloat(cs?.paddingLeft) || 0;
    const padR = parseFloat(cs?.paddingRight) || 0;
    const padT = parseFloat(cs?.paddingTop) || 0;
    const padB = parseFloat(cs?.paddingBottom) || 0;
    const contentW = targetArea ? targetArea.clientWidth - padL - padR : w;
    const areaHeight = targetArea ? targetArea.clientHeight - padT - padB : 320;

    // Use absolute positioning only when the user explicitly chooses free-flow.
    // For @title and other non-@main areas we keep position: relative and let
    // the CSS turn the containing paragraph into a full-width block.
    const isFloating = this.selectedFreeflow;
    let left = 0;
    let top = 0;
    if (isFloating) {
      // For position: absolute, left/top are from the slide area's padding edge,
      // so we add the padding to align inside the content box.
      if (this.selectedAlign === "center") {
        left = Math.max(0, padL + Math.round((contentW - w) / 2));
      } else if (this.selectedAlign === "right") {
        left = Math.max(0, padL + contentW - w);
      } else {
        left = Math.max(0, padL);
      }
      top = Math.max(0, padT);
    } else {
      if (this.selectedAlign === "center") {
        left = Math.max(0, Math.round((contentW - w) / 2));
      } else if (this.selectedAlign === "right") {
        left = Math.max(0, contentW - w);
      }
    }

    const maxHeight = Number.isFinite(h) && h > 0 ? h : areaHeight;

    const styleParts = [
      isFloating ? "position: absolute" : "position: relative",
      `left: ${Math.round(left)}px`,
      `top: ${Math.round(top)}px`,
      `width: ${w}px`,
      `max-height: ${maxHeight}px`,
      "border: none",
      "object-fit: contain",
      "cursor: move",
    ];

    const classAttr = this.selectedFreeflow ? ' class="img-freeflow"' : ' class="img-positioned"';
    const snippet = `<img${classAttr} src="${src}" alt="${alt}" style="${styleParts.join("; ")}" />`;
    return { snippet, areaName };
  }

  /**
   * Resolve the slide area element the image will be inserted into: the
   * caller-provided area (cursor-derived) when it exists on the active slide,
   * otherwise @main, otherwise the first area.
   * @private
   * @returns {HTMLElement|null}
   */
  static _resolveTargetArea() {
    const base = "#stageInner .slide.active .slide__area";
    const preferred = /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(this._preferredArea || "")
      ? document.querySelector(`${base}[data-area-name='${this._preferredArea}']`)
      : null;
    return (
      preferred ||
      document.querySelector(`${base}[data-area-name='main']`) ||
      document.querySelector(base)
    );
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
      const bw = btn.dataset.w || "";
      const bh = btn.dataset.h || "";
      const isMatch = bw === w && bh === h;
      btn.classList.toggle("active", isMatch);
      if (isMatch) matched = true;
    });
    if (!matched) {
      // No preset matches — leave all inactive.
    }
  }
}

function escapeText(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(text) {
  return String(text).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
