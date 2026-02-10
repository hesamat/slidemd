/**
 * Deck Generator
 * Generates full markdown decks from approved outlines
 */

import { AIProviderRegistry } from "./ai-provider-registry.js";
import { Notification } from "../renderer/notification.js";

export class DeckGenerator {
    /**
     * Generate full markdown deck from approved outline
     * @param {Object} profile - Course profile object
     * @param {Array<Object>} outline - Approved outline
     * @param {string} topic - Topic for the deck
     * @returns {Promise<string>} Complete markdown deck
     */
    static async generateDeck(profile, outline, topic) {
        if (!outline || outline.length === 0) {
            Notification.error('Outline is empty');
            throw new Error('Outline is required');
        }

        // Check API key
        const apiKey = AIProviderRegistry.getApiKey(profile.aiProvider);
        if (!apiKey) {
            const provider = AIProviderRegistry.getProvider(profile.aiProvider);
            Notification.error(`Please configure your ${provider?.name || profile.aiProvider} API key`);
            throw new Error('API key not configured');
        }

        try {
            Notification.info('Generating deck...');

            // Generate all slides in a single API call
            const slidesMarkdown = await this.generateAllSlides(profile, outline, topic);

            Notification.success('Deck generated successfully!');
            return slidesMarkdown;
        } catch (error) {
            console.error('Deck generation failed:', error);

            if (error.message.includes('401')) {
                Notification.error('Invalid API key. Please check your AI configuration.');
            } else if (error.message.includes('429')) {
                Notification.error('Rate limit exceeded. Please try again later.');
            } else {
                Notification.error('Failed to generate deck: ' + error.message);
            }

            throw error;
        }
    }

    /**
     * Generate all slides from outline
     * @param {Object} profile - Course profile
     * @param {Array<Object>} outline - Approved outline
     * @param {string} topic - Topic
     * @returns {Promise<string>} Complete markdown
     */
    static async generateAllSlides(profile, outline, topic) {
        // The outline now contains complete markdown content
        // Just build the deck directly from it
        return this.buildDeckFromContent(outline, topic, profile);
    }

    /**
     * Build deck markdown directly from outline content
     * @param {Array<Object>} outline - Outline with content
     * @param {string} _topic - Topic (unused, for compatibility)
     * @param {Object} _profile - Course profile (unused, for compatibility)
     * @returns {string} Complete markdown
     */
    static buildDeckFromContent(outline, _topic, _profile) {
        const slides = outline.map((slide) => {
            const layout = slide.layout || 'focus';
            const content = slide.content || '';

            return `---
layout: ${layout}

${content}

---
`;
        }).join('\n');

        return slides;
    }


    /**
     * Validate generated markdown
     * @param {string} markdown - Generated markdown
     * @returns {Object} { valid: boolean, errors: Array<string> }
     */
    static validateMarkdown(markdown) {
        const errors = [];

        // Check for slide separators
        const slides = markdown.split(/\n---\n/);
        if (slides.length < 2) {
            errors.push('Deck should have at least 2 slides separated by ---');
        }

        // Check each slide has layout directive
        slides.forEach((slide, index) => {
            if (!slide.includes('layout:')) {
                errors.push(`Slide ${index + 1}: Missing layout directive`);
            }
        });

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Generate a quick preview version (without AI)
     * @param {Object} _profile - Course profile (unused, for compatibility)
     * @param {Array<Object>} outline - Approved outline
     * @param {string} _topic - Topic (unused, for compatibility)
     * @returns {string} Preview markdown
     */
    static generatePreview(_profile, outline, _topic) {
        // Use the same simplified structure - just build from content
        return this.buildDeckFromContent(outline);
    }
}
