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
   */
  constructor({ onDeleteArea, onSwapArea, onMakeFullHeight, onAlignMain, onSetBackground }) {
    this._onDeleteArea = onDeleteArea;
    this._onSwapArea = onSwapArea;
    this._onMakeFullHeight = onMakeFullHeight;
    this._onAlignMain = onAlignMain;
    this._onSetBackground = onSetBackground;
    this._menuEl = null;
    this._colorInput = null;
    this._abortController = null;
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
   * @param {boolean} [opts.canMakeFullHeight=false]  — show full-height option
   * @param {boolean} [opts.canAlignMain=false]  — show main alignment options
   * @param {boolean} [opts.canSetBackground=false]  — show background color picker
   * @param {string} [opts.activeAlign]  — currently active alignment for main
   */
  open(clientX, clientY, areaName, opts = {}) {
    this.close();
    const canDelete = opts.canDelete !== false;
    const canSwap = opts.canSwap === true;
    const canMakeFullHeight = opts.canMakeFullHeight === true;
    const canAlignMain = opts.canAlignMain === true;
    const canSetBackground = opts.canSetBackground === true;
    const activeAlign = opts.activeAlign;
    if (!canDelete && !canSwap && !canMakeFullHeight && !canAlignMain && !canSetBackground) return;

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
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "area-context-menu__item";
      btn.setAttribute("role", "menuitem");
      btn.innerHTML = `<span class="area-context-menu__label">Swap with next</span>`;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.close();
        this._onSwapArea?.(areaName);
      });
      menu.appendChild(btn);
    }

    if (canMakeFullHeight) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "area-context-menu__item";
      btn.setAttribute("role", "menuitem");
      btn.innerHTML = `<span class="area-context-menu__label">Make full height</span>`;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.close();
        this._onMakeFullHeight?.(areaName);
      });
      menu.appendChild(btn);
    }

    if (canSetBackground) {
      const bgBtn = document.createElement("button");
      bgBtn.type = "button";
      bgBtn.className = "area-context-menu__item";
      bgBtn.setAttribute("role", "menuitem");
      bgBtn.innerHTML = `<span class="area-context-menu__label">Set background…</span>`;
      bgBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const input = document.createElement("input");
        input.type = "color";
        input.value = "#ffffff";
        input.setAttribute("aria-hidden", "true");
        input.style.position = "fixed";
        input.style.opacity = "0";
        input.style.pointerEvents = "none";
        input.style.left = "-9999px";

        this._colorInput = input;
        input.addEventListener("change", (ev) => {
          this._colorInput = null;
          this.close();
          this._onSetBackground?.(areaName, ev.target.value);
          input.remove();
        });
        input.addEventListener("click", (ev) => ev.stopPropagation(), { once: true });

        const onFocus = () => {
          if (!this._colorInput) return;
          this._colorInput.remove();
          this._colorInput = null;
          this.close();
        };

        window.addEventListener("focus", onFocus, { once: true });
        document.body.appendChild(input);
        input.click();
      });
      menu.appendChild(bgBtn);
    }

    if (canDelete) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "area-context-menu__item";
      btn.setAttribute("role", "menuitem");
      btn.innerHTML = `<span class="area-context-menu__label">Delete @${areaName}</span>`;
      btn.addEventListener("click", (e) => {
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
    if (this._colorInput) {
      this._colorInput.remove();
      this._colorInput = null;
    }
  }

  destroy() {
    this._abortController?.abort();
    this._abortController = null;
    this.close();
  }
}
