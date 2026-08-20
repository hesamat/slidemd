/**
 * ConflictModal
 *
 * Choice UI shown when an async single-slide AI result conflicts with the
 * current working slide. The user can keep their edits, overwrite with the
 * AI result, or pick which version receives the AI result.
 *
 * Returns a promise that resolves to the user's choice, or `{ action: "reject" }`
 * if the modal is cancelled.
 */

import { modalOpened, modalClosed } from "../../core/modal-state.js";

const P = "conflict-modal__";

const INTENT_LABELS = {
  enhanceSlide: "Enhance slide",
  addSpeakerNotes: "Add speaker notes",
};

const ACTION_LABELS = {
  enhanceSlide: {
    apply: "Use the AI's enhanced version",
    rebase: "Keep the original version",
  },
  addSpeakerNotes: {
    apply: "Add AI notes to my current version",
    rebase: "Add AI notes to the original version",
  },
};

export class ConflictModal {
  /**
   * Show the conflict modal and wait for the user's choice.
   * @param {object} patch - the patch from the AI result
   * @param {string} [intent="enhanceSlide"] - the AI intent name
   * @returns {Promise<{ action: "apply" | "rebase" | "reject", rebase?: "apply-to-original" }>}
   */
  static show(patch, intent = "enhanceSlide") {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = `modal-base__backdrop ${P}backdrop`;

      const dialog = document.createElement("div");
      dialog.className = `modal-base__dialog ${P}dialog`;
      dialog.style.setProperty("--modal-width", "480px");
      dialog.innerHTML = `
        <h2 class="modal-base__title ${P}title">This slide changed while AI was working</h2>
        <p class="${P}subtitle" id="${P}subtitle"></p>
        <p class="${P}explanation">You edited this slide after the AI request started. Pick the version you want to keep.</p>

        <div class="modal-base__footer ${P}actions">
          <button type="button" class="modal-base__btn modal-base__btn--secondary ${P}btn" data-action="reject">Keep my editor changes</button>
          <button type="button" class="modal-base__btn modal-base__btn--primary ${P}btn ${P}btn--primary" data-action="apply">Use AI on the current version</button>
          <button type="button" class="modal-base__btn modal-base__btn--secondary ${P}btn" data-action="rebase" data-rebase="apply-to-original">Use AI on the original version</button>
        </div>
      `;

      const slideNumber = (patch.index ?? 0) + 1;
      const label = INTENT_LABELS[intent] || String(intent);
      const actionLabels = ACTION_LABELS[intent] || {};
      const applyLabel = actionLabels.apply || "Use AI on the current version";
      const rebaseLabel = actionLabels.rebase || "Use AI on the original version";

      dialog.querySelector('[data-action="apply"]').textContent = applyLabel;
      dialog.querySelector('[data-action="rebase"]').textContent = rebaseLabel;

      const subtitle = dialog.querySelector(`#${P}subtitle`);
      subtitle.textContent = `Slide ${slideNumber}: ${label}`;

      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);
      modalOpened();

      const close = (result) => {
        backdrop.remove();
        modalClosed();
        document.removeEventListener("keydown", onKeydown);
        resolve(result);
      };

      const onKeydown = (e) => {
        if (e.key === "Escape") {
          close({ action: "reject" });
        }
      };

      document.addEventListener("keydown", onKeydown);

      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) close({ action: "reject" });
      });

      dialog
        .querySelector('[data-action="reject"]')
        .addEventListener("click", () => close({ action: "reject" }));

      dialog
        .querySelector('[data-action="apply"]')
        .addEventListener("click", () => close({ action: "apply" }));

      const rebaseBtn = dialog.querySelector('[data-action="rebase"]');
      rebaseBtn.addEventListener("click", () =>
        close({ action: "rebase", rebase: rebaseBtn.dataset.rebase }),
      );
    });
  }
}
