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
     * @param {string} options.lastWeekSummary - Optional summary of previous session
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
        return `You are an expert educational content designer creating slide deck content for a lecture presentation system.

Your slides must be:
- **Focused**: One core concept per slide
- **Scannable**: Bullet points and short phrases, not paragraphs
- **Progressive**: Build from simple to complex
- **Practical**: Include working code examples where relevant

Style guidelines:
- Use clear, direct language
- Avoid verbose explanations—slides support the speaker, don't replace them
- Group related points together under meaningful headings
- Use code blocks for technical content, not ASCII art boxes`;
    }

    /**
     * Build the prompt for outline generation
     * @param {Object} profile - Course profile
     * @param {string} topic - Topic to generate outline for
     * @param {Object} options - Generation options
     * @returns {string} Prompt
     */
    static buildOutlinePrompt(profile, topic, options) {
        const { slideCount, includeActivities, lastWeekSummary } = options;

        let prompt = `Generate a slide deck outline for the following topic.

## Course Context
Course: ${profile.name}
${profile.description ? `Description: ${profile.description}` : ''}

## Learning Objectives
${profile.learningObjectives.map(obj => `- ${obj}`).join('\n')}

${lastWeekSummary ? `## Previous Session Summary\n${lastWeekSummary}\n` : ''}

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

**CRITICAL: Every slide's "content" field MUST start with the correct @area marker for its layout.**

Example for different layouts:

\`\`\`json
[
    {
        "title": "Dataclasses (Pythonic OOD)",
        "type": "lecture",
        "layout": "header-two-column",
        "content": "@header\n## Dataclasses (Pythonic OOD)\n\n@main\n### Great for domain records\n- less boilerplate\n- clearer intent\n- supports immutability (\`frozen=True\`)\n\n@media\n\`\`\`py\nfrom dataclasses import dataclass\n\n@dataclass(frozen=True)\nclass Money:\n  cents: int\n\n  def __post_init__(self):\n    if self.cents < 0:\n      raise ValueError(\"Money cannot be negative\")\n\`\`\`"
    },
    {
        "title": "Design for Testability",
        "type": "lecture",
        "layout": "header-two-column",
        "content": "@header\n## Design for Testability\n### Tests need seams\n\n@main\n### Make it easy to replace:\n- network calls\n- filesystem\n- time\n- randomness\n\n### Techniques\n- dependency injection\n- pure functions for rules\n- small protocols\n\n@media\n\`\`\`py\nclass FakeRepo:\n  def __init__(self):\n    self.saved = []\n  def save(self, order):\n    self.saved.append(order)\n\`\`\`"
    },
    {
        "title": "Modules are Design Too",
        "type": "lecture",
        "layout": "header-content",
        "content": "@header\n## Modules are Design Too\n### Organize code like a system\n\n@main\n- package = component boundary\n- limit imports across layers\n- keep domain independent from infrastructure\n\nExample structure:\n- \`domain/\` (entities, rules)\n- \`services/\` (use cases)\n- \`infrastructure/\` (db, http)\n- \`ui/\` (cli/web)"
    },
    {
        "title": "SOLID (Practical Version)",
        "type": "lecture",
        "layout": "header-content",
        "content": "@header\n## SOLID (Practical Version)\n\n@main\n### Five heuristics for better designs\n\n- **S**ingle Responsibility: one reason to change (**SRP**)\n- **O**pen/Closed: extend without editing core logic (**OCP**)\n- **L**iskov Substitution: derived types keep promises (**LSP**)\n- **I**nterface Segregation: small focused interfaces (**ISP**)\n- **D**ependency Inversion: depend on abstractions (**DIP**)"
    },
    {
        "title": "SRP: One Reason to Change",
        "type": "lecture",
        "layout": "header-two-column",
        "content": "@header\n## SRP: One Reason to Change\n### Separate responsibilities by change pressure\n\n@main\n### Smell\n> A class changes for unrelated reasons.\n\n### Example split\n- \`Order\` (domain rules)\n- \`OrderRepository\` (storage)\n- \`OrderReceiptRenderer\` (formatting)\n\n@media\n\`\`\`py\nclass OrderReceiptRenderer:\n  def render_text(self, order: \"Order\") -> str:\n    return \"\\n\".join(\n      [\"Receipt\", f\"items={len(order.items())}\"]\n    )\n\`\`\`"
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
- **sidebar-content**: Fixed sidebar (300px) with flexible content
- **content-sidebar**: Flexible content with fixed sidebar (300px)


## Content Support
- **Markdown**: Use headings, bullet points, bold, italics, code
- **Math**: LaTeX math with $...$ for inline or $$...$$ for display (KaTeX)
- **Diagrams**: Mermaid code blocks for flowcharts, sequence diagrams, etc.
- **Code**: Syntax-highlighted code blocks with language tags (max 12 lines, e.g. \`\`\`javascript\`\`\`)
- **Tables**: Use markdown tables for comparisons
- **Area Markers**: ALWAYS include explicit area markers at the top-level of each slide's content. Do not put headings/content before the first area marker.
    - For "title-slide": Use "@title" then write the title/subtitle under it.
    - For "focus": Use "@main" then write the full slide content.
    - For "two-column" / "left-heavy" / "right-heavy": Use "@main" (left) then "@media" (right).
    - For "header-content": Use "@header" then "@main" ("@footer" optional).
    - For "header-two-column": Use "@header" then "@main" and "@media" ("@footer" optional).
    - For "sidebar-content": Use "@sidebar" then "@main".
    - For "content-sidebar": Use "@main" then "@sidebar".

## CRITICAL: Forbidden Syntax

DO NOT use these markdown extensions—they are NOT supported:
- ❌ \`:::warning\`, \`:::info\`, \`:::tip\`, \`:::danger\` admonition/callout blocks
- ❌ GitHub-style alerts like \`> [!WARNING]\`
- ❌ ASCII art boxes or diagrams (use Mermaid instead)
- Don't use emojis

If you need to emphasize important information:
- Use **bold text** for key terms
- Use blockquotes (\`>\`) sparingly for important notes
- Put critical warnings in the slide content as plain text with bold/emphasis

## Slide Content Guidelines

**Structure each slide around ONE concept:**
- Clear heading that states the concept
- Avoid mixing too many elements

**Make content meaningful:**
- Every bullet point should add value—no filler
- Code examples should be concise and directly illustrate the point
- Explain WHY something matters, not just WHAT it is
- Use concrete examples over abstract descriptions

**For lecture slides:**
- Start with the problem/motivation before the solution
- Show code examples with brief explanations
- Use two-column layouts to compare approaches (old vs new, bad vs good)

**For activity slides:**
- Clear task description at the top
- Specific, actionable steps (numbered list)
- Code template or starter code if applicable
- Success criteria so students know when they're done

**For summary slides:**
- Recap the key concepts as a bulleted list
- No new information
- Optional: "Next steps"

## Final Checks
- **CRITICAL**: Every slide's "content" field MUST start with the @area marker
- The FIRST line of content should be the marker (e.g., "@main", "@title", "@header")
- Then a blank line, then your actual slide content
- Review each slide: does the content start with "@main", "@title", etc.?
- No \`:::\` admonition blocks anywhere
- Code blocks have language tags
- Content is scannable at a glance during a presentation

**REMINDER: Content field format = "@marker\\n\\n# Your markdown content"**`;

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
                    // Match marker at start of line or after newline, followed by optional whitespace
                    // The marker can be followed by anything (not just newlines)
                    const areaMarker = `@${marker}`;
                    const re = new RegExp(`(^|\\n)\\s*${areaMarker}\\b`, 'i');
                    if (!re.test(slide.content)) {
                        errors.push(`Slide ${index + 1}: Missing required area marker "${areaMarker}" for layout "${slide.layout}"`);
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
                return ['title'];
            case 'focus':
                return ['main'];
            case 'two-column':
            case 'left-heavy':
            case 'right-heavy':
                return ['main', 'media'];
            case 'header-content':
                return ['header', 'main'];
            case 'header-two-column':
                return ['header', 'main', 'media'];
            case 'three-column':
                return ['main', 'media', 'secondary'];
            case 'sidebar-content':
                return ['sidebar', 'main'];
            case 'content-sidebar':
                return ['main', 'sidebar'];
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
