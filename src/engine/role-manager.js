/**
 * RoleManager
 * Manages presenter/viewer role state, URL-based role detection, and presenter window reference.
 */

import { EventEmitter } from "../core/utils.js";

export class RoleManager extends EventEmitter {
    /**
     * Creates a new RoleManager.
     * @param {Object} elements - DOM element references
     */
    constructor(elements) {
        super();
        this.elements = elements;
        this.isPresenterWindow = false;
        this.presenterWindowRef = null;
    }

    /**
     * Applies the role from URL search parameters.
     * Sets the role attribute on the document element.
     */
    applyRoleFromUrl() {
        const url = new URL(window.location.href);
        this.isPresenterWindow = url.searchParams.get("role") === "presenter";
        document.documentElement.setAttribute("data-webdeck-role", this.isPresenterWindow ? "presenter" : "viewer");
        this.dispatchEvent("rolechange", { isPresenterWindow: this.isPresenterWindow });
    }

    /**
     * Opens the presenter or viewer window.
     * If a window is already open, closes it.
     */
    openViewerWindow() {
        if (this.presenterWindowRef && !this.presenterWindowRef.closed) {
            this.presenterWindowRef.close();
            this.presenterWindowRef = null;
            return;
        }
        const url = new URL(window.location.href);
        url.searchParams.set("role", this.isPresenterWindow ? "viewer" : "presenter");
        this.presenterWindowRef = window.open(url.toString(), "_blank", "width=1100,height=700");
    }

    /**
     * Checks if the current window has a viewer shell (required DOM elements).
     * @returns {boolean} True if viewer shell is present
     */
    static hasViewerShell() {
        return !!(document.getElementById("slidesContainer") && document.getElementById("stageHost"));
    }

    /**
     * Initializes the role from URL and updates the UI.
     * This is a static initializer for app startup.
     */
    static initRole() {
        const url = new URL(window.location.href);
        const isPresenter = url.searchParams.get("role") === "presenter";
        document.documentElement.setAttribute("data-webdeck-role", isPresenter ? "presenter" : "viewer");

        const panel = document.getElementById("presenterPanel");
        if (panel) panel.classList.toggle("webdeck-hidden", !isPresenter);
    }

    /**
     * Cleans up resources.
     */
    destroy() {
        this.removeAllListeners();
        this.elements = null;
        this.presenterWindowRef = null;
    }
}
