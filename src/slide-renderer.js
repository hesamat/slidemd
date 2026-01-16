/**
 * SlideRenderer
 * Renders slide DOM elements, applies layout templates, and manages accessibility attributes. Integrates with LayoutParser for grid-based slide design.
 */
// Slide DOM rendering
import { safeString, DESIGN_SIZE } from "./utils.js";
import { LayoutParser } from "./layout-parser.js";
import { DeckLoader } from "./deck-loader.js";

export class SlideRenderer {
    static areaLooksLikeMediaAsset(areaHtml) {
        const html = safeString(areaHtml).trim();
        if (!html) return false;
        return /<(img|video|iframe)\b/i.test(html);
    }

    static createSlideElement(deck, slide, index, isActive) {
        const wrapper = document.createElement("div");
        wrapper.className = `slide${isActive ? " active" : ""}`;
        wrapper.setAttribute("role", "region");
        wrapper.setAttribute("aria-roledescription", "slide");

        const labelTitle = safeString(slide?.title);
        wrapper.setAttribute(
            "aria-label",
            `Slide ${index + 1} of ${deck.slides.length}${labelTitle ? `: ${labelTitle.replace(/<[^>]*>/g, "")}` : ""}`
        );

        if (slide?.theme) {
            wrapper.setAttribute("data-theme", slide.theme);
        }

        if (slide?.background) {
            wrapper.style.background = slide.background;
        }

        const grid = document.createElement("div");
        grid.className = "slide__grid";

        const areas = slide?.areas && typeof slide.areas === "object" ? slide.areas : {};
        const areaNamesFromContent = Object.keys(areas);
        const resolvedLayout = LayoutParser.resolvePreset(slide?.layout);
        const layout = LayoutParser.parse(resolvedLayout, {
            fallbackAreas: areaNamesFromContent.length ? areaNamesFromContent : ["main"],
        });

        grid.style.gridTemplateAreas = layout.gridTemplateAreas;
        grid.style.gridTemplateColumns = layout.gridTemplateColumns;
        grid.style.gridTemplateRows = layout.gridTemplateRows;

        const align = safeString(slide?.align).trim().toLowerCase();
        if (align === "center" && layout.orderedAreas.length === 1 && layout.orderedAreas[0] === "main") {
            grid.style.placeItems = "center";
        }

        const names = [...layout.orderedAreas];
        for (const extra of areaNamesFromContent) {
            if (!names.includes(extra)) names.push(extra);
        }

        names.forEach((name) => {
            const html = areas[name] || "";
            const area = document.createElement("div");
            area.className = `slide__area slide__area--${name}`;
            area.style.gridArea = name;

            if (name === "cards") {
                area.classList.add("slide__area--cards");
            }

            if (this.areaLooksLikeMediaAsset(html)) {
                area.classList.add("media");
            }

            area.innerHTML = html;
            grid.appendChild(area);
        });

        wrapper.appendChild(grid);
        return wrapper;
    }

    static getSlideTitleForUi(slide, fallbackIndex) {
        const t = slide?.title;
        if (!t) return `Slide ${fallbackIndex + 1}`;
        return String(t).replace(/<[^>]*>/g, "").trim() || `Slide ${fallbackIndex + 1}`;
    }

    /**
     * Renders a single slide element with optional deck context.
     * @param {Object} slide - The slide object to render
     * @param {Object} options - Rendering options
     * @param {number} options.index - Slide index (default: 0)
     * @param {boolean} options.isActive - Whether slide is active (default: true)
     * @param {Object} options.deck - Optional deck context for rendering
     * @returns {HTMLElement} The rendered slide element
     */
    static renderSlide(slide, { index = 0, isActive = true, deck = null } = {}) {
        const normalizedSlide = slide && typeof slide === "object" ? slide : {
            title: "",
            notes: "",
            layout: "",
            areas: { main: "" }
        };
        const d = deck && typeof deck === "object" ? deck : DeckLoader.normalizeDeck({
            meta: { id: "webdeck", title: "", course: "", aspect: "16:9", stage: { ...DESIGN_SIZE } },
            slides: [{
                id: normalizedSlide.id ?? 1,
                title: normalizedSlide.title ?? "",
                notes: normalizedSlide.notes ?? "",
                layout: normalizedSlide.layout ?? "",
                areas: normalizedSlide.areas && typeof normalizedSlide.areas === "object" ? normalizedSlide.areas : { main: "" },
            }],
        });

        const s = d.slides[index] || d.slides[0];
        return this.createSlideElement(d, s, index, isActive);
    }
}
