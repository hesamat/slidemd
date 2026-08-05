/**
 * AiGenerateModal
 *
 * Pre-flight modal shown before running "Inspired Deck" (whole-deck generate).
 * Lets the user set options (agenda, target slide count, tone) and see an
 * estimated cost before committing to the AI call. The user can cancel to
 * avoid any API charges.
 *
 * Returns a promise that resolves to the user's options, or null if cancelled.
 */

import { estimateTokens } from "../../data/ai/ai-token-estimator.js";
import { splitSlidesForAi, BATCH_SIZE } from "../../data/ai/ai-prompt-builder.js";

const P = "ai-generate-modal__";

/**
 * @typedef {Object} GenerateOptions
 * @property {string} agenda — user-provided topic/agenda guidance
 * @property {number|null} targetSlideCount — desired number of slides, or null for "let AI decide"
 * @property {string} tone — "default" | "formal" | "casual" | "technical"
 */

export class AiGenerateModal {
  /**
   * Show the modal and wait for the user's response.
   * @param {string} markdown — the current deck markdown (for cost estimation)
   * @param {object} [opts]
   * @param {string} [opts.modelName] — for display
   * @param {boolean} [opts.useReasoning] — for cost estimation
   * @returns {Promise<GenerateOptions|null>}
   */
  static show(markdown, opts = {}) {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = `${P}backdrop`;

      const slideCount = splitSlidesForAi(markdown, "generate").length;
      const inputTokens = estimateTokens(markdown);
      const batchCount = Math.max(1, Math.ceil(slideCount / BATCH_SIZE));
      const estOutputTokens = Math.ceil(inputTokens * 1.8);
      const totalEstTokens = (inputTokens + estOutputTokens) * batchCount;

      const dialog = document.createElement("div");
      dialog.className = `${P}dialog`;
      dialog.innerHTML = `
        <h2 class="${P}title">AI Inspired Deck</h2>
        <p class="${P}subtitle">The AI will reorganize and redesign your entire presentation. Adjust options below, then click Generate to start.</p>

        <div class="${P}field">
          <label class="${P}label" for="${P}agenda">Agenda / topic guidance <span class="${P}optional">(optional)</span></label>
          <textarea id="${P}agenda" class="${P}textarea" rows="3" placeholder="e.g. Focus on Q3 results, customer growth, and the roadmap ahead"></textarea>
        </div>

        <div class="${P}row">
          <div class="${P}field">
            <label class="${P}label" for="${P}slideCount">Target slide count</label>
            <select id="${P}slideCount" class="${P}select">
              <option value="">Let AI decide</option>
              <option value="5">~5 slides</option>
              <option value="10">~10 slides</option>
              <option value="15">~15 slides</option>
              <option value="20">~20 slides</option>
            </select>
          </div>
          <div class="${P}field">
            <label class="${P}label" for="${P}tone">Tone</label>
            <select id="${P}tone" class="${P}select">
              <option value="default">Default</option>
              <option value="formal">Formal</option>
              <option value="casual">Casual</option>
              <option value="technical">Technical</option>
            </select>
          </div>
        </div>

        <div class="${P}cost">
          <div class="${P}cost-row">
            <span>Current slides</span>
            <span>${slideCount}</span>
          </div>
          <div class="${P}cost-row">
            <span>Estimated API calls</span>
            <span>${batchCount}</span>
          </div>
          <div class="${P}cost-row">
            <span>Estimated tokens</span>
            <span>~${totalEstTokens.toLocaleString()}</span>
          </div>
          ${opts.modelName ? `<div class="${P}cost-row"><span>Model</span><span>${opts.modelName}</span></div>` : ""}
          ${opts.useReasoning ? `<div class="${P}cost-row ${P}cost-row--warn"><span>Reasoning</span><span>Enabled (higher cost)</span></div>` : ""}
        </div>

        <div class="${P}actions">
          <button type="button" class="${P}btn" data-action="cancel">Cancel</button>
          <button type="button" class="${P}btn ${P}btn--primary" data-action="generate">Generate</button>
        </div>
      `;

      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);

      const close = (result) => {
        backdrop.remove();
        document.removeEventListener("keydown", onKeydown);
        resolve(result);
      };

      const onKeydown = (e) => {
        if (e.key === "Escape") {
          close(null);
        }
      };

      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) close(null);
      });

      dialog.querySelector('[data-action="cancel"]').addEventListener("click", () => close(null));

      dialog.querySelector('[data-action="generate"]').addEventListener("click", () => {
        const agenda = dialog.querySelector(`#${P}agenda`).value.trim();
        const slideCountVal = dialog.querySelector(`#${P}slideCount`).value;
        const tone = dialog.querySelector(`#${P}tone`).value;
        close({
          agenda,
          targetSlideCount: slideCountVal ? parseInt(slideCountVal, 10) : null,
          tone,
        });
      });

      document.addEventListener("keydown", onKeydown);

      // Focus the agenda field
      dialog.querySelector(`#${P}agenda`).focus();
    });
  }
}
