/**
 * AiImportModal
 *
 * Modal for pasting AI-generated markdown produced by an external tool, so it
 * can be validated and applied to the deck through the same replaceDeck path
 * the in-app AI flow uses (issue #240).
 *
 * The caller supplies a `validate(text)` callback that returns
 * `{ ok, errors, warnings }` (the shape produced by `AiOutputValidator.validate`).
 * The Apply button is enabled only when validation passes (`ok: true`), or
 * after the user explicitly acknowledges warnings. Errors always block apply.
 *
 * Built with safe DOM construction (no innerHTML with interpolated content).
 */

import { modalOpened, modalClosed } from "../../core/modal-state.js";

const P = "ai-import-modal__";

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} ok
 * @property {Array<{slide?: number, code?: string, message: string}>} errors
 * @property {Array<{slide?: number, code?: string, message: string}>} warnings
 */

export class AiImportModal {
  /**
   * Show the modal and wait for the user's response.
   * @param {object} opts
   * @param {(text: string) => ValidationResult|Promise<ValidationResult>} opts.validate
   *   Validates pasted text. Called on "Validate" click and again before apply.
   * @returns {Promise<string|null>} The pasted markdown if the user applies,
   *   or null if cancelled.
   */
  static show({ validate }) {
    if (typeof validate !== "function") {
      throw new TypeError("AiImportModal.show: validate callback is required");
    }
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = `${P}backdrop`;

      const dialog = document.createElement("div");
      dialog.className = `${P}dialog`;

      const title = document.createElement("h2");
      title.className = `${P}title`;
      title.textContent = "Import AI result";
      dialog.appendChild(title);

      const subtitle = document.createElement("p");
      subtitle.className = `${P}subtitle`;
      subtitle.textContent =
        "Paste the markdown returned by the external AI tool. Validate it before applying to the deck.";
      dialog.appendChild(subtitle);

      const textarea = document.createElement("textarea");
      textarea.className = `${P}textarea`;
      textarea.rows = 14;
      textarea.placeholder = "Paste the AI-generated slide markdown here…";
      dialog.appendChild(textarea);

      const statusArea = document.createElement("div");
      statusArea.className = `${P}status`;
      statusArea.setAttribute("aria-live", "polite");
      dialog.appendChild(statusArea);

      const actions = document.createElement("div");
      actions.className = `${P}actions`;

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = `${P}btn`;
      cancelBtn.textContent = "Cancel";
      cancelBtn.dataset.action = "cancel";
      actions.appendChild(cancelBtn);

      const validateBtn = document.createElement("button");
      validateBtn.type = "button";
      validateBtn.className = `${P}btn`;
      validateBtn.textContent = "Validate";
      validateBtn.dataset.action = "validate";
      actions.appendChild(validateBtn);

      const applyBtn = document.createElement("button");
      applyBtn.type = "button";
      applyBtn.className = `${P}btn ${P}btn--primary`;
      applyBtn.textContent = "Apply";
      applyBtn.dataset.action = "apply";
      applyBtn.disabled = true;
      actions.appendChild(applyBtn);

      dialog.appendChild(actions);
      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);
      modalOpened();

      // Last validation result. Apply is only allowed when this is non-null and
      // either ok:true, or ok:false with only warnings and the user has
      // acknowledged them by clicking "Apply anyway".
      let lastResult = null;
      let warningsAcknowledged = false;
      let validating = false;

      const close = (result) => {
        backdrop.remove();
        modalClosed();
        document.removeEventListener("keydown", onKeydown);
        resolve(result);
      };

      const onKeydown = (e) => {
        if (e.key === "Escape") close(null);
      };

      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) close(null);
      });
      cancelBtn.addEventListener("click", () => close(null));
      document.addEventListener("keydown", onKeydown);

      const renderStatus = (result) => {
        statusArea.replaceChildren();
        if (!result) return;
        const hasErrors = result.errors && result.errors.length > 0;
        const hasWarnings = result.warnings && result.warnings.length > 0;

        if (result.ok) {
          const ok = document.createElement("p");
          ok.className = `${P}status-ok`;
          ok.textContent = "Validation passed. Ready to apply.";
          statusArea.appendChild(ok);
          return;
        }

        if (hasErrors) {
          const heading = document.createElement("p");
          heading.className = `${P}status-error`;
          heading.textContent = `${result.errors.length} error(s):`;
          statusArea.appendChild(heading);
          const ul = document.createElement("ul");
          ul.className = `${P}status-list`;
          for (const e of result.errors) {
            const li = document.createElement("li");
            li.textContent = e.slide != null ? `[slide ${e.slide + 1}] ${e.message}` : e.message;
            ul.appendChild(li);
          }
          statusArea.appendChild(ul);
        }

        if (hasWarnings) {
          const heading = document.createElement("p");
          heading.className = `${P}status-warn`;
          heading.textContent = `${result.warnings.length} warning(s):`;
          statusArea.appendChild(heading);
          const ul = document.createElement("ul");
          ul.className = `${P}status-list`;
          for (const w of result.warnings) {
            const li = document.createElement("li");
            li.textContent = w.slide != null ? `[slide ${w.slide + 1}] ${w.message}` : w.message;
            ul.appendChild(li);
          }
          statusArea.appendChild(ul);
        }

        if (!hasErrors && hasWarnings && !warningsAcknowledged) {
          const note = document.createElement("p");
          note.className = `${P}status-warn`;
          note.textContent = "Click Validate again to acknowledge warnings and enable Apply.";
          statusArea.appendChild(note);
        }
      };

      const updateApplyEnabled = () => {
        if (!lastResult) {
          applyBtn.disabled = true;
          return;
        }
        const hasErrors = lastResult.errors && lastResult.errors.length > 0;
        const hasWarnings = lastResult.warnings && lastResult.warnings.length > 0;
        applyBtn.disabled = hasErrors || (hasWarnings && !warningsAcknowledged);
        if (warningsAcknowledged && !hasErrors) {
          applyBtn.textContent = "Apply anyway";
        } else {
          applyBtn.textContent = "Apply";
        }
      };

      const runValidation = async () => {
        if (validating) return;
        const text = textarea.value;
        if (!text.trim()) {
          lastResult = null;
          warningsAcknowledged = false;
          statusArea.replaceChildren();
          const empty = document.createElement("p");
          empty.className = `${P}status-warn`;
          empty.textContent = "Paste some markdown first.";
          statusArea.appendChild(empty);
          updateApplyEnabled();
          return;
        }
        validating = true;
        validateBtn.disabled = true;
        validateBtn.textContent = "Validating…";
        try {
          const result = await validate(text);
          // If the text changed while validating, discard the stale result.
          if (textarea.value !== text) return;
          // First click with warnings: don't acknowledge yet. Second click
          // (with unchanged text and only warnings): acknowledge.
          if (
            lastResult &&
            !lastResult.ok &&
            lastResult.errors.length === 0 &&
            lastResult.warnings.length > 0 &&
            sameResultShape(lastResult, result)
          ) {
            warningsAcknowledged = true;
          } else {
            warningsAcknowledged = false;
          }
          lastResult = result;
          renderStatus(result);
          updateApplyEnabled();
        } catch (err) {
          if (textarea.value !== text) return;
          lastResult = {
            ok: false,
            errors: [{ message: `Validation failed: ${err?.message || err}` }],
            warnings: [],
          };
          warningsAcknowledged = false;
          renderStatus(lastResult);
          updateApplyEnabled();
        } finally {
          validating = false;
          validateBtn.disabled = false;
          validateBtn.textContent = "Validate";
        }
      };

      validateBtn.addEventListener("click", runValidation);

      applyBtn.addEventListener("click", () => {
        if (applyBtn.disabled) return;
        // Re-validate synchronously against the current text to guard against
        // the user editing after a successful validation. If the validator is
        // async, fall back to the last result (the user must click Validate
        // again — same UX as the error path).
        const text = textarea.value;
        if (!text.trim()) return;
        try {
          const fresh = validate(text);
          if (fresh && typeof fresh.then === "function") {
            // Async validator: trust lastResult only if text is unchanged.
            if (!lastResult) return;
            close(text);
            return;
          }
          if (!fresh.ok && fresh.errors && fresh.errors.length > 0) {
            lastResult = fresh;
            warningsAcknowledged = false;
            renderStatus(fresh);
            updateApplyEnabled();
            return;
          }
          close(text);
        } catch {
          // If re-validation throws, trust the last successful validation.
          if (lastResult) close(text);
        }
      });

      // Editing the textarea invalidates the previous validation.
      textarea.addEventListener("input", () => {
        lastResult = null;
        warningsAcknowledged = false;
        statusArea.replaceChildren();
        updateApplyEnabled();
      });

      textarea.focus();
    });
  }
}

/**
 * Compare two validation results by error/warning codes+messages (ignoring
 * slide indices which may shift). Used to detect a second Validate click on
 * unchanged warnings so we can flip to "acknowledged".
 * @param {ValidationResult} a
 * @param {ValidationResult} b
 * @returns {boolean}
 */
function sameResultShape(a, b) {
  if (!a || !b) return false;
  const sig = (r) =>
    [...(r.errors || []), ...(r.warnings || [])]
      .map((e) => `${e.code || ""}:${e.message || ""}`)
      .sort()
      .join("|");
  return sig(a) === sig(b);
}
