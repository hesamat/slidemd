/**
 * DeckLoader
 * Loads deck data from embedded HTML, local files, or remote sources. Handles deck loading for the slide application.
 */
// Deck data loading
import { AssetLoader } from "./asset-loader.js";
import { MarkdownParser } from "./markdown-parser.js";
import { safeString, getDeckId, DESIGN_SIZE } from "./utils.js";

export class DeckLoader {
    /**
     * Load deck data from a remote URL
     * @param {string} url - The URL to load the deck from
     * @returns {Promise<object>} - The deck data
     */
    static async loadFromUrl(url) {
        const urlLower = url.toLowerCase();
        if (urlLower.endsWith(".json")) {
            const jsonText = await this.fetchText(url, { cache: "no-cache" });
            try {
                return JSON.parse(jsonText);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                throw new Error(`Invalid deck JSON: ${msg}`);
            }
        } else if (urlLower.endsWith(".md")) {
            await AssetLoader.ensureMarkdownItLoaded();
            const mdText = await this.fetchText(url, { cache: "no-cache" });
            return new MarkdownParser().parseDeckMarkdown(mdText);
        } else {
            throw new Error("Unsupported file type. Please use .md or .json files.");
        }
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
                // Only load if data is recent (within 30 seconds) to avoid stale data
                if (age < 30000) {
                    // Mark this window as having loaded the data
                    const loadedKey = "webdeck_local_file_loaded";
                    const loadedCount = parseInt(localStorage.getItem(loadedKey) || "0", 10);
                    localStorage.setItem(loadedKey, (loadedCount + 1).toString());

                    // If both windows have loaded (count >= 2), clear the data after a delay
                    if (loadedCount >= 2) {
                        setTimeout(() => {
                            localStorage.removeItem("webdeck_local_file");
                            localStorage.removeItem("webdeck_local_file_type");
                            localStorage.removeItem("webdeck_local_file_timestamp");
                            localStorage.removeItem(loadedKey);
                        }, 1000);
                    }

                    if (fileType === "json") {
                        return JSON.parse(localFile);
                    } else if (fileType === "md") {
                        await AssetLoader.ensureMarkdownItLoaded();
                        return new MarkdownParser().parseDeckMarkdown(localFile);
                    } else {
                        throw new Error(`Unknown file type: ${fileType}`);
                    }
                } else {
                    // Data is too old, clear it
                    localStorage.removeItem("webdeck_local_file");
                    localStorage.removeItem("webdeck_local_file_type");
                    localStorage.removeItem("webdeck_local_file_timestamp");
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
                return await this.loadFromUrl(urlParam);
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
                        main: "<div style=\"text-align: center;\"><h1 style=\"font-size: 3rem; margin-bottom: 1rem;\">Welcome to Slide Deck</h1><p style=\"font-size: 1.5rem; margin-bottom: 2rem;\">Open a presentation to get started</p><p style=\"font-size: 1.1rem; color: var(--color-fg-muted);\">Use the <strong>Open File</strong> button to load a local .md or .json file,<br>or use <strong>Open Remote</strong> to load from a URL.</p></div>",
                    },
                },
            ],
        };
    }

    /**
     * Sets up the local file loading handler.
     * @param {HTMLElement} openFileBtn - The button that triggers file selection
     * @param {HTMLInputElement} fileInput - The file input element
     */
    static setupLocalFileHandler(openFileBtn, fileInput) {
        openFileBtn.addEventListener("click", () => {
            fileInput.click();
        });

        fileInput.addEventListener("change", async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                let fileType;
                if (file.name.endsWith(".json")) {
                    fileType = "json";
                } else if (file.name.endsWith(".md")) {
                    fileType = "md";
                } else {
                    alert("Unsupported file type. Please use .md or .json files.");
                    return;
                }

                // Store file data in localStorage with timestamp (shared across windows)
                localStorage.setItem("webdeck_local_file", text);
                localStorage.setItem("webdeck_local_file_type", fileType);
                localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
                localStorage.removeItem("webdeck_local_file_loaded"); // Reset loaded count

                // Send reload message to all other windows
                const reloadChannel = new BroadcastChannel("webdeck-reload");
                reloadChannel.postMessage({ type: "reload" });
                reloadChannel.close();

                // Clear the slide hash before reloading to start from slide 1
                window.location.hash = "";
                // Force a hard page reload
                window.location.reload();
            } catch (err) {
                console.error("Failed to load file:", err);
                alert("Failed to load file: " + (err instanceof Error ? err.message : String(err)));
            }

            // Reset input so same file can be selected again
            fileInput.value = "";
        });
    }

    /**
     * Sets up the remote file loading handler.
     * @param {HTMLElement} openRemoteBtn - The button that triggers URL prompt
     */
    static setupRemoteFileHandler(openRemoteBtn) {
        openRemoteBtn.addEventListener("click", async () => {
            const url = prompt("Enter remote file URL (.md or .json):");
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
                alert("Failed to load remote file: " + (err instanceof Error ? err.message : String(err)));
            }
        });
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
