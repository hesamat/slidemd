/**
 * EditController
 * Manages edit mode with side-by-side markdown editor and live preview.
 */
import { MarkdownParser } from "./markdown-parser.js";
import { SlideRenderer } from "./slide-renderer.js";
import { AssetLoader } from "./asset-loader.js";
import { Notification } from "./notification.js";
import { ContentEnhancer } from "./content-enhancer.js";
import { LayoutPicker } from "./layout-picker.js";
import { LayoutData } from "./layout-data.js";
import { SlideThumbnails } from "./slide-thumbnails.js";

export class EditController {
    constructor(deck, controller, elements) {
        this.deck = deck;
        this.controller = controller;
        this.elements = elements;

        this.isEditMode = false;
        this.currentSlideIndex = controller.currentIndex;
        this.hasUnsavedChanges = false;

        this.debounceTimer = null;
        this.DEBOUNCE_DELAY = 300;

        // Cache original markdown from localStorage
        this.originalMarkdown = this.cacheOriginalMarkdown();
        // Store unsaved changes in memory (per-slide)
        this.unsavedMarkdown = new Map();

        // Initialize slide thumbnails
        this.thumbnails = new SlideThumbnails(deck, controller, elements);

        this.init();
    }

    /**
     * Cache original markdown for all slides
     */
    cacheOriginalMarkdown() {
        const localFile = localStorage.getItem("webdeck_local_file");
        if (!localFile) return [];

        try {
            const parser = new MarkdownParser();
            return parser.splitSlides(localFile);
        } catch (error) {
            console.error('Failed to cache markdown:', error);
            return [];
        }
    }

    /**
     * Initialize the edit controller
     */
    init() {
        // Set up edit mode toggle
        if (this.elements.toggleEditModeBtn) {
            this.elements.toggleEditModeBtn.addEventListener('click', () => this.toggleEditMode());
        }

        // Set up editor input listener
        if (this.elements.markdownEditor) {
            this.elements.markdownEditor.addEventListener('input', () => this.onEditorInput());
        }

        // Listen for slide navigation events
        this.controller.addEventListener('slidechange', () => {
            this.currentSlideIndex = this.controller.currentIndex;
            this.loadSlideIntoEditor();
            this.updateSlideIndicator();
        });

        // Listen for deck replacement events
        this.controller.addEventListener('deckchange', (data) => {
            this.deck = data.deck;
            this.originalMarkdown = this.cacheOriginalMarkdown();
            // Clear unsaved changes when a new file is loaded
            this.unsavedMarkdown.clear();
            this.hasUnsavedChanges = false;
            this.updateSaveButton();
            this.currentSlideIndex = this.controller.currentIndex;
            this.loadSlideIntoEditor();
            this.updateSlideIndicator();
        });

        // Set up save button
        if (this.elements.saveSlideBtn) {
            this.elements.saveSlideBtn.addEventListener('click', () => this.saveChanges());
        }

        // Set up add slide button - show layout picker
        if (this.elements.addSlideBtn) {
            this.elements.addSlideBtn.addEventListener('click', () => this.showLayoutPicker());
        }

        // Set up delete slide button
        if (this.elements.deleteSlideBtn) {
            this.elements.deleteSlideBtn.addEventListener('click', () => this.deleteSlide());
        }

        // Initialize layout picker modal
        LayoutPicker.initModal();

        // Render initial thumbnails
        this.thumbnails.render();
    }

    /**
     * Toggle edit mode on/off
     */
    toggleEditMode() {
        this.isEditMode = !this.isEditMode;

        if (this.isEditMode) {
            this.elements.editorPanel?.classList.remove('webdeck-hidden');
            this.elements.presenterPanel?.classList.add('webdeck-hidden');
            this.elements.toggleEditModeBtn.classList.add('btn--active');
            this.elements.toggleEditModeBtn.textContent = 'Exit Edit';
            this.loadSlideIntoEditor();
        } else {
            this.elements.editorPanel?.classList.add('webdeck-hidden');

            // Restore presenter panel visibility based on presenter role
            if (this.controller.isPresenterWindow) {
                this.elements.presenterPanel?.classList.remove('webdeck-hidden');
            }

            this.elements.toggleEditModeBtn.classList.remove('btn--active');
            this.elements.toggleEditModeBtn.textContent = 'Edit Mode';

            // Discard unsaved changes when exiting edit mode
            if (this.hasUnsavedChanges) {
                this.hasUnsavedChanges = false;
                this.updateSaveButton();
            }
        }
    }

    /**
     * Load the current slide's markdown into the editor
     */
    loadSlideIntoEditor() {
        if (!this.isEditMode || !this.elements.markdownEditor) return;

        // Get markdown - first check unsaved changes, then fall back to original
        const markdown = this.unsavedMarkdown.get(this.currentSlideIndex) ??
                         this.originalMarkdown[this.currentSlideIndex] ??
                         '';

        this.elements.markdownEditor.value = markdown;
        // Don't reset hasUnsavedChanges - if there are unsaved changes, keep the flag
        this.updateSaveButton();
    }

    /**
     * Handle editor input events
     */
    onEditorInput() {
        // Save current editor content to unsaved cache
        this.unsavedMarkdown.set(this.currentSlideIndex, this.elements.markdownEditor.value);

        // Check if there are any unsaved changes across all slides
        this.updateUnsavedChangesFlag();

        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.updatePreview(), this.DEBOUNCE_DELAY);
    }

    /**
     * Update the hasUnsavedChanges flag based on whether any slide has unsaved changes
     */
    updateUnsavedChangesFlag() {
        const hasUnsaved = this.unsavedMarkdown.size > 0;
        this.hasUnsavedChanges = hasUnsaved;
        this.updateSaveButton();
    }

    /**
     * Update the preview with the edited markdown
     */
    async updatePreview() {
        const markdown = this.elements.markdownEditor.value;

        try {
            await AssetLoader.ensureMarkdownItLoaded();
            const parser = new MarkdownParser();

            // Parse fragment
            const fullDeckData = parser.parseDeckMarkdown(markdown);

            // Handle case where parsing produces no slides
            if (!fullDeckData.slides || fullDeckData.slides.length === 0) {
                Notification.warning('Invalid markdown: Unable to generate slide from current content');
                return;
            }

            const slideData = fullDeckData.slides[0];

            // Update the current slide in the deck object
            this.deck.slides[this.currentSlideIndex] = slideData;

            // Update thumbnail title if it changed
            this.thumbnails.updateThumbnailTitle(this.currentSlideIndex, slideData.title);

            // Find and replace the DOM element
            const allSlides = document.querySelectorAll('.slide');
            const slideEl = allSlides[this.currentSlideIndex];

            if (slideEl) {
                const newSlideEl = SlideRenderer.createSlideElement(
                    this.deck,
                    slideData,
                    this.currentSlideIndex,
                    true
                );
                slideEl.replaceWith(newSlideEl);

                // Re-enhance the new slide content (D2, Prism, etc.)
                ContentEnhancer.enhanceRenderedContent(newSlideEl).catch(err => {
                    console.warn("Failed to enhance slide preview:", err);
                });
            }
        } catch (error) {
            console.error('Failed to update preview:', error);
            Notification.error('Failed to parse markdown: ' + (error.message || 'Unknown error'));
        }
    }

    /**
     * Update the save button state
     */
    updateSaveButton() {
        if (this.elements.saveSlideBtn) {
            this.elements.saveSlideBtn.disabled = !this.hasUnsavedChanges;
        }
    }

    /**
     * Update the slide indicator (e.g., "1 / 5")
     */
    updateSlideIndicator() {
        const indicator = document.querySelector('.editor__body-header .slide-indicator');
        if (indicator) {
            const current = this.currentSlideIndex + 1;
            const total = this.deck.slides.length;
            indicator.textContent = `${current} / ${total}`;
        }
    }

    /**
     * Save changes to a file using File System Access API (Chrome) or Blob download (Firefox)
     */
    async saveChanges() {
        // Update cached markdown for all slides (including unsaved changes)
        for (let i = 0; i < this.deck.slides.length; i++) {
            if (this.unsavedMarkdown.has(i)) {
                this.originalMarkdown[i] = this.unsavedMarkdown.get(i);
            }
        }

        // Clear unsaved changes after saving
        this.unsavedMarkdown.clear();
        this.hasUnsavedChanges = false;
        this.updateSaveButton();

        try {
            // Reconstruct the full deck markdown
            const fullMarkdown = this.originalMarkdown.join('\n\n---\n\n');

            // Modern browsers (Chrome/Edge)
            if (window.showSaveFilePicker) {
                const fileHandle = await window.showSaveFilePicker({
                    suggestedName: 'deck.md',
                    types: [{
                        description: 'Markdown file',
                        accept: { 'text/markdown': ['.md'] },
                    }, {
                        description: 'Text file',
                        accept: { 'text/plain': ['.txt'] },
                    }],
                });

                if (!fileHandle) return;

                const writable = await fileHandle.createWritable();
                await writable.write(fullMarkdown);
                await writable.close();

                Notification.success('Deck saved successfully!');
            }
            // Fallback for Firefox/Safari
            else {
                const blob = new Blob([fullMarkdown], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'deck.md';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            // Ignore abort errors (user cancelled)
            if (error.name !== 'AbortError') {
                console.error('Failed to save file:', error);
                Notification.error('Failed to save file: ' + (error.message || error));
            }
        }
    }

    /**
     * Add a new slide after the current one
     */
    addSlide() {
        if (this.deck.slides.length === 0) return;

        const currentSlide = this.deck.slides[this.currentSlideIndex];
        const newSlide = {
            id: Date.now(),
            title: 'New Slide',
            notes: '',
            layout: currentSlide.layout || '',
            areas: { main: '<h2>New Slide</h2>\n\nAdd your content here' }
        };

        const insertIndex = this.currentSlideIndex + 1;

        // Update data models
        this.deck.slides.splice(insertIndex, 0, newSlide);
        const newSlideMarkdown = '## New Slide\n\nAdd your content here';
        this.originalMarkdown.splice(insertIndex, 0, newSlideMarkdown);

        // Update UI
        if (this.elements.slideCountEl) {
            this.elements.slideCountEl.textContent = String(this.deck.slides.length);
        }

        if (this.elements.slidesContainer) {
            const newSlideEl = SlideRenderer.createSlideElement(
                this.deck,
                newSlide,
                insertIndex,
                false
            );

            const allSlides = this.elements.slidesContainer.querySelectorAll('.slide');
            if (allSlides[this.currentSlideIndex]) {
                allSlides[this.currentSlideIndex].after(newSlideEl);
            } else {
                this.elements.slidesContainer.appendChild(newSlideEl);
            }
        }

        // Navigate to new slide
        this.controller.goTo(insertIndex);
    }

    /**
     * Delete the current slide
     */
    async deleteSlide() {
        if (this.deck.slides.length <= 1) {
            Notification.warning('Cannot delete the only slide');
            return;
        }

        const confirmed = await Notification.confirm('Are you sure you want to delete this slide?');
        if (!confirmed) {
            return;
        }

        const indexToDelete = this.currentSlideIndex;

        // Remove from data models
        this.deck.slides.splice(indexToDelete, 1);
        this.originalMarkdown.splice(indexToDelete, 1);

        // Update UI
        if (this.elements.slideCountEl) {
            this.elements.slideCountEl.textContent = String(this.deck.slides.length);
        }

        const allSlides = document.querySelectorAll('.slide');
        if (allSlides[indexToDelete]) {
            allSlides[indexToDelete].remove();
        }

        // Navigate
        const newIndex = Math.max(0, indexToDelete - 1);
        this.controller.goTo(newIndex);

        // Clear unsaved map since indices shifted
        this.unsavedMarkdown.clear();
        this.hasUnsavedChanges = false;
        this.updateSaveButton();

        // Refresh thumbnails after deleting slide
        this.thumbnails.refresh();
        this.updateSlideIndicator();
    }

    /**
     * Show the layout picker modal
     */
    showLayoutPicker() {
        LayoutPicker.show((layoutName) => this.addSlideWithLayout(layoutName));
    }

    /**
     * Add a new slide with the selected layout
     */
    addSlideWithLayout(layoutName) {
        if (this.deck.slides.length === 0) return;

        const template = LayoutData.getTemplate(layoutName);
        const insertIndex = this.currentSlideIndex + 1;

        try {
            // Parse the template to get slide data
            const parser = new MarkdownParser();
            const deckData = parser.parseDeckMarkdown(template);

            if (!deckData.slides || deckData.slides.length === 0) {
                // Fallback: create basic slide if parsing fails
                const newSlide = {
                    id: Date.now(),
                    title: 'New Slide',
                    notes: '',
                    layout: layoutName,
                    areas: { main: '<h2>New Slide</h2>\n\nAdd your content here' }
                };
                this.deck.slides.splice(insertIndex, 0, newSlide);
                this.originalMarkdown.splice(insertIndex, 0, template);
            } else {
                // Use parsed slide from template
                const newSlide = deckData.slides[0];
                this.deck.slides.splice(insertIndex, 0, newSlide);
                this.originalMarkdown.splice(insertIndex, 0, template);
            }

            // Update UI
            if (this.elements.slideCountEl) {
                this.elements.slideCountEl.textContent = String(this.deck.slides.length);
            }

            if (this.elements.slidesContainer) {
                const newSlideEl = SlideRenderer.createSlideElement(
                    this.deck,
                    this.deck.slides[insertIndex],
                    insertIndex,
                    false
                );

                const allSlides = this.elements.slidesContainer.querySelectorAll('.slide');
                if (allSlides[this.currentSlideIndex]) {
                    allSlides[this.currentSlideIndex].after(newSlideEl);
                } else {
                    this.elements.slidesContainer.appendChild(newSlideEl);
                }

                // Enhance the new slide
                ContentEnhancer.enhanceRenderedContent(newSlideEl).catch(err => {
                    console.warn("Failed to enhance new slide:", err);
                });
            }

            // Navigate to new slide and load into editor
            this.controller.goTo(insertIndex);

            // Clear unsaved map since indices shifted, mark new slide as unsaved
            this.unsavedMarkdown.clear();
            this.unsavedMarkdown.set(insertIndex, template);
            this.hasUnsavedChanges = true;
            this.updateSaveButton();

            // Refresh thumbnails after adding slide
            this.thumbnails.refresh();
            this.updateSlideIndicator();

            Notification.success(`Added new slide with "${layoutName}" layout`);
        } catch (error) {
            console.error('Failed to create slide from template:', error);
            Notification.error('Failed to create slide: ' + (error.message || 'Unknown error'));
        }
    }
}