/**
 * MarkdownParser
 * Extracts and parses slides from markdown files. Handles code fences, directives, and metadata for slide generation and content structuring.
 */
// Markdown parsing and slide extraction
import { safeString, slugifyTitle, DESIGN_SIZE, escapeHtml } from "../core/utils.js";
import { LayoutParser } from "./layout-parser.js";

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
                const m = line.match(/^\s*#{1,6}\s+(.+?)\s*$/);
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

        // Source-map plugin: add data-source-line to block-level opening tags
        const originalRenderToken = this.md.renderer.renderToken.bind(this.md.renderer);
        this.md.renderer.renderToken = function (tokens, idx, options) {
            const token = tokens[idx];
            if (token.map && token.level === 0 && token.type.endsWith("_open")) {
                token.attrPush(["data-source-line", String(token.map[0] + 1)]);
            }
            return originalRenderToken(tokens, idx, options);
        };
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

    splitFenceAwareSegments(markdownText) {
        const lines = safeString(markdownText).replace(/\r\n?/g, "\n").split("\n");
        const segments = [];
        const plainLines = [];
        const fence = new FenceTracker();

        const flushPlain = () => {
            if (plainLines.length === 0) return;
            segments.push({ inFence: false, text: plainLines.join("\n") });
            plainLines.length = 0;
        };

        for (const line of lines) {
            const isFenceMarker = /^\s*(```+|~~~+)\s*/.test(line);

            if (!fence.isInFence && isFenceMarker) {
                flushPlain();
                segments.push({ inFence: true, text: line });
                fence.toggle(line);
                continue;
            }

            if (fence.isInFence) {
                segments.push({ inFence: true, text: line });
                if (isFenceMarker) fence.toggle(line);
                continue;
            }

            plainLines.push(line);
        }

        flushPlain();
        return segments;
    }

    extractNotes(markdownText) {
        const notes = [];

        for (const segment of this.splitFenceAwareSegments(markdownText)) {
            if (segment.inFence) continue;

            const re = /<!--\s*notes\s*:(.*?)-->/gis;
            let m;
            while ((m = re.exec(segment.text))) {
                notes.push(safeString(m[1]).trim());
            }
        }

        return notes.join("\n\n").trim();
    }

    stripNotes(markdownText) {
        return this.splitFenceAwareSegments(markdownText)
            .map((segment) => segment.inFence ? segment.text : segment.text.replace(/<!--\s*notes\s*:.*?-->/gis, ""))
            .join("\n");
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
        let inMathBlock = false;
        let mathBlockLines = [];
        const result = [];

        for (const line of lines) {
            fence.toggle(line);
            if (fence.isInFence) {
                result.push(line);
                continue;
            }

            // Check for $$ math block delimiters
            if (line.trim() === "$$") {
                if (!inMathBlock) {
                    // Start of math block
                    inMathBlock = true;
                    mathBlockLines = [];
                } else {
                    // End of math block - convert to single-line format
                    const mathContent = mathBlockLines.join(" ").trim();
                    // Escape all backslashes in the math content
                    const escaped = mathContent.replace(/\\/g, "\\\\");
                    result.push(`$$${escaped}$$`);
                    inMathBlock = false;
                    mathBlockLines = [];
                }
            } else if (inMathBlock) {
                // Collect lines inside the math block
                mathBlockLines.push(line);
            } else {
                // Outside math blocks, escape LaTeX bracket delimiters
                result.push(
                    line
                        .replace(/\\\[/g, "\\\\[")
                        .replace(/\\\]/g, "\\\\]")
                        .replace(/\\\$/g, '<span class="katex-ignore">$</span>')
                );
            }
        }

        return result.join("\n");
    }

    parseAreas(markdownText) {
        const lines = safeString(markdownText).replace(/\r\n?/g, "\n").split("\n");
        const areas = {};
        const areaOffsets = {};
        let current = "main";
        const fence = new FenceTracker();

        const ensure = (name) => {
            if (!areas[name]) areas[name] = [];
        };

        ensure(current);
        let lineIdx = 0;

        for (const line of lines) {
            fence.toggle(line);
            if (!fence.isInFence) {
                const m = line.match(/^\s*@([a-zA-Z_][a-zA-Z0-9_-]*)\s*$/);
                if (m) {
                    current = m[1].toLowerCase();
                    ensure(current);
                    areaOffsets[current] = lineIdx;
                    lineIdx++;
                    continue;
                }
            }
            areas[current].push(line);
            lineIdx++;
        }

        const out = {};
        for (const [name, buf] of Object.entries(areas)) {
            const text = buf.join("\n").trim();
            if (text) out[name] = text;
        }

        return { areas: out, areaOffsets };
    }

    convertMermaidCodeBlocksToDiv(htmlText) {
        // Convert <pre><code class="language-mermaid">...</code></pre> to <div class="mermaid">...</div>
        const re = /<pre>\s*<code[^>]*class=["'][^"']*(?:language|lang)-mermaid[^"']*["'][^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi;
        return htmlText.replace(re, (match, content) => {
            // For client-side, store Mermaid source in data-mermaid-source and add loading state
            const safeContent = content.replace(/"/g, '&quot;');

            // Create a div with a data attribute for client-side rendering
            return `<div class="mermaid" data-mermaid-source="${safeContent}"></div>`;
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
            const { value: layout, markdown: withoutLayout } = this.extractDirective(cleaned, "layout");
            cleaned = withoutLayout;

            // For backwards compatibility, extract but ignore align directive
            const { markdown: withoutAlign } = this.extractDirective(cleaned, "align");
            cleaned = withoutAlign;

            const { value: background, markdown: withoutBackground } = this.extractDirective(cleaned, "background");
            cleaned = withoutBackground;

            const { value: theme, markdown: withoutTheme } = this.extractDirective(cleaned, "theme");
            cleaned = withoutTheme;

            const { value: areaStyle, markdown: withoutAreaStyle } = this.extractDirective(cleaned, "area-style");
            cleaned = withoutAreaStyle;

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

            const { areas: areasMd, areaOffsets } = this.parseAreas(cleaned);

            const resolvedLayout = LayoutParser.parse(LayoutParser.resolvePreset(layout), {
                fallbackAreas: Object.keys(areasMd).length ? Object.keys(areasMd) : ["main"],
            });
            const layoutAreas = new Set(resolvedLayout.orderedAreas);
            const hasTitleArea = layoutAreas.has("title");

            // Treat @title and @header as aliases, but keep only the area the layout can actually render.
            if (hasTitleArea) {
                if (!areasMd.title && areasMd.header) {
                    areasMd.title = areasMd.header;
                }
                delete areasMd.header;
            } else {
                if (!areasMd.header && areasMd.title) {
                    areasMd.header = areasMd.title;
                }
                delete areasMd.title;
            }

            const areas = {};
            for (const [name, src] of Object.entries(areasMd)) {
                let html = this.md.render(src);
                // Convert Mermaid code blocks to divs for client-side rendering
                html = this.convertMermaidCodeBlocksToDiv(html);
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
                background: background || "",
                theme: themeNormalized,
                hidden,
                areas,
                areaStyle: areaStyle || "",
                _areaOffsets: areaOffsets,
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
