/**
 * DeckLoader
 * Loads deck data from the CLI dev server API, embedded HTML, or broadcast channels.
 * Provides normalization and parsing for deck structures.
 *
 * @class
 */
import { AssetLoader } from "../core/asset-loader.js";
import { MarkdownParser } from "./markdown-parser.js";
import { safeString, getDeckId, DESIGN_SIZE } from "../core/utils.js";
import { Logger } from "../core/logger.js";

/** @class */
export class DeckLoader {
  /**
   * Get the display title for a deck (from localStorage file name or deck meta).
   * @static
   * @param {import('../types.js').Deck} deck
   * @returns {string}
   */
  static getDisplayTitle(deck) {
    // Prefer the deck's own title (from first slide's # heading)
    const metaTitle = safeString(deck?.meta?.title);
    if (metaTitle) return metaTitle;

    // Fall back to the file name if no title in the deck
    const localFileName = localStorage.getItem("webdeck_local_file_name");
    if (localFileName) return localFileName;

    return "Slide Deck";
  }

  /**
   * Resolve the source markdown from localStorage or the embedded build payload.
   * @static
   * @returns {string}
   */
  static getSourceMarkdown() {
    return localStorage.getItem("webdeck_local_file") || window.__WEBDECK_MARKDOWN__ || "";
  }

  /**
   * Registry of file handles keyed by file name (for reload without re-pick).
   * @static
   * @type {Map<string, FileSystemFileHandle>}
   */
  static get fileHandleRegistry() {
    if (!window.__WEBDECK_FILE_HANDLE_REGISTRY__) {
      window.__WEBDECK_FILE_HANDLE_REGISTRY__ = new Map();
    }
    return window.__WEBDECK_FILE_HANDLE_REGISTRY__;
  }

  /**
   * Whether the browser supports the File System Access API.
   * @static
   * @type {boolean}
   */
  static get supportsFileSystemAPI() {
    return "showOpenFilePicker" in window;
  }

  /**
   * Load and parse a deck from a FileSystemFileHandle.
   * @static
   * @param {FileSystemFileHandle} fileHandle
   * @returns {Promise<import('../types.js').Deck>}
   */
  static async loadFromFileHandle(fileHandle) {
    try {
      const file = await fileHandle.getFile();
      const text = await file.text();

      if (!file.name.endsWith(".md")) {
        throw new Error(`Unsupported file type: ${file.name}. Please use .md files.`);
      }

      await AssetLoader.ensureMarkdownItLoaded();
      return new MarkdownParser().parseDeckMarkdown(text);
    } catch (e) {
      throw new Error(`Failed to load file: ${e.message || String(e)}`, { cause: e });
    }
  }

  /**
   * Fetch text from a URL.
   * @static
   * @param {string} url
   * @param {RequestInit} [options]
   * @returns {Promise<string>}
   */
  static async fetchText(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return await res.text();
  }

  /**
   * Load deck data from the CLI dev server API, embedded JSON, or show welcome deck.
   * @static
   * @returns {Promise<import('../types.js').Deck>}
   */
  static async loadDeckData() {
    // 1. Try CLI dev server API (skip in exported HTML files)
    if (!window.__WEBDECK_EXPORTED__) {
      try {
        const res = await fetch("/api/deck");
        if (res.ok) {
          const data = await res.json();
          if (data?.markdown) {
            await AssetLoader.ensureMarkdownItLoaded();
            // Store the API URL so reload can re-fetch fresh content from disk
            localStorage.setItem("webdeck_source_url", "/api/deck");
            localStorage.removeItem("webdeck_opened_from_picker");
            // Persist the markdown so the editor reads fresh content on init
            localStorage.setItem("webdeck_local_file", data.markdown);
            return new MarkdownParser().parseDeckMarkdown(data.markdown);
          }
        }
      } catch {
        // No CLI server running — fall through
      }
    }

    // 2. Try Embedded JSON (build output)
    const embedded = document.getElementById("deckData");
    if (embedded?.textContent?.trim()) {
      try {
        return JSON.parse(embedded.textContent);
      } catch (e) {
        throw new Error(`Invalid embedded deck JSON: ${e.message}`, { cause: e });
      }
    }

    // 3. Default — auto-load example deck
    // Keep existing localStorage data intact (don't wipe).
    // User may have a cached deck from a previous session.

    await AssetLoader.ensureMarkdownItLoaded();
    try {
      const res = await fetch("docs/example/slides.md");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const markdown = await res.text();

      // Tell the CLI server where the example deck lives so it can serve images
      await fetch("/api/deck/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dir: "docs/example" }),
      }).catch(() => {});

      localStorage.setItem("webdeck_local_file", markdown);
      localStorage.setItem("webdeck_local_file_type", "md");
      localStorage.setItem("webdeck_local_file_name", "example");
      localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
      localStorage.setItem("webdeck_source_url", "docs/example/slides.md");
      localStorage.removeItem("webdeck_opened_from_picker");

      return new MarkdownParser().parseDeckMarkdown(markdown);
    } catch (e) {
      Logger.error("Failed to load example deck:", e);
      // Final fallback — minimal deck
      return new MarkdownParser().parseDeckMarkdown(
        "# Welcome to SlideMD\n\nMarkdown-based presentations made simple.\n\nUse **Menu \u2192 Open File** to start presenting.",
      );
    }
  }

  /**
   * Reload a deck from a previously saved file handle.
   * @static
   * @param {string} deckId - Key to look up in the file handle registry.
   * @returns {Promise<import('../types.js').Deck|null>}
   */
  static async reloadFromFileHandle(deckId) {
    let handle = DeckLoader.fileHandleRegistry.get(deckId);
    const fileName = localStorage.getItem("webdeck_local_file_name");

    if (!handle && fileName) {
      handle = DeckLoader.fileHandleRegistry.get(fileName);
    }

    if (!handle) return null;

    try {
      return await this.loadFromFileHandle(handle);
    } catch (e) {
      Logger.error("Failed to reload from file handle:", e);
      DeckLoader.fileHandleRegistry.delete(deckId);
      if (fileName) DeckLoader.fileHandleRegistry.delete(fileName);
      throw e;
    }
  }

  /**
   * Loads deck data from broadcast channel using request-response pattern (for viewer windows).
   * Sends a request to the editor window and waits for the deck data response.
   * @param {number} timeoutMs - Timeout in milliseconds (default 5000)
   * @returns {Promise<Object>} The deck data
   */
  static loadDeckDataFromBroadcast(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const channel = new BroadcastChannel("webdeck-deck");
      const timeout = setTimeout(() => {
        channel.close();
        reject(
          new Error(
            "Timeout waiting for deck data from editor. Make sure the editor window is open.",
          ),
        );
      }, timeoutMs);

      // Set up listener for response
      channel.onmessage = (ev) => {
        if (ev.data?.type === "deck") {
          clearTimeout(timeout);
          channel.close();
          resolve(ev.data.deck);
        }
      };

      // Send request for deck data
      channel.postMessage({ type: "request-deck" });
    });
  }

  /**
   * Load deck data from localStorage without loading markdown-it (returns raw parsed deck or null).
   * @static
   * @returns {Promise<import('../types.js').Deck|null>}
   */
  static async loadFromLocalStorage() {
    try {
      const localFile = localStorage.getItem("webdeck_local_file");
      if (!localFile) return null;

      await AssetLoader.ensureMarkdownItLoaded();
      return new MarkdownParser().parseDeckMarkdown(localFile);
    } catch (err) {
      Logger.error("loadFromLocalStorage: parsing error", err);
      return null;
    }
  }

  /**
   * Process raw deck data by normalizing it (always includes hidden slides for edit mode).
   * @static
   * @param {import('../types.js').Deck} raw
   * @returns {Promise<import('../types.js').Deck>}
   */
  static async processRawData(raw) {
    // Always include hidden slides so edit mode can show them
    // CSS will handle hiding them in presentation mode
    return this.normalizeDeck(raw, { includeHidden: true });
  }

  /**
   * Parse raw markdown text into a normalized deck structure.
   * @static
   * @param {string} text
   * @returns {Promise<import('../types.js').Deck>}
   */
  static async parseMarkdown(text) {
    await AssetLoader.ensureMarkdownItLoaded();
    const raw = new MarkdownParser().parseDeckMarkdown(text);
    // Always include hidden slides so edit mode can show them
    return this.normalizeDeck(raw, { includeHidden: true });
  }

  /**
   * Normalize a raw deck object: validate structure, fill defaults, filter hidden slides.
   * @static
   * @param {import('../types.js').Deck} raw
   * @param {{ includeHidden?: boolean }} [options]
   * @returns {import('../types.js').Deck}
   */
  static normalizeDeck(raw, { includeHidden = true } = {}) {
    if (!raw || typeof raw !== "object") throw new Error("Invalid deck: not an object");
    if (!Array.isArray(raw.slides)) throw new Error("Invalid deck: slides must be an array");

    const slidesAll = raw.slides.map((s, idx) => {
      if (!s || typeof s !== "object") throw new Error(`Invalid slide at index ${idx}`);
      return {
        id: safeString(s.id) || `slide-${idx + 1}`,
        title: safeString(s.title) || `Slide ${idx + 1}`,
        notes: safeString(s.notes),
        layout: safeString(s.layout),
        mediaFullBleed:
          /^(left|right)$/i.test(String(s.mediaSpan || "")) ||
          /^(true|1|yes|y|on)$/i.test(String(s.mediaFullBleed || "")),
        // For backwards compatibility, accept but ignore align field
        ...(s.align !== undefined && { align: safeString(s.align) }),
        background: safeString(s.background),
        theme: safeString(s.theme),
        hidden: Boolean(s.hidden),
        areas: s.areas || {},
        areaStyle: safeString(s.areaStyle),
        areaStyles: s.areaStyles || {},
        codeFontSize: Number(s.codeFontSize) || 0,
      };
    });

    let slides = includeHidden ? slidesAll : slidesAll.filter((s) => !s.hidden);

    if (slides.length === 0) {
      slides = [
        {
          id: "no-visible-slides",
          title: "No visible slides",
          areas: { main: "<h2>No visible slides</h2><p>Check URL params.</p>" },
        },
      ];
    }

    return {
      meta: {
        id: getDeckId(raw),
        title: safeString(raw.meta?.title) || slides[0]?.title || "Slide Deck",
        course: safeString(raw.meta?.course),
        aspect: safeString(raw.meta?.aspect) || "16:9",
        stage: raw.meta?.stage || { ...DESIGN_SIZE },
      },
      slides,
      visualSystem: raw.visualSystem ?? null,
    };
  }
}
