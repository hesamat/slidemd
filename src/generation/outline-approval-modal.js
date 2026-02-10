/**
 * Outline Approval Modal
 * Modal for reviewing and editing generated slide outlines
 */

import { Notification } from "../renderer/notification.js";
import { LayoutData } from "../data/layout-data.js";

export class OutlineApprovalModal {
    static backdrop = null;

    /**
     * Show outline approval modal
     * @param {Array<Object>} outline - Generated outline
     * @param {Object} profile - Course profile
     * @returns {Promise<Array<Object>|null>} Approved outline (may be modified) or null if cancelled
     */
    static async show(outline, profile) {
        return new Promise((resolve) => {
            const backdrop = this.createModal(outline);
            document.body.appendChild(backdrop);

            const confirmBtn = backdrop.querySelector('.outline-modal__btn--primary');
            const cancelBtn = backdrop.querySelector('.outline-modal__btn--secondary');
            const regenerateBtn = backdrop.querySelector('.outline-modal__btn--regenerate');
            const addSlideBtn = backdrop.querySelector('.outline-modal__add-slide');
            const closeBtn = backdrop.querySelector('.modal__close');
            const overlay = backdrop.querySelector('.modal__overlay');

            // Update slide count
            const updateSlideCount = () => {
                const count = backdrop.querySelectorAll('.outline-slide').length;
                const countEl = backdrop.querySelector('.outline-modal__slide-count');
                if (countEl) countEl.textContent = `${count} slide${count !== 1 ? 's' : ''}`;
            };
            updateSlideCount();

            // Add new slide
            addSlideBtn.onclick = () => {
                const slidesContainer = backdrop.querySelector('.outline-modal__slides');
                const newSlide = this.createSlideElement({
                    slideNumber: slidesContainer.children.length + 1,
                    title: 'New Slide',
                    layout: 'focus',
                    type: 'lecture',
                    content: '# New Slide\n\nAdd your content here'
                });
                slidesContainer.appendChild(newSlide);
                updateSlideCount();
                OutlineApprovalModal.updateSlideNumbers(backdrop);
                newSlide.querySelector('.outline-slide__title-input')?.focus();
            };

            // Confirm and return edited outline
            confirmBtn.onclick = () => {
                const editedOutline = this.collectOutlineData(backdrop);

                // Validate outline
                const validation = this.validateOutline(editedOutline);
                if (!validation.valid) {
                    Notification.error('Please fix the errors: ' + validation.errors.join(', '));
                    return;
                }

                cleanup();
                resolve(editedOutline);
            };

            // Cancel
            cancelBtn.onclick = () => {
                cleanup();
                resolve(null);
            };

            // Close button or overlay
            closeBtn.onclick = () => {
                cleanup();
                resolve(null);
            };

            overlay.onclick = () => {
                cleanup();
                resolve(null);
            };

            // Regenerate (returns to previous step)
            regenerateBtn.onclick = () => {
                cleanup();
                resolve('regenerate');
            };

            // Close on escape
            const onEscape = (e) => {
                if (e.key === 'Escape') {
                    cleanup();
                    resolve(null);
                }
            };
            document.addEventListener('keydown', onEscape);

            const cleanup = () => {
                backdrop.classList.add('hide');
                setTimeout(() => backdrop.remove(), 200);
                document.removeEventListener('keydown', onEscape);
            };
        });
    }

    /**
     * Create the modal DOM structure
     * @param {Array<Object>} outline - Outline data
     * @returns {HTMLElement} Modal element
     */
    static createModal(outline) {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal';

        const slidesHtml = outline.map((slide, index) => this.createSlideHtml(slide, index)).join('');

        backdrop.innerHTML = `
            <div class="modal__overlay"></div>
            <div class="modal__dialog outline-modal">
                <div class="modal__header">
                    <h2 class="modal__title">Review & Edit Outline</h2>
                    <button class="modal__close" aria-label="Close">&times;</button>
                </div>
                <div class="modal__body">
                    <div class="outline-modal__toolbar">
                        <div class="outline-modal__toolbar-group">
                            <span class="outline-modal__slide-count">${outline.length} slide${outline.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div class="outline-modal__summary">
                            <div class="outline-modal__summary-item">
                                <strong>Tip:</strong> Drag slides to reorder • Edit content • Add/remove slides
                            </div>
                        </div>
                    </div>
                    <div class="outline-modal__slides">
                        ${slidesHtml}
                    </div>
                    <button type="button" class="outline-modal__add-slide">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        Add Slide
                    </button>
                </div>
                <div class="outline-modal__footer">
                    <button type="button" class="outline-modal__btn outline-modal__btn--secondary outline-modal__btn--regenerate">← Regenerate</button>
                    <div class="outline-modal__footer-actions">
                        <button type="button" class="outline-modal__btn outline-modal__btn--secondary">Cancel</button>
                        <button type="button" class="outline-modal__btn outline-modal__btn--primary">Generate Deck →</button>
                    </div>
                </div>
            </div>
        `;

        // Attach slide event handlers
        this.attachSlideHandlers(backdrop);

        return backdrop;
    }

    /**
     * Create HTML for a single slide
     * @param {Object} slide - Slide data
     * @param {number} index - Slide index
     * @returns {string} HTML string
     */
    static createSlideHtml(slide, index) {
        const layouts = LayoutData.getAllLayouts();
        const layoutOptions = layouts.map(l =>
            `<option value="${l}" ${slide.layout === l ? 'selected' : ''}>${l}</option>`
        ).join('');

        // Use content if available, otherwise fall back to keyPoints for backward compatibility
        const content = slide.content || (slide.keyPoints || []).join('\n');

        return `
            <div class="outline-slide" draggable="true" data-slide-index="${index}">
                <div class="outline-slide__header">
                    <div class="outline-slide__drag-handle" title="Drag to reorder">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="9" cy="5" r="1"></circle>
                            <circle cx="9" cy="12" r="1"></circle>
                            <circle cx="9" cy="19" r="1"></circle>
                            <circle cx="15" cy="5" r="1"></circle>
                            <circle cx="15" cy="12" r="1"></circle>
                            <circle cx="15" cy="19" r="1"></circle>
                        </svg>
                    </div>
                    <div class="outline-slide__number">${index + 1}</div>
                    <input type="text" class="outline-slide__title-input" value="${this.escapeHtml(slide.title || '')}" placeholder="Slide title">
                    <select class="outline-slide__layout-select">
                        ${layoutOptions}
                    </select>
                    <select class="outline-slide__type-select">
                        <option value="lecture" ${slide.type === 'lecture' ? 'selected' : ''}>Lecture</option>
                        <option value="activity" ${slide.type === 'activity' ? 'selected' : ''}>Activity</option>
                        <option value="summary" ${slide.type === 'summary' ? 'selected' : ''}>Summary</option>
                        <option value="title" ${slide.type === 'title' ? 'selected' : ''}>Title</option>
                    </select>
                </div>
                <div class="outline-slide__content-label">Slide Content (Markdown)</div>
                <textarea class="outline-slide__content" placeholder="# Slide Title&#10;&#10;Your slide content in markdown format...&#10;&#10;- Bullet point 1&#10;- Bullet point 2">${this.escapeHtml(content)}</textarea>
                <div class="outline-slide__actions">
                    <button type="button" class="outline-slide__btn outline-slide__btn--move-up" title="Move up">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="18 15 12 9 6 15"></polyline>
                        </svg>
                    </button>
                    <button type="button" class="outline-slide__btn outline-slide__btn--move-down" title="Move down">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>
                    <button type="button" class="outline-slide__btn outline-slide__btn--duplicate" title="Duplicate">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </button>
                    <button type="button" class="outline-slide__btn outline-slide__btn--delete" title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Create a slide element (for adding new slides)
     * @param {Object} slide - Slide data
     * @returns {HTMLElement} Slide element
     */
    static createSlideElement(slide) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = this.createSlideHtml(slide, 0);
        return wrapper.firstElementChild;
    }

    /**
     * Attach event handlers to slide elements
     * @param {HTMLElement} backdrop - Modal backdrop
     */
    static attachSlideHandlers(backdrop) {
        const slidesContainer = backdrop.querySelector('.outline-modal__slides');

        // Drag and drop reordering
        let draggedSlide = null;

        slidesContainer.addEventListener('dragstart', (e) => {
            const slide = e.target.closest('.outline-slide');
            if (slide) {
                draggedSlide = slide;
                slide.classList.add('dragging');
            }
        });

        slidesContainer.addEventListener('dragend', (e) => {
            const slide = e.target.closest('.outline-slide');
            if (slide) {
                slide.classList.remove('dragging');
                updateSlideNumbers();
            }
            draggedSlide = null;
        });

        slidesContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            const slide = e.target.closest('.outline-slide');
            if (slide && slide !== draggedSlide) {
                const rect = slide.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    slide.parentNode.insertBefore(draggedSlide, slide);
                } else {
                    slide.parentNode.insertBefore(draggedSlide, slide.nextSibling);
                }
            }
        });

        // Slide action buttons
        slidesContainer.addEventListener('click', (e) => {
            const slide = e.target.closest('.outline-slide');
            if (!slide) return;

            const moveUpBtn = e.target.closest('.outline-slide__btn--move-up');
            const moveDownBtn = e.target.closest('.outline-slide__btn--move-down');
            const duplicateBtn = e.target.closest('.outline-slide__btn--duplicate');
            const deleteBtn = e.target.closest('.outline-slide__btn--delete');

            if (moveUpBtn) {
                const prev = slide.previousElementSibling;
                if (prev) {
                    slide.parentNode.insertBefore(slide, prev);
                    updateSlideNumbers();
                }
            } else if (moveDownBtn) {
                const next = slide.nextElementSibling;
                if (next) {
                    slide.parentNode.insertBefore(next, slide);
                    updateSlideNumbers();
                }
            } else if (duplicateBtn) {
                const cloned = this.collectSlideData(slide);
                cloned.title += ' (copy)';
                const newSlide = this.createSlideElement(cloned);
                slide.parentNode.insertBefore(newSlide, slide.nextSibling);
                updateSlideNumbers();
                updateSlideCount();
            } else if (deleteBtn) {
                const slides = slidesContainer.querySelectorAll('.outline-slide');
                if (slides.length > 1) {
                    slide.remove();
                    updateSlideNumbers();
                    updateSlideCount();
                } else {
                    Notification.warning('Cannot delete the last slide');
                }
            }
        });

        function updateSlideNumbers() {
            backdrop.querySelectorAll('.outline-slide').forEach((slide, index) => {
                slide.querySelector('.outline-slide__number').textContent = index + 1;
            });
        }

        function updateSlideCount() {
            const count = backdrop.querySelectorAll('.outline-slide').length;
            const countEl = backdrop.querySelector('.outline-modal__slide-count');
            if (countEl) countEl.textContent = `${count} slide${count !== 1 ? 's' : ''}`;
        }
    }

    /**
     * Update slide numbers after reordering
     * @param {HTMLElement} backdrop - Modal backdrop
     */
    static updateSlideNumbers(backdrop) {
        backdrop.querySelectorAll('.outline-slide').forEach((slide, index) => {
            slide.querySelector('.outline-slide__number').textContent = index + 1;
        });
    }

    /**
     * Collect outline data from DOM
     * @param {HTMLElement} backdrop - Modal backdrop
     * @returns {Array<Object>} Outline data
     */
    static collectOutlineData(backdrop) {
        const slides = backdrop.querySelectorAll('.outline-slide');
        return Array.from(slides).map((slide, index) => this.collectSlideData(slide, index));
    }

    /**
     * Collect data from a single slide element
     * @param {HTMLElement} slideEl - Slide element
     * @param {number} index - Slide index
     * @returns {Object} Slide data
     */
    static collectSlideData(slideEl, index = null) {
        const content = slideEl.querySelector('.outline-slide__content').value.trim();

        return {
            slideNumber: index !== null ? index + 1 : parseInt(slideEl.dataset.slideIndex) + 1,
            title: slideEl.querySelector('.outline-slide__title-input').value.trim(),
            layout: slideEl.querySelector('.outline-slide__layout-select').value,
            type: slideEl.querySelector('.outline-slide__type-select').value,
            content: content || '# Slide Title\n\nAdd your content here'
        };
    }

    /**
     * Validate outline structure
     * @param {Array<Object>} outline - The outline to validate
     * @returns {Object} { valid: boolean, errors: Array<string> }
     */
    static validateOutline(outline) {
        const errors = [];

        if (!Array.isArray(outline)) {
            return { valid: false, errors: ['Outline must be an array'] };
        }

        if (outline.length === 0) {
            errors.push('Outline must have at least one slide');
        }

        outline.forEach((slide, index) => {
            if (!slide.title || slide.title.trim() === '') {
                errors.push(`Slide ${index + 1}: Missing title`);
            }

            if (!slide.layout || !LayoutData.hasLayout(slide.layout)) {
                errors.push(`Slide ${index + 1}: Invalid layout "${slide.layout || '(none)'}"`);
            } else {
                // Validate that content contains required @area markers for this layout
                const requiredAreas = LayoutData.getAreaNames(slide.layout);
                const content = slide.content || '';
                
                // Check each required area (skip if layout only has "main" which doesn't require @area marker)
                if (requiredAreas.length > 1 || (requiredAreas.length === 1 && requiredAreas[0] !== 'main')) {
                    for (const area of requiredAreas) {
                        const areaMarker = `@${area}`;
                        if (!content.includes(areaMarker)) {
                            errors.push(`Slide ${index + 1}: Missing required area marker "${areaMarker}" for layout "${slide.layout}"`);
                        }
                    }
                }
            }

            if (!slide.content || slide.content.trim() === '') {
                errors.push(`Slide ${index + 1}: Missing content`);
            }
        });

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    static escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
