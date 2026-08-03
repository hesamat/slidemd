/**
 * SlideStylePanel
 *
 * Modal dialog for styling slides uniformly in edit mode.
 * Three tabs: Background, Borders, Title Decoration.
 * All controls are inline — no nested modals needed.
 */

import { MarkdownParser } from "../../data/markdown-parser.js";
import {
  isColorDark,
  buildImageBackground,
  parseCss,
  parseBorder,
  parsePx,
  buildAreaStyleFromElements,
  syncSliderLabels,
  syncTitleDisabled,
  buildBackgroundPanelHtml,
  buildAreaStylePanelHtml,
  buildTitlePanelHtml,
  buildLayoutPanelHtml,
  syncBgState,
  parseBackgroundValue,
  getDefaultBorderColor,
} from "./style-helpers.js";
import { buildSingleColumnCustomLayout, parseSingleColumnLayout } from "../core/directive-utils.js";

const STORAGE_KEY_AREA_STYLE = "webdeck:default-area-style";
const STORAGE_KEY_HEADER_STYLE = "webdeck:default-header-style";
const STORAGE_KEY_BG_STYLE = "webdeck:default-background";
const STORAGE_KEY_THEME_STYLE = "webdeck:default-theme";

const P = "slide-style-panel-modal__";

export class SlideStylePanel {
  static el = null;
  static _getMarkdown = null;
  static _setMarkdown = null;
  static _debounceTimer = null;
  static _onPickImage = null;

  // Current bg state
  static _currentBg = "";
  static _currentImagePath = "";
  static _currentImageBlobUrl = "";
  static _imageOverlay = 40;
  static _currentTheme = "";
  static _layoutChanged = false;

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

    let working = markdown;
    if (this._layoutChanged) {
      const currentLayout = this._readDirective("layout") || "default";
      const parsed = parseSingleColumnLayout(currentLayout);
      const widthEl = this.el.querySelector('[data-panel="layout"] [data-field="main-width"]');
      const alignBtn = this.el.querySelector(
        '[data-panel="layout"] [data-align-group] .style-btn-option.selected',
      );
      if (parsed && widthEl && alignBtn) {
        const newLayout = buildSingleColumnCustomLayout(
          parsed.base,
          parseInt(widthEl.value, 10),
          alignBtn.dataset.align || "center",
        );
        if (newLayout) {
          const { markdown: withoutLayout } = parser.extractDirective(working, "layout");
          working = `layout: ${newLayout}\n${withoutLayout}`;
        }
      }
    }

    let { markdown: stripped } = parser.extractDirective(working, "area-style");
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
    return buildAreaStyleFromElements(this.el);
  }

  static _getSelectedHeaderStyle() {
    if (!this.el) return "line";
    const selected = this.el.querySelector('[data-panel="title"] .style-btn-option.selected');
    return selected?.dataset.headerStyle || "line";
  }

  static _getBackgroundValue() {
    if (this._currentImagePath)
      return buildImageBackground(
        this._currentImagePath,
        this._imageOverlay,
        this._currentImageBlobUrl,
      );
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
    const parsed = parseCss(cssText);
    const border = parseBorder(parsed["border"] || "");
    const radius = parsePx(parsed["border-radius"] || "");
    const padding = parsePx(parsed["padding"] || "");

    const setNum = (sel, val) => {
      const el = this.el.querySelector(sel);
      if (el) el.value = Math.round(val);
    };

    const setVal = (sel, val) => {
      const el = this.el.querySelector(sel);
      if (el) el.value = val;
    };

    setNum('[data-field="border-width"]', border.width);
    setVal('[data-field="border-color"]', border.color || getDefaultBorderColor());
    setNum('[data-field="radius"]', radius);
    setNum('[data-field="padding"]', parsed["padding"] !== undefined ? padding : 10);

    const headerStyle = this._readHeaderStyleFromMarkdown();
    this.el.querySelectorAll('[data-panel="title"] .style-btn-option').forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.headerStyle === headerStyle);
    });

    const rawBg = this._readBackgroundFromMarkdown();
    this._currentTheme = this._readThemeFromMarkdown();

    const bgInfo = parseBackgroundValue(rawBg);
    this._currentImagePath = bgInfo.imagePath;
    this._currentImageBlobUrl = bgInfo.imageBlobUrl;
    this._imageOverlay = bgInfo.overlay;
    this._currentBg = rawBg;

    if (this._currentImagePath) {
      this._resolveImageBlob(this._currentImagePath);
    }

    this._syncBgUI();

    const layoutValue = this._readDirective("layout") || "default";
    const parsedLayout = parseSingleColumnLayout(layoutValue);
    const layoutEl = this.el.querySelector('[data-panel="layout"]');
    if (layoutEl) {
      const mw = layoutEl.querySelector('[data-field="main-width"]');
      if (mw) mw.value = parsedLayout ? parsedLayout.width : 100;
      const align = parsedLayout ? parsedLayout.align : "center";
      layoutEl.querySelectorAll("[data-align-group] .style-btn-option").forEach((btn) => {
        btn.classList.toggle("selected", btn.dataset.align === align);
      });
    }

    this._layoutChanged = false;
    syncSliderLabels(this.el);
    syncTitleDisabled(this.el, {
      titleBtnSelector: '[data-panel="title"] .style-btn-option',
      hintSelector: ".style-disabled-hint",
    });
  }

  static async _resolveImageBlob(path) {
    try {
      const { DeckImagesResolver } = await import("../image/deck-images-resolver.js");
      if (DeckImagesResolver._dirHandle && /^images\//.test(path)) {
        const blobUrl = await DeckImagesResolver.resolvePreviewSrc(path);
        if (blobUrl !== path) {
          this._currentImageBlobUrl = blobUrl;
          this._syncBgUI();
        }
      }
    } catch {
      // Image resolution not available
    }
  }

  static _syncBgUI() {
    if (!this.el) return;
    syncBgState(this.el, {
      bg: this._currentBg,
      imagePath: this._currentImagePath,
      theme: this._currentTheme,
      bgValue: this._getBackgroundValue(),
      overlay: this._imageOverlay,
    });
  }

  // ── DOM ──

  static _buildDom() {
    const el = document.createElement("div");
    el.className = "slide-style-panel-modal webdeck-hidden";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Slide styles");

    el.innerHTML = `
      <div class="${P}overlay"></div>
      <div class="${P}dialog">
        <div class="${P}header">
          <h2 class="${P}title">Slide Styles</h2>
          <button class="${P}close" type="button" aria-label="Close">&times;</button>
        </div>
        <div class="${P}tabs">
          <button class="${P}tab active" data-tab="background" type="button">Background</button>
          <button class="${P}tab" data-tab="borders" type="button">Borders</button>
          <button class="${P}tab" data-tab="layout" type="button">Layout</button>
          <button class="${P}tab" data-tab="title" type="button">Title</button>
        </div>
        <div class="${P}body">
          <div class="${P}tab-panel active" data-panel="background">
            ${buildBackgroundPanelHtml()}
          </div>
          <div class="${P}tab-panel" data-panel="borders">
            ${buildAreaStylePanelHtml()}
          </div>
          <div class="${P}tab-panel" data-panel="layout">
            ${buildLayoutPanelHtml()}
          </div>
          <div class="${P}tab-panel" data-panel="title">
            ${buildTitlePanelHtml()}
          </div>
        </div>
        <div class="${P}footer">
          <button class="${P}btn" data-action="clear">Clear All</button>
          <button class="${P}btn" data-action="apply">Apply</button>
          <button class="${P}btn ${P}btn--primary" data-action="apply-all">Apply to All</button>
        </div>
      </div>
    `;

    document.body.appendChild(el);
    this.el = el;

    this._wireEvents(el);
  }

  static _wireEvents(el) {
    // Close button
    el.querySelector(`.${P}close`).addEventListener("click", () => this.hide());

    // Overlay click closes
    el.querySelector(`.${P}overlay`).addEventListener("click", () => this.hide());

    // Escape closes
    const handleEsc = (e) => {
      if (e.key === "Escape" && this.isVisible()) {
        this.hide();
        document.removeEventListener("keydown", handleEsc);
      }
    };
    document.addEventListener("keydown", handleEsc);

    // Tabs
    el.querySelectorAll(`.${P}tab`).forEach((tab) => {
      tab.addEventListener("click", () => {
        el.querySelectorAll(`.${P}tab`).forEach((t) => t.classList.remove("active"));
        el.querySelectorAll(`.${P}tab-panel`).forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        el.querySelector(`[data-panel="${tab.dataset.tab}"]`).classList.add("active");
      });
    });

    // Border/radius/padding sliders
    const syncBorderState = () => {
      syncSliderLabels(this.el);
      syncTitleDisabled(this.el, {
        titleBtnSelector: '[data-panel="title"] .style-btn-option',
        hintSelector: ".style-disabled-hint",
      });
    };
    el.querySelectorAll(
      'input[data-field="border-width"], input[data-field="radius"], input[data-field="padding"]',
    ).forEach((input) => {
      input.addEventListener("input", syncBorderState);
      input.addEventListener("change", syncBorderState);
    });

    // Border color
    el.querySelector('[data-field="border-color"]')?.addEventListener("input", () => {});

    // Header style buttons
    el.querySelectorAll('[data-panel="title"] .style-btn-option').forEach((btn) => {
      btn.addEventListener("click", () => {
        el.querySelectorAll('[data-panel="title"] .style-btn-option').forEach((b) =>
          b.classList.remove("selected"),
        );
        btn.classList.add("selected");
      });
    });

    // Layout controls
    const mw = el.querySelector('[data-field="main-width"]');
    if (mw) {
      mw.addEventListener("input", () => {
        this._layoutChanged = true;
        syncSliderLabels(this.el);
      });
    }
    el.querySelectorAll('[data-panel="layout"] [data-align-group] .style-btn-option').forEach(
      (btn) => {
        btn.addEventListener("click", () => {
          this._layoutChanged = true;
          el.querySelectorAll('[data-panel="layout"] [data-align-group] .style-btn-option').forEach(
            (b) => b.classList.remove("selected"),
          );
          btn.classList.add("selected");
        });
      },
    );

    // Background swatches
    el.querySelector(".style-swatch-grid").addEventListener("click", (e) => {
      const btn = e.target.closest(".style-swatch");
      if (!btn || btn.dataset.action === "open-color-picker") return;
      this._currentBg = btn.dataset.value;
      this._currentImagePath = "";
      this._currentTheme = btn.dataset.value && isColorDark(btn.dataset.value) ? "dark" : "";
      this._syncBgUI();
    });

    // Color picker (hidden input overlays dropper button)
    const colorInput = el.querySelector('[data-field="bg-custom-color"]');
    if (colorInput) {
      colorInput.addEventListener("input", (e) => {
        this._currentBg = e.target.value;
        this._currentImagePath = "";
        this._currentTheme = isColorDark(e.target.value) ? "dark" : "";
        this._syncBgUI();
      });
    }

    // Theme checkbox
    el.querySelector('[data-field="bg-theme"]')?.addEventListener("change", (e) => {
      this._currentTheme = e.target.checked ? "dark" : "light";
    });

    // Overlay slider
    el.querySelector('[data-field="bg-overlay"]')?.addEventListener("input", () => {
      const slider = el.querySelector('[data-field="bg-overlay"]');
      const label = el.querySelector('[data-display="bg-overlay"]');
      this._imageOverlay = parseInt(slider.value, 10);
      if (label) label.textContent = `${this._imageOverlay}%`;
      this._syncBgUI();
    });

    // Pick image
    el.querySelector('[data-action="pick-image"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this._onPickImage) {
        this._onPickImage(async (path) => {
          this._currentImagePath = path;
          this._currentBg = "";
          this._currentTheme = "dark";
          this._currentImageBlobUrl = "";
          this._syncBgUI();
          await this._resolveImageBlob(path);
        });
      }
    });

    // Clear all
    el.querySelector('[data-action="clear"]').addEventListener("click", () => {
      const setVal = (sel, val) => {
        const e = this.el.querySelector(sel);
        if (e) e.value = val;
      };
      setVal('[data-field="border-width"]', 0);
      setVal('[data-field="radius"]', 0);
      setVal('[data-field="padding"]', 10);
      syncSliderLabels(this.el);
      this._currentBg = "";
      this._currentImagePath = "";
      this._currentImageBlobUrl = "";
      this._imageOverlay = 40;
      this._currentTheme = "";
      this._syncBgUI();
      this.el.querySelectorAll('[data-panel="title"] .style-btn-option').forEach((b) => {
        b.classList.toggle("selected", b.dataset.headerStyle === "line");
      });
      syncTitleDisabled(this.el, {
        titleBtnSelector: '[data-panel="title"] .style-btn-option',
        hintSelector: ".style-disabled-hint",
      });
    });

    // Apply (current slide)
    el.querySelector('[data-action="apply"]').addEventListener("click", () => {
      if (this._debounceTimer) {
        clearTimeout(this._debounceTimer);
        this._debounceTimer = null;
      }
      const cssString = this._buildCssFromUI();
      const headerStyle = this._getSelectedHeaderStyle();
      const bgValue = this._getBackgroundValue();
      this.saveDefaultStyles(cssString, headerStyle, bgValue, this._currentTheme);
      this._doApplyChange();
      this.hide();
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
}
