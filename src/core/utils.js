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
        try {
          cb(detail);
        } catch (e) {
          console.error(`Error in listener "${event}":`, e);
        }
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
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text) {
  return safeString(text).replace(/[&<>"']/g, (match) => HTML_ESCAPES[match]);
}

/**
 * Interactive / embedded / scripting tags — always escaped even with attributes.
 * These are never legitimate in slide content outside of fenced code blocks.
 */
const BLOCKED_HTML_TAGS = new Set([
  "button",
  "input",
  "select",
  "textarea",
  "form",
  "fieldset",
  "label",
  "datalist",
  "output",
  "option",
  "optgroup",
  "script",
  "style",
  "iframe",
  "embed",
  "object",
  "param",
  "noscript",
  "audio",
  "video",
  "source",
  "track",
]);

/**
 * Bare tags that are always safe (no content model, never need attributes,
 * never ambiguous with teaching-text).  Pass through even without attributes.
 */
const ALWAYS_OK_BARE = new Set(["br", "hr"]);

const HTML_TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)(\s[^>]*)?\/?>/g;

export function escapeBareHtmlTags(markdown) {
  if (typeof markdown !== "string") return markdown;

  return markdown
    .split(/(`[^`\n]+`)/)
    .map((part, i) => {
      if (i % 2 === 1) return part;

      // First pass: always escape blocked interactive / embedded tags
      let text = part.replace(HTML_TAG_RE, (match, closingSlash, tagName, attrs) => {
        if (!BLOCKED_HTML_TAGS.has(tagName.toLowerCase())) return match;
        const open = closingSlash ? "&lt;/" : "&lt;";
        const close = "&gt;";
        const escapedAttrs = attrs ? attrs.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
        return open + tagName + escapedAttrs + close;
      });

      // Second pass: collect bare non-blocked non-safe tags
      const tags = [];
      let m;
      HTML_TAG_RE.lastIndex = 0;
      while ((m = HTML_TAG_RE.exec(text)) !== null) {
        const [, closingSlash, tagName, attrs] = m;
        const lower = tagName.toLowerCase();
        if (ALWAYS_OK_BARE.has(lower)) continue;
        if (attrs) continue;
        tags.push({ index: m.index, match: m[0], closingSlash, tagName, lower });
      }

      // Pair bare <p> with bare </p> → intentional HTML.  Leftovers = teaching text.
      const paired = new Set();
      const openStack = [];
      for (const tag of tags) {
        if (tag.closingSlash) {
          for (let j = openStack.length - 1; j >= 0; j--) {
            if (openStack[j].lower === tag.lower) {
              paired.add(openStack[j].index);
              paired.add(tag.index);
              openStack.splice(j, 1);
              break;
            }
          }
        } else {
          openStack.push(tag);
        }
      }

      // Escape unmatched tags, right-to-left so indices stay valid
      for (let t = tags.length - 1; t >= 0; t--) {
        const tag = tags[t];
        if (paired.has(tag.index)) continue;
        const escaped = (tag.closingSlash ? "&lt;/" : "&lt;") + tag.tagName + "&gt;";
        text = text.slice(0, tag.index) + escaped + text.slice(tag.index + tag.match.length);
      }
      return text;
    })
    .join("");
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

/**
 * Checks if the current window is embedded in an iframe.
 * @returns {boolean} True if running in an iframe
 */
export function isEmbedded() {
  try {
    return window.self !== window.top || !!window.frameElement;
  } catch (_e) {
    // If accessing window.top throws (cross-origin), assume embedded
    return true;
  }
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
    svg: "markup",
    yml: "yaml",
    sh: "bash",
    shell: "bash",
    ps: "powershell",
    py: "python",
    rs: "rust",
    go: "go",
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
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return "h" + hash;
}

/**
 * Yields control back to the main thread to allow UI updates.
 * Essential for preventing freezes during heavy processing loops.
 */
export function yieldToMain() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Wraps a promise with a timeout.
 * @template T
 * @param {Promise<T>} promise - The promise to wrap
 * @param {number} ms - Timeout in milliseconds
 * @returns {Promise<T>} - Promise that rejects on timeout
 */
export function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms)),
  ]);
}
