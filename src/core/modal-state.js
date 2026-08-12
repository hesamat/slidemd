/**
 * Modal State
 *
 * Tracks how many modals are currently open and sets a `data-modal-open`
 * attribute on `<body>` so the keyboard handler can suppress all shortcuts
 * while any modal is visible.
 *
 * Uses a counter so nested modals (e.g. a conflict modal over a generate
 * modal) work correctly — the attribute is only removed when the last modal
 * closes.
 */

let openCount = 0;

/**
 * Call when a modal backdrop is appended to the DOM.
 * Increments the open counter and sets `data-modal-open` on `<body>`.
 */
export function modalOpened() {
  openCount++;
  if (typeof document !== "undefined" && document.body) {
    document.body.setAttribute("data-modal-open", "");
  }
}

/**
 * Call when a modal backdrop is removed from the DOM.
 * Decrements the open counter and removes `data-modal-open` from `<body>`
 * when the count reaches zero.
 */
export function modalClosed() {
  if (openCount > 0) openCount--;
  if (openCount === 0 && typeof document !== "undefined" && document.body) {
    document.body.removeAttribute("data-modal-open");
  }
}

/**
 * Check whether any modal is currently open.
 * @returns {boolean}
 */
export function isModalOpen() {
  return openCount > 0;
}

/**
 * Reset the counter. Used as a safety valve when loading a new deck, so any
 * leaked modal-open state from a broken dismiss path does not permanently
 * suppress keyboard shortcuts.
 */
export function resetModalState() {
  openCount = 0;
  if (typeof document !== "undefined" && document.body) {
    document.body.removeAttribute("data-modal-open");
  }
}

/**
 * Reset the counter (for testing).
 * @deprecated Use {@link resetModalState}.
 */
export function _resetModalState() {
  resetModalState();
}
