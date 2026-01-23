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
        title.textContent = slide.title || `Slide ${index + 1}`;

        thumbnail.appendChild(number);
        thumbnail.appendChild(title);

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
