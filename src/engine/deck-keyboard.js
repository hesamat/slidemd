/**
 * Keyboard Action Factory
 *
 * Creates the keyboard handler configuration with all action bindings.
 * Pure factory — no state, no DOM access.
 */
import { KeyboardHandler } from "./keyboard-handler.js";
import { ThemeManager } from "../renderer/theme-manager.js";
import { SlideStylePanel } from "../editor/ui/slide-style-panel.js";
import { isEmbedded } from "../core/utils.js";

/**
 * Create a configured KeyboardHandler with all action bindings.
 *
 * @param {object} opts
 * @param {object} opts.slideNavigator - Slide navigation manager
 * @param {object} opts.roleManager - Role/presentation mode manager
 * @param {object} opts.breakManager - Break mode manager
 * @param {object} opts.reloadManager - Deck reload manager
 * @param {Function} opts.toggleEditMode - Toggle edit mode callback
 * @param {Function} opts.toggleFullscreen - Toggle fullscreen callback
 * @returns {KeyboardHandler}
 */
export function createKeyboardHandler({
  slideNavigator,
  roleManager,
  breakManager,
  reloadManager,
  toggleEditMode,
  toggleFullscreen,
}) {
  const edit = () => window.__WEBDECK_EDIT_CONTROLLER__;

  return new KeyboardHandler({
    next: () => slideNavigator.next(),
    prev: () => slideNavigator.prev(),
    first: () => slideNavigator.goTo(slideNavigator.findFirstVisibleIndex()),
    last: () => slideNavigator.goTo(slideNavigator.findLastVisibleIndex()),
    goto: () => slideNavigator.openGoToPrompt(),
    viewer: () => roleManager.togglePresentWindow(),
    edit: () => toggleEditMode(),
    break: () => breakManager.toggle(),
    fullscreen: () => toggleFullscreen(),
    reload: () => reloadManager.handleReloadDeck(),
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
    isEditMode: () => toggleEditMode(),
    isBreakActive: () => breakManager.isActive,
    endBreak: () => breakManager.setActive(false),
    isEditorWindow: () => roleManager.isEditorWindow,
    isEmbedded: isEmbedded,
  });
}
