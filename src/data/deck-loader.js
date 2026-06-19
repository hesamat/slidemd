/**
 * DeckLoader
 * Loads deck data from embedded HTML or local files.
 */
import { AssetLoader } from "../core/asset-loader.js";
import { MarkdownParser } from "./markdown-parser.js";
import { safeString, getDeckId, DESIGN_SIZE } from "../core/utils.js";
import { Notification } from "../renderer/notification.js";

export class DeckLoader {

    static getDisplayTitle(deck) {
        const localFileName = localStorage.getItem("webdeck_local_file_name");
        if (localFileName) return localFileName;

        return safeString(deck?.meta?.title) || "Slide Deck";
    }

    static get fileHandleRegistry() {
        if (!window.__WEBDECK_FILE_HANDLE_REGISTRY__) {
            window.__WEBDECK_FILE_HANDLE_REGISTRY__ = new Map();
        }
        return window.__WEBDECK_FILE_HANDLE_REGISTRY__;
    }

    static get supportsFileSystemAPI() {
        return 'showOpenFilePicker' in window;
    }

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
            throw new Error(`Failed to load file: ${e.message || String(e)}`);
        }
    }

    static async fetchText(url, options = {}) {
        const res = await fetch(url, options);
        if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
        return await res.text();
    }

    static async loadDeckData() {
        // 1. Try LocalStorage (Shared State)
        try {
            const localFile = localStorage.getItem("webdeck_local_file");
            const fileType = localStorage.getItem("webdeck_local_file_type");
            const timestamp = localStorage.getItem("webdeck_local_file_timestamp");

            if (localFile && fileType && timestamp) {
                const age = Date.now() - parseInt(timestamp, 10);
                const reloadFlag = localStorage.getItem("webdeck_reload_flag");

                // Logic: Load if fresh (30s) or if reload requested
                if (age < 30000 || reloadFlag === "1") {
                    if (reloadFlag === "1") localStorage.removeItem("webdeck_reload_flag");

                    if (fileType === "md") {
                        await AssetLoader.ensureMarkdownItLoaded();
                        return new MarkdownParser().parseDeckMarkdown(localFile);
                    }
                }
            }
        } catch (err) {
            console.error("loadDeckData: error loading from localStorage", err);
            // Don't delete localStorage data on any error - let it fall through
            // to try other sources (embedded, welcome deck)
            // Only clear localStorage explicitly when user loads a new file
        }

        // 2. Try Embedded JSON
        const embedded = document.getElementById("deckData");
        if (embedded?.textContent?.trim()) {
            try {
                return JSON.parse(embedded.textContent);
            } catch (e) {
                throw new Error(`Invalid embedded deck JSON: ${e.message}`);
            }
        }

        // 3. Default — return an empty deck (no file loaded)
        //    Clear any stale localStorage from a previous session so the
        //    title bar doesn't show a leftover file name.
        localStorage.removeItem("webdeck_local_file");
        localStorage.removeItem("webdeck_local_file_type");
        localStorage.removeItem("webdeck_local_file_name");
        localStorage.removeItem("webdeck_local_file_timestamp");
        localStorage.removeItem("webdeck_source_url");

        await AssetLoader.ensureMarkdownItLoaded();
        return new MarkdownParser().parseDeckMarkdown(
`# Welcome to SlideMD

Markdown-based presentations made simple.

### What you can do

- **Open a .md file** to start presenting
- **Press \`E\`** to toggle edit mode with live preview
- **Press \`P\`** to open a viewer for your audience
- **Press \`D\`** to switch between dark and light themes

<button id="openExampleBtn" class="welcome-btn">Open Example Deck</button>

*Loads \`docs/example.md\` — covers layouts, themes, code, math, and more.*`
        );
    }

    /**
     * Loads the bundled example.md from docs/ via HTTP fetch.
     * No file picker needed — the file is served by the dev server / host.
     */
    static async openExampleFile() {
        try {
            const res = await fetch("docs/example.md");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const rawText = await res.text();

            localStorage.setItem("webdeck_local_file", rawText);
            localStorage.setItem("webdeck_local_file_type", "md");
            localStorage.setItem("webdeck_local_file_name", "example.md");
            localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
            localStorage.removeItem("webdeck_source_url");

            window.dispatchEvent(new CustomEvent('webdeck-load-local', {
                detail: { text: rawText, fileType: "md", fileName: "example.md" }
            }));
        } catch (e) {
            console.error("Failed to load example deck:", e);
            Notification.error("Could not load example deck");
        }
    }

    static setupLocalFileHandler(openFileBtn, fileInput) {
        openFileBtn.addEventListener("click", async () => {
            if (this.supportsFileSystemAPI) {
                try {
                    const [handle] = await window.showOpenFilePicker({
                        types: [{ description: 'Markdown files', accept: { 'text/markdown': ['.md'] } }],
                        multiple: false
                    });
                    if (!handle) return;

                    const file = await handle.getFile();
                    const rawText = await file.text();

                    DeckLoader.fileHandleRegistry.set(file.name, handle);

                    localStorage.setItem("webdeck_local_file", rawText);
                    localStorage.setItem("webdeck_local_file_type", "md");
                    localStorage.setItem("webdeck_local_file_name", file.name);
                    localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
                    localStorage.removeItem("webdeck_source_url");

                    const loadEvent = new CustomEvent('webdeck-load-local', {
                        detail: { text: rawText, fileType: "md", fileName: file.name }
                    });
                    window.dispatchEvent(loadEvent);
                } catch (e) {
                    if (e.name !== 'AbortError') {
                        console.error("FileSystem API failed, falling back:", e);
                        fileInput.click();
                    }
                }
            } else {
                fileInput.click();
            }
        });

        fileInput.addEventListener("change", async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            try {
                if (!file.name.endsWith(".md")) {
                    Notification.warning("Unsupported file type. Please use .md files.");
                    return;
                }
                const text = await file.text();

                localStorage.setItem("webdeck_local_file", text);
                localStorage.setItem("webdeck_local_file_type", "md");
                localStorage.setItem("webdeck_local_file_name", file.name);
                localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
                localStorage.removeItem("webdeck_source_url");

                const loadEvent = new CustomEvent('webdeck-load-local', {
                    detail: { text, fileType: "md", fileName: file.name }
                });
                window.dispatchEvent(loadEvent);
            } catch (err) {
                console.error("Failed to load file:", err);
                Notification.error("Failed to load file");
            }
            fileInput.value = "";
        });
    }

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
            console.error("Failed to reload from file handle:", e);
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
                reject(new Error("Timeout waiting for deck data from editor. Make sure the editor window is open."));
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

    static async loadFromLocalStorage() {
        try {
            const localFile = localStorage.getItem("webdeck_local_file");
            if (!localFile) return null;

            await AssetLoader.ensureMarkdownItLoaded();
            return new MarkdownParser().parseDeckMarkdown(localFile);
        } catch (err) {
            console.error("loadFromLocalStorage: parsing error", err);
            return null;
        }
    }

    static async processRawData(raw) {
        // Always include hidden slides so edit mode can show them
        // CSS will handle hiding them in presentation mode
        return this.normalizeDeck(raw, { includeHidden: true });
    }

    static async parseMarkdown(text) {
        await AssetLoader.ensureMarkdownItLoaded();
        const raw = new MarkdownParser().parseDeckMarkdown(text);
        // Always include hidden slides so edit mode can show them
        return this.normalizeDeck(raw, { includeHidden: true });
    }

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
                // For backwards compatibility, accept but ignore align field
                ...((s.align !== undefined) && { align: safeString(s.align) }),
                background: safeString(s.background),
                theme: safeString(s.theme),
                hidden: Boolean(s.hidden),
                areas: s.areas || {},
            };
        });

        let slides = includeHidden ? slidesAll : slidesAll.filter(s => !s.hidden);

        if (slides.length === 0) {
            slides = [{
                id: "no-visible-slides",
                title: "No visible slides",
                areas: { main: "<h2>No visible slides</h2><p>Check URL params.</p>" }
            }];
        }

        return {
            meta: {
                id: getDeckId(raw),
                title: safeString(raw.meta?.title) || (slides[0]?.title || "Slide Deck"),
                course: safeString(raw.meta?.course),
                aspect: safeString(raw.meta?.aspect) || "16:9",
                stage: raw.meta?.stage || { ...DESIGN_SIZE },
            },
            slides,
        };
    }
}