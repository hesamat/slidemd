/**
 * KeyboardHandler
 * Maps keyboard keys to actions and delegates to appropriate controllers.
 */

export class KeyboardHandler {
    static #KEYBOARD_ACTIONS = {
        "ArrowRight": "next", " ": "next", "PageDown": "next", "ArrowDown": "next",
        "ArrowLeft": "prev", "PageUp": "prev", "ArrowUp": "prev", "Backspace": "prev",
        "Home": "first", "End": "last",
        "g": "goto", "G": "goto",
        "e": "edit", "E": "edit",
        "b": "break", "B": "break",
        "f": "fullscreen", "F": "fullscreen",
        "r": "reload", "R": "reload",
        "p": "viewer", "P": "viewer",
        "d": "theme", "D": "theme"
    };

    /**
     * Creates a new KeyboardHandler.
     * @param {Object} actions - Callback functions for each keyboard action
     * @param {Function} actions.next - Navigate to next slide
     * @param {Function} actions.prev - Navigate to previous slide
     * @param {Function} actions.first - Navigate to first slide
     * @param {Function} actions.last - Navigate to last slide
     * @param {Function} actions.goto - Open "go to slide" prompt
     * @param {Function} actions.viewer - Open viewer window
     * @param {Function} actions.edit - Toggle edit mode (editor only)
     * @param {Function} actions.break - Toggle break timer (editor only)
     * @param {Function} actions.fullscreen - Toggle fullscreen mode
     * @param {Function} actions.reload - Reload the deck
     * @param {Function} actions.theme - Toggle theme
     * @param {Function} actions.shouldPreventDefault - Optional callback to check if default should be prevented
     * @param {Function} actions.isBreakActive - Callback to check if break mode is active
     * @param {Function} actions.endBreak - Callback to end break mode
     * @param {Function} actions.isEditorWindow - Callback to check if current window is editor
     * @param {Function} actions.isEmbedded - Callback to check if running in an iframe
     */
    constructor(actions) {
        this.actions = actions;
    }

    /**
     * Handles keyboard events and dispatches to the appropriate action.
     * @param {KeyboardEvent} e - The keyboard event
     */
    handleKeyboard(e) {
        // Ignore keyboard events when typing in input, textarea, or contenteditable/CodeMirror
        const target = e.target;
        const tagName = target?.tagName?.toLowerCase?.() || "";
        const isEditable = target?.isContentEditable;
        const inCodeMirror = !!target?.closest?.(".cm-editor, .markdown-editor-codemirror");

        if (["input", "textarea"].includes(tagName) || isEditable || inCodeMirror) {
            return;
        }

        // Ignore events with modifier keys (Ctrl, Alt, Meta) to allow browser shortcuts
        // Exceptions: Ctrl key combinations for specific shortcuts can be added here if needed
        if (e.ctrlKey || e.altKey || e.metaKey) {
            return;
        }

        const action = KeyboardHandler.#KEYBOARD_ACTIONS[e.key];
        if (!action) return;

        // Skip navigation actions when an image is selected in edit mode
        if (this.actions.isImageSelected?.() && ["next", "prev", "first", "last"].includes(action)) {
            return;
        }

        // If break mode is active, any navigation key ends the break
        if (this.actions.isBreakActive?.() && ["next", "prev", "first", "last", "goto"].includes(action)) {
            e.preventDefault();
            this.actions.endBreak?.();
            return;
        }

        // Check if we should prevent default (for actions that want it)
        // For "reload" action, don't prevent default to allow browser's Ctrl+R/F5 to work
        const shouldPrevent = this.actions.shouldPreventDefault?.(action) !== false;
        if (shouldPrevent && action !== "reload") {
            e.preventDefault();
        }

        switch (action) {
            case "next": this.actions.next?.(); break;
            case "prev": this.actions.prev?.(); break;
            case "first": this.actions.first?.(); break;
            case "last": this.actions.last?.(); break;
            case "goto": this.actions.goto?.(); break;
            case "viewer":
                if (this.actions.isEditorWindow?.()) {
                    this.actions.viewer?.();
                } break;
            case "edit":
                if (this.actions.isEditorWindow?.()) {
                    this.actions.edit?.();
                }
                break;
            case "break":
                if (this.actions.isEditorWindow?.()) {
                    this.actions.break?.();
                }
                break;
            case "fullscreen": this.actions.fullscreen?.(); break;
            case "reload":
                if (this.actions.isEditorWindow?.()) {
                    this.actions.reload?.();
                } break;
            case "theme":
                if (this.actions.isEditorWindow?.()) {
                    this.actions.theme?.();
                } break;
        }
    }
}
