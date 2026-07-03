/**
 * ImagePropertiesPanel
 *
 * Tabbed popover for repositioning, resizing, and styling images in the
 * slide preview.  Works with ImageInteractionHandler for drag/resize and
 * provides precise numeric inputs plus style controls (opacity, radius,
 * shadow, rotation, z-order) and alt-text / replace-image actions.
 *
 * Design principle: the markdown source is the single source of truth.
 * We always parse styles from the markdown, apply changes, and write back.
 *
 * Tabs:
 *   • Size     — Replace / Delete at the top (the two most-used
 *                actions), then W×H, aspect-ratio lock, presets
 *                (Small/Medium/Large/Full/Center/Fit)
 *   • Position — X/Y, z-order (bring to front / send to back)
 *   • Style    — opacity, border-radius, shadow, rotation, alt-text
 *
 * Keyboard shortcuts are shown next to the buttons that own them
 * (Replace → R, Delete → Del) so the user can discover them.
 */

const SHADOW_PRESETS = [
  { key: "none", label: "None", value: "none" },
  { key: "subtle", label: "Subtle", value: "0 2px 6px rgba(0,0,0,0.25)" },
  { key: "medium", label: "Medium", value: "0 6px 16px rgba(0,0,0,0.35)" },
  { key: "strong", label: "Strong", value: "0 12px 32px rgba(0,0,0,0.5)" },
];

export class ImagePropertiesPanel {
  static el = null;
  static _wired = false;
  static _getMarkdown = null;
  static _setMarkdown = null;
  static _aspectLocked = true;
  static _lastRatio = null;
  static _currentImg = null;
  static _areaWidth = 960;

  /**
   * Initialize with callbacks that read/write the slide markdown.
   */
  static init(getMarkdown, setMarkdown) {
    this._getMarkdown = getMarkdown;
    this._setMarkdown = setMarkdown;
  }

  /**
   * Show the panel for the given image with its current settings.
   * The panel always opens on the first tab (Size) — the two most-used
   * actions (Replace / Delete) live there, so a fresh open should
   * surface them immediately rather than resuming whatever the user
   * had selected last time.
   * @param {HTMLElement} img
   * @param {object} settings - Parsed style settings (see ImageInteractionHandler._readSettings).
   */
  static show(img, settings) {
    if (!this.el) this._buildDom();
    this._currentImg = img;
    this._computeAreaWidth(img);
    this._syncUI(settings);
    this._updatePresetLabels();
    this._activateTab("size");
    this.el.classList.remove("webdeck-hidden");

    const rect = img.getBoundingClientRect();
    const panelH = this.el.offsetHeight || 220;
    const panelW = this.el.offsetWidth || 300;
    const scale = this._getStageScale();

    // Position panel to the left of the image
    let left = rect.left + window.scrollX - panelW - 8 * scale;
    let top = rect.top + window.scrollY + (rect.height - panelH) / 2;

    // If not enough space on the left, fall back to the right
    if (left < 8) {
      left = rect.right + window.scrollX + 8 * scale;
    }

    // Clamp to viewport so the panel stays fully visible
    left = Math.max(8, Math.min(left, window.innerWidth - panelW - 8));
    top = Math.max(8, Math.min(top, window.innerHeight + window.scrollY - panelH - 8));

    this.el.style.top = `${top}px`;
    this.el.style.left = `${left}px`;
  }

  static hide() {
    if (this.el) this.el.classList.add("webdeck-hidden");
  }

  static isVisible() {
    return this.el && !this.el.classList.contains("webdeck-hidden");
  }

  static _getStageScale() {
    const stage = document.querySelector(".stage__inner");
    if (!stage) return 1;
    const transform = getComputedStyle(stage).transform;
    if (!transform || transform === "none") return 1;
    const match = transform.match(/matrix\(([^,]+),/);
    return match ? parseFloat(match[1]) : 1;
  }

  /**
   * Compute the width of the containing .slide__area in design-space pixels.
   */
  static _computeAreaWidth(img) {
    const area = img?.closest?.(".slide__area");
    if (!area) {
      this._areaWidth = 960;
      return;
    }
    const scale = this._getStageScale();
    const rect = area.getBoundingClientRect();
    this._areaWidth = Math.round(rect.width / scale) || 960;
  }

  /**
   * Update the Small/Medium/Large chip labels to show computed pixel values.
   */
  static _updatePresetLabels() {
    if (!this.el) return;
  }

  // ── Panel UI ──────────────────────────────────────────────────────────

  static _buildDom() {
    const el = document.createElement("div");
    el.id = "imagePropertiesPanel";
    el.className = "image-properties-panel webdeck-hidden";
    el.setAttribute("role", "toolbar");
    el.setAttribute("aria-label", "Image properties");

    el.innerHTML = `
            <div class="image-properties-panel__tabs" role="tablist">
                <button type="button" class="image-properties-panel__tab active" data-tab="size" role="tab">Size</button>
                <button type="button" class="image-properties-panel__tab" data-tab="position" role="tab">Position</button>
                <button type="button" class="image-properties-panel__tab" data-tab="style" role="tab">Style</button>
            </div>

            <div class="image-properties-panel__body">
                <!-- Size tab -->
                <div class="image-properties-panel__panel active" data-panel="size">
                    <div class="image-properties-panel__row">
                        <button type="button" class="image-properties-panel__btn" data-action="replace">
                            <span>Replace</span>
                            <kbd class="image-properties-panel__hint">R</kbd>
                        </button>
                        <button type="button" class="image-properties-panel__btn image-properties-panel__btn--danger" data-action="delete">
                            <span>Delete</span>
                            <kbd class="image-properties-panel__hint">Del</kbd>
                        </button>
                    </div>
                    <div class="image-properties-panel__row">
                        <label class="image-properties-panel__field">
                            <span class="image-properties-panel__field-label">Width</span>
                            <input type="number" class="image-properties-panel__input" data-field="width" min="20" max="1920" placeholder="W" />
                        </label>
                        <label class="image-properties-panel__field">
                            <span class="image-properties-panel__field-label">Height</span>
                            <input type="number" class="image-properties-panel__input" data-field="height" min="20" max="1080" placeholder="H" />
                        </label>
                        <button type="button" class="image-properties-panel__icon-btn" data-action="toggle-lock" title="Lock aspect ratio" aria-pressed="true">🔒</button>
                    </div>
                    <div class="image-properties-panel__row">
                        <button type="button" class="image-properties-panel__chip" data-action="small">Small</button>
                        <button type="button" class="image-properties-panel__chip" data-action="medium">Medium</button>
                        <button type="button" class="image-properties-panel__chip" data-action="large">Large</button>
                        <button type="button" class="image-properties-panel__chip" data-action="full">Full</button>
                    </div>
                    <div class="image-properties-panel__row">
                        <button type="button" class="image-properties-panel__chip" data-action="center" title="Center on slide">⊞ Center</button>
                        <button type="button" class="image-properties-panel__chip" data-action="fit" title="Fit to slide width">↔ Fit width</button>
                    </div>

                </div>

                <!-- Position tab -->
                <div class="image-properties-panel__panel" data-panel="position">
                    <div class="image-properties-panel__row">
                        <label class="image-properties-panel__field">
                            <span class="image-properties-panel__field-label">X</span>
                            <input type="number" class="image-properties-panel__input" data-field="left" min="0" max="1920" placeholder="X" />
                        </label>
                        <label class="image-properties-panel__field">
                            <span class="image-properties-panel__field-label">Y</span>
                            <input type="number" class="image-properties-panel__input" data-field="top" min="0" max="1080" placeholder="Y" />
                        </label>
                    </div>
                    <div class="image-properties-panel__row">
                        <span class="image-properties-panel__field-label">Layer</span>
                        <button type="button" class="image-properties-panel__icon-btn" data-action="front" title="Bring to front">⬆ Front</button>
                        <button type="button" class="image-properties-panel__icon-btn" data-action="back" title="Send to back">⬇ Back</button>
                    </div>
                </div>

                <!-- Style tab -->
                <div class="image-properties-panel__panel" data-panel="style">
                    <div class="image-properties-panel__row">
                        <label class="image-properties-panel__field image-properties-panel__field--grow">
                            <span class="image-properties-panel__field-label">Opacity <span data-display="opacity">100%</span></span>
                            <input type="range" class="image-properties-panel__range" data-field="opacity" min="0" max="100" step="1" />
                        </label>
                    </div>
                    <div class="image-properties-panel__row">
                        <label class="image-properties-panel__field">
                            <span class="image-properties-panel__field-label">Radius (px)</span>
                            <input type="number" class="image-properties-panel__input" data-field="borderRadius" min="0" max="540" placeholder="0" />
                        </label>
                        <button type="button" class="image-properties-panel__chip" data-action="pill" title="Pill / circle">Pill</button>
                    </div>
                    <div class="image-properties-panel__row">
                        <span class="image-properties-panel__field-label">Shadow</span>
                        <div class="image-properties-panel__seg" role="group" aria-label="Shadow">
                            ${SHADOW_PRESETS.map((p) => `<button type="button" class="image-properties-panel__seg-btn" data-shadow="${p.key}" title="${p.label}">${p.label}</button>`).join("")}
                        </div>
                    </div>
                    <div class="image-properties-panel__row">
                        <span class="image-properties-panel__field-label">Rotate</span>
                        <button type="button" class="image-properties-panel__icon-btn" data-action="rot-left" title="Rotate 90° left">↺</button>
                        <input type="range" class="image-properties-panel__range image-properties-panel__range--grow" data-field="rotation" min="0" max="360" step="1" />
                        <button type="button" class="image-properties-panel__icon-btn" data-action="rot-right" title="Rotate 90° right">↻</button>
                        <span class="image-properties-panel__field-label" data-display="rotation">0°</span>
                    </div>
                    <div class="image-properties-panel__row">
                        <label class="image-properties-panel__field image-properties-panel__field--grow">
                            <span class="image-properties-panel__field-label">Alt text</span>
                            <input type="text" class="image-properties-panel__text" data-field="alt" placeholder="Describe the image" />
                        </label>
                    </div>
                </div>
            </div>
        `;

    document.body.appendChild(el);
    this.el = el;
    this._wireEvents();
  }

  /**
   * Activate one of the panel's tabs (and matching content panel).
   * The active state lives entirely in the DOM `.active` class — we
   * don't remember it across show/hide so the panel always opens
   * back on the first tab (the one with Replace / Delete).
   */
  static _activateTab(name) {
    if (!this.el) return;
    this.el
      .querySelectorAll(".image-properties-panel__tab")
      .forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    this.el
      .querySelectorAll(".image-properties-panel__panel")
      .forEach((p) => p.classList.toggle("active", p.dataset.panel === name));
  }

  static _wireEvents() {
    if (this._wired) return;
    this._wired = true;

    // Dismiss when clicking outside the panel and outside images
    document.addEventListener("mousedown", (e) => {
      if (!this.isVisible()) return;
      if (this.el.contains(e.target)) return;
      if (e.target.closest("img")) return;
      if (e.target.closest(".image-overlay")) return;
      this.hide();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isVisible()) this.hide();
    });

    // Tab switching
    this.el.querySelectorAll(".image-properties-panel__tab").forEach((tab) => {
      tab.addEventListener("click", () => this._activateTab(tab.dataset.tab));
    });

    // Number/text/range inputs that map directly to settings fields
    this.el.querySelectorAll("[data-field]").forEach((input) => {
      const handler = () => this._applyFromInput(input);
      input.addEventListener("change", handler);
      if (input.type === "range") {
        input.addEventListener("input", handler);
      } else if (input.tagName === "INPUT") {
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handler();
          }
        });
      }
    });

    // Action buttons
    this.el.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => this._handleAction(btn.dataset.action, btn));
    });

    // Shadow preset buttons
    this.el.querySelectorAll("[data-shadow]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.shadow;
        const preset = SHADOW_PRESETS.find((p) => p.key === key);
        if (!preset) return;
        this.el
          .querySelectorAll("[data-shadow]")
          .forEach((b) => b.classList.toggle("active", b === btn));
        import("./image-interaction-handler.js").then(({ ImageInteractionHandler }) => {
          ImageInteractionHandler.applySettings({ boxShadow: preset.value });
        });
      });
    });
  }

  static async _handleAction(action, btn) {
    const { ImageInteractionHandler } = await import("./image-interaction-handler.js");

    switch (action) {
      case "toggle-lock":
        this._aspectLocked = !this._aspectLocked;
        btn.setAttribute("aria-pressed", String(this._aspectLocked));
        btn.textContent = this._aspectLocked ? "🔒" : "🔓";
        ImageInteractionHandler.setAspectLock(this._aspectLocked);
        break;
      case "small":
        this._applyPreset({ width: Math.min(240, this._areaWidth) });
        break;
      case "medium":
        this._applyPreset({ width: Math.min(480, this._areaWidth) });
        break;
      case "large":
        this._applyPreset({ width: Math.min(720, this._areaWidth) });
        break;
      case "full":
        ImageInteractionHandler.fitToWidth();
        break;
      case "center":
        ImageInteractionHandler.centerOnSlide();
        break;
      case "fit":
        ImageInteractionHandler.fitToWidth();
        break;
      case "front":
        ImageInteractionHandler.bringToFront();
        break;
      case "back":
        ImageInteractionHandler.sendToBack();
        break;
      case "rot-left":
        ImageInteractionHandler.rotateBy(-90);
        break;
      case "rot-right":
        ImageInteractionHandler.rotateBy(90);
        break;
      case "pill":
        ImageInteractionHandler.applySettings({ borderRadius: 999 });
        break;
      case "delete":
        ImageInteractionHandler.deleteSelected();
        this.hide();
        break;
      case "replace":
        this._openReplacePicker();
        break;
    }
  }

  static _applyPreset(overrides) {
    const current = this._collectSettings();
    let settings = { ...current, ...overrides };

    // If aspect ratio is locked and width is being set, calculate height
    if (this._aspectLocked && settings.width) {
      // Use explicit height if set, otherwise use image's actual visual height
      const effectiveHeight =
        current.height || (this._currentImg ? this._currentImg.offsetHeight : null);
      if (effectiveHeight) {
        const ratio = current.width / effectiveHeight;
        settings.height = Math.round(settings.width / ratio);
      }
    }

    import("./image-interaction-handler.js").then(({ ImageInteractionHandler }) => {
      ImageInteractionHandler.applySettings(settings);
    });
  }

  static _applyFromInput(input) {
    const field = input.dataset.field;
    let value = input.value;
    if (input.type === "range" || input.type === "number") {
      value = parseFloat(input.value);
      if (!Number.isFinite(value)) value = undefined;
    }
    const settings = { [field]: value };

    // Aspect-ratio lock for width/height edits
    if ((field === "width" || field === "height") && this._aspectLocked) {
      const ratio = this._lastRatio || null;
      if (ratio) {
        if (field === "width") settings.height = Math.round(value / ratio);
        else settings.width = Math.round(value * ratio);
      }
    }

    // Opacity is 0–100 in UI; convert to 0–1
    if (field === "opacity") {
      settings.opacity = value / 100;
    }

    import("./image-interaction-handler.js").then(({ ImageInteractionHandler }) => {
      ImageInteractionHandler.applySettings(settings);
    });
  }

  static _openReplacePicker() {
    import("./image-picker.js").then(({ ImagePicker }) => {
      ImagePicker.show(
        (path) => {
          import("./image-interaction-handler.js").then(({ ImageInteractionHandler }) => {
            ImageInteractionHandler.updateAttribute("src", path);
          });
        },
        { pathOnly: true },
      );
    });
  }

  static _collectSettings() {
    const settings = {};
    this.el.querySelectorAll("[data-field]").forEach((input) => {
      const field = input.dataset.field;
      if (input.type === "range" || input.type === "number") {
        const v = parseFloat(input.value);
        if (Number.isFinite(v)) settings[field] = field === "opacity" ? v / 100 : v;
      } else if (input.value) {
        settings[field] = input.value;
      }
    });
    return settings;
  }

  static _readWidth() {
    return parseFloat(this.el.querySelector('[data-field="width"]')?.value) || 400;
  }
  static _readHeight() {
    return parseFloat(this.el.querySelector('[data-field="height"]')?.value) || 300;
  }

  /**
   * Sync the panel UI to reflect the given settings.
   * @param {object} s
   */
  static _syncUI(s) {
    if (!this.el) return;
    const setVal = (field, val) => {
      const input = this.el.querySelector(`[data-field="${field}"]`);
      if (!input) return;
      if (input.type === "range" || input.type === "number") {
        input.value = Number.isFinite(val) ? val : "";
      } else {
        input.value = val ?? "";
      }
    };
    setVal("width", s.width);
    setVal("height", s.height);
    setVal("left", s.left);
    setVal("top", s.top);
    setVal("borderRadius", s.borderRadius);
    setVal("alt", s.alt);
    setVal("opacity", Number.isFinite(s.opacity) ? Math.round(s.opacity * 100) : 100);
    setVal("rotation", Number.isFinite(s.rotation) ? s.rotation : 0);

    // Display labels
    const opDisplay = this.el.querySelector('[data-display="opacity"]');
    if (opDisplay) opDisplay.textContent = `${Math.round((s.opacity ?? 1) * 100)}%`;
    const rotDisplay = this.el.querySelector('[data-display="rotation"]');
    if (rotDisplay) rotDisplay.textContent = `${Math.round(s.rotation ?? 0)}°`;

    // Shadow preset active state
    this.el
      .querySelectorAll("[data-shadow]")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.shadow === this._shadowKeyFromValue(s.boxShadow)),
      );

    // Track last aspect ratio for lock behaviour
    if (s.width && s.height) this._lastRatio = s.width / s.height;
  }

  static _shadowKeyFromValue(value) {
    if (!value || value === "none") return "none";
    const preset = SHADOW_PRESETS.find((p) => p.value === value);
    return preset ? preset.key : "";
  }
}
