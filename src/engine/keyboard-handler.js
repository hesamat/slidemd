/**
 * KeyboardHandler
 * Maps keyboard keys to actions and delegates to appropriate controllers.
 */

export class KeyboardHandler {
  // Built from the supplied command registry at construction time.
  #keyboardActions = {};
  #viewingActions = {};
  #editModeModifierActions = [];

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
   * @param {Array<{id: string, plainKeys?: string[], viewing?: boolean, modifiers?: Array<{key: string, ctrl?: boolean, shift?: boolean, alt?: boolean}>}>} commands - Command registry used to build key maps
   */
  constructor(actions, commands = []) {
    this.actions = actions;
    this.#buildKeyMaps(commands);
  }

  /**
   * Build keyboard lookup tables from the command registry.
   * Plain keys are split into the main and viewing maps, and modifier
   * combos feed the edit-mode layer. The command palette itself is
   * handled separately because it is global (Ctrl+K / Cmd+K).
   * @param {Array} commands
   * @private
   */
  #buildKeyMaps(commands) {
    for (const cmd of commands) {
      if (cmd.plainKeys) {
        for (const key of cmd.plainKeys) {
          if (cmd.viewing) this.#viewingActions[key] = cmd.id;
          else this.#keyboardActions[key] = cmd.id;
        }
      }
      if (cmd.modifiers) {
        for (const m of cmd.modifiers) {
          this.#editModeModifierActions.push({
            key: m.key,
            ctrl: !!m.ctrl,
            shift: !!m.shift,
            alt: !!m.alt,
            action: cmd.id,
          });
        }
      }
    }
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
   * Find a matching edit-mode modifier action for the given key event.
   * @param {KeyboardEvent} e
   * @returns {string|null} action name or null
   */
  #findModifierAction(e) {
    for (const entry of this.#editModeModifierActions) {
      const keyMatch =
        e.key.toLowerCase() === entry.key.toLowerCase() ||
        (entry.key.length === 1 && e.code === `Key${entry.key.toUpperCase()}`) ||
        e.code === entry.key;
      if (!keyMatch) continue;
      if (!!e.ctrlKey !== entry.ctrl) continue;
      if (!!e.shiftKey !== entry.shift) continue;
      if (!!e.altKey !== entry.alt) continue;
      return entry.action;
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
    const isEditMode = !!this.actions.isEditMode?.();
    const isEditorWindow = !!this.actions.isEditorWindow?.();

    // ── Layer 0: Global command palette (Ctrl+K / Cmd+K) ───────────────
    // Works in both edit and presentation modes, but don't re-open if it's
    // already focused inside the palette itself.
    if (
      (e.ctrlKey || e.metaKey) &&
      !e.shiftKey &&
      e.key.toLowerCase() === "k" &&
      !e.target?.closest?.(".command-palette__dialog")
    ) {
      e.preventDefault();
      this.actions.commandPalette?.();
      return;
    }

    // ── Layer 1: Edit-mode modifier shortcuts (Ctrl+ / Alt+) ────────────
    // These work while typing in the CodeMirror editor AND in non-editable
    // surfaces (the slide preview, the editor panel itself).  We
    // intentionally avoid firing inside non-CodeMirror inputs — modal text
    // fields, image property panels — so they keep their native behaviour
    // and don't accidentally delete a slide, etc.
    if (isEditMode && isEditorWindow && (inCodeMirror || !isEditable)) {
      const modifierAction = this.#findModifierAction(e);
      if (modifierAction && this.actions[modifierAction]) {
        // Undo/Redo are handled by CodeMirror's own keymap when focus is
        // inside the editor.  Only fire from the document handler when
        // focus is outside the editor (e.g. on the slide preview).
        if ((modifierAction === "undo" || modifierAction === "redo") && inCodeMirror) {
          return;
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

    // Determine which action map to consult based on edit mode.
    const plainKey = e.key;
    const singleAction = this.#keyboardActions[plainKey] || this.#viewingActions[plainKey] || null;

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
