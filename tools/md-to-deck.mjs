import MarkdownIt from "markdown-it";

function safeString(v) {
    return typeof v === "string" ? v : "";
}

function slugifyTitle(title) {
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

function splitSlides(markdownText) {
    const lines = safeString(markdownText).replace(/\r\n?/g, "\n").split("\n");

    const slides = [];
    let buf = [];

    let inFence = false;
    let fenceMarker = null;

    function toggleFence(line) {
        const m = line.match(/^\s*(```+|~~~+)\s*/);
        if (!m) return false;
        const marker = m[1][0];
        if (!inFence) {
            inFence = true;
            fenceMarker = marker;
            return true;
        }
        if (fenceMarker === marker) {
            inFence = false;
            fenceMarker = null;
            return true;
        }
        return false;
    }

    for (const line of lines) {
        toggleFence(line);

        if (!inFence && /^\s*---\s*$/.test(line)) {
            slides.push(buf.join("\n").trim());
            buf = [];
            continue;
        }

        buf.push(line);
    }

    const last = buf.join("\n").trim();
    if (last) slides.push(last);

    return slides;
}

function extractNotes(markdownText) {
    const text = safeString(markdownText);
    const notes = [];
    const re = /<!--\s*notes\s*:(.*?)-->/gis;
    let m;
    while ((m = re.exec(text))) {
        notes.push(safeString(m[1]).trim());
    }
    return notes.join("\n\n").trim();
}

function stripNotes(markdownText) {
    return safeString(markdownText).replace(/<!--\s*notes\s*:.*?-->/gis, "");
}

function extractLayoutAndStrip(markdownText) {
    const lines = safeString(markdownText).replace(/\r\n?/g, "\n").split("\n");

    let inFence = false;
    let fenceMarker = null;
    let layout = "";

    function toggleFence(line) {
        const m = line.match(/^\s*(```+|~~~+)\s*/);
        if (!m) return false;
        const marker = m[1][0];
        if (!inFence) {
            inFence = true;
            fenceMarker = marker;
            return true;
        }
        if (fenceMarker === marker) {
            inFence = false;
            fenceMarker = null;
            return true;
        }
        return false;
    }

    const out = [];
    for (const line of lines) {
        toggleFence(line);
        if (!inFence) {
            const m = line.match(/^\s*layout\s*:\s*(.+)\s*$/i);
            if (m && !layout) {
                layout = safeString(m[1]).trim();
                continue;
            }
        }
        out.push(line);
    }

    return { layout, markdown: out.join("\n").trim() };
}

function extractBackgroundAndStrip(markdownText) {
    const lines = safeString(markdownText).replace(/\r\n?/g, "\n").split("\n");

    let inFence = false;
    let fenceMarker = null;
    let background = "";

    function toggleFence(line) {
        const m = line.match(/^\s*(```+|~~~+)\s*/);
        if (!m) return false;
        const marker = m[1][0];
        if (!inFence) {
            inFence = true;
            fenceMarker = marker;
            return true;
        }
        if (fenceMarker === marker) {
            inFence = false;
            fenceMarker = null;
            return true;
        }
        return false;
    }

    const out = [];
    for (const line of lines) {
        toggleFence(line);
        if (!inFence) {
            const m = line.match(/^\s*background\s*:\s*(.+)\s*$/i);
            if (m && !background) {
                background = safeString(m[1]).trim();
                continue;
            }
        }
        out.push(line);
    }

    return { background, markdown: out.join("\n").trim() };
}

function extractThemeAndStrip(markdownText) {
    const lines = safeString(markdownText).replace(/\r\n?/g, "\n").split("\n");

    let inFence = false;
    let fenceMarker = null;
    let theme = "";

    function toggleFence(line) {
        const m = line.match(/^\s*(```+|~~~+)\s*/);
        if (!m) return false;
        const marker = m[1][0];
        if (!inFence) {
            inFence = true;
            fenceMarker = marker;
            return true;
        }
        if (fenceMarker === marker) {
            inFence = false;
            fenceMarker = null;
            return true;
        }
        return false;
    }

    const out = [];
    for (const line of lines) {
        toggleFence(line);
        if (!inFence) {
            const m = line.match(/^\s*theme\s*:\s*(.+)\s*$/i);
            if (m && !theme) {
                theme = safeString(m[1]).trim();
                continue;
            }
        }
        out.push(line);
    }

    return { theme, markdown: out.join("\n").trim() };
}

function extractAlignAndStrip(markdownText) {
    const lines = safeString(markdownText).replace(/\r\n?/g, "\n").split("\n");

    let inFence = false;
    let fenceMarker = null;
    let align = "";

    function toggleFence(line) {
        const m = line.match(/^\s*(```+|~~~+)\s*/);
        if (!m) return false;
        const marker = m[1][0];
        if (!inFence) {
            inFence = true;
            fenceMarker = marker;
            return true;
        }
        if (fenceMarker === marker) {
            inFence = false;
            fenceMarker = null;
            return true;
        }
        return false;
    }

    const out = [];
    for (const line of lines) {
        toggleFence(line);
        if (!inFence) {
            const m = line.match(/^\s*align\s*:\s*(.+)\s*$/i);
            if (m && !align) {
                align = safeString(m[1]).trim();
                continue;
            }
        }
        out.push(line);
    }

    return { align, markdown: out.join("\n").trim() };
}

function parseBooleanDirectiveValue(raw) {
    const s = safeString(raw).trim().toLowerCase();
    if (!s) return null;
    if (["1", "true", "yes", "y", "on"].includes(s)) return true;
    if (["0", "false", "no", "n", "off"].includes(s)) return false;
    return null;
}

function extractHiddenAndStrip(markdownText) {
    const lines = safeString(markdownText).replace(/\r\n?/g, "\n").split("\n");

    let inFence = false;
    let fenceMarker = null;
    let hiddenRaw = "";
    let hideRaw = "";
    let hiddenSeen = false;
    let hideSeen = false;

    function toggleFence(line) {
        const m = line.match(/^\s*(```+|~~~+)\s*/);
        if (!m) return false;
        const marker = m[1][0];
        if (!inFence) {
            inFence = true;
            fenceMarker = marker;
            return true;
        }
        if (fenceMarker === marker) {
            inFence = false;
            fenceMarker = null;
            return true;
        }
        return false;
    }

    const out = [];
    for (const line of lines) {
        toggleFence(line);
        if (!inFence) {
            const mHidden = line.match(/^\s*hidden\s*:\s*(.*)\s*$/i);
            if (mHidden && !hiddenSeen) {
                hiddenRaw = safeString(mHidden[1]);
                hiddenSeen = true;
                continue;
            }
            const mHide = line.match(/^\s*hide\s*:\s*(.*)\s*$/i);
            if (mHide && !hideSeen) {
                hideRaw = safeString(mHide[1]);
                hideSeen = true;
                continue;
            }
        }
        out.push(line);
    }

    const hiddenParsed = parseBooleanDirectiveValue(hiddenRaw);
    const hideParsed = parseBooleanDirectiveValue(hideRaw);
    const hidden = hiddenSeen ? (hiddenParsed ?? true) : hideSeen ? (hideParsed ?? true) : false;

    return { hidden, markdown: out.join("\n").trim() };
}

function extractTitleAndStrip(markdownText) {
    const lines = safeString(markdownText).replace(/\r\n?/g, "\n").split("\n");

    let inFence = false;
    let fenceMarker = null;
    let title = "";

    function toggleFence(line) {
        const m = line.match(/^\s*(```+|~~~+)\s*/);
        if (!m) return false;
        const marker = m[1][0];
        if (!inFence) {
            inFence = true;
            fenceMarker = marker;
            return true;
        }
        if (fenceMarker === marker) {
            inFence = false;
            fenceMarker = null;
            return true;
        }
        return false;
    }

    const out = [];
    let removed = false;

    for (const line of lines) {
        toggleFence(line);

        if (!removed && !inFence) {
            const m = line.match(/^\s*#\s+(.+?)\s*$/);
            if (m) {
                title = safeString(m[1]).trim();
                removed = true;
            }
        }

        out.push(line);
    }

    return { title, markdown: out.join("\n").trim() };
}

function parseAreas(markdownText) {
    const lines = safeString(markdownText).replace(/\r\n?/g, "\n").split("\n");

    /** @type {Record<string, string[]>} */
    const areas = {};
    let current = "main";

    let inFence = false;
    let fenceMarker = null;

    function toggleFence(line) {
        const m = line.match(/^\s*(```+|~~~+)\s*/);
        if (!m) return false;
        const marker = m[1][0];
        if (!inFence) {
            inFence = true;
            fenceMarker = marker;
            return true;
        }
        if (fenceMarker === marker) {
            inFence = false;
            fenceMarker = null;
            return true;
        }
        return false;
    }

    function ensure(name) {
        if (!areas[name]) areas[name] = [];
    }

    ensure(current);

    for (const line of lines) {
        toggleFence(line);

        if (!inFence) {
            const m = line.match(/^\s*@([a-zA-Z][\w-]*)\s*$/);
            if (m) {
                current = m[1];
                ensure(current);
                continue;
            }
        }

        areas[current].push(line);
    }

    /** @type {Record<string, string>} */
    const out = {};
    for (const [name, buf] of Object.entries(areas)) {
        const text = buf.join("\n").trim();
        if (text) out[name] = text;
    }

    return out;
}

function escapeKatexBracketDelimiters(markdownText) {
    const lines = safeString(markdownText).replace(/\r\n?/g, "\n").split("\n");

    let inFence = false;
    let fenceMarker = null;
    let inMathBlock = false;
    let mathBlockLines = [];

    function toggleFence(line) {
        const m = line.match(/^\s*(```+|~~~+)\s*/);
        if (!m) return;
        const marker = m[1][0];
        if (!inFence) {
            inFence = true;
            fenceMarker = marker;
            return;
        }
        if (fenceMarker === marker) {
            inFence = false;
            fenceMarker = null;
        }
    }

    const result = [];

    for (const line of lines) {
        toggleFence(line);
        if (inFence) {
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
            // Outside math blocks, only escape LaTeX bracket delimiters
            // markdown-it treats backslash as an escape and turns "\[" into "[".
            // Doubling the slash keeps a literal "\[" in the rendered HTML so KaTeX can see it.
            result.push(
                line
                    .replace(/(^|[^\\])\\\[/g, "$1\\\\[")
                    .replace(/(^|[^\\])\\\]/g, "$1\\\\]")
            );
        }
    }

    if (inMathBlock) {
        console.warn("[escapeKatex] Warning: Unclosed $$ block at end of content");
    }

    return result.join("\n");
}

function makeMarkdownRenderer() {
    return new MarkdownIt({
        html: true,
        linkify: true,
        typographer: false,
        breaks: true,
    });
}

function resolveLayoutPreset(layoutSpec) {
    const key = safeString(layoutSpec).trim().toLowerCase();
    const presets = {
        focus: '"header" "main" "footer" / auto 1fr auto',
        "two-column": '"header header" "main media" "footer footer" / 1fr 1fr',
        "left-heavy": '"header header" "main media" "footer footer" / 2fr 1fr',
        "right-heavy": '"header header" "main media" "footer footer" / 1fr 2fr',
        "header-content": '"header" "main" "footer" / 1fr',
        "header-two-column": '"header header" "main media" "footer footer" / 1fr 1fr',
        "title-slide": '"title" / 1fr',
        "three-column": '"header header header" "main media secondary" "footer footer footer" / 1fr 1fr 1fr',
        "sidebar-content": '"header header" "sidebar main" "footer footer" / 300px 1fr',
        "content-sidebar": '"header header" "main sidebar" "footer footer" / 1fr 300px',
    };
    return presets[key] || layoutSpec;
}

function extractAreaNamesFromGridTemplate(gridTemplate) {
    const spec = safeString(gridTemplate).trim();
    if (!spec) return [];
    const parts = spec.split("/");
    const left = safeString(parts[0]).trim();
    const rowMatches = left.match(/"[^"]*"|'[^']*'/g) || [];
    const names = [];
    for (const row of rowMatches) {
        const content = row.slice(1, -1);
        for (const name of content.split(/\s+/)) {
            if (name && !/^\.+$/.test(name) && !names.includes(name)) {
                names.push(name);
            }
        }
    }
    return names;
}

export function parseDeckMarkdown(markdownText) {
    const md = makeMarkdownRenderer();

    const slideTexts = splitSlides(markdownText);
    const usedIds = new Map();

    const slides = slideTexts
        .map((raw, index) => {
            const notes = extractNotes(raw);
            let cleaned = stripNotes(raw);

            const { align, markdown: withoutAlign } = extractAlignAndStrip(cleaned);
            cleaned = withoutAlign;

            const { layout, markdown: withoutLayout } = extractLayoutAndStrip(cleaned);
            cleaned = withoutLayout;

            const { background, markdown: withoutBackground } = extractBackgroundAndStrip(cleaned);
            cleaned = withoutBackground;

            const { theme, markdown: withoutTheme } = extractThemeAndStrip(cleaned);
            cleaned = withoutTheme;

            const { hidden, markdown: withoutHidden } = extractHiddenAndStrip(cleaned);
            cleaned = withoutHidden;

            const { title: explicitTitle, markdown: withoutTitle } = extractTitleAndStrip(cleaned);
            cleaned = withoutTitle;

            cleaned = escapeKatexBracketDelimiters(cleaned);

            const areasMd = parseAreas(cleaned);

            const resolvedLayout = resolveLayoutPreset(layout || "");
            const layoutAreaNames = extractAreaNamesFromGridTemplate(resolvedLayout);
            const hasTitleArea = layoutAreaNames.includes("title");

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

            /** @type {Record<string, string>} */
            const areasHtml = {};
            for (const [area, src] of Object.entries(areasMd)) {
                areasHtml[area] = md.render(src);
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
                    slideTitle = mainHeading ? mainHeading[1].trim() : `Slide ${index + 1}`;
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
                layout: resolvedLayout,
                align: align || "",
                background: background || "",
                theme: themeNormalized,
                hidden,
                areas: areasHtml,
            };
        })
        .filter(Boolean);

    const metaTitle = slides[0]?.title || "Slide Deck";

    return {
        meta: {
            id: slugifyTitle(metaTitle),
            title: metaTitle,
            aspect: "16:9",
            stage: { width: 1920, height: 1080 },
        },
        slides,
    };
}

export default parseDeckMarkdown;
