/**
 * Utility functions
 * Provides helper functions for string normalization, HTML escaping, slug generation, deck ID extraction, and code language normalization.
 */
// Utility functions
export const DESIGN_SIZE = { width: 1920, height: 1080 };

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
