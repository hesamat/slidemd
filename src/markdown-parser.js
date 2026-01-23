/**
 * MarkdownParser
 * Extracts and parses slides from markdown files. Handles code fences, directives, and metadata for slide generation and content structuring.
 */
// Markdown parsing and slide extraction
import { safeString, slugifyTitle, DESIGN_SIZE, escapeHtml } from "./utils.js";

class FenceTracker {
    constructor() {
        this.inFence = false;
        this.fenceMarker = null;
    }

    toggle(line) {
        const m = line.match(/^\s*(```+|~~~+)\s*/);
        if (!m) return;
        const marker = m[1][0];
        if (!this.inFence) {
            this.inFence = true;
            this.fenceMarker = marker;
        } else if (this.fenceMarker === marker) {
            this.inFence = false;
            this.fenceMarker = null;
        }
    }

    get isInFence() {
        return this.inFence;
    }
}

export class MarkdownParser {
    constructor() {
        this.md = null;
    }

    parseBooleanDirectiveValue(raw) {
        const s = safeString(raw).trim().toLowerCase();
        if (!s) return null;
        if (["1", "true", "yes", "y", "on"].includes(s)) return true;
        if (["0", "false", "no", "n", "off"].includes(s)) return false;
        return null;
    }

    extractTitle(markdownText) {
        const lines = safeString(markdownText).replace(/\r\n?/g, "\n").split("\n");
        const fence = new FenceTracker();
        let title = "";

        for (const line of lines) {
            fence.toggle(line);

            if (!title && !fence.isInFence) {
                const m = line.match(/^\s*#\s+(.+?)\s*$/);
                if (m) {
                    title = safeString(m[1]).trim();
                }
            }
        }

        return title;
    }

    ensureMarkdownIt() {
        if (this.md) return;
        if (typeof window.markdownit !== "function") {
            throw new Error("markdown-it not available");
        }
        this.md = window.markdownit({
            html: true,
            linkify: true,
            typographer: false,
            breaks: true,
        });
    }

    splitSlides(markdownText) {
        const lines = safeString(markdownText).replace(/\r\n?/g, "\n").split("\n");
        const slides = [];
        let buf = [];
        const fence = new FenceTracker();

        for (const line of lines) {
            fence.toggle(line);
            if (!fence.isInFence && /^\s*---\s*$/.test(line)) {
                const text = buf.join("\n").trim();
                if (text) slides.push(text);
                buf = [];
                continue;
            }
            buf.push(line);
        }

        const last = buf.join("\n").trim();
        if (last) slides.push(last);
        return slides;
    }

    extractNotes(markdownText) {
        const text = safeString(markdownText);
        const notes = [];
        const re = /<!--\s*notes\s*:(.*?)-->/gis;
        let m;
        while ((m = re.exec(text))) {
            notes.push(safeString(m[1]).trim());
        }
        return notes.join("\n\n").trim();
    }

    stripNotes(markdownText) {
        return safeString(markdownText).replace(/<!--\s*notes\s*:.*?-->/gis, "");
    }

    extractDirective(markdownText, directiveName) {
        const lines = safeString(markdownText).replace(/\r\n?/g, "\n").split("\n");
        const fence = new FenceTracker();
        let value = "";
        let found = false;
        const out = [];

        for (const line of lines) {
            fence.toggle(line);
            if (!fence.isInFence) {
                const pattern = new RegExp(`^\\s*${directiveName}\\s*:\\s*(.*)\\s*$`, "i");
                const match = line.match(pattern);
                if (match) {
                    value = match[1].trim();
                    found = true;
                    continue;
                }
            }
            out.push(line);
        }

        return { value, found, markdown: out.join("\n").trim() };
    }

    escapeKatexBracketDelimiters(src) {
        const lines = safeString(src).replace(/\r\n?/g, "\n").split("\n");
        const fence = new FenceTracker();

        return lines
            .map((line) => {
                fence.toggle(line);
                if (fence.isInFence) return line;
                return line
                    .replace(/\\\[/g, "\\\\[")
                    .replace(/\\\]/g, "\\\\]")
                    .replace(/\\\$/g, '<span class="katex-ignore">$</span>');
            })
            .join("\n");
    }

    parseAreas(markdownText) {
        const lines = safeString(markdownText).replace(/\r\n?/g, "\n").split("\n");
        const areas = {};
        let current = "main";
        const fence = new FenceTracker();

        const ensure = (name) => {
            if (!areas[name]) areas[name] = [];
        };

        ensure(current);

        for (const line of lines) {
            fence.toggle(line);
            if (!fence.isInFence) {
                const m = line.match(/^\s*@([a-zA-Z_][a-zA-Z0-9_-]*)\s*$/);
                if (m) {
                    current = m[1].toLowerCase();
                    ensure(current);
                    continue;
                }
            }
            areas[current].push(line);
        }

        const out = {};
        for (const [name, buf] of Object.entries(areas)) {
            const text = buf.join("\n").trim();
            if (text) out[name] = text;
        }

        return out;
    }

    convertD2CodeBlocksToDiv(htmlText) {
        // Convert <pre><code class="language-d2">...</code></pre> to <div class="d2">...</div>
        const re = /<pre>\s*<code[^>]*class=["'][^"']*(?:language|lang)-d2[^"']*["'][^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi;
        return htmlText.replace(re, (match, content) => {
            // The Vite plugin needs the D2 source as the content of the div
            // For client-side, also store it in data-d2-source and add loading state
            const safeContent = content.replace(/"/g, '&quot;');

            // Create a div with:
            // 1. The D2 source as content (for Vite plugin)
            // 2. A data attribute with the source (for client-side rendering)
            // 3. A loading indicator that will be replaced
            // The source is hidden via CSS, loading indicator is visible initially
            return `<div class="d2" data-d2-source="${safeContent}">
                <span class="d2-source-hidden">${content}</span>
                <div class="d2-loading">
                    <svg class="d2-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle class="d2-spinner__track" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"/>
                        <path class="d2-spinner__head" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3"/>
                    </svg>
                    <span class="d2-loading__text">Rendering diagram...</span>
                </div>
            </div>`;
        });
    }

    parseDeckMarkdown(markdownText) {
        this.ensureMarkdownIt();

        const slideTexts = this.splitSlides(markdownText);
        const usedIds = new Map();

        const slides = slideTexts.map((raw, idx) => {
            const notes = this.extractNotes(raw);
            let cleaned = this.stripNotes(raw);

            // Extract all directives
            const { value: align, markdown: withoutAlign } = this.extractDirective(cleaned, "align");
            cleaned = withoutAlign;

            const { value: layout, markdown: withoutLayout } = this.extractDirective(cleaned, "layout");
            cleaned = withoutLayout;

            const { value: background, markdown: withoutBackground } = this.extractDirective(cleaned, "background");
            cleaned = withoutBackground;

            const { value: theme, markdown: withoutTheme } = this.extractDirective(cleaned, "theme");
            cleaned = withoutTheme;

            // Hide slides from the viewer deck by default. Use ?showHidden=1 to include them.
            const { value: hiddenValue, found: hiddenFound, markdown: withoutHidden } = this.extractDirective(cleaned, "hidden");
            cleaned = withoutHidden;
            const { value: hideValue, found: hideFound, markdown: withoutHide } = this.extractDirective(cleaned, "hide");
            cleaned = withoutHide;
            const hiddenParsed = this.parseBooleanDirectiveValue(hiddenValue);
            const hideParsed = this.parseBooleanDirectiveValue(hideValue);
            const hidden = hiddenFound ? (hiddenParsed ?? true) : hideFound ? (hideParsed ?? true) : false;

            const explicitTitle = this.extractTitle(cleaned);

            cleaned = this.escapeKatexBracketDelimiters(cleaned);

            const areasMd = this.parseAreas(cleaned);
            const areas = {};
            for (const [name, src] of Object.entries(areasMd)) {
                let html = this.md.render(src);
                // Convert D2 code blocks to divs for server-side rendering
                html = this.convertD2CodeBlocksToDiv(html);
                areas[name] = html;
            }

            // Derive title: prefer explicit '# Title', then @header heading, then @main heading, then default
            let slideTitle = explicitTitle;
            if (!slideTitle) {
                const headerText = areasMd.header || "";
                const headerHeading = headerText.match(/^#{1,6}\s+(.+)$/m);
                if (headerHeading) {
                    slideTitle = headerHeading[1].trim();
                } else {
                    const mainText = areasMd.main || "";
                    const mainHeading = mainText.match(/^#{1,6}\s+(.+)$/m);
                    slideTitle = mainHeading ? mainHeading[1].trim() : `Slide ${idx + 1}`;
                }
            }

            let id = slugifyTitle(slideTitle);
            const n = (usedIds.get(id) || 0) + 1;
            usedIds.set(id, n);
            if (n > 1) id = `${id}-${n}`;

            const themeSafe = safeString(theme).toLowerCase();
            const themeNormalized = themeSafe === "dark" ? "dark" : themeSafe === "light" ? "light" : "";

            return {
                id,
                title: slideTitle,
                notes,
                layout: layout || "",
                align: align || "",
                background: background || "",
                theme: themeNormalized,
                hidden,
                areas,
            };
        });

        const metaTitle = slides[0]?.title || "Slide Deck";
        return {
            meta: {
                id: slugifyTitle(metaTitle),
                title: metaTitle,
                aspect: "16:9",
                stage: { ...DESIGN_SIZE },
            },
            slides,
        };
    }
}
