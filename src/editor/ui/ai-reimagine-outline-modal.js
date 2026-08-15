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

import { modalOpened, modalClosed } from "../../core/modal-state.js";

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
  { value: "objectives", label: "Objectives — what the audience will learn" },
  { value: "steps", label: "Steps — walk through a process" },
  { value: "practice", label: "Practice — apply or check understanding" },
  { value: "recap", label: "Recap — summarize key points" },
  { value: "assertion", label: "Assertion — state a claim" },
  { value: "implication", label: "Implication — what it means going forward" },
];

/**
 * @typedef {Object} OutlineChapter
 * @property {string} title
 * @property {string} flowTag
 * @property {string} summary
 * @property {number} suggestedSlideCount
 */

/**
 * @typedef {Object} VisualSystem
 * @property {string} visualDirection
 */

/**
 * @typedef {Object} ReimagineOutline
 * @property {string} plan
 * @property {OutlineChapter[]} chapters
 * @property {VisualSystem|null} [visualSystem]
 * @property {number[]} [keepImages]
 */

export class AiReimagineOutlineModal {
  /**
   * Show the modal and wait for the user's response.
   * @param {ReimagineOutline} outline
   * @param {object} [opts]
   * @param {number} [opts.sourceCount] — original slide count for the guard display
   * @param {(plan: string) => Promise<ReimagineOutline|null>} [opts.onRegenerate] —
   *   when provided, a "Regenerate chapters" button is shown that re-runs the
   *   outline AI with the edited plan and replaces the chapters
   * @returns {Promise<ReimagineOutline|null>}
   */
  static show(outline, opts = {}) {
    return new Promise((resolve) => {
      const previousFocus = document.activeElement;
      const backdrop = document.createElement("div");
      backdrop.className = `${P}backdrop`;

      const sourceCount = opts.sourceCount || 0;
      const minTarget = Math.max(1, Math.round(sourceCount * 0.7));
      const maxTarget = Math.round(sourceCount * 1.2);

      const dialog = document.createElement("div");
      dialog.className = `${P}dialog`;
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", `${P}title`);
      // Static structure only — no interpolated content (Hard Rule 6).
      dialog.innerHTML = `
        <div class="${P}header">
          <h2 id="${P}title" class="${P}title">Reimagine: Review plan</h2>
          <p class="${P}subtitle">Review the AI's proposed direction and edit chapters before generating the full deck.</p>
        </div>

        <div class="${P}top-grid">
          <div class="${P}card ${P}plan-card" role="region" aria-label="Creative plan">
            <div class="${P}card-header">
              <label class="${P}label" for="${P}plan-input">Creative plan</label>
            </div>
            <textarea id="${P}plan-input" class="${P}plan-input" rows="3"></textarea>
          </div>

          <div class="${P}card ${P}visual-system-card" role="region" aria-label="Visual direction">
            <div class="${P}card-header">
              <span class="${P}label">Visual direction</span>
            </div>
            <div id="${P}visual-system" class="${P}visual-system" role="region" aria-label="Visual direction details"></div>
          </div>
        </div>

        <div class="${P}chapters-header">
          <span class="${P}label">Chapters</span>
          <div id="${P}stats" class="${P}stats"></div>
        </div>
        <div id="${P}chapters-list" class="${P}chapters-list"></div>

        <p class="${P}error" role="alert" aria-live="polite"></p>

        <div class="${P}actions">
          <button type="button" class="${P}btn" data-action="cancel">Cancel</button>
          <button type="button" class="${P}btn ${P}btn--primary" data-action="generate">Generate</button>
        </div>
      `;

      // Add the optional "Regenerate chapters" button via DOM construction.
      if (opts.onRegenerate) {
        const cardHeader = dialog.querySelector(`.${P}plan-card .${P}card-header`);
        const regenBtn = document.createElement("button");
        regenBtn.type = "button";
        regenBtn.className = `${P}btn ${P}btn--secondary ${P}btn--small`;
        regenBtn.id = `${P}regenerate-btn`;
        regenBtn.title = "Regenerate chapters based on the edited plan";
        regenBtn.textContent = "Regenerate chapters";
        cardHeader.appendChild(regenBtn);
      }

      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);
      modalOpened();

      const chaptersList = dialog.querySelector(`#${P}chapters-list`);
      const statsEl = dialog.querySelector(`#${P}stats`);
      const visualSystemEl = dialog.querySelector(`#${P}visual-system`);
      const errorEl = dialog.querySelector(`.${P}error`);
      const planInput = dialog.querySelector(`#${P}plan-input`);
      const regenerateBtn = dialog.querySelector(`#${P}regenerate-btn`);

      // Set dynamic content via DOM properties (Hard Rule 6).
      planInput.value = outline.plan || "";

      // Working copies of outline metadata so the original outline object is
      // never mutated (regenerate may replace chapters, but not the caller's).
      let visualSystem = outline.visualSystem ?? null;
      let keepImages = outline.keepImages ? [...outline.keepImages] : [];
      let firstSlideIdentity = outline.firstSlideIdentity ?? "";

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

        statsEl.textContent = "";

        const chapterSpan = document.createElement("span");
        chapterSpan.className = `${P}stat`;
        chapterSpan.textContent = `${chapters.length} chapter${chapters.length === 1 ? "" : "s"}`;
        statsEl.appendChild(chapterSpan);

        const slideSpan = document.createElement("span");
        slideSpan.className = `${P}stat`;
        slideSpan.textContent = `${totalSuggested} slide${totalSuggested === 1 ? "" : "s"} planned`;
        statsEl.appendChild(slideSpan);

        if (sourceCount > 0) {
          const targetSpan = document.createElement("span");
          targetSpan.className = `${P}stat ${inRange ? "" : P + "stat--warn"}`;
          targetSpan.textContent = `target ${minTarget}\u2013${maxTarget} (from ${sourceCount})`;
          statsEl.appendChild(targetSpan);
        }
      };

      /**
       * Render the editable visual direction summary.
       */
      const renderVisualSystem = () => {
        visualSystemEl.textContent = "";
        if (!visualSystem) {
          const empty = document.createElement("p");
          empty.className = `${P}visual-system-empty`;
          empty.textContent = "No visual direction provided.";
          visualSystemEl.appendChild(empty);
          return;
        }

        const section = document.createElement("div");
        section.className = `${P}visual-system-section`;

        const textarea = document.createElement("textarea");
        textarea.id = `${P}visual-direction-input`;
        textarea.className = `${P}visual-direction-input`;
        textarea.rows = 4;
        textarea.value = visualSystem.visualDirection || "";

        textarea.addEventListener("input", (e) => {
          visualSystem.visualDirection = e.target.value;
        });

        section.appendChild(textarea);
        visualSystemEl.appendChild(section);
      };

      /**
       * Build the flow-tag <select> element for a chapter.
       * @param {string} selectedTag
       * @returns {HTMLSelectElement}
       */
      const buildFlowTagSelect = (selectedTag) => {
        const select = document.createElement("select");
        select.className = `${P}flow-tag-select`;
        select.setAttribute("aria-label", "Flow tag");
        for (const { value, label } of FLOW_TAGS) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = label;
          if (value === selectedTag) option.selected = true;
          select.appendChild(option);
        }
        return select;
      };

      /**
       * Render the chapters list with inline editing.
       */
      const renderChapters = () => {
        renderStats();
        chaptersList.innerHTML = "";
        chapters.forEach((chapter, ci) => {
          const chapterEl = document.createElement("div");
          chapterEl.className = `${P}chapter`;

          // Static structure only — no interpolated content (Hard Rule 6).
          chapterEl.innerHTML = `
            <div class="${P}chapter-header">
              <div class="${P}flow-tag-slot"></div>
              <input type="text" class="${P}chapter-title-input" placeholder="Chapter title" />
              <div class="${P}chapter-actions">
                <button type="button" class="${P}icon-btn" data-action="chapter-up" ${ci === 0 ? "disabled" : ""} aria-label="Move chapter up">\u2191</button>
                <button type="button" class="${P}icon-btn" data-action="chapter-down" ${ci === chapters.length - 1 ? "disabled" : ""} aria-label="Move chapter down">\u2193</button>
                <button type="button" class="${P}icon-btn" data-action="chapter-remove" aria-label="Remove chapter">\u00D7</button>
              </div>
            </div>
            <textarea class="${P}chapter-summary-input" placeholder="Chapter objective \u2014 describe what this chapter covers and how it connects to the narrative arc." rows="3"></textarea>
          `;

          // Insert the flow-tag select via DOM construction.
          const flowTagSlot = chapterEl.querySelector(`.${P}flow-tag-slot`);
          const flowTagSelect = buildFlowTagSelect(chapter.flowTag);
          flowTagSlot.replaceWith(flowTagSelect);

          // Set dynamic content via DOM properties (Hard Rule 6).
          const titleInput = chapterEl.querySelector(`.${P}chapter-title-input`);
          titleInput.value = chapter.title || "";

          const summaryInput = chapterEl.querySelector(`.${P}chapter-summary-input`);
          summaryInput.value = chapter.summary || "";
          titleInput.addEventListener("input", (e) => {
            chapters[ci].title = e.target.value;
          });

          flowTagSelect.addEventListener("change", (e) => {
            chapters[ci].flowTag = e.target.value;
          });

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
      renderVisualSystem();

      // Regenerate chapters: re-run the outline AI with the edited plan.
      if (regenerateBtn && opts.onRegenerate) {
        regenerateBtn.addEventListener("click", async () => {
          const newPlan = planInput.value.trim();
          if (!newPlan) {
            errorEl.textContent = "Enter a plan before regenerating.";
            return;
          }
          errorEl.textContent = "";
          regenerateBtn.disabled = true;
          regenerateBtn.textContent = "Regenerating\u2026";
          try {
            const newOutline = await opts.onRegenerate(newPlan);
            if (newOutline) {
              // Apply regenerated values to working copies, not the original outline.
              if (newOutline.visualSystem) visualSystem = newOutline.visualSystem;
              if (newOutline.keepImages) keepImages = [...newOutline.keepImages];
              if (newOutline.firstSlideIdentity !== undefined)
                firstSlideIdentity = newOutline.firstSlideIdentity;
              // Re-render chapters and stats
              chapters.length = 0;
              for (const ch of newOutline.chapters) {
                chapters.push({
                  title: ch.title,
                  flowTag: ch.flowTag || "",
                  summary: ch.summary || "",
                  suggestedSlideCount: ch.suggestedSlideCount || 1,
                });
              }
              renderChapters();
              renderStats();
              renderVisualSystem();
              planInput.value = newOutline.plan;
            }
          } catch (err) {
            errorEl.textContent = err?.message || "Regeneration failed.";
          } finally {
            regenerateBtn.disabled = false;
            regenerateBtn.textContent = "Regenerate chapters";
          }
        });
      }

      // Focus the plan input so keyboard users have an entry point at the top
      // of the dialog.  Focusing an element below the fold (e.g. a chapter
      // title) would cause the browser to scroll the dialog down, making the
      // modal open with the scrollbar at the bottom instead of the top.
      requestAnimationFrame(() => {
        dialog.scrollTop = 0;
        planInput.focus();
        planInput.setSelectionRange(planInput.value.length, planInput.value.length);
      });

      const onKeydown = (e) => {
        if (e.key === "Escape") {
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
          return;
        }

        // Focus trap: keep Tab/Shift+Tab cycling within the dialog.
        if (e.key === "Tab") {
          const focusable = dialog.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          );
          const visible = Array.from(focusable).filter(
            (el) => el.offsetParent !== null || el === document.activeElement,
          );
          if (visible.length === 0) return;
          const first = visible[0];
          const last = visible[visible.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };

      // Track where a click sequence started (mousedown) so we don't close the
      // modal when the user drags a resizable textarea outside the dialog and
      // releases the mouse over the backdrop.
      let clickStartTarget = null;

      const onBackdropMouseDown = (e) => {
        clickStartTarget = e.target;
      };

      const onBackdropClick = (e) => {
        if (e.target !== backdrop) return;
        if (
          clickStartTarget &&
          clickStartTarget !== backdrop &&
          dialog.contains(clickStartTarget)
        ) {
          // Drag ended on the backdrop but began inside the dialog (e.g. resize handle drag).
          return;
        }
        close(null);
      };

      const onBackdropWheel = (e) => e.stopPropagation();

      const close = (result) => {
        backdrop.removeEventListener("mousedown", onBackdropMouseDown);
        backdrop.removeEventListener("click", onBackdropClick);
        backdrop.removeEventListener("wheel", onBackdropWheel);
        backdrop.remove();
        modalClosed();
        document.removeEventListener("keydown", onKeydown);
        // Restore focus to the element that was focused before the modal opened.
        if (previousFocus && typeof previousFocus.focus === "function") {
          previousFocus.focus();
        }
        resolve(result);
      };

      backdrop.addEventListener("mousedown", onBackdropMouseDown);
      backdrop.addEventListener("click", onBackdropClick);
      backdrop.addEventListener("wheel", onBackdropWheel, { passive: true });

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

        if (visualSystem) {
          if (!visualSystem.visualDirection.trim()) {
            errorEl.textContent = "Please add a visual direction.";
            return;
          }
        }

        const planText = planInput.value.trim() || outline.plan;
        close({
          plan: planText,
          chapters: filteredChapters.map((ch) => ({
            title: ch.title.trim() || "Untitled chapter",
            flowTag: ch.flowTag,
            summary: ch.summary.trim(),
            suggestedSlideCount: ch.suggestedSlideCount || 1,
          })),
          visualSystem,
          keepImages,
          firstSlideIdentity,
        });
      });

      document.addEventListener("keydown", onKeydown);
    });
  }
}
