/**
 * SlideStylePanel
 *
 * Friendly floating panel for styling all grid areas uniformly in edit mode.
 * Opens from the Insert dropdown's "Slide Styles" menu item.
 *
 * Controls are structured (sliders, color pickers) rather than raw CSS.
 * The area-style directive (plain CSS string) in markdown is the source
 * of truth, applied to every .slide__area element.
 */

import { MarkdownParser } from "../../data/markdown-parser.js";
import { updateAreaStyleDirective } from "../core/directive-utils.js";

export class SlideStylePanel {
    static el = null;
    static _getMarkdown = null;
    static _setMarkdown = null;
    static _debounceTimer = null;
    static _ignoreNextOutsideClick = false;

    static init(getMarkdown, setMarkdown, applyToAll) {
        this._getMarkdown = getMarkdown;
        this._setMarkdown = setMarkdown;
        this._applyToAll = applyToAll;
    }

    // ── Markdown read/write ──

    static _readAreaStyleFromMarkdown() {
        if (!this._getMarkdown) return "";
        const markdown = this._getMarkdown();
        const parser = new MarkdownParser();
        const { value } = parser.extractDirective(markdown, "area-style");
        return value || "";
    }

    static _applyChange() {
        if (!this._getMarkdown || !this._setMarkdown) return;
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => this._doApplyChange(), 300);
    }

    static _doApplyChange() {
        if (!this._getMarkdown || !this._setMarkdown) return;
        const cssString = this._buildCssFromUI();
        const markdown = this._getMarkdown();
        this._setMarkdown(updateAreaStyleDirective(markdown, cssString));
    }

    // ── CSS <-> structured value conversion ──

    static _parseCss(css) {
        const out = {};
        if (!css) return out;
        for (const part of css.split(";").map(s => s.trim()).filter(Boolean)) {
            const idx = part.indexOf(":");
            if (idx === -1) continue;
            out[part.slice(0, idx).trim().toLowerCase()] = part.slice(idx + 1).trim();
        }
        return out;
    }

    static _parseBorder(val) {
        if (!val) return { width: 0, color: "#d3d3d3" };
        const m = val.match(/^(\d+)px\s+solid\s+(.+)$/i);
        if (!m) return { width: 0, color: "#d3d3d3" };
        return { width: parseInt(m[1]), color: this._toHex(m[2]) };
    }

    static _parsePx(val) {
        if (!val) return 0;
        const m = val.match(/^(\d+)/);
        return m ? parseInt(m[1]) : 0;
    }

    static _buildCssFromUI() {
        if (!this.el) return "";
        const parts = [];

        // Border — solid only, controlled by width slider + color picker
        const bw = parseInt(this.el.querySelector('[data-field="border-width"]')?.value) || 0;
        const bc = this.el.querySelector('[data-field="border-color"]')?.value || "#d3d3d3";
        if (bw > 0) {
            parts.push(`border: ${bw}px solid ${bc}`);
        }

        // Border radius
        const radius = parseInt(this.el.querySelector('[data-field="radius"]')?.value) || 0;
        if (radius > 0) parts.push(`border-radius: ${radius}px`);

        // Padding — only emit if different from the default 10px
        const padding = parseInt(this.el.querySelector('[data-field="padding"]')?.value);
        if (padding && padding !== 10) parts.push(`padding: ${padding}px`);

        return parts.join("; ");
    }

    static _toHex(color) {
        if (!color) return "#000000";
        if (color.startsWith("#")) return color.length === 7 ? color : "#000000";
        const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (!m) return "#000000";
        return this._rgbToHex(parseInt(m[1]), parseInt(m[2]), parseInt(m[3]));
    }

    static _rgbToHex(r, g, b) {
        return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
    }

    // ── Show / hide / toggle ──

    static show() {
        if (!this.el) this._buildDom();
        const css = this._readAreaStyleFromMarkdown();
        this._syncUI(css);
        this.el.classList.remove("webdeck-hidden");
        const slideContainer = document.getElementById("slidesContainer");
        if (slideContainer) {
            this._positionOver(slideContainer);
        }
        this._ignoreNextOutsideClick = true;
    }

    static _positionOver(containerEl) {
        const rect = containerEl.getBoundingClientRect();
        const panelW = this.el.offsetWidth || 300;
        let top = rect.top + window.scrollY + 16;
        let left = rect.left + window.scrollX + (rect.width - panelW) / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - panelW - 8));
        this.el.style.top = `${top}px`;
        this.el.style.left = `${left}px`;
    }

    static hide() {
        if (this._debounceTimer) { clearTimeout(this._debounceTimer); this._debounceTimer = null; }
        if (this.el) this.el.classList.add("webdeck-hidden");
    }

    static isVisible() { return this.el && !this.el.classList.contains("webdeck-hidden"); }

    static toggle() {
        if (this.isVisible()) this.hide();
        else this.show();
    }

    // ── UI sync ──

    static _syncUI(cssText) {
        if (!this.el) return;
        const parsed = this._parseCss(cssText);
        const border = this._parseBorder(parsed["border"] || "");
        const radius = this._parsePx(parsed["border-radius"] || "");
        const padding = this._parsePx(parsed["padding"] || "");

        const set = (sel, val) => { const el = this.el.querySelector(sel); if (el) el.value = val; };
        const setNum = (sel, val) => { const el = this.el.querySelector(sel); if (el) el.value = Math.round(val); };

        setNum('[data-field="border-width"]', border.width);
        set('[data-field="border-color"]', border.color);
        setNum('[data-field="radius"]', radius);
        // If no padding directive, show the default 10px
        setNum('[data-field="padding"]', parsed["padding"] !== undefined ? padding : 10);

        this._updateSliderLabels();
    }

    static _updateSliderLabels() {
        if (!this.el) return;
        const borderEl = this.el.querySelector('[data-field="border-width"]');
        const borderLabel = this.el.querySelector('[data-display="border-width"]');
        if (borderEl && borderLabel) borderLabel.textContent = `${borderEl.value}px`;
        const radiusEl = this.el.querySelector('[data-field="radius"]');
        const radiusLabel = this.el.querySelector('[data-display="radius"]');
        if (radiusEl && radiusLabel) radiusLabel.textContent = `${radiusEl.value}px`;
        const paddingEl = this.el.querySelector('[data-field="padding"]');
        const paddingLabel = this.el.querySelector('[data-display="padding"]');
        if (paddingEl && paddingLabel) paddingLabel.textContent = `${paddingEl.value}px`;
    }

    // ── DOM ──

    static _buildDom() {
        const el = document.createElement("div");
        el.className = "slide-style-panel webdeck-hidden";
        el.setAttribute("role", "dialog");
        el.setAttribute("aria-label", "Slide styles panel");

        el.innerHTML = `
            <div class="slide-style-panel__header">
                <span class="slide-style-panel__title">Slide Styles</span>
                <button class="slide-style-panel__close" type="button" aria-label="Close">&times;</button>
            </div>
            <div class="slide-style-panel__body">

                <div class="slide-style-panel__section">Border</div>
                <div class="slide-style-panel__row">
                    <input type="range" class="slide-style-panel__range slide-style-panel__range--grow" data-field="border-width" min="0" max="12" value="0" />
                    <span class="slide-style-panel__value" data-display="border-width">0px</span>
                    <input type="color" class="slide-style-panel__color" data-field="border-color" value="#d3d3d3" />
                </div>

                <div class="slide-style-panel__section">Corner Radius</div>
                <div class="slide-style-panel__row">
                    <input type="range" class="slide-style-panel__range slide-style-panel__range--grow" data-field="radius" min="0" max="50" value="0" />
                    <span class="slide-style-panel__value" data-display="radius">0px</span>
                </div>

                <div class="slide-style-panel__section">Padding</div>
                <div class="slide-style-panel__row">
                    <input type="range" class="slide-style-panel__range slide-style-panel__range--grow" data-field="padding" min="0" max="48" value="10" />
                    <span class="slide-style-panel__value" data-display="padding">10px</span>
                </div>

            </div>
            <div class="slide-style-panel__footer">
                <button class="slide-style-panel__btn" data-action="apply-all">Apply to All</button>
                <button class="slide-style-panel__btn slide-style-panel__btn--danger" data-action="clear">Clear All</button>
            </div>
        `;

        document.body.appendChild(el);
        this.el = el;

        // Close
        el.querySelector(".slide-style-panel__close").addEventListener("click", () => this.hide());

        // Drag
        this._initDrag(el);

        // All inputs trigger apply
        el.querySelectorAll("input[data-field]").forEach(input => {
            input.addEventListener("input", () => {
                this._updateSliderLabels();
                this._applyChange();
            });
        });

        // Clear — immediate
        el.querySelector('[data-action="clear"]').addEventListener("click", () => {
            if (this._debounceTimer) { clearTimeout(this._debounceTimer); this._debounceTimer = null; }
            this._syncUI("");
            this._doApplyChange();
        });

        // Apply to all slides
        el.querySelector('[data-action="apply-all"]').addEventListener("click", () => {
            if (this._debounceTimer) { clearTimeout(this._debounceTimer); this._debounceTimer = null; }
            const cssString = this._buildCssFromUI();
            if (this._applyToAll) this._applyToAll(cssString);
        });

        // Outside click closes
        document.addEventListener("click", (e) => {
            if (!this.isVisible()) return;
            if (this._ignoreNextOutsideClick) {
                this._ignoreNextOutsideClick = false;
                return;
            }
            if (this.el.contains(e.target)) return;
            this.hide();
        });

        // Escape closes
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.isVisible()) this.hide();
        });
    }

    static _initDrag(el) {
        const header = el.querySelector(".slide-style-panel__header");
        if (!header) return;
        header.addEventListener("mousedown", (e) => {
            if (e.target.closest(".slide-style-panel__close")) return;
            e.preventDefault();
            const sx = e.clientX, sy = e.clientY, sl = el.offsetLeft, st = el.offsetTop;
            const onMove = (ev) => {
                el.style.left = `${sl + ev.clientX - sx}px`;
                el.style.top = `${st + ev.clientY - sy}px`;
            };
            const onUp = () => {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        });
    }
}
