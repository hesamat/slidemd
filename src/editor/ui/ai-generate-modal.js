/**
 * AiGenerateModal
 *
 * Pre-flight modal shown before running "Refine all slides" (whole-deck).
 * Lets the user set fidelity and tone and see an estimated cost before
 * committing to the AI call. The user can cancel to avoid any API charges.
 *
 * Returns a promise that resolves to the user's options, or null if cancelled.
 */

import { splitSlidesForAi, BATCH_SIZE } from "../../data/ai/ai-prompt-builder.js";
import { countContentImages } from "../../data/ai/slide-image-extractor.js";
import { escapeHtml } from "../../core/utils.js";

const P = "ai-generate-modal__";

/**
 * @typedef {Object} GenerateOptions
 * @property {string} fidelity — "polish" | "enhance" | "rewrite"
 * @property {string} tone — "default" | "formal" | "casual" | "technical"
 * @property {boolean} [includeImages] — true if the user opted in to vision
 *   (only set when fidelity=rewrite and images are present)
 */

export class AiGenerateModal {
  /**
   * Show the modal and wait for the user's response.
   * @param {string} markdown — the current deck markdown (for cost estimation)
   * @param {object} [opts]
   * @param {() => Promise<void>} [opts.onOpenSettings] — callback to open Settings modal
   * @returns {Promise<GenerateOptions|null>}
   */
  static show(markdown, opts = {}) {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = `${P}backdrop`;

      const slideCount = splitSlidesForAi(markdown, "generate").length;
      const batchCount = Math.max(1, Math.ceil(slideCount / BATCH_SIZE));
      const { count: imageCount, estimatedTokens: imageTokens } = countContentImages(markdown);
      const hasImages = imageCount > 0;

      const fidelityOptions = `<option value="polish">Tidy up — fix formatting and layouts only</option>
<option value="enhance" selected>Restyle — reword and rework layouts, add notes</option>
<option value="rewrite">Remix — plan then restructure (two-phase)</option>`;

      const dialog = document.createElement("div");
      dialog.className = `${P}dialog`;
      dialog.innerHTML = `
        <h2 class="${P}title">AI: Refine all slides</h2>
        <p class="${P}subtitle">The AI will rework formatting, wording, and layouts across your presentation. Adjust options below, then click Generate to start.</p>

        <div class="${P}field">
          <label class="${P}label" for="${P}tone">Tone</label>
          <select id="${P}tone" class="${P}select">
            <option value="default">Default</option>
            <option value="formal">Formal</option>
            <option value="casual">Casual</option>
            <option value="technical">Technical</option>
          </select>
        </div>

        <div class="${P}field">
          <label class="${P}label" for="${P}fidelity">How much should the AI change?</label>
          <select id="${P}fidelity" class="${P}select">
            ${fidelityOptions}
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
          <div class="${P}cost-row" id="${P}model-row">
            <span>Model</span>
            <span class="${P}model-display">
              <span id="${P}model-name">${escapeHtml(opts.modelName || "Not configured")}</span>
              ${opts.onOpenSettings ? `<button type="button" class="${P}link-btn" data-action="open-settings">Change</button>` : ""}
            </span>
          </div>
          <div class="${P}cost-row" id="${P}reasoning-row" ${!opts.useReasoning ? 'style="display:none"' : ""}>
            <span>Reasoning</span>
            <span class="${P}cost-warn">Enabled (higher cost)</span>
          </div>
          <div class="${P}cost-row ${P}vision-row" id="${P}vision-row" style="display:none">
            <label class="${P}checkbox-label">
              <input type="checkbox" id="${P}vision-toggle" />
              Send slide images to AI (vision)
            </label>
            <span class="${P}cost-warn">~${imageTokens.toLocaleString()} image tokens (${imageCount} images)</span>
          </div>
        </div>

        <div class="${P}actions">
          <button type="button" class="${P}btn" data-action="cancel">Cancel</button>
          <button type="button" class="${P}btn ${P}btn--primary" data-action="generate">Generate</button>
        </div>
      `;

      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);

      let settingsOpen = false;

      const close = (result) => {
        backdrop.remove();
        document.removeEventListener("keydown", onKeydown);
        resolve(result);
      };

      const onKeydown = (e) => {
        if (e.key === "Escape" && !settingsOpen) {
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

      // Show/hide the vision toggle row based on fidelity selection.
      // Only visible when fidelity=rewrite AND the deck has content images.
      const visionRow = dialog.querySelector(`#${P}vision-row`);
      const fidelitySelect = dialog.querySelector(`#${P}fidelity`);
      const updateVisionVisibility = () => {
        const fidelity = fidelitySelect.value;
        visionRow.style.display = fidelity === "rewrite" && hasImages ? "" : "none";
      };
      fidelitySelect.addEventListener("change", updateVisionVisibility);
      updateVisionVisibility();

      dialog.querySelector('[data-action="generate"]').addEventListener("click", () => {
        const tone = dialog.querySelector(`#${P}tone`).value;
        const fidelity = dialog.querySelector(`#${P}fidelity`).value || "enhance";
        const visionToggle = dialog.querySelector(`#${P}vision-toggle`);
        const includeImages = fidelity === "rewrite" && hasImages && visionToggle?.checked;
        close({
          tone,
          fidelity,
          includeImages,
        });
      });

      // Open Settings to change model
      const settingsBtn = dialog.querySelector('[data-action="open-settings"]');
      if (settingsBtn && opts.onOpenSettings) {
        settingsBtn.addEventListener("click", async () => {
          settingsOpen = true;
          await opts.onOpenSettings();
          settingsOpen = false;
          // The generate modal may have been closed (e.g. by an unrelated
          // action) while Settings was open — bail before touching the DOM.
          if (!dialog.isConnected) return;
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

      document.addEventListener("keydown", onKeydown);

      // Focus the tone field
      dialog.querySelector(`#${P}tone`).focus();
    });
  }
}
