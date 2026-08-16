/**
 * SlideRenderer
 * Renders slide DOM elements, applies layout templates, manages accessibility attributes,
 * and handles view-related UI states (loading, errors, etc.). Integrates with LayoutParser
 * for grid-based slide design.
 */
// Slide DOM rendering
import { safeString, escapeHtml, DESIGN_SIZE, splitCssDeclarations } from "../core/utils.js";
import { LayoutParser } from "../data/layout-parser.js";
import { DeckLoader } from "../data/deck-loader.js";
import { LayoutData, getMediaFullBleedSideFromGrid } from "../data/layout-data.js";
import createDOMPurify from "dompurify";
import { Logger } from "../core/logger.js";

const SAFE_URI_REGEXP =
  /^(?:(?:https?|mailto|ftp|ftps|tel|callto|cid|xmpp):|blob:|data:image\/(?:avif|bmp|gif|jpeg|jpg|png|webp)(?:[;,]|$)|[^-a-z0-9+.]|[-a-z0-9+.]+(?:[^-a-z0-9+.:]|$))/i;
const URI_ATTRIBUTES = new Set([
  "action",
  "background",
  "cite",
  "classid",
  "codebase",
  "data",
  "formaction",
  "href",
  "longdesc",
  "manifest",
  "ping",
  "poster",
  "profile",
  "src",
  "srcset",
  "usemap",
  "xlink:href",
  "xml:base",
]);
const PURIFY_CONFIG = {
  // SlideMD relies on inline styles, link targets, and data-attributes.
  // DOMPurify's default tag set already covers the structural HTML produced
  // by markdown-it; we just need to keep a few extra attributes it drops.
  ADD_ATTR: ["style", "target", "rel", "data-mermaid-source", "data-source-line"],
  ALLOWED_URI_REGEXP: SAFE_URI_REGEXP,
};

let _purify;
let _configuredPurifiers = new WeakSet();
let _rendererPurifyWarned = false;

function configureDOMPurify(purify) {
  if (!purify || _configuredPurifiers.has(purify)) return purify;
  purify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (
      URI_ATTRIBUTES.has(data.attrName.toLowerCase()) &&
      !SAFE_URI_REGEXP.test(data.attrValue || "")
    ) {
      data.keepAttr = false;
    }
  });
  _configuredPurifiers.add(purify);
  return purify;
}

function getDOMPurify() {
  // In the dev ESM build, the import is available and creates a sanitizer.
  // In the self-contained HTML/PDF bundles the import is stripped, but the
  // same DOMPurify library is loaded as a vendor global (window.DOMPurify).
  if (_purify !== undefined) return configureDOMPurify(_purify);

  if (typeof createDOMPurify !== "undefined") {
    try {
      _purify = createDOMPurify(window);
    } catch {
      _purify = null;
    }
  }

  if (!_purify && typeof window !== "undefined" && window.DOMPurify) {
    _purify = window.DOMPurify;
  }

  return configureDOMPurify(_purify);
}

function sanitizeAreaHtml(html) {
  const purify = getDOMPurify();
  if (!purify) {
    if (!_rendererPurifyWarned) {
      _rendererPurifyWarned = true;
      Logger.warn("DOMPurify not available; rendering slide HTML as text");
    }
    return escapeHtml(html);
  }
  return purify.sanitize(html, PURIFY_CONFIG);
}

function _getCustomSingleColumnStyle(layout) {
  const rows = String(layout?.gridTemplateAreas || "")
    .match(/"[^"]*"|'[^']*'/g)
    ?.map((row) => row.slice(1, -1).trim().split(/\s+/).filter(Boolean));
  if (!rows || rows.length !== 3) return null;
  if (!rows[0].every((cell) => cell === "header")) return null;
  if (!rows[1].every((cell) => cell === "main" || cell === ".")) return null;
  if (!rows[1].includes("main")) return null;
  if (!rows[2].every((cell) => cell === "footer")) return null;

  const rowSizes = layout.rowSizes || [];
  const isFocusFooter = (value) => {
    const m = /^([\d.]+)fr$/i.exec(value);
    return m && Math.abs(parseFloat(m[1]) - 0.08) < 0.001;
  };
  return isFocusFooter(rowSizes[2]) ? "focus" : "header-content";
}

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
    const decls = splitCssDeclarations(safeString(cssText))
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

  static sanitizeAreaHtml(html) {
    return sanitizeAreaHtml(html);
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

    if (slide?.layout) {
      wrapper.setAttribute("data-layout", slide.layout);
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

    // Auto-detect full-height areas: areas that appear in every row at the
    // same column. Used for full-height row sizing.
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

    // Apply --code-font-size CSS variable from slide directive or layout definition
    const layoutKey = safeString(slide?.layout)?.trim().toLowerCase();
    const geometryMediaSide = getMediaFullBleedSideFromGrid(layout.gridTemplateAreas);
    const mediaFullBleed = Boolean(slide?.mediaFullBleed);

    let layoutStyleKey = layoutKey;
    let dataLayout = layoutKey;
    let isCustomFocus = false;
    if (layoutKey && !LayoutData.hasLayout(layoutKey)) {
      const customStyle = _getCustomSingleColumnStyle(layout);
      layoutStyleKey = customStyle || "custom";
      isCustomFocus = customStyle === "focus";
      dataLayout = customStyle || "custom";
    }
    const fontSize = slide?.codeFontSize || LayoutData.getCodeFontSize(layoutStyleKey) || 0;
    if (fontSize) {
      grid.style.setProperty("--code-font-size", fontSize + "px");
    }
    if (dataLayout) {
      wrapper.setAttribute("data-layout", dataLayout);
    }
    if (geometryMediaSide && mediaFullBleed) {
      wrapper.setAttribute("data-media-full-bleed", geometryMediaSide);
    }

    grid.style.gridTemplateAreas = layout.gridTemplateAreas;
    grid.style.gridTemplateColumns = layout.gridTemplateColumns;
    grid.style.gridTemplateRows = layout.gridTemplateRows;

    const names = [...layout.orderedAreas];
    for (const extra of areaNamesFromContent) {
      if (!names.includes(extra)) names.push(extra);
    }

    const areaStyle = safeString(slide?.areaStyle);
    const perAreaStyles = slide?.areaStyles || {};

    if (fullHeightAreas.size > 0) {
      grid.classList.add("slide__grid--full-height");
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
      // Areas not in the layout template get auto-placed.  Use explicit
      // full-width placement in a new row instead of grid-area: <name>,
      // which would fill empty '.' cells in existing rows (e.g. the
      // filler columns of the focus layout's ". main ." row).
      if (layoutAreaNames.has(name)) {
        area.style.gridArea = name;
      } else {
        area.style.gridColumn = "1 / -1";
        area.style.gridRow = "auto";
      }
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

      const perAreaBg = perAreaStyles[name];
      if (perAreaBg && name !== "footer") {
        area.style.setProperty("background", perAreaBg);
      }

      area.dataset.appliedAreaStyle = [areaStyle, perAreaBg && `background: ${perAreaBg}`]
        .filter(Boolean)
        .join("; ");

      // Custom focus grids set the main column width via grid tracks, so the
      // per-element line-max cap must be disabled for the main area contents.
      if (isCustomFocus && name === "main") {
        area.style.setProperty("--line-max", "none");
      }

      // Footer spans full width when full-height areas exist — unless the
      // footer already shares its row with one (e.g. media-span grids where
      // the footer row is "footer media" / "media footer"), in which case the
      // forced span would overlap the full-height media column.
      if (fullHeightAreas.size > 0 && name === "footer") {
        const footerRow = allRowCells.find((row) => row.includes("footer")) || [];
        const sharesRowWithFullHeight = footerRow.some((cell) => fullHeightAreas.has(cell));
        if (!sharesRowWithFullHeight) {
          area.style.gridColumn = "1 / -1";
        }
      }

      // Full-height areas meet the slide edge on their border side. This
      // applies to both named media-span layouts and custom grids created by
      // the Span all rows action; media bleed itself remains intent-gated by
      // data-media-full-bleed above.
      if (fullHeightAreas.has(name)) {
        const colIdx = allRowCells[0].indexOf(name);
        if (colIdx === 0) area.style.paddingLeft = "0";
        else if (colIdx === allRowCells[0].length - 1) area.style.paddingRight = "0";
      }

      area.innerHTML = this.sanitizeAreaHtml(html);
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
