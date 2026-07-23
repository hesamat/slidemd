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
   */
  constructor({ onDeleteArea, onSwapArea, onMakeFullHeight }) {
    this._onDeleteArea = onDeleteArea;
    this._onSwapArea = onSwapArea;
    this._onMakeFullHeight = onMakeFullHeight;
    this._menuEl = null;
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
   */
  open(clientX, clientY, areaName, opts = {}) {
    this.close();
    const canDelete = opts.canDelete !== false;
    const canSwap = opts.canSwap === true;
    const canMakeFullHeight = opts.canMakeFullHeight === true;
    if (!canDelete && !canSwap && !canMakeFullHeight) return;

    const menu = document.createElement("div");
    menu.className = "area-context-menu";
    menu.setAttribute("role", "menu");
    menu.style.left = `${clientX}px`;
    menu.style.top = `${clientY}px`;

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
  }

  destroy() {
    this._abortController?.abort();
    this._abortController = null;
    this.close();
  }
}
