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

        // Hidden indicator icon
        if (slide?.hidden) {
            const hiddenIcon = document.createElement('span');
            hiddenIcon.className = 'slide-thumbnail__hidden-icon';
            hiddenIcon.setAttribute('aria-hidden', 'true');
            hiddenIcon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
            thumbnail.appendChild(hiddenIcon);
        }

        // Click handler to navigate to slide
        thumbnail.addEventListener('click', () => {
            this._controller.goTo(index);
        });

        return thumbnail;
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
