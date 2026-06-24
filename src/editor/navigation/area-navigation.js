/**
 * AreaNavigation
 *
 * Utilities for navigating between @area markers inside the markdown
 * editor extracted from EditController.
 */

export class AreaNavigation {
    /** @param {import('./edit-controller.js').EditController} ctrl */
    constructor(ctrl) {
        this.ctrl = ctrl;
    }

    get markdownEditor() { return this.ctrl.markdownEditor; }

    /**
     * Jump the cursor to the given @area in the editor, or append the
     * area marker if it doesn't exist yet.
     */
    navigateToArea(areaName) {
        if (!this.markdownEditor) return;

        const name = String(areaName || '').trim().toLowerCase();
        if (!name) return;

        const markdown = this.markdownEditor.getValue();
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`^\\s*@${escapedName}\\s*$`, 'mi');
        const match = regex.exec(markdown);

        if (match) {
            const cursorPosition = match.index + match[0].length;
            this.markdownEditor.setValueWithCursor(markdown, cursorPosition, {
                suppressOnChange: true,
                scrollIntoView: true,
            });
            this.markdownEditor.focus();
            return;
        }

        const spacer = markdown.endsWith('\n') ? '' : '\n';
        const addition = `${spacer}\n@${name}\n`;
        const updated = `${markdown}${addition}`;
        const cursorPosition = updated.length;
        this.markdownEditor.setValueWithCursor(updated, cursorPosition, {
            suppressOnChange: true,
            scrollIntoView: true,
        });
        this.ctrl.onEditorInput(updated);
    }

    /**
     * Determine which @area the cursor (or a given character offset) falls
     * inside.  Defaults to `'main'` when no marker precedes the position.
     */
    getAreaAtCursor(markdown, position) {
        const text = String(markdown || '').replace(/\r\n?/g, '\n');
        const lines = text.split('\n');
        const markerRegex = /^\s*@([a-zA-Z_][a-zA-Z0-9_-]*)\s*$/;

        let currentArea = 'main';
        let currentOffset = 0;

        for (const line of lines) {
            const match = line.match(markerRegex);
            if (match) {
                if (position >= currentOffset) {
                    currentArea = match[1].toLowerCase();
                }
            }
            currentOffset += line.length + 1;
        }
        return currentArea;
    }

    /**
     * Return the character range for the content inside a named @area block.
     * The range excludes the @area marker line itself and ends at the next
     * area marker or the end of the document.
     */
    getAreaContentRange(markdown, areaName) {
        const text = String(markdown || '').replace(/\r\n?/g, '\n');
        const lines = text.split('\n');
        const target = String(areaName || 'main').trim().toLowerCase();

        const markerRegex = /^\s*@([a-zA-Z_][a-zA-Z0-9_-]*)\s*$/;
        let areaMarkerIdx = -1;
        let nextMarkerIdx = lines.length;

        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(markerRegex);
            if (!match) continue;
            if (match[1].toLowerCase() === target) {
                areaMarkerIdx = i;
            } else if (areaMarkerIdx >= 0 && i > areaMarkerIdx) {
                nextMarkerIdx = i;
                break;
            }
        }

        if (areaMarkerIdx < 0) {
            return { from: text.length, to: text.length };
        }

        const lineToChar = (lineIndex) => {
            let pos = 0;
            for (let i = 0; i < lineIndex; i++) {
                pos += lines[i].length + 1;
            }
            return pos;
        };

        return {
            from: lineToChar(areaMarkerIdx + 1),
            to: lineToChar(nextMarkerIdx),
        };
    }

    /**
     * Resolve an insertion position inside an @area block as a ratio (0–1)
     * of the block's line count.  Useful for drag-and-drop insertion.
     */
    resolveAreaInsertPositionByRatio(markdown, areaName, ratioY = 1) {
        const text = String(markdown || '').replace(/\r\n?/g, '\n');
        const range = this.getAreaContentRange(text, areaName);
        const segment = text.slice(range.from, range.to);
        if (!segment.length) return range.from;

        const lines = segment.split('\n');
        const lineIndex = Math.max(0, Math.min(
            lines.length - 1,
            Math.floor((Number(ratioY) || 0) * lines.length)
        ));

        let offset = 0;
        for (let i = 0; i < lineIndex; i++) {
            offset += lines[i].length + 1;
        }
        return Math.min(range.to, range.from + offset);
    }
}
