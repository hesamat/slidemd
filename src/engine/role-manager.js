/**
 * RoleManager
 * Manages editor/viewer role state, URL-based role detection, and viewer window reference.
 */

import { EventEmitter } from "../core/utils.js";
import { StageScaler } from "../renderer/stage-scaler.js";

export class RoleManager extends EventEmitter {
  /**
   * Creates a new RoleManager.
   * @param {Object} elements - DOM element references
   */
  constructor(elements) {
    super();
    this.elements = elements;
    this.isEditorWindow = false;
    this.viewerWindowRef = null;
    this._windowCheckInterval = null;

    // Initialize panel resize functionality
    this.initPanelResize();
  }

  /**
   * Initialize presenter panel resize functionality
   */
  initPanelResize() {
    const resizeHandle = document.querySelector(".presenter__resize-handle");
    const presenterPanel = this.elements.presenterPanel;

    if (!resizeHandle || !presenterPanel) return;

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    const onMouseDown = (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = presenterPanel.offsetWidth;
      resizeHandle.classList.add("dragging");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    };

    const onMouseMove = (e) => {
      if (!isResizing) return;

      // For right-side panel: dragging left decreases width, dragging right increases width
      const deltaX = startX - e.clientX;
      const newWidth = startWidth + deltaX;

      // Constrain width between min and max
      const minWidth = 200;
      const maxWidth = 600;
      const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

      presenterPanel.style.width = constrainedWidth + "px";
      presenterPanel.style.flex = "none";

      // Re-scale the stage to fit the new available space
      StageScaler.applyStageScale(this.elements);
    };

    const onMouseUp = () => {
      if (!isResizing) return;
      isResizing = false;
      resizeHandle.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    resizeHandle.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  /**
   * Applies the role from URL search parameters.
   * Sets the role attribute on the document element.
   */
  applyRoleFromUrl() {
    const url = new URL(window.location.href);
    this.isEditorWindow = url.searchParams.get("role") === "editor";
    document.documentElement.setAttribute(
      "data-webdeck-role",
      this.isEditorWindow ? "editor" : "viewer",
    );
    this.dispatchEvent("rolechange", { isEditorWindow: this.isEditorWindow });
  }

  /**
   * Toggles the viewer window.
   * If a window is already open, closes it.
   */
  togglePresentWindow() {
    if (this.viewerWindowRef && !this.viewerWindowRef.closed) {
      this.viewerWindowRef.close();
      this.viewerWindowRef = null;
      this._stopWindowCheck();
      this._updatePresentButton(false);
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("role", this.isEditorWindow ? "viewer" : "editor");
    this.viewerWindowRef = window.open(url.toString(), "_blank", "width=1100,height=700");
    this._startWindowCheck();
    this._updatePresentButton(true);
  }

  /**
   * Update the present button text based on window state.
   * @param {boolean} isWindowOpen - Whether the viewer window is open
   */
  _updatePresentButton(isWindowOpen) {
    const btn = this.elements.presentBtn;
    if (!btn) return;

    const textSpan = btn.querySelector("span");
    if (textSpan) {
      textSpan.textContent = isWindowOpen ? "Close" : "Present";
    }

    // Update aria-label for accessibility
    btn.setAttribute("aria-label", isWindowOpen ? "Close viewer window" : "Open viewer view");
    btn.setAttribute("title", isWindowOpen ? "Close" : "Present");
  }

  /**
   * Start polling for viewer window closure.
   */
  _startWindowCheck() {
    this._stopWindowCheck();
    this._windowCheckInterval = setInterval(() => {
      if (this.viewerWindowRef && this.viewerWindowRef.closed) {
        this.viewerWindowRef = null;
        this._stopWindowCheck();
        this._updatePresentButton(false);
      }
    }, 500);
  }

  /**
   * Stop polling for viewer window closure.
   */
  _stopWindowCheck() {
    if (this._windowCheckInterval) {
      clearInterval(this._windowCheckInterval);
      this._windowCheckInterval = null;
    }
  }

  /**
   * Checks if the current window has a viewer shell (required DOM elements).
   * @returns {boolean} True if viewer shell is present
   */
  static hasViewerShell() {
    return !!(document.getElementById("slidesContainer") && document.getElementById("stageHost"));
  }

  /**
   * Checks if the current window is in editor mode.
   * @returns {boolean} True if editor mode
   */
  static isEditorMode() {
    const url = new URL(window.location.href);
    return url.searchParams.get("role") === "editor";
  }

  /**
   * Checks if the current window is in viewer mode.
   * @returns {boolean} True if viewer mode
   */
  static isViewerMode() {
    const url = new URL(window.location.href);
    return url.searchParams.get("role") === "viewer";
  }

  /**
   * Initializes the role from URL and updates the UI.
   * This is a static initializer for app startup.
   */
  static initRole() {
    const url = new URL(window.location.href);
    const isEditor = url.searchParams.get("role") === "editor";
    document.documentElement.setAttribute("data-webdeck-role", isEditor ? "editor" : "viewer");

    const panel = document.getElementById("presenterPanel");
    if (panel) panel.classList.toggle("webdeck-hidden", !isEditor);
  }

  /**
   * Cleans up resources.
   */
  destroy() {
    this._stopWindowCheck();
    this.removeAllListeners();
    this.elements = null;
    this.viewerWindowRef = null;
  }
}
