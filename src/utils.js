/**
 * Utility functions
 * Provides helper functions for string normalization, HTML escaping, slug generation,
 * deck ID extraction, code language normalization, and event emission.
 */
// Utility functions
export const DESIGN_SIZE = { width: 1920, height: 1080 };

/**
 * EventEmitter - A simple event emitter utility class.
 * Provides addEventListener, removeEventListener, and dispatchEvent methods
 * for custom event handling in any class.
 */
export class EventEmitter {
    constructor() {
        this._listeners = new Map();
    }

    /**
     * Adds an event listener for the specified event.
     * @param {string} event - The event name
     * @param {Function} callback - The callback function
     */
    addEventListener(event, callback) {
        if (typeof callback !== "function") {
            console.warn("EventEmitter.addEventListener: callback must be a function", { event, callback });
            return;
        }
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }
        this._listeners.get(event).push(callback);
    }

    /**
     * Removes an event listener for the specified event.
     * @param {string} event - The event name
     * @param {Function} callback - The callback function to remove
     */
    removeEventListener(event, callback) {
        if (this._listeners.has(event)) {
            const listeners = this._listeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * Dispatches an event with optional detail data to all registered listeners.
     * @param {string} event - The event name
     * @param {*} detail - Optional detail data to pass to listeners
     */
    dispatchEvent(event, detail) {
        if (this._listeners.has(event)) {
            this._listeners.get(event).forEach((cb) => {
                try {
                    cb(detail);
                } catch (e) {
                    console.error(`Error in event listener for "${event}":`, e);
                }
            });
        }
    }

    /**
     * Removes all event listeners for a specific event, or all events if none specified.
     * @param {string} [event] - Optional event name to clear only that event's listeners
     */
    removeAllListeners(event) {
        if (event) {
            this._listeners.delete(event);
        } else {
            this._listeners.clear();
        }
    }

    /**
     * Gets the count of listeners for a specific event.
     * @param {string} event - The event name
     * @returns {number} The number of listeners for the event
     */
    listenerCount(event) {
        return this._listeners.has(event) ? this._listeners.get(event).length : 0;
    }
}

export function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

export function safeString(v) {
    return typeof v === "string" ? v : "";
}

export function escapeHtml(text) {
    return safeString(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function slugifyTitle(title) {
    const s = safeString(title)
        .trim()
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    return s || "slide";
}

export function getDeckId(deck) {
    const id = deck?.meta?.id;
    return typeof id === "string" && id.trim() ? id.trim() : "webdeck";
}

export function normalizeCodeLanguage(raw) {
    const lang = safeString(raw).trim().toLowerCase();
    if (!lang) return "none";

    const alias = {
        c: "c",
        cpp: "cpp",
        js: "javascript",
        ts: "typescript",
        html: "markup",
        xml: "markup",
        yml: "yaml",
        sh: "bash",
        shell: "bash",
        ps: "powershell",
        py: "python",
    };

    return alias[lang] || lang;
}
