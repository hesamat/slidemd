/**
 * AiDropdownManager
 *
 * Manages the editor-header "AI" dropdown (Clean up slide,
 * Add speaker notes, Refine all slides).
 * Follows the same pattern as InsertDropdownManager: action-to-callback
 * mapping via an `actions` object, event delegation, AbortController teardown.
 */

import { dropdownRegistry } from "./dropdown-registry.js";

export class AiDropdownManager {
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
    dropdownRegistry.add(this);

    const { signal } = this._abortController;

    this._btn.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        const wasOpen = !this._content.classList.contains("webdeck-hidden");
        // Close every other registered dropdown so two panels can't overlap.
        for (const mgr of dropdownRegistry) {
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

    // Event delegation: one listener for all actions
    this._content.addEventListener(
      "click",
      (e) => {
        const item = e.target.closest("[data-ai-action]");
        if (!item) return;
        const action = item.getAttribute("data-ai-action");
        this.close();
        this._actions[action]?.();
      },
      { signal },
    );

    document.addEventListener("click", () => this.close(), { signal });
  }

  close() {
    if (this._content) {
      this._content.classList.add("webdeck-hidden");
    }
    this._btn?.setAttribute("aria-expanded", "false");
  }

  destroy() {
    this.close();
    dropdownRegistry.delete(this);
    this._abortController.abort();
  }
}
