import { getStageScale } from "./image-position-presets.js";
import { updateBackgroundDirective, updateThemeDirective } from "../core/directive-utils.js";
import {
  parseImagesInArea,
  parseAllImages,
  getImageOrdinalIndexInArea,
  getImageOrdinalIndex,
  readImageSettings,
} from "./image-markdown-utils.js";
import { iconString, icon } from "../../core/icon.js";

/**
 * ImagePropertiesPanel
 *
 * Tabbed popover for repositioning, resizing, and styling images in the
 * slide preview.  Works with ImageInteractionHandler for drag/resize and
 * provides precise numeric inputs plus style controls (opacity, radius,
 * rotation, flip, brightness/contrast/saturate) and alt-text /
 * replace-image actions.
 *
 * Design principle: the markdown source is the single source of truth.
 * We always parse styles from the markdown, apply changes, and write back.
 *
 * Tabs:
 *   • Size      — Replace / Delete at the top (the two most-used
 *                 actions), then W×H, aspect-ratio lock, presets
 *                 (Small/Medium/Large/Fit/Center)
 *   • Style     — opacity, corner radius, brightness/contrast/saturate
 *   • Transform — rotation, flip, alt-text
 */

// Fields that map directly to applySettings keys.
const DIRECT_FIELDS = new Set([
  "width",
  "height",
  "borderRadius",
  "opacity",
  "rotation",
  "brightness",
  "contrast",
  "saturate",
  "alt",
]);

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
    this._syncFreeflowBtn();
    this._activateTab("size");
    this.el.classList.remove("webdeck-hidden");

    const rect = img.getBoundingClientRect();
    const panelH = this.el.offsetHeight || 220;
    const panelW = this.el.offsetWidth || 300;
    const scale = getStageScale();

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
    if (this.el && this.isVisible()) {
      this.el.classList.add("webdeck-hidden");
      this._currentImg = null;
    }
  }

  static isVisible() {
    return this.el && !this.el.classList.contains("webdeck-hidden");
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
    const scale = getStageScale();
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
                <button type="button" class="image-properties-panel__tab" data-tab="style" role="tab">Style</button>
                <button type="button" class="image-properties-panel__tab" data-tab="transform" role="tab">Transform</button>
            </div>

            <div class="image-properties-panel__body">
                <!-- Size tab -->
                <div class="image-properties-panel__panel active" data-panel="size">
                    <div class="image-properties-panel__row">
                        <button type="button" class="image-properties-panel__btn" data-action="replace">
                            <span>Replace</span>
                        </button>
                        <button type="button" class="image-properties-panel__btn image-properties-panel__btn--danger" data-action="delete">
                            <span>Delete</span>
                        </button>
                    </div>
                    <div class="image-properties-panel__row">
                        <button type="button" class="image-properties-panel__btn" data-action="set-background">
                            <span>Set as Background</span>
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
                        <button type="button" class="image-properties-panel__icon-btn" data-action="toggle-lock" title="Lock aspect ratio" aria-pressed="true">${iconString("lock", { size: "sm" })}</button>
                    </div>
                    <div class="image-properties-panel__row">
                        <button type="button" class="image-properties-panel__chip" data-action="small">Small</button>
                        <button type="button" class="image-properties-panel__chip" data-action="medium">Medium</button>
                        <button type="button" class="image-properties-panel__chip" data-action="large">Large</button>
                        <button type="button" class="image-properties-panel__chip" data-action="full">Fit</button>
                        <button type="button" class="image-properties-panel__chip" data-action="fill" title="Fill the container (cover)">Fill</button>
                    </div>
                    <div class="image-properties-panel__row">
                        <button type="button" class="image-properties-panel__chip" data-action="align-left" title="Align left">${iconString("arrow-left", { size: "xs" })} Left</button>
                        <button type="button" class="image-properties-panel__chip" data-action="center" title="Center horizontally">${iconString("arrow-left-right", { size: "xs" })} Center</button>
                        <button type="button" class="image-properties-panel__chip" data-action="align-right" title="Align right">Right ${iconString("arrow-right", { size: "xs" })}</button>
                    </div>
                    <div class="image-properties-panel__row">
                        <button type="button" class="image-properties-panel__chip" data-action="toggle-freeflow" title="Float: image detaches from normal flow, other elements ignore it">${iconString("plane", { size: "xs" })} Float</button>
                    </div>
                </div>

                <!-- Style tab -->
                <div class="image-properties-panel__panel" data-panel="style">
                    <div class="image-properties-panel__section-label">Appearance</div>
                    <div class="image-properties-panel__control-row">
                        <span class="image-properties-panel__control-label">Opacity</span>
                        <input type="range" class="image-properties-panel__slider" data-field="opacity" min="0" max="100" step="1" />
                        <span class="image-properties-panel__control-value" data-display="opacity">100%</span>
                    </div>
                    <div class="image-properties-panel__control-row">
                        <span class="image-properties-panel__control-label">Radius</span>
                        <input type="range" class="image-properties-panel__slider" data-field="borderRadius" min="0" max="540" step="1" />
                        <span class="image-properties-panel__control-value" data-display="radius">0px</span>
                        <button type="button" class="image-properties-panel__chip" data-action="pill" title="Pill / circle">Pill</button>
                    </div>

                    <div class="image-properties-panel__section-label">Adjust</div>
                    <div class="image-properties-panel__control-row">
                        <span class="image-properties-panel__control-label">Bright</span>
                        <input type="number" class="image-properties-panel__input image-properties-panel__input--adjust" data-field="brightness" min="0" max="200" step="5" value="100" title="Brightness %" />
                        <span class="image-properties-panel__control-suffix">%</span>
                    </div>
                    <div class="image-properties-panel__control-row">
                        <span class="image-properties-panel__control-label">Contrast</span>
                        <input type="number" class="image-properties-panel__input image-properties-panel__input--adjust" data-field="contrast" min="0" max="200" step="5" value="100" title="Contrast %" />
                        <span class="image-properties-panel__control-suffix">%</span>
                    </div>
                    <div class="image-properties-panel__control-row">
                        <span class="image-properties-panel__control-label">Saturate</span>
                        <input type="number" class="image-properties-panel__input image-properties-panel__input--adjust" data-field="saturate" min="0" max="200" step="5" value="100" title="Saturation %" />
                        <span class="image-properties-panel__control-suffix">%</span>
                    </div>
                </div>

                <!-- Transform tab -->
                <div class="image-properties-panel__panel" data-panel="transform">
                    <div class="image-properties-panel__section-label">Rotation</div>
                    <div class="image-properties-panel__control-row">
                        <button type="button" class="image-properties-panel__icon-btn" data-action="rot-left" title="Rotate 90° left">${iconString("rotate-ccw", { size: "sm" })}</button>
                        <input type="range" class="image-properties-panel__slider" data-field="rotation" min="0" max="360" step="1" />
                        <span class="image-properties-panel__control-value" data-display="rotation">0°</span>
                        <button type="button" class="image-properties-panel__icon-btn" data-action="rot-right" title="Rotate 90° right">${iconString("rotate-cw", { size: "sm" })}</button>
                    </div>
                    <div class="image-properties-panel__section-label">Flip</div>
                    <div class="image-properties-panel__control-row">
                        <button type="button" class="image-properties-panel__chip" data-action="flip-h" title="Flip horizontal">${iconString("arrow-left-right", { size: "sm" })} Flip H</button>
                        <button type="button" class="image-properties-panel__chip" data-action="flip-v" title="Flip vertical">${iconString("arrow-up-down", { size: "sm" })} Flip V</button>
                    </div>
                    <div class="image-properties-panel__section-label">Alt text</div>
                    <div class="image-properties-panel__row">
                        <input type="text" class="image-properties-panel__text" data-field="alt" placeholder="Describe the image" />
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

    // Number/text/range inputs that map to settings fields.
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
  }

  static async _handleAction(action, btn) {
    const { ImageInteractionHandler } = await import("./image-interaction-handler.js");

    switch (action) {
      case "toggle-lock":
        this._aspectLocked = !this._aspectLocked;
        btn.setAttribute("aria-pressed", String(this._aspectLocked));
        btn.replaceChildren(icon(this._aspectLocked ? "lock" : "lock-open", { size: "sm" }));
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
      case "fill":
        ImageInteractionHandler.fillContainer();
        break;
      case "center":
        ImageInteractionHandler.centerOnSlide();
        break;
      case "align-left":
        ImageInteractionHandler.alignLeft();
        break;
      case "align-right":
        ImageInteractionHandler.alignRight();
        break;
      case "toggle-freeflow":
        ImageInteractionHandler.toggleFreeflow();
        this._syncFreeflowBtn();
        break;
      case "rot-left":
        ImageInteractionHandler.rotateBy(-90);
        break;
      case "rot-right":
        ImageInteractionHandler.rotateBy(90);
        break;
      case "flip-h": {
        const cur = ImageInteractionHandler._selectedImg;
        const s = cur ? readImageSettings(cur) : {};
        ImageInteractionHandler.applySettings({ flipH: !s.flipH });
        break;
      }
      case "flip-v": {
        const cur = ImageInteractionHandler._selectedImg;
        const s = cur ? readImageSettings(cur) : {};
        ImageInteractionHandler.applySettings({ flipV: !s.flipV });
        break;
      }
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
      case "set-background":
        this._setAsBackground();
        break;
    }
  }

  static _applyPreset(overrides) {
    const current = this._collectSettings();
    // Size presets are the "normal image" path: they take the image out of
    // fill mode, so reset any object-fit: cover (Fill chip / imported
    // full-bleed) back to contain — otherwise the crop would persist with
    // no UI to undo it.
    let settings = { ...current, ...overrides, objectFit: "contain" };

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
      // A cleared number input has no value to apply — bail out before
      // propagating NaN into applySettings (which would produce invalid
      // CSS like `brightness(NaN)`).
      if (!Number.isFinite(value)) return;
    }
    const settings = {};

    if (field === "opacity") {
      settings.opacity = value / 100;
      this._updateDisplay("opacity", `${Math.round(value)}%`);
    } else if (field === "borderRadius") {
      settings.borderRadius = value;
      this._updateDisplay("radius", `${Math.round(value)}px`);
    } else if (field === "rotation") {
      settings.rotation = value;
      this._updateDisplay("rotation", `${Math.round(value)}°`);
    } else if (field === "brightness" || field === "contrast" || field === "saturate") {
      // Number inputs are 0–200 (percent); CSS values are 0–2 (1 = normal)
      settings[field] = value / 100;
    } else if (field === "width" || field === "height") {
      settings[field] = value;
      if (this._aspectLocked) {
        const ratio = this._lastRatio || null;
        if (ratio) {
          if (field === "width") settings.height = Math.round(value / ratio);
          else settings.width = Math.round(value * ratio);
        }
      }
    } else {
      settings[field] = value;
    }

    import("./image-interaction-handler.js").then(({ ImageInteractionHandler }) => {
      ImageInteractionHandler.applySettings(settings);
    });
  }

  /**
   * Update a display element's text content by data-display key.
   * @param {string} key
   * @param {string} text
   */
  static _updateDisplay(key, text) {
    const el = this.el?.querySelector(`[data-display="${key}"]`);
    if (el) el.textContent = text;
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

  static _setAsBackground() {
    const md = this._getMarkdown?.();
    const img = this._currentImg;
    if (!md || !img) return;

    const src = img.getAttribute("src");
    if (!src) return;

    const area = img.closest(".slide__area");
    const areaName = area?.dataset?.areaName;
    const entries = areaName ? parseImagesInArea(md, areaName) : parseAllImages(md);
    const idx = areaName ? getImageOrdinalIndexInArea(img) : getImageOrdinalIndex(img);
    if (idx < 0 || idx >= entries.length) return;

    const entry = entries[idx];

    const slideStart = (() => {
      const before = md.lastIndexOf("\n---\n", entry.start);
      return before === -1 ? 0 : before + 5;
    })();
    const slideEnd = (() => {
      const after = md.indexOf("\n---\n", entry.end);
      return after === -1 ? md.length : after;
    })();

    const slideMd = md.slice(slideStart, slideEnd);
    const bgValue = `linear-gradient(rgba(0,0,0,0.65),rgba(0,0,0,0.65)), url(${src}) center / cover no-repeat`;
    let updatedSlide = updateBackgroundDirective(slideMd, bgValue);
    updatedSlide = updateThemeDirective(updatedSlide, "dark");
    const updatedMd = md.slice(0, slideStart) + updatedSlide + md.slice(slideEnd);

    this.hide();
    this._setMarkdown?.(updatedMd);
  }

  /**
   * Collect current settings from the panel inputs.  Only collects
   * fields that map directly to applySettings keys.
   * @returns {object}
   */
  static _collectSettings() {
    const settings = {};
    const PERCENT_FIELDS = new Set(["opacity", "brightness", "contrast", "saturate"]);
    this.el.querySelectorAll("[data-field]").forEach((input) => {
      const field = input.dataset.field;
      if (!DIRECT_FIELDS.has(field)) return;
      if (input.type === "range" || input.type === "number") {
        const v = parseFloat(input.value);
        if (Number.isFinite(v)) settings[field] = PERCENT_FIELDS.has(field) ? v / 100 : v;
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
      // A field may have multiple inputs (e.g. radius has a range + number
      // pair); keep them all in sync.
      this.el.querySelectorAll(`[data-field="${field}"]`).forEach((input) => {
        if (input.type === "range" || input.type === "number") {
          input.value = Number.isFinite(val) ? val : "";
        } else {
          input.value = val ?? "";
        }
      });
    };
    setVal("width", s.width);
    setVal("height", s.height);
    setVal("left", s.left);
    setVal("top", s.top);
    setVal("borderRadius", s.borderRadius);
    setVal("alt", s.alt);
    setVal("opacity", Number.isFinite(s.opacity) ? Math.round(s.opacity * 100) : 100);
    setVal("rotation", Number.isFinite(s.rotation) ? s.rotation : 0);
    setVal("brightness", Number.isFinite(s.brightness) ? Math.round(s.brightness * 100) : 100);
    setVal("contrast", Number.isFinite(s.contrast) ? Math.round(s.contrast * 100) : 100);
    setVal("saturate", Number.isFinite(s.saturate) ? Math.round(s.saturate * 100) : 100);

    // Display labels
    this._updateDisplay("opacity", `${Math.round((s.opacity ?? 1) * 100)}%`);
    this._updateDisplay("rotation", `${Math.round(s.rotation ?? 0)}°`);
    this._updateDisplay("radius", `${Math.round(s.borderRadius ?? 0)}px`);

    // Flip button active state
    const flipHBtn = this.el.querySelector('[data-action="flip-h"]');
    if (flipHBtn) flipHBtn.classList.toggle("active", !!s.flipH);
    const flipVBtn = this.el.querySelector('[data-action="flip-v"]');
    if (flipVBtn) flipVBtn.classList.toggle("active", !!s.flipV);

    // Track last aspect ratio for lock behaviour
    if (s.width && s.height) this._lastRatio = s.width / s.height;
  }

  static _syncFreeflowBtn() {
    if (!this.el) return;
    const isFreeflow = this._currentImg?.classList.contains("img-freeflow") ?? false;
    const btn = this.el.querySelector('[data-action="toggle-freeflow"]');
    if (btn) {
      btn.classList.toggle("active", isFreeflow);
      btn.setAttribute("aria-pressed", String(isFreeflow));
    }
  }
}
