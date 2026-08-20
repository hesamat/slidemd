/**
 * AiGenerateModal
 *
 * Pre-flight modal shown before running "Refine all slides" (whole-deck).
 * Lets the user set the generation mode, tone, and creative options, and see
 * an estimated cost before committing to the AI call. The user can cancel to
 * avoid any API charges.
 *
 * For the export flow (issue #240), "Copy prompt" and "Download prompt"
 * buttons build the same options object and hand it to `opts.onExport` so the
 * caller can produce the exact prompt without an API key. The modal stays open
 * after a successful export so the user can copy AND download, then close
 * manually. A prompt-size estimate and a guidance note linking export to
 * import are shown near the export buttons. Remix and reimagine modes show a
 * warning that the exported prompt is a simplified single-call version (the
 * in-app flow uses a two-phase plan→execute process that can't be replicated
 * externally).
 *
 * Returns a promise that resolves to the user's options, or null if cancelled.
 */

import { splitSlidesForAi, BATCH_SIZE } from "../../data/ai/ai-prompt-builder.js";
import { countContentImages } from "../../data/ai/slide-image-extractor.js";
import { buildExportablePrompt } from "../../data/ai/ai-prompt-export.js";
import { createOperation } from "../../data/ai/ai-operation.js";
import { modalOpened, modalClosed } from "../../core/modal-state.js";
import { icon } from "../../core/icon.js";

const P = "ai-generate-modal__";

/**
 * @typedef {Object} GenerateOptions
 * @property {string} mode — "polish" | "remix" | "reimagine"
 * @property {string} flow — "story" | "technical" | "persuasive" | "instructional"
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
   * @param {(options: GenerateOptions, kind: "copy"|"download") => void|Promise<void>} [opts.onExport]
   *   Invoked when the user clicks "Copy prompt" or "Download prompt". The modal
   *   stays open after a successful export (the user closes it via Cancel or
   *   Generate). On error, an inline message is shown and the modal stays open.
   * @param {() => void|Promise<void>} [opts.onImport] — invoked when the user
   *   clicks "Import AI result" from the export panel. The generate modal
   *   closes first so the import modal can open without stacking.
   * @returns {Promise<GenerateOptions|null>}
   */
  static show(markdown, opts = {}) {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = `modal-base__backdrop ${P}backdrop`;

      const slideCount = splitSlidesForAi(markdown, "generate").length;
      const batchCount = Math.max(1, Math.ceil(slideCount / BATCH_SIZE));
      const { count: imageCount, estimatedTokens: imageTokens } = countContentImages(markdown);
      const hasImages = imageCount > 0;

      const title = "AI: Refine all slides";
      const subtitle =
        "Choose how much the AI should change the deck, set the tone, and pick optional creative controls.";
      const primaryLabel = "Generate";
      const primaryAction = "generate";

      // --- Build dialog via safe DOM construction (no innerHTML) ---
      const dialog = document.createElement("div");
      dialog.className = `modal-base__dialog ${P}dialog`;
      dialog.style.setProperty("--modal-width", "520px");

      // Header row: title + close button (matches New Presentation modal).
      const header = document.createElement("div");
      header.className = `modal-base__header ${P}header`;

      const h2 = document.createElement("h2");
      h2.className = `modal-base__title ${P}title`;
      h2.textContent = title;
      header.appendChild(h2);

      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = `modal-base__close ${P}close`;
      closeBtn.setAttribute("aria-label", "Close");
      const closeIcon = icon("close", { size: "md" });
      if (closeIcon) closeBtn.appendChild(closeIcon);
      header.appendChild(closeBtn);

      dialog.appendChild(header);

      const subtitleP = document.createElement("p");
      subtitleP.className = `${P}subtitle`;
      subtitleP.textContent = subtitle;
      dialog.appendChild(subtitleP);

      // Mode field
      const modeField = document.createElement("div");
      modeField.className = `${P}field`;
      const modeLabel = document.createElement("label");
      modeLabel.className = `${P}label`;
      modeLabel.setAttribute("for", `${P}mode`);
      modeLabel.textContent = "Mode";
      modeField.appendChild(modeLabel);
      const modeSelect = document.createElement("select");
      modeSelect.id = `${P}mode`;
      modeSelect.className = `${P}select`;
      for (const [val, label] of [
        ["polish", "Polish"],
        ["remix", "Remix"],
        ["reimagine", "Reimagine"],
      ]) {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = label;
        if (val === "polish") opt.selected = true;
        modeSelect.appendChild(opt);
      }
      modeField.appendChild(modeSelect);
      const modeDesc = document.createElement("p");
      modeDesc.id = `${P}mode-desc`;
      modeDesc.className = `${P}note`;
      modeField.appendChild(modeDesc);
      dialog.appendChild(modeField);

      // Flow field
      const flowField = document.createElement("div");
      flowField.className = `${P}field`;
      flowField.id = `${P}flow-field`;
      const flowLabel = document.createElement("label");
      flowLabel.className = `${P}label`;
      flowLabel.setAttribute("for", `${P}flow`);
      flowLabel.textContent = "Flow";
      flowField.appendChild(flowLabel);
      const flowSelect = document.createElement("select");
      flowSelect.id = `${P}flow`;
      flowSelect.className = `${P}select`;
      for (const [val, label] of [
        ["instructional", "Instructional"],
        ["story", "Story"],
        ["technical", "Technical"],
        ["persuasive", "Persuasive"],
      ]) {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = label;
        flowSelect.appendChild(opt);
      }
      flowField.appendChild(flowSelect);
      const flowDesc = document.createElement("p");
      flowDesc.id = `${P}flow-desc`;
      flowDesc.className = `${P}note`;
      flowField.appendChild(flowDesc);
      dialog.appendChild(flowField);

      // Cost section
      const costDiv = document.createElement("div");
      costDiv.className = `${P}cost`;

      // Cost-estimation rows are only relevant when an API call will be made.
      // Hoisted so the settings-change handler can update them after the row is
      // built.
      let modelNameSpan = null;
      let reasoningRow = null;
      {
        const slidesRow = document.createElement("div");
        slidesRow.className = `${P}cost-row`;
        const slidesLabel = document.createElement("span");
        slidesLabel.textContent = "Current slides";
        const slidesValue = document.createElement("span");
        slidesValue.textContent = String(slideCount);
        slidesRow.append(slidesLabel, slidesValue);
        costDiv.appendChild(slidesRow);

        const callsRow = document.createElement("div");
        callsRow.className = `${P}cost-row`;
        const callsLabel = document.createElement("span");
        callsLabel.textContent = "Estimated API calls";
        const callsValue = document.createElement("span");
        callsValue.textContent = String(batchCount);
        callsRow.append(callsLabel, callsValue);
        costDiv.appendChild(callsRow);

        const modelRow = document.createElement("div");
        modelRow.className = `${P}cost-row`;
        modelRow.id = `${P}model-row`;
        const modelLabel = document.createElement("span");
        modelLabel.textContent = "Model";
        const modelDisplay = document.createElement("span");
        modelDisplay.className = `${P}model-display`;
        modelNameSpan = document.createElement("span");
        modelNameSpan.id = `${P}model-name`;
        modelNameSpan.textContent = opts.modelName || "Not configured";
        modelDisplay.appendChild(modelNameSpan);
        if (opts.onOpenSettings) {
          const changeBtn = document.createElement("button");
          changeBtn.type = "button";
          changeBtn.className = `${P}link-btn`;
          changeBtn.dataset.action = "open-settings";
          changeBtn.textContent = "Change";
          modelDisplay.appendChild(changeBtn);
        }
        modelRow.append(modelLabel, modelDisplay);
        costDiv.appendChild(modelRow);

        reasoningRow = document.createElement("div");
        reasoningRow.className = `${P}cost-row`;
        reasoningRow.id = `${P}reasoning-row`;
        if (!opts.useReasoning) reasoningRow.style.display = "none";
        const reasoningLabel = document.createElement("span");
        reasoningLabel.textContent = "Reasoning";
        const reasoningValue = document.createElement("span");
        reasoningValue.className = `${P}cost-warn`;
        reasoningValue.textContent = "Enabled (higher cost)";
        reasoningRow.append(reasoningLabel, reasoningValue);
        costDiv.appendChild(reasoningRow);
      }

      // Vision row
      const visionRow = document.createElement("div");
      visionRow.className = `${P}cost-row ${P}vision-row`;
      visionRow.id = `${P}vision-row`;
      visionRow.style.display = "none";
      const visionLabel = document.createElement("label");
      visionLabel.className = `${P}checkbox-label`;
      const visionToggle = document.createElement("input");
      visionToggle.type = "checkbox";
      visionToggle.id = `${P}vision-toggle`;
      visionLabel.appendChild(visionToggle);
      visionLabel.appendChild(document.createTextNode(" Send slide images to AI (vision)"));
      const visionNote = document.createElement("span");
      visionNote.className = `${P}cost-warn`;
      visionNote.textContent = `~${imageTokens.toLocaleString()} image tokens (${imageCount} images)`;
      visionRow.append(visionLabel, visionNote);
      costDiv.appendChild(visionRow);

      // Notes row
      const notesRow = document.createElement("div");
      notesRow.className = `${P}cost-row`;
      notesRow.id = `${P}notes-row`;
      const notesLabel = document.createElement("label");
      notesLabel.className = `${P}checkbox-label`;
      const notesToggle = document.createElement("input");
      notesToggle.type = "checkbox";
      notesToggle.id = `${P}notes-toggle`;
      notesLabel.appendChild(notesToggle);
      notesLabel.appendChild(document.createTextNode(" Add speaker notes"));
      const notesNote = document.createElement("span");
      notesNote.className = `${P}note`;
      notesNote.textContent = "Generate notes for slides that don't have them";
      notesRow.append(notesLabel, notesNote);
      costDiv.appendChild(notesRow);

      // Identity row
      const identityRow = document.createElement("div");
      identityRow.className = `${P}cost-row`;
      identityRow.id = `${P}identity-row`;
      identityRow.style.display = "none";
      const identityLabel = document.createElement("label");
      identityLabel.className = `${P}checkbox-label`;
      const identityToggle = document.createElement("input");
      identityToggle.type = "checkbox";
      identityToggle.id = `${P}identity-toggle`;
      identityLabel.appendChild(identityToggle);
      identityLabel.appendChild(document.createTextNode(" Preserve visual identity"));
      const identityNote = document.createElement("span");
      identityNote.className = `${P}note`;
      identityNote.textContent = "Keep theme, colors, and backgrounds";
      identityRow.append(identityLabel, identityNote);
      costDiv.appendChild(identityRow);

      dialog.appendChild(costDiv);

      // Actions
      const actions = document.createElement("div");
      actions.className = `modal-base__footer ${P}actions`;
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = `modal-base__btn modal-base__btn--secondary ${P}btn`;
      cancelBtn.dataset.action = "cancel";
      cancelBtn.textContent = "Cancel";
      actions.appendChild(cancelBtn);

      // Export: an "Export" button in the action bar that opens a full
      // overlay panel covering the dialog. The panel has a back button,
      // guidance note, size estimate, mode warning, and Copy/Download
      // buttons. Only shown when onExport is provided.
      let copyBtn = null;
      let downloadBtn = null;
      let exportSize = null;
      let exportWarning = null;
      let exportPanel = null;
      let exportBtn;
      if (opts.onExport) {
        exportBtn = document.createElement("button");
        exportBtn.type = "button";
        exportBtn.className = `modal-base__btn modal-base__btn--secondary ${P}btn`;
        exportBtn.dataset.action = "toggle-export";
        exportBtn.textContent = "Export";
        actions.appendChild(exportBtn);

        // Full overlay panel — covers the dialog completely. Uses a
        // .is-visible class for a slide-in transition.
        exportPanel = document.createElement("div");
        exportPanel.className = `${P}export-panel`;

        // Header with back button and title.
        const exportHeader = document.createElement("div");
        exportHeader.className = `${P}export-header`;

        const backBtn = document.createElement("button");
        backBtn.type = "button";
        backBtn.className = `${P}export-back`;
        backBtn.dataset.action = "close-export";
        backBtn.setAttribute("aria-label", "Back to refine options");
        const backIcon = icon("arrow-left", { size: "sm" });
        if (backIcon) backBtn.appendChild(backIcon);
        backBtn.appendChild(document.createTextNode("Back"));
        exportHeader.appendChild(backBtn);

        const exportTitle = document.createElement("span");
        exportTitle.className = `${P}export-title`;
        exportTitle.textContent = "Export prompt";
        exportHeader.appendChild(exportTitle);

        exportPanel.appendChild(exportHeader);

        // Panel body.
        const exportBody = document.createElement("div");
        exportBody.className = `${P}export-body`;

        // Guidance note linking export to import.
        const exportNote = document.createElement("p");
        exportNote.className = `${P}export-note`;
        exportNote.textContent =
          "Copy or download the prompt, run it in an external AI tool, then use Import AI result to apply the output.";
        exportBody.appendChild(exportNote);

        // Prompt size estimate.
        exportSize = document.createElement("p");
        exportSize.className = `${P}export-size`;
        exportBody.appendChild(exportSize);

        // Mode-specific warning (remix/reimagine: simplified prompt).
        exportWarning = document.createElement("p");
        exportWarning.className = `${P}export-warning`;
        exportWarning.style.display = "none";
        exportBody.appendChild(exportWarning);

        // Copy + Download buttons side by side.
        const exportBtns = document.createElement("div");
        exportBtns.className = `${P}export-btns`;
        copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = `modal-base__btn modal-base__btn--secondary ${P}btn`;
        copyBtn.dataset.action = "copy-prompt";
        copyBtn.textContent = "Copy prompt";
        exportBtns.appendChild(copyBtn);
        downloadBtn = document.createElement("button");
        downloadBtn.type = "button";
        downloadBtn.className = `modal-base__btn modal-base__btn--secondary ${P}btn`;
        downloadBtn.dataset.action = "download-prompt";
        downloadBtn.textContent = "Download prompt";
        exportBtns.appendChild(downloadBtn);
        exportBody.appendChild(exportBtns);

        // Import link — closes the generate modal and opens the import flow.
        if (opts.onImport) {
          const importRow = document.createElement("div");
          importRow.className = `${P}export-import-row`;
          const importLink = document.createElement("button");
          importLink.type = "button";
          importLink.className = `${P}export-import-link`;
          importLink.dataset.action = "import-ai-result";
          importLink.textContent = "Import AI result \u2192";
          importRow.appendChild(importLink);
          exportBody.appendChild(importRow);
          importLink.addEventListener("click", () => {
            close(null, () => opts.onImport());
          });
        }

        exportPanel.appendChild(exportBody);
        dialog.appendChild(exportPanel);

        // Toggle the panel open/closed.
        const toggleExportPanel = (open) => {
          exportPanel.classList.toggle(`${P}export-panel--visible`, open);
          if (open) {
            updateExportInfo();
          }
        };
        exportBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          toggleExportPanel(true);
        });
        backBtn.addEventListener("click", () => {
          toggleExportPanel(false);
        });
      }

      const primaryBtn = document.createElement("button");
      primaryBtn.type = "button";
      primaryBtn.className = `modal-base__btn modal-base__btn--primary ${P}btn ${P}btn--primary`;
      primaryBtn.dataset.action = primaryAction;
      primaryBtn.textContent = primaryLabel;
      actions.appendChild(primaryBtn);
      dialog.appendChild(actions);

      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);
      modalOpened();

      let settingsOpen = false;

      const close = (result, afterClose) => {
        backdrop.remove();
        modalClosed();
        document.removeEventListener("keydown", onKeydown);
        resolve(result);
        if (typeof afterClose === "function") afterClose();
      };

      const onKeydown = (e) => {
        if (e.key === "Escape") {
          // If the export panel is open, close it instead of the modal.
          if (exportPanel && exportPanel.classList.contains(`${P}export-panel--visible`)) {
            e.stopPropagation();
            exportPanel.classList.remove(`${P}export-panel--visible`);
            return;
          }
          if (!settingsOpen) {
            close(null);
          }
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

      cancelBtn.addEventListener("click", () => close(null));
      closeBtn.addEventListener("click", () => close(null));

      const MODE_DESCRIPTIONS = {
        polish:
          "Fix formatting and layouts, improve wording, and pick better layouts. Slide count and order stay the same.",
        remix:
          "Reorganize the story: reorder, merge, or rewrite slides. The AI proposes a plan, then you preview and apply it.",
        reimagine:
          "Take a bold new direction. The AI proposes a brief and chapter outline, you review and adjust it, then the full deck is generated fresh. Visuals are not preserved.",
      };

      const FLOW_DESCRIPTIONS = {
        story: "Narrative-driven: emotional engagement, characters, examples, and a story arc.",
        technical: "Logic-driven: build complexity step by step, evidence and data first.",
        persuasive: "Argument-driven: problem, stakes, solution, benefits, call to action.",
        instructional: "Learning-driven: objectives, step-by-step guidance, examples, recap.",
      };

      const updateFlowUI = () => {
        flowDesc.textContent = FLOW_DESCRIPTIONS[flowSelect.value] || "";
      };
      flowSelect.addEventListener("change", updateFlowUI);
      updateFlowUI();

      // Track whether the user has explicitly toggled visual identity so we
      // don't clobber their choice when they switch modes and switch back.
      let identityTouched = false;
      identityToggle.addEventListener("change", () => {
        identityTouched = true;
      });

      // Read the current form state into a GenerateOptions object. Shared by
      // the Generate, Copy prompt, and Download prompt buttons so every action
      // sees the same options.
      const readOptions = () => {
        const mode = modeSelect.value || "polish";
        const flow = flowSelect.value || "instructional";
        const includeImages =
          (mode === "remix" || mode === "reimagine") && hasImages && visionToggle.checked;
        const addSpeakerNotes = notesToggle.checked || false;
        const preserveVisualIdentity =
          mode === "polish" || (mode === "remix" && identityToggle.checked);
        return { mode, flow, addSpeakerNotes, includeImages, preserveVisualIdentity };
      };

      // Update the export warning (remix/reimagine) and prompt size estimate.
      // Called on mode change and when the export section is expanded.
      const updateExportInfo = () => {
        if (!opts.onExport) return;
        const mode = modeSelect.value;
        if (exportWarning) {
          if (mode === "remix" || mode === "reimagine") {
            exportWarning.style.display = "";
            exportWarning.textContent =
              mode === "remix"
                ? "The exported Remix prompt is a single-call version. The in-app flow shows a restructuring plan before executing it; that preview step cannot be replicated in an external AI, so the result may differ from in-app Remix."
                : "The exported Reimagine prompt is a single-call version. The in-app flow shows a brief and chapter outline before generating; that preview step cannot be replicated in an external AI, so the result may differ from in-app Reimagine.";
          } else {
            exportWarning.style.display = "none";
          }
        }
        // Skip the expensive prompt-size computation when the panel
        // is closed — the user isn't looking at it.
        if (
          exportSize &&
          exportPanel &&
          exportPanel.classList.contains(`${P}export-panel--visible`)
        ) {
          try {
            const options = readOptions();
            const op = createOperation("generate", null, markdown, {
              flow: options.flow,
              mode: options.mode,
              addSpeakerNotes: options.addSpeakerNotes,
              includeImages: options.includeImages,
              preserveVisualIdentity: options.preserveVisualIdentity,
            });
            const { formattedText } = buildExportablePrompt(op);
            const charCount = formattedText.length;
            const approxTokens = Math.round(charCount / 4);
            exportSize.textContent = `Prompt size: ~${charCount.toLocaleString()} characters (~${approxTokens.toLocaleString()} tokens)`;
            exportSize.classList.toggle(`${P}export-size--large`, charCount > 100_000);
          } catch {
            exportSize.textContent = "";
          }
        }
      };

      const updateModeUI = () => {
        const mode = modeSelect.value;
        modeDesc.textContent = MODE_DESCRIPTIONS[mode];

        // Flow: only for remix/reimagine (polish doesn't restructure the story).
        flowField.style.display = mode === "remix" || mode === "reimagine" ? "" : "none";

        // Vision: available for both remix and reimagine when the deck has images.
        visionRow.style.display =
          (mode === "remix" || mode === "reimagine") && hasImages ? "" : "none";

        // Visual identity: only for remix. Reimagine always discards it.
        // Default to checked only on first entry — respect the user's choice
        // after that so switching modes doesn't silently re-enable it.
        identityRow.style.display = mode === "remix" ? "" : "none";
        if (mode === "remix" && !identityTouched) {
          identityToggle.checked = true;
        }

        // Update export warning and size estimate when mode changes.
        updateExportInfo();
      };
      modeSelect.addEventListener("change", updateModeUI);
      updateModeUI();

      // Primary action: "Generate".
      primaryBtn.addEventListener("click", () => close(readOptions()));

      // Export buttons: hand the options to the caller. The modal stays open
      // after a successful export so the user can copy AND download. A
      // transient success indicator is shown on the clicked button.
      const handleExport = async (kind) => {
        const btn = kind === "copy" ? copyBtn : downloadBtn;
        // Clear any stale error from a previous failed export so a
        // successful copy/download does not leave the old error visible.
        const existingError = dialog.querySelector(`.${P}export-error`);
        if (existingError) existingError.remove();
        try {
          await opts.onExport(readOptions(), kind);
        } catch (err) {
          // Surface a non-blocking error message in the dialog instead of
          // closing, so the user can retry without re-opening the modal.
          const existing = dialog.querySelector(`.${P}export-error`);
          if (existing) existing.remove();
          const msg = document.createElement("p");
          msg.className = `${P}export-error`;
          msg.textContent = `Could not ${kind === "copy" ? "copy" : "download"} prompt: ${err?.message || err}`;
          const exportBody = dialog.querySelector(`.${P}export-body`);
          if (exportBody) {
            exportBody.appendChild(msg);
          } else {
            actions.before(msg);
          }
          return;
        }
        // Show a transient success indicator on the clicked button, then
        // restore the original label. The modal stays open so the user can
        // also download after copying (or vice versa).
        if (btn) {
          const originalText = btn.textContent;
          btn.textContent = kind === "copy" ? "Copied!" : "Downloaded!";
          btn.classList.add(`${P}btn--success`);
          setTimeout(() => {
            if (btn.isConnected) {
              btn.textContent = originalText;
              btn.classList.remove(`${P}btn--success`);
            }
          }, 2000);
        }
      };
      if (copyBtn && opts.onExport) {
        copyBtn.addEventListener("click", () => handleExport("copy"));
      }
      if (downloadBtn && opts.onExport) {
        downloadBtn.addEventListener("click", () => handleExport("download"));
      }

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
            modelNameSpan.textContent = newName;
            // Update reasoning display
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
