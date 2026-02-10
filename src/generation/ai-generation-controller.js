/**
 * AI Generation Controller
 * Main controller for the AI-powered deck generation workflow
 */

import { CourseProfileManager } from "./course-profile-manager.js";
import { CourseProfileModal } from "./course-profile-modal.js";
import { AIConfigModal } from "./ai-config-modal.js";
import { OutlineGenerator } from "./outline-generator.js";
import { OutlineApprovalModal } from "./outline-approval-modal.js";
import { DeckGenerator } from "./deck-generator.js";
import { AIProviderRegistry } from "./ai-provider-registry.js";
import { Notification } from "../renderer/notification.js";
import { DeckLoader } from "../data/deck-loader.js";

export class AIGenerationController {
    constructor(deck, controller, elements) {
        this.deck = deck;
        this.controller = controller;
        this.elements = elements;
        this.currentProfile = null;
        this.currentOutline = null;
        this.isGenerating = false;
        this.abortController = null;
    }

    /**
     * Initialize the generation controller
     */
    init() {
        // Initialization happens via GenerationActions
    }

    /**
     * Show course profile manager modal
     */
    async showProfileManager() {
        // Just show the profile list - it will handle empty state gracefully
        // Directory is only needed when creating/saving profiles
        const profile = await CourseProfileModal.showList();
        if (profile) {
            this.currentProfile = profile;
            Notification.info(`Selected: ${profile.name}`);
        }
    }

    /**
     * Show AI configuration modal
     */
    async showAIConfig() {
        const config = await AIConfigModal.show();
        if (config) {
            Notification.success(`AI configuration saved for ${config.providerId}`);
        }
    }

    /**
     * Start deck generation workflow
     */
    async startGeneration() {
        if (this.isGenerating) {
            Notification.info('Generation already in progress');
            return;
        }

        this.isGenerating = true;
        this.abortController = new AbortController();

        let topic = null;
        let options = null;

        // Step 1: Ensure we have a profile
        try {
            if (!this.currentProfile) {
                await this.showProfileManager();
                if (!this.currentProfile) {
                    return; // User cancelled
                }
            }

            // Step 2: Ensure AI is configured
            const apiKey = this.getApiKey(this.currentProfile.aiProvider);
            if (!apiKey) {
                Notification.info('Please configure your AI settings first');
                await this.showAIConfig();
                if (!this.getApiKey(this.currentProfile.aiProvider)) {
                    return; // User cancelled or didn't configure
                }
            }

            // Step 3: Get topic from user
            topic = await this.promptForTopic();
            if (!topic) {
                return; // User cancelled
            }

            // Step 4: Get generation options
            options = await this.promptForOptions();
            if (!options) {
                return; // User cancelled
            }

            // Step 5: Generate outline
            const loadingModal = this.showLoadingModal('Generating outline with AI...', {
                allowCancel: true,
                onCancel: () => this.abortGeneration()
            });

            let outline = null;
            try {
                outline = await OutlineGenerator.generateOutline(
                    this.currentProfile,
                    topic,
                    { ...options, signal: this.abortController?.signal}
                    //  useMockResponse: true, mockResponseUrl: '/src/generation/mock-outline.json' 
                );
            } catch (error) {
                if (error.name === 'AbortError') {
                    Notification.info('Generation cancelled');
                    return;
                }

                if (error.rawResponse) {
                    outline = await this.showOutlineParseError(error, topic, options);
                    if (!outline) {
                        return;
                    }
                } else {
                    await this.showGenerationError(error);
                    return;
                }
            } finally {
                this.hideLoadingModal(loadingModal);
            }

            this.currentOutline = outline;

            // Step 6: Review and approve outline
            const approvedOutline = await OutlineApprovalModal.show(
                this.currentOutline,
                this.currentProfile
            );

            if (approvedOutline === 'regenerate') {
                this.abortGeneration();
                await this.startGeneration();
                return;
            }

            if (!approvedOutline) {
                Notification.info('Generation cancelled');
                return;
            }

            this.currentOutline = approvedOutline;

            // Step 7: Generate full deck
            const deckLoadingModal = this.showLoadingModal('Generating deck markdown...');
            try {
                const markdown = await DeckGenerator.generateDeck(
                    this.currentProfile,
                    this.currentOutline,
                    topic
                );
                // Step 8: Show preview and options
                await this.showDeckPreview(markdown, topic);
            } finally {
                this.hideLoadingModal(deckLoadingModal);
            }
        } catch (error) {
            console.error('Generation failed:', error);
            if (error.name !== 'AbortError') {
                await this.showGenerationError(error);
            }
        } finally {
            this.isGenerating = false;
            this.abortController = null;
        }
    }

    /**
     * Abort the current generation flow
     */
    abortGeneration() {
        if (this.abortController) {
            this.abortController.abort();
        }
    }

    /**
     * Prompt user for topic
     * @returns {Promise<string|null>} Topic or null if cancelled
     */
    async promptForTopic() {
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.className = 'modal';
            backdrop.innerHTML = `
                <div class="modal__overlay"></div>
                <div class="modal__dialog" style="max-width: 500px;">
                    <div class="modal__header">
                        <h2 class="modal__title">Generate Slide Deck</h2>
                        <button class="modal__close" aria-label="Close">&times;</button>
                    </div>
                    <div class="modal__body">
                        <form id="topicForm">
                            <div style="margin-bottom: 16px;">
                                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--text-medium);">
                                    Profile: <strong style="color: var(--text-high);">${this.currentProfile?.name || 'None selected'}</strong>
                                </label>
                            </div>
                            <div style="margin-bottom: 16px;">
                                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--text-medium);">
                                    Topic <span style="color: #ef4444;">*</span>
                                </label>
                                <input type="text" id="topicInput" class="course-profile-modal__input" placeholder="e.g., Binary Search Trees" required>
                            </div>
                            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                                <button type="button" class="course-profile-modal__btn course-profile-modal__btn--secondary" id="cancelBtn">Cancel</button>
                                <button type="submit" class="course-profile-modal__btn course-profile-modal__btn--primary">Continue</button>
                            </div>
                        </form>
                    </div>
                </div>
            `;

            document.body.appendChild(backdrop);

            const form = backdrop.querySelector('#topicForm');
            const input = backdrop.querySelector('#topicInput');
            const cancelBtn = backdrop.querySelector('#cancelBtn');
            const closeBtn = backdrop.querySelector('.modal__close');
            const overlay = backdrop.querySelector('.modal__overlay');

            input.focus();

            const cleanup = () => {
                backdrop.classList.add('hide');
                setTimeout(() => backdrop.remove(), 200);
            };

            form.onsubmit = (e) => {
                e.preventDefault();
                const topic = input.value.trim();
                if (topic) {
                    cleanup();
                    resolve(topic);
                }
            };

            cancelBtn.onclick = () => {
                cleanup();
                resolve(null);
            };

            closeBtn.onclick = () => {
                cleanup();
                resolve(null);
            };

            overlay.onclick = () => {
                cleanup();
                resolve(null);
            };

            // Close on escape
            const onEscape = (e) => {
                if (e.key === 'Escape') {
                    cleanup();
                    resolve(null);
                    document.removeEventListener('keydown', onEscape);
                }
            };
            document.addEventListener('keydown', onEscape);
        });
    }

    /**
     * Prompt user for generation options
     * @returns {Promise<Object|null>} Options or null if cancelled
     */
    async promptForOptions() {
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.className = 'modal';
            backdrop.innerHTML = `
                <div class="modal__overlay"></div>
                <div class="modal__dialog" style="max-width: 500px;">
                    <div class="modal__header">
                        <h2 class="modal__title">Generation Options</h2>
                        <button class="modal__close" aria-label="Close">&times;</button>
                    </div>
                    <div class="modal__body">
                        <form id="optionsForm">
                            <div style="margin-bottom: 16px;">
                                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--text-medium);">
                                    Number of Slides
                                </label>
                                <input type="number" id="slideCount" class="course-profile-modal__input" value="${this.currentProfile?.defaultSlideCount || 15}" min="3" max="50">
                            </div>
                            <div style="margin-bottom: 16px;">
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                    <input type="checkbox" id="includeActivities" ${this.currentProfile?.includeActivities ? 'checked' : ''}>
                                    <span style="font-size: 14px; color: var(--text-high);">Include in-class activities</span>
                                </label>
                            </div>
                            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                                <button type="button" class="course-profile-modal__btn course-profile-modal__btn--secondary" id="cancelBtn">Cancel</button>
                                <button type="submit" class="course-profile-modal__btn course-profile-modal__btn--primary">Generate</button>
                            </div>
                        </form>
                    </div>
                </div>
            `;

            document.body.appendChild(backdrop);

            const form = backdrop.querySelector('#optionsForm');
            const cancelBtn = backdrop.querySelector('#cancelBtn');
            const closeBtn = backdrop.querySelector('.modal__close');
            const overlay = backdrop.querySelector('.modal__overlay');

            const cleanup = () => {
                backdrop.classList.add('hide');
                setTimeout(() => backdrop.remove(), 200);
            };

            form.onsubmit = (e) => {
                e.preventDefault();
                const options = {
                    slideCount: parseInt(backdrop.querySelector('#slideCount').value) || 15,
                    includeActivities: backdrop.querySelector('#includeActivities').checked
                };
                cleanup();
                resolve(options);
            };

            cancelBtn.onclick = () => {
                cleanup();
                resolve(null);
            };

            closeBtn.onclick = () => {
                cleanup();
                resolve(null);
            };

            overlay.onclick = () => {
                cleanup();
                resolve(null);
            };

            // Close on escape
            const onEscape = (e) => {
                if (e.key === 'Escape') {
                    cleanup();
                    resolve(null);
                    document.removeEventListener('keydown', onEscape);
                }
            };
            document.addEventListener('keydown', onEscape);
        });
    }

    /**
     * Show deck preview with options
     * @param {string} markdown - Generated markdown
     * @param {string} topic - Topic
     */
    async showDeckPreview(markdown, topic) {
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.className = 'modal';
            backdrop.innerHTML = `
                <div class="modal__overlay"></div>
                <div class="modal__dialog" style="max-width: 500px;">
                    <div class="modal__header">
                        <h2 class="modal__title">Deck Generated!</h2>
                        <button class="modal__close" aria-label="Close">&times;</button>
                    </div>
                    <div class="modal__body">
                        <div style="text-align: center; margin-bottom: 20px;">
                            <div style="font-size: 48px; margin-bottom: 12px;">✅</div>
                            <p style="color: var(--text-high);">Your slide deck has been generated successfully!</p>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <button id="editBtn" class="course-profile-modal__btn course-profile-modal__btn--primary" style="width: 100%;">
                                ✏️ Edit in Markdown Editor
                            </button>
                            <button id="saveBtn" class="course-profile-modal__btn course-profile-modal__btn--secondary" style="width: 100%;">
                                💾 Save to File
                            </button>
                            <button id="cancelBtn" class="course-profile-modal__btn course-profile-modal__btn--secondary" style="width: 100%;">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(backdrop);

            const editBtn = backdrop.querySelector('#editBtn');
            const saveBtn = backdrop.querySelector('#saveBtn');
            const cancelBtn = backdrop.querySelector('#cancelBtn');
            const closeBtn = backdrop.querySelector('.modal__close');
            const overlay = backdrop.querySelector('.modal__overlay');

            const cleanup = () => {
                backdrop.classList.add('hide');
                setTimeout(() => backdrop.remove(), 200);
                resolve();
            };

            editBtn.onclick = () => {
                cleanup();
                this.loadIntoEditor(markdown, topic);
            };

            saveBtn.onclick = () => {
                cleanup();
                this.saveToFile(markdown, topic);
            };

            cancelBtn.onclick = cleanup;
            closeBtn.onclick = cleanup;
            overlay.onclick = cleanup;
        });
    }

    /**
     * Load generated deck into editor
     * @param {string} markdown - Generated markdown
     */
    async loadIntoEditor(markdown, topic = '') {
        // Load the markdown into the deck
        const fileName = this.buildDeckFileName(topic);
        await this.loadMarkdown(markdown, { fileName });
    }

    buildDeckFileName(topic) {
        const fallback = 'ai-generated.md';
        const cleanTopic = String(topic || '').toLowerCase().trim();
        if (!cleanTopic) return fallback;
        const slug = cleanTopic.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        if (!slug) return fallback;
        return `${slug}.md`;
    }

    /**
     * Save deck to file
     * @param {string} markdown - Generated markdown
     * @param {string} topic - Topic (for filename)
     */
    async saveToFile(markdown, topic) {
        const filename = `${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;

        // Use File System Access API if available
        if (window.showSaveFilePicker) {
            try {
                const fileHandle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{
                        description: 'Markdown file',
                        accept: { 'text/markdown': ['.md'] },
                    }],
                });

                const writable = await fileHandle.createWritable();
                await writable.write(markdown);
                await writable.close();

                Notification.success('Deck saved successfully!');
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Save failed:', error);
                    Notification.error('Failed to save file');
                }
            }
        } else {
            // Fallback: download as blob
            const blob = new Blob([markdown], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            Notification.success('Deck downloaded!');
        }
    }

    /**
     * Load markdown into the current deck
     * @param {string} markdown - Markdown content
     */
    async loadMarkdown(markdown, options = {}) {
        try {
            // Parse the markdown
            const deckData = await DeckLoader.parseMarkdown(markdown);

            if (!deckData || !deckData.slides) {
                throw new Error('Failed to parse markdown: no slides generated');
            }

            const { fileName } = options;

            if (markdown) {
                localStorage.setItem("webdeck_local_file", markdown);
                localStorage.setItem("webdeck_local_file_type", "md");
                if (fileName) {
                    localStorage.setItem("webdeck_local_file_name", fileName);
                }
                localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
            }

            // Update the current deck using the reload manager if available
            if (this.controller?.reloadManager?.replaceDeck) {
                await this.controller.reloadManager.replaceDeck(deckData, { startAtFirstSlide: true });
            } else {
                Object.assign(this.deck.meta, deckData.meta);
                this.deck.slides = deckData.slides;

                const slidesContainer = document.getElementById('slidesContainer');
                if (slidesContainer) {
                    slidesContainer.innerHTML = '';
                }

                if (this.controller?.render) {
                    this.controller.render();
                }
            }

            // Update editor if open
            const editor = document.getElementById('markdownEditor');
            if (editor && editor.CodeMirror) {
                editor.CodeMirror.setValue(markdown);
            }

            Notification.success('Deck loaded into editor!');
        } catch (error) {
            console.error('Failed to load markdown:', error);
            Notification.error(`Failed to load deck: ${error.message}`);
        }
    }

    /**
     * Get API key for a provider
     * @param {string} providerId - Provider ID
     * @returns {string|null} API key
     */
    getApiKey(providerId) {
        // Use the registry directly (already imported at top of file)
        return AIProviderRegistry.getApiKey(providerId);
    }

    /**
     * Show a loading modal during generation
     * @param {string} message - Message to display
     * @returns {HTMLElement} Modal element
     */
    showLoadingModal(message, { allowCancel = false, onCancel = null } = {}) {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal loading-modal';

        const cancelHtml = allowCancel
            ? `<button type="button" class="btn btn--sm loading-modal__cancel">Cancel</button>`
            : '';

        backdrop.innerHTML = `
            <div class="modal__overlay"></div>
            <div class="modal__dialog loading-modal__dialog">
                <div class="loading-modal__content">
                    <div class="loading-modal__spinner"></div>
                    <div class="loading-modal__message">${message}</div>
                    <div class="loading-modal__hint">This may take a moment...</div>
                    ${cancelHtml}
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);

        if (allowCancel) {
            const cancelBtn = backdrop.querySelector('.loading-modal__cancel');
            if (cancelBtn) {
                cancelBtn.onclick = () => {
                    if (typeof onCancel === 'function') {
                        onCancel();
                    }
                };
            }
        }

        // Trigger animation
        requestAnimationFrame(() => {
            backdrop.classList.add('show');
        });

        return backdrop;
    }

    /**
     * Hide the loading modal
     * @param {HTMLElement} modal - Modal element to hide
     */
    hideLoadingModal(modal) {
        if (!modal || !modal.parentNode) return;

        modal.classList.remove('show');
        modal.classList.add('hide');

        setTimeout(() => {
            if (modal.parentNode) {
                modal.remove();
            }
        }, 200);
    }

    /**
     * Show a detailed parse error modal with raw AI response
     * @param {Error} error - Parse error from outline generation
     * @param {string} topic - Deck topic
     * @param {Object} options - Generation options
     * @returns {Promise<Array<Object>|null>} Fallback outline or null
     */
    async showOutlineParseError(error, topic, options) {
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.className = 'modal';

            const rawResponse = error.rawResponse || '';
            const jsonPayload = error.jsonPayload || '';

            backdrop.innerHTML = `
                <div class="modal__overlay"></div>
                <div class="modal__dialog" style="max-width: 720px;">
                    <div class="modal__header">
                        <h2 class="modal__title">Outline Parsing Failed</h2>
                        <button class="modal__close" aria-label="Close">&times;</button>
                    </div>
                    <div class="modal__body" style="display: grid; gap: 12px;">
                        <div style="color: var(--text-high);">
                            The AI response could not be parsed as JSON. You can copy the raw output or continue with a basic outline.
                        </div>
                        <label style="font-size: 12px; color: var(--text-medium);">Raw Response</label>
                        <textarea class="course-profile-modal__input" style="min-height: 180px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;" readonly>${this.escapeHtml(rawResponse)}</textarea>
                        ${jsonPayload ? `<label style="font-size: 12px; color: var(--text-medium);">Extracted JSON (best effort)</label>
                        <textarea class="course-profile-modal__input" style="min-height: 120px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;" readonly>${this.escapeHtml(jsonPayload)}</textarea>` : ''}
                    </div>
                    <div class="modal__footer" style="display: flex; justify-content: space-between; align-items: center;">
                        <button type="button" class="btn btn--sm" id="copyResponseBtn">Copy Raw Response</button>
                        <div style="display: flex; gap: 10px;">
                            <button type="button" class="btn btn--sm" id="cancelBtn">Close</button>
                            <button type="button" class="btn btn--sm btn--primary" id="fallbackBtn">Use Basic Outline</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(backdrop);

            const closeBtn = backdrop.querySelector('.modal__close');
            const overlay = backdrop.querySelector('.modal__overlay');
            const cancelBtn = backdrop.querySelector('#cancelBtn');
            const fallbackBtn = backdrop.querySelector('#fallbackBtn');
            const copyResponseBtn = backdrop.querySelector('#copyResponseBtn');

            const cleanup = () => {
                backdrop.classList.add('hide');
                setTimeout(() => backdrop.remove(), 200);
            };

            const resolveWith = (value) => {
                cleanup();
                resolve(value);
            };

            closeBtn.onclick = () => resolveWith(null);
            overlay.onclick = () => resolveWith(null);
            cancelBtn.onclick = () => resolveWith(null);
            fallbackBtn.onclick = () => {
                const slideCount = options?.slideCount || this.currentProfile?.defaultSlideCount || 5;
                const fallback = OutlineGenerator.generateFallbackOutline(topic, slideCount);
                resolveWith(fallback);
            };

            copyResponseBtn.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(rawResponse);
                    Notification.success('Raw response copied');
                } catch {
                    Notification.error('Failed to copy response');
                }
            };
        });
    }

    /**
     * Show a detailed error modal during generation
     * @param {Error} error - Generation error
     */
    async showGenerationError(error) {
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.className = 'modal';

            const message = error?.message || 'Generation failed.';
            const details = error?.stack || String(error);

            backdrop.innerHTML = `
                <div class="modal__overlay"></div>
                <div class="modal__dialog" style="max-width: 640px;">
                    <div class="modal__header">
                        <h2 class="modal__title">Generation Error</h2>
                        <button class="modal__close" aria-label="Close">&times;</button>
                    </div>
                    <div class="modal__body" style="display: grid; gap: 12px;">
                        <div style="color: var(--text-high);">${this.escapeHtml(message)}</div>
                        <label style="font-size: 12px; color: var(--text-medium);">Details</label>
                        <textarea class="course-profile-modal__input" style="min-height: 140px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;" readonly>${this.escapeHtml(details)}</textarea>
                    </div>
                    <div class="modal__footer" style="display: flex; justify-content: space-between; align-items: center;">
                        <button type="button" class="btn btn--sm" id="copyErrorBtn">Copy Error Details</button>
                        <button type="button" class="btn btn--sm" id="closeBtn">Close</button>
                    </div>
                </div>
            `;

            document.body.appendChild(backdrop);

            const closeBtn = backdrop.querySelector('.modal__close');
            const overlay = backdrop.querySelector('.modal__overlay');
            const footerCloseBtn = backdrop.querySelector('#closeBtn');
            const copyErrorBtn = backdrop.querySelector('#copyErrorBtn');

            const cleanup = () => {
                backdrop.classList.add('hide');
                setTimeout(() => backdrop.remove(), 200);
            };

            const resolveWith = () => {
                cleanup();
                resolve();
            };

            closeBtn.onclick = resolveWith;
            overlay.onclick = resolveWith;
            footerCloseBtn.onclick = resolveWith;

            copyErrorBtn.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(details);
                    Notification.success('Error details copied');
                } catch {
                    Notification.error('Failed to copy error details');
                }
            };
        });
    }

    /**
     * Escape HTML for safe injection in modals
     * @param {string} unsafe - Raw string
     * @returns {string} Escaped string
     */
    escapeHtml(unsafe) {
        return String(unsafe)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
