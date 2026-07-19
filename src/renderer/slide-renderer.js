/**
 * SlideRenderer
 * Renders slide DOM elements, applies layout templates, manages accessibility attributes,
 * and handles view-related UI states (loading, errors, etc.). Integrates with LayoutParser
 * for grid-based slide design.
 */
// Slide DOM rendering
import { safeString, DESIGN_SIZE } from "../core/utils.js";
import { LayoutParser } from "../data/layout-parser.js";
import { DeckLoader } from "../data/deck-loader.js";

export class SlideRenderer {
  static areaLooksLikeMediaAsset(areaHtml) {
    const html = safeString(areaHtml).trim();
    if (!html) return false;
    return /<(img|video|iframe)\b/i.test(html);
  }

  /**
   * Apply a CSS declaration string to an area element, setting each property
   * individually so existing inline styles (e.g. grid-area) are preserved.
   * @param {HTMLElement} areaEl
   * @param {string} cssText - e.g. "border: 2px solid red; padding: 12px"
   */
  static _applyAreaStyle(areaEl, cssText) {
    const decls = safeString(cssText)
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const decl of decls) {
      const idx = decl.indexOf(":");
      if (idx === -1) continue;
      const prop = decl.slice(0, idx).trim();
      const val = decl.slice(idx + 1).trim();
      if (prop && val) {
        areaEl.style.setProperty(prop, val);
      }
    }
  }

  static createSlideElement(deck, slide, index, isActive) {
    const wrapper = document.createElement("div");
    wrapper.className = `slide${isActive ? " active" : ""}${slide?.hidden ? " slide--hidden" : ""}`;
    wrapper.setAttribute("role", "region");
    wrapper.setAttribute("aria-roledescription", "slide");

    const labelTitle = safeString(slide?.title);
    // Count only visible slides for aria-label
    const visibleSlideCount = deck.slides.filter((s) => !s.hidden).length;
    wrapper.setAttribute(
      "aria-label",
      `Slide ${index + 1} of ${visibleSlideCount}${labelTitle ? `: ${labelTitle.replace(/<[^>]*>/g, "")}` : ""}`,
    );

    if (slide?.theme) {
      wrapper.setAttribute("data-theme", slide.theme);
    }

    if (slide?.headerStyle) {
      wrapper.setAttribute("data-header-style", slide.headerStyle);
    }

    if (slide?.background) {
      wrapper.style.background = slide.background;
    }

    if (slide?._areaOffsets) {
      wrapper.dataset.areaOffsets = JSON.stringify(slide._areaOffsets);
    }

    if (slide?.areaStyle) {
      wrapper.setAttribute("data-has-borders", "");
    }

    const grid = document.createElement("div");
    grid.className = "slide__grid";

    const areas = slide?.areas && typeof slide.areas === "object" ? slide.areas : {};
    const areaNamesFromContent = Object.keys(areas);
    const resolvedLayout = LayoutParser.resolvePreset(slide?.layout);
    const layout = LayoutParser.parse(resolvedLayout, {
      fallbackAreas: areaNamesFromContent.length ? areaNamesFromContent : ["main"],
    });
    const layoutAreaNames = new Set(layout.orderedAreas);

    grid.style.gridTemplateAreas = layout.gridTemplateAreas;
    grid.style.gridTemplateColumns = layout.gridTemplateColumns;
    grid.style.gridTemplateRows = layout.gridTemplateRows;

    const names = [...layout.orderedAreas];
    for (const extra of areaNamesFromContent) {
      if (!names.includes(extra)) names.push(extra);
    }

    const areaStyle = safeString(slide?.areaStyle);

    // Auto-detect full-height areas: areas that appear in every row at the same column
    const rowMatches = layout.gridTemplateAreas.match(/"[^"]*"|'[^']*'/g) || [];
    const allRowCells = rowMatches.map((q) => q.slice(1, -1).split(/\s+/).filter(Boolean));
    const fullHeightAreas = new Set();
    if (allRowCells.length > 1) {
      const numCols = allRowCells[0]?.length || 0;
      for (let col = 0; col < numCols; col++) {
        const areaName = allRowCells[0][col];
        if (!areaName || areaName === ".") continue;
        const spansAll = allRowCells.every((row) => row[col] === areaName);
        if (spansAll) fullHeightAreas.add(areaName);
      }
    }

    names.forEach((name) => {
      const isAliasTitle = name === "title" && !layoutAreaNames.has("title");
      const isAliasHeader = name === "header" && layoutAreaNames.has("title");
      if (isAliasTitle || isAliasHeader) {
        return;
      }

      const html = areas[name] || "";
      const area = document.createElement("div");
      area.className = `slide__area slide__area--${name}`;
      area.style.gridArea = name;
      area.dataset.areaName = name;

      if (name === "cards") {
        area.classList.add("slide__area--cards");
      }

      if (this.areaLooksLikeMediaAsset(html)) {
        area.classList.add("media");
      }

      if (areaStyle && name !== "footer") {
        this._applyAreaStyle(area, areaStyle);
      }

      // Footer spans full width when full-height areas exist
      if (fullHeightAreas.size > 0 && name === "footer") {
        area.style.gridColumn = "1 / -1";
      }
      // Full-height areas touch the right slide border
      if (fullHeightAreas.has(name)) {
        area.style.paddingRight = "0";
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
    return (
      String(t)
        .replace(/<[^>]*>/g, "")
        .trim() || `Slide ${fallbackIndex + 1}`
    );
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
    const normalizedSlide =
      slide && typeof slide === "object"
        ? slide
        : {
            title: "",
            notes: "",
            layout: "",
            areas: { main: "" },
            areaStyle: "",
          };
    const d =
      deck && typeof deck === "object"
        ? deck
        : DeckLoader.normalizeDeck({
            meta: {
              id: "webdeck",
              title: "",
              course: "",
              aspect: "16:9",
              stage: { ...DESIGN_SIZE },
            },
            slides: [
              {
                id: normalizedSlide.id ?? 1,
                title: normalizedSlide.title ?? "",
                notes: normalizedSlide.notes ?? "",
                layout: normalizedSlide.layout ?? "",
                areas:
                  normalizedSlide.areas && typeof normalizedSlide.areas === "object"
                    ? normalizedSlide.areas
                    : { main: "" },
                areaStyle: safeString(normalizedSlide.areaStyle),
              },
            ],
          });

    const s = d.slides[index] || d.slides[0];
    return this.createSlideElement(d, s, index, isActive);
  }

  /**
   * Displays a loading state in the slides container.
   */
  static showLoadingState() {
    const slidesContainer = document.getElementById("slidesContainer");
    if (slidesContainer) {
      slidesContainer.innerHTML = `
                <div style="position:absolute; inset:0; display:grid; place-items:center; padding:48px; color:rgba(15,23,42,.75);">
                    <div style="font-weight:800;">Loading deck…</div>
                </div>
            `;
    }
  }

  /**
   * Displays an error message in the slides container when deck fails to load.
   * @param {Error|string} err - The error to display
   */
  static showBootError(err) {
    try {
      window.__WEBDECK_LAST_ERROR__ = err;
    } catch {
      /* storage may be full */
    }
    const slidesContainer = document.getElementById("slidesContainer");
    if (!slidesContainer) return;
    const msg = err instanceof Error ? err.stack || err.message : String(err);
    slidesContainer.innerHTML = `
            <div style="position:absolute; inset:0; display:grid; place-items:center; padding:48px;">
                <div style="max-width:900px; width:100%; border:1px solid rgba(239,68,68,.35); background:rgba(254,242,242,.92); border-radius:16px; padding:18px 18px; color:rgba(127,29,29,.95);">
                    <div style="font-weight:800; margin-bottom:8px;">Deck failed to load</div>
                    <pre style="margin:0; white-space:pre-wrap; font-size:12px; line-height:1.4;">${msg.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
                </div>
            </div>
        `;
  }

  /**
   * Creates a break slide element with the given title and theme.
   * The slide includes a title (duration) and an end time span that can be updated.
   * @param {Object} deck - The deck object for context
   * @param {Object} options - Options for the break slide
   * @param {string} options.background - Background color/style
   * @param {string} options.theme - Theme name
   * @returns {HTMLElement} The break slide element
   */
  static createBreakSlide(deck, { background = "#333", theme = "dark" } = {}) {
    const breakSlide = {
      layout: "title-slide",
      background,
      theme,
      areas: {
        main: `<div class="break-title">
                    <h1 class="break-mins"></h1>
                    <div class="break-end">Resume at <span class="break-end-time"></span></div>
                </div>`,
      },
    };
    const slideEl = this.createSlideElement(deck, breakSlide, 0, true);
    slideEl.classList.add("webdeck-break-slide");
    return slideEl;
  }
}
