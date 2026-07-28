/**
 * ConversionModal
 *
 * Modal for importing PPTX files into the app.
 * Two-step flow: Import (extract + convert) → Import.
 * Returns result with aiRequested flag for post-import AI processing.
 */

import { PptxExtractor } from "../data/pptx-extractor.js";
import { convertToSlideMd } from "../data/pptx-to-slide-md.js";

const P = "conversion-modal__";
const STORAGE_KEY = "webdeck_import_defaults";

/**
 * @typedef {Object} ConversionResult
 * @property {string} markdown - The converted SlideMD markdown.
 * @property {import('../data/pptx-extractor.js').ExtractedImage[]} images - Extracted images.
 * @property {string} deckName - Deck name derived from filename (used for folder and .md filename).
 * @property {boolean} importImages - Whether the user chose to import images.
 * @property {string|null} aiMode - null, "fix", or "generate" if user requested AI post-processing.
 */

export class ConversionModal {
  static _currentBackdrop = null;

  /**
   * Close the currently open conversion modal (if any).
   */
  static close() {
    if (this._currentBackdrop) {
      document.body.style.overflow = "";
      this._currentBackdrop.remove();
      this._currentBackdrop = null;
    }
  }

  /**
   * Show the conversion modal. Returns the converted markdown or null if cancelled.
   * @static
   * @returns {Promise<ConversionResult|null>}
   */
  static async show() {
    return new Promise((resolve) => {
      const backdrop = this.#createDom();
      document.body.appendChild(backdrop);
      this._currentBackdrop = backdrop;

      // Prevent background scroll while modal is open
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const restoreScroll = () => {
        document.body.style.overflow = prevOverflow;
      };

      let selectedFile = null;
      let extractionResult = null;
      let markdown = "";
      let deckName = "presentation";
      let importImages = true;
      let keepBackgrounds = true;
      let aiMode = null; // null, "fix", or "generate"
      let codeLanguage = "";
      let isConverting = false;

      const fileInput = backdrop.querySelector(`[data-field="file"]`);
      const dropZone = backdrop.querySelector(`.${P}drop-zone`);
      const saveBtn = backdrop.querySelector('[data-action="save"]');
      const cancelBtn = backdrop.querySelector('[data-action="cancel"]');
      const spinnerEl = backdrop.querySelector(`.${P}spinner-container`);
      const errorEl = backdrop.querySelector(`.${P}error`);
      const dialog = backdrop.querySelector(`.${P}dialog`);

      // Prevent clicks inside the dialog from closing the modal
      dialog.addEventListener("click", (e) => e.stopPropagation());

      const saveDefaults = (patch) => {
        try {
          const current = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
        } catch {
          /* ignore */
        }
      };

      const showError = (msg) => {
        errorEl.textContent = msg;
        errorEl.hidden = false;
      };

      const hideError = () => {
        errorEl.hidden = true;
        errorEl.textContent = "";
      };

      const showSpinner = (msg) => {
        spinnerEl.innerHTML = '<span class="' + P + 'spinner"></span> ' + this.#escHtml(msg);
        spinnerEl.hidden = false;
      };

      const hideSpinner = () => {
        spinnerEl.hidden = true;
        spinnerEl.innerHTML = "";
      };

      // File handling — auto-convert when file is selected
      const handleFile = async (file) => {
        if (!file || !file.name.endsWith(".pptx")) {
          showError("Please select a .pptx file");
          return;
        }
        if (isConverting) return;
        selectedFile = file;
        hideError();

        // Show selected filename in the drop zone
        dropZone.innerHTML = `
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <span class="${P}filename">${this.#escHtml(file.name)}</span>
          <span class="${P}drop-hint">Click to change file</span>
        `;

        await startConversion();
      };

      fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));

      // Drag and drop
      dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add(`${P}drop-zone--active`);
      });
      dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove(`${P}drop-zone--active`);
      });
      dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove(`${P}drop-zone--active`);
        handleFile(e.dataTransfer.files[0]);
      });
      dropZone.addEventListener("click", (e) => {
        e.stopPropagation();
        fileInput.click();
      });

      // Conversion logic — called automatically when file is selected
      const startConversion = async () => {
        if (!selectedFile || isConverting) return;
        isConverting = true;
        cancelBtn.disabled = true;
        hideError();
        // Remove any dynamically added rows/buttons from previous conversion
        backdrop
          .querySelectorAll(`.${P}checkbox-row, .${P}select-row, .${P}btn--ai`)
          .forEach((el) => el.remove());
        showSpinner("Converting...");

        const started = Date.now();
        await new Promise((r) => setTimeout(r, 50));

        try {
          const buffer = await selectedFile.arrayBuffer();
          extractionResult = await PptxExtractor.extract(buffer);

          deckName = (selectedFile.name || "presentation")
            .replace(/\.pptx$/i, "")
            .replace(/[^a-zA-Z0-9_-]/g, "_");

          // Load saved defaults before conversion so importImages is correct
          let savedDefaults = {};
          try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) savedDefaults = JSON.parse(raw);
          } catch (e) {
            console.warn("Corrupted conversion defaults in localStorage, clearing:", e);
            localStorage.removeItem(STORAGE_KEY);
          }
          importImages = savedDefaults.importImages !== false;

          markdown = convertToSlideMd(extractionResult, deckName, { importImages });

          const elapsed = Date.now() - started;
          if (elapsed < 300) {
            await new Promise((r) => setTimeout(r, 300 - elapsed));
          }

          hideSpinner();

          const hasCodeBlocks = /^```\n/gm.test(markdown);

          // Insert elements in order: language selector, then checkboxes
          let insertAfter = spinnerEl;

          // Show code language selector with hint
          const langRow = document.createElement("div");
          langRow.className = `${P}select-row`;
          langRow.innerHTML = `
            <label class="${P}select-label">Code language</label>
            <select class="${P}select" data-field="code-language">
              <option value="">None</option>
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="java">Java</option>
              <option value="cpp">C / C++</option>
              <option value="html">HTML</option>
              <option value="css">CSS</option>
              <option value="sql">SQL</option>
              <option value="bash">Shell / Bash</option>
              <option value="json">JSON</option>
              <option value="typescript">TypeScript</option>
            </select>
            <span class="${P}code-hint">${hasCodeBlocks ? "Code blocks detected" : ""}</span>
          `;
          const langSelect = langRow.querySelector(`[data-field="code-language"]`);
          if (savedDefaults.codeLanguage) {
            langSelect.value = savedDefaults.codeLanguage;
            codeLanguage = savedDefaults.codeLanguage;
          }
          langSelect.addEventListener("change", () => {
            codeLanguage = langSelect.value;
            saveDefaults({ codeLanguage });
          });
          insertAfter.parentNode.insertBefore(langRow, insertAfter.nextSibling);
          insertAfter = langRow;

          // Image import checkbox
          importImages = savedDefaults.importImages !== false;
          const imgCheckboxRow = document.createElement("label");
          imgCheckboxRow.className = `${P}checkbox-row`;
          imgCheckboxRow.innerHTML = `<input type="checkbox" class="${P}checkbox" ${importImages ? "checked" : ""} /><span class="${P}checkbox-label">Import images</span>`;
          const imgCheckboxInput = imgCheckboxRow.querySelector(`.${P}checkbox`);
          imgCheckboxInput.addEventListener("change", () => {
            importImages = imgCheckboxInput.checked;
            markdown = convertToSlideMd(extractionResult, deckName, { importImages });
            saveDefaults({ importImages });
          });
          insertAfter.parentNode.insertBefore(imgCheckboxRow, insertAfter.nextSibling);
          insertAfter = imgCheckboxRow;

          // Show background/theme checkbox
          keepBackgrounds = savedDefaults.keepBackgrounds !== false;
          const bgCheckboxRow = document.createElement("label");
          bgCheckboxRow.className = `${P}checkbox-row`;
          bgCheckboxRow.innerHTML = `<input type="checkbox" class="${P}checkbox" ${keepBackgrounds ? "checked" : ""} /><span class="${P}checkbox-label">Keep slide backgrounds and themes</span>`;
          const bgCheckboxInput = bgCheckboxRow.querySelector(`.${P}checkbox`);
          bgCheckboxInput.addEventListener("change", () => {
            keepBackgrounds = bgCheckboxInput.checked;
            saveDefaults({ keepBackgrounds });
          });
          insertAfter.parentNode.insertBefore(bgCheckboxRow, insertAfter.nextSibling);
          insertAfter = bgCheckboxRow;

          // AI mode section
          const aiDivider = document.createElement("div");
          aiDivider.className = `${P}checkbox-row`;
          aiDivider.style.cssText =
            "border-top: 1px solid var(--border-medium, #ccc); margin-top: 8px; padding-top: 8px;";
          aiDivider.innerHTML = `<span class="${P}checkbox-label" style="font-weight: 500; color: var(--text-medium, #666);">AI Enhancement (optional)</span>`;
          insertAfter.parentNode.insertBefore(aiDivider, insertAfter.nextSibling);
          insertAfter = aiDivider;

          const { SettingsModal } = await import("../editor/settings-modal.js");

          // AI: Fix issues checkbox
          const fixRow = document.createElement("label");
          fixRow.className = `${P}checkbox-row`;
          fixRow.innerHTML = `<input type="checkbox" class="${P}checkbox" /><span class="${P}checkbox-label">AI: Fix issues on import</span>`;
          const fixInput = fixRow.querySelector(`.${P}checkbox`);
          fixInput.addEventListener("change", () => {
            if (fixInput.checked) {
              aiMode = "fix";
            } else if (aiMode === "fix") {
              aiMode = null;
            }
          });
          insertAfter.parentNode.insertBefore(fixRow, insertAfter.nextSibling);
          insertAfter = fixRow;

          // AI hint when no API key
          const aiHint = document.createElement("span");
          aiHint.className = `${P}ai-hint`;
          aiHint.hidden = true;
          aiHint.innerHTML = `No API key configured. <a href="#" data-action="open-settings" style="color:var(--accent,#6366f1)">Open Settings</a> to enable AI features.`;
          insertAfter.parentNode.insertBefore(aiHint, insertAfter.nextSibling);
          insertAfter = aiHint;

          // Show Import button and AI Enhance button
          const actionsEl = backdrop.querySelector(`.${P}actions`);
          const aiBtn = document.createElement("button");
          aiBtn.type = "button";
          aiBtn.className = `${P}btn ${P}btn--ai`;
          aiBtn.textContent = "AI Inspiration";

          // Helper to refresh AI button/checkbox state based on current API key
          // Must be defined AFTER aiBtn and aiHint are created
          const refreshAiState = () => {
            const key = SettingsModal.getApiKey();
            const hasKey = !!key;
            console.log("[AI] refreshAiState:", {
              key: key ? key.slice(0, 8) + "..." : "(empty)",
              hasKey,
            });
            console.log(
              "[AI] sessionStorage:",
              sessionStorage.getItem("webdeck_openrouter_api_key"),
            );
            console.log("[AI] localStorage:", localStorage.getItem("webdeck_openrouter_api_key"));
            fixInput.disabled = !hasKey;
            if (aiBtn) {
              aiBtn.disabled = !hasKey;
              aiBtn.title = hasKey
                ? "Import and get AI-inspired redesign"
                : "Configure API key in Settings first";
            }
            if (aiHint) {
              aiHint.hidden = hasKey;
              console.log("[AI] aiHint.hidden =", aiHint.hidden);
            }
          };

          // Clicking the checkbox when no API key opens settings
          fixInput.addEventListener("click", async (e) => {
            if (!SettingsModal.getApiKey()) {
              e.preventDefault();
              await SettingsModal.show();
              refreshAiState();
              if (SettingsModal.getApiKey()) {
                fixInput.checked = true;
                aiMode = "fix";
              }
            }
          });

          aiHint.addEventListener("click", async (e) => {
            if (e.target.dataset.action === "open-settings") {
              e.preventDefault();
              await SettingsModal.show();
              refreshAiState();
            }
          });

          aiBtn.addEventListener("click", async () => {
            if (!SettingsModal.getApiKey()) {
              await SettingsModal.show();
              refreshAiState();
              if (SettingsModal.getApiKey()) {
                aiBtn.click();
              }
              return;
            }
            aiMode = "generate";
            saveBtn.click();
          });
          actionsEl.insertBefore(aiBtn, saveBtn);
          saveBtn.textContent = "Import";

          // Apply initial state
          console.log("[AI] conversion modal: calling refreshAiState");
          refreshAiState();

          // Show Import button
          saveBtn.hidden = false;
          saveBtn.disabled = false;
          cancelBtn.disabled = false;
          isConverting = false;
        } catch (err) {
          hideSpinner();
          showError(`Conversion failed: ${err.message}`);
          cancelBtn.disabled = false;
          isConverting = false;
        }
      };
      // Import button
      saveBtn.addEventListener("click", async () => {
        // If user opted out of images, strip <img> tags from markdown
        let finalMarkdown = importImages ? markdown : markdown.replace(/<img\s+[^>]*>/g, "");
        // If user opted out of backgrounds/themes, strip those directives
        if (!keepBackgrounds) {
          finalMarkdown = finalMarkdown
            .replace(/^\s*background:.*$/gm, "")
            .replace(/^\s*theme:.*$/gm, "")
            .replace(/\n{3,}/g, "\n\n");
        }
        // If no AI mode, convert [Diagram: ...] markers to bullet lists
        if (!aiMode) {
          finalMarkdown = finalMarkdown.replace(/\[Diagram:\s*(.+?)\]/g, (_match, items) =>
            items
              .split(", ")
              .map((item) => `- ${item.trim()}`)
              .join("\n"),
          );
        }
        // Add language tag to opening fences of fenced code blocks only.
        // Use a state machine to distinguish opening fences from closing fences.
        if (codeLanguage) {
          const mdLines = finalMarkdown.split("\n");
          let inCodeBlock = false;
          for (let j = 0; j < mdLines.length; j++) {
            if (mdLines[j].trim() === "```") {
              if (inCodeBlock) {
                mdLines[j] = "```";
                inCodeBlock = false;
              } else {
                mdLines[j] = "```" + codeLanguage;
                inCodeBlock = true;
              }
            }
          }
          finalMarkdown = mdLines.join("\n");
        }
        restoreScroll();
        backdrop.remove();
        resolve({
          markdown: finalMarkdown,
          images: importImages ? extractionResult.images : [],
          deckName,
          importImages,
          aiMode,
        });
      });
      // Cancel
      cancelBtn.addEventListener("click", () => {
        restoreScroll();
        backdrop.remove();
        resolve(null);
      });

      // Close on backdrop click — track mousedown origin to prevent
      // drag-release-outside from closing the modal.
      let backdropMouseDown = false;
      backdrop.addEventListener("mousedown", (e) => {
        backdropMouseDown = e.target === backdrop;
      });
      backdrop.addEventListener("click", (e) => {
        if (backdropMouseDown && e.target === backdrop) {
          restoreScroll();
          backdrop.remove();
          resolve(null);
        }
        backdropMouseDown = false;
      });
    });
  }

  /**
   * Escape HTML special characters for safe insertion via innerHTML.
   * @static
   * @param {string} s
   * @returns {string}
   */
  static #escHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Create the modal DOM.
   * @static
   * @returns {HTMLElement}
   */
  static #createDom() {
    const backdrop = document.createElement("div");
    backdrop.className = `${P}backdrop`;
    backdrop.innerHTML = `
      <div class="${P}dialog">
        <h2 class="${P}title">Import PowerPoint</h2>

        <div class="${P}drop-zone" tabindex="0" role="button" aria-label="Upload PPTX file">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>Drop .pptx file here or click to browse</span>
        </div>
        <input type="file" data-field="file" accept=".pptx" style="display:none" />

        <div class="${P}spinner-container" hidden></div>
        <div class="${P}error" hidden></div>

        <div class="${P}actions">
          <button type="button" data-action="cancel" class="${P}btn ${P}btn--secondary">Cancel</button>
          <button type="button" data-action="save" class="${P}btn ${P}btn--accent" hidden>Import</button>
        </div>
      </div>
    `;
    this.#injectStyles(backdrop);
    return backdrop;
  }

  /**
   * Inject modal styles.
   * @static
   * @param {HTMLElement} container
   */
  static #injectStyles(container) {
    const style = document.createElement("style");
    style.textContent = `
      .${P}backdrop {
        position: fixed; inset: 0; z-index: 10000;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
      }
      .${P}dialog {
        background: var(--surface-bg, #fff); color: var(--text-high, #111);
        border-radius: 12px; padding: 24px; width: 480px; max-width: 90vw;
        max-height: 85vh; overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      }
      .${P}title { margin: 0 0 16px; font-size: 18px; font-weight: 600; }
      .${P}drop-zone {
        border: 2px dashed var(--border-medium, #ccc); border-radius: 8px;
        padding: 20px; text-align: center; cursor: pointer;
        display: flex; flex-direction: column; align-items: center; gap: 6px;
        transition: border-color 0.2s, background 0.2s;
      }
      .${P}drop-zone:hover, .${P}drop-zone--active {
        border-color: var(--accent, #6366f1); background: var(--accent-bg, rgba(99,102,241,0.05));
      }
      .${P}filename {
        font-size: 14px; font-weight: 600; color: var(--text-high, #111);
        max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .${P}drop-hint {
        font-size: 11px; color: var(--text-medium, #888);
      }
      .${P}error { font-size: 13px; color: #dc2626; margin: 10px 0; }
      .${P}code-hint { font-size: 12px; color: var(--text-medium, #666); margin: 2px 0 0; }
      .${P}checkbox-row {
        display: flex; align-items: center; gap: 8px;
        font-size: 14px; cursor: pointer; margin: 8px 0 0;
      }
      .${P}checkbox { width: 16px; height: 16px; cursor: pointer; }
      .${P}select-row {
        display: flex; align-items: center; gap: 8px;
        font-size: 14px; margin: 10px 0 0;
      }
      .${P}select-label { font-size: 13px; color: var(--text-medium, #666); white-space: nowrap; }
      .${P}select {
        padding: 5px 8px; border: 1px solid var(--border-medium, #ccc);
        border-radius: 6px; font-size: 13px; background: var(--surface-bg, #fff);
        color: var(--text-high, #111); cursor: pointer;
      }
      .${P}spinner-container {
        font-size: 12px; margin: 10px 0; min-height: 18px;
      }
      .${P}actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; padding-top: 12px; }
      .${P}btn {
        padding: 7px 16px; border-radius: 6px; font-size: 13px; font-weight: 500;
        cursor: pointer; border: 1px solid transparent; transition: all 0.2s;
      }
      .${P}btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .${P}btn--secondary { background: var(--surface-hover, #f0f0f0); color: var(--text-high, #111); }
      .${P}btn--accent { background: var(--accent, #6366f1); color: #fff; }
      .${P}btn--accent:hover:not(:disabled) { background: var(--accent-hover, #4f46e5); }
      .${P}btn--ai {
        background: linear-gradient(135deg, #8b5cf6, #6366f1); color: #fff;
        border: none; font-weight: 600;
      }
      .${P}btn--ai:hover:not(:disabled) { background: linear-gradient(135deg, #7c3aed, #4f46e5); }
      .${P}btn--ai:disabled { opacity: 0.4; cursor: not-allowed; }
      .${P}ai-hint {
        display: block; font-size: 11px; color: var(--text-medium, #888);
        margin: 6px 0 0; line-height: 1.4;
      }
      .${P}ai-hint a { text-decoration: underline; }
      .${P}spinner {
        display: inline-block; width: 12px; height: 12px;
        border: 2px solid var(--border-medium, #ccc);
        border-top-color: var(--accent, #6366f1);
        border-radius: 50%;
        animation: ${P}spin 0.6s linear infinite;
        vertical-align: middle; margin-right: 6px;
      }
      @keyframes ${P}spin { to { transform: rotate(360deg); } }
    `;
    container.appendChild(style);
  }
}
