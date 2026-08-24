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
    this._openerCheckInterval = null;

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

      // Constrain width between min and max — matches .presenterPanel in panels.css
      const minWidth = 320;
      const maxWidth = 520;
      const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

      presenterPanel.style.width = constrainedWidth + "px";
      presenterPanel.style.flex = "none";

      // Re-scale the stage to fit the new available space
      StageScaler.applyStageScale(this.elements);
      this.dispatchEvent("panelresize", { width: constrainedWidth });
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
    this._bindOrphanHandling();
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
      this.dispatchEvent("viewerwindowchange", { open: false });
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("role", this.isEditorWindow ? "viewer" : "editor");
    this.viewerWindowRef = window.open(url.toString(), "_blank", "width=1100,height=700");
    this._startWindowCheck();
    this._updatePresentButton(true);
    this.dispatchEvent("viewerwindowchange", { open: true });
  }

  /**
   * Close orphan handling: editor closes its viewer on unload,
   * viewer shows an overlay if its opener disappears.
   */
  _bindOrphanHandling() {
    if (this._orphanBound) return;
    this._orphanBound = true;
    if (this.isEditorWindow) {
      window.addEventListener("beforeunload", () => {
        try {
          if (this.viewerWindowRef && !this.viewerWindowRef.closed) this.viewerWindowRef.close();
        } catch (_e) {
          // ignore cross-origin access errors
        }
      });
    } else {
      this._openerCheckInterval = setInterval(() => {
        try {
          if (!window.opener || window.opener.closed) {
            this._showOrphanOverlay();
            this._stopOpenerCheck();
          }
        } catch (_e) {
          this._showOrphanOverlay();
          this._stopOpenerCheck();
        }
      }, 1000);
    }
  }

  _showOrphanOverlay() {
    if (document.getElementById("viewerOrphan")) return;
    const overlay = document.createElement("div");
    overlay.id = "viewerOrphan";
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "9999",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "16px",
      background: "rgba(15,23,42,0.92)",
      color: "white",
      textAlign: "center",
      padding: "24px",
    });

    const heading = document.createElement("h2");
    heading.textContent = "Presenter disconnected";
    Object.assign(heading.style, { margin: "0", fontSize: "20px" });
    overlay.appendChild(heading);

    const message = document.createElement("p");
    message.textContent = "The editor window was closed. This viewer is now orphaned.";
    Object.assign(message.style, { margin: "0", opacity: "0.8" });
    overlay.appendChild(message);

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close viewer";
    Object.assign(closeBtn.style, {
      padding: "8px 16px",
      borderRadius: "6px",
      border: "none",
      background: "#3b82f6",
      color: "white",
      fontWeight: "600",
      cursor: "pointer",
    });
    closeBtn.addEventListener("click", () => window.close());
    overlay.appendChild(closeBtn);

    document.body.appendChild(overlay);
  }

  _stopOpenerCheck() {
    if (this._openerCheckInterval) {
      clearInterval(this._openerCheckInterval);
      this._openerCheckInterval = null;
    }
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
        this.dispatchEvent("viewerwindowchange", { open: false });
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
    this._stopOpenerCheck();
    this.removeAllListeners();
    this.elements = null;
    this.viewerWindowRef = null;
  }
}
