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
     * @param {boolean} options.useMockResponse - Use the mock outline response
     * @param {string} options.mockResponseUrl - Override URL for mock response
     * @returns {Promise<Array<Object>>} Array of outline slide objects
     */
    static async generateOutline(profile, topic, options = {}) {
        // Validate inputs
        if (!topic || topic.trim() === '') {
            Notification.error('Please enter a topic');
            throw new Error('Topic is required');
        }

        if (options.useMockResponse) {
            Notification.info('Using mock outline response...');
            const outline = await this.loadMockOutline(options.mockResponseUrl);
            const validation = this.validateOutline(outline);
            if (!validation.valid) {
                Notification.warning('Mock outline has issues: ' + validation.errors.join(', '));
            } else {
                Notification.success('Mock outline loaded successfully!');
            }
            return outline;
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
        const signal = options.signal;

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
                    maxTokens: 20000,
                    timeoutMs: 160000,
                    signal
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

            if (error.name === 'AbortError') {
                throw error;
            }

            if (error.rawResponse) {
                Notification.error('Failed to parse AI response. Review details and try again.');
                throw error;
            }

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
     * Load outline data from a local mock JSON file
     * @param {string} mockResponseUrl - Optional URL override
     * @returns {Promise<Array<Object>>} Normalized outline
     */
    static async loadMockOutline(mockResponseUrl) {
        const url = mockResponseUrl || new URL('./mock-outline.json', import.meta.url);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load mock outline: ${response.status}`);
        }
        const data = await response.json();
        if (!Array.isArray(data)) {
            throw new Error('Mock outline response must be an array');
        }
        return this.normalizeOutline(data);
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
- Be focused on learning outcomes`;
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
${includeActivities ? `4. In-class activities (~${slideCount / 4}, type: activity)` : ''}
${includeActivities ? `5. More content (1-2 slides, type: lecture)` : ''}
6. Summary/conclusion (1 slide, type: summary, layout: focus)

## Response Format

Return ONLY JSON in a fenced code block with language json. Do not add any commentary before or after.

\`\`\`json
[
    {
        "title": "Slide Title",
        "type": "lecture",
        "layout": "focus",
        "content": "@main\n\n# Slide Title\n\nYour complete slide content in markdown format.\n\n- Bullet point\n- Another point\n\nUse **bold**, \`code\`, math like $E = mc^2$, and more."
    }
]
\`\`\`

## Valid Layout Names

You MUST use only these layout names:
- **title-slide**: Full-screen centered title slide
- **focus**: Single column content area (most common)
- **two-column**: Equal two columns
- **left-heavy**: Two columns (2:1 ratio - left is wider)
- **right-heavy**: Two columns (1:2 ratio - right is wider)
- **header-content**: Header, content, and footer stacked
- **header-two-column**: Header with two columns and footer
- **three-column**: Three equal columns
- **sidebar-content**: Fixed sidebar (300px) with flexible content
- **content-sidebar**: Flexible content with fixed sidebar (300px)


## Content Support
- **Markdown**: Use headings, bullet points, bold, italics, code
- **Math**: LaTeX math with $...$ for inline or $$...$$ for display (KaTeX)
- **Diagrams**: Mermaid code blocks for flowcharts, sequence diagrams, etc.
- **Code**: Syntax-highlighted code blocks with language tags no longer than 10 lines (e.g. \`\`\`python\`\`\`)
- **Area Markers**: ALWAYS include explicit area markers at the top-level of each slide's content. Do not put headings/content before the first area marker.
    - For "title-slide": Use "@title" then write the title/subtitle under it.
    - For "focus": Use "@main" then write the full slide content.
    - For "two-column" / "left-heavy" / "right-heavy": Use "@main" (left) then "@media" (right).
    - For "header-content": Use "@header" then "@main" ("@footer" optional).
    - For "header-two-column": Use "@header" then "@main" and "@media" ("@footer" optional).
    - For "three-column": Use "@main" then "@media" then "@secondary".
    - For "sidebar-content": Use "@sidebar" then "@main".
    - For "content-sidebar": Use "@main" then "@sidebar".

## Guidelines
- Start with an engaging title slide
- Build concepts progressively
- Include practical code examples where relevant
- For activities, suggest interactive exercises with instructions. Put them every 3-4 slides to break up the lecture and reinforce learning. Use the "activity" type for these slides.
- End with a clear summary and key takeaways
- Ensure smooth transitions between slides
- Write complete markdown content, not just outlines
- Use a polished teaching-deck style: "Context → Problem → Solution" slides work well
- Prefer short, scannable lists; avoid wall-of-text paragraphs
- **CRITICAL**: Every slide MUST start with the correct @area markers for its chosen layout`;

        return prompt;
    }

    /**
     * Extract the most likely JSON payload from a response
     * @param {string} responseText - Raw AI response
     * @returns {string} Extracted JSON string
     */
    static extractJsonPayload(responseText) {
        const trimmed = responseText.trim();

        const fenceStart = trimmed.search(/```json\s*/i);
        if (fenceStart !== -1) {
            const afterStart = trimmed.slice(fenceStart).replace(/^```json\s*/i, '');
            const fenceEndIndex = afterStart.lastIndexOf('```');
            if (fenceEndIndex !== -1) {
                return afterStart.slice(0, fenceEndIndex).trim();
            }

            return afterStart.trim();
        }

        const sentinelMatch = trimmed.match(/BEGIN_JSON([\s\S]*?)END_JSON/i);
        if (sentinelMatch) {
            return sentinelMatch[1].trim();
        }

        const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
            return arrayMatch[0];
        }

        return trimmed;
    }

    /**
     * Sanitize JSON string by handling common AI generation issues
     * @param {string} str - String to sanitize
     * @returns {string} Sanitized string
     */
    static sanitizeJSON(str) {
        // This handles cases where AI generates literal newlines/tabs inside JSON strings
        // We need to escape them, but only within string literals, not outside

        let result = '';
        let inString = false;
        let escapeNext = false;

        for (let i = 0; i < str.length; i++) {
            const char = str[i];

            if (escapeNext) {
                // Already escaped, just add the character
                result += char;
                escapeNext = false;
            } else if (char === '\\') {
                // Start of escape sequence
                result += char;
                escapeNext = true;
            } else if (char === '"') {
                // Toggle string state
                inString = !inString;
                result += char;
            } else if (inString) {
                // Inside a string literal - escape control characters
                if (char === '\n') {
                    result += '\\n';
                } else if (char === '\r') {
                    result += '\\r';
                } else if (char === '\t') {
                    result += '\\t';
                } else {
                    result += char;
                }
            } else {
                // Outside strings - keep as is
                result += char;
            }
        }

        return result;
    }

    /**
     * Normalize layout names to valid presets
     * @param {string} layout - Layout name from AI
     * @returns {string} Valid layout name
     */
    static normalizeLayout(layout) {
        const validLayouts = [
            'title-slide', 'focus', 'two-column', 'left-heavy', 'right-heavy',
            'header-content', 'header-two-column', 'three-column',
            'sidebar-content', 'content-sidebar'
        ];

        // If already valid, return as-is
        if (validLayouts.includes(layout)) {
            return layout;
        }

        // Map common AI-generated names to valid layouts
        const layoutMap = {
            'standard': 'focus',
            'default': 'focus',
            'simple': 'focus',
            'basic': 'focus',
            'split': 'two-column'
        };

        return layoutMap[layout] || 'focus';
    }

    /**
     * Parse AI response into structured outline
     * @param {string} aiResponse - Raw AI response
     * @returns {Array<Object>} Parsed outline slides
     */
    static parseOutlineResponse(aiResponse) {
        const jsonStr = this.extractJsonPayload(aiResponse);
        const sanitized = this.sanitizeJSON(jsonStr);

        try {
            const outline = JSON.parse(sanitized);

            if (!Array.isArray(outline)) {
                throw new Error('Response is not an array');
            }

            return this.normalizeOutline(outline);
        } catch (error) {
            console.error('Failed to parse outline response:', error);
            const parseError = new Error('Failed to parse AI response as JSON.');
            parseError.rawResponse = aiResponse;
            parseError.jsonPayload = jsonStr;
            throw parseError;
        }
    }

    /**
     * Normalize slide structure to a consistent shape
     * @param {Array<Object>} outline - Raw outline array
     * @returns {Array<Object>} Normalized outline
     */
    static normalizeOutline(outline) {
        return outline.map((slide, index) => {
            const content = typeof slide.content === 'string'
                ? slide.content
                : Array.isArray(slide.keyPoints)
                    ? slide.keyPoints.join('\n')
                    : '';

            return {
                slideNumber: index + 1,
                title: slide.title || `Slide ${index + 1}`,
                layout: this.normalizeLayout(slide.layout || 'focus'),
                type: slide.type || this.inferTypeFromContent(content),
                content,
                keyPoints: Array.isArray(slide.keyPoints) ? slide.keyPoints : []
            };
        });
    }

    /**
     * Infer slide type from content
     * @param {string} content - Slide content
     * @returns {string} Slide type
     */
    static inferTypeFromContent(content) {
        if (!content) return 'lecture';

        const lower = content.toLowerCase();
        if (lower.includes('activity') || lower.includes('exercise') || lower.includes('task')) {
            return 'activity';
        }
        if (lower.includes('summary') || lower.includes('conclusion') || lower.includes('key takeaway')) {
            return 'summary';
        }
        if (lower.includes('introduction') || lower.includes('overview')) {
            return 'title';
        }
        return 'lecture';
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

            if (!slide.content || typeof slide.content !== 'string') {
                errors.push(`Slide ${index + 1}: Missing or invalid content`);
            } else {
                const requiredMarkers = this.getRequiredAreaMarkers(slide.layout);
                for (const marker of requiredMarkers) {
                    const re = new RegExp(`(^|\\n)\\s*${marker}\\s*(\\n|$)`, 'i');
                    if (!re.test(slide.content)) {
                        errors.push(`Slide ${index + 1}: Missing required area marker "${marker}" for layout "${slide.layout}"`);
                    }
                }
            }
        });

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Get required @area markers for a given layout preset
     * @param {string} layoutName
     * @returns {Array<string>} markers like "@main"
     */
    static getRequiredAreaMarkers(layoutName) {
        const layout = (layoutName || '').toString();
        switch (layout) {
            case 'title-slide':
                return ['@title'];
            case 'focus':
                return ['@main'];
            case 'two-column':
            case 'left-heavy':
            case 'right-heavy':
                return ['@main', '@media'];
            case 'header-content':
                return ['@header', '@main'];
            case 'header-two-column':
                return ['@header', '@main', '@media'];
            case 'three-column':
                return ['@main', '@media', '@secondary'];
            case 'sidebar-content':
                return ['@sidebar', '@main'];
            case 'content-sidebar':
                return ['@main', '@sidebar'];
            default:
                // Unknown/unsupported layouts are validated elsewhere
                return [];
        }
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
