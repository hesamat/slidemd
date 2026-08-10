/**
 * KeyboardHandler
 * Maps keyboard keys to actions and delegates to appropriate controllers.
 */
import { SHORTCUTS, isMac } from "./keyboard-shortcuts.js";
import { Logger } from "../core/logger.js";

export class KeyboardHandler {
  static #buildPlainKeyMap() {
    const map = {};
    for (const shortcut of SHORTCUTS) {
      for (const binding of shortcut.bindings) {
        if (binding.global) continue;
        const hasModifiers =
          binding.modifiers &&
          (binding.modifiers.cmdOrCtrl || binding.modifiers.alt || binding.modifiers.shift);
        if (hasModifiers) continue;
        map[binding.key] = shortcut.id;
      }
    }
    return map;
  }

  static #buildModifierActions() {
    const list = [];
    for (const shortcut of SHORTCUTS) {
      for (const binding of shortcut.bindings) {
        if (binding.global) continue;
        const m = binding.modifiers || {};
        const hasModifiers = m.cmdOrCtrl || m.alt || m.shift;
        if (!hasModifiers) continue;
        list.push({
          id: shortcut.id,
          key: binding.key,
          ctrl: !!m.ctrl,
          shift: !!m.shift,
          alt: !!m.alt,
          cmdOrCtrl: !!m.cmdOrCtrl,
        });
      }
    }
    return list;
  }

  static #buildGlobalActions() {
    const list = [];
    for (const shortcut of SHORTCUTS) {
      for (const binding of shortcut.bindings) {
        if (!binding.global) continue;
        const m = binding.modifiers || {};
        list.push({
          id: shortcut.id,
          key: binding.key,
          ctrl: !!m.ctrl,
          shift: !!m.shift,
          alt: !!m.alt,
          cmdOrCtrl: !!m.cmdOrCtrl,
        });
      }
    }
    return list;
  }

  // Single-key shortcuts (no modifiers) that work in view/both modes.
  static #PLAIN_KEY_ACTIONS = KeyboardHandler.#buildPlainKeyMap();

  // Edit-mode modifier shortcuts.
  static #MODIFIER_ACTIONS = KeyboardHandler.#buildModifierActions();

  // Global shortcuts that work in every mode (e.g. command palette).
  static #GLOBAL_ACTIONS = KeyboardHandler.#buildGlobalActions();

  /**
   * Creates a new KeyboardHandler.
   * @param {Object} actions - Callback functions for each keyboard action
   * @param {Function} actions.next - Navigate to next slide
   * @param {Function} actions.prev - Navigate to previous slide
   * @param {Function} actions.first - Navigate to first slide
   * @param {Function} actions.last - Navigate to last slide
   * @param {Function} actions.goto - Open "go to slide" prompt
   * @param {Function} actions.search - Open full-text slide search (/ or Ctrl+Shift+F)
   * @param {Function} actions.viewer - Open viewer window (editor only, viewing mode)
   * @param {Function} actions.edit - Toggle edit mode (E; works in both modes)
   * @param {Function} actions.break - Toggle break timer (editor only, viewing mode)
   * @param {Function} actions.fullscreen - Toggle fullscreen mode
   * @param {Function} actions.reload - Reload the deck (R; works in both modes)
   * @param {Function} actions.theme - Toggle global app theme (light/dark); T in both modes
   * @param {Function} actions.slideTheme - Toggle current slide's theme (`theme:` directive); Alt+Shift+T in edit mode
   * @param {Function} actions.styles - Toggle slide styles panel (edit mode only, Alt+S)
   * @param {Function} actions.save - Save changes (edit mode only, Ctrl+S)
   * @param {Function} actions.newSlide - New slide via layout picker (edit mode only, Alt+N)
   * @param {Function} actions.duplicateSlide - Duplicate current slide (edit mode only, Alt+D)
   * @param {Function} actions.deleteSlide - Delete current slide (edit mode only, Alt+Backspace)
   * @param {Function} actions.insertImage - Open image picker (edit mode only, Alt+I)
   * @param {Function} actions.insertText - Insert a new text block (edit mode only, Alt+T)
   * @param {Function} actions.openLayout - Open layout picker for current slide (edit mode only, Alt+L)
   * @param {Function} actions.toggleMermaid - Toggle Mermaid helper panel (edit mode only, Alt+M)
   * @param {Function} actions.commandPalette - Open command palette (Ctrl+K or Cmd+K)
   * @param {Function} actions.adjustColumns - Toggle column resize handles (edit mode only, Alt+A)
   * @param {Function} actions.isEditMode - Callback to check if edit mode is active
   * @param {Function} actions.isBreakActive - Callback to check if break mode is active
   * @param {Function} actions.endBreak - Callback to end break mode
   * @param {Function} actions.isEditorWindow - Callback to check if current window is editor
   * @param {Function} actions.isEmbedded - Callback to check if running in an iframe
   * @param {Function} actions.getMarkdownEditor - Callback to get the MarkdownEditor instance (used for pre-keystroke undo/redo depth checks)
   *
   * Global (Layer 0) action contract: the action may return exactly
   * `false` to decline handling, in which case the browser's default for
   * the key event is NOT prevented (e.g. Ctrl+S in exported decks or
   * embedded iframes where there is nothing to save). Any other return
   * value (including `undefined`) means the action handled the event and
   * the default is suppressed. If the action throws, the handler logs the
   * failure and treats it as handled so the browser default stays suppressed.
   */
  constructor(actions) {
    this.actions = actions;
  }

  /**
   * Check if the keyboard event target is an editable surface (input,
   * textarea, contenteditable, or inside CodeMirror).
   * @param {KeyboardEvent} e
   * @returns {boolean}
   */
  #isEditableTarget(e) {
    const target = e.target;
    const tagName = target?.tagName?.toLowerCase?.() || "";
    const isEditable = !!target?.isContentEditable;
    const inCodeMirror = !!target?.closest?.(".cm-editor, .markdown-editor-codemirror");
    return ["input", "textarea"].includes(tagName) || isEditable || inCodeMirror;
  }

  /**
   * Check if the event originated inside the CodeMirror editor only
   * (not other input fields like modal text fields or property panels).
   * Layer 1 (modifier shortcuts) is restricted to this surface.
   * @param {KeyboardEvent} e
   * @returns {boolean}
   */
  #isInCodeMirror(e) {
    return !!e.target?.closest?.(".cm-editor, .markdown-editor-codemirror");
  }

  /**
   * Check if the event originated inside the CodeMirror editor content
   * (not the search/replace panel inputs). Used specifically for the
   * undo/redo fall-through, which should only fire when focus is in the
   * editor content, not in panel inputs.
   * @param {KeyboardEvent} e
   * @returns {boolean}
   */
  #isInCodeMirrorContent(e) {
    const target = e.target;
    if (!target?.closest) return false;
    // Exclude search/replace panel inputs (inside .cm-panels).
    if (target.closest(".cm-panels")) return false;
    // Match only the actual editable content surface, not the wrapper or
    // gutters, so undo/redo in the editor content is distinguishable from
    // focusable elements in panels or other parts of the editor chrome.
    return !!target.closest(".cm-content");
  }

  /**
   * Check if the event originated inside the slide-thumbnails sidebar.
   * Used to gate keys (currently Backspace) that would otherwise fire
   * globally and interfere with browser back-navigation or with the
   * focused thumbnail's own controls.
   * @param {KeyboardEvent} e
   * @returns {boolean}
   */
  #isInThumbnails(e) {
    return !!e.target?.closest?.("#slideThumbnails");
  }

  /**
   * Find a matching modifier action for the given key event.
   * @param {KeyboardEvent} e
   * @param {Array<{id: string, key: string, ctrl: boolean, shift: boolean, alt: boolean}>} entries
   * @returns {string|null} action id or null
   */
  #findModifierAction(e, entries) {
    for (const entry of entries) {
      const keyMatch =
        e.key.toLowerCase() === entry.key.toLowerCase() ||
        (entry.key.length === 1 && e.code === `Key${entry.key.toUpperCase()}`) ||
        e.code === entry.key;
      if (!keyMatch) continue;

      if (entry.cmdOrCtrl) {
        const onMac = isMac();
        const primary = onMac ? e.metaKey : e.ctrlKey;
        const other = onMac ? e.ctrlKey : e.metaKey;
        if (!primary) continue;
        if (other) continue;
      } else if (!!e.ctrlKey !== entry.ctrl) {
        continue;
      }

      if (!!e.shiftKey !== entry.shift) continue;
      if (!!e.altKey !== entry.alt) continue;
      return entry.id;
    }
    return null;
  }

  /**
   * Handles keyboard events and dispatches to the appropriate action.
   * @param {KeyboardEvent} e - The keyboard event
   */
  handleKeyboard(e) {
    const isEditable = this.#isEditableTarget(e);
    const inCodeMirror = this.#isInCodeMirror(e);
    const inCodeMirrorContent = this.#isInCodeMirrorContent(e);
    const isEditMode = !!this.actions.isEditMode?.();
    const isEditorWindow = !!this.actions.isEditorWindow?.();

    // ── Layer 0: Global shortcuts ───────────────────────────────────────
    // These work in both edit and presentation modes.  The action runs
    // first so it can decline handling (return false) and let the
    // browser's native default through — e.g. Ctrl+S in exported decks or
    // embedded iframes where there is nothing to save.
    const globalAction = this.#findModifierAction(e, KeyboardHandler.#GLOBAL_ACTIONS);
    // Preserve CodeMirror's editor behavior. For Ctrl+S in other app inputs
    // when an editor exists, suppress the browser's Save Page dialog but
    // still run the app save (the re-entrancy guard dedupes if a save is
    // already in flight, e.g. inside the file-name prompt). In
    // exported/embedded decks (no editor wired), the browser's save is the
    // only useful behavior.
    if (
      globalAction === "save" &&
      isEditable &&
      !inCodeMirror &&
      window.__WEBDECK_EDIT_CONTROLLER__
    ) {
      e.preventDefault();
      this.actions.save?.();
      return;
    }
    if (globalAction && this.actions[globalAction]) {
      let handled = true;
      try {
        handled = this.actions[globalAction]();
      } catch (error) {
        // A throwing action is still treated as handled: the failure must
        // not leak the browser's native default (search/save dialog) on top
        // of the app, and must not propagate out of the document listener.
        Logger.warn(`Global keyboard action failed (${globalAction}):`, error);
      }
      if (handled !== false) {
        e.preventDefault();
      }
      return;
    }

    // ── Layer 1: Edit-mode modifier shortcuts (Ctrl+ / Alt+) ─────────────
    // These work while typing in the CodeMirror editor AND in non-editable
    // surfaces (the slide preview, the editor panel itself).  We
    // intentionally avoid firing inside non-CodeMirror inputs — modal text
    // fields, image property panels — so they keep their native behaviour
    // and don't accidentally delete a slide, etc.
    if (isEditMode && isEditorWindow && (inCodeMirror || !isEditable)) {
      const modifierAction = this.#findModifierAction(e, KeyboardHandler.#MODIFIER_ACTIONS);
      if (modifierAction && this.actions[modifierAction]) {
        // Undo/Redo: CodeMirror's keymap always calls preventDefault for
        // Mod-z/Mod-y (even when the undo stack is empty), so
        // e.defaultPrevented is unreliable. Instead, the editor samples
        // undo/redo depth in a capture-phase listener before CodeMirror's
        // keymap runs. If there was history to undo/redo, let CodeMirror
        // handle it. If not, fall through to EditController.undo() so the
        // user can undo structural operations from inside the editor.
        // Only applies when focus is in the editor content (not the
        // search/replace panel inputs, which get native undo).
        if (modifierAction === "undo" || modifierAction === "redo") {
          if (inCodeMirrorContent) {
            const editor = this.actions.getMarkdownEditor?.();
            if (editor) {
              const hadHistory =
                modifierAction === "undo"
                  ? editor.hadUndoBeforeKeystroke()
                  : editor.hadRedoBeforeKeystroke();
              if (hadHistory) return; // Let CodeMirror handle it
            }
            // No editor history — fall through to store-level undo/redo.
          } else if (inCodeMirror) {
            // In a CodeMirror panel (search/replace) — let the browser
            // do native undo in the input field.
            return;
          }
        }
        e.preventDefault();
        this.actions[modifierAction]();
        return;
      }
    }

    // ── Layer 2: Single-key shortcuts (blocked inside editable surfaces) ─
    if (isEditable) return;

    // Ignore any remaining modifier combos — the rest of the handler
    // operates on plain keys only.  This still allows CodeMirror's own
    // keymap to take over for keys we don't handle.
    if (e.ctrlKey || e.metaKey) return;

    // Alt is used for edit-mode insert shortcuts above; never for plain
    // key lookups.  Shift is allowed (e.g. "G" and "g" both map to goto).
    if (e.altKey) return;

    // Determine which action to dispatch based on the plain key.
    const plainKey = e.key;
    const singleAction = KeyboardHandler.#PLAIN_KEY_ACTIONS[plainKey] || null;

    if (!singleAction) return;

    // Backspace → prev is gated to the slide-thumbnails container so it
    // doesn't fire globally (where it could trigger the browser's back
    // navigation) and doesn't fire when a thumbnail is focused for
    // keyboard interaction (where the user is using Tab/Enter, not
    // Backspace, to navigate).
    if (e.key === "Backspace" && !this.#isInThumbnails(e)) return;

    // If break mode is active, any navigation key ends the break
    if (
      this.actions.isBreakActive?.() &&
      ["next", "prev", "first", "last", "goto"].includes(singleAction)
    ) {
      e.preventDefault();
      this.actions.endBreak?.();
      return;
    }

    // Prevent the browser's default for all handled actions except
    // "reload" — for reload we want Ctrl+R / F5 to still work.
    if (singleAction !== "reload") {
      e.preventDefault();
    }

    switch (singleAction) {
      case "next":
        this.actions.next?.();
        break;
      case "prev":
        this.actions.prev?.();
        break;
      case "first":
        this.actions.first?.();
        break;
      case "last":
        this.actions.last?.();
        break;
      case "goto":
        this.actions.goto?.();
        break;
      case "search":
        this.actions.search?.();
        break;
      case "viewer":
        if (isEditorWindow && !isEditMode) {
          this.actions.viewer?.();
        }
        break;
      case "edit":
        if (isEditorWindow) {
          this.actions.edit?.();
        }
        break;
      case "break":
        if (isEditorWindow && !isEditMode) {
          this.actions.break?.();
        }
        break;
      case "fullscreen":
        this.actions.fullscreen?.();
        break;
      case "reload":
        if (isEditorWindow) {
          this.actions.reload?.();
        }
        break;
      case "theme":
        // T toggles the global app theme (light/dark).  In edit mode
        // the user can press Alt+T for the per-slide theme instead.
        this.actions.theme?.();
        break;
    }
  }
}
