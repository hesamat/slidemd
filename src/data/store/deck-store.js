import { splitSlides } from "../markdown-parser.js";
import { DeckHistory } from "./deck-history.js";
import { isInsert, isDelete, isNoOp } from "./slide-patch.js";
import { extractVisualSystemFromMarkdown } from "../ai/visual-system-schema.js";

/**
 * Canonical source of truth for slide markdown and active index.
 * Mutations go through patches or explicit deck loading.
 */
export class DeckStore {
  constructor({ maxHistory = 100 } = {}) {
    this._slides = [];
    this._activeIndex = 0;
    this._history = new DeckHistory({ maxEntries: maxHistory });
    this._listeners = new Map();

    this._structuralRevision = 0;
    this._structuralListeners = new Set();
    this._storeChangeListeners = new Set();
  }

  getSlides() {
    return [...this._slides];
  }

  getActiveSlide() {
    return this._slides[this._activeIndex] ?? "";
  }

  getActiveIndex() {
    return this._activeIndex;
  }

  getSlideCount() {
    return this._slides.length;
  }

  getStructuralRevision() {
    return this._structuralRevision;
  }

  canUndo() {
    return this._history.canUndo();
  }

  canRedo() {
    return this._history.canRedo();
  }

  loadFromMarkdown(markdown, activeIndex = 0) {
    const { markdown: withoutComment } = extractVisualSystemFromMarkdown(markdown);
    this._slides = splitSlides(withoutComment);
    this._activeIndex = this._clampIndex(activeIndex);
    this._history.clear();
    // Never reset the structural revision; always bump on a new deck load so a
    // stale token from the previous deck cannot accidentally match.
    this._bumpStructuralRevision();
    this._emit("change");
    this._emit("slide");
    // A full deck load is followed by a deck-change event from the caller;
    // do not emit a store-change here to avoid an unnecessary full refresh.
  }

  /**
   * Replace the entire deck with new slides, recording an undoable history
   * entry. Used by whole-deck AI refine so the result is undoable (Ctrl+Z)
   * unlike loadFromMarkdown which clears history.
   * @param {string[]} slides
   * @param {number} [activeIndex=0]
   * @param {import("./slide-patch.js").SlidePatch} [patch] - metadata for the history entry
   */
  replaceDeck(slides, activeIndex = 0, patch) {
    const slidesBefore = [...this._slides];
    const activeIndexBefore = this._activeIndex;
    this._slides = [...slides];
    this._activeIndex = this._clampIndex(activeIndex);
    this._history.push(
      slidesBefore,
      activeIndexBefore,
      patch || { index: 0, before: null, after: null, source: "ai", timestamp: Date.now() },
    );
    this._bumpStructuralRevision();
    this._emit("change");
    this._emit("slide");
    this._emitStoreChange();
  }

  /**
   * Synchronize the current markdown without creating an undo entry.
   * Used before structural operations so their snapshots include unsaved text.
   */
  syncSlides(slides, activeIndex = this._activeIndex, { emitStoreChange = true } = {}) {
    this._slides = [...slides];
    this._activeIndex = this._clampIndex(activeIndex);
    if (emitStoreChange) {
      this._emit("change");
      this._emit("slide");
      this._emitStoreChange();
    }
  }

  /**
   * Apply a single patch to the store.
   * @param {import("./slide-patch.js").SlidePatch} patch
   * @param {number} [expectedStructuralRevision] - if provided, fail closed on any mismatch
   * @returns {boolean | { success: boolean, reason?: string }}
   */
  applyPatch(patch, expectedStructuralRevision) {
    return this.applyPatches([patch], expectedStructuralRevision);
  }

  /**
   * Apply multiple patches as one history entry.
   * @param {import("./slide-patch.js").SlidePatch[]} patches
   * @param {number | { expectedStructuralRevision?: number, emitStoreChange?: boolean }} [maybeOptions] - if a number, treat as the expected structural revision; if an object, pass options
   * @returns {boolean | { success: boolean, reason?: string }}
   */
  applyPatches(patches, maybeOptions = {}) {
    let expectedStructuralRevision;
    let emitStoreChange = true;
    if (typeof maybeOptions === "number") {
      expectedStructuralRevision = maybeOptions;
    } else if (maybeOptions && typeof maybeOptions === "object") {
      ({ expectedStructuralRevision, emitStoreChange = true } = maybeOptions);
    }

    const validPatches = patches.filter((patch) => !isNoOp(patch));
    if (!validPatches.length) {
      return expectedStructuralRevision !== undefined
        ? { success: false, reason: "No valid patches to apply" }
        : false;
    }

    if (
      expectedStructuralRevision !== undefined &&
      this._structuralRevision !== expectedStructuralRevision
    ) {
      return {
        success: false,
        reason: `Structural revision mismatch: expected ${expectedStructuralRevision}, found ${this._structuralRevision}`,
      };
    }

    const isStructural = validPatches.some((patch) => isInsert(patch) || isDelete(patch));
    const slidesBefore = [...this._slides];
    const activeIndexBefore = this._activeIndex;
    const move =
      validPatches.length === 2 &&
      isDelete(validPatches[0]) &&
      isInsert(validPatches[1]) &&
      validPatches[0].kind === "move" &&
      validPatches[1].kind === "move" &&
      validPatches[0].before === validPatches[1].after
        ? validPatches
        : null;
    const activeIndexAfterMove = move
      ? this._remapActiveIndexForMove(
          activeIndexBefore,
          validPatches[0].index,
          validPatches[1].index,
        )
      : null;

    for (const patch of validPatches) {
      if (!this._isValidPatchIndex(patch)) {
        this._slides = slidesBefore;
        this._activeIndex = activeIndexBefore;
        return expectedStructuralRevision !== undefined
          ? { success: false, reason: "Patch target index out of range or before mismatch" }
          : false;
      }
      this._applyPatchState(patch);
    }
    if (activeIndexAfterMove !== null) {
      this._activeIndex = this._clampIndex(activeIndexAfterMove);
    }

    this._history.push(slidesBefore, activeIndexBefore, validPatches[0]);
    if (isStructural) {
      this._bumpStructuralRevision();
    }
    validPatches.forEach((patch) => this._emit("patch", patch));
    this._emit("change");
    if (validPatches.some((patch) => isInsert(patch) || isDelete(patch))) {
      this._emit("slide");
    }
    if (emitStoreChange) {
      this._emitStoreChange();
    }
    return expectedStructuralRevision !== undefined ? { success: true } : true;
  }

  undo() {
    const entry = this._history.popUndo(this._slides, this._activeIndex);
    if (!entry) return false;
    this._slides = entry.slides;
    this._activeIndex = entry.activeIndex;
    if (isInsert(entry.patch) || isDelete(entry.patch)) {
      this._bumpStructuralRevision();
    }
    this._emit("change");
    this._emit("slide");
    this._emitStoreChange();
    return true;
  }

  redo() {
    const entry = this._history.popRedo(this._slides, this._activeIndex);
    if (!entry) return false;
    this._slides = entry.slides;
    this._activeIndex = entry.activeIndex;
    if (isInsert(entry.patch) || isDelete(entry.patch)) {
      this._bumpStructuralRevision();
    }
    this._emit("change");
    this._emit("slide");
    this._emitStoreChange();
    return true;
  }

  setActiveIndex(index) {
    const nextIndex = this._clampIndex(index);
    if (nextIndex === this._activeIndex) return;
    this._activeIndex = nextIndex;
    this._emit("slide");
  }

  toMarkdown() {
    return this._slides.join("\n\n---\n\n");
  }

  on(event, callback) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(callback);
    return () => this._listeners.get(event)?.delete(callback);
  }

  onStructuralChange(callback) {
    this._structuralListeners.add(callback);
    return () => this._structuralListeners.delete(callback);
  }

  offStructuralChange(callback) {
    this._structuralListeners.delete(callback);
  }

  onStoreChange(callback) {
    this._storeChangeListeners.add(callback);
    return () => this._storeChangeListeners.delete(callback);
  }

  offStoreChange(callback) {
    this._storeChangeListeners.delete(callback);
  }

  _remapActiveIndexForMove(activeIndex, removeIndex, insertIndex) {
    if (activeIndex === removeIndex) return insertIndex;
    const afterRemoval = activeIndex > removeIndex ? activeIndex - 1 : activeIndex;
    return afterRemoval >= insertIndex ? afterRemoval + 1 : afterRemoval;
  }

  _applyPatchState(patch) {
    if (isInsert(patch)) {
      this._slides.splice(patch.index, 0, patch.after);
      if (patch.index <= this._activeIndex) this._activeIndex++;
      if (patch.kind !== "move" && patch.index > this._activeIndex) {
        this._activeIndex = this._clampIndex(patch.index);
      }
    } else if (isDelete(patch)) {
      this._slides.splice(patch.index, 1);
      if (patch.index < this._activeIndex) this._activeIndex--;
      this._activeIndex = this._clampIndex(this._activeIndex);
    } else {
      this._slides[patch.index] = patch.after;
    }
  }

  _isValidPatchIndex(patch) {
    if (!Number.isInteger(patch?.index) || patch.index < 0) return false;
    if (isInsert(patch)) return patch.index <= this._slides.length;
    return patch.index < this._slides.length && this._slides[patch.index] === patch.before;
  }

  _clampIndex(index) {
    if (this._slides.length === 0) return 0;
    return Math.max(0, Math.min(Number.isInteger(index) ? index : 0, this._slides.length - 1));
  }

  _emit(event, data) {
    this._listeners.get(event)?.forEach((callback) => callback(data));
  }

  _bumpStructuralRevision() {
    this._structuralRevision++;
    this._structuralListeners.forEach((callback) => callback(this._structuralRevision));
  }

  _emitStoreChange() {
    const slides = this.getSlides();
    this._storeChangeListeners.forEach((callback) => callback(slides));
  }
}
