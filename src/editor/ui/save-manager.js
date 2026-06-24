/**
 * SaveManager
 *
 * Handles saving the deck to a file (File System Access API or Blob download).
 * Extracted from EditController.
 */
import { Notification } from '../../renderer/notification.js';

export class SaveManager {
    /** @param {import('./edit-controller.js').EditController} ctrl */
    constructor(ctrl) {
        this.ctrl = ctrl;
    }

    get elements() { return this.ctrl.elements; }
    get deck() { return this.ctrl.deck; }
    get hasUnsavedChanges() { return this.ctrl.hasUnsavedChanges; }
    set hasUnsavedChanges(v) { this.ctrl.hasUnsavedChanges = v; }
    get unsavedMarkdown() { return this.ctrl.unsavedMarkdown; }
    get originalMarkdown() { return this.ctrl.originalMarkdown; }

    /**
     * Update the save button state.
     */
    updateButton() {
        if (this.elements.saveSlideBtn) {
            this.elements.saveSlideBtn.disabled = !this.hasUnsavedChanges;
        }
    }

    /**
     * Save changes to a file using File System Access API (Chrome) or Blob download (Firefox).
     */
    async save() {
        // Update cached markdown for all slides (including unsaved changes)
        for (let i = 0; i < this.deck.slides.length; i++) {
            if (this.unsavedMarkdown.has(i)) {
                this.originalMarkdown[i] = this.unsavedMarkdown.get(i);
            }
        }

        // Clear unsaved changes after saving
        this.unsavedMarkdown.clear();
        this.hasUnsavedChanges = false;
        this.updateButton();

        try {
            // Reconstruct the full deck markdown
            const fullMarkdown = this.originalMarkdown.join('\n\n---\n\n');

            // Modern browsers (Chrome/Edge)
            if (window.showSaveFilePicker) {
                const fileHandle = await window.showSaveFilePicker({
                    suggestedName: 'deck.md',
                    types: [{
                        description: 'Markdown file',
                        accept: { 'text/markdown': ['.md'] },
                    }, {
                        description: 'Text file',
                        accept: { 'text/plain': ['.txt'] },
                    }],
                });

                if (!fileHandle) return;

                const writable = await fileHandle.createWritable();
                await writable.write(fullMarkdown);
                await writable.close();

                Notification.success('Deck saved successfully!');
            }
            // Fallback for Firefox/Safari
            else {
                const blob = new Blob([fullMarkdown], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'deck.md';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            // Ignore abort errors (user cancelled)
            if (error.name !== 'AbortError') {
                console.error('Failed to save file:', error);
                Notification.error('Failed to save file: ' + (error.message || error));
            }
        }
    }
}
