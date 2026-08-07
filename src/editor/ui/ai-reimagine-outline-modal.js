/**
 * AiReimagineOutlineModal
 *
 * Shown between the outline and generate phases of Reimagine mode. The AI
 * has proposed a brief + flow summary + chapter-grouped outline; the user
 * reviews the high-level structure, can expand chapters to see slides, and
 * toggles into edit mode to make changes before generation proceeds.
 *
 * Returns a promise that resolves to the edited outline, or null if cancelled.
 */

const P = "ai-reimagine-outline-modal__";

const FLOW_TAGS = [
  "hook",
  "context",
  "problem",
  "tension",
  "solution",
  "evidence",
  "comparison",
  "example",
  "transition",
  "climax",
  "cta",
];

/**
 * @typedef {Object} OutlineSlide
 * @property {string} title
 * @property {string} intent
 */

/**
 * @typedef {Object} OutlineChapter
 * @property {string} title
 * @property {string} flowTag
 * @property {string} summary
 * @property {OutlineSlide[]} slides
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
      const totalSlides = outline.chapters.reduce((sum, ch) => sum + (ch.slides?.length || 0), 0);
      const minTarget = Math.max(1, Math.round(sourceCount * 0.7));
      const maxTarget = Math.round(sourceCount * 1.2);
      const inRange = sourceCount === 0 || (totalSlides >= minTarget && totalSlides <= maxTarget);

      const dialog = document.createElement("div");
      dialog.className = `${P}dialog`;
      dialog.innerHTML = `
        <h2 class="${P}title">Reimagine: Review plan</h2>
        <p class="${P}subtitle">The AI proposed a new direction with a narrative arc. Review the plan and chapter structure below, then continue to generate the full deck.</p>

        <div class="${P}summary-section">
          <div class="${P}field">
            <label class="${P}label" for="${P}plan">Plan</label>
            <textarea id="${P}plan" class="${P}textarea" rows="3"></textarea>
          </div>
          <div class="${P}stats">
            <span class="${P}stat">${outline.chapters.length} chapters</span>
            <span class="${P}stat">${totalSlides} slides</span>
            ${
              sourceCount > 0
                ? `<span class="${P}stat ${inRange ? "" : P + "stat--warn"}">target ${minTarget}\u2013${maxTarget} (from ${sourceCount})</span>`
                : ""
            }
          </div>
        </div>

        <div class="${P}chapters-header">
          <span class="${P}label">Chapters</span>
          <button type="button" class="${P}link-btn" data-action="toggle-edit">Edit</button>
        </div>
        <div id="${P}chapters-list" class="${P}chapters-list"></div>

        <p class="${P}error" style="color: #e53935; font-size: 0.875rem; min-height: 1.2em; margin: 0;"></p>

        <div class="${P}actions">
          <button type="button" class="${P}btn" data-action="cancel">Cancel</button>
          <button type="button" class="${P}btn ${P}btn--primary" data-action="continue">Continue</button>
        </div>
      `;

      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);

      const planTextarea = dialog.querySelector(`#${P}plan`);
      const chaptersList = dialog.querySelector(`#${P}chapters-list`);
      const editToggleBtn = dialog.querySelector('[data-action="toggle-edit"]');
      const errorEl = dialog.querySelector(`.${P}error`);

      planTextarea.value = outline.plan;

      /** @type {OutlineChapter[]} */
      const chapters = outline.chapters.map((ch) => ({
        title: ch.title,
        flowTag: ch.flowTag || "",
        summary: ch.summary || "",
        slides: ch.slides.map((s) => ({ title: s.title, intent: s.intent })),
      }));

      let editMode = false;

      /**
       * Render the chapters list.
       */
      const renderChapters = () => {
        chaptersList.innerHTML = "";
        chapters.forEach((chapter, ci) => {
          const chapterEl = document.createElement("div");
          chapterEl.className = `${P}chapter`;

          if (editMode) {
            chapterEl.classList.add(`${P}chapter-edit`);
            chapterEl.innerHTML = `
              <div class="${P}chapter-edit-header">
                <select class="${P}flow-tag-select">
                  ${FLOW_TAGS.map(
                    (t) =>
                      `<option value="${t}" ${t === chapter.flowTag ? "selected" : ""}>${t}</option>`,
                  ).join("")}
                </select>
                <input type="text" class="${P}chapter-title-input" placeholder="Chapter title" value="${escapeAttr(chapter.title)}" />
                <div class="${P}chapter-actions">
                  <button type="button" class="${P}icon-btn" data-action="chapter-up" ${ci === 0 ? "disabled" : ""}>\u2191</button>
                  <button type="button" class="${P}icon-btn" data-action="chapter-down" ${ci === chapters.length - 1 ? "disabled" : ""}>\u2193</button>
                  <button type="button" class="${P}icon-btn" data-action="chapter-remove">\u00D7</button>
                </div>
              </div>
              <input type="text" class="${P}chapter-summary-input" placeholder="Chapter summary" value="${escapeAttr(chapter.summary)}" />
              <div class="${P}slides-list"></div>
              <button type="button" class="${P}link-btn" data-action="add-slide">+ Add slide to chapter</button>
            `;

            const titleInput = chapterEl.querySelector(`.${P}chapter-title-input`);
            titleInput.addEventListener("input", (e) => {
              chapters[ci].title = e.target.value;
            });

            const summaryInput = chapterEl.querySelector(`.${P}chapter-summary-input`);
            summaryInput.addEventListener("input", (e) => {
              chapters[ci].summary = e.target.value;
            });

            const tagSelect = chapterEl.querySelector(`.${P}flow-tag-select`);
            tagSelect.addEventListener("change", (e) => {
              chapters[ci].flowTag = e.target.value;
            });

            chapterEl.querySelector('[data-action="chapter-up"]').addEventListener("click", () => {
              if (ci > 0) {
                [chapters[ci - 1], chapters[ci]] = [chapters[ci], chapters[ci - 1]];
                renderChapters();
              }
            });
            chapterEl
              .querySelector('[data-action="chapter-down"]')
              .addEventListener("click", () => {
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

            const slidesList = chapterEl.querySelector(`.${P}slides-list`);
            chapter.slides.forEach((slide, si) => {
              const slideEl = document.createElement("div");
              slideEl.className = `${P}slide-edit`;
              slideEl.innerHTML = `
                <input type="text" class="${P}slide-title-input" placeholder="Slide title" value="${escapeAttr(slide.title)}" />
                <input type="text" class="${P}slide-intent-input" placeholder="What this slide should accomplish" value="${escapeAttr(slide.intent)}" />
                <div class="${P}slide-actions">
                  <button type="button" class="${P}icon-btn" data-action="slide-up" ${si === 0 ? "disabled" : ""}>\u2191</button>
                  <button type="button" class="${P}icon-btn" data-action="slide-down" ${si === chapter.slides.length - 1 ? "disabled" : ""}>\u2193</button>
                  <button type="button" class="${P}icon-btn" data-action="slide-remove">\u00D7</button>
                </div>
              `;
              slideEl.querySelector(`.${P}slide-title-input`).addEventListener("input", (e) => {
                chapters[ci].slides[si].title = e.target.value;
              });
              slideEl.querySelector(`.${P}slide-intent-input`).addEventListener("input", (e) => {
                chapters[ci].slides[si].intent = e.target.value;
              });
              slideEl.querySelector('[data-action="slide-up"]').addEventListener("click", () => {
                if (si > 0) {
                  [chapters[ci].slides[si - 1], chapters[ci].slides[si]] = [
                    chapters[ci].slides[si],
                    chapters[ci].slides[si - 1],
                  ];
                  renderChapters();
                }
              });
              slideEl.querySelector('[data-action="slide-down"]').addEventListener("click", () => {
                if (si < chapters[ci].slides.length - 1) {
                  [chapters[ci].slides[si + 1], chapters[ci].slides[si]] = [
                    chapters[ci].slides[si],
                    chapters[ci].slides[si + 1],
                  ];
                  renderChapters();
                }
              });
              slideEl
                .querySelector('[data-action="slide-remove"]')
                .addEventListener("click", () => {
                  chapters[ci].slides.splice(si, 1);
                  renderChapters();
                });
              slidesList.appendChild(slideEl);
            });

            chapterEl.querySelector('[data-action="add-slide"]').addEventListener("click", () => {
              chapters[ci].slides.push({ title: "", intent: "" });
              renderChapters();
            });
          } else {
            // Read-only view: collapsible chapter with flow badge
            chapterEl.innerHTML = `
              <div class="${P}chapter-header">
                <span class="${P}flow-badge ${P}flow-badge--${chapter.flowTag || "default"}">${chapter.flowTag || "\u2014"}</span>
                <span class="${P}chapter-title">${escapeHtml(chapter.title)}</span>
                <span class="${P}chapter-count">${chapter.slides.length} slide${chapter.slides.length === 1 ? "" : "s"}</span>
                <span class="${P}chapter-chevron">\u25B6</span>
              </div>
              <div class="${P}chapter-body" hidden>
                <p class="${P}chapter-summary">${escapeHtml(chapter.summary)}</p>
                <div class="${P}slides-readonly"></div>
              </div>
            `;

            const header = chapterEl.querySelector(`.${P}chapter-header`);
            const body = chapterEl.querySelector(`.${P}chapter-body`);
            const chevron = chapterEl.querySelector(`.${P}chapter-chevron`);
            header.addEventListener("click", () => {
              const expanded = !body.hidden;
              body.hidden = expanded;
              chevron.textContent = expanded ? "\u25B6" : "\u25BC";
            });

            const slidesContainer = chapterEl.querySelector(`.${P}slides-readonly`);
            chapter.slides.forEach((slide, si) => {
              const slideEl = document.createElement("div");
              slideEl.className = `${P}slide-readonly`;
              slideEl.innerHTML = `
                <span class="${P}slide-index">${si + 1}</span>
                <span class="${P}slide-title-readonly">${escapeHtml(slide.title)}</span>
                <span class="${P}slide-intent-readonly">${escapeHtml(slide.intent)}</span>
              `;
              slidesContainer.appendChild(slideEl);
            });
          }

          chaptersList.appendChild(chapterEl);
        });

        // Add chapter button in edit mode
        if (editMode) {
          const addBtn = document.createElement("button");
          addBtn.type = "button";
          addBtn.className = `${P}link-btn ${P}add-chapter-btn`;
          addBtn.textContent = "+ Add new chapter";
          addBtn.addEventListener("click", () => {
            chapters.push({
              title: "",
              flowTag: "context",
              summary: "",
              slides: [{ title: "", intent: "" }],
            });
            renderChapters();
          });
          chaptersList.appendChild(addBtn);
        }
      };
      renderChapters();

      editToggleBtn.addEventListener("click", () => {
        editMode = !editMode;
        editToggleBtn.textContent = editMode ? "Done editing" : "Edit";
        renderChapters();
      });

      const close = (result) => {
        backdrop.remove();
        document.removeEventListener("keydown", onKeydown);
        resolve(result);
      };

      const onKeydown = (e) => {
        if (e.key === "Escape") close(null);
      };

      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) close(null);
      });
      backdrop.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });

      dialog.querySelector('[data-action="cancel"]').addEventListener("click", () => close(null));

      dialog.querySelector('[data-action="continue"]').addEventListener("click", () => {
        // Filter out empty chapters and slides
        const filteredChapters = chapters
          .map((ch) => ({
            ...ch,
            slides: ch.slides.filter((s) => s.title.trim() || s.intent.trim()),
          }))
          .filter((ch) => ch.slides.length > 0);
        if (filteredChapters.length === 0) {
          errorEl.textContent = "Please add at least one chapter with a slide before continuing.";
          return;
        }
        errorEl.textContent = "";
        close({
          plan: planTextarea.value.trim(),
          chapters: filteredChapters.map((ch) => ({
            title: ch.title.trim(),
            flowTag: ch.flowTag,
            summary: ch.summary.trim(),
            slides: ch.slides.map((s) => ({
              title: s.title.trim(),
              intent: s.intent.trim(),
            })),
          })),
        });
      });

      document.addEventListener("keydown", onKeydown);
      planTextarea.focus();
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
  return escapeHtml(s).replace(/"/g, "&quot;");
}
