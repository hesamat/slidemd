/**
 * AreaContextMenu
 *
 * Right-click context menu for @area labels in the slide editor.
 * Follows the same pattern as SlideContextMenu in slide-thumbnails.js.
 */

export class AreaContextMenu {
  /**
   * @param {object} opts
   * @param {(areaName: string) => void} opts.onDeleteArea
   * @param {(areaName: string) => void} opts.onSwapArea
   * @param {(areaName: string) => void} opts.onMakeFullHeight
   * @param {(areaName: string, align: string) => void} opts.onAlignMain
   * @param {(areaName: string, color: string) => void} opts.onSetBackground
   * @param {(areaName: string) => void} opts.onToggleFullBleed
   */
  constructor({
    onDeleteArea,
    onSwapArea,
    onMakeFullHeight,
    onAlignMain,
    onSetBackground,
    onToggleFullBleed,
  }) {
    this._onDeleteArea = onDeleteArea;
    this._onSwapArea = onSwapArea;
    this._onMakeFullHeight = onMakeFullHeight;
    this._onAlignMain = onAlignMain;
    this._onSetBackground = onSetBackground;
    this._onToggleFullBleed = onToggleFullBleed;
    this._menuEl = null;
    this._colorInput = null;
    this._abortController = null;
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

    document.addEventListener("click", () => this.close(), { signal });
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
   * @param {boolean} [opts.canSetBackground=false]  — show background color picker
   * @param {boolean} [opts.canFullBleed=false]  — show the media full-bleed toggle
   * @param {string} [opts.fullBleedLabel]  — label for the full-bleed item
   * @param {string} [opts.currentColor]  — seed value for the colour picker (#rrggbb)
   * @param {boolean} [opts.hasBackground]  — whether the area already has a background
   * @param {string} [opts.activeAlign]  — currently active alignment for main
   */
  open(clientX, clientY, areaName, opts = {}) {
    this._cleanupColorInput();
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
      const currentColor = opts.currentColor || "#ffffff";
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

        const input = document.createElement("input");
        input.type = "color";
        input.value = currentColor;
        input.setAttribute("aria-hidden", "true");
        input.style.position = "fixed";
        input.style.opacity = "0";
        input.style.pointerEvents = "none";
        input.style.left = "-9999px";

        this._colorInput = input;

        let commitTimeout = null;
        const commit = (finalValue) => {
          if (this._colorInput !== input) return;
          window.clearTimeout(commitTimeout);
          this._colorInput = null;
          this.close();
          this._onSetBackground?.(areaName, finalValue);
          input.remove();
        };

        input.addEventListener("blur", () => commit(input.value), { once: true });
        input.addEventListener("click", (ev) => ev.stopPropagation(), { once: true });

        const onWindowFocus = () => {
          if (this._colorInput !== input) return;
          commitTimeout = window.setTimeout(() => commit(input.value), 300);
        };
        window.addEventListener("focus", onWindowFocus, { once: true });

        document.body.appendChild(input);
        input.click();
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

  close() {
    if (this._menuEl) {
      this._menuEl.remove();
      this._menuEl = null;
    }
  }

  _cleanupColorInput() {
    if (this._colorInput) {
      this._colorInput.remove();
      this._colorInput = null;
    }
  }

  destroy() {
    this._abortController?.abort();
    this._abortController = null;
    this._cleanupColorInput();
    this.close();
  }
}
