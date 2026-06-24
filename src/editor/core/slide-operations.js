/**
 * SlideOperations
 *
 * Slide lifecycle helpers extracted from EditController: add, delete,
 * move, duplicate, and layout-based creation.  Each method receives
 * (or accesses via `ctrl`) the shared editor state it needs.
 */

import { MarkdownParser } from '../../data/markdown-parser.js';
import { AssetLoader } from '../../core/asset-loader.js';
import { SlideRenderer } from '../../renderer/slide-renderer.js';
import { ContentEnhancer } from '../../renderer/content-enhancer.js';
import { Notification } from '../../renderer/notification.js';
import { LayoutData } from '../../data/layout-data.js';
import { LayoutParser } from '../../data/layout-parser.js';
import { updateLayoutDirective } from './directive-utils.js';

export class SlideOperations {
    /** @param {import('./edit-controller.js').EditController} ctrl */
    constructor(ctrl) {
        this.ctrl = ctrl;
    }

    // ─── Shortcuts ────────────────────────────────────────────────────────────

    get deck()          { return this.ctrl.deck; }
    get elements()      { return this.ctrl.elements; }
    get controller()    { return this.ctrl.controller; }
    get thumbnails()    { return this.ctrl.thumbnails; }
    get markdownEditor(){ return this.ctrl.markdownEditor; }
    get currentSlideIndex() { return this.ctrl.currentSlideIndex; }
    set currentSlideIndex(v){ this.ctrl.currentSlideIndex = v; }

    // ─── Add ──────────────────────────────────────────────────────────────────

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

        this.deck.slides.splice(insertIndex, 0, newSlide);
        const newSlideMarkdown = '## New Slide\n\nAdd your content here';
        this.ctrl.originalMarkdown.splice(insertIndex, 0, newSlideMarkdown);

        const visibleSlideCount = this.deck.slides.filter(s => !s.hidden).length;
        if (this.elements.slideCountEl) {
            this.elements.slideCountEl.textContent = String(visibleSlideCount);
        }

        if (this.elements.slidesContainer) {
            const newSlideEl = SlideRenderer.createSlideElement(
                this.deck, newSlide, insertIndex, false
            );
            const allSlides = this.elements.slidesContainer.querySelectorAll('.slide');
            if (allSlides[this.currentSlideIndex]) {
                allSlides[this.currentSlideIndex].after(newSlideEl);
            } else {
                this.elements.slidesContainer.appendChild(newSlideEl);
            }
        }

        this.controller.slideNavigator.goTo(insertIndex);
    }

    // ─── Delete ─────────────────────────────────────────────────────────────

    async deleteSlide() {
        if (this.deck.slides.length <= 1) {
            Notification.warning('Cannot delete the only slide');
            return;
        }

        const confirmed = await Notification.confirm('Are you sure you want to delete this slide?');
        if (!confirmed) return;

        const indexToDelete = this.currentSlideIndex;

        this.deck.slides.splice(indexToDelete, 1);
        this.ctrl.originalMarkdown.splice(indexToDelete, 1);

        const visibleSlideCount = this.deck.slides.filter(s => !s.hidden).length;
        if (this.elements.slideCountEl) {
            this.elements.slideCountEl.textContent = String(visibleSlideCount);
        }

        const allSlides = document.querySelectorAll('.slide');
        if (allSlides[indexToDelete]) allSlides[indexToDelete].remove();

        const newIndex = indexToDelete >= this.deck.slides.length
            ? this.deck.slides.length - 1
            : indexToDelete;
        this.controller.slideNavigator.goTo(newIndex);

        this.rebuildUnsavedMarkdownMap(-1, indexToDelete);

        if (this.ctrl.unsavedMarkdown.size === 0) {
            this.ctrl.unsavedMarkdown.set(0, this.ctrl.originalMarkdown[0] || '');
        }
        this.ctrl.hasUnsavedChanges = true;
        this.ctrl.updateSaveButton();

        this.thumbnails.refresh();
    }

    // ─── Move ──────────────────────────────────────────────────────────────

    moveSlideUp() {
        if (this.currentSlideIndex <= 0) {
            Notification.warning('Cannot move the first slide up');
            return;
        }

        const currentIndex = this.currentSlideIndex;
        const targetIndex = currentIndex - 1;

        this._swapSlides(currentIndex, targetIndex);

        this.controller.slideNavigator.goTo(targetIndex);
        this.thumbnails.refresh();
        Notification.success('Slide moved up');
    }

    moveSlideDown() {
        if (this.currentSlideIndex >= this.deck.slides.length - 1) {
            Notification.warning('Cannot move the last slide down');
            return;
        }

        const currentIndex = this.currentSlideIndex;
        const targetIndex = currentIndex + 1;

        this._swapSlides(currentIndex, targetIndex);

        this.controller.slideNavigator.goTo(targetIndex);
        this.thumbnails.refresh();
        Notification.success('Slide moved down');
    }

    /** Swap two adjacent slides in data, DOM, and unsaved-map. */
    _swapSlides(a, b) {
        // Data
        [this.deck.slides[a], this.deck.slides[b]] =
            [this.deck.slides[b], this.deck.slides[a]];
        [this.ctrl.originalMarkdown[a], this.ctrl.originalMarkdown[b]] =
            [this.ctrl.originalMarkdown[b], this.ctrl.originalMarkdown[a]];

        // DOM
        const allSlides = this.elements.slidesContainer.querySelectorAll('.slide');
        const elA = allSlides[a];
        const elB = allSlides[b];
        if (elA && elB) {
            const cloneA = elA.cloneNode(true);
            const cloneB = elB.cloneNode(true);
            elB.replaceWith(cloneA);
            elA.replaceWith(cloneB);
            cloneB.classList.remove('active');
            cloneA.classList.add('active');
        }

        // Unsaved map
        const newMap = new Map();
        for (const [idx, content] of this.ctrl.unsavedMarkdown) {
            if (idx === a)       newMap.set(b, content);
            else if (idx === b)  newMap.set(a, content);
            else                 newMap.set(idx, content);
        }
        this.ctrl.unsavedMarkdown = newMap;
        this.ctrl.hasUnsavedChanges = true;
        this.ctrl.updateSaveButton();
    }

    // ─── Duplicate ────────────────────────────────────────────────────────

    async duplicateSlide() {
        const sourceIndex = this.currentSlideIndex;
        const insertIndex = sourceIndex + 1;

        const markdown = this.ctrl.unsavedMarkdown.get(sourceIndex) ??
            this.ctrl.originalMarkdown[sourceIndex] ?? '';

        if (!markdown) {
            Notification.warning('Cannot duplicate empty slide');
            return;
        }

        try {
            await AssetLoader.ensureMarkdownItLoaded();
            const parser = new MarkdownParser();
            const deckData = parser.parseDeckMarkdown(markdown);

            if (!deckData.slides || deckData.slides.length === 0) {
                Notification.warning('Failed to parse slide for duplication');
                return;
            }

            const newSlide = { ...deckData.slides[0], id: Date.now() };

            this.deck.slides.splice(insertIndex, 0, newSlide);
            this.ctrl.originalMarkdown.splice(insertIndex, 0, markdown);

            if (this.elements.slideCountEl) {
                this.elements.slideCountEl.textContent = String(this.deck.slides.length);
            }

            if (this.elements.slidesContainer) {
                const newSlideEl = SlideRenderer.createSlideElement(
                    this.deck, newSlide, insertIndex, false
                );
                const allSlides = this.elements.slidesContainer.querySelectorAll('.slide');
                if (allSlides[sourceIndex]) {
                    allSlides[sourceIndex].after(newSlideEl);
                } else {
                    this.elements.slidesContainer.appendChild(newSlideEl);
                }
                ContentEnhancer.enhanceRenderedContent(newSlideEl).catch(err => {
                    console.warn("Failed to enhance duplicated slide:", err);
                });
            }

            this.rebuildUnsavedMarkdownMap(insertIndex, -1, insertIndex, markdown);
            this.controller.slideNavigator.goTo(insertIndex);
            this.thumbnails.refresh();
            Notification.success('Slide duplicated successfully');
        } catch (error) {
            console.error('Failed to duplicate slide:', error);
            Notification.error('Failed to duplicate slide: ' + (error.message || 'Unknown error'));
        }
    }

    // ─── Add with layout ───────────────────────────────────────────────────

    addSlideWithLayout(layoutName) {
        if (this.deck.slides.length === 0) return;

        const template = LayoutData.getTemplate(layoutName);
        const insertIndex = this.currentSlideIndex + 1;

        try {
            const parser = new MarkdownParser();
            const deckData = parser.parseDeckMarkdown(template);

            if (!deckData.slides || deckData.slides.length === 0) {
                const newSlide = {
                    id: Date.now(),
                    title: 'New Slide',
                    notes: '',
                    layout: layoutName,
                    areas: { main: '<h2>New Slide</h2>\n\nAdd your content here' }
                };
                this.deck.slides.splice(insertIndex, 0, newSlide);
                this.ctrl.originalMarkdown.splice(insertIndex, 0, template);
            } else {
                const newSlide = deckData.slides[0];
                this.deck.slides.splice(insertIndex, 0, newSlide);
                this.ctrl.originalMarkdown.splice(insertIndex, 0, template);
            }

            if (this.elements.slideCountEl) {
                this.elements.slideCountEl.textContent = String(this.deck.slides.length);
            }

            if (this.elements.slidesContainer) {
                const newSlideEl = SlideRenderer.createSlideElement(
                    this.deck, this.deck.slides[insertIndex], insertIndex, false
                );
                const allSlides = this.elements.slidesContainer.querySelectorAll('.slide');
                if (allSlides[this.currentSlideIndex]) {
                    allSlides[this.currentSlideIndex].after(newSlideEl);
                } else {
                    this.elements.slidesContainer.appendChild(newSlideEl);
                }
                ContentEnhancer.enhanceRenderedContent(newSlideEl).catch(err => {
                    console.warn("Failed to enhance new slide:", err);
                });
            }

            this.controller.slideNavigator.goTo(insertIndex);
            this.rebuildUnsavedMarkdownMap(insertIndex, -1, insertIndex, template);
            this.thumbnails.refresh();
            Notification.success(`Added new slide with "${layoutName}" layout`);
        } catch (error) {
            console.error('Failed to create slide from template:', error);
            Notification.error('Failed to create slide: ' + (error.message || 'Unknown error'));
        }
    }

    // ─── Unsaved-map helpers ───────────────────────────────────────────────

    rebuildUnsavedMarkdownMap(insertAtIndex = -1, deleteAtIndex = -1, newSlideIndex = -1, newSlideMarkdown = '') {
        const newMap = new Map();

        for (const [index, content] of this.ctrl.unsavedMarkdown) {
            let newIndex = index;

            if (deleteAtIndex >= 0 && index > deleteAtIndex) newIndex = index - 1;
            if (insertAtIndex >= 0 && newIndex >= insertAtIndex) newIndex = newIndex + 1;
            if (deleteAtIndex >= 0 && index === deleteAtIndex) continue;

            newMap.set(newIndex, content);
        }

        if (newSlideIndex >= 0 && newSlideMarkdown) {
            newMap.set(newSlideIndex, newSlideMarkdown);
        }

        this.ctrl.unsavedMarkdown = newMap;
        this.ctrl.hasUnsavedChanges = this.ctrl.unsavedMarkdown.size > 0;
        this.ctrl.updateSaveButton();
    }
}
