/**
 * Course Profile Modal
 * Modal for creating and editing course profiles
 */

import { Notification } from "../renderer/notification.js";
import { CourseProfileManager } from "./course-profile-manager.js";

export class CourseProfileModal {
    static backdrop = null;

    /**
     * Show course profile creation/editing modal
     * @param {Object} existingProfile - Existing profile to edit (null for new)
     * @returns {Promise<Object|null>} Created/updated profile or null if cancelled
     */
    static async show(existingProfile = null) {
        return new Promise((resolve) => {
            const backdrop = this.createModal(existingProfile);
            document.body.appendChild(backdrop);

            // Focus first input
            const firstInput = backdrop.querySelector('input');
            firstInput?.focus();

            // Handle form submission
            const form = backdrop.querySelector('.course-profile-modal__form');
            const confirmBtn = backdrop.querySelector('.course-profile-modal__btn--primary');
            const cancelBtn = backdrop.querySelector('.course-profile-modal__btn--secondary');

            const submit = () => {
                const profile = this.collectFormData(form);
                const validation = CourseProfileManager.validateProfile(profile);

                if (!validation.valid) {
                    Notification.error('Please fix the errors: ' + validation.errors.join(', '));
                    return;
                }

                cleanup();
                resolve(profile);
            };

            confirmBtn.onclick = submit;
            form.onsubmit = (e) => {
                e.preventDefault();
                submit();
            };

            cancelBtn.onclick = () => {
                cleanup();
                resolve(null);
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
     * Show profile list modal for selecting/editing/deleting profiles
     * @returns {Promise<Object|null>} Selected profile or null if cancelled
     */
    static async showList() {
        return new Promise(async (resolve) => {
            const profiles = await CourseProfileManager.loadAllProfiles();

            const backdrop = this.createListModal(profiles);
            document.body.appendChild(backdrop);

            // Handle create new
            const createBtn = backdrop.querySelector('.course-profile-list-modal__create');
            const importBtn = backdrop.querySelector('.course-profile-list-modal__import');
            // Get cancel button by finding the button in actions that's not create/import
            const cancelBtn = Array.from(backdrop.querySelectorAll('.course-profile-list-modal__actions .course-profile-modal__btn'))
                .find(btn => !btn.classList.contains('course-profile-list-modal__create') && !btn.classList.contains('course-profile-list-modal__import'));

            createBtn.onclick = async () => {
                backdrop.classList.add('hide');
                setTimeout(() => backdrop.remove(), 200);

                const newProfile = await this.show();
                if (newProfile) {
                    const saved = await CourseProfileManager.saveProfile(newProfile);
                    if (saved) {
                        resolve(newProfile);
                    } else {
                        resolve(null);
                    }
                } else {
                    // User cancelled, reshow list
                    const result = await this.showList();
                    resolve(result);
                }
            };

            importBtn.onclick = async () => {
                const imported = await CourseProfileManager.importProfile();
                if (imported) {
                    const saved = await CourseProfileManager.saveProfile(imported);
                    if (!saved) {
                        return;
                    }

                    cleanup();
                    const result = await this.showList();
                    resolve(result);
                }
            };

            cancelBtn.onclick = () => {
                cleanup();
                resolve(null);
            };

            // Handle profile item clicks
            const handleProfileAction = async (profileId, action) => {
                const profile = await CourseProfileManager.loadProfile(profileId);
                if (!profile) return;

                if (action === 'select') {
                    cleanup();
                    resolve(profile);
                } else if (action === 'edit') {
                    backdrop.classList.add('hide');
                    setTimeout(() => backdrop.remove(), 200);

                    const edited = await this.show(profile);
                    if (edited) {
                        const saved = await CourseProfileManager.saveProfile(edited);
                        if (saved) {
                            resolve(edited);
                        } else {
                            resolve(null);
                        }
                    } else {
                        // User cancelled, reshow list
                        const result = await this.showList();
                        resolve(result);
                    }
                } else if (action === 'delete') {
                    const confirmed = await Notification.confirm(
                        `Delete profile "${profile.name}"?`
                    );
                    if (confirmed) {
                        await CourseProfileManager.deleteProfile(profileId);
                        // Refresh the list
                        backdrop.classList.add('hide');
                        setTimeout(() => backdrop.remove(), 200);
                        const result = await this.showList();
                        resolve(result);
                    }
                }
            };

            // Attach event listeners to profile items
            backdrop.querySelectorAll('.course-profile-list-modal__item').forEach(item => {
                const profileId = item.dataset.profileId;

                // Click on item to select
                item.onclick = () => handleProfileAction(profileId, 'select');

                // Action buttons
                const editBtn = item.querySelector('.course-profile-list-modal__item-btn--edit');
                const deleteBtn = item.querySelector('.course-profile-list-modal__item-btn--delete');

                if (editBtn) {
                    editBtn.onclick = (e) => {
                        e.stopPropagation();
                        handleProfileAction(profileId, 'edit');
                    };
                }

                if (deleteBtn) {
                    deleteBtn.onclick = (e) => {
                        e.stopPropagation();
                        handleProfileAction(profileId, 'delete');
                    };
                }
            });

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
     * Create the modal DOM structure for profile creation/editing
     * @param {Object} profile - Existing profile or null
     * @returns {HTMLElement} Modal element
     */
    static createModal(profile) {
        const isEdit = profile !== null;
        const p = profile || CourseProfileManager.createProfile();

        const backdrop = document.createElement('div');
        backdrop.className = 'modal';

        backdrop.innerHTML = `
            <div class="modal__overlay"></div>
            <div class="modal__dialog course-profile-modal">
                <div class="modal__header">
                    <h2 class="modal__title">${isEdit ? 'Edit Course Profile' : 'New Course Profile'}</h2>
                    <button class="modal__close" aria-label="Close">&times;</button>
                </div>
                <div class="modal__body">
                    <form class="course-profile-modal__form">
                        <div class="course-profile-modal__form-group">
                            <label class="course-profile-modal__label">
                                Profile Name <span class="course-profile-modal__label-required">*</span>
                            </label>
                            <input type="text" class="course-profile-modal__input" name="name" value="${this.escapeHtml(p.name)}" placeholder="e.g., Introduction to Algorithms" required>
                        </div>

                        <div class="course-profile-modal__form-group">
                            <label class="course-profile-modal__label">Description</label>
                            <textarea class="course-profile-modal__textarea" name="description" placeholder="e.g., CS 201 - Fall 2025" rows="2">${this.escapeHtml(p.description || '')}</textarea>
                        </div>

                        <div class="course-profile-modal__form-group">
                            <label class="course-profile-modal__label">
                                Learning Objectives <span class="course-profile-modal__label-required">*</span>
                            </label>
                            <textarea class="course-profile-modal__textarea" name="learningObjectives" rows="6" placeholder="Enter each learning objective on a new line. For example:&#10;&#10;• Understand basic algorithm analysis&#10;• Master sorting and searching algorithms&#10;• Learn dynamic programming fundamentals" required>${this.escapeHtml((p.learningObjectives || []).join('\n'))}</textarea>
                            <div class="course-profile-modal__helper">Enter each learning objective on a new line (you can paste multiple lines at once)</div>
                        </div>

                        <div class="course-profile-modal__form-group">
                            <label class="course-profile-modal__label">Topics Previously Covered (Optional)</label>
                            <textarea class="course-profile-modal__textarea" name="topicsCovered" rows="4" placeholder="List topics that have already been covered in the course. This helps the AI avoid redundancy and build on prior knowledge.&#10;&#10;For example:&#10;• Arrays and linked lists&#10;• Basic data structures&#10;• Time complexity basics">${this.escapeHtml(p.topicsCovered || '')}</textarea>
                            <div class="course-profile-modal__helper">Optional: Enter topics that have already been covered (one per line)</div>
                        </div>

                        <div class="course-profile-modal__row">
                            <div class="course-profile-modal__form-group">
                                <label class="course-profile-modal__label">Default Slide Count</label>
                                <input type="number" class="course-profile-modal__input" name="defaultSlideCount" value="${p.defaultSlideCount || 15}" min="1" max="100" placeholder="15">
                            </div>

                            <div class="course-profile-modal__form-group">
                                <label class="course-profile-modal__label">AI Provider</label>
                                <select class="course-profile-modal__select" name="aiProvider">
                                    <option value="glm" ${p.aiProvider === 'glm' ? 'selected' : ''}>GLM (Zhipu AI)</option>
                                    <option value="openai" ${p.aiProvider === 'openai' ? 'selected' : ''}>OpenAI</option>
                                    <option value="anthropic" ${p.aiProvider === 'anthropic' ? 'selected' : ''}>Anthropic Claude</option>
                                </select>
                            </div>
                        </div>

                        <div class="course-profile-modal__form-group">
                            <div class="course-profile-modal__checkbox-group">
                                <input type="checkbox" class="course-profile-modal__checkbox" name="includeActivities" id="includeActivities" ${p.includeActivities ? 'checked' : ''}>
                                <label for="includeActivities" class="course-profile-modal__checkbox-label">Include in-class activities by default</label>
                            </div>
                        </div>

                        <div class="course-profile-modal__actions">
                            <button type="button" class="course-profile-modal__btn course-profile-modal__btn--secondary">Cancel</button>
                            <button type="submit" class="course-profile-modal__btn course-profile-modal__btn--primary">${isEdit ? 'Save Changes' : 'Create Profile'}</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        // Close button handler
        backdrop.querySelector('.modal__close').onclick = () => {
            backdrop.classList.add('hide');
            setTimeout(() => backdrop.remove(), 200);
        };

        // Overlay click to close
        backdrop.querySelector('.modal__overlay').onclick = () => {
            backdrop.classList.add('hide');
            setTimeout(() => backdrop.remove(), 200);
        };

        return backdrop;
    }

    /**
     * Create the profile list modal
     * @param {Array<Object>} profiles - Array of course profiles
     * @returns {HTMLElement} Modal element
     */
    static createListModal(profiles) {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal';

        const profilesHtml = profiles.length === 0 ? `
            <div class="course-profile-list-modal__empty">
                <div class="course-profile-list-modal__empty-icon">📚</div>
                <p>No course profiles yet</p>
                <p style="font-size: 13px; margin-top: 8px;">Create a profile to get started with AI-powered deck generation</p>
            </div>
        ` : `
            <div class="course-profile-list-modal__list">
                ${profiles.map(p => `
                    <div class="course-profile-list-modal__item" data-profile-id="${p.id}">
                        <div style="font-size: 24px;">📚</div>
                        <div class="course-profile-list-modal__item-info">
                            <div class="course-profile-list-modal__item-name">${this.escapeHtml(p.name)}</div>
                            <div class="course-profile-list-modal__item-description">${this.escapeHtml(p.description || 'No description')}</div>
                            <div class="course-profile-list-modal__item-meta">
                                ${p.learningObjectives?.length || 0} objectives • ${p.defaultSlideCount || 15} slides • ${p.aiProvider || 'glm'}
                            </div>
                        </div>
                        <div class="course-profile-list-modal__item-actions">
                            <button class="course-profile-list-modal__item-btn course-profile-list-modal__item-btn--edit" title="Edit">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                            <button class="course-profile-list-modal__item-btn course-profile-list-modal__item-btn--delete" title="Delete">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        backdrop.innerHTML = `
            <div class="modal__overlay"></div>
            <div class="modal__dialog course-profile-list-modal">
                <div class="modal__header">
                    <h2 class="modal__title">Course Profiles</h2>
                    <button class="modal__close" aria-label="Close">&times;</button>
                </div>
                <div class="modal__body">
                    ${profilesHtml}
                </div>
                <div class="course-profile-list-modal__actions">
                    <div class="course-profile-list-modal__action-group">
                        <button class="course-profile-modal__btn course-profile-modal__btn--primary course-profile-list-modal__create">New Profile</button>
                        <button class="course-profile-modal__btn course-profile-modal__btn--secondary course-profile-list-modal__import">Import</button>
                    </div>
                    <button class="course-profile-modal__btn course-profile-modal__btn--secondary">Cancel</button>
                </div>
            </div>
        `;

        // Close button handler
        backdrop.querySelector('.modal__close').onclick = () => {
            backdrop.classList.add('hide');
            setTimeout(() => backdrop.remove(), 200);
        };

        // Overlay click to close
        backdrop.querySelector('.modal__overlay').onclick = () => {
            backdrop.classList.add('hide');
            setTimeout(() => backdrop.remove(), 200);
        };

        return backdrop;
    }

    /**
     * Collect form data into profile object
     * @param {HTMLFormElement} form - Form element
     * @returns {Object} Profile object
     */
    static collectFormData(form) {
        // Parse learning objectives from textarea (one per line)
        const objectivesText = form.querySelector('[name="learningObjectives"]').value;
        const objectives = objectivesText
            .split('\n')
            .map(line => line.trim())
            // Remove common bullet point prefixes
            .map(line => line.replace(/^[\s\-*••]\*/, '').trim())
            .filter(line => line !== '');

        // Parse topics covered from textarea (one per line)
        const topicsText = form.querySelector('[name="topicsCovered"]').value;
        const topics = topicsText
            .split('\n')
            .map(line => line.trim())
            // Remove common bullet point prefixes
            .map(line => line.replace(/^[\s\-*••]\*/, '').trim())
            .filter(line => line !== '');

        const profile = CourseProfileManager.createProfile({
            name: form.querySelector('[name="name"]').value.trim(),
            description: form.querySelector('[name="description"]').value.trim(),
            learningObjectives: objectives,
            topicsCovered: topics.length > 0 ? topics.join('\n') : '',
            defaultSlideCount: parseInt(form.querySelector('[name="defaultSlideCount"]').value) || 15,
            includeActivities: form.querySelector('[name="includeActivities"]').checked,
            aiProvider: form.querySelector('[name="aiProvider"]').value
        });

        return profile;
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
