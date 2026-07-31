import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  placeholder,
} from "@codemirror/view";
import {
  history,
  historyKeymap,
  indentWithTab,
  defaultKeymap,
  undo,
  redo,
} from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { foldGutter, foldKeymap, bracketMatching } from "@codemirror/language";
import { languages } from "@codemirror/language-data";

import { addHighlight, removeHighlight, highlightField } from "./codemirror/highlight-line.js";
import { fencedBlockHelper } from "./codemirror/fenced-block-helper.js";
import { editorThemeExtensions } from "./codemirror/editor-theme.js";
import { createCompletionSources } from "./codemirror/completion-sources.js";

/**
 * MarkdownEditor
 * CodeMirror-based markdown editor with search and autocomplete.
 */
export class MarkdownEditor {
  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Create a new MarkdownEditor
   * @param {HTMLElement} container - The container element to render the editor in
   * @param {object} [options={}] - Editor options
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      placeholder: options.placeholder || "Edit markdown for current slide...",
      onChange: options.onChange || (() => {}),
      debounceDelay: options.debounceDelay || 150,
    };

    this.debounceTimer = null;
    this.value = "";
    this.view = null;
    this.editorRoot = null;
    this.suppressChange = false;
    this._tableCompartment = new Compartment();
    this._completionSources = [];

    // Render immediately so DOM elements exist
    this.render();
  }

  /**
   * Render the editor structure
   */
  render() {
    this.container.innerHTML = `
            <div class="markdown-editor-wrapper">
                <div class="markdown-editor-header">
                    <span class="markdown-editor-header__title">Markdown</span>
                    <button type="button" class="markdown-editor-header__help" aria-label="Keyboard shortcuts" title="Keyboard shortcuts">?</button>
                </div>
                <div class="markdown-editor-codemirror" aria-label="Markdown editor"></div>
                <div class="markdown-editor-help webdeck-hidden" aria-label="Keyboard shortcuts help">
                    <div class="markdown-editor-help__panel">
                        <div class="markdown-editor-help__header">
                            <h3>Keyboard shortcuts</h3>
                            <button type="button" class="markdown-editor-help__close" aria-label="Close help">×</button>
                        </div>
                        <table class="markdown-editor-help__table">
                            <tbody></tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

    this.editorRoot = this.container.querySelector(".markdown-editor-codemirror");
    this._wireHelp();
    this.initializeCodeMirror();
  }

  _wireHelp() {
    const helpBtn = this.container.querySelector(".markdown-editor-header__help");
    const closeBtn = this.container.querySelector(".markdown-editor-help__close");
    const overlay = this.container.querySelector(".markdown-editor-help");
    const tbody = overlay?.querySelector(".markdown-editor-help__table tbody");
    if (!helpBtn || !overlay) return;

    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const mod = isMac ? "Cmd" : "Ctrl";
    const alt = isMac ? "Option" : "Alt";
    const rows = [
      ["Find", `${mod} + F`],
      ["Replace", `${mod} + H`],
      ["Find next / previous", `${mod} + G / Shift + G`],
      ["Undo / Redo", `${mod} + Z / Shift + Z`],
      ["Autocomplete", `${mod} + Space`],
      ["Insert 2×2 table", `${mod} + ${alt} + T`],
      ["Insert image", `${alt} + I`],
      ["Insert text block", `${alt} + T`],
      ["Insert diagram", `${alt} + M`],
      ["Indent / Outdent", "Tab / Shift + Tab"],
      ["Fold / Unfold (gutter)", "Click arrows"],
    ];
    if (tbody) {
      tbody.innerHTML = rows
        .map(([name, keys]) => `<tr><td>${name}</td><td>${keys}</td></tr>`)
        .join("");
    }

    const toggle = () => overlay.classList.toggle("webdeck-hidden");
    helpBtn.addEventListener("click", toggle);
    closeBtn?.addEventListener("click", toggle);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.add("webdeck-hidden");
    });
  }

  // ── Text manipulation ────────────────────────────────────────────────────

  /**
   * Insert spaces at the current cursor position
   */
  insertSpaces(count) {
    if (!this.view) return;
    const spaces = " ".repeat(count);
    const { from, to } = this.view.state.selection.main;
    this.view.dispatch({
      changes: { from, to, insert: spaces },
      selection: { anchor: from + count, head: from + count },
    });
  }

  /**
   * Set the editor value.
   * @param {string} value - The new value
   * @param {object} [options={}]
   * @param {boolean} [options.suppressOnChange=false] - When true, the debounced
   *   onChange callback is skipped. Use this when the caller will trigger
   *   updatePreview() manually to avoid a redundant re-render.
   */
  setValue(value, options = {}) {
    this.value = value || "";
    if (!this.view) return;

    const { suppressOnChange = false } = options;
    if (suppressOnChange) this.suppressChange = true;

    try {
      const scrollTop = this.view.scrollDOM.scrollTop;

      // Use dispatch (not setState) so the change is recorded in the undo
      // history — Ctrl+Z / Cmd+Z will revert it.
      this.view.dispatch({
        changes: { from: 0, to: this.view.state.doc.length, insert: this.value },
      });

      this.view.scrollDOM.scrollTop = scrollTop;

      if (!suppressOnChange) {
        this.scheduleOnChange();
      }
    } finally {
      if (suppressOnChange) this.suppressChange = false;
    }
  }

  /**
   * Set the editor value and move cursor to a specific position.
   * @param {string} value - The new value
   * @param {number} cursorPosition - Index to place the cursor at
   * @param {object} [options={}]
   * @param {boolean} [options.suppressOnChange=false] - When true, the debounced
   *   onChange callback is skipped.
   * @param {boolean} [options.scrollIntoView=true] - When true, scrolls the
   *   cursor into view after setting the value.
   */
  setValueWithCursor(value, cursorPosition, options = {}) {
    this.value = value || "";
    if (!this.view) return;

    const { suppressOnChange = false, scrollIntoView = true, focus = true } = options;
    if (suppressOnChange) this.suppressChange = true;

    try {
      const position = Math.max(
        0,
        Math.min(cursorPosition ?? this.value.length, this.value.length),
      );
      this.view.dispatch({
        changes: { from: 0, to: this.view.state.doc.length, insert: this.value },
        selection: EditorSelection.cursor(position),
        scrollIntoView,
      });
      if (focus) this.view.focus();
    } finally {
      if (suppressOnChange) this.suppressChange = false;
    }
  }

  /**
   * Insert text at the current cursor position
   * @param {string} text - Text to insert
   */
  insertText(text) {
    if (!this.view) return;
    const { from, to } = this.view.state.selection.main;
    const newPosition = from + text.length;
    this.view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: newPosition, head: newPosition },
    });
  }

  /**
   * Replace a range of text in the editor and place the caret at the end of the inserted text.
   * @param {number} from - Start position.
   * @param {number} to - End position.
   * @param {string} text - Replacement text.
   */
  replaceRange(from, to, text) {
    if (!this.view) return;
    const start = Math.max(0, Math.min(from, this.view.state.doc.length));
    const end = Math.max(start, Math.min(to, this.view.state.doc.length));
    const insert = String(text || "");
    this.view.dispatch({
      changes: { from: start, to: end, insert },
      selection: { anchor: start + insert.length, head: start + insert.length },
    });
  }

  // ── Read state ───────────────────────────────────────────────────────────

  /**
   * Get the current primary selection range.
   * @returns {{ from: number, to: number }}
   */
  getSelection() {
    return this.view ? { ...this.view.state.selection.main } : { from: 0, to: 0 };
  }

  /**
   * Get the editor value
   * @returns {string} The current value
   */
  getValue() {
    if (this.view) return this.view.state.doc.toString();
    return this.value;
  }

  // ── Change notification ──────────────────────────────────────────────────

  scheduleOnChange() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.options.onChange(this.value);
    }, this.options.debounceDelay);
  }

  /**
   * Focus the editor
   */
  focus() {
    this.view?.focus();
  }

  /**
   * Undo the last edit
   */
  undo() {
    if (this.view) undo(this.view);
  }

  /**
   * Redo the last undone edit
   */
  redo() {
    if (this.view) redo(this.view);
  }

  // ── Line highlight (click-to-jump) ───────────────────────────────────────

  /**
   * Temporarily highlight a line in the editor (for click-to-jump feedback).
   * @param {number} lineNumber - 0-indexed line number
   */
  highlightLine(lineNumber) {
    if (!this.view) return;
    this.view.dispatch({ effects: removeHighlight.of(null) });
    setTimeout(() => {
      this.view.dispatch({ effects: addHighlight.of(lineNumber) });
      setTimeout(() => {
        this.view.dispatch({ effects: removeHighlight.of(null) });
      }, 1200);
    }, 20);
  }

  /**
   * Destroy the editor and clean up
   */
  destroy() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.view?.destroy();
    this.container.innerHTML = "";
    this.view = null;
    this.editorRoot = null;
    this.backdrop = null;
  }

  // ── CodeMirror setup ─────────────────────────────────────────────────────

  initializeCodeMirror() {
    if (!this.editorRoot) return;

    const completionSources = createCompletionSources();
    this._completionSources = completionSources;

    // Suppress the known Lezer crash where hasChild() tries to access
    // tree.children on a Tree node that was never fully initialized.
    // This is harmless (only affects syntax highlighting decorations)
    // but would otherwise log a noisy exception and break the highlighter.
    const suppressLezerHighlightCrash = EditorView.exceptionSink.of((ex) => {
      if (
        ex instanceof TypeError &&
        ex.message.includes("Cannot read properties of undefined") &&
        /hasChild|nextChild|highlightRange/.test(ex.stack || "")
      )
        return;
      throw ex;
    });

    const extensions = [
      suppressLezerHighlightCrash,
      EditorView.lineWrapping,
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightField,
      history(),
      keymap.of([
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...completionKeymap,
        ...closeBracketsKeymap,
        ...foldKeymap,
      ]),
      highlightSelectionMatches(),
      foldGutter(),
      bracketMatching(),
      closeBrackets(),
      this._tableCompartment.of(
        autocompletion({
          activateOnTyping: true,
          override: completionSources,
        }),
      ),
      ...editorThemeExtensions,
      markdown({ codeLanguages: languages }),
      placeholder(this.options.placeholder),
      fencedBlockHelper,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        this.value = update.state.doc.toString();

        if (this.suppressChange) return;
        this.scheduleOnChange();
      }),
    ].filter(Boolean);

    this.extensions = extensions;

    this.view = new EditorView({
      state: EditorState.create({
        doc: this.value || "",
        extensions,
      }),
      parent: this.editorRoot,
    });

    this.tableSupportReady = this._loadTableSupport().catch((err) => {
      console.warn("Markdown table support unavailable:", err);
    });
  }

  /**
   * Load the browser-only markdown table helper and fold it into the editor.
   * The autocompleter has to live in the `override` list because `override`
   * makes @codemirror/autocomplete ignore language-data completion sources.
   */
  async _loadTableSupport() {
    // The table helper touches browser globals; keep Node tests from loading it.
    if (typeof navigator === "undefined") return;

    const { markdownTableAutocompleter, insertEmptyMarkdownTable } =
      await import("codemirror-markdown-tables");
    if (!this.view) return;

    this.view.dispatch({
      effects: this._tableCompartment.reconfigure([
        autocompletion({
          activateOnTyping: true,
          override: [...this._completionSources, markdownTableAutocompleter()],
        }),
        keymap.of([{ key: "Mod-Alt-t", run: insertEmptyMarkdownTable() }]),
      ]),
    });
  }
}
