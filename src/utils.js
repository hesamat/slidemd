/**
 * Utility functions
 * Shared helpers for string manipulation, events, and async control flow.
 */

export const DESIGN_SIZE = Object.freeze({ width: 1920, height: 1080 });

/**
 * EventEmitter - A simple event emitter utility class.
 */
export class EventEmitter {
    constructor() {
        this._listeners = new Map();
    }

    addEventListener(event, callback) {
        if (typeof callback !== "function") {
            console.warn("EventEmitter: callback must be a function", { event });
            return;
        }
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }
        this._listeners.get(event).push(callback);
    }

    removeEventListener(event, callback) {
        if (this._listeners.has(event)) {
            const listeners = this._listeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) listeners.splice(index, 1);
        }
    }

    dispatchEvent(event, detail) {
        if (this._listeners.has(event)) {
            this._listeners.get(event).forEach((cb) => {
                try { cb(detail); } 
                catch (e) { console.error(`Error in listener "${event}":`, e); }
            });
        }
    }

    removeAllListeners(event) {
        if (event) this._listeners.delete(event);
        else this._listeners.clear();
    }
}

export function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

export function safeString(v) {
    return typeof v === "string" ? v : "";
}

const HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

export function escapeHtml(text) {
    return safeString(text).replace(/[&<>"']/g, match => HTML_ESCAPES[match]);
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
        c: "c", cpp: "cpp", 
        js: "javascript", ts: "typescript", 
        html: "markup", xml: "markup", svg: "markup",
        yml: "yaml", 
        sh: "bash", shell: "bash", 
        ps: "powershell", 
        py: "python",
        rs: "rust", go: "go"
    };

    return alias[lang] || lang;
}

/**
 * Generates a simple hash of a string.
 * Used for caching D2 diagrams and other expensive assets.
 */
export function simpleHash(str) {
    let hash = 0;
    str = safeString(str);
    if (str.length === 0) return "h0";
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    return "h" + hash;
}

/**
 * Yields control back to the main thread to allow UI updates.
 * Essential for preventing freezes during heavy processing loops.
 */
export function yieldToMain() {
    return new Promise(resolve => setTimeout(resolve, 0));
}