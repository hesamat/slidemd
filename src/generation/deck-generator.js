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
     * Generate all slides in a single API call
     * @param {Object} profile - Course profile
     * @param {Array<Object>} outline - Approved outline
     * @param {string} topic - Topic
     * @returns {Promise<string>} Complete markdown
     */
    static async generateAllSlides(profile, outline, topic) {
        const prompt = this.buildFullDeckPrompt(profile, outline, topic);

        const response = await AIProviderRegistry.generateCompletion(
            profile.aiProvider,
            {
                model: profile.aiModel,
                messages: [
                    { role: 'system', content: this.getSystemPrompt() },
                    { role: 'user', content: prompt }
                ],
                maxTokens: 8000,
                temperature: 0.7
            }
        );

        // Parse the response to extract individual slides
        return this.parseSlideResponse(response, outline, profile, topic);
    }

    /**
     * Parse the AI response and combine with templates
     * @param {string} response - AI response
     * @param {Array<Object>} outline - Original outline
     * @param {Object} profile - Course profile
     * @param {string} topic - Topic
     * @returns {string} Complete markdown
     */
    static parseSlideResponse(response, outline, profile, topic) {
        // The response should be structured as slide content blocks
        // Try to parse as JSON array first
        let slideContents;

        try {
            // Try to extract JSON from the response
            let jsonStr = response.trim();
            jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');

            const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
            if (arrayMatch) {
                jsonStr = arrayMatch[0];
            }

            slideContents = JSON.parse(jsonStr);
        } catch {
            // Fallback: split by slide markers
            slideContents = this.splitSlideContent(response);
        }

        // Generate markdown for each slide
        const slides = slideContents.map((content, index) => {
            const outlineSlide = outline[index] || outline[outline.length - 1];
            const template = GenerationTemplates.getTemplate(profile, outlineSlide.type);

            const variables = {
                topic,
                title: outlineSlide.title,
                layout: outlineSlide.layout,
                content: content.main || content.content || '',
                keyPoints: outlineSlide.keyPoints,
                instructions: content.instructions || content.main || '',
                task: content.task || this.extractTaskFromContent(content),
                examples: content.examples || this.extractExamplesFromContent(content),
                notes: content.notes || '',
                teacherNotes: content.teacherNotes || content.notes || '',
                summary: content.summary || content.main || '',
                keyTakeaways: content.keyTakeaways || outlineSlide.keyPoints,
                subtitle: index === 0 ? `Course: ${profile.name}` : '',
                presenter: profile.description || ''
            };

            return GenerationTemplates.renderTemplate(template, variables);
        });

        return slides.join('\n');
    }

    /**
     * Split response content into slide sections
     * @param {string} response - AI response
     * @returns {Array<Object>} Slide content objects
     */
    static splitSlideContent(response) {
        const slides = [];
        const sections = response.split(/###?\s*Slide \d+:/);

        for (const section of sections) {
            if (section.trim()) {
                slides.push({
                    main: section.trim()
                });
            }
        }

        // If no slides found, treat entire response as one slide
        if (slides.length === 0) {
            slides.push({ main: response.trim() });
        }

        return slides;
    }

    /**
     * Extract task from content object
     * @param {Object} content - Content object
     * @returns {string} Task text
     */
    static extractTaskFromContent(content) {
        if (content.task) return content.task;
        if (content.main) {
            const match = content.main.match(/###?\s*Task\s*\n([\s\S]*?)(?=\n###|\n\n|$)/i);
            if (match) return match[1].trim();
        }
        return 'Complete the exercise below';
    }

    /**
     * Extract examples from content object
     * @param {Object} content - Content object
     * @returns {string} Examples text
     */
    static extractExamplesFromContent(content) {
        if (content.examples) return content.examples;
        if (content.main) {
            const match = content.main.match(/###?\s*Example\s*\n([\s\S]*?)(?=\n###|\n\n|$)/i);
            if (match) return match[1].trim();
            const codeMatch = content.main.match(/```[\w]*\n([\s\S]*?)```/);
            if (codeMatch) return codeMatch[1].trim();
        }
        return '';
    }

    /**
     * Get system prompt for deck generation
     * @returns {string} System prompt
     */
    static getSystemPrompt() {
        return `You are an expert educational content writer. Create clear, engaging, and pedagogically sound content for educational slides.

Your content should:
- Be clear and concise
- Use appropriate markdown formatting (bullet points, numbered lists, code blocks, etc.)
- Include relevant examples
- Be accurate and well-structured
- Match the learning objectives of the course`;
    }

    /**
     * Build prompt for generating all slides at once
     * @param {Object} profile - Course profile
     * @param {Array<Object>} outline - Outline
     * @param {string} topic - Topic
     * @returns {string} Prompt
     */
    static buildFullDeckPrompt(profile, outline, topic) {
        let prompt = `Generate complete content for a ${outline.length}-slide presentation deck.

## Course Context
Course: ${profile.name}
${profile.description ? `Description: ${profile.description}` : ''}
${profile.topicsCovered ? `Topics Previously Covered:\n${profile.topicsCovered}\n` : ''}

## Learning Objectives
${profile.learningObjectives.map(obj => `- ${obj}`).join('\n')}

## Presentation Topic
${topic}

## Instructions

Generate content for ALL ${outline.length} slides in a single response. Return a JSON array where each element contains the content for one slide.

### Response Format

\`\`\`json
[
    {
        "main": "Content for lecture slide (explanation, examples, etc.)",
        "instructions": "Activity instructions (for activity slides)",
        "task": "Specific task for students (for activity slides)",
        "examples": "Code examples or solutions (if applicable)",
        "notes": "Teacher notes (optional)",
        "summary": "Summary text (for summary slides)",
        "keyTakeaways": ["Takeaway 1", "Takeaway 2"]
    }
]
\`\`\`

## Slide Outline

${outline.map((slide, index) => `
### Slide ${index + 1}: ${slide.title}
- Type: ${slide.type}
- Layout: ${slide.layout}
- Key Points: ${slide.keyPoints.join(', ')}
${index === 0 ? '- Generate a subtitle/description for this title slide' : ''}
${slide.type === 'activity' ? '- Include activity instructions and a practical task' : ''}
${slide.type === 'summary' ? '- Include key takeaways' : ''}
`).join('\n')}

## Content Guidelines

**For Title Slides:**
- Generate a brief subtitle (1-2 sentences) describing the presentation

**For Lecture Slides:**
- 2-3 paragraphs explaining the key points
- Include relevant examples or code snippets
- Use markdown: bullet points, \`code\`, \`\`\`code blocks\`\`\`
- Target 100-150 words per slide

**For Activity Slides:**
- Clear instructions for the activity
- A specific, practical task for students
- An example solution or starter code
- Should be completable in 5-10 minutes

**For Summary Slides:**
- Brief recap of main concepts (2-3 sentences)
- Key takeaways as bullet points

Generate ALL ${outline.length} slides now. Return ONLY the JSON array.`;

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
