/**
 * Keyboard Action Factory
 *
 * Creates the keyboard handler configuration with all action bindings.
 * Uses getter functions for lazy access to managers that may not be
 * initialized when the keyboard handler is created.
 */
import { KeyboardHandler } from "./keyboard-handler.js";
import { ThemeManager } from "../renderer/theme-manager.js";
import { SlideStylePanel } from "../editor/ui/slide-style-panel.js";
import { isEmbedded } from "../core/utils.js";

/**
 * Create a configured KeyboardHandler with all action bindings.
 *
 * @param {object} opts
 * @param {Function} opts.getSlideNavigator - Getter for slide navigation manager
 * @param {Function} opts.getRoleManager - Getter for role/presentation mode manager
 * @param {Function} opts.getBreakManager - Getter for break mode manager
 * @param {Function} opts.getReloadManager - Getter for deck reload manager
 * @param {Function} opts.toggleEditMode - Toggle edit mode callback
 * @param {Function} opts.toggleFullscreen - Toggle fullscreen callback
 * @param {Function} opts.isEditMode - Check if in edit mode
 * @returns {KeyboardHandler}
 */
export function createKeyboardHandler({
  getSlideNavigator,
  getRoleManager,
  getBreakManager,
  getReloadManager,
  toggleEditMode,
  toggleFullscreen,
  isEditMode,
}) {
  const edit = () => window.__WEBDECK_EDIT_CONTROLLER__;

  return new KeyboardHandler({
    next: () => getSlideNavigator().next(),
    prev: () => getSlideNavigator().prev(),
    first: () => getSlideNavigator().goTo(getSlideNavigator().findFirstVisibleIndex()),
    last: () => getSlideNavigator().goTo(getSlideNavigator().findLastVisibleIndex()),
    goto: () => getSlideNavigator().openGoToPrompt(),
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
        console.warn("Slide theme shortcut failed:", e);
      }
    },
    styles: () => {
      try {
        SlideStylePanel.toggle();
      } catch {
        /* style panel may not be available */
      }
    },
    save: () => {
      try {
        edit()?.saveManager?.save?.();
      } catch (e) {
        console.warn("Save shortcut failed:", e);
      }
    },
    newSlide: () => {
      try {
        edit()?.layoutManager?.showPicker?.();
      } catch (e) {
        console.warn("New slide shortcut failed:", e);
      }
    },
    duplicateSlide: () => {
      try {
        edit()?.slideOps?.duplicateSlide?.();
      } catch (e) {
        console.warn("Duplicate slide shortcut failed:", e);
      }
    },
    deleteSlide: () => {
      try {
        edit()?.slideOps?.deleteSlide?.();
      } catch (e) {
        console.warn("Delete slide shortcut failed:", e);
      }
    },
    insertImage: () => {
      try {
        edit()?.imageInserter?.pickAndInsert?.();
      } catch (e) {
        console.warn("Insert image shortcut failed:", e);
      }
    },
    openLayout: () => {
      try {
        edit()?.layoutManager?.showPickerForCurrentSlide?.();
      } catch (e) {
        console.warn("Open layout shortcut failed:", e);
      }
    },
    toggleMermaid: () => {
      try {
        edit()?.mermaidHelper?.toggle?.();
      } catch (e) {
        console.warn("Toggle Mermaid shortcut failed:", e);
      }
    },
    adjustColumns: () => {
      try {
        edit()?.gridResizer?.toggle?.();
      } catch (e) {
        console.warn("Adjust columns shortcut failed:", e);
      }
    },
    moveSlideUp: () => {
      try {
        edit()?.slideOps?.moveSlideUp?.();
      } catch (e) {
        console.warn("Move slide up shortcut failed:", e);
      }
    },
    moveSlideDown: () => {
      try {
        edit()?.slideOps?.moveSlideDown?.();
      } catch (e) {
        console.warn("Move slide down shortcut failed:", e);
      }
    },
    undo: () => {
      try {
        edit()?.markdownEditor?.undo?.();
      } catch (e) {
        console.warn("Undo shortcut failed:", e);
      }
    },
    redo: () => {
      try {
        edit()?.markdownEditor?.redo?.();
      } catch (e) {
        console.warn("Redo shortcut failed:", e);
      }
    },
    isEditMode: () => isEditMode(),
    isBreakActive: () => getBreakManager()?.isActive ?? false,
    endBreak: () => getBreakManager()?.setActive(false),
    isEditorWindow: () => getRoleManager().isEditorWindow,
    isEmbedded: isEmbedded,
  });
}
