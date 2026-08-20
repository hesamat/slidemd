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
import { buildRepairMessage } from "../../data/ai/ai-repair-message.js";
import { copyText } from "../../core/clipboard.js";

const P = "ai-import-modal__";

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} ok
 * @property {Array<{slide?: number, code?: string, message: string}>} errors
 * @property {Array<{slide?: number, code?: string, message: string}>} warnings
 * @property {string} [converted] — optional converted text to resolve
 *   instead of the raw textarea value (e.g. JSON→markdown). When absent,
 *   the raw text is resolved.
 */

export class AiImportModal {
  /**
   * Show the modal and wait for the user's response.
   * @param {object} opts
   * @param {(text: string) => ValidationResult|Promise<ValidationResult>} opts.validate
   *   Validates pasted text. Called on "Validate" click and again before apply.
   *   The result may include an optional `converted` string — when present, it
   *   is resolved instead of the raw textarea text so the caller receives the
   *   exact text that was validated (e.g. JSON→markdown conversion).
   * @returns {Promise<string|null>} The converted markdown if the validator
   *   provided one, otherwise the pasted text; or null if cancelled.
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

      // "Copy repair prompt" — appears when validation has errors or
      // warnings. Copies a repair message (built from both) so the user
      // can paste it back into their external AI tool for a fix, then
      // paste the corrected output back here. This is the import flow's
      // manual equivalent of the live AI flow's repair loop.
      const repairBtn = document.createElement("button");
      repairBtn.type = "button";
      repairBtn.className = `${P}btn`;
      repairBtn.textContent = "Copy repair prompt";
      repairBtn.dataset.action = "repair";
      repairBtn.style.display = "none";
      actions.appendChild(repairBtn);

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

      // Last validation result. Apply is allowed when this is non-null and
      // there are no errors. Warnings are non-blocking — the user can apply
      // as-is or copy the repair prompt to fix them externally.
      let lastResult = null;
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
        if (!result) {
          repairBtn.style.display = "none";
          return;
        }
        const hasErrors = result.errors && result.errors.length > 0;
        const hasWarnings = result.warnings && result.warnings.length > 0;

        // Show the repair button whenever there are issues to fix.
        repairBtn.style.display = hasErrors || hasWarnings ? "" : "none";

        // Helper to render a list of issues in a card, with slide chips.
        const renderIssueList = (issues, kind) => {
          const box = document.createElement("div");
          box.className = `${P}issue-box ${P}issue-box--${kind}`;

          const title = document.createElement("div");
          title.className = `${P}issue-box__title`;
          const label = kind === "error" ? "error" : "warning";
          const plural = issues.length === 1 ? label : `${label}s`;
          title.textContent = `${issues.length} ${plural}`;
          box.appendChild(title);

          const ul = document.createElement("ul");
          ul.className = `${P}issue-list`;
          for (const item of issues) {
            const li = document.createElement("li");
            li.className = `${P}issue-list__item`;

            if (item.slide != null) {
              const chip = document.createElement("span");
              chip.className = `${P}issue-list__chip`;
              chip.textContent = `Slide ${item.slide + 1}`;
              li.appendChild(chip);
            }

            const msg = document.createElement("span");
            msg.className = `${P}issue-list__message`;
            msg.textContent = item.message;
            li.appendChild(msg);

            ul.appendChild(li);
          }
          box.appendChild(ul);
          return box;
        };

        if (result.ok) {
          const ok = document.createElement("div");
          ok.className = `${P}status-banner ${P}status-banner--ok`;
          ok.textContent = "Validation passed — ready to apply.";
          statusArea.appendChild(ok);

          if (hasWarnings) {
            const note = document.createElement("div");
            note.className = `${P}status-banner ${P}status-banner--warn`;
            note.textContent =
              "These warnings are non-blocking. You can still apply, or copy the repair prompt to fix them in your external AI tool.";
            statusArea.appendChild(note);
            statusArea.appendChild(renderIssueList(result.warnings, "warning"));
          }
          return;
        }

        if (hasErrors) {
          statusArea.appendChild(renderIssueList(result.errors, "error"));
          const note = document.createElement("div");
          note.className = `${P}status-banner ${P}status-banner--warn`;
          note.textContent =
            "Fix these errors and paste again, or copy the repair prompt to fix them in your external AI tool.";
          statusArea.appendChild(note);
        }

        if (hasWarnings) {
          statusArea.appendChild(renderIssueList(result.warnings, "warning"));
          if (!hasErrors) {
            const note = document.createElement("div");
            note.className = `${P}status-banner ${P}status-banner--warn`;
            note.textContent =
              "These warnings are non-blocking. You can still apply, or copy the repair prompt to fix them in your external AI tool.";
            statusArea.appendChild(note);
          }
        }
      };

      const updateApplyEnabled = () => {
        if (!lastResult) {
          applyBtn.disabled = true;
          return;
        }
        const hasErrors = lastResult.errors && lastResult.errors.length > 0;
        applyBtn.disabled = hasErrors;
        applyBtn.textContent = "Apply";
      };

      const runValidation = async () => {
        if (validating) return;
        const text = textarea.value;
        if (!text.trim()) {
          lastResult = null;
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
          renderStatus(lastResult);
          updateApplyEnabled();
        } finally {
          validating = false;
          validateBtn.disabled = false;
          validateBtn.textContent = "Validate";
        }
      };

      validateBtn.addEventListener("click", runValidation);

      // "Copy repair prompt" — builds a repair message from the current
      // validation errors and warnings and copies it to the clipboard.
      // The user pastes this into their external AI tool, gets a corrected
      // response, and pastes it back into the textarea.
      repairBtn.addEventListener("click", async () => {
        if (!lastResult) return;
        const issues = [...(lastResult.errors || []), ...(lastResult.warnings || [])];
        if (issues.length === 0) return;
        const msg = buildRepairMessage(issues);
        try {
          await copyText(msg);
          const prev = repairBtn.textContent;
          repairBtn.textContent = "Copied!";
          setTimeout(() => {
            repairBtn.textContent = prev;
          }, 2000);
        } catch {
          // If clipboard fails, select the textarea so the user can
          // manually copy — but that's unlikely to help. Just show a note.
          const note = document.createElement("p");
          note.className = `${P}status-warn`;
          note.textContent = "Could not copy to clipboard. Check browser permissions.";
          statusArea.appendChild(note);
        }
      });

      applyBtn.addEventListener("click", () => {
        if (applyBtn.disabled) return;
        // Re-validate synchronously against the current text to guard against
        // the user editing after a successful validation. If the validator is
        // async, fall back to the last result (the user must click Validate
        // again — same UX as the error path).
        const text = textarea.value;
        if (!text.trim()) return;
        // Resolve with the validator's `converted` text when present so the
        // caller receives the exact text that was validated (e.g. after a
        // JSON→markdown conversion), not the raw textarea value.
        const resolveText = (result) =>
          result && typeof result.converted === "string" ? result.converted : text;
        try {
          const fresh = validate(text);
          if (fresh && typeof fresh.then === "function") {
            // Async validator: trust lastResult only if text is unchanged.
            // Attach a no-op catch so a rejection from the discarded
            // re-validation does not surface as an unhandled rejection.
            fresh.catch(() => {});
            if (!lastResult) return;
            close(resolveText(lastResult));
            return;
          }
          if (!fresh.ok && fresh.errors && fresh.errors.length > 0) {
            lastResult = fresh;
            renderStatus(fresh);
            updateApplyEnabled();
            return;
          }
          lastResult = fresh;
          close(resolveText(fresh));
        } catch {
          // If re-validation throws, trust the last successful validation.
          if (lastResult) close(resolveText(lastResult));
        }
      });

      // Editing the textarea invalidates the previous validation.
      textarea.addEventListener("input", () => {
        lastResult = null;
        statusArea.replaceChildren();
        repairBtn.style.display = "none";
        updateApplyEnabled();
      });

      textarea.focus();
    });
  }
}
