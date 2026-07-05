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
    this._abortController = new AbortController();
  }

  init() {
    if (!this._btn || !this._content) return;

    const { signal } = this._abortController;

    this._btn.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        const wasOpen = !this._content.classList.contains("webdeck-hidden");
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

  close() {
    this._content?.classList.add("webdeck-hidden");
    this._btn?.setAttribute("aria-expanded", "false");
  }

  destroy() {
    this._abortController.abort();
  }
}
