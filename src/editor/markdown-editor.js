/**
 * MarkdownEditor
 * A lightweight markdown editor.
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
            onChange: options.onChange || (() => {}),
            debounceDelay: options.debounceDelay || 150,
        };

        this.debounceTimer = null;
        this.value = "";
        this.textarea = null;

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
                <textarea
                    class="markdown-editor-textarea"
                    placeholder="${this.escapeHtml(this.options.placeholder)}"
                    spellcheck="false"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                ></textarea>
            </div>
        `;

        this.textarea = this.container.querySelector(".markdown-editor-textarea");

        // Sync initial value if one was set before render
        if (this.value) {
            this.textarea.value = this.value;
        }
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        if (!this.textarea) return;

        // Handle input events with debouncing
        this.textarea.addEventListener("input", () => {
            this.value = this.textarea.value;

            // Debounce the onChange callback
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }
            this.debounceTimer = setTimeout(() => {
                this.options.onChange(this.value);
            }, this.options.debounceDelay);
        });

        // Handle tab key to insert spaces instead of changing focus
        this.textarea.addEventListener("keydown", (e) => {
            if (e.key === "Tab") {
                e.preventDefault();
                this.insertSpaces(4);
            }
        });
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
        if (!this.textarea) return;

        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        const spaces = " ".repeat(count);

        this.textarea.value =
            this.textarea.value.substring(0, start) +
            spaces +
            this.textarea.value.substring(end);

        // Move cursor after the inserted spaces
        this.textarea.selectionStart = this.textarea.selectionEnd = start + count;

        // Trigger input event to update value
        this.textarea.dispatchEvent(new Event("input"));
    }

    /**
     * Set the editor value
     * @param {string} value - The new value
     */
    setValue(value) {
        this.value = value || "";

        if (this.textarea) {
            // Store focus state and cursor position
            const wasFocused = document.activeElement === this.textarea;
            const startPosition = this.textarea.selectionStart;
            const endPosition = this.textarea.selectionEnd;
            const scrollTop = this.textarea.scrollTop;

            this.textarea.value = this.value;

            // Restore focus state and cursor position if we had focus
            if (wasFocused) {
                this.textarea.selectionStart = startPosition;
                this.textarea.selectionEnd = endPosition;
                this.textarea.scrollTop = scrollTop;
            }
        }
    }

    /**
     * Get the editor value
     * @returns {string} The current value
     */
    getValue() {
        return this.textarea ? this.textarea.value : this.value;
    }

    /**
     * Focus the editor
     */
    focus() {
        if (this.textarea) {
            this.textarea.focus();
        }
    }

    /**
     * Destroy the editor and clean up
     */
    destroy() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.container.innerHTML = "";
        this.textarea = null;
        this.backdrop = null;
    }
}