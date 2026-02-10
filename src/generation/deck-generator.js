/**
 * Deck Generator
 * Generates full markdown decks from approved outlines
 */

import { AIProviderRegistry } from "./ai-provider-registry.js";
import { Notification } from "../renderer/notification.js";
import { GenerationTemplates } from "./generation-templates.js";
import { LayoutData } from "../data/layout-data.js";

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
            const slides = [];

            for (let i = 0; i < outline.length; i++) {
                const outlineSlide = outline[i];

                Notification.info(`Generating slide ${i + 1} of ${outline.length}...`);

                const slideMarkdown = await this.generateSlide(profile, outlineSlide, topic, i);
                slides.push(slideMarkdown);
            }

            // Combine all slides
            const markdown = slides.join('\n');

            Notification.success('Deck generated successfully!');
            return markdown;
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
     * Generate markdown for a single slide
     * @param {Object} profile - Course profile
     * @param {Object} outlineSlide - Outline slide object
     * @param {string} topic - Overall topic
     * @param {number} index - Slide index
     * @returns {Promise<string>} Slide markdown
     */
    static async generateSlide(profile, outlineSlide, topic, index) {
        const template = GenerationTemplates.getTemplate(profile, outlineSlide.type);

        // Generate content for the slide using AI
        const content = await this.generateSlideContent(profile, outlineSlide, topic, index);

        // Render template with variables
        const variables = {
            topic,
            title: outlineSlide.title,
            layout: outlineSlide.layout,
            content,
            keyPoints: outlineSlide.keyPoints,
            instructions: content,
            task: this.extractTask(content),
            examples: this.extractExamples(content),
            notes: '',
            teacherNotes: '',
            summary: content,
            keyTakeaways: outlineSlide.keyPoints,
            subtitle: index === 0 ? `Course: ${profile.name}` : '',
            presenter: profile.description || ''
        };

        return GenerationTemplates.renderTemplate(template, variables);
    }

    /**
     * Generate content for a slide using AI
     * @param {Object} profile - Course profile
     * @param {Object} outlineSlide - Outline slide
     * @param {string} topic - Overall topic
     * @param {number} index - Slide index
     * @returns {Promise<string>} Generated content
     */
    static async generateSlideContent(profile, outlineSlide, topic, index) {
        const prompt = this.buildSlidePrompt(profile, outlineSlide, topic, index);

        try {
            const response = await AIProviderRegistry.generateCompletion(
                profile.aiProvider,
                {
                    model: profile.aiModel,
                    messages: [
                        { role: 'system', content: this.getSystemPrompt() },
                        { role: 'user', content: prompt }
                    ],
                    maxTokens: 1500,
                    temperature: 0.7
                }
            );

            return response.trim();
        } catch (error) {
            console.error('Failed to generate slide content:', error);
            // Return basic content based on key points
            return outlineSlide.keyPoints.map(kp => `- ${kp}`).join('\n');
        }
    }

    /**
     * Get system prompt for slide generation
     * @returns {string} System prompt
     */
    static getSystemPrompt() {
        return `You are an expert educational content writer. Create clear, engaging, and pedagogically sound content for educational slides.

Your content should:
- Be clear and concise
- Use appropriate formatting (bullet points, numbered lists, code blocks, etc.)
- Include relevant examples
- Be accurate and well-structured
- Match the learning objectives of the course`;
    }

    /**
     * Build prompt for generating a single slide
     * @param {Object} profile - Course profile
     * @param {Object} outlineSlide - Outline slide
     * @param {string} topic - Overall topic
     * @param {number} index - Slide index
     * @returns {string} Prompt
     */
    static buildSlidePrompt(profile, outlineSlide, topic, index) {
        const isTitle = outlineSlide.type === 'title' || index === 0;
        const isActivity = outlineSlide.type === 'activity';
        const isSummary = outlineSlide.type === 'summary';

        let prompt = `Generate content for slide ${index + 1}.

## Context
Course: ${profile.name}
Topic: ${topic}
Learning Objectives:
${profile.learningObjectives.map(obj => `- ${obj}`).join('\n')}

## Slide Details
Title: ${outlineSlide.title}
Type: ${outlineSlide.type}
Layout: ${outlineSlide.layout}

## Key Points to Cover
${outlineSlide.keyPoints.map(kp => `- ${kp}`).join('\n')}

`;

        if (isTitle) {
            prompt += `Generate a brief subtitle or description for this title slide (1-2 sentences).

Respond with only the subtitle text, no other formatting.`;
        } else if (isActivity) {
            prompt += `Generate an in-class activity for this slide.

Include:
1. Brief instructions for the activity
2. A specific task or exercise for students
3. An example solution or starter code (if applicable)

Keep it practical and engaging. Students should be able to complete this in 5-10 minutes.

Format your response clearly with headers for "Instructions", "Task", and "Example".`;
        } else if (isSummary) {
            prompt += `Generate a summary for this slide.

Include:
1. A brief recap of the main concepts (2-3 sentences)
2. Key takeaways formatted as bullet points

Keep it concise and focused on the most important points.`;
        } else {
            prompt += `Generate detailed content for this lecture slide.

Include:
1. Explanation of the key points (2-3 paragraphs)
2. Relevant examples or code snippets where appropriate
3. Use markdown formatting: bullet points, bold/italic for emphasis, \`\`\`code blocks\`\`\` for code

Keep it concise but informative. Target ~100-150 words.

Response should be well-formatted markdown ready to use in a slide.`;
        }

        return prompt;
    }

    /**
     * Extract task from activity content
     * @param {string} content - Generated content
     * @returns {string} Task text
     */
    static extractTask(content) {
        const taskMatch = content.match(/###?\s*Task\s*\n([\s\S]*?)(?=\n###|\n\n\n|$)/i);
        if (taskMatch) {
            return taskMatch[1].trim();
        }
        return 'Complete the exercise below';
    }

    /**
     * Extract examples from content
     * @param {string} content - Generated content
     * @returns {string} Examples text
     */
    static extractExamples(content) {
        const exampleMatch = content.match(/###?\s*Example\s*\n([\s\S]*?)(?=\n###|\n\n\n|$)/i);
        if (exampleMatch) {
            return exampleMatch[1].trim();
        }
        // Look for code blocks
        const codeMatch = content.match(/```[\w]*\n([\s\S]*?)```/);
        if (codeMatch) {
            return codeMatch[1].trim();
        }
        return '';
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
     * @param {Object} profile - Course profile
     * @param {Array<Object>} outline - Approved outline
     * @param {string} topic - Topic
     * @returns {string} Preview markdown
     */
    static generatePreview(profile, outline, topic) {
        const slides = outline.map((outlineSlide, index) => {
            const template = GenerationTemplates.getTemplate(profile, outlineSlide.type);

            const variables = {
                topic,
                title: outlineSlide.title,
                layout: outlineSlide.layout,
                content: outlineSlide.keyPoints.map(kp => `- ${kp}`).join('\n'),
                keyPoints: outlineSlide.keyPoints,
                instructions: outlineSlide.keyPoints.map(kp => `- ${kp}`).join('\n'),
                task: outlineSlide.keyPoints[0] || 'Complete the activity',
                examples: '',
                summary: outlineSlide.keyPoints.map(kp => `- ${kp}`).join('\n'),
                keyTakeaways: outlineSlide.keyPoints,
                subtitle: index === 0 ? `Course: ${profile.name}` : '',
                presenter: profile.description || ''
            };

            return GenerationTemplates.renderTemplate(template, variables);
        });

        return slides.join('\n');
    }
}
