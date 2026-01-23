/**
 * SlideThumbnails
 * Manages the slide thumbnails sidebar in the editor.
 * Renders thumbnails of all slides and handles navigation via thumbnail clicks.
 */

export class SlideThumbnails {
    constructor(deck, controller, elements) {
        this._deck = deck;
        this._controller = controller;
        this._elements = elements;
        this._container = null;

        this.init();
    }

    init() {
        this._container = document.getElementById('slideThumbnails');
        if (!this._container) return;

        // Listen for slide changes to update current thumbnail highlight
        this._controller.addEventListener('slidechange', () => this.updateCurrentSlide());

        // Listen for deck changes to update our deck reference and re-render
        this._controller.addEventListener('deckchange', (data) => {
            this._deck = data.deck;
            this.render();
        });
    }

    /**
     * Render all slide thumbnails
     */
    render() {
        if (!this._container) return;

        this._container.innerHTML = '';

        this._deck.slides.forEach((slide, index) => {
            const thumbnail = this.createThumbnail(slide, index);
            this._container.appendChild(thumbnail);
        });

        this.updateCurrentSlide();
    }

    /**
     * Create a single thumbnail element
     */
    createThumbnail(slide, index) {
        const thumbnail = document.createElement('div');
        thumbnail.className = `slide-thumbnail${slide?.hidden ? ' slide-thumbnail--hidden' : ''}`;
        thumbnail.dataset.slideIndex = index;
        thumbnail.setAttribute('role', 'button');
        thumbnail.setAttribute('aria-label', `Go to slide ${index + 1}${slide?.hidden ? ' (hidden)' : ''}`);

        // Slide number
        const number = document.createElement('div');
        number.className = 'slide-thumbnail__number';
        number.textContent = index + 1;

        // Slide title
        const title = document.createElement('div');
        title.className = 'slide-thumbnail__title';
        title.textContent = slide.title || `Slide ${index}`;

        thumbnail.appendChild(number);
        thumbnail.appendChild(title);

        // Toggle hidden icon (shown on hover for all slides, always visible for hidden slides)
        const toggleIcon = document.createElement('button');
        toggleIcon.className = `slide-thumbnail__toggle-icon${slide?.hidden ? ' slide-thumbnail__toggle-icon--hidden' : ''}`;
        toggleIcon.type = 'button';
        toggleIcon.setAttribute('aria-label', slide?.hidden ? 'Show slide' : 'Hide slide');
        toggleIcon.setAttribute('title', slide?.hidden ? 'Show slide' : 'Hide slide');
        // Eye-off icon for hidden slides, Eye icon for visible slides
        toggleIcon.innerHTML = slide?.hidden
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';

        // Prevent navigation when clicking the toggle icon
        toggleIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleSlideHidden(index, !slide?.hidden);
        });

        thumbnail.appendChild(toggleIcon);

        // Click handler to navigate to slide
        thumbnail.addEventListener('click', () => {
            this._controller.goTo(index);
        });

        return thumbnail;
    }

    /**
     * Toggle the hidden state of a slide
     */
    async toggleSlideHidden(index, newState) {
        const editController = window.__WEBDECK_EDIT_CONTROLLER__;
        if (!editController) {
            console.warn('Edit controller not available');
            return;
        }

        const slide = this._deck.slides[index];
        if (!slide) return;

        // Update the slide's hidden property
        slide.hidden = newState;

        // Get the current markdown for this slide
        const markdown = editController.unsavedMarkdown.get(index) ??
                         editController.originalMarkdown[index] ?? '';

        if (!markdown) return;

        // Toggle @hidden directive in markdown
        let updatedMarkdown;
        if (newState) {
            // Add @hidden directive
            const lines = markdown.split('\n');
            // Find the last directive line or the first content line
            let insertIndex = 0;
            for (let i = 0; i < lines.length; i++) {
                const trimmed = lines[i].trim();
                if (trimmed.startsWith('@') && !trimmed.startsWith('@hidden') && !trimmed.startsWith('@hide')) {
                    insertIndex = i + 1;
                } else if (trimmed.length > 0 && !trimmed.startsWith('@')) {
                    break;
                }
            }
            lines.splice(insertIndex, 0, '@hidden');
            updatedMarkdown = lines.join('\n');
        } else {
            // Remove @hidden or @hide directive
            updatedMarkdown = markdown
                .replace(/^@hidden\s*\n?/gm, '')
                .replace(/^@hide\s*\n?/gm, '');
        }

        // Update the markdown cache
        editController.unsavedMarkdown.set(index, updatedMarkdown);
        editController.hasUnsavedChanges = true;
        editController.updateSaveButton();

        // Update the slide DOM directly for immediate feedback
        // Use the slides container to get slides in correct order
        const slidesContainer = document.getElementById('slidesContainer');
        if (slidesContainer) {
            const allSlides = slidesContainer.querySelectorAll(':scope > .slide');
            if (allSlides[index]) {
                if (newState) {
                    allSlides[index].classList.add('slide--hidden');
                } else {
                    allSlides[index].classList.remove('slide--hidden');
                }
            }
        }

        // Update just this specific thumbnail without full re-render
        this.updateThumbnailHiddenState(index, newState);
    }

    /**
     * Update just the hidden state of a specific thumbnail (avoiding full re-render)
     */
    updateThumbnailHiddenState(index, isHidden) {
        if (!this._container) return;

        const thumbnails = this._container.querySelectorAll('.slide-thumbnail');
        const thumbnail = thumbnails[index];

        if (thumbnail) {
            // Update the thumbnail class
            thumbnail.classList.toggle('slide-thumbnail--hidden', isHidden);

            // Update the toggle icon class and SVG
            const toggleIcon = thumbnail.querySelector('.slide-thumbnail__toggle-icon');
            if (toggleIcon) {
                toggleIcon.classList.toggle('slide-thumbnail__toggle-icon--hidden', isHidden);
                toggleIcon.setAttribute('aria-label', isHidden ? 'Show slide' : 'Hide slide');
                toggleIcon.setAttribute('title', isHidden ? 'Show slide' : 'Hide slide');
                // Update the SVG
                toggleIcon.innerHTML = isHidden
                    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
                    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
            }

            // Update the thumbnail aria-label
            thumbnail.setAttribute('aria-label', `Go to slide ${index + 1}${isHidden ? ' (hidden)' : ''}`);
        }
    }

    /**
     * Update the current slide highlight
     */
    updateCurrentSlide() {
        if (!this._container) return;

        const currentIndex = this._controller.currentIndex;
        const thumbnails = this._container.querySelectorAll('.slide-thumbnail');

        thumbnails.forEach((thumbnail, index) => {
            if (index === currentIndex) {
                thumbnail.classList.add('current');
                thumbnail.setAttribute('aria-current', 'true');
            } else {
                thumbnail.classList.remove('current');
                thumbnail.removeAttribute('aria-current');
            }
        });

        // Scroll current thumbnail into view
        const currentThumbnail = thumbnails[currentIndex];
        if (currentThumbnail && currentThumbnail.scrollIntoView) {
            currentThumbnail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    /**
     * Update the title of a specific thumbnail
     */
    updateThumbnailTitle(index, title) {
        if (!this._container) return;

        const thumbnails = this._container.querySelectorAll('.slide-thumbnail');
        if (thumbnails[index]) {
            const titleEl = thumbnails[index].querySelector('.slide-thumbnail__title');
            if (titleEl) {
                titleEl.textContent = title || `Slide ${index + 1}`;
            }
        }
    }

    /**
     * Refresh thumbnails (call when slides are added/removed)
     */
    refresh() {
        this.render();
    }
}
