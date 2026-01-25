/**
 * DeckLoader
 * Loads deck data from embedded HTML, local files, or remote sources.
 */
import { AssetLoader } from "../core/asset-loader.js";
import { MarkdownParser } from "./markdown-parser.js";
import { safeString, getDeckId, DESIGN_SIZE, yieldToMain } from "../core/utils.js";
import { Notification } from "../renderer/notification.js";

export class DeckLoader {

    static getDisplayTitle(deck) {
        const localFileName = localStorage.getItem("webdeck_local_file_name");
        if (localFileName) return localFileName;

        const urlParam = new URL(window.location.href).searchParams.get("url");
        if (urlParam) {
            try {
                const pathParts = new URL(urlParam).pathname.split('/');
                const fileName = pathParts[pathParts.length - 1];
                if (fileName && fileName !== '/') return fileName;
            } catch { /* invalid url */ }
        }

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

    static async loadFromUrl(url, options = {}) {
        const { bypassCache = false } = options;
        const fetchUrl = bypassCache ? this.addCacheBuster(url) : url;

        if (url.toLowerCase().endsWith(".md")) {
            await AssetLoader.ensureMarkdownItLoaded();
            const mdText = await this.fetchText(fetchUrl, { cache: "no-cache" });

            // Yield if file is large to allow UI to update
            if (mdText.length > 50000) await yieldToMain();

            return new MarkdownParser().parseDeckMarkdown(mdText);
        } else {
            throw new Error("Unsupported file type. Please use .md files.");
        }
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

    static addCacheBuster(url) {
        const hasQuery = url.indexOf('?') !== -1;
        const separator = hasQuery ? '&' : '?';
        return `${url}${separator}_t=${Date.now()}`;
    }

    static async fetchText(url, { cache = "default", timeoutMs = 8000 } = {}) {
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

        try {
            const res = await fetch(url, { cache, signal: controller?.signal });
            if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
            return await res.text();
        } catch (e) {
            throw new Error(`Failed to load ${url}: ${e.message || String(e)}`);
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    static async loadDeckData() {
        // 1. Try LocalStorage (Shared State)
        try {
            const localFile = localStorage.getItem("webdeck_local_file");
            const fileType = localStorage.getItem("webdeck_local_file_type");
            const timestamp = localStorage.getItem("webdeck_local_file_timestamp");

            if (localFile && fileType && timestamp) {
                const age = Date.now() - parseInt(timestamp, 10);
                const url = new URL(window.location.href);
                const hasUrlParam = url.searchParams.get("url");
                const reloadFlag = localStorage.getItem("webdeck_reload_flag");

                // Logic: Load if fresh (30s), if reload requested, or if no URL param overrides it
                if (age < 30000 || reloadFlag === "1" || !hasUrlParam) {
                    if (reloadFlag === "1") localStorage.removeItem("webdeck_reload_flag");

                    const loadedKey = "webdeck_local_file_loaded";
                    const loadedCount = parseInt(localStorage.getItem(loadedKey) || "0", 10);
                    localStorage.setItem(loadedKey, (loadedCount + 1).toString());

                    // Cleanup coordination
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
                    }
                } else if (age > 3600000) { // Cleanup old data (>1hr)
                    localStorage.removeItem("webdeck_local_file");
                    localStorage.removeItem("webdeck_local_file_type");
                    localStorage.removeItem("webdeck_local_file_timestamp");
                }
            }
        } catch (err) {
            console.error("loadDeckData: storage error", err);
            localStorage.removeItem("webdeck_local_file");
        }

        // 2. Try URL Param
        try {
            const urlParam = new URL(window.location.href).searchParams.get("url");
            if (urlParam) {
                return await this.loadFromUrl(urlParam, { bypassCache: true });
            }
        } catch { /* ignore */ }

        // 3. Try Embedded JSON
        const embedded = document.getElementById("deckData");
        if (embedded?.textContent?.trim()) {
            try {
                return JSON.parse(embedded.textContent);
            } catch (e) {
                throw new Error(`Invalid embedded deck JSON: ${e.message}`);
            }
        }

        // 4. Default Welcome Deck
        return this.getWelcomeDeck();
    }

    static getWelcomeDeck() {
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
            <p style="font-size: 1.5rem; color: var(--color-fg-muted); line-height: 1.6;">Load a local <strong>.md</strong> file.</p>
        </div>
        <div style="flex: 0 1 280px; padding: 1.5rem; background: var(--color-bg-alt, #f8fafc); border-radius: 12px; border: 1px solid var(--color-border, #e2e8f0);">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🌐</div>
            <h3 style="font-size: 1.7rem; margin-bottom: 0.75rem; font-weight: 600;">Open Remote</h3>
            <p style="font-size: 1.5rem; color: var(--color-fg-muted); line-height: 1.6;">Load a presentation from a URL.</p>
        </div>
    </div>
</div>`,
                    },
                },
            ],
        };
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
                    localStorage.removeItem("webdeck_local_file_loaded");

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
                localStorage.removeItem("webdeck_local_file_loaded");

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

    static setupRemoteFileHandler(openRemoteBtn) {
        openRemoteBtn.addEventListener("click", async () => {
            const url = prompt("Enter remote file URL (.md):");
            if (!url) return;

            try {
                await this.loadFromUrl(url); // Validate

                const reloadChannel = new BroadcastChannel("webdeck-reload");
                reloadChannel.postMessage({ type: "reload", url });
                reloadChannel.close();

                const newUrl = new URL(window.location.href);
                newUrl.searchParams.set("url", url);
                newUrl.hash = "";
                window.location.href = newUrl.toString();
            } catch (err) {
                Notification.error("Failed to load remote file: " + err.message);
            }
        });
    }

    static async loadFromLocalStorage() {
        const localFile = localStorage.getItem("webdeck_local_file");
        if (!localFile) return null;

        await AssetLoader.ensureMarkdownItLoaded();
        return new MarkdownParser().parseDeckMarkdown(localFile);
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
                align: safeString(s.align),
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