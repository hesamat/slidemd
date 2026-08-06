/**
 * AiGenerateModal
 *
 * Pre-flight modal shown before running "Refine all slides" (whole-deck).
 * Lets the user set the generation mode, tone, and creative options, and see
 * an estimated cost before committing to the AI call. The user can cancel to
 * avoid any API charges.
 *
 * Returns a promise that resolves to the user's options, or null if cancelled.
 */

import { splitSlidesForAi, BATCH_SIZE } from "../../data/ai/ai-prompt-builder.js";
import { countContentImages } from "../../data/ai/slide-image-extractor.js";
import { escapeHtml } from "../../core/utils.js";

const P = "ai-generate-modal__";

/**
 * @typedef {Object} GenerateOptions
 * @property {string} mode — "polish" | "remix" | "reimagine"
 * @property {string} tone — "default" | "formal" | "casual" | "technical"
 * @property {boolean} addSpeakerNotes — add speaker notes where helpful
 * @property {boolean} includeImages — send slide images to the AI (vision)
 * @property {boolean} preserveVisualIdentity — keep theme/colors/backgrounds
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

      const modeOptions = `<option value="polish" selected>Polish</option>
<option value="remix">Remix</option>
<option value="reimagine">Reimagine</option>`;

      const dialog = document.createElement("div");
      dialog.className = `${P}dialog`;
      dialog.innerHTML = `
        <h2 class="${P}title">AI: Refine all slides</h2>
        <p class="${P}subtitle">Choose how much the AI should change the deck, set the tone, and pick optional creative controls.</p>

        <div class="${P}field">
          <label class="${P}label" for="${P}mode">Mode</label>
          <select id="${P}mode" class="${P}select">
            ${modeOptions}
          </select>
          <p id="${P}mode-desc" class="${P}note"></p>
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
          <div class="${P}cost-row" id="${P}notes-row">
            <label class="${P}checkbox-label">
              <input type="checkbox" id="${P}notes-toggle" />
              Add speaker notes
            </label>
            <span class="${P}note">Generate notes for slides that don't have them</span>
          </div>
          <div class="${P}cost-row" id="${P}identity-row" style="display:none">
            <label class="${P}checkbox-label">
              <input type="checkbox" id="${P}identity-toggle" />
              Preserve visual identity
            </label>
            <span class="${P}note">Keep theme, colors, and backgrounds</span>
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

      const modeSelect = dialog.querySelector(`#${P}mode`);
      const modeDesc = dialog.querySelector(`#${P}mode-desc`);
      const visionRow = dialog.querySelector(`#${P}vision-row`);
      const identityRow = dialog.querySelector(`#${P}identity-row`);
      const identityToggle = dialog.querySelector(`#${P}identity-toggle`);

      const MODE_DESCRIPTIONS = {
        polish:
          "Fix formatting and layouts, improve wording, and pick better layouts. Slide count and order stay the same.",
        remix:
          "Reorganize the story: reorder, merge, or rewrite slides. The AI proposes a plan, then you preview and apply it.",
        reimagine:
          "Take a bold new direction. The AI can change the narrative structure, slide count, and visual approach.",
      };

      const updateModeUI = () => {
        const mode = modeSelect.value;
        modeDesc.textContent = MODE_DESCRIPTIONS[mode];

        const isRemixOrReimagine = mode === "remix" || mode === "reimagine";

        // Vision: only for remix/reimagine, and only when the deck has images.
        visionRow.style.display = isRemixOrReimagine && hasImages ? "" : "none";

        // Visual identity: only for remix/reimagine. Default on for remix,
        // off for reimagine — but remember the user's explicit choice.
        identityRow.style.display = isRemixOrReimagine ? "" : "none";
        if (isRemixOrReimagine) {
          identityToggle.checked = mode === "remix";
        }
      };
      modeSelect.addEventListener("change", updateModeUI);
      updateModeUI();

      dialog.querySelector('[data-action="generate"]').addEventListener("click", () => {
        const mode = modeSelect.value || "polish";
        const tone = dialog.querySelector(`#${P}tone`).value;
        const visionToggle = dialog.querySelector(`#${P}vision-toggle`);
        const notesToggle = dialog.querySelector(`#${P}notes-toggle`);
        const includeImages =
          (mode === "remix" || mode === "reimagine") && hasImages && visionToggle?.checked;
        const addSpeakerNotes = notesToggle?.checked || false;
        const preserveVisualIdentity =
          mode === "polish" ||
          ((mode === "remix" || mode === "reimagine") && identityToggle?.checked);

        close({
          mode,
          tone,
          addSpeakerNotes,
          includeImages,
          preserveVisualIdentity,
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

      // Focus the mode field
      modeSelect.focus();
    });
  }
}
