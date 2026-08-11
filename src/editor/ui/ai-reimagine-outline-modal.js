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
 * @typedef {Object} ReimagineOutline
 * @property {string} plan
 * @property {OutlineChapter[]} chapters
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
            <label class="${P}label">Plan</label>
            <p class="${P}plan-text">${escapeHtml(outline.plan)}</p>
          </div>
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

      const chaptersList = dialog.querySelector(`#${P}chapters-list`);
      const statsEl = dialog.querySelector(`#${P}stats`);
      const errorEl = dialog.querySelector(`.${P}error`);

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
        close({
          plan: outline.plan,
          chapters: filteredChapters.map((ch) => ({
            title: ch.title.trim() || "Untitled chapter",
            flowTag: ch.flowTag,
            summary: ch.summary.trim(),
            suggestedSlideCount: ch.suggestedSlideCount || 1,
          })),
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
