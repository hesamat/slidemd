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
        this._currentIndex = 0;

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
        thumbnail.className = 'slide-thumbnail';
        thumbnail.dataset.slideIndex = index;
        thumbnail.setAttribute('role', 'button');
        thumbnail.setAttribute('aria-label', `Go to slide ${index + 1}`);

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

        // Action buttons container (shown only for current slide)
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'slide-thumbnail__actions';
        actionsContainer.style.display = 'none'; // Hidden by default

        // Move up button
        if (index > 0) {
            const moveUpBtn = document.createElement('button');
            moveUpBtn.className = 'slide-thumbnail__action-btn';
            moveUpBtn.type = 'button';
            moveUpBtn.setAttribute('aria-label', 'Move slide up');
            moveUpBtn.setAttribute('title', 'Move slide up');
            moveUpBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';
            moveUpBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._moveSlide(index, 'up');
            });
            actionsContainer.appendChild(moveUpBtn);
        }

        // Move down button
        if (index < this._deck.slides.length - 1) {
            const moveDownBtn = document.createElement('button');
            moveDownBtn.className = 'slide-thumbnail__action-btn';
            moveDownBtn.type = 'button';
            moveDownBtn.setAttribute('aria-label', 'Move slide down');
            moveDownBtn.setAttribute('title', 'Move slide down');
            moveDownBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
            moveDownBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._moveSlide(index, 'down');
            });
            actionsContainer.appendChild(moveDownBtn);
        }

        thumbnail.appendChild(actionsContainer);

        // Click handler to navigate to slide
        thumbnail.addEventListener('click', () => {
            this._controller.slideNavigator.goTo(index);
        });

        return thumbnail;
    }

    /**
     * Update the current slide highlight
     */
    updateCurrentSlide() {
        if (!this._container) return;

        const currentIndex = this._controller.slideNavigator.currentIndex;
        this._currentIndex = currentIndex;
        const thumbnails = this._container.querySelectorAll('.slide-thumbnail');

        thumbnails.forEach((thumbnail, index) => {
            const actionsContainer = thumbnail.querySelector('.slide-thumbnail__actions');

            if (index === currentIndex) {
                thumbnail.classList.add('current');
                thumbnail.setAttribute('aria-current', 'true');
                // Show action buttons for current slide
                if (actionsContainer) {
                    actionsContainer.style.display = 'flex';
                }
            } else {
                thumbnail.classList.remove('current');
                thumbnail.removeAttribute('aria-current');
                // Hide action buttons for other slides
                if (actionsContainer) {
                    actionsContainer.style.display = 'none';
                }
            }
        });

        // Scroll current thumbnail into view
        const currentThumbnail = thumbnails[currentIndex];
        if (currentThumbnail && currentThumbnail.scrollIntoView) {
            currentThumbnail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    /**
     * Move a slide up or down (delegates to edit controller)
     */
    _moveSlide(index, direction) {
        const editController = window.__WEBDECK_EDIT_CONTROLLER__;
        if (!editController) {
            console.warn('Edit controller not available');
            return;
        }

        if (direction === 'up') {
            // Switch to the target slide first, then move
            this._controller.slideNavigator.goTo(index);
            // Small delay to let the slide switch happen before moving
            setTimeout(() => {
                editController.moveSlideUp();
            }, 50);
        } else if (direction === 'down') {
            this._controller.slideNavigator.goTo(index);
            setTimeout(() => {
                editController.moveSlideDown();
            }, 50);
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
