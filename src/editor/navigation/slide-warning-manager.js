/**
 * SlideWarningManager
 *
 * Manages editor warnings and slide-level warning banners.
 * Extracted from EditController.
 */

export class SlideWarningManager {
  /** @param {import('./edit-controller.js').EditController} ctrl */
  constructor(ctrl) {
    this.ctrl = ctrl;
    this.lastDiagnostics = new Map();
    this.editorWarningsEnabled = true;
    this.pendingSlideWarning = "";
  }

  get currentSlideIndex() {
    return this.ctrl.currentSlideIndex;
  }

  getSlideElementByIndex(index) {
    return this.ctrl.getSlideElementByIndex(index);
  }

  /**
   * Show a throttled editor warning.
   */
  showEditorWarning(key, message, duration = 2500) {
    if (!this.editorWarningsEnabled) return;
    const now = Date.now();
    const last = this.lastDiagnostics.get(key) || 0;
    if (now - last < duration) return;
    this.lastDiagnostics.set(key, now);
    this.pendingSlideWarning = message;
  }

  /**
   * Show a warning banner on a slide element.
   */
  showSlideWarning(message) {
    const slideEl = this.getSlideElementByIndex(this.currentSlideIndex);
    if (!slideEl) return;

    let banner = slideEl.querySelector(":scope > .editor-slide-warning");
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "editor-slide-warning";
      slideEl.appendChild(banner);
    }

    banner.textContent = message;
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
  }

  /**
   * Remove the warning banner from the current slide.
   */
  clearSlideWarning() {
    const slideEl = this.getSlideElementByIndex(this.currentSlideIndex);
    if (!slideEl) return;
    const banner = slideEl.querySelector(":scope > .editor-slide-warning");
    if (banner) banner.remove();
  }

  /**
   * Apply a pending warning to a slide element (e.g. after re-render).
   */
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

  /**
   * Reset pending warning state.
   */
  resetPending() {
    this.pendingSlideWarning = "";
  }
}
