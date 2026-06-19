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
import { ImagePicker } from "./image-picker.js";
import { LayoutData } from "../data/layout-data.js";
import { LayoutParser } from "../data/layout-parser.js";
import { SlideThumbnails } from "./slide-thumbnails.js";
import { MarkdownEditor } from "./markdown-editor.js";
import { DirectoryHandleStore } from "../core/directory-handle-store.js";
import { DeckImagesResolver } from "./deck-images-resolver.js";
import { StageScaler } from "../renderer/stage-scaler.js";
import { attachGridResizer, buildLayoutSpec, updateLayoutDirective } from "./grid-resizer.js";

export class EditController {
    constructor(deck, controller, elements) {
        this.deck = deck;
        this.controller = controller;
        this.elements = elements;

        this.isEditMode = false;
        this.currentSlideIndex = controller.slideNavigator.currentIndex;
        this.hasUnsavedChanges = false;

        this.markdownEditor = null; // Will be initialized when edit mode is enabled

        // Cached directory handle for saving images next to the deck file (FS API)
        this.deckDirectoryHandle = null;

        // Cache original markdown from localStorage
        this.originalMarkdown = this.cacheOriginalMarkdown();
        // Store unsaved changes in memory (per-slide)
        this.unsavedMarkdown = new Map();
        this.lastDiagnostics = new Map();
        this.editorWarningsEnabled = true;
        this.pendingSlideWarning = '';
        this.placeholderDialogEl = null;

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

        // Insert dropdown (Layout / Image / Mermaid)
        this.initInsertDropdown();

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

        // Initialize image picker modal
        ImagePicker.init();

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
            this.placeholderDialogEl?.remove();
            this.placeholderDialogEl = null;

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

    initInsertDropdown() {
        const btn = this.elements.insertDropdownBtn;
        const content = this.elements.insertDropdownContent;
        if (!btn || !content) return;

        // Toggle dropdown on button click
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = !content.classList.contains('webdeck-hidden');
            content.classList.toggle('webdeck-hidden');
            btn.setAttribute('aria-expanded', String(!isOpen));
        });

        // Dropdown item actions
        content.querySelectorAll('[data-insert-action]').forEach((item) => {
            item.addEventListener('click', () => {
                content.classList.add('webdeck-hidden');
                btn.setAttribute('aria-expanded', 'false');
                const action = item.dataset.insertAction;
                if (action === 'layout') {
                    this.showLayoutPickerForCurrentSlide();
                } else if (action === 'image') {
                    this.pickAndInsertImage();
                } else if (action === 'mermaid') {
                    this.toggleMermaidHelperPanel();
                }
            });
        });

        // Close on outside click
        document.addEventListener('click', () => {
            content.classList.add('webdeck-hidden');
            btn.setAttribute('aria-expanded', 'false');
        });
    }

    toggleMermaidHelperPanel() {
        if (!this.elements.mermaidHelperPanel) return;
        const isHidden = this.elements.mermaidHelperPanel.classList.toggle('webdeck-hidden');
        this.elements.mermaidHelperPanel.setAttribute('aria-hidden', String(isHidden));
    }

    hideMermaidHelperPanel() {
        if (!this.elements.mermaidHelperPanel) return;
        this.elements.mermaidHelperPanel.classList.add('webdeck-hidden');
        this.elements.mermaidHelperPanel.setAttribute('aria-hidden', 'true');
    }

    insertMermaidTemplate(templateName) {
        if (!this.markdownEditor) return;

        const templates = {
            flowchart: "```mermaid\nflowchart TD\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Do the thing]\n    B -->|No| D[Stop]\n```\n",
            erDiagram: "```mermaid\nerDiagram\n    CUSTOMER ||--o{ ORDER : places\n    ORDER ||--|{ LINE_ITEM : contains\n    PRODUCT ||--o{ LINE_ITEM : includes\n    CUSTOMER {\n        string name\n        string email\n    }\n    ORDER {\n        string id\n        date orderDate\n    }\n    PRODUCT {\n        string sku\n        string title\n    }\n```\n",
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
        if (now - last < duration) return;
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
        requestAnimationFrame(() => {
            this.updateAreaOverflow(slideEl);
            this.attachGridResizerForSlide(slideEl, slideData);
        });
    }

    attachGridResizerForSlide(slideEl, slideData) {
        if (!slideEl || !slideData) return;

        const layoutSpec = (slideData.layout || '').trim();
        const resolvedLayout = LayoutParser.resolvePreset(layoutSpec);
        const areaNames = Object.keys(slideData.areas || {});
        const layoutInfo = LayoutParser.parse(resolvedLayout, {
            fallbackAreas: areaNames.length ? areaNames : ["main"],
        });

        attachGridResizer(
            slideEl,
            layoutInfo,
            this.elements.deckStage,
            (change) => this._onGridResize(change, layoutInfo)
        );
    }

    navigateToArea(areaName) {
        if (!this.markdownEditor) return;

        const name = String(areaName || '').trim().toLowerCase();
        if (!name) return;

        const markdown = this.markdownEditor.getValue();
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`^\\s*@${escapedName}\\s*$`, 'mi');
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

                // Rewrite `images/foo.png` srcs to blob URLs the browser can
                // render in the preview (since the deck file lives outside
                // the project root, the dev server can't serve them).
                DeckImagesResolver.rewriteImgSrcs(newSlideEl).catch((err) => {
                    console.warn('Image rewrite failed:', err);
                });

                const attachPreviewOverlays = () => {
                    // Attach overlays after paint so layout geometry is measurable.
                    requestAnimationFrame(() => {
                        this.updateAreaOverflow(newSlideEl);
                        this.attachGridResizerForSlide(newSlideEl, slideData);
                    });
                };

                // Re-enhance the new slide content (Mermaid, Prism, etc.)
                ContentEnhancer.enhanceRenderedContent(newSlideEl).then(() => {
                    this.applyAreaGuides(newSlideEl, slideData);
                    // Re-rewrite after enhancement (which may inject more imgs).
                    DeckImagesResolver.rewriteImgSrcs(newSlideEl).catch(() => { });
                }).catch(err => {
                    console.warn("Failed to enhance slide preview:", err);
                }).finally(() => {
                    attachPreviewOverlays();
                });
            } else {
                this.applyPendingSlideWarning();
            }
        } catch (error) {
            console.error('Failed to update preview:', error);
            Notification.error('Failed to parse markdown: ' + (error.message || 'Unknown error'));
        }
    }

    // ─── Grid Resizer ───────────────────────────────────────────────────────────

    /**
     * Called by GridResizer when the user finishes dragging a column or row handle.
     * Writes the new proportions back into the editor markdown as a custom grid spec.
     *
     * @param {{ cols: string|null, rows: string|null }} change
     * @param {object} layoutInfo - The `LayoutParser.parse()` result before the drag.
     */
    _onGridResize(change, layoutInfo) {
        if (!this.markdownEditor) return;
        const newSpec = buildLayoutSpec(layoutInfo, change.cols, change.rows);
        const markdown = this.markdownEditor.getValue();
        const newMarkdown = updateLayoutDirective(markdown, newSpec);
        this.markdownEditor.setValue(newMarkdown, { suppressOnChange: false });
    }

    _getAreaAtCursor(markdown, position) {
        const text = String(markdown || '').replace(/\r\n?/g, '\n');
        const lines = text.split('\n');
        const markerRegex = /^\s*@([a-zA-Z_][a-zA-Z0-9_-]*)\s*$/;

        let currentArea = 'main';
        let currentOffset = 0;

        for (const line of lines) {
            const match = line.match(markerRegex);
            if (match) {
                if (position >= currentOffset) {
                    currentArea = match[1].toLowerCase();
                }
            }
            currentOffset += line.length + 1;
        }
        return currentArea;
    }

    buildPlaceholderSnippet(config) {
        const label = String(config?.label || 'Image').replace(/"/g, '&quot;');
        const width = config?.widthValue !== undefined ? `${config.widthValue}${config.widthUnit}` : '80%';
        const height = config?.heightValue !== undefined ? `${config.heightValue}${config.heightUnit}` : '220px';

        return [
            ``,
            `<img src="images/placeholder.svg" alt="${label}" style="width: ${width}; height: ${height}; display: block; margin: 10px auto; border-radius: 8px;" />`,
            ``
        ].join('\n');
    }

    async pickAndInsertImage() {
        if (!this.markdownEditor) return;

        // Resolve the deck directory so the picker reads & writes images
        // next to the user's .md file (not the project images/ folder).
        // This is cached + persisted after the first call so it only prompts once.
        const deckDirHandle = await this._resolveDeckDirectoryHandle();

        // Tell the preview resolver where the deck folder lives, so images
        // referenced as `images/foo.png` in the slide preview render via
        // blob URLs the browser can load.
        DeckImagesResolver.setDeckDir(deckDirHandle, this.deckDirMode);

        // Open the image picker modal — three tabs: existing images,
        // upload new file, or paste a URL/local path.
        ImagePicker.show(
            (snippet) => {
                const current = this.markdownEditor.getValue();
                const selection = this.markdownEditor.getSelection?.() || { from: 0, to: 0 };
                // Always wrap the snippet with blank lines so it stands
                // alone as a block — required for markdown to render a
                // raw <img> tag as a block element rather than inline text.
                // We do this with exactly "\n\n<snippet>\n\n" and let the
                // surrounding text's existing newlines decide whether to
                // collapse the boundary (the markdown parser treats multiple
                // blank lines as one).
                const isAtStart = selection.from === 0;
                const isAtEnd = selection.from >= current.length;
                const prevChar = isAtStart ? '\n' : current[selection.from - 1];
                const nextChar = isAtEnd ? '\n' : current[selection.from];

                // Add at minimum one "\n" before; if the previous char isn't
                // already a newline, prepend an extra one for a blank line.
                const before = prevChar === '\n' ? '' : '\n\n';
                // Always append "\n\n" after — ensures a blank line follows.
                // If we're at end-of-doc, no need to add trailing newlines.
                const after = isAtEnd ? '' : (nextChar === '\n' ? '\n' : '\n\n');

                // Avoid leading blank line at the very start of the file.
                const leadTrim = isAtStart ? before.replace(/^\n+/, '') : before;

                this.markdownEditor.replaceRange(
                    selection.from,
                    selection.from,
                    `${leadTrim}${snippet}${after}`
                );
                this.markdownEditor.focus();
            },
            {
                deckDirHandle,
                deckDirMode: this.deckDirMode,
                onChangeFolder: async () => {
                    await this.clearDeckDirectoryHandle();
                    const next = await this._resolveDeckDirectoryHandle();
                    if (next) DeckImagesResolver.setDeckDir(next, this.deckDirMode);
                    return next ? { handle: next, mode: this.deckDirMode } : null;
                },
            }
        );
    }

    /**
     * Resolve the directory where images should be saved — the folder
     * containing the deck .md file.  The handle is persisted in IndexedDB so
     * the user only has to grant it once.
     *
     * @returns {Promise<FileSystemDirectoryHandle|null>}
     */
    async _resolveDeckDirectoryHandle() {
        if (this.deckDirectoryHandle) return this.deckDirectoryHandle;
        if (!window.showDirectoryPicker) return null;

        // 1. Try the previously persisted handle (the user only grants once).
        const { handle: stored, mode } = await DirectoryHandleStore.load();
        if (stored) {
            const perm = await stored.queryPermission({ mode: 'readwrite' });
            if (perm === 'granted' || (await stored.requestPermission({ mode: 'readwrite' })) === 'granted') {
                this.deckDirectoryHandle = stored;
                this._deckDirMode = mode;
                return stored;
            }
        }

        // 2. Prompt the user to pick a folder.  Prefer starting from the
        //    deck file's directory when we have its file handle.
        let startInHint = 'documents';
        try {
            const fileName = localStorage.getItem('webdeck_local_file_name');
            if (fileName) {
                const registry = window.__WEBDECK_FILE_HANDLE_REGISTRY__;
                const fileHandle = registry?.get(fileName);
                if (fileHandle) startInHint = fileHandle;
            }
        } catch (_) { /* ignore */ }

        try {
            const picked = await window.showDirectoryPicker({
                id: 'deck-images',
                mode: 'readwrite',
                startIn: startInHint,
            });

            // Detect mode: does `picked` already contain image files (it's
            // the images folder) or does it contain an `images/` subdirectory
            // (it's the parent)?  Default to "parent".
            const detectedMode = await this._detectDeckDirMode(picked);
            await DirectoryHandleStore.save(picked, detectedMode);
            this.deckDirectoryHandle = picked;
            this._deckDirMode = detectedMode;
            return picked;
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.warn('Could not open deck directory:', err);
            }
            return null;
        }
    }

    /**
     * Inspect a picked directory to decide whether it's the images folder
     * itself or the deck's parent directory.
     *
     *  - Contains an `images` subdirectory          → "parent"
     *  - Contains image files at top level          → "images"
     *  - Otherwise (empty / no matches)             → "parent" (we'll create images/)
     *
     * @param {FileSystemDirectoryHandle} dir
     * @returns {Promise<'parent'|'images'>}
     */
    async _detectDeckDirMode(dir) {
        const IMAGE_RE = /\.(jpe?g|png|gif|webp|svg|avif)$/i;
        try {
            for await (const [name, handle] of dir.entries()) {
                if (handle.kind === 'directory' && name === 'images') return 'parent';
                if (handle.kind === 'file' && IMAGE_RE.test(name)) return 'images';
            }
        } catch (_) { /* ignore */ }
        return 'parent';
    }

    /** Current mode of `_deckDirectoryHandle` ('parent' | 'images' | null). */
    get deckDirMode() {
        return this._deckDirMode || 'parent';
    }

    /**
     * Reset the persisted directory handle — used by the picker's "Change folder" button.
     */
    async clearDeckDirectoryHandle() {
        this.deckDirectoryHandle = null;
        this._deckDirMode = null;
        await DirectoryHandleStore.clear();
    }

    /**
     * Upload an image next to the deck file and return a relative path
     * string for the markdown.
     *
     * The image is always saved via the Vite dev server upload endpoint
     * (into the project's `images/` folder) so the path resolves over
     * HTTP during preview.  If the browser supports the File System
     * Access API, we also write a copy next to the deck file itself,
     * keeping the filesystem folder self-contained for build/export.
     *
     * @param {File} file
     * @returns {Promise<string>} Relative path usable in markdown (e.g. `images/abc.png`)
     */
    async uploadImage(file) {
        // ── Always save via the Vite dev server so images/ is browsable ──
        let serverPath = null;
        try {
            const formData = new FormData();
            formData.append('image', file);

            const response = await fetch('/api/upload-image', {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                const result = await response.json();
                serverPath = result.path; // e.g. "images/1781852391929-e74de50d.png"
            }
        } catch (_) { /* server unavailable */ }

        const relativePath = serverPath || `images/${Date.now()}-${Math.random().toString(36).slice(2, 10)}${(file.name.match(/\.[^.]+$/)?.[0] || '.png')}`;

        // ── Also save next to the deck file via FS Access API ──
        try {
            const dirHandle = await this._resolveDeckDirectoryHandle();
            if (dirHandle) {
                const imagesDir = await dirHandle.getDirectoryHandle('images', { create: true });
                const fileName = relativePath.split('/').pop();
                const fh = await imagesDir.getFileHandle(fileName, { create: true });
                const writable = await fh.createWritable();
                await writable.write(file);
                await writable.close();
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.warn('Could not save image next to deck file:', err);
            }
        }

        return relativePath;
    }

    _resolveAreaInsertPositionByRatio(markdown, areaName, ratioY = 1) {
        const text = String(markdown || '').replace(/\r\n?/g, '\n');
        const range = this._getAreaContentRange(text, areaName);
        const segment = text.slice(range.from, range.to);
        if (!segment.length) return range.from;

        const lines = segment.split('\n');
        const lineIndex = Math.max(0, Math.min(lines.length - 1, Math.floor((Number(ratioY) || 0) * lines.length)));

        let offset = 0;
        for (let i = 0; i < lineIndex; i++) {
            offset += lines[i].length + 1;
        }
        return Math.min(range.to, range.from + offset);
    }

    /**
     * Return the character range for the content inside a named @area block.
     * The range excludes the @area marker line itself and ends at the next area
     * marker or the end of the document.
     */
    _getAreaContentRange(markdown, areaName) {
        const text = String(markdown || '').replace(/\r\n?/g, '\n');
        const lines = text.split('\n');
        const target = String(areaName || 'main').trim().toLowerCase();

        const markerRegex = /^\s*@([a-zA-Z_][a-zA-Z0-9_-]*)\s*$/;
        let areaMarkerIdx = -1;
        let nextMarkerIdx = lines.length;

        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(markerRegex);
            if (!match) continue;
            if (match[1].toLowerCase() === target) {
                areaMarkerIdx = i;
            } else if (areaMarkerIdx >= 0 && i > areaMarkerIdx) {
                nextMarkerIdx = i;
                break;
            }
        }

        // Create the area marker when it does not exist yet.
        if (areaMarkerIdx < 0) {
            return {
                from: text.length,
                to: text.length,
            };
        }

        const lineToChar = (lineIndex) => {
            let pos = 0;
            for (let i = 0; i < lineIndex; i++) {
                pos += lines[i].length + 1;
            }
            return pos;
        };

        return {
            from: lineToChar(areaMarkerIdx + 1),
            to: lineToChar(nextMarkerIdx),
        };
    }

    // ─── Save button ────────────────────────────────────────────────────────────

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

        // Update UI - count only visible slides
        const visibleSlideCount = this.deck.slides.filter(s => !s.hidden).length;
        if (this.elements.slideCountEl) {
            this.elements.slideCountEl.textContent = String(visibleSlideCount);
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

        // Update UI - count only visible slides
        const visibleSlideCount = this.deck.slides.filter(s => !s.hidden).length;
        if (this.elements.slideCountEl) {
            this.elements.slideCountEl.textContent = String(visibleSlideCount);
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

    showLayoutPickerForCurrentSlide() {
        LayoutPicker.show((layoutName) => this.applyLayoutToCurrentSlide(layoutName));
    }

    async applyLayoutToCurrentSlide(layoutName) {
        if (!this.markdownEditor) return;

        const markdown = this.markdownEditor.getValue();
        const warning = this.getLayoutCompatibilityWarning(markdown, layoutName);
        if (warning) {
            const confirmed = await Notification.showModal({
                title: 'Layout may break this slide',
                message: warning,
                buttons: [
                    { label: 'Cancel', isPrimary: false, resolvesTo: false },
                    { label: 'Apply anyway', isPrimary: true, resolvesTo: true },
                ],
                focusPrimary: true,
                closeResolvesTo: false,
            });

            if (!confirmed) return;
        }

        let updatedMarkdown = updateLayoutDirective(markdown, layoutName);

        // Auto-add missing required areas (e.g. @secondary for three-column)
        const parser = new MarkdownParser();
        const currentAreas = parser.parseAreas(updatedMarkdown);
        const resolvedLayout = LayoutParser.parse(LayoutParser.resolvePreset(layoutName), {
            fallbackAreas: Object.keys(currentAreas).length ? Object.keys(currentAreas) : ["main"],
        });
        const requiredAreas = resolvedLayout.orderedAreas || [];

        let appendedContent = '';
        const areaPlaceholders = {
            secondary: '\n@secondary\n\n### Column Three\n\nContent for third column\n',
            media: '\n@media\n\n### Column Two\n\nContent for second column\n',
            sidebar: '\n@sidebar\n\n### Sidebar\n\nSidebar content\n',
            main: '\n@main\n\n### Main Content\n\nContent here\n'
        };

        for (const area of requiredAreas) {
            // Skip title/header checks as they are symmetric
            if (area === 'header' || area === 'title' || area === 'footer') continue;

            if (!currentAreas[area] && areaPlaceholders[area]) {
                appendedContent += areaPlaceholders[area];
            }
        }

        if (appendedContent) {
            updatedMarkdown = updatedMarkdown.trim() + '\n' + appendedContent;
        }

        this.markdownEditor.setValue(updatedMarkdown, { suppressOnChange: false });
        Notification.success(`Layout changed to "${layoutName}"`);
    }

    getLayoutCompatibilityWarning(markdown, layoutName) {
        const currentAreas = this._normalizeAreasForLayout(markdown, layoutName);
        const resolvedLayout = LayoutParser.parse(LayoutParser.resolvePreset(layoutName), {
            fallbackAreas: Object.keys(currentAreas).length ? Object.keys(currentAreas) : ["main"],
        });
        const allowedAreas = new Set(resolvedLayout.orderedAreas);
        const unsupportedAreas = Object.entries(currentAreas)
            .filter(([areaName, content]) => content && !allowedAreas.has(areaName))
            .map(([areaName]) => `@${areaName}`);

        if (!unsupportedAreas.length) return '';

        const renderedList = unsupportedAreas.join(', ');
        return `This layout does not include ${renderedList}. Their content may be moved, hidden, or rendered as extra blocks after the layout change.`;
    }

    _normalizeAreasForLayout(markdown, layoutName) {
        const parser = new MarkdownParser();
        const areas = parser.parseAreas(markdown);
        const resolvedLayout = LayoutParser.parse(LayoutParser.resolvePreset(layoutName), {
            fallbackAreas: Object.keys(areas).length ? Object.keys(areas) : ["main"],
        });

        const allowsTitle = resolvedLayout.orderedAreas.includes('title');
        if (allowsTitle) {
            if (!areas.title && areas.header) {
                areas.title = areas.header;
            }
            delete areas.header;
        } else {
            if (!areas.header && areas.title) {
                areas.header = areas.title;
            }
            delete areas.title;
        }

        return areas;
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