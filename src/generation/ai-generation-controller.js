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
import { Notification } from "../renderer/notification.js";
import { DeckLoader } from "../data/deck-loader.js";

export class AIGenerationController {
    constructor(deck, controller, elements) {
        this.deck = deck;
        this.controller = controller;
        this.elements = elements;
        this.currentProfile = null;
        this.currentOutline = null;
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
        // Step 1: Ensure we have a profile
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
        const topic = await this.promptForTopic();
        if (!topic) {
            return; // User cancelled
        }

        // Step 4: Get generation options
        const options = await this.promptForOptions();
        if (!options) {
            return; // User cancelled
        }

        try {
            // Step 5: Generate outline
            Notification.info('Generating outline...');
            this.currentOutline = await OutlineGenerator.generateOutline(
                this.currentProfile,
                topic,
                options
            );

            // Step 6: Review and approve outline
            const approvedOutline = await OutlineApprovalModal.show(
                this.currentOutline,
                this.currentProfile
            );

            if (approvedOutline === 'regenerate') {
                // User wants to regenerate
                await this.startGeneration();
                return;
            }

            if (!approvedOutline) {
                Notification.info('Generation cancelled');
                return;
            }

            this.currentOutline = approvedOutline;

            // Step 7: Generate full deck
            Notification.info('Generating deck...');
            const markdown = await DeckGenerator.generateDeck(
                this.currentProfile,
                this.currentOutline,
                topic
            );

            // Step 8: Show preview and options
            await this.showDeckPreview(markdown, topic);
        } catch (error) {
            console.error('Generation failed:', error);
            // Error notifications are already shown by the individual components
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
                this.loadIntoEditor(markdown);
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
    loadIntoEditor(markdown) {
        // Load the markdown into the deck
        this.loadMarkdown(markdown);
        Notification.success('Deck loaded into editor');
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
    async loadMarkdown(markdown) {
        try {
            // Parse the markdown
            const deckData = await DeckLoader.parseMarkdown(markdown);

            // Update the current deck
            Object.assign(this.deck.meta, deckData.meta);
            this.deck.slides = deckData.slides;

            // Reload the presentation
            if (this.controller?.reload) {
                this.controller.reload();
            }

            // If editor is open, update it
            const editor = document.getElementById('markdownEditor');
            if (editor && editor.CodeMirror) {
                editor.CodeMirror.setValue(markdown);
            }
        } catch (error) {
            console.error('Failed to load markdown:', error);
            Notification.error('Failed to load deck');
        }
    }

    /**
     * Get API key for a provider
     * @param {string} providerId - Provider ID
     * @returns {string|null} API key
     */
    getApiKey(providerId) {
        // Import dynamically to avoid circular dependency
        import('./ai-provider-registry.js').then(module => {
            return module.AIProviderRegistry.getApiKey(providerId);
        });
        return localStorage.getItem(`webdeck_ai_api_keys`)?.[providerId] || null;
    }
}
