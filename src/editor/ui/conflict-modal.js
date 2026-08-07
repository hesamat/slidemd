/**
 * ConflictModal
 *
 * Choice UI shown when an async single-slide AI result conflicts with the
 * current working slide. The user can keep their edits, overwrite with the
 * AI result, or pick a rebase target.
 *
 * Returns a promise that resolves to the user's choice, or `{ action: "reject" }`
 * if the modal is cancelled.
 */

const P = "conflict-modal__";

const INTENT_LABELS = {
  enhanceSlide: "Enhance slide",
  addSpeakerNotes: "Add speaker notes",
};

export class ConflictModal {
  /**
   * Show the conflict modal and wait for the user's choice.
   * @param {object} patch - the patch from the AI result
   * @param {string} [intent="enhanceSlide"] - the AI intent name
   * @returns {Promise<{ action: "apply" | "rebase" | "reject", rebase?: "apply-to-original" | "apply-to-latest" }>}
   */
  static show(patch, intent = "enhanceSlide") {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = `${P}backdrop`;

      const dialog = document.createElement("div");
      dialog.className = `${P}dialog`;
      dialog.innerHTML = `
        <h2 class="${P}title">Slide changed while AI was running</h2>
        <p class="${P}subtitle" id="${P}subtitle"></p>
        <p class="${P}explanation">The slide has been edited since the AI request started. Choose how to handle the AI result.</p>

        <div class="${P}rebase-field">
          <label class="${P}label" for="${P}rebase-select">Rebase target</label>
          <select id="${P}rebase-select" class="${P}select">
            <option value="apply-to-latest">Apply to latest (keep my edits)</option>
            <option value="apply-to-original" selected>Apply to original (discard my edits)</option>
          </select>
        </div>

        <div class="${P}actions">
          <button type="button" class="${P}btn" data-action="reject">Keep my edits</button>
          <button type="button" class="${P}btn" data-action="rebase">Rebase</button>
          <button type="button" class="${P}btn ${P}btn--primary" data-action="apply">Apply</button>
        </div>
      `;

      const slideNumber = (patch.index ?? 0) + 1;
      const label = INTENT_LABELS[intent] || String(intent);
      const subtitle = dialog.querySelector(`#${P}subtitle`);
      subtitle.textContent = `Slide ${slideNumber}: ${label}`;

      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);

      const close = (result) => {
        backdrop.remove();
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

      const rebaseSelect = dialog.querySelector(`#${P}rebase-select`);
      dialog
        .querySelector('[data-action="rebase"]')
        .addEventListener("click", () => close({ action: "rebase", rebase: rebaseSelect.value }));
    });
  }
}
