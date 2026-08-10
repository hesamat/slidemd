/**
 * EditorBufferController
 *
 * Manages the CodeMirror editor buffer: loading slide markdown into the
 * editor, capturing editor state into unsaved overlays, handling editor
 * input events, and tracking the per-slide EditorState cache lifecycle.
 *
 * Extracted from EditController (editor buffer concern).
 */

export class EditorBufferController {
  /**
   * @param {object} opts
   * @param {() => object|null} opts.getMarkdownEditor
   * @param {() => object|null} opts.getDeckStore
   * @param {() => object} opts.getDeck
   * @param {() => Map<number, string>} opts.getUnsavedMarkdown
   * @param {() => number} opts.getCurrentSlideIndex
   * @param {() => boolean} opts.getIsEditMode
   * @param {() => object} opts.getSaveManager
   * @param {() => object} opts.getPreviewUpdater
   * @param {() => object} opts.getAreaGuides
   * @param {() => number} opts.getLastEditorSlideIndex
   * @param {(v: number) => void} opts.setLastEditorSlideIndex
   * @param {() => object|null} opts.getLastEditorDeck
   * @param {(v: object) => void} opts.setLastEditorDeck
   * @param {(v: boolean) => void} opts.setHasUnsavedChanges
   */
  constructor({
    getMarkdownEditor,
    getDeckStore,
    getDeck,
    getUnsavedMarkdown,
    getCurrentSlideIndex,
    getIsEditMode,
    getSaveManager,
    getPreviewUpdater,
    getAreaGuides,
    getLastEditorSlideIndex,
    setLastEditorSlideIndex,
    getLastEditorDeck,
    setLastEditorDeck,
    setHasUnsavedChanges,
  }) {
    this._getMarkdownEditor = getMarkdownEditor;
    this._getDeckStore = getDeckStore;
    this._getDeck = getDeck;
    this._getUnsavedMarkdown = getUnsavedMarkdown;
    this._getCurrentSlideIndex = getCurrentSlideIndex;
    this._getIsEditMode = getIsEditMode;
    this._getSaveManager = getSaveManager;
    this._getPreviewUpdater = getPreviewUpdater;
    this._getAreaGuides = getAreaGuides;
    this._getLastEditorSlideIndex = getLastEditorSlideIndex;
    this._setLastEditorSlideIndex = setLastEditorSlideIndex;
    this._getLastEditorDeck = getLastEditorDeck;
    this._setLastEditorDeck = setLastEditorDeck;
    this._setHasUnsavedChanges = setHasUnsavedChanges;
  }

  /**
   * Capture the editor's current value into unsavedMarkdown for a specific
   * slide index. Used for both live typing and flushing the debounced change
   * before a slide switch.
   * @param {number} index
   */
  captureEditorMarkdown(index) {
    const markdownEditor = this._getMarkdownEditor();
    if (!markdownEditor) return;
    const markdown = markdownEditor.getValue();
    const original = this._getDeckStore().getSlides()[index] ?? "";
    const unsavedMarkdown = this._getUnsavedMarkdown();
    if (markdown === original) {
      unsavedMarkdown.delete(index);
      this.updateUnsavedChangesFlag();
      return;
    }
    if (markdown === unsavedMarkdown.get(index)) return;
    unsavedMarkdown.set(index, markdown);
    this.updateUnsavedChangesFlag();
  }

  /**
   * Capture the editor's current value for the current slide index.
   */
  captureCurrentEditorMarkdown() {
    this.captureEditorMarkdown(this._getCurrentSlideIndex());
  }

  /**
   * Public guard for code that needs the current editor buffer captured before
   * reading the deck markdown. Only captures when the editor is actually active
   * so a stale buffer from a previously viewed slide is not attributed to the
   * current slide.
   */
  captureCurrentEditorState() {
    if (this._getIsEditMode()) this.captureCurrentEditorMarkdown();
  }

  /**
   * Load the current slide's markdown into the editor.
   *
   * Saves the outgoing slide's EditorState (with undo history) before
   * switching, flushes pending debounced input to the outgoing slide,
   * then loads the new slide via loadSlideState (different slide/deck)
   * or setValue (same slide/deck, preserves CodeMirror history).
   */
  loadSlideIntoEditor() {
    const markdownEditor = this._getMarkdownEditor();
    if (!this._getIsEditMode() || !markdownEditor) return;

    const currentSlideIndex = this._getCurrentSlideIndex();
    const lastEditorSlideIndex = this._getLastEditorSlideIndex();
    const deck = this._getDeck();

    // Save the outgoing slide's EditorState (with undo history) before
    // switching. If the cache has just been cleared (e.g. by a structural
    // op), also call it when the slide index has not changed, so the
    // one-shot skip flag is consumed and the *next* navigation away from
    // this slide actually saves its state instead of dropping it.
    // saveSlideState's index < 0 guard handles the initial -1 case.
    if (lastEditorSlideIndex !== currentSlideIndex || markdownEditor.hasClearedCache()) {
      markdownEditor.saveSlideState(lastEditorSlideIndex);
    }

    // If we are leaving a real slide, flush any pending debounced input to
    // lastEditorSlideIndex before the upcoming state swap. Otherwise the
    // keystrokes are dropped when loadSlideState / setValue cancels the
    // debounce timer.
    // Only flush when the underlying deck is unchanged; if the deck was
    // rebuilt (undo, redo, whole-deck AI), the buffer belongs to the old
    // deck and must not be written into the new slide at the same index.
    if (
      lastEditorSlideIndex !== currentSlideIndex &&
      lastEditorSlideIndex >= 0 &&
      deck === this._getLastEditorDeck()
    ) {
      this.captureEditorMarkdown(lastEditorSlideIndex);
    }
    markdownEditor.cancelOnChange?.();

    const base = this._getDeckStore().getSlides()[currentSlideIndex] ?? "";
    const markdown = this._getUnsavedMarkdown().get(currentSlideIndex) ?? base;

    const current = markdownEditor.getValue();
    if (markdown === current && currentSlideIndex === lastEditorSlideIndex) {
      this._setLastEditorDeck(deck);
      this._getSaveManager().updateButton();
      this._getAreaGuides().refresh();
      return;
    }

    if (currentSlideIndex !== lastEditorSlideIndex || deck !== this._getLastEditorDeck()) {
      // Different slide or deck — use the per-slide state cache. After a
      // store restore (undo/redo/AI) the deck is a fresh object, so this
      // branch is taken and loadSlideState handles doc drift by discarding
      // the cached state and creating a fresh one (no stale undo history).
      markdownEditor.loadSlideState(currentSlideIndex, markdown);
    } else {
      // Same slide and same deck reference — update the document in-place
      // without replacing the editor state, so CodeMirror history is kept.
      markdownEditor.setValue(markdown, { suppressOnChange: true });
    }
    this._setLastEditorSlideIndex(currentSlideIndex);
    this._setLastEditorDeck(deck);
    // Don't reset hasUnsavedChanges - if there are unsaved changes, keep the flag
    this._getSaveManager().updateButton();
    this._getAreaGuides().refresh();
  }

  /**
   * Handle editor input events.
   * @param {string} value
   */
  onEditorInput(value) {
    this._getUnsavedMarkdown().set(this._getCurrentSlideIndex(), value);
    this.updateUnsavedChangesFlag();
    this._getPreviewUpdater().update();
  }

  /**
   * Update the hasUnsavedChanges flag based on whether any slide has unsaved changes.
   */
  updateUnsavedChangesFlag() {
    const hasUnsaved = this._getUnsavedMarkdown().size > 0;
    this._setHasUnsavedChanges(hasUnsaved);
    this._getSaveManager().updateButton();
  }
}
