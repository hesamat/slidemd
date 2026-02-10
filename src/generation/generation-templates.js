/**
 * Generation Templates
 * Default slide deck templates for AI-generated content
 */

export class GenerationTemplates {
    /**
     * Get default templates
     * @returns {Object} Template mappings
     */
    static getDefaults() {
        return {
            titleSlide: this.getTitleSlideTemplate(),
            lecture: this.getLectureTemplate(),
            activity: this.getActivityTemplate(),
            summary: this.getSummaryTemplate(),
            twoColumn: this.getTwoColumnTemplate(),
            headerContent: this.getHeaderContentTemplate()
        };
    }

    /**
     * Get title slide template
     * @returns {string} Template markdown
     */
    static getTitleSlideTemplate() {
        return `layout: title-slide

@title

# {{topic}}

{{#if subtitle}}
{{subtitle}}
{{/if}}

{{#if presenter}}
{{presenter}}
{{/if}}

---
`;
    }

    /**
     * Get lecture slide template
     * @returns {string} Template markdown
     */
    static getLectureTemplate() {
        return `layout: {{layout}}

@main

## {{title}}

{{content}}

{{#if keyPoints}}
### Key Points

{{#each keyPoints}}
- {{this}}
{{/each}}
{{/if}}

{{#if examples}}
### Examples

{{examples}}
{{/if}}

{{#if notes}}
<!-- notes: {{notes}} -->
{{/if}}

---
`;
    }

    /**
     * Get activity slide template
     * @returns {string} Template markdown
     */
    static getActivityTemplate() {
        return `layout: two-column

@main

## Activity: {{title}}

{{instructions}}

### Task

{{task}}

@media

### Example

{{example}}

<!-- notes: {{teacherNotes}} -->

---
`;
    }

    /**
     * Get summary slide template
     * @returns {string} Template markdown
     */
    static getSummaryTemplate() {
        return `layout: focus

@main

## Summary

{{summary}}

### Key Takeaways

{{#each keyTakeaways}}
- {{this}}
{{/each}}

{{#if nextSteps}}
### Next Steps

{{nextSteps}}
{{/if}}

---
`;
    }

    /**
     * Get two-column template
     * @returns {string} Template markdown
     */
    static getTwoColumnTemplate() {
        return `layout: two-column

@main

## {{title}}

{{content}}

{{#if examples}}
### Examples

{{examples}}
{{/if}}

@media

{{#if keyPoints}}
### Key Points

{{#each keyPoints}}
- {{this}}
{{/each}}
{{/if}}

{{#if notes}}
### Notes

{{notes}}
{{/if}}

---
`;
    }

    /**
     * Get header-content template
     * @returns {string} Template markdown
     */
    static getHeaderContentTemplate() {
        return `layout: header-content

@header

{{title}}

@main

{{content}}

{{#if keyPoints}}
### Key Points

{{#each keyPoints}}
- {{this}}
{{/each}}
{{/if}}

---
`;
    }

    /**
     * Get template by slide type
     * @param {string} type - Slide type
     * @returns {string} Template
     */
    static getTemplateForType(type) {
        const templates = this.getDefaults();
        switch (type) {
            case 'title':
                return templates.titleSlide;
            case 'activity':
                return templates.activity;
            case 'summary':
                return templates.summary;
            case 'lecture':
            default:
                return templates.lecture;
        }
    }

    /**
     * Render template with variables
     * @param {string} template - Template string
     * @param {Object} variables - Variables to substitute
     * @returns {string} Rendered template
     */
    static renderTemplate(template, variables) {
        let rendered = template;

        // Simple variable substitution {{variableName}}
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            rendered = rendered.replace(regex, value || '');
        }

        // Handle conditionals {{#if variable}}...{{/if}}
        rendered = rendered.replace(/{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g, (match, varName, content) => {
            return variables[varName] ? content : '';
        });

        // Handle each loops {{#each array}}...{{/each}}
        rendered = rendered.replace(/{{#each\s+(\w+)}}([\s\S]*?){{\/each}}/g, (match, varName, content) => {
            const array = variables[varName];
            if (Array.isArray(array)) {
                return array.map(item => {
                    return content.replace(/{{this}}/g, item);
                }).join('\n');
            }
            return '';
        });

        return rendered;
    }

    /**
     * Get template from profile or use default
     * @param {Object} profile - Course profile
     * @param {string} type - Template type
     * @returns {string} Template
     */
    static getTemplate(profile, type) {
        if (profile.templates && profile.templates[type]) {
            return profile.templates[type];
        }
        return this.getTemplateForType(type);
    }

    /**
     * Validate template syntax
     * @param {string} template - Template string
     * @returns {Object} { valid: boolean, errors: Array<string> }
     */
    static validateTemplate(template) {
        const errors = [];

        // Check for unbalanced conditionals
        const ifMatches = template.match(/{{#if\s+\w+}}/g) || [];
        const endIfMatches = template.match(/{{\/if}}/g) || [];
        if (ifMatches.length !== endIfMatches.length) {
            errors.push('Unbalanced {{#if}}...{{/if}} blocks');
        }

        // Check for unbalanced each loops
        const eachMatches = template.match(/{{#each\s+\w+}}/g) || [];
        const endEachMatches = template.match(/{{\/each}}/g) || [];
        if (eachMatches.length !== endEachMatches.length) {
            errors.push('Unbalanced {{#each}}...{{/each}} blocks');
        }

        // Check for required layout directive
        if (!template.includes('layout:')) {
            errors.push('Template must include a layout directive');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}
