/**
 * AiReimagineOutlineModal
 *
 * Shown between the outline and breakdown phases of Reimagine mode. The AI
 * has proposed a plan + chapter outline; the user reviews the high-level
 * structure and makes inline edits to chapters (title, flow tag, summary,
 * reorder, remove, add) before the slide breakdown and generation proceed.
 *
 * Individual slides are not shown — they are produced by a separate AI call
 * after the user finalizes the chapters. The meaningful levers at this stage
 * are the chapter-level narrative arc, ordering, and objectives.
 *
 * Returns a promise that resolves to the edited outline, or null if cancelled.
 */

import { modalOpened, modalClosed } from "./modal-state.js";

const P = "ai-reimagine-outline-modal__";

const FLOW_TAGS = [
  { value: "hook", label: "Hook — grab attention" },
  { value: "context", label: "Context — set the scene" },
  { value: "problem", label: "Problem — identify the gap" },
  { value: "tension", label: "Tension — raise the stakes" },
  { value: "solution", label: "Solution — present the approach" },
  { value: "evidence", label: "Evidence — back it up" },
  { value: "comparison", label: "Comparison — contrast alternatives" },
  { value: "example", label: "Example — show it in action" },
  { value: "transition", label: "Transition — bridge to the next point" },
  { value: "climax", label: "Climax — the key moment" },
  { value: "cta", label: "Call to action — tell them what to do" },
];

/**
 * @typedef {Object} OutlineChapter
 * @property {string} title
 * @property {string} flowTag
 * @property {string} summary
 * @property {number} suggestedSlideCount
 */

/**
 * @typedef {Object} VisualSystemPalette
 * @property {string} base
 * @property {string} surface
 * @property {string} accent
 * @property {string} contrast
 * @property {string} highlight
 */

/**
 * @typedef {Object} VisualSystem
 * @property {VisualSystemPalette} palette
 * @property {{character: string, headline: string, body: string}} typography
 * @property {{density: string, whitespace: string, alignment: string}} composition
 * @property {{role: string, mood: string, treatment: string}} imagery
 * @property {string[]} motifs
 * @property {string[]} contrastRules
 */

/**
 * @typedef {Object} ReimagineOutline
 * @property {string} plan
 * @property {OutlineChapter[]} chapters
 * @property {VisualSystem|null} [visualSystem]
 */

export class AiReimagineOutlineModal {
  /**
   * Show the modal and wait for the user's response.
   * @param {ReimagineOutline} outline
   * @param {object} [opts]
   * @param {number} [opts.sourceCount] — original slide count for the guard display
   * @returns {Promise<ReimagineOutline|null>}
   */
  static show(outline, opts = {}) {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = `${P}backdrop`;

      const sourceCount = opts.sourceCount || 0;
      const minTarget = Math.max(1, Math.round(sourceCount * 0.7));
      const maxTarget = Math.round(sourceCount * 1.2);

      const dialog = document.createElement("div");
      dialog.className = `${P}dialog`;
      dialog.innerHTML = `
        <h2 class="${P}title">Reimagine: Review plan</h2>
        <p class="${P}subtitle">The AI proposed a new direction with a narrative arc. Review the chapter structure below, then generate the full deck.</p>

        <div class="${P}summary-section">
          <div class="${P}field">
            <label class="${P}label" for="${P}plan-input">Plan</label>
            <textarea id="${P}plan-input" class="${P}plan-input" rows="3">${escapeHtml(outline.plan)}</textarea>
          </div>
          ${renderVisualSystemSummary(outline.visualSystem)}
          <div id="${P}stats" class="${P}stats"></div>
        </div>

        <div class="${P}chapters-header">
          <span class="${P}label">Chapters</span>
        </div>
        <div id="${P}chapters-list" class="${P}chapters-list"></div>

        <p class="${P}error" style="color: #e53935; font-size: 0.875rem; min-height: 1.2em; margin: 0;"></p>

        <div class="${P}actions">
          <button type="button" class="${P}btn" data-action="cancel">Cancel</button>
          <button type="button" class="${P}btn ${P}btn--primary" data-action="generate">Generate</button>
        </div>
      `;

      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);
      modalOpened();

      const chaptersList = dialog.querySelector(`#${P}chapters-list`);
      const statsEl = dialog.querySelector(`#${P}stats`);
      const errorEl = dialog.querySelector(`.${P}error`);
      const planInput = dialog.querySelector(`#${P}plan-input`);
      const paletteSelect = dialog.querySelector(`#${P}palette-select`);
      const swatchesEl = dialog.querySelector(`#${P}swatches`);

      // Palette dropdown: update the visual system's palette when a preset is picked.
      if (paletteSelect && outline.visualSystem) {
        paletteSelect.addEventListener("change", () => {
          const name = paletteSelect.value;
          const preset = PALETTE_PRESETS.find((p) => p.name === name);
          if (!preset) return; // "Custom" — no change
          outline.visualSystem.palette = { ...preset.palette };
          if (swatchesEl) {
            swatchesEl.innerHTML = Object.entries(preset.palette)
              .map(
                ([role, color]) =>
                  `<span class="${P}swatch" title="${escapeAttr(role)}: ${escapeAttr(color)}" style="background: ${escapeAttr(color)};"></span>`,
              )
              .join("");
          }
        });
      }

      /** @type {OutlineChapter[]} */
      const chapters = outline.chapters.map((ch) => ({
        title: ch.title,
        flowTag: ch.flowTag || "",
        summary: ch.summary || "",
        suggestedSlideCount: ch.suggestedSlideCount || 1,
      }));

      /**
       * Recompute and render the stats line from the current chapters.
       * Called after every mutation so the soft slide-count warning stays honest.
       */
      const renderStats = () => {
        const totalSuggested = chapters.reduce((sum, ch) => sum + (ch.suggestedSlideCount || 0), 0);
        const inRange =
          sourceCount === 0 || (totalSuggested >= minTarget && totalSuggested <= maxTarget);
        statsEl.innerHTML = `
          <span class="${P}stat">${chapters.length} chapter${chapters.length === 1 ? "" : "s"}</span>
          <span class="${P}stat">${totalSuggested} slide${totalSuggested === 1 ? "" : "s"} planned</span>
          ${
            sourceCount > 0
              ? `<span class="${P}stat ${inRange ? "" : P + "stat--warn"}">target ${minTarget}\u2013${maxTarget} (from ${sourceCount})</span>`
              : ""
          }
        `;
      };

      /**
       * Build the flow-tag <select> element for a chapter.
       * @param {string} selectedTag
       * @returns {string}
       */
      const flowTagOptions = (selectedTag) =>
        FLOW_TAGS.map(
          ({ value, label }) =>
            `<option value="${escapeAttr(value)}"${value === selectedTag ? " selected" : ""}>${escapeHtml(label)}</option>`,
        ).join("");

      /**
       * Render the chapters list with inline editing.
       */
      const renderChapters = () => {
        renderStats();
        chaptersList.innerHTML = "";
        chapters.forEach((chapter, ci) => {
          const chapterEl = document.createElement("div");
          chapterEl.className = `${P}chapter`;
          chapterEl.innerHTML = `
            <div class="${P}chapter-header">
              <select class="${P}flow-tag-select" aria-label="Flow tag">${flowTagOptions(chapter.flowTag)}</select>
              <input type="text" class="${P}chapter-title-input" placeholder="Chapter title" value="${escapeAttr(chapter.title)}" />
              <div class="${P}chapter-actions">
                <button type="button" class="${P}icon-btn" data-action="chapter-up" ${ci === 0 ? "disabled" : ""} aria-label="Move chapter up">\u2191</button>
                <button type="button" class="${P}icon-btn" data-action="chapter-down" ${ci === chapters.length - 1 ? "disabled" : ""} aria-label="Move chapter down">\u2193</button>
                <button type="button" class="${P}icon-btn" data-action="chapter-remove" aria-label="Remove chapter">\u00D7</button>
              </div>
            </div>
            <textarea class="${P}chapter-summary-input" placeholder="Chapter objective \u2014 describe what this chapter covers and how it connects to the narrative arc." rows="3">${escapeHtml(chapter.summary)}</textarea>
          `;

          const titleInput = chapterEl.querySelector(`.${P}chapter-title-input`);
          titleInput.addEventListener("input", (e) => {
            chapters[ci].title = e.target.value;
          });

          const flowTagSelect = chapterEl.querySelector(`.${P}flow-tag-select`);
          flowTagSelect.addEventListener("change", (e) => {
            chapters[ci].flowTag = e.target.value;
          });

          const summaryInput = chapterEl.querySelector(`.${P}chapter-summary-input`);
          summaryInput.addEventListener("input", (e) => {
            chapters[ci].summary = e.target.value;
          });

          chapterEl.querySelector('[data-action="chapter-up"]').addEventListener("click", () => {
            if (ci > 0) {
              [chapters[ci - 1], chapters[ci]] = [chapters[ci], chapters[ci - 1]];
              renderChapters();
            }
          });
          chapterEl.querySelector('[data-action="chapter-down"]').addEventListener("click", () => {
            if (ci < chapters.length - 1) {
              [chapters[ci + 1], chapters[ci]] = [chapters[ci], chapters[ci + 1]];
              renderChapters();
            }
          });
          chapterEl
            .querySelector('[data-action="chapter-remove"]')
            .addEventListener("click", () => {
              chapters.splice(ci, 1);
              renderChapters();
            });

          chaptersList.appendChild(chapterEl);
        });

        // Add chapter button
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = `${P}link-btn ${P}add-chapter-btn`;
        addBtn.textContent = "+ Add new chapter";
        addBtn.addEventListener("click", () => {
          chapters.push({
            title: "",
            flowTag: "context",
            summary: "",
            suggestedSlideCount: 1,
          });
          renderChapters();
        });
        chaptersList.appendChild(addBtn);
      };
      renderChapters();

      // Focus the first chapter title input so keyboard users have an entry point.
      const firstTitleInput = dialog.querySelector(`.${P}chapter-title-input`);
      if (firstTitleInput) firstTitleInput.focus();

      const close = (result) => {
        backdrop.remove();
        modalClosed();
        document.removeEventListener("keydown", onKeydown);
        resolve(result);
      };

      const onKeydown = (e) => {
        if (e.key !== "Escape") return;
        // Don't close the modal while the user is editing an inline input or textarea;
        // let Escape blur the field first so in-progress edits aren't discarded.
        const active = document.activeElement;
        if (
          active &&
          dialog.contains(active) &&
          (active.tagName === "INPUT" ||
            active.tagName === "TEXTAREA" ||
            active.tagName === "SELECT")
        ) {
          active.blur();
          return;
        }
        close(null);
      };

      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) close(null);
      });
      backdrop.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });

      dialog.querySelector('[data-action="cancel"]').addEventListener("click", () => close(null));

      dialog.querySelector('[data-action="generate"]').addEventListener("click", () => {
        // Keep a chapter if it has a title or a summary.
        const hasContent = (ch) => ch.title.trim() !== "" || ch.summary.trim() !== "";
        const filteredChapters = chapters.filter(hasContent);
        if (filteredChapters.length === 0) {
          errorEl.textContent = "Please add at least one chapter before generating.";
          return;
        }

        errorEl.textContent = "";
        const planText = planInput.value.trim() || outline.plan;
        close({
          plan: planText,
          chapters: filteredChapters.map((ch) => ({
            title: ch.title.trim() || "Untitled chapter",
            flowTag: ch.flowTag,
            summary: ch.summary.trim(),
            suggestedSlideCount: ch.suggestedSlideCount || 1,
          })),
          visualSystem: outline.visualSystem ?? null,
        });
      });

      document.addEventListener("keydown", onKeydown);
    });
  }
}

/**
 * Escape a string for use in HTML text content.
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Escape a string for use in an HTML attribute value.
 * @param {string} s
 * @returns {string}
 */
function escapeAttr(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Predefined color palettes the user can pick from the dropdown.
 * Each palette has 5 hex colors matching the visual system palette shape.
 * @type {Array<{name: string, palette: VisualSystemPalette}>}
 */
const PALETTE_PRESETS = [
  {
    name: "Midnight",
    palette: {
      base: "#0f172a",
      surface: "#1e293b",
      accent: "#06b6d4",
      contrast: "#f59e0b",
      highlight: "#ffffff",
    },
  },
  {
    name: "Slate",
    palette: {
      base: "#1e293b",
      surface: "#334155",
      accent: "#38bdf8",
      contrast: "#fb7185",
      highlight: "#f8fafc",
    },
  },
  {
    name: "Ocean",
    palette: {
      base: "#0c4a6e",
      surface: "#075985",
      accent: "#22d3ee",
      contrast: "#fbbf24",
      highlight: "#f0f9ff",
    },
  },
  {
    name: "Forest",
    palette: {
      base: "#14532d",
      surface: "#166534",
      accent: "#84cc16",
      contrast: "#f97316",
      highlight: "#f7fee7",
    },
  },
  {
    name: "Warm Earth",
    palette: {
      base: "#451a03",
      surface: "#7c2d12",
      accent: "#f59e0b",
      contrast: "#dc2626",
      highlight: "#fffbeb",
    },
  },
  {
    name: "Clean Light",
    palette: {
      base: "#f8fafc",
      surface: "#e2e8f0",
      accent: "#2563eb",
      contrast: "#db2777",
      highlight: "#0f172a",
    },
  },
  {
    name: "Minimal",
    palette: {
      base: "#ffffff",
      surface: "#f5f5f5",
      accent: "#171717",
      contrast: "#dc2626",
      highlight: "#262626",
    },
  },
  {
    name: "Plum",
    palette: {
      base: "#2e1065",
      surface: "#4c1d95",
      accent: "#a78bfa",
      contrast: "#facc15",
      highlight: "#faf5ff",
    },
  },
];

/**
 * Find the name of the preset that matches a palette, or "Custom" if none match.
 * @param {VisualSystemPalette} palette
 * @returns {string}
 */
function findPresetName(palette) {
  for (const preset of PALETTE_PRESETS) {
    const p = preset.palette;
    if (
      p.base === palette.base &&
      p.surface === palette.surface &&
      p.accent === palette.accent &&
      p.contrast === palette.contrast &&
      p.highlight === palette.highlight
    ) {
      return preset.name;
    }
  }
  return "Custom";
}

/**
 * Render a compact visual system summary with an editable palette dropdown.
 * Shows palette swatches, a preset dropdown, typography character, composition,
 * imagery mood, and motifs. Returns an empty string when no visual system is present.
 * @param {VisualSystem|null} vs
 * @returns {string}
 */
function renderVisualSystemSummary(vs) {
  if (!vs) return "";
  const swatches = Object.entries(vs.palette)
    .map(
      ([role, color]) =>
        `<span class="${P}swatch" title="${escapeAttr(role)}: ${escapeAttr(color)}" style="background: ${escapeAttr(color)};"></span>`,
    )
    .join("");
  const motifs = vs.motifs.length > 0 ? vs.motifs.join("; ") : "";
  const currentPresetName = findPresetName(vs.palette);
  const presetOptions = [
    `<option value="Custom"${currentPresetName === "Custom" ? " selected" : ""}>Custom</option>`,
    ...PALETTE_PRESETS.map(
      (preset) =>
        `<option value="${escapeAttr(preset.name)}"${currentPresetName === preset.name ? " selected" : ""}>${escapeHtml(preset.name)}</option>`,
    ),
  ].join("");
  return `
    <div class="${P}field">
      <label class="${P}label">Visual system</label>
      <div class="${P}visual-system">
        <div class="${P}swatches" id="${P}swatches">${swatches}</div>
        <select id="${P}palette-select" class="${P}palette-select">${presetOptions}</select>
        <span class="${P}visual-system-detail">${escapeHtml(vs.typography.character)} \u00b7 ${escapeHtml(vs.composition.density)} density \u00b7 ${escapeHtml(vs.imagery.mood)}</span>
        ${motifs ? `<span class="${P}visual-system-detail">${escapeHtml(motifs)}</span>` : ""}
      </div>
    </div>
  `;
}
