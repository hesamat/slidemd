/**
 * ImageInserter
 *
 * Handles inserting images into slide markdown via the image picker,
 * drag-drop, and clipboard paste.
 */

import { ImagePicker } from './image-picker.js';
import { DeckImagesResolver } from './deck-images-resolver.js';

export class ImageInserter {
    /** @param {import('./edit-controller.js').EditController} ctrl */
    constructor(ctrl) {
        this.ctrl = ctrl;
    }

    get markdownEditor() { return this.ctrl.markdownEditor; }
    get imageBg() { return this.ctrl.imageBg; }

    // ─── Image picker insertion ──────────────────────────────────

    async pickAndInsert() {
        if (!this.markdownEditor) return;

        const deckDirHandle = await this.imageBg._resolveDeckDirectoryHandle();
        DeckImagesResolver.setDeckDir(deckDirHandle, this.imageBg.deckDirMode);

        ImagePicker.show(
            (snippet) => {
                const current = this.markdownEditor.getValue();
                const editorHasFocus = this.markdownEditor.view?.hasFocus;

                let insertPos;
                let afterSnippet;

                if (editorHasFocus) {
                    const selection = this.markdownEditor.getSelection?.() || { from: 0, to: 0 };
                    const isAtStart = selection.from === 0;
                    const isAtEnd = selection.from >= current.length;
                    const prevChar = isAtStart ? '\n' : current[selection.from - 1];
                    const nextChar = isAtEnd ? '\n' : current[selection.from];

                    const before = prevChar === '\n' ? '' : '\n\n';
                    const after = isAtEnd ? '' : (nextChar === '\n' ? '\n' : '\n\n');
                    const leadTrim = isAtStart ? before.replace(/^\n+/, '') : before;

                    insertPos = selection.from;
                    afterSnippet = `${leadTrim}${snippet}${after}`;
                } else {
                    const footerIdx = current.search(/^@footer\b/m);
                    if (footerIdx > 0) {
                        insertPos = footerIdx;
                        afterSnippet = `${snippet}\n\n`;
                    } else {
                        insertPos = current.length;
                        afterSnippet = `\n\n${snippet}\n`;
                    }
                }

                this.markdownEditor.replaceRange(insertPos, insertPos, afterSnippet);
                this.markdownEditor.focus();
            },
            {
                deckDirHandle,
                deckDirMode: this.imageBg.deckDirMode,
                onChangeFolder: async () => {
                    await this.imageBg.clearDeckDirectoryHandle();
                    const next = await this.imageBg._resolveDeckDirectoryHandle();
                    if (next) DeckImagesResolver.setDeckDir(next, this.imageBg.deckDirMode);
                    return next ? { handle: next, mode: this.imageBg.deckDirMode } : null;
                },
            }
        );
    }

    // ─── Drag-drop and clipboard paste ───────────────────────────

    initDropAndPaste(slidesContainer) {
        // ── Drag-over: allow drop when image data or image files are present
        slidesContainer.addEventListener('dragover', (e) => {
            if (!this.ctrl.isEditMode) return;
            const types = [...(e.dataTransfer?.types || [])];
            const items = [...(e.dataTransfer?.items || [])];
            const hasImagePath = types.includes('text/x-webdeck-image');
            const hasImageFile = items.some((i) => i.kind === 'file' && i.type.startsWith('image/'));
            if (hasImagePath || hasImageFile) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            }
        });

        // ── Drop: insert image from picker grid or desktop file
        slidesContainer.addEventListener('drop', async (e) => {
            if (!this.ctrl.isEditMode) return;
            e.preventDefault();
            e.stopPropagation();

            const dirHandle = await this.imageBg._resolveDeckDirectoryHandle();
            if (dirHandle) {
                DeckImagesResolver.setDeckDir(dirHandle, this.imageBg.deckDirMode);
            }

            let imgPath = e.dataTransfer.getData('text/x-webdeck-image');
            if (!imgPath) {
                const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
                if (file) {
                    imgPath = await this.imageBg.uploadImage(file);
                }
            }
            if (!imgPath) return;

            this._insertImageAtDropPosition(imgPath, e.clientX, e.clientY, e.target);
        });

        // ── Paste: insert image from clipboard
        slidesContainer.addEventListener('paste', async (e) => {
            if (!this.ctrl.isEditMode) return;
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) {
                        const dirHandle = await this.imageBg._resolveDeckDirectoryHandle();
                        if (dirHandle) {
                            DeckImagesResolver.setDeckDir(dirHandle, this.imageBg.deckDirMode);
                        }
                        const imgPath = await this.imageBg.uploadImage(file);
                        if (imgPath) {
                            const slideEl = this.ctrl.getSlideElementByIndex(this.ctrl.currentSlideIndex);
                            const grid = slideEl?.querySelector('.slide__grid');
                            if (grid) {
                                const rect = grid.getBoundingClientRect();
                                this._insertImageAtDropPosition(imgPath, rect.left + rect.width / 2, rect.top + rect.height / 2, slideEl);
                            }
                        }
                    }
                    return;
                }
            }
        });
    }

    /**
     * Insert an image at the given screen coordinates, computing design-space
     * position relative to the slide grid.
     */
    _insertImageAtDropPosition(imgPath, clientX, clientY, eventTarget) {
        const slideEl = eventTarget.closest?.('.slide') || this.ctrl.getSlideElementByIndex(this.ctrl.currentSlideIndex);
        if (!slideEl) return;
        const grid = slideEl.querySelector('.slide__grid');
        if (!grid) return;

        const scale = parseFloat(this.ctrl.elements.deckStage?.style.getPropertyValue('--stage-scale')) || 1;
        const gridRect = grid.getBoundingClientRect();

        const dropGridX = (clientX - gridRect.left) / scale;
        const dropGridY = (clientY - gridRect.top) / scale;

        const areaEl = eventTarget.closest?.('.slide__area');
        const areaName = areaEl?.dataset.areaName || 'main';

        let left = Math.round(dropGridX);
        let top = Math.round(dropGridY);
        if (areaEl) {
            const areaRect = areaEl.getBoundingClientRect();
            const areaStyle = getComputedStyle(areaEl);
            const padLeft = parseFloat(areaStyle.paddingLeft) || 0;
            const padTop = parseFloat(areaStyle.paddingTop) || 0;
            const areaContentLeft = (areaRect.left + padLeft - gridRect.left) / scale;
            const areaContentTop = (areaRect.top + padTop - gridRect.top) / scale;
            left = Math.round(dropGridX - areaContentLeft);
            top = Math.round(dropGridY - areaContentTop);
        }

        const alt = imgPath.split('/').pop().replace(/\.[^.]+$/, '').replace(/^\d+[-_]?/, '') || 'image';
        const snippet = `<img src="${imgPath}" alt="${alt}" style="position: relative; left: ${left}px; top: ${top}px; width: 480px; border: none; object-fit: contain; cursor: move;" />`;

        const markdown = this.markdownEditor?.getValue() ?? '';
        const range = this.ctrl.areaNav.getAreaContentRange(markdown, areaName);
        const insertText = `${snippet}\n`;
        this.markdownEditor?.replaceRange(range.to, range.to, insertText);
    }
}
