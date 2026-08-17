/**
 * SlideWarningManager
 *
 * Manages editor warnings and slide-level warning banners.
 * Extracted from EditController.
 *
 * Two warning channels coexist:
 * - **Pending warnings** (showEditorWarning): debounced advisory messages
 *   keyed by diagnostic type (e.g. "unknown-layout", "missing-images").
 *   Multiple keys accumulate — applyPendingSlideWarning renders them all
 *   joined by "; ".
 * - **Slide warnings** (showSlideWarning): immediate, urgent messages with
 *   optional click-to-fix (e.g. overflow, area mismatch). These take
 *   priority over pending warnings when both exist.
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
    /** @type {Map<string, string>} key → message */
    this._pendingWarnings = new Map();
  }

  /**
   * Backwards-compatible accessor for the pending warning text.
   * Returns the joined messages, or "" when none.
   * @returns {string}
   */
  get pendingSlideWarning() {
    return this._pendingWarnings.size > 0 ? [...this._pendingWarnings.values()].join("; ") : "";
  }

  /**
   * Backwards-compatible setter — replaces all pending warnings with a
   * single message under the "default" key. Kept for any external callers
   * that set this property directly.
   * @param {string} value
   */
  set pendingSlideWarning(value) {
    this._pendingWarnings.clear();
    if (value) {
      this._pendingWarnings.set("default", value);
    }
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
    this._pendingWarnings.set(key, message);
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
    if (this._pendingWarnings.size === 0) return;
    const slideEl = targetSlideEl || this.getSlideElementByIndex(this.currentSlideIndex);
    if (!slideEl) return;

    let banner = slideEl.querySelector(":scope > .editor-slide-warning");
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "editor-slide-warning";
      slideEl.appendChild(banner);
    }

    // Clear any click-to-fix state left over from a previous showSlideWarning.
    banner.classList.remove("editor-slide-warning--clickable");
    banner.removeAttribute("tabindex");
    banner.removeAttribute("role");
    banner.removeAttribute("aria-live");
    banner.onclick = null;
    banner.onkeydown = null;
    banner.style.cursor = "";

    banner.textContent = this.pendingSlideWarning;
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
  }

  resetPending() {
    this._pendingWarnings.clear();
  }
}
