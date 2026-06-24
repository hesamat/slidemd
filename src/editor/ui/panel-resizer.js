/**
 * PanelResizer
 *
 * Handles the draggable resize handle between editor and preview panels.
 * Extracted from EditController.
 */
import { StageScaler } from '../../renderer/stage-scaler.js';

export class PanelResizer {
    /** @param {import('./edit-controller.js').EditController} ctrl */
    constructor(ctrl) {
        this.ctrl = ctrl;
    }

    get elements() { return this.ctrl.elements; }

    /**
     * Initialize panel resize functionality.
     */
    init() {
        const resizeHandle = document.querySelector('.editor__resize-handle');
        const editorPanel = this.elements.editorPanel;

        if (!resizeHandle || !editorPanel) return;

        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        const onMouseDown = (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = editorPanel.offsetWidth;
            resizeHandle.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        };

        const onMouseMove = (e) => {
            if (!isResizing) return;

            const deltaX = e.clientX - startX;
            const newWidth = startWidth + deltaX;

            // Constrain width between min and max
            const minWidth = 300;
            const maxWidth = 800;
            const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

            editorPanel.style.width = constrainedWidth + 'px';
            editorPanel.style.flex = 'none';

            // Re-scale the stage to fit the new available space
            StageScaler.applyStageScale(this.elements);
        };

        const onMouseUp = () => {
            if (!isResizing) return;
            isResizing = false;
            resizeHandle.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        resizeHandle.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }
}
