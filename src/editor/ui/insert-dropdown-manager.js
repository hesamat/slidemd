/**
 * InsertDropdownManager
 *
 * Manages the editor-header "Format" dropdown (Layout, Columns,
 * Appearance, Insert).  The action-to-callback mapping is defined
 * by the caller via an `actions` object, so this class has no
 * knowledge of EditController's sub-modules.
 *
 * Uses AbortController for clean teardown of all event listeners,
 * event delegation for dynamic items, and .closest() for nested HTML.
 *
 * Extracted from EditController.
 */

export class InsertDropdownManager {
  /** Dropdown managers register here so any trigger click can close the others. */
  static _registry = new Set();

  /**
   * @param {object} opts
   * @param {HTMLElement} opts.btn       — dropdown trigger button
   * @param {HTMLElement} opts.content   — dropdown content panel
   * @param {Record<string,() => void>} opts.actions — action-name → callback map
   */
  constructor({ btn, content, actions }) {
    this._btn = btn;
    this._content = content;
    this._actions = actions;
    this._contentOriginParent = null;
    this._abortController = new AbortController();
  }

  init() {
    if (!this._btn || !this._content) return;
    InsertDropdownManager._registry.add(this);

    const { signal } = this._abortController;

    this._btn.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        const wasOpen = !this._content.classList.contains("webdeck-hidden");
        // Close every other registered dropdown so two panels can't overlap.
        for (const mgr of InsertDropdownManager._registry) {
          if (mgr !== this) mgr.close();
        }
        this.close();
        if (!wasOpen) {
          this._content.classList.remove("webdeck-hidden");
          this._btn.setAttribute("aria-expanded", "true");
        }
      },
      { signal },
    );

    // Event delegation: one listener for all actions, handles nested
    // HTML elements (e.g. <svg> icons inside buttons) safely via .closest()
    this._content.addEventListener(
      "click",
      (e) => {
        const item = e.target.closest("[data-insert-action]");
        if (!item) return;
        const action = item.getAttribute("data-insert-action");
        this.close();
        this._actions[action]?.();
      },
      { signal },
    );

    document.addEventListener("click", () => this.close(), { signal });
  }

  /**
   * Show the dropdown as a context menu at the given screen coordinates.
   * Used for right-click on the slide preview.
   * @param {number} clientX
   * @param {number} clientY
   */
  openContextMenu(clientX, clientY) {
    if (!this._content) return;
    this.close();
    const content = this._content;

    // Re-parent to <body> for a top-level stacking context and bump the
    // z-index above slide overlays and panels.
    if (content.parentNode !== document.body) {
      this._contentOriginParent = content.parentNode;
      document.body.appendChild(content);
    }

    content.style.position = "fixed";
    content.style.left = `${clientX}px`;
    content.style.top = `${clientY}px`;
    content.style.right = "auto";
    content.style.bottom = "auto";
    content.style.zIndex = "2000";
    content.classList.remove("webdeck-hidden");

    // Keep the menu within the viewport.
    const rect = content.getBoundingClientRect();
    const overflowX = rect.right - window.innerWidth;
    const overflowY = rect.bottom - window.innerHeight;
    if (overflowX > 0) content.style.left = `${Math.max(4, clientX - overflowX - 4)}px`;
    if (overflowY > 0) content.style.top = `${Math.max(4, clientY - overflowY - 4)}px`;
  }

  close() {
    if (this._content) {
      this._content.classList.add("webdeck-hidden");
      this._content.style.position = "";
      this._content.style.left = "";
      this._content.style.top = "";
      this._content.style.right = "";
      this._content.style.bottom = "";
      this._content.style.zIndex = "";
      if (this._contentOriginParent) {
        this._contentOriginParent.appendChild(this._content);
        this._contentOriginParent = null;
      }
    }
    this._btn?.setAttribute("aria-expanded", "false");
  }

  destroy() {
    this.close();
    InsertDropdownManager._registry.delete(this);
    this._abortController.abort();
  }
}
