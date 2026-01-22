/**
 * DeckLoader
 * Loads deck data from embedded HTML, local files, or remote sources. Handles deck loading for the slide application.
 */
// Deck data loading
import { AssetLoader } from "./asset-loader.js";
import { MarkdownParser } from "./markdown-parser.js";
import { safeString, getDeckId, DESIGN_SIZE } from "./utils.js";
import { Notification } from "./notification.js";

export class DeckLoader {
    /**
     * Determines the display title for the deck based on file source or metadata.
     * Priority: Local Filename > Remote URL Filename > Deck Metadata > Default
     * @param {object} deck - The deck object
     * @returns {string} The display title
     */
    static getDisplayTitle(deck) {
        // 1. Check for local file name (set by DeckLoader or handleLocalFileLoad)
        const localFileName = localStorage.getItem("webdeck_local_file_name");
        if (localFileName) {
            return localFileName;
        }

        // 2. Check for URL parameter file name
        const urlParam = new URL(window.location.href).searchParams.get("url");
        if (urlParam) {
            try {
                const pathParts = new URL(urlParam).pathname.split('/');
                const fileName = pathParts[pathParts.length - 1];
                if (fileName && fileName !== '/') {
                    return fileName;
                }
            } catch { /* invalid url */ }
        }

        // 3. Deck metadata or default
        return (deck?.meta?.title || "Slide Deck").trim() || "Slide Deck";
    }

    // File handle registry: stores FileSystemFileHandle for local files
    // Map<deckId, FileSystemFileHandle>
    static get fileHandleRegistry() {
        if (!window.__WEBDECK_FILE_HANDLE_REGISTRY__) {
            window.__WEBDECK_FILE_HANDLE_REGISTRY__ = new Map();
        }
        return window.__WEBDECK_FILE_HANDLE_REGISTRY__;
    }

    // Check if File System Access API is supported
    static get supportsFileSystemAPI() {
        return 'showOpenFilePicker' in window;
    }

    /**
     * Load deck data from a remote URL
     * @param {string} url - The URL to load deck from
     * @returns {Promise<object>} - The deck data
     */
    static async loadFromUrl(url, options = {}) {
        const { bypassCache = false } = options;
        const urlLower = url.toLowerCase();

        // Add cache-busting parameter if requested
        const fetchUrl = bypassCache ? this.addCacheBuster(url) : url;

        if (urlLower.endsWith(".md")) {
            await AssetLoader.ensureMarkdownItLoaded();
            const mdText = await this.fetchText(fetchUrl, { cache: "no-cache" });
            return new MarkdownParser().parseDeckMarkdown(mdText);
        } else {
            throw new Error("Unsupported file type. Please use .md files.");
        }
    }

    /**
     * Load deck data from a file handle (File System Access API)
     * @param {FileSystemFileHandle} fileHandle - The file handle to read from
     * @returns {Promise<object>} - The deck data
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
            const msg = e instanceof Error ? e.message : String(e);
            throw new Error(`Failed to load file: ${msg}`);
        }
    }

    /**
     * Adds a cache-busting timestamp to a URL
     * @param {string} url - The URL to modify
     * @returns {string} The URL with cache-busting parameter
     */
    static addCacheBuster(url) {
        const hasQuery = url.indexOf('?') !== -1;
        const separator = hasQuery ? '&' : '?';
        return `${url}${separator}_t=${Date.now()}`;
    }

    static async fetchText(url, { cache = "default", timeoutMs = 8000 } = {}) {
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

        try {
            const res = await fetch(url, {
                cache,
                signal: controller?.signal,
            });
            if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
            return await res.text();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            throw new Error(`Failed to load ${url}: ${msg}`);
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    static async loadDeckData() {
        // Check for local file in localStorage first (shared across windows)
        try {
            const localFile = localStorage.getItem("webdeck_local_file");
            const fileType = localStorage.getItem("webdeck_local_file_type");
            const timestamp = localStorage.getItem("webdeck_local_file_timestamp");

            if (localFile && fileType && timestamp) {
                const age = Date.now() - parseInt(timestamp, 10);
                // Load if data is recent (within 30 seconds) for window sharing
                // OR if we have a reload flag (for manual reload button)
                const reloadFlag = localStorage.getItem("webdeck_reload_flag");
                if (age < 30000 || reloadFlag === "1") {
                    // Clear reload flag after using it
                    if (reloadFlag === "1") {
                        localStorage.removeItem("webdeck_reload_flag");
                    }

                    // Mark this window as having loaded the data
                    const loadedKey = "webdeck_local_file_loaded";
                    const loadedCount = parseInt(localStorage.getItem(loadedKey) || "0", 10);
                    localStorage.setItem(loadedKey, (loadedCount + 1).toString());

                    // If both windows have loaded (count >= 2), clear the data after a delay
                    if (loadedCount >= 2 && !reloadFlag) {
                        setTimeout(() => {
                            localStorage.removeItem("webdeck_local_file");
                            localStorage.removeItem("webdeck_local_file_type");
                            localStorage.removeItem("webdeck_local_file_timestamp");
                            localStorage.removeItem(loadedKey);
                        }, 1000);
                    }

                    if (fileType === "md") {
                        await AssetLoader.ensureMarkdownItLoaded();
                        return new MarkdownParser().parseDeckMarkdown(localFile);
                    } else {
                        throw new Error(`Unknown file type: ${fileType}`);
                    }
                } else {
                    // Data is too old, clear it (but keep for reload functionality)
                    // Don't clear if it might be needed for reload button
                    if (age > 3600000) { // Clear if older than 1 hour
                        localStorage.removeItem("webdeck_local_file");
                        localStorage.removeItem("webdeck_local_file_type");
                        localStorage.removeItem("webdeck_local_file_timestamp");
                    }
                }
            }
        } catch (err) {
            console.error("loadDeckData: error loading from localStorage", err);
            // Clear invalid data
            localStorage.removeItem("webdeck_local_file");
            localStorage.removeItem("webdeck_local_file_type");
            localStorage.removeItem("webdeck_local_file_timestamp");
            throw err;
        }

        // Check for URL parameter
        try {
            const url = new URL(window.location.href);
            const urlParam = url.searchParams.get("url");

            // Load from URL parameter if provided
            if (urlParam) {
                // Add cache-busting to ensure fresh content on page refresh
                return await this.loadFromUrl(urlParam, { bypassCache: true });
            }
        } catch {
            // Ignore URL parsing errors
        }

        // Back-compat: single embedded deck JSON (for single-file builds)
        const embedded = document.getElementById("deckData");
        const embeddedText = embedded?.textContent?.trim();
        if (embeddedText) {
            try {
                return JSON.parse(embeddedText);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                throw new Error(`Invalid embedded deck JSON (#deckData): ${msg}`);
            }
        }

        // Always show welcome page initially - user must explicitly open a deck
        return {
            meta: {
                title: "Slide Deck",
                aspect: "16:9",
                stage: { ...DESIGN_SIZE },
            },
            slides: [
                {
                    id: "welcome",
                    title: "Welcome",
                    notes: "",
                    layout: "",
                    align: "center",
                    background: "",
                    theme: "",
                    hidden: false,
                    areas: {
                        main: `<div style="text-align: center; padding: 2rem;">
    <div style="margin-bottom: 3rem;">
        <h1 style="font-size: 3.2rem; margin-bottom: 0.5rem; font-weight: 700;">Welcome to Slide Deck</h1>
        <p style="font-size: 1.7rem; color: var(--color-fg-muted); margin-bottom: 0;">Create and deliver beautiful presentations</p>
    </div>

    <div style="display: flex; gap: 3rem; justify-content: center; margin: 3rem 0; flex-wrap: wrap;">
        <div style="flex: 0 1 280px; padding: 1.5rem; background: var(--color-bg-alt, #f8fafc); border-radius: 12px; border: 1px solid var(--color-border, #e2e8f0);">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📁</div>
            <h3 style="font-size: 1.7rem; margin-bottom: 0.75rem; font-weight: 600;">Open File</h3>
            <p style="font-size: 1.5rem; color: var(--color-fg-muted); line-height: 1.6;">Load a local <strong>.md</strong> file from your computer to start presenting or editing.</p>
        </div>
        <div style="flex: 0 1 280px; padding: 1.5rem; background: var(--color-bg-alt, #f8fafc); border-radius: 12px; border: 1px solid var(--color-border, #e2e8f0);">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🌐</div>
            <h3 style="font-size: 1.7rem; margin-bottom: 0.75rem; font-weight: 600;">Open Remote</h3>
            <p style="font-size: 1.5rem; color: var(--color-fg-muted); line-height: 1.6;">Load a presentation from any URL by providing a direct link to a <strong>.md</strong> file.</p>
        </div>
    </div>

    <div style="margin-top: 3rem; padding: 1.25rem 2rem; background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%); border-radius: 10px; border-left: 4px solid var(--color-accent, #3b82f6);">
        <p style="font-size: 1.4rem; margin: 0; color: var(--color-fg, #1e293b);">
            <strong style="color: var(--color-accent, #3b82f6);">Tip:</strong> For the best editing experience, use a Chromium-based browser (Chrome, Edge, Arc, Etc). Other browsers may have limited file access capabilities.
        </p>
    </div>
</div>`,
                    },
                },
            ],
        };
    }

    /**
     * Sets up the local file loading handler.
     * @param {HTMLElement} openFileBtn - The button that triggers file selection
     * @param {HTMLInputElement} fileInput - The file input element (fallback)
     */
    static setupLocalFileHandler(openFileBtn, fileInput) {
        openFileBtn.addEventListener("click", async () => {
            // Try File System Access API first
            if (this.supportsFileSystemAPI) {
                try {
                    const [handle] = await window.showOpenFilePicker({
                        types: [
                            {
                                description: 'Markdown files',
                                accept: { 'text/markdown': ['.md'] }
                            }
                        ],
                        multiple: false
                    });

                    if (!handle) return;

                    // Read file content
                    // Read file content as text
                    const file = await handle.getFile();
                    const rawText = await file.text();
                    const fileType = "md";

                    // Store file handle in registry for future reloads
                    // (optional, for reloadFromFileHandle)

                    const fileName = file.name;
                    DeckLoader.fileHandleRegistry.set(fileName, handle);

                    // Store raw file data in localStorage with timestamp (shared across windows)

                    localStorage.setItem("webdeck_local_file", rawText);
                    localStorage.setItem("webdeck_local_file_type", fileType);
                    localStorage.setItem("webdeck_local_file_name", fileName);
                    localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
                    localStorage.removeItem("webdeck_local_file_loaded"); // Reset loaded count

                    // Dispatch custom event to notify the current window to load the new deck
                    const loadEvent = new CustomEvent('webdeck-load-local', {
                        detail: { text: rawText, fileType, fileName }
                    });
                    window.dispatchEvent(loadEvent);
                } catch (e) {
                    if (e.name === 'AbortError') {
                        // User cancelled, do nothing
                        return;
                    }
                    console.error("Failed to open file with File System Access API:", e);
                    // Fall back to file input
                    fileInput.click();
                }
            } else {
                // Fall back to traditional file input
                fileInput.click();
            }
        });

        fileInput.addEventListener("change", async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                let fileType;
                if (file.name.endsWith(".md")) {
                    fileType = "md";
                } else {
                    Notification.warning("Unsupported file type. Please use .md files.");
                    return;
                }

                // Store file data in localStorage with timestamp (shared across windows)
                // Storage event will trigger reload in other windows
                localStorage.setItem("webdeck_local_file", text);
                localStorage.setItem("webdeck_local_file_type", fileType);
                localStorage.setItem("webdeck_local_file_name", file.name);
                localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
                localStorage.removeItem("webdeck_local_file_loaded"); // Reset loaded count

                // Dispatch custom event to notify the current window to load the new deck
                const loadEvent = new CustomEvent('webdeck-load-local', {
                    detail: { text, fileType, fileName: file.name }
                });
                window.dispatchEvent(loadEvent);
            } catch (err) {
                console.error("Failed to load file:", err);
                Notification.error("Failed to load file: " + (err instanceof Error ? err.message : String(err)));
            }

            // Reset input so same file can be selected again
            fileInput.value = "";
        });
    }

    /**
     * Reloads deck from a file handle if available
     * @param {string} deckId - The deck ID to find handle for
     * @returns {Promise<object>} - The reloaded deck data or null if no handle
     */
    static async reloadFromFileHandle(deckId) {
        // Try to get handle by deckId, then by file name in localStorage
        let handle = DeckLoader.fileHandleRegistry.get(deckId);
        if (!handle) {
            const fileName = localStorage.getItem("webdeck_local_file_name");
            if (fileName) {
                handle = DeckLoader.fileHandleRegistry.get(fileName);
            }
        }
        if (!handle) {
            return null;
        }
        try {
            return await this.loadFromFileHandle(handle);
        } catch (e) {
            console.error("Failed to reload from file handle:", e);
            // Remove invalid handle from registry
            DeckLoader.fileHandleRegistry.delete(deckId);
            if (fileName) DeckLoader.fileHandleRegistry.delete(fileName);
            throw e;
        }
    }

    /**
     * Sets up the remote file loading handler.
     * @param {HTMLElement} openRemoteBtn - The button that triggers URL prompt
     */
    static setupRemoteFileHandler(openRemoteBtn) {
        openRemoteBtn.addEventListener("click", async () => {
            const url = prompt("Enter remote file URL (.md):");
            if (!url) return;

            try {
                // Validate URL by trying to load it
                await this.loadFromUrl(url);

                // Send reload message to all other windows with URL
                const reloadChannel = new BroadcastChannel("webdeck-reload");
                reloadChannel.postMessage({ type: "reload", url });
                reloadChannel.close();

                // Reload with URL parameter, preserving other parameters
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.set("url", url);
                newUrl.hash = ""; // Clear slide hash to start from slide 1
                window.location.href = newUrl.toString();
            } catch (err) {
                Notification.error("Failed to load remote file: " + (err instanceof Error ? err.message : String(err)));
            }
        });
    }

    /**
     * Loads deck data from localStorage (previously loaded local file)
     * @returns {Promise<object|null>} - The deck data or null if not available
     */
    static async loadFromLocalStorage() {
        const localFile = localStorage.getItem("webdeck_local_file");
        if (!localFile) return null;

        const fileType = localStorage.getItem("webdeck_local_file_type") || "md";

        if (fileType === "md") {
            await AssetLoader.ensureMarkdownItLoaded();
            return new MarkdownParser().parseDeckMarkdown(localFile);
        } else {
            throw new Error(`Unknown file type: ${fileType}`);
        }
    }

    /**
     * Processes raw deck data, normalizes it, and handles hidden slide filtering
     * @param {object} raw - The raw deck data
     * @returns {Promise<object>} - The normalized deck object
     */
    static async processRawData(raw) {
        const url = new URL(window.location.href);
        const showHiddenRaw = (url.searchParams.get("showHidden") || "").trim().toLowerCase();
        const includeHidden = ["1", "true", "yes", "y", "on"].includes(showHiddenRaw);
        return this.normalizeDeck(raw, { includeHidden });
    }

    /**
     * Parses markdown text into a normalized deck object
     * @param {string} text - The markdown text to parse
     * @returns {Promise<object>} - The normalized deck object
     */
    static async parseMarkdown(text) {
        await AssetLoader.ensureMarkdownItLoaded();
        const raw = new MarkdownParser().parseDeckMarkdown(text);
        return this.normalizeDeck(raw, { includeHidden: false });
    }

    static normalizeDeck(raw, { includeHidden = false } = {}) {
        if (!raw || typeof raw !== "object") throw new Error("Invalid deck: not an object");
        if (!Array.isArray(raw.slides)) throw new Error("Invalid deck: slides must be an array");

        const meta = raw.meta && typeof raw.meta === "object" ? raw.meta : {};
        const slidesAll = raw.slides.map((s, idx) => {
            if (!s || typeof s !== "object") throw new Error(`Invalid slide at index ${idx}`);
            const areas = s.areas && typeof s.areas === "object" ? s.areas : {};
            return {
                id: safeString(s.id) || `slide-${idx + 1}`,
                title: safeString(s.title) || `Slide ${idx + 1}`,
                notes: safeString(s.notes),
                layout: safeString(s.layout),
                align: safeString(s.align),
                background: safeString(s.background),
                theme: safeString(s.theme),
                hidden: Boolean(s.hidden),
                areas,
            };
        });

        let slides = slidesAll;
        if (!includeHidden) {
            slides = slidesAll.filter((s) => !s.hidden);
            if (slides.length === 0) {
                slides = [
                    {
                        id: "no-visible-slides",
                        title: "No visible slides",
                        notes: "",
                        layout: "",
                        align: "center",
                        background: "",
                        theme: "",
                        hidden: false,
                        areas: {
                            main: "<h2>No visible slides</h2><p>All slides in this deck are marked <code>hidden: true</code>. Add <code>?showHidden=1</code> to the URL to view them.</p>",
                        },
                    },
                ];
            }
        }

        return {
            meta: {
                id: getDeckId(raw),
                title: safeString(meta.title) || (slides[0]?.title || "Slide Deck"),
                course: safeString(meta.course),
                aspect: safeString(meta.aspect) || "16:9",
                stage: meta.stage && typeof meta.stage === "object" ? meta.stage : { ...DESIGN_SIZE },
            },
            slides,
        };
    }
}
