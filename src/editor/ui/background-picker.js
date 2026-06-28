/**
 * BackgroundPicker
 *
 * Modal that lets the user pick a background for the current slide.  Three
 * tabs:
 *   1. Solid color — a curated palette + native color input.
 *   2. Gradient   — preset linear gradients.
 *   3. Custom CSS — a textarea that accepts any CSS `background` value.
 *
 * The chosen value is emitted as a plain CSS string (e.g. "#ff0000" or
 * "linear-gradient(...)").  The caller is responsible for writing it into
 * the slide markdown via `updateBackgroundDirective`.
 */

import { DeckImagesResolver } from "../image/deck-images-resolver.js";

const COLOR_SWATCHES = [
  { name: "White", value: "#ffffff" },
  { name: "Slate", value: "#1e293b" },
  { name: "Ink", value: "#0f172a" },
  { name: "Sky", value: "#0ea5e9" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Pink", value: "#ec4899" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Lime", value: "#84cc16" },
  { name: "Emerald", value: "#10b981" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Sand", value: "#f5f5dc" },
  { name: "Paper", value: "#f8fafc" },
  { name: "Slate-100", value: "#f1f5f9" },
  { name: "Slate-800", value: "#1e293b" },
  { name: "Slate-900", value: "#0f172a" },
];

const GRADIENT_PRESETS = [
  {
    name: "Sunset",
    value: "linear-gradient(135deg, #fb923c 0%, #ec4899 50%, #8b5cf6 100%)",
  },
  {
    name: "Ocean",
    value: "linear-gradient(135deg, #0ea5e9 0%, #1e3a8a 100%)",
  },
  {
    name: "Forest",
    value: "linear-gradient(135deg, #064e3b 0%, #10b981 100%)",
  },
  {
    name: "Peach",
    value: "linear-gradient(135deg, #fde68a 0%, #f9a8d4 100%)",
  },
  {
    name: "Lavender",
    value: "linear-gradient(135deg, #c7d2fe 0%, #f5d0fe 100%)",
  },
  {
    name: "Slate Fade",
    value: "linear-gradient(135deg, #f8fafc 0%, #cbd5e1 50%, #475569 100%)",
  },
  {
    name: "Midnight",
    value: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)",
  },
  {
    name: "Aurora",
    value: "linear-gradient(135deg, #14b8a6 0%, #6366f1 50%, #ec4899 100%)",
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
  static selectedValue = "";

  /** Background position / size for image backgrounds. */
  static bgImagePosition = "center";
  static bgImageSize = "cover";

  /** Dark overlay opacity for image backgrounds (0–100). */
  static bgImageOverlay = 40;

  /** Currently selected image path (relative, e.g. "images/foo.png"). */
  static selectedImage = "";

  /** Callback invoked when user clicks "Pick image…". */
  static onPickImageCallback = null;

  static init() {
    if (this.modal) return;
    this._buildDom();
    this._wireEvents();
  }

  static _buildDom() {
    const wrapper = document.createElement("div");
    wrapper.id = "backgroundPickerModal";
    wrapper.className = "modal background-picker-modal webdeck-hidden";
    wrapper.setAttribute("role", "dialog");
    wrapper.setAttribute("aria-modal", "true");
    wrapper.setAttribute("aria-labelledby", "backgroundPickerTitle");

    const colorButtons = COLOR_SWATCHES.map(
      (c) => `
            <button type="button" class="bg-swatch" data-value="${escapeAttr(c.value)}"
                title="${escapeAttr(c.name)}" aria-label="${escapeAttr(c.name)}"
                style="background: ${escapeAttr(c.value)};"></button>
        `,
    ).join("");

    const gradientButtons = GRADIENT_PRESETS.map(
      (g) => `
            <button type="button" class="bg-gradient" data-value="${escapeAttr(g.value)}"
                title="${escapeAttr(g.name)}" aria-label="${escapeAttr(g.name)}"
                style="background: ${escapeAttr(g.value)};">
                <span class="bg-gradient-label">${escapeText(g.name)}</span>
            </button>
        `,
    ).join("");

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
                    <div id="bgPickerImagePreview" class="bg-picker-image-preview">
                        <div id="bgPickerImagePreviewBg" class="bg-picker-image-preview-bg"></div>
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
                        <div class="bg-picker-option-group bg-picker-option-group--full">
                            <span class="bg-picker-option-label">Dark overlay</span>
                            <div class="bg-picker-overlay-row">
                                <input id="bgPickerOverlaySlider" type="range" min="0" max="100" value="40"
                                    class="bg-picker-overlay-slider" />
                                <span id="bgPickerOverlayValue" class="bg-picker-overlay-value">40%</span>
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
                    <div class="bg-picker-footer-right">
                        <label class="bg-picker-theme-toggle" title="Switch to dark theme for better contrast with this background">
                            <input id="bgPickerDarkTheme" type="checkbox" checked />
                            <span class="bg-picker-theme-toggle__label">Dark theme</span>
                        </label>
                        <button id="bgPickerApplyBtn" class="bg-picker-apply-btn" type="button" disabled>Apply</button>
                    </div>
                </div>
            </div>
        `;

    document.body.appendChild(wrapper);

    this.modal = wrapper;
    this.tabButtons = wrapper.querySelectorAll(".bg-picker-tab");
    this.tabPanels = wrapper.querySelectorAll(".bg-picker-tab-panel");
    this.colorGrid = wrapper.querySelector(".bg-color-grid");
    this.gradientGrid = wrapper.querySelector(".bg-gradient-grid");
    this.customInput = wrapper.querySelector("#bgPickerCustomInput");
    this.colorInput = wrapper.querySelector("#bgPickerColorInput");
    this.colorText = wrapper.querySelector("#bgPickerColorText");
    this.clearBtn = wrapper.querySelector("#bgPickerClearBtn");
    this.applyBtn = wrapper.querySelector("#bgPickerApplyBtn");
    this.darkThemeCheckbox = wrapper.querySelector("#bgPickerDarkTheme");
    this.pickImageBtn = wrapper.querySelector("#bgPickerPickImageBtn");
    this.clearImageBtn = wrapper.querySelector("#bgPickerClearImageBtn");
    this.imageStatusEl = wrapper.querySelector("#bgPickerImageStatus");
    this.imagePreviewEl = wrapper.querySelector("#bgPickerImagePreview");
    this.imagePreviewBg = wrapper.querySelector("#bgPickerImagePreviewBg");
    this.posButtons = wrapper.querySelectorAll(".bg-picker-pos-btn");
    this.bgSizeButtons = wrapper.querySelectorAll(".bg-picker-size-btn");
    this.overlaySlider = wrapper.querySelector("#bgPickerOverlaySlider");
    this.overlayValueEl = wrapper.querySelector("#bgPickerOverlayValue");
  }

  static _wireEvents() {
    if (!this.modal || this.modal.dataset.wired === "1") return;
    this.modal.dataset.wired = "1";

    const close = () => this.hide();
    this.modal.querySelector("#backgroundPickerOverlay").addEventListener("click", close);
    this.modal.querySelector("#closeBackgroundPickerBtn").addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.modal.classList.contains("webdeck-hidden")) {
        close();
      }
    });

    // Tabs
    this.tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.tab;
        this.tabButtons.forEach((b) => b.classList.toggle("active", b === btn));
        this.tabPanels.forEach((p) => p.classList.toggle("active", p.dataset.panel === target));
      });
    });

    // Swatches
    this.colorGrid.addEventListener("click", (e) => {
      const btn = e.target.closest(".bg-swatch");
      if (!btn) return;
      this.colorGrid.querySelectorAll(".bg-swatch").forEach((s) => s.classList.remove("selected"));
      btn.classList.add("selected");
      this._setSelection(btn.dataset.value);
    });

    // Gradient presets
    this.gradientGrid.addEventListener("click", (e) => {
      const btn = e.target.closest(".bg-gradient");
      if (!btn) return;
      this.gradientGrid
        .querySelectorAll(".bg-gradient")
        .forEach((g) => g.classList.remove("selected"));
      btn.classList.add("selected");
      this._setSelection(btn.dataset.value);
    });

    // Custom color picker — keep text input in sync
    this.colorInput.addEventListener("input", () => {
      this.colorText.value = this.colorInput.value;
      this._setSelection(this.colorInput.value);
    });
    this.colorText.addEventListener("input", () => {
      const v = this.colorText.value.trim();
      if (/^#[0-9a-fA-F]{3,8}$/.test(v)) {
        this.colorInput.value =
          v.length === 4
            ? "#" +
              v
                .slice(1)
                .split("")
                .map((c) => c + c)
                .join("")
            : v;
        this._setSelection(v);
      }
    });

    // Custom CSS textarea
    this.customInput.addEventListener("input", () => {
      this._setSelection(this.customInput.value);
    });

    // Image tab — pick image (delegated to a callback provided in show())
    this.pickImageBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof this.onPickImageCallback === "function") {
        this.onPickImageCallback();
      }
    });
    this.clearImageBtn.addEventListener("click", () => {
      this._setImageSelection("");
    });

    // Image position buttons
    this.posButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        this.bgImagePosition = btn.dataset.pos || "center";
        this.posButtons.forEach((b) => b.classList.toggle("active", b === btn));
        if (this.selectedImage) this._refreshImageBackground();
      });
    });

    // Image size buttons
    this.bgSizeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        this.bgImageSize = btn.dataset.size || "cover";
        this.bgSizeButtons.forEach((b) => b.classList.toggle("active", b === btn));
        if (this.selectedImage) this._refreshImageBackground();
      });
    });

    // Overlay slider
    if (this.overlaySlider) {
      this.overlaySlider.addEventListener("input", () => {
        this.bgImageOverlay = parseInt(this.overlaySlider.value, 10);
        if (this.overlayValueEl) this.overlayValueEl.textContent = this.bgImageOverlay + "%";
        if (this.selectedImage) this._refreshImageBackground();
      });
    }

    // Clear
    this.clearBtn.addEventListener("click", () => {
      this._setSelection("");
    });

    // Apply
    this.applyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._confirm();
    });
  }

  /**
   * Open the picker.  If `currentValue` is provided, it's used as the
   * initial selection.
   *
   * @param {(value: string, theme: string) => void} onApply - Called with
   *   the chosen CSS value and theme ('dark' or ''), or empty string if
   *   the user clicked Clear.
   * @param {object} [options]
   * @param {string} [options.currentValue=''] - Initial CSS background.
   * @param {string} [options.currentTheme=''] - Current theme ('dark' or '').
   * @param {() => void} [options.onPickImage] - Called when user clicks
   *   "Pick image…" in the Image tab.  The caller is expected to open the
   *   foreground Image Picker and then call `setImageSelection(path)`.
   */
  static show(onApply, { currentValue = "", currentTheme = "", onPickImage = null } = {}) {
    this.init();
    this.onApplyCallback = onApply;
    this.onPickImageCallback = onPickImage;
    this.selectedValue = String(currentValue || "").trim();
    this.customInput.value = this.selectedValue;
    this.colorText.value = this.selectedValue;
    if (this.selectedValue) {
      this.colorInput.value = this.selectedValue.startsWith("#") ? this.selectedValue : "#0ea5e9";
    }
    // Seed dark theme checkbox: default ON when there's no existing
    // background, or match the current theme when there is one.
    if (this.darkThemeCheckbox) {
      this.darkThemeCheckbox.checked = currentTheme !== "light";
    }
    // Try to detect an existing image in the background value and seed
    // the image tab.
    const detected = this._parseBackgroundImage(this.selectedValue);
    if (detected) {
      this.selectedImage = detected.path;
      this.bgImagePosition = detected.position;
      this.bgImageSize = detected.size;
      this.bgImageOverlay = detected.overlay;
      this._refreshImageButtonsActive();
      this._renderImageStatus();
      this._syncOverlaySlider();
    } else {
      this.selectedImage = "";
      this.bgImageOverlay = 40;
      this._renderImageStatus();
      this._syncOverlaySlider();
    }
    this._updateImagePreview();
    this._syncApplyButton();
    // Default to Color tab
    this.tabButtons.forEach((b) => b.classList.toggle("active", b.dataset.tab === "color"));
    this.tabPanels.forEach((p) => p.classList.toggle("active", p.dataset.panel === "color"));
    this.modal.classList.remove("webdeck-hidden");
  }

  static hide() {
    if (this.modal) this.modal.classList.add("webdeck-hidden");
  }

  static _setSelection(value) {
    this.selectedValue = String(value || "").trim();
    this._syncApplyButton();
    this._syncDarkThemeCheckbox();
  }

  /**
   * Auto-toggle the dark theme checkbox based on the selected background.
   * Light colors → unchecked, dark colors / gradients / images → checked.
   */
  static _syncDarkThemeCheckbox() {
    if (!this.darkThemeCheckbox) return;
    const v = this.selectedValue;
    if (!v) return; // don't touch the checkbox when cleared
    this.darkThemeCheckbox.checked = isColorDark(v);
  }

  static _syncApplyButton() {
    this.applyBtn.disabled = false; // Always allow apply — empty == clear.
  }

  static _confirm() {
    const value = this.selectedValue || "";
    const theme = this.darkThemeCheckbox?.checked ? "dark" : "";
    const cb = this.onApplyCallback;
    this.hide();
    if (cb) cb(value, theme);
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
    this.selectedImage = String(imagePath || "").trim();
    this._renderImageStatus();
    this._refreshImageBackground();
  }

  static _refreshImageBackground() {
    if (!this.selectedImage) {
      this._setSelection("");
      this._updateImagePreview();
      return;
    }
    const css = this._buildImageBackground(this.selectedImage);
    this._setSelection(css);
    this._updateImagePreview();
  }

  static _buildImageBackground(imagePath) {
    const url = `url('${String(imagePath).replace(/'/g, "\\'")}')`;
    const pos = this.bgImagePosition || "center";
    const size = this.bgImageSize || "cover";
    const imageLayer = `${url} ${pos} / ${size} no-repeat`;
    const opacity = this.bgImageOverlay / 100;
    if (opacity <= 0) return imageLayer;
    const overlayLayer = `linear-gradient(rgba(0,0,0,${opacity}),rgba(0,0,0,${opacity}))`;
    return `${overlayLayer}, ${imageLayer}`;
  }

  static _renderImageStatus() {
    if (!this.imageStatusEl) return;
    if (this.selectedImage) {
      this.imageStatusEl.innerHTML = `✓ Using <code>${escapeText(this.selectedImage)}</code>`;
      this.imageStatusEl.classList.add("has-image");
    } else {
      this.imageStatusEl.textContent = "No image selected.";
      this.imageStatusEl.classList.remove("has-image");
    }
  }

  static _refreshImageButtonsActive() {
    if (this.posButtons) {
      this.posButtons.forEach((b) =>
        b.classList.toggle("active", b.dataset.pos === this.bgImagePosition),
      );
    }
    if (this.bgSizeButtons) {
      this.bgSizeButtons.forEach((b) =>
        b.classList.toggle("active", b.dataset.size === this.bgImageSize),
      );
    }
  }

  static _syncOverlaySlider() {
    if (this.overlaySlider) {
      this.overlaySlider.value = this.bgImageOverlay;
    }
    if (this.overlayValueEl) {
      this.overlayValueEl.textContent = this.bgImageOverlay + "%";
    }
  }

  static async _updateImagePreview() {
    if (!this.imagePreviewEl || !this.imagePreviewBg) return;
    if (!this.selectedImage) {
      this.imagePreviewEl.style.display = "none";
      return;
    }
    this.imagePreviewEl.style.display = "";
    const resolved = await DeckImagesResolver.resolvePreviewSrc(this.selectedImage);
    const imgSrc = resolved || this.selectedImage;
    const url = `url('${String(imgSrc).replace(/'/g, "\\'")}')`;
    const opacity = this.bgImageOverlay / 100;
    if (opacity > 0) {
      const overlayLayer = `linear-gradient(rgba(0,0,0,${opacity}),rgba(0,0,0,${opacity}))`;
      this.imagePreviewBg.style.background = `${overlayLayer}, ${url}`;
      this.imagePreviewBg.style.backgroundSize = "auto, cover";
    } else {
      this.imagePreviewBg.style.background = url;
      this.imagePreviewBg.style.backgroundSize = "auto, cover";
    }
  }

  /**
   * Parse an existing `background:` value to detect a single-image
   * shorthand and recover its path / position / size / overlay.
   * Returns null when no image is found.
   */
  static _parseBackgroundImage(cssValue) {
    if (!cssValue) return null;

    let overlay = 40; // default

    // Detect a solid black overlay gradient layer (our format)
    const overlayMatch = cssValue.match(
      /linear-gradient\(\s*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*([\d.]+)\s*\)\s*,\s*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*[\d.]+\s*\)\s*\)/,
    );
    if (overlayMatch) {
      overlay = Math.round(parseFloat(overlayMatch[1]) * 100);
    }

    // Find the first url(...) argument, ignore escaped quotes inside.
    const urlMatch = cssValue.match(/url\(\s*(['"]?)(.+?)\1\s*\)/i);
    if (!urlMatch) return null;
    // Strip the url(...) portion and try to read position / size from
    // what follows.
    const remainder =
      cssValue.slice(0, urlMatch.index) + cssValue.slice(urlMatch.index + urlMatch[0].length);
    const tokens = remainder.trim().split(/\s+/).filter(Boolean);

    // Position keywords (subset used by the picker)
    const positions = ["top", "bottom", "left", "right", "center"];
    let position = "center";
    const posToken = tokens.find((t) => positions.includes(t));
    if (posToken) position = posToken;

    // Size — pick from /cover, /contain, /auto or a pixel/percent pair
    let size = "cover";
    const sizeMatch = cssValue.match(/\/\s*(cover|contain|auto)/i);
    if (sizeMatch) size = sizeMatch[1].toLowerCase();

    return { path: urlMatch[2], position, size, overlay };
  }
}

function escapeText(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(text) {
  return String(text).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * Parse a single CSS color token (hex, rgb, rgba, hsl, hsla) and return
 * [r, g, b] or null if unparseable.
 */
function parseColorToken(token) {
  const s = String(token).trim().toLowerCase();

  // Hex: #rgb, #rgba, #rrggbb, #rrggbbaa
  const hexMatch = s.match(/^#([0-9a-f]{3,8})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length <= 4) {
      // 3 or 4 digit hex — expand each channel
      const r = parseInt(hex[0].repeat(2), 16);
      const g = parseInt(hex[1].repeat(2), 16);
      const b = parseInt(hex[2].repeat(2), 16);
      return [r, g, b];
    }
    // 6 or 8 digit hex — read pairs
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return [r, g, b];
  }

  // rgb / rgba
  const rgbMatch = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (rgbMatch) return [+rgbMatch[1], +rgbMatch[2], +rgbMatch[3]];

  // hsl / hsla — convert to rgb
  const hslMatch = s.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/);
  if (hslMatch) {
    const h = +hslMatch[1] / 360;
    const sl = +hslMatch[2] / 100;
    const l = +hslMatch[3] / 100;
    if (sl === 0) {
      const v = Math.round(l * 255);
      return [v, v, v];
    }
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + sl) : l + sl - l * sl;
    const p = 2 * l - q;
    return [
      Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
      Math.round(hue2rgb(p, q, h) * 255),
      Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
    ];
  }

  return null;
}

/**
 * Determine whether a CSS color (or the first color found in a gradient /
 * background shorthand) is dark.  Returns true when the color's relative
 * luminance is below 0.5 (i.e. needs light text → dark theme).
 *
 * Non-color values (url(), transparent, complex layered backgrounds) return
 * true (dark) as a safe default.
 */
function isColorDark(cssValue) {
  const v = String(cssValue || "")
    .trim()
    .toLowerCase();
  if (!v) return true;

  // Extract the first color token from gradients or complex values
  // Matches hex, rgb(), rgba(), hsl(), hsla()
  const colorTokenRe =
    /(?:#([0-9a-f]{3,8})|rgba?\(\s*[\d.]+(?:\s*,\s*[\d.]+){2,3}\s*\)|hsla?\(\s*[\d.]+(?:\s*,\s*[\d.]+%){2,3}(?:\s*,\s*[\d.]+)?\s*\))/i;
  const m = v.match(colorTokenRe);
  if (!m) return true; // no parseable color → default dark

  const rgb = parseColorToken(m[0]);
  if (!rgb) return true;

  // Rec. 709 relative luminance
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.5;
}
