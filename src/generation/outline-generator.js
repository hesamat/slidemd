/**
 * Outline Generator
 * Generates slide outlines from topics using AI
 */

import { AIProviderRegistry } from "./ai-provider-registry.js";
import { Notification } from "../renderer/notification.js";
import { LayoutData } from "../data/layout-data.js";

export class OutlineGenerator {
    /**
     * Generate a slide outline for a topic
     * @param {Object} profile - Course profile object
     * @param {string} topic - The topic to generate outline for
     * @param {Object} options - Generation options
     * @param {number} options.slideCount - Number of slides to generate
     * @param {boolean} options.includeActivities - Include in-class activities
     * @returns {Promise<Array<Object>>} Array of outline slide objects
     */
    static async generateOutline(profile, topic, options = {}) {
        // Validate inputs
        if (!topic || topic.trim() === '') {
            Notification.error('Please enter a topic');
            throw new Error('Topic is required');
        }

        // Check API key
        const apiKey = AIProviderRegistry.getApiKey(profile.aiProvider);
        if (!apiKey) {
            const provider = AIProviderRegistry.getProvider(profile.aiProvider);
            Notification.error(`Please configure your ${provider?.name || profile.aiProvider} API key`);
            throw new Error('API key not configured');
        }

        const slideCount = options.slideCount || profile.defaultSlideCount || 15;
        const includeActivities = options.includeActivities !== undefined ? options.includeActivities : profile.includeActivities;

        try {
            const prompt = this.buildOutlinePrompt(profile, topic, { slideCount, includeActivities });

            Notification.info('Generating outline...');

            const response = await AIProviderRegistry.generateCompletion(
                profile.aiProvider,
                {
                    model: profile.aiModel,
                    messages: [
                        { role: 'system', content: this.getSystemPrompt() },
                        { role: 'user', content: prompt }
                    ],
                    maxTokens: 4000,
                    temperature: 0.7
                }
            );

            const outline = this.parseOutlineResponse(response);

            // Validate outline
            const validation = this.validateOutline(outline);
            if (!validation.valid) {
                Notification.warning('Generated outline has issues: ' + validation.errors.join(', '));
            } else {
                Notification.success('Outline generated successfully!');
            }

            return outline;
        } catch (error) {
            console.error('Outline generation failed:', error);

            // Provide helpful error messages
            if (error.message.includes('401')) {
                Notification.error('Invalid API key. Please check your AI configuration.');
            } else if (error.message.includes('429')) {
                Notification.error('Rate limit exceeded. Please try again later.');
            } else if (error.message.includes('timeout')) {
                Notification.error('Request timed out. Please try again.');
            } else {
                Notification.error('Failed to generate outline: ' + error.message);
            }

            throw error;
        }
    }

    /**
     * Get the system prompt for outline generation
     * @returns {string} System prompt
     */
    static getSystemPrompt() {
        return `You are an expert educational content designer. Create clear, well-structured slide deck outlines for educational topics.

Your outlines should:
- Be pedagogically sound and logically organized
- Include appropriate slide types (title slides, lectures, activities, summaries)
- Suggest layouts that work well with the content
- Provide 3-5 key points per slide
- Be concise and focused on learning outcomes`;
    }

    /**
     * Build the prompt for outline generation
     * @param {Object} profile - Course profile
     * @param {string} topic - Topic to generate outline for
     * @param {Object} options - Generation options
     * @returns {string} Prompt
     */
    static buildOutlinePrompt(profile, topic, options) {
        const { slideCount, includeActivities } = options;

        let prompt = `Generate a slide deck outline for the following topic.

## Course Context
Course: ${profile.name}
${profile.description ? `Description: ${profile.description}` : ''}

## Learning Objectives
${profile.learningObjectives.map(obj => `- ${obj}`).join('\n')}

## Topic
${topic}

## Requirements
- Number of slides: ${slideCount}
- Include in-class activities: ${includeActivities ? 'Yes' : 'No'}

## Slide Structure

The deck should follow this flow:
1. Title slide (type: title, layout: title-slide)
2. Introduction/overview (1-2 slides, type: lecture)
3. Main content (${Math.max(3, slideCount - 6)} slides, type: lecture)
${includeActivities ? `4. In-class activities (1-2 slides, type: activity)` : ''}
${includeActivities ? `5. More content (1-2 slides, type: lecture)` : ''}
6. Summary/conclusion (1 slide, type: summary, layout: focus)

## Available Layouts
${Array.from(LayoutData.getAllLayouts().keys()).map(l => `- ${l}`).join('\n')}

## Response Format

Return ONLY a JSON array. Do not include any other text:

\`\`\`json
[
    {
        "slideNumber": 1,
        "title": "Slide Title",
        "layout": "focus",
        "type": "lecture",
        "keyPoints": ["Key point 1", "Key point 2", "Key point 3"]
    }
]
\`\`\`

## Guidelines
- Start with an engaging title slide
- Build concepts progressively
- Include practical examples where relevant
- For activities, suggest interactive exercises
- End with a clear summary and key takeaways
- Ensure smooth transitions between slides`;

        return prompt;
    }

    /**
     * Parse AI response into structured outline
     * @param {string} aiResponse - Raw AI response
     * @returns {Array<Object>} Parsed outline slides
     */
    static parseOutlineResponse(aiResponse) {
        // Try to extract JSON from the response
        let jsonStr = aiResponse.trim();

        // Remove markdown code blocks if present
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');

        // Try to find JSON array in the response
        const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
            jsonStr = arrayMatch[0];
        }

        try {
            const outline = JSON.parse(jsonStr);

            if (!Array.isArray(outline)) {
                throw new Error('Response is not an array');
            }

            // Normalize slide data
            return outline.map((slide, index) => ({
                slideNumber: slide.slideNumber || index + 1,
                title: slide.title || `Slide ${index + 1}`,
                layout: slide.layout || 'focus',
                type: slide.type || 'lecture',
                keyPoints: Array.isArray(slide.keyPoints) ? slide.keyPoints : []
            }));
        } catch (error) {
            console.error('Failed to parse outline response:', error);

            // Fallback: create a basic outline based on the response text
            Notification.warning('Could not parse AI response as JSON. Creating basic outline.');

            const lines = aiResponse.split('\n').filter(line => line.trim());
            const outline = [];

            lines.forEach((line, index) => {
                // Try to extract slide structure from numbered lines
                const match = line.match(/^(\d+)[.\)]\s+(.+)$/);
                if (match) {
                    outline.push({
                        slideNumber: index + 1,
                        title: match[2],
                        layout: 'focus',
                        type: 'lecture',
                        keyPoints: ['Discuss key concepts', 'Provide examples', 'Check understanding']
                    });
                }
            });

            // If still empty, create a minimal outline
            if (outline.length === 0) {
                for (let i = 0; i < 5; i++) {
                    outline.push({
                        slideNumber: i + 1,
                        title: i === 0 ? 'Introduction' : i === 4 ? 'Summary' : `Content ${i}`,
                        layout: 'focus',
                        type: i === 0 ? 'title' : i === 4 ? 'summary' : 'lecture',
                        keyPoints: ['Key point 1', 'Key point 2', 'Key point 3']
                    });
                }
            }

            return outline;
        }
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
            if (!slide.title) {
                errors.push(`Slide ${index + 1}: Missing title`);
            }

            if (!slide.layout || !LayoutData.hasLayout(slide.layout)) {
                errors.push(`Slide ${index + 1}: Invalid layout "${slide.layout || '(none)'}"`);
            }

            if (!slide.keyPoints || !Array.isArray(slide.keyPoints)) {
                errors.push(`Slide ${index + 1}: Missing key points`);
            } else if (slide.keyPoints.length === 0) {
                errors.push(`Slide ${index + 1}: No key points defined`);
            }
        });

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Generate a basic fallback outline
     * @param {string} topic - Topic
     * @param {number} slideCount - Number of slides
     * @returns {Array<Object>} Basic outline
     */
    static generateFallbackOutline(topic, slideCount = 5) {
        const outline = [];

        // Title slide
        outline.push({
            slideNumber: 1,
            title: topic,
            layout: 'title-slide',
            type: 'title',
            keyPoints: ['Introduction to the topic', 'Overview and objectives']
        });

        // Content slides
        for (let i = 1; i < slideCount - 1; i++) {
            outline.push({
                slideNumber: i + 1,
                title: i === 1 ? 'Introduction' : `Part ${i}`,
                layout: 'focus',
                type: 'lecture',
                keyPoints: ['Key concept 1', 'Key concept 2', 'Key concept 3', 'Examples and applications']
            });
        }

        // Summary slide
        outline.push({
            slideNumber: slideCount,
            title: 'Summary',
            layout: 'focus',
            type: 'summary',
            keyPoints: ['Recap main points', 'Key takeaways', 'Further reading']
        });

        return outline;
    }
}
