/**
 * Hand-in Template Generator
 * Extracts activities from generated decks and creates hand-in templates
 */

import { Notification } from "../renderer/notification.js";
import { MarkdownParser } from "../data/markdown-parser.js";

export class HandinTemplateGenerator {
    /**
     * Extract activity slides from generated deck
     * @param {string} markdown - Generated deck markdown
     * @returns {Array<Object>} Array of activity slides
     */
    static extractActivities(markdown) {
        try {
            // Parse the markdown into slides
            const deckData = MarkdownParser.parseDeckMarkdown(markdown);

            // Filter for activity slides
            const activities = deckData.slides
                .filter(slide => {
                    // Check for activity markers in layout or content
                    const isActivityLayout = slide.layout === 'two-column' ||
                                           slide.layout === 'activity';

                    // Check content for activity keywords
                    const mainContent = slide.areas.main || '';
                    const hasActivityKeyword = mainContent.toLowerCase().includes('activity') ||
                                              mainContent.toLowerCase().includes('exercise') ||
                                              mainContent.toLowerCase().includes('task');

                    return isActivityLayout || hasActivityKeyword;
                })
                .map((slide, index) => ({
                    slideNumber: index + 1,
                    title: slide.title,
                    content: slide.areas.main || '',
                    instructions: this.extractInstructions(slide.areas.main || ''),
                    task: this.extractTask(slide.areas.main || ''),
                    example: this.extractExample(slide.areas.main || '')
                }));

            return activities;
        } catch (error) {
            console.error('Failed to extract activities:', error);
            return [];
        }
    }

    /**
     * Extract instructions from slide content
     * @param {string} content - Slide content
     * @returns {string} Instructions text
     */
    static extractInstructions(content) {
        // Look for instructions section
        const instructionsMatch = content.match(/###?\s*Instructions?\s*\n([\s\S]*?)(?=\n###|\n\n|$)/i);
        if (instructionsMatch) {
            return instructionsMatch[1].trim();
        }

        // Look for activity section
        const activityMatch = content.match(/###?\s*Activity\s*\n([\s\S]*?)(?=\n###|\n\n|$)/i);
        if (activityMatch) {
            return activityMatch[1].trim();
        }

        // Return first paragraph as instructions
        const firstParagraph = content.split('\n\n')[0];
        return firstParagraph.trim();
    }

    /**
     * Extract task from slide content
     * @param {string} content - Slide content
     * @returns {string} Task text
     */
    static extractTask(content) {
        // Look for task section
        const taskMatch = content.match(/###?\s*Task\s*\n([\s\S]*?)(?=\n###|\n\n|$)/i);
        if (taskMatch) {
            return taskMatch[1].trim();
        }

        // Look for exercise section
        const exerciseMatch = content.match(/###?\s*Exercise\s*\n([\s\S]*?)(?=\n###|\n\n|$)/i);
        if (exerciseMatch) {
            return exerciseMatch[1].trim();
        }

        return 'Complete the activity below.';
    }

    /**
     * Extract example from slide content
     * @param {string} content - Slide content
     * @returns {string} Example text
     */
    static extractExample(content) {
        // Look for example section
        const exampleMatch = content.match(/###?\s*Example\s*\n([\s\S]*?)(?=\n###|\n\n|$)/i);
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
     * Generate hand-in template from activities
     * @param {Array<Object>} activities - Activity slides
     * @param {Object} profile - Course profile
     * @param {string} topic - Topic name
     * @returns {string} Hand-in template markdown
     */
    static generateHandinTemplate(activities, profile, topic) {
        if (!activities || activities.length === 0) {
            return '';
        }

        const lines = [
            `# ${topic} - Hand-in Template`,
            '',
            `**Course:** ${profile.name}`,
            `**Student Name:** _______________`,
            `**Date:** _______________`,
            '',
            '---',
            '',
            '## Activities',
            ''
        ];

        activities.forEach((activity, index) => {
            lines.push(`### Activity ${index + 1}: ${activity.title}`);
            lines.push('');
            lines.push(activity.instructions);
            lines.push('');
            lines.push('**Task:**');
            lines.push('');
            lines.push(activity.task);
            lines.push('');
            lines.push('**Your Answer:**');
            lines.push('');
            lines.push('````');
            lines.push('');
            lines.push('````');
            lines.push('');
            lines.push('---');
            lines.push('');
        });

        return lines.join('\n');
    }

    /**
     * Save hand-in template to file
     * @param {string} template - Hand-in template content
     * @param {string} topic - Topic name
     */
    static async saveHandinTemplate(template, topic) {
        if (!template) {
            Notification.warning('No activities found to create hand-in template');
            return;
        }

        const filename = `${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-handin.md`;

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
                await writable.write(template);
                await writable.close();

                Notification.success('Hand-in template saved successfully!');
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Save failed:', error);
                    Notification.error('Failed to save hand-in template');
                }
            }
        } else {
            // Fallback: download as blob
            const blob = new Blob([template], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            Notification.success('Hand-in template downloaded!');
        }
    }

    /**
     * Generate and save hand-in template from a deck
     * @param {string} markdown - Generated deck markdown
     * @param {Object} profile - Course profile
     * @param {string} topic - Topic name
     */
    static async generateAndSave(markdown, profile, topic) {
        const activities = this.extractActivities(markdown);

        if (activities.length === 0) {
            Notification.info('No activity slides found in this deck');
            return;
        }

        const template = this.generateHandinTemplate(activities, profile, topic);
        await this.saveHandinTemplate(template, topic);
    }
}
