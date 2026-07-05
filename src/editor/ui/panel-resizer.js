/**
 * PanelResizer
 *
 * Handles the draggable resize handle between editor and preview panels.
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
    this._onMouseMove = null;
    this._onMouseUp = null;
  }

  init() {
    const resizeHandle = document.querySelector(".editor__resize-handle");
    if (!resizeHandle || !this._editorPanel) return;

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    const onMouseDown = (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = this._editorPanel.offsetWidth;
      resizeHandle.classList.add("dragging");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    };

    this._onMouseMove = (e) => {
      if (!isResizing) return;

      const deltaX = e.clientX - startX;
      const newWidth = startWidth + deltaX;

      const minWidth = 300;
      const maxWidth = 800;
      const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

      this._editorPanel.style.width = constrainedWidth + "px";
      this._editorPanel.style.flex = "none";

      StageScaler.applyStageScale({ stageHost: this._stageHost });
    };

    this._onMouseUp = () => {
      if (!isResizing) return;
      isResizing = false;
      resizeHandle.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    resizeHandle.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", this._onMouseMove);
    document.addEventListener("mouseup", this._onMouseUp);
  }

  destroy() {
    if (this._onMouseMove) document.removeEventListener("mousemove", this._onMouseMove);
    if (this._onMouseUp) document.removeEventListener("mouseup", this._onMouseUp);
  }
}
