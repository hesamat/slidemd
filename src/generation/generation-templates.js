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
            roadmap: this.getRoadmapTemplate(),
            conceptDefinition: this.getConceptDefinitionTemplate(),
            conceptWithCode: this.getConceptWithCodeTemplate(),
            comparison: this.getComparisonTemplate(),
            activity: this.getActivityTemplate(),
            summary: this.getSummaryTemplate(),
            // Legacy aliases kept for compatibility with existing profiles.
            lecture: this.getConceptWithCodeTemplate(),
            twoColumn: this.getComparisonTemplate(),
            headerContent: this.getConceptDefinitionTemplate()
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
## {{subtitle}}
{{/if}}

{{#if courseWeek}}
## {{courseWeek}}
{{/if}}

{{#if presenter}}
### {{presenter}}
{{/if}}

---
`;
    }

    /**
     * Get roadmap slide template
     * @returns {string} Template markdown
     */
    static getRoadmapTemplate() {
        return `layout: two-column

@header

## Today's Roadmap

@main

### Context
{{context}}

### {{sessionGoalTitle}}
{{sessionGoalBody}}

@media

### {{roadmapTitle}}
{{agendaItems}}

---
`;
    }

    /**
     * Get concept definition slide template
     * @returns {string} Template markdown
     */
    static getConceptDefinitionTemplate() {
        return `layout: header-content

@header

## {{title}}

@main

{{lead}}

{{content}}

{{#if rule}}
> **Rule of Thumb:** {{rule}}
{{/if}}

---
`;
    }

    /**
     * Get concept + code slide template
     * @returns {string} Template markdown
     */
    static getConceptWithCodeTemplate() {
        return `layout: two-column

@header

## {{title}}

@main

{{content}}

@media

### {{codeTitle}}

\`\`\`{{codeLang}}
{{code}}
\`\`\`

---
`;
    }

    /**
     * Get comparison slide template
     * @returns {string} Template markdown
     */
    static getComparisonTemplate() {
        return `layout: two-column

@header

## {{title}}

@main

{{content}}

@media

### {{comparisonTitle}}
{{comparisonTable}}

{{#if patternNote}}
> **Pattern:** {{patternNote}}
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

{{#if background}}
background: {{background}}
{{/if}}

{{#if notes}}
<!-- notes:
{{notes}}
-->
{{/if}}

@header

## Activity {{activityNumber}}: {{title}}

@main

### {{scenarioTitle}}
{{scenario}}

{{#if codeSnippet}}
\`\`\`{{snippetLang}}
{{codeSnippet}}
\`\`\`
{{/if}}

@media

### Task & Discussion
{{task}}

{{#if hint}}
*({{hint}})*
{{/if}}

---
`;
    }

    /**
     * Get summary slide template
     * @returns {string} Template markdown
     */
    static getSummaryTemplate() {
        return `layout: header-content

@header

## Summary: {{title}}

@main

{{content}}

{{#if summaryTable}}
{{summaryTable}}
{{/if}}

{{#if keyTakeaway}}
**Remember:** {{keyTakeaway}}
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
            case 'roadmap':
                return templates.roadmap;
            case 'concept':
            case 'definition':
                return templates.conceptDefinition;
            case 'conceptWithCode':
                return templates.conceptWithCode;
            case 'comparison':
                return templates.comparison;
            case 'activity':
                return templates.activity;
            case 'summary':
                return templates.summary;
            case 'lecture':
            default:
                return templates.conceptWithCode;
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

        // Escape nullish variable bags to avoid runtime failures.
        const safeVariables = variables || {};

        // Simple variable substitution {{variableName}}
        for (const [key, value] of Object.entries(safeVariables)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            rendered = rendered.replace(regex, value || '');
        }

        // Handle conditionals {{#if variable}}...{{/if}}
        rendered = rendered.replace(/{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g, (match, varName, content) => {
            return safeVariables[varName] ? content : '';
        });

        // Handle each loops {{#each array}}...{{/each}}
        rendered = rendered.replace(/{{#each\s+(\w+)}}([\s\S]*?){{\/each}}/g, (match, varName, content) => {
            const array = safeVariables[varName];
            if (Array.isArray(array)) {
                return array.map((item, index) => {
                    let row = content.replace(/{{index}}/g, String(index + 1));
                    if (item && typeof item === 'object') {
                        for (const [itemKey, itemValue] of Object.entries(item)) {
                            const itemRegex = new RegExp(`{{${itemKey}}}`, 'g');
                            row = row.replace(itemRegex, itemValue ?? '');
                        }
                        row = row.replace(/{{this}}/g, '');
                        return row;
                    }
                    return row.replace(/{{this}}/g, item ?? '');
                }).join('\n');
            }
            return '';
        });

        // Remove unresolved placeholders outside fenced code blocks to keep output clean
        // without corrupting literal mustache-style syntax in code examples.
        const codeBlockRegex = /```[\s\S]*?```/g;
        let cleaned = '';
        let lastIndex = 0;
        let match;

        while ((match = codeBlockRegex.exec(rendered)) !== null) {
            // Clean placeholders in text before the code block
            const before = rendered.slice(lastIndex, match.index);
            cleaned += before.replace(/{{\w+}}/g, '');
            // Preserve the code block exactly as-is
            cleaned += match[0];
            lastIndex = match.index + match[0].length;
        }

        // Clean placeholders in any remaining text after the last code block
        cleaned += rendered.slice(lastIndex).replace(/{{\w+}}/g, '');

        return cleaned;
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
