/**
 * Snapshot stack for undo/redo.
 * Stores full deck snapshots at each patch point and bounds memory usage.
 *
 * @typedef {Object} HistoryEntry
 * @property {string[]} slides - Snapshot before the patch was applied
 * @property {number} activeIndex - Active index before the patch was applied
 * @property {import('./slide-patch.js').SlidePatch} patch - Applied patch metadata
 */
export class DeckHistory {
  constructor({ maxEntries = 100 } = {}) {
    this._undoStack = [];
    this._redoStack = [];
    this._maxEntries = Math.max(0, maxEntries);
  }

  push(slides, activeIndex, patch) {
    this._redoStack = [];
    if (this._maxEntries === 0) return;
    this._undoStack.push({ slides: [...slides], activeIndex, patch });
    if (this._undoStack.length > this._maxEntries) this._undoStack.shift();
    this._redoStack = [];
  }

  popUndo(currentSlides, currentActiveIndex) {
    const entry = this._undoStack.pop();
    if (!entry) return null;
    this._redoStack.push({
      slides: [...currentSlides],
      activeIndex: currentActiveIndex,
      patch: entry.patch,
    });
    return entry;
  }

  popRedo(currentSlides, currentActiveIndex) {
    const entry = this._redoStack.pop();
    if (!entry) return null;
    this._undoStack.push({
      slides: [...currentSlides],
      activeIndex: currentActiveIndex,
      patch: entry.patch,
    });
    if (this._undoStack.length > this._maxEntries) this._undoStack.shift();
    return entry;
  }

  canUndo() {
    return this._undoStack.length > 0;
  }

  canRedo() {
    return this._redoStack.length > 0;
  }

  clear() {
    this._undoStack = [];
    this._redoStack = [];
  }
}
