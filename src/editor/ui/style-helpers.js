/**
 * Shared helpers for SlideStylePanel and NewPresentationModal.
 * Keeps background swatches, image backgrounds, area styling,
 * and title-decoration logic in one place.
 */

const DARK_BORDER_COLOR = "#94a3b8";
const LIGHT_BORDER_COLOR = "#64748b";

export function getDefaultBorderColor() {
  const theme =
    (typeof document !== "undefined" && document.documentElement?.getAttribute("data-theme")) ||
    (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light");
  return theme === "dark" ? DARK_BORDER_COLOR : LIGHT_BORDER_COLOR;
}

export const COLOR_SWATCHES = [
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

/**
 * Convert a hex color + opacity (0–100) to an rgba() string.
 * @param {string} hex - #rrggbb
 * @param {number} opacity - 0–100 (100 = fully opaque)
 * @returns {string} rgba(r, g, b, a) or the original hex when opacity is 100
 */
export function hexToRgba(hex, opacity) {
  if (!hex || !hex.startsWith("#")) return hex || "";
  // Expand 3-digit hex (#fff → #ffffff) so transparency applies to short-hand
  // colors that may come from AI output or hand-written markdown. Other
  // malformed values pass through unchanged.
  let normalized = hex;
  if (hex.length === 4 && /^#[0-9a-f]{3}$/i.test(hex)) {
    normalized = `#${[...hex.slice(1)].map((c) => c + c).join("")}`;
  }
  if (normalized.length !== 7) return hex;
  const alpha = Math.round((opacity / 100) * 100) / 100;
  if (alpha >= 1) return normalized;
  const c = normalized.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Parse an rgba()/rgb() string into { hex, opacity }.
 * Falls back to { hex: raw, opacity: 100 } for non-rgba values.
 * @param {string} raw
 * @returns {{ hex: string, opacity: number }}
 */
export function parseRgba(raw) {
  const text = String(raw || "").trim();
  const m = text.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i);
  if (m) {
    const r = parseInt(m[1], 10);
    const g = parseInt(m[2], 10);
    const b = parseInt(m[3], 10);
    const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
    const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    return { hex, opacity: Math.round(alpha * 100) };
  }
  return { hex: text, opacity: 100 };
}

/**
 * Default background image options.  These match the historical behavior
 * (center / cover no-repeat with a dark overlay) so existing decks keep
 * rendering the same way.
 */
export const DEFAULT_BG_IMAGE_OPTS = {
  size: "cover",
  position: "center",
  repeat: "no-repeat",
};

/**
 * Build a CSS `background` value for an image with optional dark overlay.
 *
 * @param {string} imagePath - On-disk image path (used for persistence).
 * @param {number} overlay - Overlay opacity 0–100 (0 = no overlay).
 * @param {string} [blobUrl] - Session-only blob URL for preview; falls back to imagePath.
 * @param {{ size?: string, position?: string, repeat?: string }} [opts]
 *   Background-size (cover/contain/auto/…), background-position (center/top left/…),
 *   background-repeat (no-repeat/repeat/…).  Defaults to cover/center/no-repeat.
 * @returns {string} CSS background shorthand string, or "" when no image path.
 */
export function buildImageBackground(imagePath, overlay, blobUrl, opts = {}) {
  if (!imagePath) return "";
  const displayUrl = blobUrl || imagePath;
  const url = `url('${String(displayUrl).replace(/'/g, "\\'")}')`;
  const { size, position, repeat } = { ...DEFAULT_BG_IMAGE_OPTS, ...opts };
  const imageLayer = `${url} ${position} / ${size} ${repeat}`;
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
    color: parts[2] || getDefaultBorderColor(),
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
  const bc = rootEl.querySelector('[data-field="border-color"]')?.value ?? getDefaultBorderColor();
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
  const mw = rootEl.querySelector('[data-field="main-width"]');
  if (mw) set('[data-display="main-width"]', `${mw.value}%`);
}

export function syncTitleDisabled(rootEl, { titleBtnSelector, hintSelector } = {}) {
  const bw = rootEl.querySelector('[data-field="border-width"]');
  const hasBorders = bw && parseInt(bw.value, 10) > 0;
  const btns = rootEl.querySelectorAll(titleBtnSelector || ".style-btn-option");
  const hint = rootEl.querySelector(hintSelector || ".style-disabled-hint");
  btns.forEach((btn) => {
    btn.disabled = hasBorders;
    if (hasBorders) btn.classList.remove("selected");
  });
  if (hasBorders) {
    const noneBtn = rootEl.querySelector('[data-header-style="none"]');
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
 *
 * Includes color swatches, image picker, overlay (dark transparency),
 * background-size (cover/contain/auto), background-position, and a live
 * preview.  The size/position controls are only relevant for image
 * backgrounds; callers toggle their visibility via syncBgState.
 */
export function buildBackgroundPanelHtml({ image = true } = {}) {
  const imageSection = image
    ? `
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
    <div class="style-bg-options" style="display:none">
      <div class="style-control-row">
        <span class="style-control-label">Size</span>
        <div class="style-btn-group style-btn-group--compact" data-bg-size-group>
          <button class="style-btn-option selected" data-bg-size="cover" type="button">Cover</button>
          <button class="style-btn-option" data-bg-size="contain" type="button">Contain</button>
          <button class="style-btn-option" data-bg-size="auto" type="button">Auto</button>
        </div>
      </div>
      <div class="style-control-row">
        <span class="style-control-label">Position</span>
        <div class="style-btn-group style-btn-group--compact" data-bg-position-group>
          <button class="style-btn-option" data-bg-position="top left" type="button">↖</button>
          <button class="style-btn-option" data-bg-position="top center" type="button">↑</button>
          <button class="style-btn-option" data-bg-position="top right" type="button">↗</button>
          <button class="style-btn-option" data-bg-position="center left" type="button">←</button>
          <button class="style-btn-option selected" data-bg-position="center" type="button">•</button>
          <button class="style-btn-option" data-bg-position="center right" type="button">→</button>
          <button class="style-btn-option" data-bg-position="bottom left" type="button">↙</button>
          <button class="style-btn-option" data-bg-position="bottom center" type="button">↓</button>
          <button class="style-btn-option" data-bg-position="bottom right" type="button">↘</button>
        </div>
      </div>
    </div>`
    : "";
  return `
    <div class="style-inline-section">
      <div class="style-color-row">
        <span class="style-label">Color</span>
        <div class="style-swatch-grid">${buildSwatchHtml()}</div>
      </div>
    </div>
    <div class="style-hex-row" style="display:none">
      <input type="text" class="style-hex-input" data-field="bg-hex" spellcheck="false" placeholder="#000000" maxlength="7" />
    </div>
    <div class="style-opacity-row" style="display:none">
      <span class="style-label">Transparency</span>
      <input type="range" class="style-range" data-field="bg-opacity" min="0" max="100" value="0" />
      <span class="style-control-value" data-display="bg-opacity">0%</span>
    </div>${imageSection}
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
        <input type="color" class="style-color" data-field="border-color" value="${getDefaultBorderColor()}" />
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
 */
export function buildTitlePanelHtml() {
  return `
    <div class="style-inline-section">
      <span class="style-label">Title Decoration</span>
      <p class="style-hint">Accent line under slide titles.</p>
      <div class="style-btn-group">
        <button class="style-btn-option selected" data-header-style="line" type="button">Short</button>
        <button class="style-btn-option" data-header-style="full" type="button">Full width</button>
        <button class="style-btn-option" data-header-style="none" type="button">None</button>
      </div>
      <p class="style-disabled-hint" style="display:none">Disabled when content borders are active.</p>
    </div>
  `;
}

/**
 * Build the layout panel HTML for single-column main width/alignment controls.
 */
export function buildLayoutPanelHtml() {
  return `
    <div class="style-inline-section">
      <span class="style-label">Main Column Width</span>
      <p class="style-hint">Available for single-column layouts such as header-content and focus.</p>
      <div class="style-control-row">
        <input type="range" class="style-range" data-field="main-width" min="30" max="100" value="100" />
        <span class="style-control-value" data-display="main-width">100%</span>
      </div>
    </div>
    <div class="style-inline-section">
      <span class="style-label">Main Column Alignment</span>
      <div class="style-btn-group" data-align-group>
        <button class="style-btn-option" data-align="left" type="button">Left</button>
        <button class="style-btn-option selected" data-align="center" type="button">Center</button>
        <button class="style-btn-option" data-align="right" type="button">Right</button>
      </div>
    </div>
  `;
}

/**
 * Sync background UI state using shared style- class selectors.
 *
 * @param {HTMLElement} rootEl
 * @param {{
 *   bg: string,
 *   imagePath: string,
 *   theme: string,
 *   bgValue: string,
 *   overlay: number,
 *   opacity?: number,
 *   size?: string,
 *   position?: string,
 * }} state
 */
export function syncBgState(rootEl, state) {
  const swatches = rootEl.querySelectorAll(".style-swatch");
  const themeCb = rootEl.querySelector('[data-field="bg-theme"]');
  const imageStatus = rootEl.querySelector(".style-image-status");
  const bgPreview = rootEl.querySelector(".style-bg-preview");
  const overlaySlider = rootEl.querySelector('[data-field="bg-overlay"]');
  const overlayValue = rootEl.querySelector('[data-display="bg-overlay"]');
  const overlayRow = rootEl.querySelector(".style-overlay-row");
  const bgOptions = rootEl.querySelector(".style-bg-options");
  const opacityRow = rootEl.querySelector(".style-opacity-row");
  const opacitySlider = rootEl.querySelector('[data-field="bg-opacity"]');
  const opacityValue = rootEl.querySelector('[data-display="bg-opacity"]');

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
  const showImageControls = Boolean(state.imagePath);
  const showColorControls = Boolean(state.bg) && !showImageControls;
  const hexRow = rootEl.querySelector(".style-hex-row");
  if (overlayRow) overlayRow.style.display = showImageControls ? "flex" : "none";
  if (bgOptions) bgOptions.style.display = showImageControls ? "block" : "none";
  if (hexRow) hexRow.style.display = showColorControls ? "flex" : "none";
  if (opacityRow) opacityRow.style.display = showColorControls ? "flex" : "none";
  if (overlaySlider) overlaySlider.value = state.overlay;
  if (overlayValue) overlayValue.textContent = `${state.overlay}%`;
  if (opacitySlider) opacitySlider.value = state.opacity ?? 0;
  if (opacityValue) opacityValue.textContent = `${state.opacity ?? 0}%`;
  const hexInput = rootEl.querySelector('[data-field="bg-hex"]');
  if (hexInput && document.activeElement !== hexInput) hexInput.value = state.bg || "";

  // Sync size/position button groups
  if (showImageControls) {
    const sizeBtns = rootEl.querySelectorAll("[data-bg-size]");
    const posBtns = rootEl.querySelectorAll("[data-bg-position]");
    const currentSize = state.size || DEFAULT_BG_IMAGE_OPTS.size;
    const currentPos = (state.position || DEFAULT_BG_IMAGE_OPTS.position).toLowerCase();
    sizeBtns.forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.bgSize === currentSize);
    });
    posBtns.forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.bgPosition === currentPos);
    });
  }
}

/**
 * Split a string on top-level commas, respecting nested parentheses and
 * quoted strings.  Used by parseBackgroundValue to separate CSS background
 * layers (e.g. "linear-gradient(...), url(...) center / cover no-repeat").
 * @param {string} text
 * @returns {string[]}
 */
function splitTopLevelCommas(text) {
  const parts = [];
  let current = "";
  let parenDepth = 0;
  let inString = false;
  let stringChar = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      current += ch;
      if (ch === "\\" && i + 1 < text.length) {
        current += text[++i];
      } else if (ch === stringChar) {
        inString = false;
        stringChar = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      current += ch;
      continue;
    }
    if (ch === "(") {
      parenDepth++;
    } else if (ch === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
    }
    if (ch === "," && parenDepth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * Parse image background from a raw background CSS value.
 *
 * Extracts the image path, dark-overlay opacity, and background-size /
 * position / repeat from the CSS shorthand so the picker can seed its
 * controls from an existing value.  Falls back to defaults when a
 * component is not present (e.g. older decks that only wrote
 * `url(...) center / cover no-repeat`).
 *
 * @param {string} rawBg
 * @returns {{
 *   imagePath: string,
 *   imageBlobUrl: string,
 *   overlay: number,
 *   bg: string,
 *   size: string,
 *   position: string,
 *   repeat: string,
 * }}
 */
export function parseBackgroundValue(rawBg) {
  const text = String(rawBg || "");
  const urlMatch = text.match(/url\(['"]?([^'")]+)['"]?\)/);
  if (urlMatch) {
    const overlayMatch = text.match(/rgba\(0,0,0,([\d.]+)\)/);
    const overlay = overlayMatch ? Math.round(parseFloat(overlayMatch[1]) * 100) : 0;

    // Split on top-level commas (respecting nested parens and strings) to
    // separate the overlay gradient from the image layer.
    // buildImageBackground writes: "gradient, url(...) pos / size repeat"
    // but older decks may have the layers in reverse order, so find the
    // layer that contains url(...).
    const layers = splitTopLevelCommas(text);
    const imageLayer = layers.find((l) => /url\(/i.test(l)) || layers[layers.length - 1] || text;

    // Position and size are separated by ` / ` in the shorthand.
    // Position can be 1–2 words (center, top left, …).
    const afterUrl = imageLayer.replace(/url\([^)]+\)\s*/, "").trim();
    const slashIdx = afterUrl.indexOf("/");
    let position;
    let sizeRepeat = "";
    if (slashIdx >= 0) {
      position = afterUrl.slice(0, slashIdx).trim() || "center";
      sizeRepeat = afterUrl.slice(slashIdx + 1).trim();
    } else {
      // No slash → everything after url() is position (no explicit size).
      position = afterUrl.trim() || "center";
    }

    // sizeRepeat is "<size> <repeat>" — size can be cover/contain/auto/100%…
    // repeat is no-repeat/repeat/repeat-x/repeat-y.
    let size = "cover";
    let repeat = "no-repeat";
    if (sizeRepeat) {
      const repeatMatch = sizeRepeat.match(/\b(no-repeat|repeat-x|repeat-y|repeat)\b/i);
      if (repeatMatch) {
        repeat = repeatMatch[1].toLowerCase();
        size = sizeRepeat.replace(repeatMatch[0], "").trim() || "cover";
      } else {
        size = sizeRepeat.trim() || "cover";
      }
    }

    // Position may be multi-word ("top left"); normalise to the values the
    // picker uses.  If it doesn't match a known preset, keep the raw string.
    position = position.toLowerCase();

    return {
      imagePath: urlMatch[1],
      imageBlobUrl: "",
      overlay,
      bg: "",
      opacity: 0,
      size,
      position,
      repeat,
    };
  }
  // Non-image background: could be a hex color, rgba(), or named color.
  // Parse rgba to extract the hex + opacity so the swatch grid and
  // transparency slider seed correctly.
  const parsed = parseRgba(text);
  return {
    imagePath: "",
    imageBlobUrl: "",
    overlay: 40,
    bg: parsed.hex,
    opacity: parsed.opacity,
    size: DEFAULT_BG_IMAGE_OPTS.size,
    position: DEFAULT_BG_IMAGE_OPTS.position,
    repeat: DEFAULT_BG_IMAGE_OPTS.repeat,
  };
}
