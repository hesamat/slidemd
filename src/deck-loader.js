// Deck data loading
import { AssetLoader } from "./asset-loader.js";
import { MarkdownParser } from "./markdown-parser.js";
import { safeString, getDeckId, DESIGN_SIZE } from "./utils.js";

export class DeckLoader {
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

        // Dev mode: fetch deck.md and parse client-side
        await AssetLoader.ensureMarkdownItLoaded();
        const mdText = await this.fetchText("decks/deck.md", { cache: "no-cache" });
        return new MarkdownParser().parseDeckMarkdown(mdText);
    }

    static normalizeDeck(raw) {
        if (!raw || typeof raw !== "object") throw new Error("Invalid deck: not an object");
        if (!Array.isArray(raw.slides)) throw new Error("Invalid deck: slides must be an array");

        const meta = raw.meta && typeof raw.meta === "object" ? raw.meta : {};
        const slides = raw.slides.map((s, idx) => {
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
                areas,
            };
        });

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
