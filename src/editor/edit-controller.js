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
import { LayoutParser } from "../data/layout-parser.js";
import { LayoutData } from "../data/layout-data.js";
import { SlideThumbnails } from "./slide-thumbnails.js";
import { MarkdownEditor } from "./markdown-editor.js";
import { StageScaler } from "../renderer/stage-scaler.js";
import { attachGridResizer, buildLayoutSpec } from "./grid-resizer.js";
import { updateLayoutDirective, updateThemeDirective } from "./directive-utils.js";
import { SlideOperations } from "./slide-operations.js";
import { ImageBackgroundHandler } from "./image-background-handler.js";
import { AreaNavigation } from "./area-navigation.js";
import { ImagePicker } from "./image-picker.js";
import { BackgroundPicker } from "./background-picker.js";
import { DeckImagesResolver } from "./deck-images-resolver.js";
import { ImageInteractionHandler } from "./image-interaction-handler.js";
import { ImagePropertiesPanel } from "./image-properties-panel.js";

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
        this.placeholderDialogEl = null;

        // Initialize slide thumbnails
        this.thumbnails = new SlideThumbnails(deck, controller, elements);

        // Sub-modules extracted to keep this file manageable
        this.slideOps = new SlideOperations(this);
        this.imageBg = new ImageBackgroundHandler(this);
        this.areaNav = new AreaNavigation(this);

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
            ImageInteractionHandler.deactivate();
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
            // Reset the in-memory directory handle cache so the next image
            // insert re-checks permission.  The persisted IndexedDB handle
            // is NOT cleared here — the browser will re-prompt only if
            // permission was revoked, so the user doesn't have to re-pick
            // the same folder every time they load a file.
            this.imageBg.deckDirectoryHandle = null;
            this.imageBg._deckDirMode = null;
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

        // Toggle grid resizer handles on/off
        this._gridResizerVisible = true;
        if (this.elements.toggleGridResizerBtn) {
            this.elements.toggleGridResizerBtn.addEventListener('click', () => this.toggleGridResizer());
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

        // Initialize image picker modal
        ImagePicker.init();

        // Initialize background picker modal
        BackgroundPicker.init();

        // Image interaction — drag/resize
        ImageInteractionHandler.init(
            () => this.markdownEditor?.getValue() ?? '',
            (updated) => {
                this.markdownEditor?.setValue(updated, { suppressOnChange: true });
                this.unsavedMarkdown.set(this.currentSlideIndex, updated);
                this.updateUnsavedChangesFlag();
            },
            {
                onDelete: (updated) => {
                    this.markdownEditor?.setValue(updated, { suppressOnChange: false });
                },
            }
        );
        this._initImagePropertiesPanel();

        // Render initial thumbnails
        this.thumbnails.render();
    }


    /**
     * Toggle edit mode on/off
     */
    toggleEditMode() {
        // Prevent entering edit mode when no file has been loaded
        if (!this.isEditMode && !localStorage.getItem("webdeck_local_file")) {
            Notification.warning("Open a markdown file first to enable the editor");
            return;
        }

        this.isEditMode = !this.isEditMode;

        // Notify the controller so it can adjust navigation
        this.controller.onEditModeChanged?.();

        if (this.isEditMode) {
            this.elements.editorPanel?.classList.remove('webdeck-hidden');
            this.elements.presenterPanel?.classList.add('webdeck-hidden');
            this.elements.toggleEditModeBtn.classList.add('active');
            document.body.setAttribute('data-edit-mode', 'true');

            // Reset grid resizer toggle to visible when entering edit mode
            this._gridResizerVisible = true;
            if (this.elements.toggleGridResizerBtn) {
                this.elements.toggleGridResizerBtn.setAttribute('aria-pressed', 'true');
            }

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
            ImageInteractionHandler.deactivate();
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
                } else if (action === 'background') {
                    this.pickBackground();
                } else if (action === 'theme') {
                    this.toggleSlideTheme();
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
            // Activate image drag/resize on the current slide's grid.  This is
            // needed because updatePreview() (which normally calls activate) is
            // skipped when loadSlideIntoEditor() runs with suppressOnChange —
            // e.g. when entering edit mode or navigating slides.  Without this,
            // existing images can only be moved via keyboard arrows, not dragged
            // or resized.
            const grid = slideEl.querySelector('.slide__grid');
            if (grid) {
                ImageInteractionHandler.activate(grid);
            }
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

        // Respect the grid resizer toggle state
        if (!this._gridResizerVisible) {
            slideEl.querySelectorAll('.grid-resize-handle').forEach((h) => h.style.display = 'none');
        }
    }

    /**
     * Toggle the grid column/row resize handles on all slides.
     */
    toggleGridResizer() {
        this._gridResizerVisible = !this._gridResizerVisible;
        const btn = this.elements.toggleGridResizerBtn;
        if (btn) btn.setAttribute('aria-pressed', String(this._gridResizerVisible));

        const slides = document.querySelectorAll('#slidesContainer > .slide');
        slides.forEach((slide) => {
            slide.querySelectorAll('.grid-resize-handle').forEach((h) => {
                h.style.display = this._gridResizerVisible ? '' : 'none';
            });
        });
    }

    navigateToArea(areaName) {
        this.areaNav.navigateToArea(areaName);
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

                // Rewrite `images/foo.png` srcs and background url()s to blob
                // URLs the browser can render in the preview (since the deck
                // file lives outside the project root, the dev server can't
                // serve them).
                DeckImagesResolver.rewriteImgSrcs(newSlideEl).catch((err) => {
                    console.warn('Image rewrite failed:', err);
                });
                DeckImagesResolver.rewriteBackgroundUrls(newSlideEl).catch((err) => {
                    console.warn('Background image rewrite failed:', err);
                });

                const attachPreviewOverlays = () => {
                    // Attach overlays after paint so layout geometry is measurable.
                    requestAnimationFrame(() => {
                        this.updateAreaOverflow(newSlideEl);
                        this.attachGridResizerForSlide(newSlideEl, slideData);
                        // Re-activate image drag/resize on the new slide element
                        const grid = newSlideEl.querySelector('.slide__grid');
                        if (grid) {
                            ImageInteractionHandler.activate(grid);
                        }
                    });
                };

                // Re-enhance the new slide content (Mermaid, Prism, etc.)
                ContentEnhancer.enhanceRenderedContent(newSlideEl).then(() => {
                    this.applyAreaGuides(newSlideEl, slideData);
                    // Re-rewrite after enhancement (which may inject more imgs).
                    DeckImagesResolver.rewriteImgSrcs(newSlideEl).catch(() => { });
                    DeckImagesResolver.rewriteBackgroundUrls(newSlideEl).catch(() => { });
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
        return this.areaNav.getAreaAtCursor(markdown, position);
    }

    async pickAndInsertImage() {
        return this.imageBg.pickAndInsertImage();
    }

    toggleSlideTheme() {
        if (!this.markdownEditor) return;
        const markdown = this.markdownEditor.getValue();
        const parser = new MarkdownParser();
        const currentTheme = parser.extractDirective(markdown, 'theme').value?.toLowerCase() || '';
        const next = currentTheme === 'dark' ? 'light' : 'dark';
        const updated = updateThemeDirective(markdown, next);
        this.markdownEditor.setValue(updated, { suppressOnChange: false });
        this.deck.slides[this.currentSlideIndex].theme = next;
        this._syncThemeMenuItemIcon(next);
    }

    _syncThemeMenuItemIcon(theme) {
        const btn = document.getElementById('toggleThemeMenuItem');
        if (!btn) return;
        const sunIcon = btn.querySelector('.theme-icon-light');
        const moonIcon = btn.querySelector('.theme-icon-dark');
        if (sunIcon) sunIcon.style.display = theme === 'dark' ? '' : 'none';
        if (moonIcon) moonIcon.style.display = theme === 'dark' ? 'none' : '';
    }

    // ─── Image Toolbar (restyle inline images) ──────────────────────────────

    _initImagePropertiesPanel() {
        // Initialize the floating image toolbar with markdown access so it can
        // drive applySettings / updateAttribute via ImageInteractionHandler.
        ImagePropertiesPanel.init(
            () => this.markdownEditor?.getValue() ?? '',
            (updated) => {
                this.markdownEditor?.setValue(updated, { suppressOnChange: true });
                this.unsavedMarkdown.set(this.currentSlideIndex, updated);
                this.updateUnsavedChangesFlag();
            }
        );

        const slidesContainer = this.elements.slidesContainer;
        if (!slidesContainer) return;

        slidesContainer.addEventListener('click', (e) => {
            if (!this.isEditMode) return;
            const img = e.target.closest('img');
            if (!img) return;
            if (img.closest('.editor-area-label, .editor-slide-warning')) return;

            e.preventDefault();
            e.stopPropagation();

            ImageInteractionHandler.select(img);
        });

        this._initDropAndPaste(slidesContainer);
    }

    /**
     * Wire up drag-drop (from picker grid or desktop) and clipboard paste
     * to insert images at the cursor position on the slide.
     */
    _initDropAndPaste(slidesContainer) {
        // ── Drag-over: allow drop when image data or image files are present
        slidesContainer.addEventListener('dragover', (e) => {
            if (!this.isEditMode) return;
            const types = [...(e.dataTransfer?.types || [])];
            const items = [...(e.dataTransfer?.items || [])];
            const hasImagePath = types.includes('text/x-webdeck-image');
            const hasImageFile = items.some((i) => i.kind === 'file' && i.type.startsWith('image/'));
            if (hasImagePath || hasImageFile) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            }
        });

        // ── Drop: insert image from picker grid or desktop file
        slidesContainer.addEventListener('drop', async (e) => {
            if (!this.isEditMode) return;
            e.preventDefault();
            e.stopPropagation();

            // Ensure the deck directory is resolved so uploads land in the right place
            const dirHandle = await this._resolveDeckDirectoryHandle();
            if (dirHandle) {
                DeckImagesResolver.setDeckDir(dirHandle, this.deckDirMode);
            }

            // Resolve the image path — either from picker drag or file upload
            let imgPath = e.dataTransfer.getData('text/x-webdeck-image');
            if (!imgPath) {
                const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
                if (file) {
                    imgPath = await this.uploadImage(file);
                }
            }
            if (!imgPath) return;

            this._insertImageAtDropPosition(imgPath, e.clientX, e.clientY, e.target);
        });

        // ── Paste: insert image from clipboard
        slidesContainer.addEventListener('paste', async (e) => {
            if (!this.isEditMode) return;
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) {
                        const dirHandle = await this._resolveDeckDirectoryHandle();
                        if (dirHandle) {
                            DeckImagesResolver.setDeckDir(dirHandle, this.deckDirMode);
                        }
                        const imgPath = await this.uploadImage(file);
                        if (imgPath) {
                            // Insert at center of the active slide's main area
                            const slideEl = this.getSlideElementByIndex(this.currentSlideIndex);
                            const grid = slideEl?.querySelector('.slide__grid');
                            if (grid) {
                                const rect = grid.getBoundingClientRect();
                                this._insertImageAtDropPosition(imgPath, rect.left + rect.width / 2, rect.top + rect.height / 2, slideEl);
                            }
                        }
                    }
                    return;
                }
            }
        });
    }

    /**
     * Insert an image at the given screen coordinates, computing design-space
     * position relative to the slide grid.
     */
    _insertImageAtDropPosition(imgPath, clientX, clientY, eventTarget) {
        const slideEl = eventTarget.closest?.('.slide') || this.getSlideElementByIndex(this.currentSlideIndex);
        if (!slideEl) return;
        const grid = slideEl.querySelector('.slide__grid');
        if (!grid) return;

        // Read stage scale from the CSS variable on #deckStage
        const scale = parseFloat(this.elements.deckStage?.style.getPropertyValue('--stage-scale')) || 1;
        const gridRect = grid.getBoundingClientRect();

        const x = Math.round((clientX - gridRect.left) / scale);
        const y = Math.round((clientY - gridRect.top) / scale);

        // Determine which area the drop landed in
        const areaEl = eventTarget.closest?.('.slide__area');
        const areaName = areaEl?.dataset.areaName || 'main';

        // Build the <img> snippet with position
        const alt = imgPath.split('/').pop().replace(/\.[^.]+$/, '').replace(/^\d+[-_]?/, '') || 'image';
        const snippet = `<img src="${imgPath}" alt="${alt}" style="position: relative; left: ${x}px; top: ${y}px; width: 480px; border: none; object-fit: contain; cursor: move;" />`;

        // Insert into markdown at the end of the target area's content
        const markdown = this.markdownEditor?.getValue() ?? '';
        const range = this.areaNav.getAreaContentRange(markdown, areaName);
        const insertText = `${snippet}\n`;
        this.markdownEditor?.replaceRange(range.to, range.to, insertText);
    }

    async _resolveDeckDirectoryHandle() {
        return this.imageBg._resolveDeckDirectoryHandle();
    }

    async _detectDeckDirMode(dir) {
        return this.imageBg._detectDeckDirMode(dir);
    }

    get deckDirMode() {
        return this.imageBg.deckDirMode;
    }

    async clearDeckDirectoryHandle() {
        return this.imageBg.clearDeckDirectoryHandle();
    }

    async uploadImage(file) {
        return this.imageBg.uploadImage(file);
    }

    _resolveAreaInsertPositionByRatio(markdown, areaName, ratioY = 1) {
        return this.areaNav.resolveAreaInsertPositionByRatio(markdown, areaName, ratioY);
    }

    /**
     * Return the character range for the content inside a named @area block.
     * The range excludes the @area marker line itself and ends at the next area
     * marker or the end of the document.
     */
    _getAreaContentRange(markdown, areaName) {
        return this.areaNav.getAreaContentRange(markdown, areaName);
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
        return this.slideOps.rebuildUnsavedMarkdownMap(insertAtIndex, deleteAtIndex, newSlideIndex, newSlideMarkdown);
    }

    /**
     * Add a new slide after the current one
     */
    addSlide() {
        return this.slideOps.addSlide();
    }

    /**
     * Delete the current slide
     */
    async deleteSlide() {
        return this.slideOps.deleteSlide();
    }

    /**
     * Move the current slide up by one position
     */
    moveSlideUp() {
        return this.slideOps.moveSlideUp();
    }

    /**
     * Move the current slide down by one position
     */
    moveSlideDown() {
        return this.slideOps.moveSlideDown();
    }

    /**
     * Duplicate the current slide
     */
    async duplicateSlide() {
        return this.slideOps.duplicateSlide();
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
     * Open the Background Picker modal and apply the chosen CSS background
     * value to the current slide's `background:` directive.
     */
    pickBackground() {
        return this.imageBg.pickBackground();
    }

    async _pickBackgroundImage() {
        return this.imageBg._pickBackgroundImage();
    }

    /**
     * Add a new slide with the selected layout
     */
    addSlideWithLayout(layoutName) {
        return this.slideOps.addSlideWithLayout(layoutName);
    }
}