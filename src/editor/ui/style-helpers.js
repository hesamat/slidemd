/**
 * Shared helpers for SlideStylePanel and NewPresentationModal.
 * Keeps background swatches, image backgrounds, area styling,
 * and title-decoration logic in one place.
 */

export const COLOR_SWATCHES = [
  { name: "Light gray", value: "#f1f5f9" },
  { name: "Warm gray", value: "#e7e5e4" },
  { name: "Dark slate", value: "#1e293b" },
  { name: "Navy", value: "#0f172a" },
  { name: "Soft teal", value: "#ccfbf1" },
];

export const ICON_COLOR =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12"/><path d="m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z"/></svg>';

export const ICON_NONE = "✕";

export function isColorDark(hex) {
  if (!hex || !hex.startsWith("#")) return false;
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

export function buildImageBackground(imagePath, overlay, blobUrl) {
  if (!imagePath) return "";
  const displayUrl = blobUrl || imagePath;
  const url = `url('${String(displayUrl).replace(/'/g, "\\'")}')`;
  const imageLayer = `${url} center / cover no-repeat`;
  const opacity = overlay / 100;
  if (opacity <= 0) return imageLayer;
  const overlayLayer = `linear-gradient(rgba(0,0,0,${opacity}),rgba(0,0,0,${opacity}))`;
  return `${overlayLayer}, ${imageLayer}`;
}

export function parseCss(cssText) {
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

export function parseBorder(val) {
  const parts = val.split(/\s+/);
  return {
    width: parseInt(parts[0], 10) || 0,
    color: parts[2] || "#d3d3d3",
  };
}

export function parsePx(val) {
  return parseInt(val, 10) || 0;
}

export function buildAreaStyle(borderWidth, borderColor, radius, padding) {
  const parts = [];
  if (parseInt(borderWidth, 10) > 0) parts.push(`border: ${borderWidth}px solid ${borderColor}`);
  if (parseInt(radius, 10) > 0) parts.push(`border-radius: ${radius}px`);
  if (parseInt(padding, 10) !== 10) parts.push(`padding: ${padding}px`);
  return parts.join("; ");
}

export function buildAreaStyleFromElements(rootEl) {
  const bw = rootEl.querySelector('[data-field="border-width"]')?.value ?? 0;
  const bc = rootEl.querySelector('[data-field="border-color"]')?.value ?? "#d3d3d3";
  const r = rootEl.querySelector('[data-field="radius"]')?.value ?? 0;
  const p = rootEl.querySelector('[data-field="padding"]')?.value ?? 10;
  return buildAreaStyle(bw, bc, r, p);
}

export function syncSliderLabels(rootEl) {
  const set = (sel, val) => {
    const el = rootEl.querySelector(sel);
    if (el) el.textContent = val;
  };
  const bw = rootEl.querySelector('[data-field="border-width"]');
  if (bw) set('[data-display="border-width"]', `${bw.value}px`);
  const r = rootEl.querySelector('[data-field="radius"]');
  if (r) set('[data-display="radius"]', `${r.value}px`);
  const p = rootEl.querySelector('[data-field="padding"]');
  if (p) set('[data-display="padding"]', `${p.value}px`);
}

export function syncTitleDisabled(rootEl, { titleBtnSelector, hintSelector } = {}) {
  const bw = rootEl.querySelector('[data-field="border-width"]');
  const r = rootEl.querySelector('[data-field="radius"]');
  const p = rootEl.querySelector('[data-field="padding"]');
  const hasBorders =
    (bw && parseInt(bw.value, 10) > 0) ||
    (r && parseInt(r.value, 10) > 0) ||
    (p && parseInt(p.value, 10) !== 10);
  const btns = rootEl.querySelectorAll(titleBtnSelector || ".style-btn-option");
  const hint = rootEl.querySelector(hintSelector || ".style-disabled-hint");
  btns.forEach((btn) => {
    btn.disabled = hasBorders;
    if (hasBorders) btn.classList.remove("selected");
  });
  if (hasBorders) {
    const noneBtn = rootEl.querySelector('[data-header-style="none"], [data-title-style="none"]');
    if (noneBtn) noneBtn.classList.add("selected");
  }
  if (hint) hint.style.display = hasBorders ? "block" : "none";
  return hasBorders;
}

/**
 * Build swatch buttons: "none" icon (selected by default) + color swatches + hidden color input.
 */
export function buildSwatchHtml() {
  const noneBtn = `<button type="button" class="style-swatch style-swatch--none selected" data-value="" title="No background">${ICON_NONE}</button>`;
  const colorBtn = `<button type="button" class="style-icon-btn" data-action="open-color-picker" title="Pick a color" style="position:relative">${ICON_COLOR}<input type="color" class="style-color-input-hidden" data-field="bg-custom-color" value="#ffffff" /></button>`;
  const swatches = COLOR_SWATCHES.map(
    (c) =>
      `<button type="button" class="style-swatch" data-value="${c.value}" title="${c.name}" style="background:${c.value}"></button>`,
  ).join("");
  return `${noneBtn}${colorBtn}${swatches}`;
}

/**
 * Build the full background panel HTML using shared style- classes.
 */
export function buildBackgroundPanelHtml() {
  return `
    <div class="style-inline-section">
      <div class="style-color-row">
        <span class="style-label">Color</span>
        <div class="style-swatch-grid">${buildSwatchHtml()}</div>
      </div>
    </div>
    <div class="style-inline-section">
      <div class="style-image-row">
        <span class="style-image-label">Image</span>
        <button class="style-bg-btn" data-action="pick-image" type="button">Browse...</button>
      </div>
      <div class="style-image-status" style="display:none"></div>
    </div>
    <div class="style-overlay-row" style="display:none">
      <span class="style-label">Overlay</span>
      <input type="range" class="style-range" data-field="bg-overlay" min="0" max="100" value="40" />
      <span class="style-control-value" data-display="bg-overlay">40%</span>
    </div>
    <div class="style-inline-section">
      <span class="style-label">Preview</span>
      <div class="style-bg-preview"></div>
    </div>
    <div class="style-row style-row--between">
      <label class="style-toggle">
        <input type="checkbox" data-field="bg-theme" />
        <span>Dark theme</span>
      </label>
    </div>
  `;
}

/**
 * Build the area styling panel HTML using shared style- classes.
 */
export function buildAreaStylePanelHtml({ showHint = false } = {}) {
  return `
    <div class="style-inline-section">
      <span class="style-label">Content Areas</span>
      ${showHint ? `<p class="style-hint">Border, radius, and padding for all content blocks.</p>` : ""}
      <div class="style-control-row">
        <span class="style-control-label">Border</span>
        <input type="range" class="style-range" data-field="border-width" min="0" max="12" value="0" />
        <span class="style-control-value" data-display="border-width">0px</span>
        <input type="color" class="style-color" data-field="border-color" value="#d3d3d3" />
      </div>
      <div class="style-control-row">
        <span class="style-control-label">Radius</span>
        <input type="range" class="style-range" data-field="radius" min="0" max="50" value="0" />
        <span class="style-control-value" data-display="radius">0px</span>
      </div>
      <div class="style-control-row">
        <span class="style-control-label">Padding</span>
        <input type="range" class="style-range" data-field="padding" min="0" max="48" value="10" />
        <span class="style-control-value" data-display="padding">10px</span>
      </div>
    </div>
  `;
}

/**
 * Build the title decoration panel HTML using shared style- classes.
 * @param {string} [dataAttr="data-header-style"] - data attribute for title style buttons
 */
export function buildTitlePanelHtml(dataAttr = "data-header-style") {
  const hasDataTitle = dataAttr === "data-title-style";
  return `
    <div class="style-inline-section">
      <span class="style-label">Title Decoration</span>
      <p class="style-hint">Accent line under slide titles.</p>
      <div class="style-btn-group">
        <button class="style-btn-option selected" ${dataAttr}="${hasDataTitle ? "short" : "line"}" type="button">Short</button>
        <button class="style-btn-option" ${dataAttr}="full" type="button">Full width</button>
        <button class="style-btn-option" ${dataAttr}="none" type="button">None</button>
      </div>
      <p class="style-disabled-hint" style="display:none">Disabled when content borders are active.</p>
    </div>
  `;
}

/**
 * Sync background UI state using shared style- class selectors.
 */
export function syncBgState(rootEl, state) {
  const swatches = rootEl.querySelectorAll(".style-swatch");
  const themeCb = rootEl.querySelector('[data-field="bg-theme"]');
  const imageStatus = rootEl.querySelector(".style-image-status");
  const bgPreview = rootEl.querySelector(".style-bg-preview");
  const overlaySlider = rootEl.querySelector('[data-field="bg-overlay"]');
  const overlayValue = rootEl.querySelector('[data-display="bg-overlay"]');
  const overlayRow = rootEl.querySelector(".style-overlay-row");

  swatches.forEach((s) => {
    const isNone = s.classList.contains("style-swatch--none");
    const matches = isNone ? !state.bg && !state.imagePath : s.dataset.value === state.bg;
    s.classList.toggle("selected", matches);
  });
  if (themeCb) themeCb.checked = state.theme === "dark";
  if (imageStatus) {
    if (state.imagePath) {
      imageStatus.textContent = state.imagePath;
      imageStatus.style.display = "block";
    } else {
      imageStatus.style.display = "none";
    }
  }
  if (bgPreview) {
    bgPreview.style.background = state.bgValue || "var(--surface-elevated)";
    bgPreview.classList.toggle("has-bg", !!state.bgValue);
  }
  if (overlayRow) overlayRow.style.display = state.imagePath ? "flex" : "none";
  if (overlaySlider) overlaySlider.value = state.overlay;
  if (overlayValue) overlayValue.textContent = `${state.overlay}%`;
}

/**
 * Parse image background from a raw background CSS value.
 * Returns { imagePath, imageBlobUrl, overlay, bg }
 */
export function parseBackgroundValue(rawBg) {
  const urlMatch = rawBg.match(/url\(['"]?([^'")]+)['"]?\)/);
  if (urlMatch) {
    const overlayMatch = rawBg.match(/rgba\(0,0,0,([\d.]+)\)/);
    return {
      imagePath: urlMatch[1],
      imageBlobUrl: "",
      overlay: overlayMatch ? Math.round(parseFloat(overlayMatch[1]) * 100) : 0,
      bg: rawBg,
    };
  }
  return { imagePath: "", imageBlobUrl: "", overlay: 40, bg: rawBg };
}
