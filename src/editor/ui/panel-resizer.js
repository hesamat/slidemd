/**
 * PanelResizer
 *
 * Handles the draggable resize handle between editor and preview panels.
 * Uses AbortController for clean teardown of all event listeners.
 * Extracted from EditController.
 */
import { StageScaler } from "../../renderer/stage-scaler.js";

export class PanelResizer {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.editorPanel
   * @param {HTMLElement} opts.stageHost
   */
  constructor({ editorPanel, stageHost }) {
    this._editorPanel = editorPanel;
    this._stageHost = stageHost;
    this._abortController = null;
  }

  init() {
    const resizeHandle = document.querySelector(".editor__resize-handle");
    if (!resizeHandle || !this._editorPanel) return;

    this._abortController = new AbortController();
    const { signal } = this._abortController;

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizeHandle.addEventListener(
      "mousedown",
      (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = this._editorPanel.offsetWidth;
        resizeHandle.classList.add("dragging");
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      },
      { signal },
    );

    document.addEventListener(
      "mousemove",
      (e) => {
        if (!isResizing) return;
        const deltaX = e.clientX - startX;
        const newWidth = startWidth + deltaX;
        const minWidth = 300;
        const maxWidth = 800;
        const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
        this._editorPanel.style.width = constrainedWidth + "px";
        this._editorPanel.style.flex = "none";
        StageScaler.applyStageScale({ stageHost: this._stageHost });
      },
      { signal },
    );

    document.addEventListener(
      "mouseup",
      () => {
        if (!isResizing) return;
        isResizing = false;
        resizeHandle.classList.remove("dragging");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      },
      { signal },
    );
  }

  destroy() {
    this._abortController?.abort();
    this._abortController = null;
  }
}
