import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, placeholder } from "@codemirror/view";
import { history, historyKeymap, indentWithTab, defaultKeymap } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion, completionKeymap, snippetCompletion } from "@codemirror/autocomplete";
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
            this.view.dispatch({
                selection: EditorSelection.range(selection.from, selection.to),
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
                override: [layoutCompletionSource, areaCompletionSource, fenceCompletionSource]
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