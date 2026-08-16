/**
 * AreaContextMenu
 *
 * Right-click context menu for @area labels in the slide editor.
 * Follows the same pattern as SlideContextMenu in slide-thumbnails.js.
 *
 * The "Set background…" item opens a popover panel (anchored at the cursor)
 * that reuses the shared background infrastructure from style-helpers.js:
 * color swatches, custom color, image picker, overlay slider, and live
 * preview, with explicit Apply / Cancel buttons.
 */

import {
  buildBackgroundPanelHtml,
  buildImageBackground,
  hexToRgba,
  parseBackgroundValue,
  syncBgState,
} from "../ui/style-helpers.js";

export class AreaContextMenu {
  /**
   * @param {object} opts
   * @param {(areaName: string) => void} opts.onDeleteArea
   * @param {(areaName: string) => void} opts.onSwapArea
   * @param {(areaName: string) => void} opts.onMakeFullHeight
   * @param {(areaName: string, align: string) => void} opts.onAlignMain
   * @param {(areaName: string, cssBackground: string) => void} opts.onSetBackground
   *   Called with the full CSS `background:` value (color, gradient, or
   *   image layer string). An empty string means "remove the background".
   * @param {(areaName: string) => void} opts.onToggleFullBleed
   * @param {() => HTMLElement|null} [opts.getAreaElement]
   *   Returns the area element for the currently-open menu, used for live
   *   preview while the background popover is open.
   */
  constructor({
    onDeleteArea,
    onSwapArea,
    onMakeFullHeight,
    onAlignMain,
    onSetBackground,
    onToggleFullBleed,
    getAreaElement,
  }) {
    this._onDeleteArea = onDeleteArea;
    this._onSwapArea = onSwapArea;
    this._onMakeFullHeight = onMakeFullHeight;
    this._onAlignMain = onAlignMain;
    this._onSetBackground = onSetBackground;
    this._onToggleFullBleed = onToggleFullBleed;
    this._getAreaElement = getAreaElement;
    this._menuEl = null;
    this._popoverEl = null;
    this._abortController = null;

    // Popover state (reset in _openBackgroundPopover)
    this._bgState = null;
    this._bgAreaName = null;
    this._bgOriginalBackground = null; // inline style to restore on cancel
  }

  /**
   * Create a context-menu button with a safely rendered label.
   * @private
   */
  _createMenuItem(label, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "area-context-menu__item";
    btn.setAttribute("role", "menuitem");
    const labelSpan = document.createElement("span");
    labelSpan.className = "area-context-menu__label";
    labelSpan.textContent = label;
    btn.appendChild(labelSpan);
    if (onClick) {
      btn.addEventListener("click", onClick);
    }
    return btn;
  }

  init() {
    this._abortController = new AbortController();
    const { signal } = this._abortController;

    document.addEventListener(
      "click",
      (e) => {
        // Don't close the menu when a click lands inside the popover — the
        // popover manages its own lifecycle and Apply/Cancel.
        if (this._popoverEl && this._popoverEl.contains(e.target)) return;
        this.close();
      },
      { signal },
    );
    document.addEventListener("scroll", () => this.close(), { signal, capture: true });
    window.addEventListener("resize", () => this.close(), { signal });
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") this.close();
      },
      { signal },
    );
  }

  /**
   * Open the context menu at the given screen coordinates.
   * @param {number} clientX
   * @param {number} clientY
   * @param {string} areaName
   * @param {object} [opts]
   * @param {boolean} [opts.canDelete=true]
   * @param {boolean} [opts.canSwap=false]  — show swap option
   * @param {boolean} [opts.canMakeFullHeight=false]  — show "Make column full height" option
   * @param {boolean} [opts.canAlignMain=false]  — show main alignment options
   * @param {boolean} [opts.canSetBackground=false]  — show background picker
   * @param {boolean} [opts.canFullBleed=false]  — show the media full-bleed toggle
   * @param {string} [opts.fullBleedLabel]  — label for the full-bleed item
   * @param {string} [opts.currentBackground]  — current CSS background value for the area
   * @param {boolean} [opts.hasBackground]  — whether the area already has a background
   * @param {string} [opts.activeAlign]  — currently active alignment for main
   */
  open(clientX, clientY, areaName, opts = {}) {
    this.close();
    const canDelete = opts.canDelete !== false;
    const canSwap = opts.canSwap === true;
    const canMakeFullHeight = opts.canMakeFullHeight === true;
    const canAlignMain = opts.canAlignMain === true;
    const canSetBackground = opts.canSetBackground === true;
    const canFullBleed = opts.canFullBleed === true;
    const fullBleedLabel = opts.fullBleedLabel || "";
    const activeAlign = opts.activeAlign;
    if (
      !canDelete &&
      !canSwap &&
      !canMakeFullHeight &&
      !canAlignMain &&
      !canSetBackground &&
      !canFullBleed
    )
      return;

    const menu = document.createElement("div");
    menu.className = "area-context-menu";
    menu.setAttribute("role", "menu");
    menu.style.left = `${clientX}px`;
    menu.style.top = `${clientY}px`;

    if (canAlignMain && areaName === "main") {
      const row = document.createElement("div");
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", "Main alignment");
      row.style.display = "flex";
      row.style.gap = "4px";
      row.style.marginBottom = "4px";
      for (const align of ["left", "center", "right"]) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("role", "menuitem");
        btn.className = "area-context-menu__item";
        btn.style.flex = "1";
        btn.style.justifyContent = "center";
        btn.textContent = align[0].toUpperCase() + align.slice(1);
        const isActive = align === activeAlign;
        btn.setAttribute("aria-pressed", String(isActive));
        if (isActive) btn.classList.add("area-context-menu__item--active");
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.close();
          this._onAlignMain?.(areaName, align);
        });
        row.appendChild(btn);
      }
      menu.appendChild(row);
    }

    if (canSwap) {
      const btn = this._createMenuItem("Swap with next", (e) => {
        e.stopPropagation();
        this.close();
        this._onSwapArea?.(areaName);
      });
      menu.appendChild(btn);
    }

    if (canMakeFullHeight) {
      const btn = this._createMenuItem("Make column full height", (e) => {
        e.stopPropagation();
        this.close();
        this._onMakeFullHeight?.(areaName);
      });
      menu.appendChild(btn);
    }

    if (canFullBleed && fullBleedLabel) {
      const btn = this._createMenuItem(fullBleedLabel, (e) => {
        e.stopPropagation();
        this.close();
        this._onToggleFullBleed?.(areaName);
      });
      menu.appendChild(btn);
    }

    if (canSetBackground) {
      const hasBackground = opts.hasBackground;

      if (hasBackground) {
        const removeBtn = this._createMenuItem("Remove background", (e) => {
          e.stopPropagation();
          this.close();
          this._onSetBackground?.(areaName, "");
        });
        menu.appendChild(removeBtn);
      }

      const bgBtn = this._createMenuItem("Set background…", (e) => {
        e.stopPropagation();
        this._openBackgroundPopover(clientX, clientY, areaName, opts.currentBackground || "");
      });
      menu.appendChild(bgBtn);
    }

    if (canDelete) {
      const btn = this._createMenuItem(`Delete @${areaName}`, (e) => {
        e.stopPropagation();
        this.close();
        this._onDeleteArea?.(areaName);
      });
      menu.appendChild(btn);
    }

    document.body.appendChild(menu);
    this._menuEl = menu;

    // Viewport overflow correction.
    const rect = menu.getBoundingClientRect();
    const overflowX = rect.right - window.innerWidth;
    const overflowY = rect.bottom - window.innerHeight;
    if (overflowX > 0) menu.style.left = `${Math.max(4, clientX - overflowX - 4)}px`;
    if (overflowY > 0) menu.style.top = `${Math.max(4, clientY - overflowY - 4)}px`;
  }

  // ── Background popover ──────────────────────────────────────────────

  /**
   * Open the background popover anchored at the cursor. The popover reuses
   * buildBackgroundPanelHtml() for swatches/color/image/overlay/preview,
   * and adds Apply / Cancel buttons. Live preview updates the area element
   * in place; Apply commits to markdown via onSetBackground; Cancel
   * restores the original inline style and closes.
   * @private
   */
  _openBackgroundPopover(clientX, clientY, areaName, currentBackground) {
    // Close the menu itself — the popover replaces it.
    this._closeMenuEl();

    const parsed = parseBackgroundValue(currentBackground);
    this._bgAreaName = areaName;
    this._bgState = {
      bg: parsed.imagePath ? "" : parsed.bg,
      imagePath: parsed.imagePath,
      imageBlobUrl: parsed.imageBlobUrl,
      overlay: parsed.overlay,
      opacity: parsed.opacity ?? 0,
      size: parsed.size,
      position: parsed.position,
      theme: "",
    };

    // Capture the area element's original inline background so Cancel can
    // restore it exactly. The renderer sets area.style background via
    // _applyAreaStyle, so this captures the rendered value.
    const areaEl = this._getAreaElement?.(areaName);
    this._bgOriginalBackground = areaEl ? areaEl.style.background : null;

    const popover = document.createElement("div");
    popover.className = "area-bg-popover";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", `Background for @${areaName}`);
    popover.style.left = `${clientX}px`;
    popover.style.top = `${clientY}px`;

    // Body — reuse the shared background panel markup.  buildBackgroundPanelHtml
    // returns a static string with no interpolation, so innerHTML is safe here.
    const body = document.createElement("div");
    body.className = "area-bg-popover__body";
    body.innerHTML = buildBackgroundPanelHtml({ image: false });
    popover.appendChild(body);

    // The shared panel includes a "Dark theme" toggle, but area-level
    // backgrounds only commit a CSS background value — never a theme
    // directive — so the toggle is misleading here.  Hide it.
    const themeRow = body.querySelector(".style-row--between");
    if (themeRow) themeRow.style.display = "none";

    // Seed the hidden custom-color input with the current background so the
    // native picker opens at the existing color, not always at #ffffff.
    const colorInput = body.querySelector('[data-field="bg-custom-color"]');
    if (colorInput && /^#([0-9A-Fa-f]{6})$/.test(parsed.bg)) {
      colorInput.value = parsed.bg;
    }

    // Footer with Apply / Cancel
    const footer = document.createElement("div");
    footer.className = "area-bg-popover__footer";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "area-bg-popover__btn";
    cancelBtn.textContent = "Cancel";
    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "area-bg-popover__btn area-bg-popover__btn--primary";
    applyBtn.textContent = "Apply";
    footer.appendChild(cancelBtn);
    footer.appendChild(applyBtn);
    popover.appendChild(footer);

    document.body.appendChild(popover);
    this._popoverEl = popover;

    // Viewport overflow correction (same approach as the menu).
    const rect = popover.getBoundingClientRect();
    const overflowX = rect.right - window.innerWidth;
    const overflowY = rect.bottom - window.innerHeight;
    if (overflowX > 0) popover.style.left = `${Math.max(4, clientX - overflowX - 4)}px`;
    if (overflowY > 0) popover.style.top = `${Math.max(4, clientY - overflowY - 4)}px`;

    this._syncPopoverUI();
    this._wirePopover(popover, applyBtn, cancelBtn);
  }

  /** Current background CSS string for the popover state (for preview/commit). */
  _currentBgValue() {
    if (!this._bgState) return "";
    if (this._bgState.imagePath) {
      return buildImageBackground(
        this._bgState.imagePath,
        this._bgState.overlay,
        this._bgState.imageBlobUrl,
        { size: this._bgState.size, position: this._bgState.position },
      );
    }
    return this._bgState.bg ? hexToRgba(this._bgState.bg, 100 - this._bgState.opacity) : "";
  }

  /** Persisted background value (on-disk image path, never the blob URL). */
  _persistedBgValue() {
    if (!this._bgState) return "";
    if (this._bgState.imagePath) {
      return buildImageBackground(this._bgState.imagePath, this._bgState.overlay, undefined, {
        size: this._bgState.size,
        position: this._bgState.position,
      });
    }
    return this._bgState.bg ? hexToRgba(this._bgState.bg, 100 - this._bgState.opacity) : "";
  }

  /** Push the current popover state into the shared syncBgState UI + live preview. */
  _syncPopoverUI() {
    if (!this._popoverEl) return;
    syncBgState(this._popoverEl, {
      bg: this._bgState.bg,
      imagePath: this._bgState.imagePath,
      theme: this._bgState.theme,
      bgValue: this._currentBgValue(),
      overlay: this._bgState.overlay,
      opacity: this._bgState.opacity,
      size: this._bgState.size,
      position: this._bgState.position,
    });
    // Live preview on the area element itself.
    const areaEl = this._getAreaElement?.(this._bgAreaName);
    if (areaEl) {
      areaEl.style.background = this._currentBgValue() || "";
    }
  }

  _wirePopover(popover, applyBtn, cancelBtn) {
    // Swatch grid clicks
    const swatchGrid = popover.querySelector(".style-swatch-grid");
    if (swatchGrid) {
      swatchGrid.addEventListener("click", (e) => {
        const btn = e.target.closest(".style-swatch");
        if (!btn || btn.dataset.action === "open-color-picker") return;
        e.stopPropagation();
        this._bgState.bg = btn.dataset.value || "";
        this._bgState.imagePath = "";
        this._bgState.imageBlobUrl = "";
        this._bgState.opacity = 0;
        this._syncPopoverUI();
      });
    }

    // Custom color input (hidden, overlays the dropper icon button via
    // .style-color-input-hidden CSS, so clicks reach the input natively).
    const colorInput = popover.querySelector('[data-field="bg-custom-color"]');
    if (colorInput) {
      colorInput.addEventListener("input", (e) => {
        e.stopPropagation();
        this._bgState.bg = e.target.value;
        this._bgState.imagePath = "";
        this._bgState.imageBlobUrl = "";
        this._bgState.opacity = 0;
        this._syncPopoverUI();
      });
    }

    // Overlay slider (image backgrounds) — not present in the area popover
    // (image backgrounds are only offered at the slide level), but kept for
    // safety in case the element exists.
    const overlaySlider = popover.querySelector('[data-field="bg-overlay"]');
    if (overlaySlider) {
      overlaySlider.addEventListener("input", (e) => {
        e.stopPropagation();
        this._bgState.overlay = parseInt(e.target.value, 10);
        const label = popover.querySelector('[data-display="bg-overlay"]');
        if (label) label.textContent = `${this._bgState.overlay}%`;
        this._syncPopoverUI();
      });
    }

    // Transparency slider (solid color backgrounds)
    const opacitySlider = popover.querySelector('[data-field="bg-opacity"]');
    if (opacitySlider) {
      opacitySlider.addEventListener("input", (e) => {
        e.stopPropagation();
        this._bgState.opacity = parseInt(e.target.value, 10);
        const label = popover.querySelector('[data-display="bg-opacity"]');
        if (label) label.textContent = `${this._bgState.opacity}%`;
        this._syncPopoverUI();
      });
    }

    // Hex code input (editable, next to transparency slider)
    const hexInput = popover.querySelector('[data-field="bg-hex"]');
    if (hexInput) {
      hexInput.addEventListener("input", (e) => {
        e.stopPropagation();
        const val = e.target.value.trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
          this._bgState.bg = val;
          this._bgState.imagePath = "";
          this._bgState.imageBlobUrl = "";
          this._bgState.opacity = 0;
          this._syncPopoverUI();
        }
      });
    }

    // Apply
    applyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const value = this._persistedBgValue();
      const areaName = this._bgAreaName;
      this.close();
      this._onSetBackground?.(areaName, value);
    });

    // Cancel
    cancelBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._cancelPopover();
    });

    // Stop popover-internal scroll/pointer events from dismissing via the
    // global handlers.  The global click handler already ignores clicks
    // inside the popover; stop scroll-capture from closing it while the
    // user interacts with the slider.
    popover.addEventListener("scroll", (e) => e.stopPropagation(), { capture: true });
  }

  /** Restore the area element's original background and close the popover. */
  _cancelPopover() {
    const areaEl = this._getAreaElement?.(this._bgAreaName);
    if (areaEl && this._bgOriginalBackground !== null) {
      areaEl.style.background = this._bgOriginalBackground;
    }
    this.close();
  }

  // ── Lifecycle ───────────────────────────────────────────────────────

  _closeMenuEl() {
    if (this._menuEl) {
      this._menuEl.remove();
      this._menuEl = null;
    }
  }

  _closePopover() {
    if (this._popoverEl) {
      this._popoverEl.remove();
      this._popoverEl = null;
    }
    this._bgState = null;
    this._bgAreaName = null;
    this._bgOriginalBackground = null;
  }

  close() {
    this._closePopover();
    this._closeMenuEl();
  }

  destroy() {
    this._abortController?.abort();
    this._abortController = null;
    this.close();
  }
}
