/**
 * SlideStylePanel
 *
 * Modal dialog for styling slides uniformly in edit mode.
 * Three tabs: Background, Borders, Title Decoration.
 * All controls are inline — no nested modals needed.
 */

import { MarkdownParser } from "../../data/markdown-parser.js";

const STORAGE_KEY_AREA_STYLE = "webdeck:default-area-style";
const STORAGE_KEY_HEADER_STYLE = "webdeck:default-header-style";
const STORAGE_KEY_BG_STYLE = "webdeck:default-background";
const STORAGE_KEY_THEME_STYLE = "webdeck:default-theme";

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
];

export class SlideStylePanel {
  static el = null;
  static _getMarkdown = null;
  static _setMarkdown = null;
  static _debounceTimer = null;
  static _onPickImage = null;

  // Current bg state
  static _currentBg = "";
  static _currentImagePath = "";
  static _imageOverlay = 40;
  static _currentTheme = "";

  static init(getMarkdown, setMarkdown, applyToAll, onPickImage) {
    this._getMarkdown = getMarkdown;
    this._setMarkdown = setMarkdown;
    this._applyToAll = applyToAll;
    this._onPickImage = onPickImage;
  }

  // ── localStorage persistence ──

  static saveDefaultStyles(areaStyle, headerStyle, background = "", theme = "") {
    localStorage.setItem(STORAGE_KEY_AREA_STYLE, areaStyle || "");
    localStorage.setItem(STORAGE_KEY_HEADER_STYLE, headerStyle || "line");
    localStorage.setItem(STORAGE_KEY_BG_STYLE, background || "");
    localStorage.setItem(STORAGE_KEY_THEME_STYLE, theme || "");
  }

  static getDefaultAreaStyle() {
    return localStorage.getItem(STORAGE_KEY_AREA_STYLE) || "";
  }

  static getDefaultHeaderStyle() {
    return localStorage.getItem(STORAGE_KEY_HEADER_STYLE) || "line";
  }

  static getDefaultBackground() {
    return localStorage.getItem(STORAGE_KEY_BG_STYLE) || "";
  }

  static getDefaultTheme() {
    return localStorage.getItem(STORAGE_KEY_THEME_STYLE) || "";
  }

  // ── Markdown read/write ──

  static _readDirective(name, fallback = "") {
    if (!this._getMarkdown) return fallback;
    const markdown = this._getMarkdown();
    const parser = new MarkdownParser();
    const { value } = parser.extractDirective(markdown, name);
    return value || fallback;
  }

  static _readAreaStyleFromMarkdown() {
    return this._readDirective("area-style");
  }

  static _readHeaderStyleFromMarkdown() {
    return this._readDirective("header-style", "line");
  }

  static _readBackgroundFromMarkdown() {
    return this._readDirective("background");
  }

  static _readThemeFromMarkdown() {
    return this._readDirective("theme");
  }

  static _applyChange() {
    if (!this._getMarkdown || !this._setMarkdown) return;
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._doApplyChange(), 300);
  }

  static _doApplyChange() {
    if (!this._getMarkdown || !this._setMarkdown) return;
    const markdown = this._getMarkdown();
    const parser = new MarkdownParser();

    let { markdown: stripped } = parser.extractDirective(markdown, "area-style");
    const cssString = this._buildCssFromUI();
    if (cssString) stripped = `area-style: ${cssString}\n${stripped}`;

    let { markdown: withoutHeader } = parser.extractDirective(stripped, "header-style");
    const headerStyle = this._getSelectedHeaderStyle();
    if (headerStyle && headerStyle !== "line") {
      withoutHeader = `header-style: ${headerStyle}\n${withoutHeader}`;
    }

    let { markdown: withoutBg } = parser.extractDirective(withoutHeader, "background");
    const bgValue = this._getBackgroundValue();
    if (bgValue) {
      const indented = bgValue
        .split("\n")
        .map((line, i) => (i === 0 ? line : `  ${line}`))
        .join("\n");
      withoutBg = `background: ${indented}\n${withoutBg}`;
    }

    let { markdown: withoutTheme } = parser.extractDirective(withoutBg, "theme");
    if (this._currentTheme) {
      withoutTheme = `theme: ${this._currentTheme}\n${withoutTheme}`;
    }

    this._setMarkdown(withoutTheme);
  }

  static _buildCssFromUI() {
    if (!this.el) return "";
    const borderW = this.el.querySelector('[data-field="border-width"]')?.value ?? 0;
    const borderC = this.el.querySelector('[data-field="border-color"]')?.value ?? "#d3d3d3";
    const radius = this.el.querySelector('[data-field="radius"]')?.value ?? 0;
    const padding = this.el.querySelector('[data-field="padding"]')?.value ?? 10;

    const parts = [];
    if (parseInt(borderW, 10) > 0) parts.push(`border: ${borderW}px solid ${borderC}`);
    if (parseInt(radius, 10) > 0) parts.push(`border-radius: ${radius}px`);
    if (parseInt(padding, 10) !== 10) parts.push(`padding: ${padding}px`);
    return parts.join("; ");
  }

  static _getSelectedHeaderStyle() {
    if (!this.el) return "line";
    const selected = this.el.querySelector(".slide-style-panel-modal__btn-option.selected");
    return selected?.dataset.headerStyle || "line";
  }

  static _buildImageBackground(imagePath, overlay) {
    if (!imagePath) return "";
    const url = `url('${String(imagePath).replace(/'/g, "\\'")}')`;
    const imageLayer = `${url} center / cover no-repeat`;
    const opacity = overlay / 100;
    if (opacity <= 0) return imageLayer;
    const overlayLayer = `linear-gradient(rgba(0,0,0,${opacity}),rgba(0,0,0,${opacity}))`;
    return `${overlayLayer}, ${imageLayer}`;
  }

  static _getBackgroundValue() {
    if (this._currentImagePath)
      return this._buildImageBackground(this._currentImagePath, this._imageOverlay);
    return this._currentBg;
  }

  // ── Show / hide ──

  static show() {
    if (!this.el) this._buildDom();
    this._syncUI();
    this.el.classList.remove("webdeck-hidden");
  }

  static hide() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    if (this.el) this.el.classList.add("webdeck-hidden");
  }

  static isVisible() {
    return this.el && !this.el.classList.contains("webdeck-hidden");
  }

  static toggle() {
    if (this.isVisible()) this.hide();
    else this.show();
  }

  // ── UI sync ──

  static _syncUI() {
    if (!this.el) return;

    const cssText = this._readAreaStyleFromMarkdown();
    const parsed = this._parseCss(cssText);
    const border = this._parseBorder(parsed["border"] || "");
    const radius = this._parsePx(parsed["border-radius"] || "");
    const padding = this._parsePx(parsed["padding"] || "");

    const setNum = (sel, val) => {
      const el = this.el.querySelector(sel);
      if (el) el.value = Math.round(val);
    };

    const setVal = (sel, val) => {
      const el = this.el.querySelector(sel);
      if (el) el.value = val;
    };

    setNum('[data-field="border-width"]', border.width);
    setVal('[data-field="border-color"]', border.color);
    setNum('[data-field="radius"]', radius);
    setNum('[data-field="padding"]', parsed["padding"] !== undefined ? padding : 10);

    const headerStyle = this._readHeaderStyleFromMarkdown();
    this.el.querySelectorAll(".slide-style-panel__btn-option").forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.headerStyle === headerStyle);
    });

    this._currentBg = this._readBackgroundFromMarkdown();
    this._currentTheme = this._readThemeFromMarkdown();
    this._syncBgUI();

    this._updateSliderLabels();
    this._syncTitleDisabled();
  }

  static _syncBgUI() {
    if (!this.el) return;
    const swatches = this.el.querySelectorAll(".slide-style-panel-modal__swatch");
    const textInput = this.el.querySelector('[data-field="bg-text"]');
    const themeCb = this.el.querySelector('[data-field="bg-theme"]');
    const clearBtn = this.el.querySelector('[data-action="clear-bg"]');
    const imageStatus = this.el.querySelector(".slide-style-panel-modal__image-status");
    const bgPreview = this.el.querySelector(".slide-style-panel-modal__bg-preview");
    const overlaySlider = this.el.querySelector('[data-field="bg-overlay"]');
    const overlayValue = this.el.querySelector('[data-display="bg-overlay"]');
    const overlayRow = this.el.querySelector(".slide-style-panel-modal__overlay-row");

    swatches.forEach((s) =>
      s.classList.toggle(
        "selected",
        s.dataset.value === this._currentBg && !this._currentImagePath,
      ),
    );
    if (textInput) textInput.value = this._currentImagePath || this._currentBg;
    if (themeCb) themeCb.checked = this._currentTheme === "dark";
    if (clearBtn)
      clearBtn.style.display = this._currentBg || this._currentImagePath ? "block" : "none";
    if (imageStatus) {
      if (this._currentImagePath) {
        imageStatus.textContent = this._currentImagePath;
        imageStatus.style.display = "block";
      } else {
        imageStatus.style.display = "none";
      }
    }
    if (bgPreview) {
      const bgVal = this._getBackgroundValue();
      bgPreview.style.background = bgVal || "var(--surface-elevated)";
      bgPreview.classList.toggle("has-bg", !!bgVal);
    }
    if (overlayRow) overlayRow.style.display = this._currentImagePath ? "flex" : "none";
    if (overlaySlider) overlaySlider.value = this._imageOverlay;
    if (overlayValue) overlayValue.textContent = `${this._imageOverlay}%`;
  }

  static _updateSliderLabels() {
    if (!this.el) return;
    const set = (sel, val) => {
      const el = this.el.querySelector(sel);
      if (el) el.textContent = val;
    };
    const bw = this.el.querySelector('[data-field="border-width"]');
    if (bw) set('[data-display="border-width"]', `${bw.value}px`);
    const r = this.el.querySelector('[data-field="radius"]');
    if (r) set('[data-display="radius"]', `${r.value}px`);
    const p = this.el.querySelector('[data-field="padding"]');
    if (p) set('[data-display="padding"]', `${p.value}px`);
  }

  static _syncTitleDisabled() {
    if (!this.el) return;
    const bw = this.el.querySelector('[data-field="border-width"]');
    const r = this.el.querySelector('[data-field="radius"]');
    const p = this.el.querySelector('[data-field="padding"]');
    const hasBorders =
      (bw && parseInt(bw.value, 10) > 0) ||
      (r && parseInt(r.value, 10) > 0) ||
      (p && parseInt(p.value, 10) !== 10);
    const titleBtns = this.el.querySelectorAll(
      '[data-panel="title"] .slide-style-panel__btn-option',
    );
    const hint = this.el.querySelector(".slide-style-panel__disabled-hint");
    titleBtns.forEach((btn) => {
      btn.disabled = hasBorders;
      if (hasBorders) btn.classList.remove("selected");
    });
    if (hasBorders) {
      const noneBtn = this.el.querySelector('[data-header-style="none"]');
      if (noneBtn) noneBtn.classList.add("selected");
    }
    if (hint) hint.style.display = hasBorders ? "block" : "none";
  }

  // ── DOM ──

  static _buildDom() {
    const el = document.createElement("div");
    el.className = "slide-style-panel-modal webdeck-hidden";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Slide styles");

    const swatchBtns = COLOR_SWATCHES.map(
      (c) =>
        `<button type="button" class="slide-style-panel-modal__swatch" data-value="${c.value}" title="${c.name}" style="background:${c.value}"></button>`,
    ).join("");

    el.innerHTML = `
      <div class="slide-style-panel-modal__overlay"></div>
      <div class="slide-style-panel-modal__dialog">
        <div class="slide-style-panel-modal__header">
          <h2 class="slide-style-panel-modal__title">Slide Styles</h2>
          <button class="slide-style-panel-modal__close" type="button" aria-label="Close">&times;</button>
        </div>
        <div class="slide-style-panel-modal__tabs">
          <button class="slide-style-panel-modal__tab active" data-tab="background" type="button">Background</button>
          <button class="slide-style-panel-modal__tab" data-tab="borders" type="button">Borders</button>
          <button class="slide-style-panel-modal__tab" data-tab="title" type="button">Title</button>
        </div>
        <div class="slide-style-panel-modal__body">

          <div class="slide-style-panel-modal__tab-panel active" data-panel="background">
            <div class="slide-style-panel-modal__inline-section">
              <span class="slide-style-panel-modal__label">Color</span>
              <div class="slide-style-panel-modal__swatches">${swatchBtns}</div>
            </div>
            <div class="slide-style-panel-modal__inline-section">
              <span class="slide-style-panel-modal__label">Image</span>
              <div class="slide-style-panel-modal__row">
                <input type="text" class="slide-style-panel-modal__text-input" data-field="bg-text" placeholder="Paste image path or URL..." />
                <button class="slide-style-panel-modal__bg-btn" data-action="pick-image" type="button">Browse...</button>
              </div>
              <div class="slide-style-panel-modal__image-status" style="display:none"></div>
            </div>
            <div class="slide-style-panel-modal__overlay-row" style="display:none">
              <span class="slide-style-panel-modal__label">Overlay</span>
              <input type="range" class="slide-style-panel-modal__range" data-field="bg-overlay" min="0" max="100" value="40" />
              <span class="slide-style-panel-modal__value" data-display="bg-overlay">40%</span>
            </div>
            <div class="slide-style-panel-modal__inline-section">
              <span class="slide-style-panel-modal__label">Preview</span>
              <div class="slide-style-panel-modal__bg-preview"></div>
            </div>
            <div class="slide-style-panel-modal__row slide-style-panel-modal__row--between">
              <label class="slide-style-panel-modal__toggle">
                <input type="checkbox" data-field="bg-theme" />
                <span>Dark theme</span>
              </label>
              <button class="slide-style-panel-modal__bg-btn slide-style-panel-modal__bg-btn--clear" data-action="clear-bg" type="button" style="display:none">Clear</button>
            </div>
          </div>

          <div class="slide-style-panel-modal__tab-panel" data-panel="borders">
            <div class="slide-style-panel-modal__inline-section">
              <span class="slide-style-panel-modal__label">Border</span>
              <div class="slide-style-panel-modal__control-row">
                <input type="range" class="slide-style-panel-modal__range" data-field="border-width" min="0" max="12" value="0" />
                <span class="slide-style-panel-modal__value" data-display="border-width">0px</span>
                <input type="color" class="slide-style-panel-modal__color" data-field="border-color" value="#d3d3d3" />
              </div>
            </div>
            <div class="slide-style-panel-modal__inline-section">
              <span class="slide-style-panel-modal__label">Corner Radius</span>
              <div class="slide-style-panel-modal__control-row">
                <input type="range" class="slide-style-panel-modal__range" data-field="radius" min="0" max="50" value="0" />
                <span class="slide-style-panel-modal__value" data-display="radius">0px</span>
              </div>
            </div>
            <div class="slide-style-panel-modal__inline-section">
              <span class="slide-style-panel-modal__label">Padding</span>
              <div class="slide-style-panel-modal__control-row">
                <input type="range" class="slide-style-panel-modal__range" data-field="padding" min="0" max="48" value="10" />
                <span class="slide-style-panel-modal__value" data-display="padding">10px</span>
              </div>
            </div>
          </div>

          <div class="slide-style-panel-modal__tab-panel" data-panel="title">
            <div class="slide-style-panel-modal__inline-section">
              <span class="slide-style-panel-modal__label">Title Decoration</span>
              <p class="slide-style-panel-modal__hint">Accent line under slide titles.</p>
              <div class="slide-style-panel-modal__btn-group">
                <button class="slide-style-panel-modal__btn-option selected" data-header-style="line" type="button">Short</button>
                <button class="slide-style-panel-modal__btn-option" data-header-style="full" type="button">Full width</button>
                <button class="slide-style-panel-modal__btn-option" data-header-style="none" type="button">None</button>
              </div>
              <p class="slide-style-panel-modal__disabled-hint" style="display:none">Disabled when content borders are active.</p>
            </div>
          </div>

        </div>
        <div class="slide-style-panel-modal__footer">
          <button class="slide-style-panel-modal__btn" data-action="clear">Clear All</button>
          <button class="slide-style-panel-modal__btn slide-style-panel-modal__btn--primary" data-action="apply-all">Apply to All</button>
        </div>
      </div>
    `;

    document.body.appendChild(el);
    this.el = el;

    this._wireEvents(el);
  }

  static _wireEvents(el) {
    // Close button
    el.querySelector(".slide-style-panel-modal__close").addEventListener("click", () =>
      this.hide(),
    );

    // Overlay click closes
    el.querySelector(".slide-style-panel-modal__overlay").addEventListener("click", () =>
      this.hide(),
    );

    // Escape closes
    const handleEsc = (e) => {
      if (e.key === "Escape" && this.isVisible()) {
        this.hide();
        document.removeEventListener("keydown", handleEsc);
      }
    };
    document.addEventListener("keydown", handleEsc);

    // Tabs
    el.querySelectorAll(".slide-style-panel-modal__tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        el.querySelectorAll(".slide-style-panel-modal__tab").forEach((t) =>
          t.classList.remove("active"),
        );
        el.querySelectorAll(".slide-style-panel-modal__tab-panel").forEach((p) =>
          p.classList.remove("active"),
        );
        tab.classList.add("active");
        el.querySelector(`[data-panel="${tab.dataset.tab}"]`).classList.add("active");
      });
    });

    // Border/radius/padding sliders
    el.querySelectorAll(
      'input[data-field="border-width"], input[data-field="radius"], input[data-field="padding"]',
    ).forEach((input) => {
      input.addEventListener("input", () => {
        this._updateSliderLabels();
        this._syncTitleDisabled();
        this._applyChange();
      });
    });

    // Border color
    el.querySelector('[data-field="border-color"]')?.addEventListener("input", () => {
      this._applyChange();
    });

    // Header style buttons
    el.querySelectorAll(".slide-style-panel-modal__btn-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        el.querySelectorAll(".slide-style-panel-modal__btn-option").forEach((b) =>
          b.classList.remove("selected"),
        );
        btn.classList.add("selected");
        this._applyChange();
      });
    });

    // Background swatches
    el.querySelector(".slide-style-panel-modal__swatches").addEventListener("click", (e) => {
      const btn = e.target.closest(".slide-style-panel-modal__swatch");
      if (!btn) return;
      this._currentBg = btn.dataset.value;
      this._currentImagePath = "";
      this._currentTheme = this._isColorDark(btn.dataset.value) ? "dark" : "";
      this._syncBgUI();
      this._applyChange();
    });

    // Custom text input
    el.querySelector('[data-field="bg-text"]')?.addEventListener("input", (e) => {
      this._currentBg = e.target.value.trim();
      this._currentImagePath = "";
      this._syncBgUI();
      this._applyChange();
    });

    // Theme checkbox
    el.querySelector('[data-field="bg-theme"]')?.addEventListener("change", (e) => {
      this._currentTheme = e.target.checked ? "dark" : "light";
      this._applyChange();
    });

    // Overlay slider
    el.querySelector('[data-field="bg-overlay"]')?.addEventListener("input", () => {
      const slider = el.querySelector('[data-field="bg-overlay"]');
      const label = el.querySelector('[data-display="bg-overlay"]');
      this._imageOverlay = parseInt(slider.value, 10);
      if (label) label.textContent = `${this._imageOverlay}%`;
      this._syncBgUI();
      this._applyChange();
    });

    // Pick image
    el.querySelector('[data-action="pick-image"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this._onPickImage) {
        this._onPickImage((path) => {
          this._currentImagePath = path;
          this._currentBg = "";
          this._currentTheme = "dark";
          this._syncBgUI();
          this._applyChange();
        });
      }
    });

    // Clear background
    el.querySelector('[data-action="clear-bg"]')?.addEventListener("click", () => {
      this._currentBg = "";
      this._currentImagePath = "";
      this._currentTheme = "";
      this._syncBgUI();
      this._applyChange();
    });

    // Clear all
    el.querySelector('[data-action="clear"]').addEventListener("click", () => {
      if (this._debounceTimer) {
        clearTimeout(this._debounceTimer);
        this._debounceTimer = null;
      }
      const setVal = (sel, val) => {
        const e = this.el.querySelector(sel);
        if (e) e.value = val;
      };
      setVal('[data-field="border-width"]', 0);
      setVal('[data-field="radius"]', 0);
      setVal('[data-field="padding"]', 10);
      this._updateSliderLabels();
      this._currentBg = "";
      this._currentImagePath = "";
      this._currentTheme = "";
      this._syncBgUI();
      this.el.querySelectorAll(".slide-style-panel-modal__btn-option").forEach((b) => {
        b.classList.toggle("selected", b.dataset.headerStyle === "line");
      });
      this._syncTitleDisabled();
      this._doApplyChange();
      this.saveDefaultStyles("", "line", "", "");
    });

    // Apply to all
    el.querySelector('[data-action="apply-all"]').addEventListener("click", () => {
      if (this._debounceTimer) {
        clearTimeout(this._debounceTimer);
        this._debounceTimer = null;
      }
      const cssString = this._buildCssFromUI();
      const headerStyle = this._getSelectedHeaderStyle();
      const bgValue = this._getBackgroundValue();
      this.saveDefaultStyles(cssString, headerStyle, bgValue, this._currentTheme);
      if (this._applyToAll) this._applyToAll(cssString, headerStyle, bgValue, this._currentTheme);
    });
  }

  // ── Helpers ──

  static _isColorDark(hex) {
    if (!hex || !hex.startsWith("#")) return false;
    const c = hex.replace("#", "");
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 128;
  }

  static _parseCss(cssText) {
    const result = {};
    if (!cssText) return result;
    cssText.split(";").forEach((decl) => {
      const idx = decl.indexOf(":");
      if (idx < 0) return;
      const prop = decl.slice(0, idx).trim();
      const val = decl.slice(idx + 1).trim();
      if (prop && val) result[prop] = val;
    });
    return result;
  }

  static _parseBorder(val) {
    const parts = val.split(/\s+/);
    return {
      width: parseInt(parts[0], 10) || 0,
      color: parts[2] || "#d3d3d3",
    };
  }

  static _parsePx(val) {
    return parseInt(val, 10) || 0;
  }
}
