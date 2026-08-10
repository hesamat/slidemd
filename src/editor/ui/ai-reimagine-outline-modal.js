/**
 * AiReimagineOutlineModal
 *
 * Shown between the outline and generate phases of Reimagine mode. The AI
 * has proposed a brief + flow summary + chapter-grouped outline; the user
 * reviews the high-level structure, can expand chapters to see slides, and
 * make inline edits to chapters (title, summary, reorder, remove, add)
 * before generation proceeds.
 *
 * Per-slide editing is intentionally not exposed — the slide titles and
 * intents are brief descriptions, not content, and the meaningful levers
 * are at the chapter level (narrative arc, ordering, summaries).
 *
 * Returns a promise that resolves to the edited outline, or null if cancelled.
 */

const P = "ai-reimagine-outline-modal__";

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
        <p class="${P}subtitle">The AI proposed a new direction with a narrative arc. Review the chapter structure below, then generate the full deck.</p>

        <div class="${P}summary-section">
          <div class="${P}field">
            <label class="${P}label">Plan</label>
            <p class="${P}plan-text">${escapeHtml(outline.plan)}</p>
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
      const errorEl = dialog.querySelector(`.${P}error`);

      /** @type {OutlineChapter[]} */
      const chapters = outline.chapters.map((ch) => ({
        title: ch.title,
        flowTag: ch.flowTag || "",
        summary: ch.summary || "",
        slides: ch.slides.map((s) => ({ title: s.title, intent: s.intent })),
      }));

      /**
       * Render the chapters list with inline editing.
       */
      const renderChapters = () => {
        chaptersList.innerHTML = "";
        chapters.forEach((chapter, ci) => {
          const chapterEl = document.createElement("div");
          chapterEl.className = `${P}chapter`;
          chapterEl.innerHTML = `
            <div class="${P}chapter-header">
              <span class="${P}flow-badge ${P}flow-badge--${chapter.flowTag || "default"}">${chapter.flowTag || "\u2014"}</span>
              <input type="text" class="${P}chapter-title-input" placeholder="Chapter title" value="${escapeAttr(chapter.title)}" />
              <span class="${P}chapter-count">${chapter.slides.length} slide${chapter.slides.length === 1 ? "" : "s"}</span>
              <div class="${P}chapter-actions">
                <button type="button" class="${P}icon-btn" data-action="chapter-up" ${ci === 0 ? "disabled" : ""}>\u2191</button>
                <button type="button" class="${P}icon-btn" data-action="chapter-down" ${ci === chapters.length - 1 ? "disabled" : ""}>\u2193</button>
                <button type="button" class="${P}icon-btn" data-action="chapter-remove">\u00D7</button>
                <span class="${P}chapter-chevron">\u25B6</span>
              </div>
            </div>
            <div class="${P}chapter-body" hidden>
              <input type="text" class="${P}chapter-summary-input" placeholder="Chapter summary" value="${escapeAttr(chapter.summary)}" />
              <div class="${P}slides-readonly"></div>
            </div>
          `;

          const titleInput = chapterEl.querySelector(`.${P}chapter-title-input`);
          titleInput.addEventListener("input", (e) => {
            chapters[ci].title = e.target.value;
          });

          const summaryInput = chapterEl.querySelector(`.${P}chapter-summary-input`);
          summaryInput.addEventListener("input", (e) => {
            chapters[ci].summary = e.target.value;
          });

          // Expand/collapse on chevron click
          const chevron = chapterEl.querySelector(`.${P}chapter-chevron`);
          const body = chapterEl.querySelector(`.${P}chapter-body`);
          chevron.addEventListener("click", () => {
            const expanded = !body.hidden;
            body.hidden = expanded;
            chevron.textContent = expanded ? "\u25B6" : "\u25BC";
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

          // Read-only slide list
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
            slides: [{ title: "", intent: "" }],
          });
          renderChapters();
        });
        chaptersList.appendChild(addBtn);
      };
      renderChapters();

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

      dialog.querySelector('[data-action="generate"]').addEventListener("click", () => {
        // Filter out empty chapters
        const filteredChapters = chapters.filter((ch) => ch.title.trim());
        if (filteredChapters.length === 0) {
          errorEl.textContent = "Please add at least one chapter before generating.";
          return;
        }

        errorEl.textContent = "";
        close({
          plan: outline.plan,
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
