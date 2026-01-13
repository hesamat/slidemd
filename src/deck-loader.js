// Deck data loading
import { AssetLoader } from "./asset-loader.js";
import { MarkdownParser } from "./markdown-parser.js";
import { safeString, getDeckId, DESIGN_SIZE } from "./utils.js";

export class DeckLoader {
    static sanitizeDeckKey(input) {
        const s = typeof input === "string" ? input.trim() : "";
        if (!s) return null;
        // Prevent path traversal and keep keys stable.
        // Allowed: letters, numbers, dot, dash, underscore.
        if (!/^[a-zA-Z0-9._-]+$/.test(s)) return null;
        // Only allow known content formats.
        if (!s.endsWith(".md") && !s.endsWith(".json")) return null;
        return s;
    }

    static getDeckKeyFromUrl() {
        try {
            const url = new URL(window.location.href);
            return this.sanitizeDeckKey(url.searchParams.get("deck"));
        } catch {
            return null;
        }
    }

    static async loadDeckCatalog() {
        const embedded = document.getElementById("deckCatalog");
        const embeddedText = embedded?.textContent?.trim();
        if (embeddedText) {
            try {
                return JSON.parse(embeddedText);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                throw new Error(`Invalid embedded deck catalog JSON (#deckCatalog): ${msg}`);
            }
        }

        // Dev mode (and multi-file deployments): fetch catalog if present.
        try {
            const text = await this.fetchText("decks/catalog.json", { cache: "no-cache" });
            return JSON.parse(text);
        } catch {
            return null;
        }
    }

    static normalizeCatalog(raw) {
        if (!raw || typeof raw !== "object") return null;
        const decksRaw = Array.isArray(raw.decks) ? raw.decks : [];
        const decks = decksRaw
            .map((d) => {
                if (!d || typeof d !== "object") return null;
                const key = this.sanitizeDeckKey(d.key);
                if (!key) return null;
                return {
                    key,
                    title: safeString(d.title) || key,
                };
            })
            .filter(Boolean);

        const def = this.sanitizeDeckKey(raw.default) || (decks[0]?.key ?? null);
        return {
            default: def,
            decks,
            // Optional: build may embed full deck data map for offline switching.
            data: raw.data && typeof raw.data === "object" ? raw.data : null,
        };
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
        const requestedKey = this.getDeckKeyFromUrl();

        // Prefer a catalog (if present) so we can switch decks in build output too.
        const catalogRaw = await this.loadDeckCatalog();
        const catalog = this.normalizeCatalog(catalogRaw);

        const selectedKey = requestedKey || catalog?.default || "deck.md";

        // If build embedded a full catalog of deck data, use it (no fetch, works offline).
        if (catalog?.data && typeof catalog.data[selectedKey] === "object") {
            return catalog.data[selectedKey];
        }

        // Back-compat: single embedded deck JSON (default deck only)
        if (!requestedKey) {
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
        }

        // Dev/multi-file mode: fetch a deck file and parse client-side
        const deckUrl = `decks/${selectedKey}`;
        if (selectedKey.endsWith(".json")) {
            const jsonText = await this.fetchText(deckUrl, { cache: "no-cache" });
            try {
                return JSON.parse(jsonText);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                throw new Error(`Invalid deck JSON (${deckUrl}): ${msg}`);
            }
        }

        await AssetLoader.ensureMarkdownItLoaded();
        const mdText = await this.fetchText(deckUrl, { cache: "no-cache" });
        return new MarkdownParser().parseDeckMarkdown(mdText);
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
