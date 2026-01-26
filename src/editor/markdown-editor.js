/**
 * MarkdownEditor
 * A lightweight markdown editor with syntax highlighting using Prism.js backdrop highlighter pattern.
 */
import { AssetLoader } from "../core/asset-loader.js";

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
        this.backdrop = null;

        // 1. Render immediately so DOM elements exist
        this.render();

        // 2. Setup listeners immediately
        this.setupEventListeners();

        // 3. Load syntax highlighter in the background
        this.preloadHighlighter();
    }

    async preloadHighlighter() {
        try {
            await AssetLoader.ensurePrismLoaded();
            // Once loaded, refresh the view to apply colors
            this.updateHighlighting();
        } catch (e) {
            console.warn("Failed to load Prism for editor:", e);
        }
    }

    /**
     * Render the editor structure
     */
    render() {
        this.container.innerHTML = `
            <div class="markdown-editor-wrapper">
                <div class="markdown-editor-backdrop" aria-hidden="true"><code></code></div>
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

        this.wrapper = this.container.querySelector(".markdown-editor-wrapper");
        this.backdrop = this.container.querySelector(".markdown-editor-backdrop code");
        this.textarea = this.container.querySelector(".markdown-editor-textarea");
        
        // Sync initial value if one was set before render (unlikely with this flow, but good practice)
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
            this.updateHighlighting();

            // Debounce the onChange callback
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }
            this.debounceTimer = setTimeout(() => {
                this.options.onChange(this.value);
            }, this.options.debounceDelay);
        });

        // Handle scroll events to keep backdrop and textarea in sync
        this.textarea.addEventListener("scroll", () => {
            if (this.backdrop && this.backdrop.parentElement) {
                this.backdrop.parentElement.scrollTop = this.textarea.scrollTop;
                this.backdrop.parentElement.scrollLeft = this.textarea.scrollLeft;
            }
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
     * Update the syntax highlighting in the backdrop
     */
    updateHighlighting() {
        if (!this.textarea || !this.backdrop) return;

        const text = this.textarea.value;

        // If text is empty, show placeholder (if your CSS supports it) or empty string
        if (!text) {
            this.backdrop.innerHTML = ""; 
            // Optional: You can put placeholder HTML here if desired, 
            // but usually placeholders are handled by the textarea attribute
            return;
        }

        let highlighted;

        // Apply Prism syntax highlighting if loaded
        if (window.Prism && window.Prism.languages?.markdown) {
            try {
                highlighted = window.Prism.highlight(text, window.Prism.languages.markdown, "markdown");
            } catch (e) {
                // Fallback to plain text if Prism fails
                highlighted = this.escapeHtml(text);
            }
        } else {
            // Fallback if Prism not loaded yet
            highlighted = this.escapeHtml(text);
        }

        // Add a trailing newline to match textarea behavior
        // Browsers handle textarea newlines differently than div content
        if (text.endsWith("\n")) {
            highlighted += "\n";
        }

        this.backdrop.innerHTML = highlighted;

        // Force a layout recalculation to ensure backdrop and textarea stay aligned
        // This prevents cursor/click misalignment that can occur when content changes
        void this.backdrop.offsetHeight;
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

        // Trigger input event to update highlighting and history
        this.textarea.dispatchEvent(new Event("input"));
    }

    /**
     * Set the editor value
     * @param {string} value - The new value
     */
    setValue(value) {
        this.value = value || "";
        
        // Safety check ensures we don't crash if render failed
        if (this.textarea) {
            this.textarea.value = this.value;
            this.updateHighlighting();
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