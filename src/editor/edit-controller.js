/**
 * EditController
 * Manages edit mode with side-by-side markdown editor and live preview.
 */
import { MarkdownParser } from "../data/markdown-parser.js";
import { SlideRenderer } from "../renderer/slide-renderer.js";
import { AssetLoader } from "../core/asset-loader.js";
import { Notification } from "../renderer/notification.js";
import { ContentEnhancer } from "../renderer/content-enhancer.js";
import { LayoutPicker } from "./layout-picker.js";
import { LayoutData } from "../data/layout-data.js";
import { LayoutParser } from "../data/layout-parser.js";
import { SlideThumbnails } from "./slide-thumbnails.js";
import { MarkdownEditor } from "./markdown-editor.js";
import { StageScaler } from "../renderer/stage-scaler.js";

export class EditController {
    constructor(deck, controller, elements) {
        this.deck = deck;
        this.controller = controller;
        this.elements = elements;

        this.isEditMode = false;
        this.currentSlideIndex = controller.slideNavigator.currentIndex;
        this.hasUnsavedChanges = false;

        this.markdownEditor = null; // Will be initialized when edit mode is enabled

        // Cache original markdown from localStorage
        this.originalMarkdown = this.cacheOriginalMarkdown();
        // Store unsaved changes in memory (per-slide)
        this.unsavedMarkdown = new Map();
        this.lastDiagnostics = new Map();
        this.editorWarningsEnabled = true;
        this.pendingSlideWarning = '';

        // Initialize slide thumbnails
        this.thumbnails = new SlideThumbnails(deck, controller, elements);

        this.init();
    }

    /**
     * Initialize panel resize functionality
     */
    initPanelResize() {
        const resizeHandle = document.querySelector('.editor__resize-handle');
        const editorPanel = this.elements.editorPanel;

        if (!resizeHandle || !editorPanel) return;

        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        const onMouseDown = (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = editorPanel.offsetWidth;
            resizeHandle.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        };

        const onMouseMove = (e) => {
            if (!isResizing) return;

            const deltaX = e.clientX - startX;
            const newWidth = startWidth + deltaX;

            // Constrain width between min and max
            const minWidth = 300;
            const maxWidth = 800;
            const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

            editorPanel.style.width = constrainedWidth + 'px';
            editorPanel.style.flex = 'none';

            // Re-scale the stage to fit the new available space
            StageScaler.applyStageScale(this.elements);
        };

        const onMouseUp = () => {
            if (!isResizing) return;
            isResizing = false;
            resizeHandle.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        resizeHandle.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
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
        // Set up panel resize functionality
        this.initPanelResize();

        // Set up thumbnails toggle
        if (this.elements.toggleThumbnailsBtn) {
            this.elements.toggleThumbnailsBtn.addEventListener('click', () => this.toggleThumbnails());
        }

        // Set up edit mode toggle
        if (this.elements.toggleEditModeBtn) {
            this.elements.toggleEditModeBtn.addEventListener('click', () => this.toggleEditMode());
        }

        // Listen for slide navigation events
        this.controller.addEventListener('slidechange', () => {
            this.currentSlideIndex = this.controller.slideNavigator.currentIndex;
            this.loadSlideIntoEditor();
        });

        // Listen for deck replacement events
        this.controller.addEventListener('deckchange', (data) => {
            this.deck = data.deck;
            this.originalMarkdown = this.cacheOriginalMarkdown();
            // Clear unsaved changes when a new file is loaded
            this.unsavedMarkdown.clear();
            this.hasUnsavedChanges = false;
            this.updateSaveButton();
            this.currentSlideIndex = this.controller.slideNavigator.currentIndex;
            this.loadSlideIntoEditor();
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

        // Set up duplicate slide button
        if (this.elements.duplicateSlideBtn) {
            this.elements.duplicateSlideBtn.addEventListener('click', () => this.duplicateSlide());
        }

        if (this.elements.toggleMermaidHelperBtn && this.elements.mermaidHelperPanel) {
            this.elements.toggleMermaidHelperBtn.addEventListener('click', () => this.toggleMermaidHelperPanel());
        }

        if (this.elements.mermaidHelperPanel) {
            const templateButtons = this.elements.mermaidHelperPanel.querySelectorAll('[data-mermaid-template]');
            templateButtons.forEach((button) => {
                button.addEventListener('click', () => {
                    const template = button.getAttribute('data-mermaid-template');
                    this.insertMermaidTemplate(template);
                });
            });
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

        // Notify the controller so it can adjust navigation
        this.controller.onEditModeChanged?.();

        if (this.isEditMode) {
            this.elements.editorPanel?.classList.remove('webdeck-hidden');
            this.elements.presenterPanel?.classList.add('webdeck-hidden');
            this.elements.toggleEditModeBtn.classList.add('active');
            document.body.setAttribute('data-edit-mode', 'true');

            // Initialize the markdown editor if not already initialized
            if (!this.markdownEditor && this.elements.markdownEditor) {
                this.markdownEditor = new MarkdownEditor(this.elements.markdownEditor, {
                    onChange: (value) => this.onEditorInput(value),
                    debounceDelay: 300,
                });
            }

            this.loadSlideIntoEditor();
        } else {
            this.elements.editorPanel?.classList.add('webdeck-hidden');
            this.elements.toggleEditModeBtn.classList.remove('active');
            document.body.removeAttribute('data-edit-mode');
            this.hideMermaidHelperPanel();

            // Restore presenter panel visibility based on editor role
            if (this.controller.roleManager.isEditorWindow) {
                this.elements.presenterPanel?.classList.remove('webdeck-hidden');
            }

            // Discard unsaved changes when exiting edit mode
            if (this.hasUnsavedChanges) {
                this.hasUnsavedChanges = false;
                this.updateSaveButton();
            }
        }

        // Re-scale the stage to fit the new layout after toggling edit mode
        setTimeout(() => StageScaler.applyStageScale(this.elements), 50);
    }

    toggleMermaidHelperPanel() {
        if (!this.elements.mermaidHelperPanel || !this.elements.toggleMermaidHelperBtn) return;
        const isHidden = this.elements.mermaidHelperPanel.classList.toggle('webdeck-hidden');
        this.elements.mermaidHelperPanel.setAttribute('aria-hidden', String(isHidden));
        this.elements.toggleMermaidHelperBtn.setAttribute('aria-expanded', String(!isHidden));
        this.elements.toggleMermaidHelperBtn.classList.toggle('active', !isHidden);
    }

    hideMermaidHelperPanel() {
        if (!this.elements.mermaidHelperPanel || !this.elements.toggleMermaidHelperBtn) return;
        this.elements.mermaidHelperPanel.classList.add('webdeck-hidden');
        this.elements.mermaidHelperPanel.setAttribute('aria-hidden', 'true');
        this.elements.toggleMermaidHelperBtn.setAttribute('aria-expanded', 'false');
        this.elements.toggleMermaidHelperBtn.classList.remove('active');
    }

    insertMermaidTemplate(templateName) {
        if (!this.markdownEditor) return;

        const templates = {
            flowchart: "```mermaid\nflowchart TD\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Do the thing]\n    B -->|No| D[Stop]\n```\n",
            generic: "```mermaid\nflowchart LR\n    A[Step one] --> B[Step two]\n    B --> C[Step three]\n```\n",
            sequence: "```mermaid\nsequenceDiagram\n    participant A as User\n    participant B as Service\n    A->>B: Request\n    B-->>A: Response\n```\n",
            class: "```mermaid\nclassDiagram\n    class SlideDeck {\n        +title\n        +render()\n    }\n    class Slide {\n        +layout\n        +areas\n    }\n    SlideDeck --> Slide\n```\n",
            state: "```mermaid\nstateDiagram-v2\n    [*] --> Draft\n    Draft --> Review\n    Review --> Published\n    Published --> [*]\n```\n",
            gantt: "```mermaid\ngantt\n    title Project Timeline\n    dateFormat  YYYY-MM-DD\n    section Prep\n    Draft content      :a1, 2025-01-01, 2025-01-07\n    Review             :a2, 2025-01-08, 2025-01-12\n    section Delivery\n    Finalize slides    :a3, 2025-01-13, 2025-01-16\n```\n",
        };

        const snippet = templates[templateName] || templates.flowchart;
        this.markdownEditor.insertText(snippet);
        this.markdownEditor.focus();
    }

    /**
     * Toggle slides preview collapse/expand
     */
    toggleThumbnails() {
        const thumbnailsContainer = document.querySelector('.editor__thumbnails');
        const toggleBtn = this.elements.toggleThumbnailsBtn;

        if (thumbnailsContainer && toggleBtn) {
            const isCollapsed = thumbnailsContainer.classList.toggle('collapsed');
            toggleBtn.setAttribute('aria-label', isCollapsed ? 'Expand slides' : 'Collapse slides');
            toggleBtn.setAttribute('title', isCollapsed ? 'Expand slides' : 'Collapse slides');
        }
    }

    /**
     * Load the current slide's markdown into the editor
     */
    loadSlideIntoEditor() {
        if (!this.isEditMode || !this.markdownEditor) return;

        // Get markdown - first check unsaved changes, then fall back to original
        const markdown = this.unsavedMarkdown.get(this.currentSlideIndex) ??
            this.originalMarkdown[this.currentSlideIndex] ??
            '';

        this.markdownEditor.setValue(markdown, { suppressOnChange: true });
        // Don't reset hasUnsavedChanges - if there are unsaved changes, keep the flag
        this.updateSaveButton();
        this.refreshAreaGuides();
    }

    /**
     * Handle editor input events
     */
    onEditorInput(value) {
        // Save current editor content to unsaved cache
        this.unsavedMarkdown.set(this.currentSlideIndex, value);

        // Check if there are any unsaved changes across all slides
        this.updateUnsavedChangesFlag();

        // Update preview
        this.updatePreview();
    }

    /**
     * Update the hasUnsavedChanges flag based on whether any slide has unsaved changes
     */
    updateUnsavedChangesFlag() {
        const hasUnsaved = this.unsavedMarkdown.size > 0;
        this.hasUnsavedChanges = hasUnsaved;
        this.updateSaveButton();
    }

    getSlideElementByIndex(index) {
        const slidesContainer = document.getElementById('slidesContainer');
        if (!slidesContainer) return null;
        const allSlides = slidesContainer.querySelectorAll(':scope > .slide');
        return allSlides[index] || null;
    }

    showEditorWarning(key, message, duration = 2500) {
        if (!this.editorWarningsEnabled) return;
        const now = Date.now();
        const last = this.lastDiagnostics.get(key) || 0;
        if (now - last < 3000) return;
        this.lastDiagnostics.set(key, now);
        this.pendingSlideWarning = message;
    }

    showSlideWarning(message) {
        const slideEl = this.getSlideElementByIndex(this.currentSlideIndex);
        if (!slideEl) return;

        let banner = slideEl.querySelector(':scope > .editor-slide-warning');
        if (!banner) {
            banner = document.createElement('div');
            banner.className = 'editor-slide-warning';
            slideEl.appendChild(banner);
        }

        banner.textContent = message;
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'polite');
    }

    clearSlideWarning() {
        const slideEl = this.getSlideElementByIndex(this.currentSlideIndex);
        if (!slideEl) return;
        const banner = slideEl.querySelector(':scope > .editor-slide-warning');
        if (banner) banner.remove();
    }

    applyPendingSlideWarning(targetSlideEl = null) {
        if (!this.pendingSlideWarning) return;
        const slideEl = targetSlideEl || this.getSlideElementByIndex(this.currentSlideIndex);
        if (!slideEl) return;

        let banner = slideEl.querySelector(':scope > .editor-slide-warning');
        if (!banner) {
            banner = document.createElement('div');
            banner.className = 'editor-slide-warning';
            slideEl.appendChild(banner);
        }

        banner.textContent = this.pendingSlideWarning;
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'polite');
    }


    applyAreaGuides(slideEl, slideData) {
        if (!this.isEditMode || !slideEl) return;

        const areaEls = slideEl.querySelectorAll('.slide__area');
        areaEls.forEach(areaEl => {
            const name = areaEl.style.gridArea || areaEl.dataset.areaName || 'main';
            areaEl.dataset.areaName = name;

            let label = areaEl.querySelector(':scope > .editor-area-label');
            if (!label) {
                label = document.createElement('button');
                label.type = 'button';
                label.className = 'editor-area-label';
                areaEl.prepend(label);
            }

            label.textContent = `@${name}`;
            label.setAttribute('title', `Click to jump to @${name}`);
            label.onclick = (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.navigateToArea(name);
            };
        });

        if (slideData?.layout) {
            slideEl.dataset.layoutName = slideData.layout;
        }
    }

    updateAreaOverflow(slideEl) {
        if (!this.isEditMode || !slideEl) return;
        const areas = slideEl.querySelectorAll('.slide__area');
        areas.forEach(area => {
            const label = area.querySelector(':scope > .editor-area-label');
            const verticalOverflow = area.scrollHeight - area.clientHeight > 6;
            const horizontalOverflow = area.scrollWidth - area.clientWidth > 6;
            const isOverflowing = verticalOverflow || horizontalOverflow;

            area.classList.toggle('editor-area-overflow', isOverflowing);
            if (label) {
                label.dataset.overflow = isOverflowing ? '1' : '0';
                label.setAttribute('aria-label', isOverflowing
                    ? `@${area.dataset.areaName} is overflowing`
                    : `@${area.dataset.areaName}`);
            }
        });
    }

    refreshAreaGuides() {
        if (!this.isEditMode) return;
        const slideEl = this.getSlideElementByIndex(this.currentSlideIndex);
        const slideData = this.deck?.slides?.[this.currentSlideIndex];
        if (!slideEl || !slideData) return;

        this.applyAreaGuides(slideEl, slideData);
        requestAnimationFrame(() => this.updateAreaOverflow(slideEl));
    }

    navigateToArea(areaName) {
        if (!this.markdownEditor) return;

        const name = String(areaName || '').trim().toLowerCase();
        if (!name) return;

        const markdown = this.markdownEditor.getValue();
        const regex = new RegExp(`^\\s*@${name}\\s*$`, 'mi');
        const match = regex.exec(markdown);

        if (match) {
            const cursorPosition = match.index + match[0].length;
            this.markdownEditor.setValueWithCursor(markdown, cursorPosition, { suppressOnChange: true, scrollIntoView: true });
            this.markdownEditor.focus();
            return;
        }

        const spacer = markdown.endsWith('\n') ? '' : '\n';
        const addition = `${spacer}\n@${name}\n`;
        const updated = `${markdown}${addition}`;
        const cursorPosition = updated.length;
        this.markdownEditor.setValueWithCursor(updated, cursorPosition, { suppressOnChange: true, scrollIntoView: true });
        this.onEditorInput(updated);
    }

    /**
     * Update the preview with the edited markdown
     */
    async updatePreview() {
        const markdown = this.markdownEditor?.getValue() ?? '';
        this.clearSlideWarning();
        this.pendingSlideWarning = '';

        try {
            await AssetLoader.ensureMarkdownItLoaded();
            const parser = new MarkdownParser();

            const slideCount = parser.splitSlides(markdown).length;
            if (slideCount > 1) {
                this.showEditorWarning(
                    'multi-slide-preview',
                    'This editor previews a single slide. Split slides with --- in the full deck, not inside the editor.'
                );
            }

            // Parse fragment
            const fullDeckData = parser.parseDeckMarkdown(markdown);

            // Handle case where parsing produces no slides
            if (!fullDeckData.slides || fullDeckData.slides.length === 0) {
                Notification.warning('Invalid markdown: Unable to generate slide from current content');
                return;
            }

            const slideData = fullDeckData.slides[0];

            const layoutSpec = (slideData.layout || '').trim();
            const layoutKey = layoutSpec.toLowerCase();
            const looksLikeGridSpec = /["']/.test(layoutSpec) || layoutSpec.includes('/');
            if (layoutSpec && !looksLikeGridSpec && !LayoutData.hasLayout(layoutKey)) {
                this.showEditorWarning(
                    `unknown-layout-${layoutKey}`,
                    `Unknown layout "${layoutSpec}". Pick a preset or use a full grid template.`
                );
            }

            const areaNames = Object.keys(slideData.areas || {});
            const resolvedLayout = LayoutParser.resolvePreset(layoutSpec);
            const layoutInfo = LayoutParser.parse(resolvedLayout, {
                fallbackAreas: areaNames.length ? areaNames : ["main"],
            });
            const layoutAreas = layoutInfo.orderedAreas || [];

            if (areaNames.length) {
                const unknownAreas = areaNames.filter(name => !layoutAreas.includes(name));
                if (unknownAreas.length) {
                    this.showEditorWarning(
                        `unknown-areas-${unknownAreas.join('-')}`,
                        `Areas not in layout: ${unknownAreas.map(name => `@${name}`).join(', ')}.`
                    );
                }

                const optionalAreas = ["footer"];
                const missingAreas = layoutAreas.filter(name => !areaNames.includes(name) && !optionalAreas.includes(name));
                if (missingAreas.length) {
                    this.showEditorWarning(
                        `missing-areas-${missingAreas.join('-')}`,
                        `Layout expects: ${missingAreas.map(name => `@${name}`).join(', ')}.`
                    );
                }
            }

            // Update the current slide in the deck object
            this.deck.slides[this.currentSlideIndex] = slideData;

            // Update thumbnail title if it changed
            this.thumbnails.updateThumbnailTitle(this.currentSlideIndex, slideData.title);

            // Find and replace the DOM element
            // Use the slides container to get slides in correct order
            const slidesContainer = document.getElementById('slidesContainer');
            if (!slidesContainer) return;

            const allSlides = slidesContainer.querySelectorAll(':scope > .slide');
            const slideEl = allSlides[this.currentSlideIndex];

            if (slideEl) {
                const wasActive = slideEl.classList.contains('active');
                const newSlideEl = SlideRenderer.createSlideElement(
                    this.deck,
                    slideData,
                    this.currentSlideIndex,
                    wasActive  // Preserve the active state
                );
                slideEl.replaceWith(newSlideEl);

                this.applyPendingSlideWarning(newSlideEl);
                this.applyAreaGuides(newSlideEl, slideData);

                // Re-enhance the new slide content (Mermaid, Prism, etc.)
                ContentEnhancer.enhanceRenderedContent(newSlideEl).then(() => {
                    this.applyAreaGuides(newSlideEl, slideData);
                    requestAnimationFrame(() => this.updateAreaOverflow(newSlideEl));
                }).catch(err => {
                    console.warn("Failed to enhance slide preview:", err);
                });
            } else {
                this.applyPendingSlideWarning();
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
     * Helper: Rebuild unsaved markdown map after slide index changes
     * @param {number} insertAtIndex - The index where a slide was inserted (use -1 for no insert)
     * @param {number} deleteAtIndex - The index where a slide was deleted (use -1 for no delete)
     * @param {number} newSlideIndex - Index of a new slide to mark as unsaved (optional)
     * @param {string} newSlideMarkdown - Markdown for the new slide (optional)
     */
    _rebuildUnsavedMarkdownMap(insertAtIndex = -1, deleteAtIndex = -1, newSlideIndex = -1, newSlideMarkdown = '') {
        const newUnsavedMarkdown = new Map();

        for (const [index, content] of this.unsavedMarkdown) {
            let newIndex = index;

            // Adjust index based on delete
            if (deleteAtIndex >= 0 && index > deleteAtIndex) {
                newIndex = index - 1;
            }

            // Adjust index based on insert (after delete adjustment)
            if (insertAtIndex >= 0 && newIndex >= insertAtIndex) {
                newIndex = newIndex + 1;
            }

            // Skip if this was the deleted slide
            if (deleteAtIndex >= 0 && index === deleteAtIndex) {
                continue;
            }

            newUnsavedMarkdown.set(newIndex, content);
        }

        // Add new slide as unsaved if specified
        if (newSlideIndex >= 0 && newSlideMarkdown) {
            newUnsavedMarkdown.set(newSlideIndex, newSlideMarkdown);
        }

        this.unsavedMarkdown = newUnsavedMarkdown;
        this.hasUnsavedChanges = this.unsavedMarkdown.size > 0;
        this.updateSaveButton();
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
        this.controller.slideNavigator.goTo(insertIndex);
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

        // Navigate: stay on the same index if possible (which now holds what was the next slide)
        // unless deleting the last slide, in which case go to the new last slide
        const newIndex = indexToDelete >= this.deck.slides.length
            ? this.deck.slides.length - 1
            : indexToDelete;
        this.controller.slideNavigator.goTo(newIndex);

        // Rebuild unsaved markdown map with adjusted indices
        this._rebuildUnsavedMarkdownMap(-1, indexToDelete);

        // Mark as unsaved to enable save button for structural change
        if (this.unsavedMarkdown.size === 0) {
            // Add a marker to indicate unsaved structural changes
            this.unsavedMarkdown.set(0, this.originalMarkdown[0] || '');
        }
        this.hasUnsavedChanges = true;
        this.updateSaveButton();

        // Refresh thumbnails after deleting slide
        this.thumbnails.refresh();
    }

    /**
     * Move the current slide up by one position
     */
    moveSlideUp() {
        if (this.currentSlideIndex <= 0) {
            Notification.warning('Cannot move the first slide up');
            return;
        }

        const currentIndex = this.currentSlideIndex;
        const targetIndex = currentIndex - 1;

        // Swap in data models
        // Swap deck.slides
        [this.deck.slides[currentIndex], this.deck.slides[targetIndex]] =
            [this.deck.slides[targetIndex], this.deck.slides[currentIndex]];
        // Swap originalMarkdown
        [this.originalMarkdown[currentIndex], this.originalMarkdown[targetIndex]] =
            [this.originalMarkdown[targetIndex], this.originalMarkdown[currentIndex]];

        // Get the DOM elements
        const allSlides = this.elements.slidesContainer.querySelectorAll('.slide');
        const currentSlideEl = allSlides[currentIndex];
        const targetSlideEl = allSlides[targetIndex];

        if (currentSlideEl && targetSlideEl) {
            // Swap DOM elements
            const currentClone = currentSlideEl.cloneNode(true);
            const targetClone = targetSlideEl.cloneNode(true);

            targetSlideEl.replaceWith(currentClone);
            currentSlideEl.replaceWith(targetClone);

            // Update active class
            targetClone.classList.remove('active');
            currentClone.classList.add('active');
        }

        // Rebuild unsaved markdown map - just swap the two indices
        const newUnsavedMarkdown = new Map();
        for (const [index, content] of this.unsavedMarkdown) {
            if (index === currentIndex) {
                newUnsavedMarkdown.set(targetIndex, content);
            } else if (index === targetIndex) {
                newUnsavedMarkdown.set(currentIndex, content);
            } else {
                newUnsavedMarkdown.set(index, content);
            }
        }
        this.unsavedMarkdown = newUnsavedMarkdown;
        this.hasUnsavedChanges = true;
        this.updateSaveButton();

        // Navigate to the new position
        this.controller.slideNavigator.goTo(targetIndex);

        // Refresh thumbnails after moving slide
        this.thumbnails.refresh();

        Notification.success('Slide moved up');
    }

    /**
     * Move the current slide down by one position
     */
    moveSlideDown() {
        if (this.currentSlideIndex >= this.deck.slides.length - 1) {
            Notification.warning('Cannot move the last slide down');
            return;
        }

        const currentIndex = this.currentSlideIndex;
        const targetIndex = currentIndex + 1;

        // Swap in data models
        // Swap deck.slides
        [this.deck.slides[currentIndex], this.deck.slides[targetIndex]] =
            [this.deck.slides[targetIndex], this.deck.slides[currentIndex]];
        // Swap originalMarkdown
        [this.originalMarkdown[currentIndex], this.originalMarkdown[targetIndex]] =
            [this.originalMarkdown[targetIndex], this.originalMarkdown[currentIndex]];

        // Get the DOM elements
        const allSlides = this.elements.slidesContainer.querySelectorAll('.slide');
        const currentSlideEl = allSlides[currentIndex];
        const targetSlideEl = allSlides[targetIndex];

        if (currentSlideEl && targetSlideEl) {
            // Swap DOM elements
            const currentClone = currentSlideEl.cloneNode(true);
            const targetClone = targetSlideEl.cloneNode(true);

            targetSlideEl.replaceWith(currentClone);
            currentSlideEl.replaceWith(targetClone);

            // Update active class
            targetClone.classList.remove('active');
            currentClone.classList.add('active');
        }

        // Rebuild unsaved markdown map - just swap the two indices
        const newUnsavedMarkdown = new Map();
        for (const [index, content] of this.unsavedMarkdown) {
            if (index === currentIndex) {
                newUnsavedMarkdown.set(targetIndex, content);
            } else if (index === targetIndex) {
                newUnsavedMarkdown.set(currentIndex, content);
            } else {
                newUnsavedMarkdown.set(index, content);
            }
        }
        this.unsavedMarkdown = newUnsavedMarkdown;
        this.hasUnsavedChanges = true;
        this.updateSaveButton();

        // Navigate to the new position
        this.controller.slideNavigator.goTo(targetIndex);

        // Refresh thumbnails after moving slide
        this.thumbnails.refresh();

        Notification.success('Slide moved down');
    }

    /**
     * Duplicate the current slide
     */
    async duplicateSlide() {
        const sourceIndex = this.currentSlideIndex;
        const insertIndex = sourceIndex + 1;

        // Get the markdown for the current slide (prefer unsaved changes)
        const markdown = this.unsavedMarkdown.get(sourceIndex) ??
            this.originalMarkdown[sourceIndex] ?? '';

        if (!markdown) {
            Notification.warning('Cannot duplicate empty slide');
            return;
        }

        // Parse the markdown to get slide data
        try {
            await AssetLoader.ensureMarkdownItLoaded();
            const parser = new MarkdownParser();
            const deckData = parser.parseDeckMarkdown(markdown);

            if (!deckData.slides || deckData.slides.length === 0) {
                Notification.warning('Failed to parse slide for duplication');
                return;
            }

            // Create a copy of the slide with a new ID
            const newSlide = { ...deckData.slides[0], id: Date.now() };

            // Update data models
            this.deck.slides.splice(insertIndex, 0, newSlide);
            this.originalMarkdown.splice(insertIndex, 0, markdown);

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
                if (allSlides[sourceIndex]) {
                    allSlides[sourceIndex].after(newSlideEl);
                } else {
                    this.elements.slidesContainer.appendChild(newSlideEl);
                }

                // Enhance the new slide
                ContentEnhancer.enhanceRenderedContent(newSlideEl).catch(err => {
                    console.warn("Failed to enhance duplicated slide:", err);
                });
            }

            // Rebuild unsaved markdown map with adjusted indices
            this._rebuildUnsavedMarkdownMap(insertIndex, -1, insertIndex, markdown);

            // Navigate to new slide
            this.controller.slideNavigator.goTo(insertIndex);

            // Refresh thumbnails after duplicating slide
            this.thumbnails.refresh();

            Notification.success('Slide duplicated successfully');
        } catch (error) {
            console.error('Failed to duplicate slide:', error);
            Notification.error('Failed to duplicate slide: ' + (error.message || 'Unknown error'));
        }
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
            this.controller.slideNavigator.goTo(insertIndex);

            // Rebuild unsaved markdown map with adjusted indices
            this._rebuildUnsavedMarkdownMap(insertIndex, -1, insertIndex, template);

            // Refresh thumbnails after adding slide
            this.thumbnails.refresh();

            Notification.success(`Added new slide with "${layoutName}" layout`);
        } catch (error) {
            console.error('Failed to create slide from template:', error);
            Notification.error('Failed to create slide: ' + (error.message || 'Unknown error'));
        }
    }
}