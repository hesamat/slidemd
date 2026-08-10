/**
 * HistoryController
 *
 * Handles undo/redo for the editor. Delegates to the CodeMirror editor's
 * local undo stack when there are unsaved overlays and no pending
 * structural operations, otherwise falls through to store-level undo/redo
 * with a chained view restore.
 *
 * Extracted from EditController (history concern).
 */

import { Logger } from "../../core/logger.js";
import { Notification } from "../../renderer/notification.js";

export class HistoryController {
  /**
   * @param {object} opts
   * @param {() => object|null} opts.getMarkdownEditor
   * @param {() => object|null} opts.getDeckStore
   * @param {() => Map<number, string>} opts.getUnsavedMarkdown
   * @param {() => number} opts.getPendingStructuralOperations
   * @param {() => Promise<boolean>} opts.chainStoreChangeRestore
   * @param {(fn: () => unknown) => unknown} opts.withSuppressedStoreChange
   */
  constructor({
    getMarkdownEditor,
    getDeckStore,
    getUnsavedMarkdown,
    getPendingStructuralOperations,
    chainStoreChangeRestore,
    withSuppressedStoreChange,
  }) {
    this._getMarkdownEditor = getMarkdownEditor;
    this._getDeckStore = getDeckStore;
    this._getUnsavedMarkdown = getUnsavedMarkdown;
    this._getPendingStructuralOperations = getPendingStructuralOperations;
    this._chainStoreChangeRestore = chainStoreChangeRestore;
    this._withSuppressedStoreChange = withSuppressedStoreChange;

    this._historyOperation = null;
  }

  /**
   * Undo the last operation. Delegates to the editor's local undo stack
   * when there are unsaved overlays and no pending structural operations;
   * otherwise performs a store-level undo with a chained view restore.
   * @returns {Promise<boolean>}
   */
  async undo() {
    if (this._historyOperation) return false;
    if (this._getUnsavedMarkdown().size > 0 && this._getPendingStructuralOperations() === 0) {
      const markdownEditor = this._getMarkdownEditor();
      if (!markdownEditor) return false;
      // Only delegate to the editor's undo if it actually has history.
      // Otherwise fall through to store-level undo so the user can undo
      // structural operations even with unsaved overlays on other slides.
      // This is intentional UX: the keyboard handler already decided the
      // *current* slide's editor stack is exhausted, so the next Ctrl+Z
      // operates on the broader deck history. Unsaved overlays on other
      // slides are preserved by _onDeckChange's _reconcileUnsavedOverlays.
      if (markdownEditor.canUndo?.()) {
        markdownEditor.undo?.();
        return true;
      }
    }
    const deckStore = this._getDeckStore();
    if (!deckStore || !deckStore.canUndo()) {
      const markdownEditor = this._getMarkdownEditor();
      if (!markdownEditor) return false;
      markdownEditor.undo?.();
      return true;
    }
    this._historyOperation = "undo";
    try {
      const undoResult = this._withSuppressedStoreChange(() => deckStore.undo());
      if (!undoResult) return false;

      return await this._chainStoreChangeRestore();
    } catch (error) {
      // Roll the store back and then the view.
      this._withSuppressedStoreChange(() => deckStore.redo());
      try {
        await this._chainStoreChangeRestore();
      } catch (rollbackError) {
        Logger.error("Failed to restore view after undo rollback:", rollbackError);
      }
      Notification.error(`Undo failed: ${error.message || error}`);
      return false;
    } finally {
      this._historyOperation = null;
    }
  }

  /**
   * Redo the next operation. Delegates to the editor's local redo stack
   * when there are unsaved overlays and no pending structural operations;
   * otherwise performs a store-level redo with a chained view restore.
   * @returns {Promise<boolean>}
   */
  async redo() {
    if (this._historyOperation) return false;
    if (this._getUnsavedMarkdown().size > 0 && this._getPendingStructuralOperations() === 0) {
      const markdownEditor = this._getMarkdownEditor();
      if (!markdownEditor) return false;
      if (markdownEditor.canRedo?.()) {
        markdownEditor.redo?.();
        return true;
      }
    }
    const deckStore = this._getDeckStore();
    if (!deckStore || !deckStore.canRedo()) {
      const markdownEditor = this._getMarkdownEditor();
      if (!markdownEditor) return false;
      markdownEditor.redo?.();
      return true;
    }
    this._historyOperation = "redo";
    try {
      const redoResult = this._withSuppressedStoreChange(() => deckStore.redo());
      if (!redoResult) return false;

      return await this._chainStoreChangeRestore();
    } catch (error) {
      // Roll the store back and then the view.
      this._withSuppressedStoreChange(() => deckStore.undo());
      try {
        await this._chainStoreChangeRestore();
      } catch (rollbackError) {
        Logger.error("Failed to restore view after redo rollback:", rollbackError);
      }
      Notification.error(`Redo failed: ${error.message || error}`);
      return false;
    } finally {
      this._historyOperation = null;
    }
  }
}
