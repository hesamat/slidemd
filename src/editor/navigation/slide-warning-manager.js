/**
 * SlideWarningManager
 *
 * Manages editor warnings and slide-level warning banners.
 * Extracted from EditController.
 */

export class SlideWarningManager {
  /**
   * @param {object} opts
   * @param {() => number} opts.getCurrentSlideIndex
   * @param {(index: number) => HTMLElement|null} opts.getSlideElementByIndex
   */
  constructor({ getCurrentSlideIndex, getSlideElementByIndex }) {
    this._getCurrentSlideIndex = getCurrentSlideIndex;
    this._getSlideElementByIndex = getSlideElementByIndex;
    this.lastDiagnostics = new Map();
    this.editorWarningsEnabled = true;
    this.pendingSlideWarning = "";
  }

  get currentSlideIndex() {
    return this._getCurrentSlideIndex();
  }

  getSlideElementByIndex(index) {
    return this._getSlideElementByIndex(index);
  }

  showEditorWarning(key, message, duration = 2500) {
    if (!this.editorWarningsEnabled) return;
    const now = Date.now();
    const last = this.lastDiagnostics.get(key) || 0;
    if (now - last < duration) return;
    this.lastDiagnostics.set(key, now);
    this.pendingSlideWarning = message;
  }

  showSlideWarning(message, onClick = null) {
    const slideEl = this.getSlideElementByIndex(this.currentSlideIndex);
    if (!slideEl) return;

    let banner = slideEl.querySelector(":scope > .editor-slide-warning");
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "editor-slide-warning";
      slideEl.appendChild(banner);
    }

    banner.textContent = message;
    banner.removeAttribute("tabindex");
    banner.removeAttribute("role");
    banner.removeAttribute("aria-live");
    banner.classList.remove("editor-slide-warning--clickable");
    banner.onclick = null;
    banner.onkeydown = null;
    banner.style.cursor = "";

    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");

    if (onClick) {
      banner.setAttribute("role", "button");
      banner.setAttribute("tabindex", "0");
      banner.setAttribute("aria-live", "off");
      banner.classList.add("editor-slide-warning--clickable");
      banner.style.cursor = "pointer";
      banner.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      };
      banner.onclick = (e) => {
        e.stopPropagation();
        onClick();
      };
    }
  }

  clearSlideWarning() {
    const slideEl = this.getSlideElementByIndex(this.currentSlideIndex);
    if (!slideEl) return;
    const banner = slideEl.querySelector(":scope > .editor-slide-warning");
    if (banner) banner.remove();
  }

  applyPendingSlideWarning(targetSlideEl = null) {
    if (!this.pendingSlideWarning) return;
    const slideEl = targetSlideEl || this.getSlideElementByIndex(this.currentSlideIndex);
    if (!slideEl) return;

    let banner = slideEl.querySelector(":scope > .editor-slide-warning");
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "editor-slide-warning";
      slideEl.appendChild(banner);
    }

    banner.textContent = this.pendingSlideWarning;
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
  }

  resetPending() {
    this.pendingSlideWarning = "";
  }
}
