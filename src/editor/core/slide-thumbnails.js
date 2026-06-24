/**
 * SlideThumbnails
 * Manages the slide thumbnails sidebar in the editor.
 * Renders thumbnails of all slides and handles navigation via thumbnail clicks,
 * right-click context menu, and the pinned "Add Slide" footer button.
 */

export class SlideThumbnails {
    constructor(deck, controller, elements) {
        this._deck = deck;
        this._controller = controller;
        this._elements = elements;
        this._container = null;
        this._currentIndex = 0;
        this._contextMenu = null;

        this.init();
    }

    init() {
        this._container = document.getElementById('slideThumbnails');
        if (!this._container) return;

        // Cache the add-slide button (last child of the list) so we can
        // re-insert it after clearing/rendering the thumbnails.
        this._addBtn = this._container.querySelector('.slide-thumbnails__add-btn');

        // Listen for slide changes to update current thumbnail highlight
        this._controller.addEventListener('slidechange', () => this.updateCurrentSlide());

        // Listen for deck changes to update our deck reference and re-render
        this._controller.addEventListener('deckchange', (data) => {
            this._deck = data.deck;
            this.render();
        });

        this._contextMenu = new SlideContextMenu(this);
        this._contextMenu.init();

        this._bindAddSlideFooter();
    }

    /**
     * Render all slide thumbnails.  The add-slide button is the last child
     * of the list and is preserved across renders so it always appears at
     * the end of the thumbnail list.
     */
    render() {
        if (!this._container) return;

        // Remove only the dynamically-generated thumbnails; keep the
        // add-slide button (and any other static children) intact.
        Array.from(this._container.querySelectorAll('.slide-thumbnail'))
            .forEach((node) => node.remove());

        this._deck.slides.forEach((slide, index) => {
            const thumbnail = this.createThumbnail(slide, index);
            // Insert before the add button so it always ends up at the end
            // of the visible list (and after the most recent slide).
            if (this._addBtn && this._addBtn.parentNode === this._container) {
                this._container.insertBefore(thumbnail, this._addBtn);
            } else {
                this._container.appendChild(thumbnail);
            }
        });

        this.updateCurrentSlide();
    }

    /**
     * Create a single thumbnail element
     */
    createThumbnail(slide, index) {
        const thumbnail = document.createElement('div');
        thumbnail.className = 'slide-thumbnail';
        thumbnail.dataset.slideIndex = String(index);
        thumbnail.setAttribute('role', 'button');
        thumbnail.setAttribute('aria-label', `Go to slide ${index + 1}`);
        thumbnail.setAttribute('tabindex', '0');

        // Slide number
        const number = document.createElement('div');
        number.className = 'slide-thumbnail__number';
        number.textContent = String(index + 1);

        // Slide title
        const title = document.createElement('div');
        title.className = 'slide-thumbnail__title';
        title.textContent = slide.title || `Slide ${index + 1}`;

        thumbnail.appendChild(number);
        thumbnail.appendChild(title);

        // Action buttons (move up / down) — revealed on hover or for the
        // current slide via CSS (no JS display toggling needed).
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'slide-thumbnail__actions';

        // Move up button
        if (index > 0) {
            const moveUpBtn = this._createActionBtn(
                'Move slide up',
                'Move slide up',
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>'
            );
            moveUpBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._moveSlide(index, 'up');
            });
            actionsContainer.appendChild(moveUpBtn);
        }

        // Move down button
        if (index < this._deck.slides.length - 1) {
            const moveDownBtn = this._createActionBtn(
                'Move slide down',
                'Move slide down',
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>'
            );
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

        // Right-click → open the slide context menu
        thumbnail.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this._controller.slideNavigator.goTo(index);
            this._contextMenu.open(e.clientX, e.clientY, index);
        });

        return thumbnail;
    }

    /**
     * Build a small action button for the visible-on-current-slide controls.
     * @param {string} ariaLabel
     * @param {string} title
     * @param {string} svg  inline SVG markup
     * @returns {HTMLButtonElement}
     */
    _createActionBtn(ariaLabel, title, svg) {
        const btn = document.createElement('button');
        btn.className = 'slide-thumbnail__action-btn';
        btn.type = 'button';
        btn.setAttribute('aria-label', ariaLabel);
        btn.setAttribute('title', title);
        btn.innerHTML = svg;
        return btn;
    }

    /**
     * Bind the pinned "Add Slide" footer button (below the scrollable list).
     */
    _bindAddSlideFooter() {
        const btn = this._elements.addSlideFooterBtn
            || document.getElementById('addSlideFooterBtn');
        if (!btn) return;
        btn.addEventListener('click', () => this._addNewSlide());
    }

    /**
     * Create a new slide via the edit controller's layout picker.
     * Used by the right-click menu ("New" → after this index) and the
     * footer "+ Add Slide" button (which appends to the end).
     * @param {number} [afterIndex] insert after this index, default = end
     */
    _addNewSlide(afterIndex) {
        const editController = window.__WEBDECK_EDIT_CONTROLLER__;
        if (!editController) {
            console.warn('Edit controller not available');
            return;
        }
        if (typeof afterIndex === 'number') {
            this._controller.slideNavigator.goTo(afterIndex);
        }
        editController.showLayoutPicker();
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
            if (index === currentIndex) {
                thumbnail.classList.add('current');
                thumbnail.setAttribute('aria-current', 'true');
            } else {
                thumbnail.classList.remove('current');
                thumbnail.removeAttribute('aria-current');
            }
            // Action buttons (move up / down) are revealed via CSS when
            // the thumbnail is hovered or has the .current class — no JS
            // toggling required.
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

/**
 * SlideContextMenu
 *
 * A minimal right-click context menu for slide thumbnails.  Rendered into
 * `document.body` on `open()` and removed on any outside click or Escape
 * keypress.  Lives in the same file as `SlideThumbnails` because it has
 * to call back into it for "New after this slide".
 */
class SlideContextMenu {
    constructor(thumbnails) {
        this._thumbnails = thumbnails;
        this._menuEl = null;
        this._index = -1;
    }

    init() {
        // Global handlers — close the menu on any outside click, scroll,
        // resize, or Escape.  Registered once at startup.
        document.addEventListener('click', () => this.close());
        document.addEventListener('scroll', () => this.close(), true);
        window.addEventListener('resize', () => this.close());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.close();
        });
    }

    /**
     * Open the menu at (x, y) screen coordinates for the given slide index.
     * @param {number} clientX
     * @param {number} clientY
     * @param {number} index
     */
    open(clientX, clientY, index) {
        this.close();
        this._index = index;

        const menu = document.createElement('div');
        menu.className = 'slide-context-menu';
        menu.setAttribute('role', 'menu');
        menu.style.left = `${clientX}px`;
        menu.style.top = `${clientY}px`;

        const items = [
            { label: 'New slide after', kbd: 'Alt+N', action: () => this._newAfter() },
            { label: 'Duplicate slide', kbd: 'Alt+D', action: () => this._duplicate() },
            { label: 'Delete slide', kbd: 'Alt+⌫', action: () => this._delete() },
        ];

        for (const item of items) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'slide-context-menu__item';
            btn.setAttribute('role', 'menuitem');
            btn.innerHTML = `
                <span class="slide-context-menu__label">${item.label}</span>
                <kbd class="slide-context-menu__hint">${item.kbd}</kbd>
            `;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.close();
                item.action();
            });
            menu.appendChild(btn);
        }

        document.body.appendChild(menu);
        this._menuEl = menu;

        // If the menu would overflow the viewport, shift it back into bounds.
        const rect = menu.getBoundingClientRect();
        const overflowX = rect.right - window.innerWidth;
        const overflowY = rect.bottom - window.innerHeight;
        if (overflowX > 0) menu.style.left = `${Math.max(4, clientX - overflowX - 4)}px`;
        if (overflowY > 0) menu.style.top = `${Math.max(4, clientY - overflowY - 4)}px`;
    }

    close() {
        if (this._menuEl) {
            this._menuEl.remove();
            this._menuEl = null;
            this._index = -1;
        }
    }

    _newAfter() {
        // Show the layout picker so the user can pick a layout for the new
        // slide.  The current slide is already the one we right-clicked on.
        this._thumbnails._addNewSlide(this._index);
    }

    _duplicate() {
        const editController = window.__WEBDECK_EDIT_CONTROLLER__;
        if (!editController) return;
        editController.duplicateSlide();
    }

    _delete() {
        const editController = window.__WEBDECK_EDIT_CONTROLLER__;
        if (!editController) return;
        editController.deleteSlide();
    }
}
