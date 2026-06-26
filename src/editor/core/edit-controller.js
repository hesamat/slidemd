/**
 * EditController
 * Manages edit mode with side-by-side markdown editor and live preview.
 */
import { MarkdownParser } from "../../data/markdown-parser.js";
import { SlideRenderer } from "../../renderer/slide-renderer.js";
import { AssetLoader } from "../../core/asset-loader.js";
import { Notification } from "../../renderer/notification.js";
import { ContentEnhancer } from "../../renderer/content-enhancer.js";
import { LayoutParser } from "../../data/layout-parser.js";
import { LayoutData } from "../../data/layout-data.js";
import { StageScaler } from "../../renderer/stage-scaler.js";
import { ImagePicker } from "../image/image-picker.js";
import { BackgroundPicker } from "../ui/background-picker.js";
import { DeckImagesResolver } from "../image/deck-images-resolver.js";
import { ImageInteractionHandler } from "../image/image-interaction-handler.js";
import { ImagePropertiesPanel } from "../image/image-properties-panel.js";
import { SlideOperations } from "./slide-operations.js";
import { ImageBackgroundHandler } from "../image/image-background-handler.js";
import { ImageInserter } from "../image/image-inserter.js";
import { AreaNavigation } from "../navigation/area-navigation.js";
import { MarkdownEditor } from "./markdown-editor.js";
import { SlideThumbnails } from "./slide-thumbnails.js";
import { LayoutPicker } from "../layout/layout-picker.js";

import { GridResizerManager } from "../layout/grid-resizer-manager.js";
import { AreaGuideManager } from "../navigation/area-guide-manager.js";
import { SlideWarningManager } from "../navigation/slide-warning-manager.js";
import { InsertDropdownManager } from "../ui/insert-dropdown-manager.js";
import { MermaidHelperManager } from "../ui/mermaid-helper-manager.js";
import { LayoutManager } from "../layout/layout-manager.js";
import { ThemeManager } from "../ui/theme-manager.js";
import { PanelResizer } from "../ui/panel-resizer.js";
import { SaveManager } from "../ui/save-manager.js";
import { SlideStylePanel } from "../ui/slide-style-panel.js";

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
        this.originalMarkdown = this._cacheOriginalMarkdown();
        // Store unsaved changes in memory (per-slide)
        this.unsavedMarkdown = new Map();

        this.placeholderDialogEl = null;

        // Initialize slide thumbnails
        this.thumbnails = new SlideThumbnails(deck, controller, elements);

        // Sub-modules extracted to keep this file manageable
        this.slideOps = new SlideOperations(this);
        this.imageBg = new ImageBackgroundHandler(this);
        this.imageInserter = new ImageInserter(this);
        this.areaNav = new AreaNavigation(this);

        // Further-extracted sub-modules
        this.gridResizer = new GridResizerManager(this);
        this.areaGuides = new AreaGuideManager(this);
        this.warnings = new SlideWarningManager(this);
        this.insertDropdown = new InsertDropdownManager(this);
        this.mermaidHelper = new MermaidHelperManager(this);
        this.layoutManager = new LayoutManager(this);
        this.themeManager = new ThemeManager(this);
        this.panelResizer = new PanelResizer(this);
        this.saveManager = new SaveManager(this);

        this.init();
    }

    /**
     * Cache original markdown for all slides
     */
    _cacheOriginalMarkdown() {
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
        this.panelResizer.init();

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
            SlideStylePanel.hide();
            this.loadSlideIntoEditor();
        });

        // Listen for deck replacement events
        this.controller.addEventListener('deckchange', (data) => {
            this.deck = data.deck;
            this.originalMarkdown = this._cacheOriginalMarkdown();
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
        this.insertDropdown.init();
        this.mermaidHelper.init();

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

        // Slide style panel — for styling all areas uniformly
        SlideStylePanel.init(
            () => this.markdownEditor?.getValue() ?? '',
            (updated) => {
                this.markdownEditor?.setValue(updated, { suppressOnChange: false });
            },
            (cssString) => this._applySlideStyleToAll(cssString)
        );

        // Source-jump: click text in slide → jump to markdown source
        this._initSourceJumpHandler();

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
            this.mermaidHelper.hide();
            ImageInteractionHandler.deactivate();
            SlideStylePanel.hide();
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
        this.areaGuides.refresh();
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

    navigateToArea(areaName) {
        this.areaNav.navigateToArea(areaName);
    }

    /**
     * Update the preview with the edited markdown
     */
    async updatePreview() {
        const markdown = this.markdownEditor?.getValue() ?? '';
        this.warnings.clearSlideWarning();
        this.warnings.resetPending();

        try {
            await AssetLoader.ensureMarkdownItLoaded();
            const parser = new MarkdownParser();

            const slideCount = parser.splitSlides(markdown).length;
            if (slideCount > 1) {
                this.warnings.showEditorWarning(
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
                this.warnings.showEditorWarning(
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
                    this.warnings.showEditorWarning(
                        `unknown-areas-${unknownAreas.join('-')}`,
                        `Areas not in layout: ${unknownAreas.map(name => `@${name}`).join(', ')}.`
                    );
                }

                const optionalAreas = ["footer", "header"];
                const missingAreas = layoutAreas.filter(name => !areaNames.includes(name) && !optionalAreas.includes(name));
                if (missingAreas.length) {
                    this.warnings.showEditorWarning(
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

                this.warnings.applyPendingSlideWarning(newSlideEl);
                this.areaGuides.applyAreaGuides(newSlideEl, slideData);

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
                        this.areaGuides.updateAreaOverflow(newSlideEl);
                        this.gridResizer.attachForSlide(newSlideEl, slideData);
                        // Re-activate image drag/resize on the new slide element
                        const grid = newSlideEl.querySelector('.slide__grid');
                        if (grid) {
                            ImageInteractionHandler.activate(grid);
                        }
                    });
                };

                // Re-enhance the new slide content (Mermaid, Prism, etc.)
                ContentEnhancer.enhanceRenderedContent(newSlideEl).then(() => {
                    this.areaGuides.applyAreaGuides(newSlideEl, slideData);
                    // Re-rewrite after enhancement (which may inject more imgs).
                    DeckImagesResolver.rewriteImgSrcs(newSlideEl).catch(() => { });
                    DeckImagesResolver.rewriteBackgroundUrls(newSlideEl).catch(() => { });
                }).catch(err => {
                    console.warn("Failed to enhance slide preview:", err);
                }).finally(() => {
                    attachPreviewOverlays();
                });
            } else {
                this.warnings.applyPendingSlideWarning();
            }
        } catch (error) {
            console.error('Failed to update preview:', error);
            Notification.error('Failed to parse markdown: ' + (error.message || 'Unknown error'));
        }
    }

    _getAreaAtCursor(markdown, position) {
        return this.areaNav.getAreaAtCursor(markdown, position);
    }

    async pickAndInsertImage() {
        return this.imageInserter.pickAndInsert();
    }

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

        this.imageInserter.initDropAndPaste(slidesContainer);
    }

    /**
     * Initialize click-to-jump: clicking a text element in the slide preview
     * jumps the CodeMirror cursor to the corresponding markdown source line.
     */
    _initSourceJumpHandler() {
        const slidesContainer = this.elements.slidesContainer;
        if (!slidesContainer) return;

        slidesContainer.addEventListener('click', (e) => {
            if (!this.isEditMode) return;
            if (e.target.closest('.editor-area-label, .editor-slide-warning, .image-overlay, .image-properties-panel, .grid-resize-handle')) return;
            if (e.target.closest('img')) return;

            const areaEl = e.target.closest('.slide__area');
            if (!areaEl) return;

            const blockEl = e.target.closest('[data-source-line]');
            if (!blockEl) return;

            const areaName = areaEl.dataset.areaName || 'main';
            const sourceLine = parseInt(blockEl.dataset.sourceLine, 10);
            if (isNaN(sourceLine)) return;

            const editorMarkdown = this.markdownEditor?.getValue() ?? '';
            const lines = editorMarkdown.split('\n');

            // Compute content-start offsets from the current editor markdown.
            // token.map[0] is a physical line index inside the rendered area
            // string; adding the area's editor start line gives the absolute
            // target line. Directives are treated as non-content lines.
            const parser = new MarkdownParser();
            const areaOffsets = parser.computeAreaOffsets(editorMarkdown);
            let areaStart = areaOffsets[areaName];
            if (areaStart === undefined) {
                // @title / @header alias handling
                if (areaName === 'title' && areaOffsets.header !== undefined) {
                    areaStart = areaOffsets.header;
                } else if (areaName === 'header' && areaOffsets.title !== undefined) {
                    areaStart = areaOffsets.title;
                }
            }
            if (areaStart === undefined) areaStart = 0;

            let targetLine = areaStart + sourceLine;
            targetLine = Math.max(0, Math.min(targetLine, lines.length - 1));

            let pos = 0;
            for (let i = 0; i < targetLine; i++) {
                pos += lines[i].length + 1;
            }
            pos = Math.min(pos, editorMarkdown.length);

            this.markdownEditor.setValueWithCursor(editorMarkdown, pos, {
                suppressOnChange: true,
                scrollIntoView: true,
            });
            this.markdownEditor.highlightLine(targetLine);
        });
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
     */
    _getAreaContentRange(markdown, areaName) {
        return this.areaNav.getAreaContentRange(markdown, areaName);
    }

    // ─── Delegated public API (kept for backward compatibility) ────────────

    updateSaveButton() {
        this.saveManager.updateButton();
    }

    async saveChanges() {
        return this.saveManager.save();
    }

    _rebuildUnsavedMarkdownMap(insertAtIndex = -1, deleteAtIndex = -1, newSlideIndex = -1, newSlideMarkdown = '') {
        return this.slideOps.rebuildUnsavedMarkdownMap(insertAtIndex, deleteAtIndex, newSlideIndex, newSlideMarkdown);
    }

    addSlide() {
        return this.slideOps.addSlide();
    }

    async deleteSlide() {
        return this.slideOps.deleteSlide();
    }

    moveSlideUp() {
        return this.slideOps.moveSlideUp();
    }

    moveSlideDown() {
        return this.slideOps.moveSlideDown();
    }

    async duplicateSlide() {
        return this.slideOps.duplicateSlide();
    }

    showLayoutPicker() {
        return this.layoutManager.showPicker();
    }

    showLayoutPickerForCurrentSlide() {
        return this.layoutManager.showPickerForCurrentSlide();
    }

    pickBackground() {
        return this.imageBg.pickBackground();
    }

    openSlideStylePanel() {
        SlideStylePanel.toggle();
    }

    async _applySlideStyleToAll(cssString) {
        const parser = new MarkdownParser();
        await AssetLoader.ensureMarkdownItLoaded();
        const total = this.originalMarkdown.length;
        for (let i = 0; i < total; i++) {
            const current = this.unsavedMarkdown.get(i) ?? this.originalMarkdown[i] ?? '';
            const { markdown: stripped } = parser.extractDirective(current, 'area-style');
            const trimmed = String(cssString || '').trim();
            const updated = trimmed ? `area-style: ${trimmed}\n${stripped}` : stripped;
            this.unsavedMarkdown.set(i, updated);
        }
        this.hasUnsavedChanges = true;
        this.updateSaveButton();

        // Re-render every slide element so styles apply visually
        const slidesContainer = document.getElementById('slidesContainer');
        if (slidesContainer) {
            const allSlideEls = slidesContainer.querySelectorAll(':scope > .slide');
            for (let i = 0; i < allSlideEls.length; i++) {
                const md = this.unsavedMarkdown.get(i) ?? this.originalMarkdown[i] ?? '';
                const fullDeckData = parser.parseDeckMarkdown(md);
                const slideData = fullDeckData.slides?.[0];
                if (!slideData) continue;
                this.deck.slides[i] = slideData;
                const wasActive = allSlideEls[i].classList.contains('active');
                const newEl = SlideRenderer.createSlideElement(this.deck, slideData, i, wasActive);
                allSlideEls[i].replaceWith(newEl);
            }
        }

        // Refresh the editor with the current slide's markdown
        this.markdownEditor?.setValue(
            this.unsavedMarkdown.get(this.currentSlideIndex) ?? '',
            { suppressOnChange: true }
        );
        Notification.success('Style applied to all slides');
    }

    async _pickBackgroundImage() {
        return this.imageBg._pickBackgroundImage();
    }

    addSlideWithLayout(layoutName) {
        return this.slideOps.addSlideWithLayout(layoutName);
    }

    // Warning methods delegated for backward compatibility
    showEditorWarning(key, message, duration) {
        return this.warnings.showEditorWarning(key, message, duration);
    }

    showSlideWarning(message) {
        return this.warnings.showSlideWarning(message);
    }

    clearSlideWarning() {
        return this.warnings.clearSlideWarning();
    }

    applyPendingSlideWarning(targetSlideEl) {
        return this.warnings.applyPendingSlideWarning(targetSlideEl);
    }

    // Area guide methods delegated for backward compatibility
    applyAreaGuides(slideEl, slideData) {
        return this.areaGuides.applyAreaGuides(slideEl, slideData);
    }

    updateAreaOverflow(slideEl) {
        return this.areaGuides.updateAreaOverflow(slideEl);
    }

    refreshAreaGuides() {
        return this.areaGuides.refresh();
    }

    // Grid resizer methods delegated for backward compatibility
    attachGridResizerForSlide(slideEl, slideData) {
        return this.gridResizer.attachForSlide(slideEl, slideData);
    }

    updateAdjustColumnsState(layoutInfo) {
        return this.gridResizer.updateAdjustColumnsState(layoutInfo);
    }

    toggleGridResizer() {
        return this.gridResizer.toggle();
    }

    // Mermaid helper delegated for backward compatibility
    toggleMermaidHelperPanel() {
        return this.mermaidHelper.toggle();
    }

    hideMermaidHelperPanel() {
        return this.mermaidHelper.hide();
    }

    insertMermaidTemplate(templateName) {
        return this.mermaidHelper.insertTemplate(templateName);
    }

    // Theme delegated for backward compatibility
    toggleSlideTheme() {
        return this.themeManager.toggle();
    }

    // Layout delegated for backward compatibility
    async applyLayoutToCurrentSlide(layoutName) {
        return this.layoutManager.applyToCurrentSlide(layoutName);
    }

    getLayoutCompatibilityWarning(markdown, layoutName) {
        return this.layoutManager.getCompatibilityWarning(markdown, layoutName);
    }
}
