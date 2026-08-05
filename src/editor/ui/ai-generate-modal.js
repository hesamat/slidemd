/**
 * AiGenerateModal
 *
 * Pre-flight modal shown before running "Inspired Deck" (whole-deck generate).
 * Lets the user set options (agenda, target slide count, fidelity, tone) and
 * see an estimated cost before committing to the AI call. The user can cancel
 * to avoid any API charges.
 *
 * Returns a promise that resolves to the user's options, or null if cancelled.
 */

import { estimateTokens } from "../../data/ai/ai-token-estimator.js";
import { splitSlidesForAi, BATCH_SIZE } from "../../data/ai/ai-prompt-builder.js";

const P = "ai-generate-modal__";

/**
 * @typedef {Object} GenerateOptions
 * @property {string} agenda — user-provided or AI-generated topic/agenda guidance
 * @property {number|null} targetSlideCount — desired number of slides, or null for "let AI decide"
 * @property {string} fidelity — "conservative" | "balanced" | "creative"
 * @property {string} tone — "default" | "formal" | "casual" | "technical"
 */

export class AiGenerateModal {
  /**
   * Show the modal and wait for the user's response.
   * @param {string} markdown — the current deck markdown (for cost estimation)
   * @param {object} [opts]
   * @param {() => Promise<void>} [opts.onOpenSettings] — callback to open Settings modal
   * @param {() => Promise<string|null>} [opts.onGenerateAgenda] — callback to AI-generate agenda
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

      // Proportionate slide count options based on current deck
      const half = Math.max(1, Math.round(slideCount / 2));
      const oneHalf = Math.round(slideCount * 1.5);
      const double = slideCount * 2;

      const dialog = document.createElement("div");
      dialog.className = `${P}dialog`;
      dialog.innerHTML = `
        <h2 class="${P}title">AI Inspired Deck</h2>
        <p class="${P}subtitle">The AI will reorganize and redesign your entire presentation. Adjust options below, then click Generate to start.</p>

        <div class="${P}field">
          <div class="${P}label-row">
            <label class="${P}label" for="${P}agenda">Agenda / topic guidance <span class="${P}optional">(optional)</span></label>
            <button type="button" class="${P}link-btn" data-action="generate-agenda" title="Use AI to draft an agenda from your deck content">Generate agenda</button>
          </div>
          <textarea id="${P}agenda" class="${P}textarea" rows="3" placeholder="e.g. Focus on Q3 results, customer growth, and the roadmap ahead"></textarea>
        </div>

        <div class="${P}row">
          <div class="${P}field">
            <label class="${P}label" for="${P}slideCount">Target slide count</label>
            <select id="${P}slideCount" class="${P}select">
              <option value="">Let AI decide</option>
              <option value="${slideCount}">Same (~${slideCount})</option>
              <option value="${half}">Fewer (~${half})</option>
              <option value="${oneHalf}">More (~${oneHalf})</option>
              <option value="${double}">Much more (~${double})</option>
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

        <div class="${P}field">
          <label class="${P}label" for="${P}fidelity">How close to the current deck?</label>
          <select id="${P}fidelity" class="${P}select">
            <option value="conservative">Conservative — keep structure, fix formatting</option>
            <option value="balanced" selected>Balanced — reorganize for clarity</option>
            <option value="creative">Creative — full redesign freedom</option>
          </select>
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
          <div class="${P}cost-row" id="${P}model-row">
            <span>Model</span>
            <span class="${P}model-display">
              <span id="${P}model-name">${opts.modelName || "Not configured"}</span>
              ${opts.onOpenSettings ? `<button type="button" class="${P}link-btn" data-action="open-settings">Change</button>` : ""}
            </span>
          </div>
          <div class="${P}cost-row" id="${P}reasoning-row" ${!opts.useReasoning ? 'style="display:none"' : ""}>
            <span>Reasoning</span>
            <span class="${P}cost-warn">Enabled (higher cost)</span>
          </div>
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

      // Prevent wheel scroll from reaching the slide deck behind the modal
      const onWheel = (e) => {
        e.stopPropagation();
      };

      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) close(null);
      });

      backdrop.addEventListener("wheel", onWheel, { passive: true });

      dialog.querySelector('[data-action="cancel"]').addEventListener("click", () => close(null));

      dialog.querySelector('[data-action="generate"]').addEventListener("click", () => {
        const agenda = dialog.querySelector(`#${P}agenda`).value.trim();
        const slideCountVal = dialog.querySelector(`#${P}slideCount`).value;
        const tone = dialog.querySelector(`#${P}tone`).value;
        const fidelity =
          dialog.querySelector(`#${P}fidelity`).value || "balanced";
        close({
          agenda,
          targetSlideCount: slideCountVal ? parseInt(slideCountVal, 10) : null,
          tone,
          fidelity,
        });
      });

      // Open Settings to change model
      const settingsBtn = dialog.querySelector('[data-action="open-settings"]');
      if (settingsBtn && opts.onOpenSettings) {
        settingsBtn.addEventListener("click", async () => {
          await opts.onOpenSettings();
          // Update model display after settings change
          if (opts.getModelName) {
            const newName = opts.getModelName();
            dialog.querySelector(`#${P}model-name`).textContent = newName;
            // Update reasoning display
            const reasoningRow = dialog.querySelector(`#${P}reasoning-row`);
            if (opts.getReasoning) {
              reasoningRow.style.display = opts.getReasoning() ? "" : "none";
            }
          }
        });
      }

      // AI-generate agenda
      const agendaBtn = dialog.querySelector('[data-action="generate-agenda"]');
      if (agendaBtn && opts.onGenerateAgenda) {
        agendaBtn.addEventListener("click", async () => {
          const agendaEl = dialog.querySelector(`#${P}agenda`);
          agendaBtn.disabled = true;
          agendaBtn.textContent = "Generating\u2026";
          try {
            const result = await opts.onGenerateAgenda();
            if (result) {
              agendaEl.value = result;
            }
          } catch (err) {
            console.error("Agenda generation failed:", err);
          } finally {
            agendaBtn.disabled = false;
            agendaBtn.textContent = "Generate agenda";
          }
        });
      }

      document.addEventListener("keydown", onKeydown);

      // Focus the agenda field
      dialog.querySelector(`#${P}agenda`).focus();
    });
  }
}
