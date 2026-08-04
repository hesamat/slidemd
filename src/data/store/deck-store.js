import { splitSlides } from "../markdown-parser.js";
import { DeckHistory } from "./deck-history.js";
import { isInsert, isDelete, isNoOp } from "./slide-patch.js";

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

  canUndo() {
    return this._history.canUndo();
  }

  canRedo() {
    return this._history.canRedo();
  }

  loadFromMarkdown(markdown, activeIndex = 0) {
    this._slides = splitSlides(markdown);
    this._activeIndex = this._clampIndex(activeIndex);
    this._history.clear();
    this._emit("change");
    this._emit("slide");
  }

  /**
   * Synchronize the current markdown without creating an undo entry.
   * Used before structural operations so their snapshots include unsaved text.
   */
  syncSlides(slides, activeIndex = this._activeIndex) {
    this._slides = [...slides];
    this._activeIndex = this._clampIndex(activeIndex);
    this._emit("change");
    this._emit("slide");
  }

  applyPatch(patch) {
    return this.applyPatches([patch]);
  }

  applyPatches(patches) {
    const validPatches = patches.filter((patch) => !isNoOp(patch));
    if (!validPatches.length) return false;

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
        return false;
      }
      this._applyPatchState(patch);
    }
    if (activeIndexAfterMove !== null) {
      this._activeIndex = this._clampIndex(activeIndexAfterMove);
    }

    this._history.push(slidesBefore, activeIndexBefore, validPatches[0]);
    validPatches.forEach((patch) => this._emit("patch", patch));
    this._emit("change");
    if (validPatches.some((patch) => isInsert(patch) || isDelete(patch))) {
      this._emit("slide");
    }
    return true;
  }

  undo() {
    const entry = this._history.popUndo(this._slides, this._activeIndex);
    if (!entry) return false;
    this._slides = entry.slides;
    this._activeIndex = entry.activeIndex;
    this._emit("change");
    this._emit("slide");
    return true;
  }

  redo() {
    const entry = this._history.popRedo(this._slides, this._activeIndex);
    if (!entry) return false;
    this._slides = entry.slides;
    this._activeIndex = entry.activeIndex;
    this._emit("change");
    this._emit("slide");
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

  _remapActiveIndexForMove(activeIndex, removeIndex, insertIndex) {
    if (activeIndex === removeIndex) return insertIndex;
    const afterRemoval = activeIndex > removeIndex ? activeIndex - 1 : activeIndex;
    return afterRemoval >= insertIndex ? afterRemoval + 1 : afterRemoval;
  }

  _applyPatchState(patch) {
    if (isInsert(patch)) {
      this._slides.splice(patch.index, 0, patch.after);
      if (patch.index <= this._activeIndex) this._activeIndex++;
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
}
