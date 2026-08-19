/**
 * Keyboard Action Factory
 *
 * Creates the keyboard handler configuration with all action bindings.
 * Uses getter functions for lazy access to managers that may not be
 * initialized when the keyboard handler is created.
 */
import { KeyboardHandler } from "./keyboard-handler.js";
import { ThemeManager } from "../renderer/theme-manager.js";
import { isEmbedded } from "../core/utils.js";
import { Logger } from "../core/logger.js";

/**
 * Create a configured KeyboardHandler with all action bindings.
 *
 * @param {object} opts
 * @param {Function} opts.getSlideNavigator - Getter for slide navigation manager
 * @param {Function} opts.getRoleManager - Getter for role/presentation mode manager
 * @param {Function} opts.getBreakManager - Getter for break mode manager
 * @param {Function} opts.getReloadManager - Getter for deck reload manager
 * @param {Function} opts.getCommandPalette - Getter for command palette
 * @param {Function} opts.toggleEditMode - Toggle edit mode callback
 * @param {Function} opts.toggleFullscreen - Toggle fullscreen callback
 * @param {Function} opts.isEditMode - Check if in edit mode
 * @param {object} [opts.slideStylePanel] - Slide style panel (editor layer, injected)
 * @param {object} [opts.textBlockHandler] - Text block handler (editor layer, injected)
 * @returns {KeyboardHandler}
 */
export function createKeyboardHandler({
  getSlideNavigator,
  getRoleManager,
  getBreakManager,
  getReloadManager,
  getCommandPalette,
  toggleEditMode,
  toggleFullscreen,
  isEditMode,
  slideStylePanel = null,
  textBlockHandler = null,
}) {
  const edit = () => window.__WEBDECK_EDIT_CONTROLLER__;

  return new KeyboardHandler({
    next: () => getSlideNavigator().next(),
    prev: () => getSlideNavigator().prev(),
    first: () => getSlideNavigator().goTo(getSlideNavigator().findFirstVisibleIndex()),
    last: () => getSlideNavigator().goTo(getSlideNavigator().findLastVisibleIndex()),
    goto: () => getSlideNavigator().openGoToPrompt(),
    search: () => getSlideNavigator().openSearchPrompt(),
    commandPalette: () => getCommandPalette()?.open(),
    viewer: () => getRoleManager().togglePresentWindow(),
    edit: () => toggleEditMode(),
    break: () => getBreakManager().toggle(),
    fullscreen: () => toggleFullscreen(),
    reload: () => getReloadManager().handleReloadDeck(),
    theme: () => {
      ThemeManager.toggleTheme();
    },
    slideTheme: () => {
      try {
        edit()?.themeManager?.toggle?.();
      } catch (e) {
        Logger.warn("Slide theme shortcut failed:", e);
      }
    },
    styles: () => {
      try {
        slideStylePanel?.toggle?.();
      } catch {
        /* style panel may not be available */
      }
    },
    save: () => {
      try {
        // Save whenever an edit controller exists, in edit mode or not: a
        // user who toggled out of edit mode with pending changes must still
        // get Ctrl+S to work instead of a silent no-op.
        const saveManager = edit()?.saveManager;
        if (saveManager) {
          saveManager.save?.();
          return true;
        }
        // No editor in this window. Keep suppressing the browser's Ctrl+S
        // in app windows (presenter/viewer, opened from the editor), but
        // let standalone exported decks and embedded iframes keep the
        // browser's native save-page behavior — returning false makes the
        // keyboard handler skip preventDefault.
        return !window.__WEBDECK_EXPORTED__ && !isEmbedded();
      } catch (e) {
        Logger.warn("Save shortcut failed:", e);
        return true;
      }
    },
    newSlide: () => {
      try {
        edit()?.layoutManager?.showPicker?.();
      } catch (e) {
        Logger.warn("New slide shortcut failed:", e);
      }
    },
    duplicateSlide: () => {
      try {
        edit()?.slideOps?.duplicateSlide?.();
      } catch (e) {
        Logger.warn("Duplicate slide shortcut failed:", e);
      }
    },
    deleteSlide: () => {
      try {
        edit()?.slideOps?.deleteSlide?.();
      } catch (e) {
        Logger.warn("Delete slide shortcut failed:", e);
      }
    },
    insertImage: () => {
      try {
        edit()?.imageInserter?.pickAndInsert?.();
      } catch (e) {
        Logger.warn("Insert image shortcut failed:", e);
      }
    },
    insertText: () => {
      try {
        textBlockHandler?.insertTextBlock?.();
      } catch (e) {
        Logger.warn("Insert text shortcut failed:", e);
      }
    },
    openLayout: () => {
      try {
        edit()?.layoutManager?.showPickerForCurrentSlide?.();
      } catch (e) {
        Logger.warn("Open layout shortcut failed:", e);
      }
    },
    toggleMermaid: () => {
      try {
        edit()?.mermaidHelper?.toggle?.();
      } catch (e) {
        Logger.warn("Toggle Mermaid shortcut failed:", e);
      }
    },
    adjustColumns: () => {
      try {
        edit()?.gridResizer?.toggle?.();
      } catch (e) {
        Logger.warn("Adjust columns shortcut failed:", e);
      }
    },
    moveSlideUp: () => {
      try {
        edit()?.slideOps?.moveSlideUp?.();
      } catch (e) {
        Logger.warn("Move slide up shortcut failed:", e);
      }
    },
    moveSlideDown: () => {
      try {
        edit()?.slideOps?.moveSlideDown?.();
      } catch (e) {
        Logger.warn("Move slide down shortcut failed:", e);
      }
    },
    undo: () => {
      try {
        Promise.resolve(edit()?.undo?.()).catch((e) => {
          Logger.warn("Undo shortcut failed:", e);
        });
      } catch (e) {
        Logger.warn("Undo shortcut failed:", e);
      }
    },
    redo: () => {
      try {
        Promise.resolve(edit()?.redo?.()).catch((e) => {
          Logger.warn("Redo shortcut failed:", e);
        });
      } catch (e) {
        Logger.warn("Redo shortcut failed:", e);
      }
    },
    isEditMode: () => isEditMode(),
    isBreakActive: () => getBreakManager()?.isActive ?? false,
    endBreak: () => getBreakManager()?.setActive(false),
    isEditorWindow: () => getRoleManager().isEditorWindow,
    isEmbedded: isEmbedded,
    getMarkdownEditor: () => edit()?.markdownEditor ?? null,
  });
}
