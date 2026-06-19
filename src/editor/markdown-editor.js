import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, placeholder } from "@codemirror/view";
import { history, historyKeymap, indentWithTab, defaultKeymap } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion, completionKeymap, snippetCompletion, startCompletion } from "@codemirror/autocomplete";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { tags } from "@lezer/highlight";
import { LayoutData } from "../data/layout-data.js";

/**
 * MarkdownEditor
 * CodeMirror-based markdown editor with search and autocomplete.
 */
export class MarkdownEditor {
    /**
     * Create a new MarkdownEditor
     * @param {HTMLElement} container - The container element to render the editor in
     * @param {Object} options - Editor options
     */
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            placeholder: options.placeholder || "Edit markdown for current slide...",
            onChange: options.onChange || (() => { }),
            debounceDelay: options.debounceDelay || 150,
        };

        this.debounceTimer = null;
        this.value = "";
        this.view = null;
        this.editorRoot = null;
        this.suppressChange = false;

        // Render immediately so DOM elements exist
        this.render();

        // Setup listeners immediately
        this.setupEventListeners();
    }

    /**
     * Render the editor structure
     */
    render() {
        this.container.innerHTML = `
            <div class="markdown-editor-wrapper">
                <div class="markdown-editor-codemirror" aria-label="Markdown editor"></div>
            </div>
        `;

        this.editorRoot = this.container.querySelector(".markdown-editor-codemirror");
        this.initializeCodeMirror();
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // CodeMirror handles its own input events.
    }

    /**
     * Escape HTML special characters
     */
    escapeHtml(text) {
        if (!text) return "";
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /**
     * Insert spaces at the current cursor position
     */
    insertSpaces(count) {
        if (!this.view) return;
        const spaces = " ".repeat(count);
        const { from, to } = this.view.state.selection.main;
        this.view.dispatch({
            changes: { from, to, insert: spaces },
            selection: { anchor: from + count, head: from + count }
        });
    }

    /**
     * Set the editor value
     * @param {string} value - The new value
     */
    setValue(value, options = {}) {
        this.value = value || "";
        if (!this.view) return;

        const { suppressOnChange = false } = options;
        if (suppressOnChange) this.suppressChange = true;

        const wasFocused = this.view.hasFocus;
        const selection = this.view.state.selection.main;
        const scrollTop = this.view.scrollDOM.scrollTop;

        this.view.dispatch({
            changes: { from: 0, to: this.view.state.doc.length, insert: this.value }
        });

        if (suppressOnChange) this.suppressChange = false;

        if (wasFocused) {
            // Clamp the restored selection to the new document length to avoid
            // out-of-bounds ranges when the new value is shorter than the old one.
            const docLength = this.view.state.doc.length;
            const from = Math.min(selection.from, docLength);
            const to = Math.min(selection.to, docLength);

            this.view.dispatch({
                selection: EditorSelection.range(from, to),
                scrollIntoView: false
            });
            this.view.scrollDOM.scrollTop = scrollTop;
        }
    }

    /**
     * Set the editor value and move cursor to a specific position
     * @param {string} value - The new value
     * @param {number} cursorPosition - Index to place the cursor at
     */
    setValueWithCursor(value, cursorPosition, options = {}) {
        this.value = value || "";
        if (!this.view) return;

        const { suppressOnChange = false, scrollIntoView = true } = options;
        if (suppressOnChange) this.suppressChange = true;

        const position = Math.max(0, Math.min(cursorPosition ?? this.value.length, this.value.length));
        this.view.dispatch({
            changes: { from: 0, to: this.view.state.doc.length, insert: this.value },
            selection: EditorSelection.cursor(position),
            scrollIntoView
        });
        if (suppressOnChange) this.suppressChange = false;
        this.view.focus();
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
            selection: { anchor: newPosition, head: newPosition }
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
        const insert = String(text || '');
        this.view.dispatch({
            changes: { from: start, to: end, insert },
            selection: { anchor: start + insert.length, head: start + insert.length }
        });
    }

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

    /**
     * Focus the editor
     */
    focus() {
        this.view?.focus();
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

    initializeCodeMirror() {
        if (!this.editorRoot) return;

        const layoutNames = LayoutData.getAllLayouts();
        const layoutCompletions = layoutNames.map((name) => ({
            label: name,
            type: "keyword"
        }));

        const areaNames = Array.from(new Set(
            layoutNames.flatMap((name) => LayoutData.getAreaNames(name)).concat([
                "main",
                "header",
                "footer",
                "media",
                "sidebar",
                "secondary",
                "title"
            ])
        ));

        const areaCompletions = areaNames.map((name) => ({
            label: `@${name}`,
            type: "keyword"
        }));

        const layoutCompletionSource = (context) => {
            const match = context.matchBefore(/layout:\s*[a-z0-9-]*$/i);
            if (!match) return null;
            let from = match.from + match.text.indexOf(":") + 1;
            const docText = context.state.doc.sliceString(match.from, match.to);
            while (from < match.to && /\s/.test(docText[from - match.from])) {
                from += 1;
            }
            return {
                from,
                options: layoutCompletions,
            };
        };

        const directiveCompletionSource = (context) => {
            const match = context.matchBefore(/(?:^|\n)\s*(background|theme|hidden|hide):\s*[^\n]*$/i);
            if (!match) return null;

            const directive = match.text.split(":")[0].trim().toLowerCase();
            let from = match.from + match.text.indexOf(":") + 1;
            const docText = context.state.doc.sliceString(match.from, match.to);
            while (from < match.to && /\s/.test(docText[from - match.from])) {
                from += 1;
            }

            const optionsByDirective = {
                theme: [
                    { label: "light", type: "keyword" },
                    { label: "dark", type: "keyword" }
                ],
                hidden: [
                    { label: "true", type: "keyword" },
                    { label: "false", type: "keyword" }
                ],
                hide: [
                    { label: "true", type: "keyword" },
                    { label: "false", type: "keyword" }
                ],
                background: [
                    snippetCompletion("linear-gradient(135deg, #0ea5e9 0%, #1e3a8a 90%)", { label: "gradient" }),
                    snippetCompletion("#eeffdd", { label: "solid color" }),
                    snippetCompletion("url(${})", { label: "image URL" })
                ]
            };

            const options = optionsByDirective[directive];
            if (!options) return null;
            return { from, options };
        };

        const notesCompletionSource = (context) => {
            const match = context.matchBefore(/<!--\s*notes\s*:?\s*[^-]*$/i);
            if (!match) return null;
            return {
                from: match.from,
                options: [
                    snippetCompletion("<!-- notes: ${} -->", { label: "notes", type: "keyword" })
                ]
            };
        };

        const createSlashCommand = (label, insertText, triggerCompletion) => ({
            label,
            type: "keyword",
            apply: (view, _completion, from, to) => {
                view.dispatch({
                    changes: { from, to, insert: insertText },
                    selection: { anchor: from + insertText.length }
                });
                if (triggerCompletion) {
                    startCompletion(view);
                }
            }
        });

        const slashCommandSource = (context) => {
            const match = context.matchBefore(/(?:^|\s)\/[a-z-]*$/i);
            if (!match) return null;

            const start = match.from + match.text.lastIndexOf("/");
            return {
                from: start,
                options: [
                    createSlashCommand("/layout", "layout: ", true),
                    createSlashCommand("/theme", "theme: ", true),
                    createSlashCommand("/background", "background: ", true),
                    createSlashCommand("/hidden", "hidden: ", true),
                    createSlashCommand("/main", "@main\n", false),
                    createSlashCommand("/header", "@header\n", false),
                    createSlashCommand("/media", "@media\n", false),
                    createSlashCommand("/sidebar", "@sidebar\n", false),
                    createSlashCommand("/footer", "@footer\n", false),
                    createSlashCommand("/mermaid", "```mermaid\n\n```", false),
                    createSlashCommand("/notes", "<!-- notes:  -->", false)
                ]
            };
        };

        const areaCompletionSource = (context) => {
            const match = context.matchBefore(/@[a-z0-9_-]*$/i);
            if (!match) return null;
            return {
                from: match.from,
                options: areaCompletions,
            };
        };

        const fenceCompletionSource = (context) => {
            const match = context.matchBefore(/```[a-z]*$/i);
            if (!match) return null;
            return {
                from: match.from,
                options: [
                    snippetCompletion("```mermaid\n${}\n```", { label: "```mermaid", type: "keyword" }),
                    snippetCompletion("```js\n${}\n```", { label: "```js", type: "keyword" }),
                    snippetCompletion("```bash\n${}\n```", { label: "```bash", type: "keyword" }),
                    snippetCompletion("```md\n${}\n```", { label: "```md", type: "keyword" })
                ]
            };
        };

        const fencedBlockHelper = EditorView.inputHandler.of((view, from, to, text) => {
            if (text !== "`" && text !== "~") return false;
            const marker = text === "`" ? "`" : "~";
            const line = view.state.doc.lineAt(from);
            const before = line.text.slice(0, from - line.from);

            if (before.trim() !== marker.repeat(2)) return false;

            const indentMatch = line.text.match(/^\s*/);
            const indent = indentMatch ? indentMatch[0] : "";
            const fence = marker.repeat(3);
            const insertText = `${indent}${fence}\n${indent}\n${indent}${fence}`;
            const cursorPosition = line.from + indent.length + fence.length + 1 + indent.length;

            view.dispatch({
                changes: { from: line.from, to: line.to, insert: insertText },
                selection: EditorSelection.cursor(cursorPosition)
            });

            return true;
        });

        const markdownHighlightStyle = HighlightStyle.define([
            { tag: tags.heading, color: "var(--cm-token-heading)", fontWeight: "700" },
            { tag: tags.strong, color: "var(--cm-token-strong)", fontWeight: "700" },
            { tag: tags.emphasis, color: "var(--cm-token-emphasis)", fontStyle: "italic" },
            { tag: tags.keyword, color: "var(--cm-token-keyword)" },
            { tag: tags.atom, color: "var(--cm-token-atom)" },
            { tag: tags.string, color: "var(--cm-token-string)" },
            { tag: tags.comment, color: "var(--cm-token-comment)", fontStyle: "italic" },
            { tag: tags.link, color: "var(--cm-token-link)" },
            { tag: tags.url, color: "var(--cm-token-url)", textDecoration: "underline" },
            { tag: tags.monospace, color: "var(--cm-token-code)", fontFamily: "var(--font-mono)" },
            { tag: tags.list, color: "var(--cm-token-list)" },
            { tag: tags.quote, color: "var(--cm-token-quote)" },
            { tag: tags.meta, color: "var(--cm-token-meta)" }
        ]);

        const theme = EditorView.theme({
            "&": {
                height: "100%",
                backgroundColor: "var(--surface-bg)",
                color: "var(--text-high)",
                fontFamily: "var(--font-mono)",
                fontSize: "12px"
            },
            ".cm-scroller": {
                fontFamily: "inherit"
            },
            ".cm-content": {
                padding: "14px"
            },
            ".cm-line": {
                lineHeight: "1.6"
            },
            ".cm-gutters": {
                backgroundColor: "var(--surface-bg)",
                color: "var(--text-low)",
                borderRight: "1px solid var(--border-medium)"
            },
            ".cm-activeLineGutter": {
                backgroundColor: "var(--surface-elevated)"
            }
        });

        const extensions = [
            EditorView.lineWrapping,
            lineNumbers(),
            highlightActiveLineGutter(),
            history(),
            keymap.of([
                indentWithTab,
                ...defaultKeymap,
                ...historyKeymap,
                ...searchKeymap,
                ...completionKeymap
            ]),
            highlightSelectionMatches(),
            autocompletion({
                activateOnTyping: true,
                override: [slashCommandSource, layoutCompletionSource, directiveCompletionSource, notesCompletionSource, areaCompletionSource, fenceCompletionSource]
            }),
            syntaxHighlighting(markdownHighlightStyle, { fallback: true }),
            markdown({ codeLanguages: languages }),
            placeholder(this.options.placeholder),
            theme,
            fencedBlockHelper,
            EditorView.updateListener.of((update) => {
                if (!update.docChanged) return;
                this.value = update.state.doc.toString();

                if (this.suppressChange) return;

                if (this.debounceTimer) {
                    clearTimeout(this.debounceTimer);
                }
                this.debounceTimer = setTimeout(() => {
                    this.options.onChange(this.value);
                }, this.options.debounceDelay);
            })
        ];

        this.view = new EditorView({
            state: EditorState.create({
                doc: this.value,
                extensions
            }),
            parent: this.editorRoot
        });
    }
}