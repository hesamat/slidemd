/**
 * ConversionModal
 *
 * Modal for importing PPTX files into the app.
 * Two-step flow: select file → import.
 */

import { PptxExtractor } from "../data/pptx-extractor.js";
import { convertToSlideMd } from "../data/pptx-to-slide-md.js";
import { Logger } from "../core/logger.js";
import { modalOpened, modalClosed } from "../core/modal-state.js";
import { iconString } from "../core/icon.js";

const P = "conversion-modal__";
const STORAGE_KEY = "webdeck_import_defaults";

// Extraction is a single monolithic pass over the deck; a hung conversion
// (e.g. a stalled diagram crop) must surface as an error with a retry, not a
// spinner forever. Generous: the CLI observed a 100+ slide deck converting in
// well under a minute once unstuck.
const IMPORT_TIMEOUT_MS = 5 * 60 * 1000;

/** Distinguishes a hung conversion from a conversion that failed outright. */
class ImportTimeoutError extends Error {
  constructor() {
    super("PPTX conversion timed out");
    this.name = "ImportTimeoutError";
  }
}

/**
 * @typedef {Object} ConversionResult
 * @property {string} markdown - The converted SlideMD markdown.
 * @property {import('../data/pptx-extractor.js').ExtractedImage[]} images - Extracted images.
 * @property {string} deckName - Deck name derived from filename (used for folder and .md filename).
 * @property {boolean} importImages - Whether the user chose to import images.
 * @property {Array} warnings - Degradation warnings from extraction (see pptx-import-warnings.js).
 */

export class ConversionModal {
  static _currentBackdrop = null;

  /**
   * Close the currently open conversion modal (if any).
   */
  static close() {
    if (this._currentBackdrop) {
      document.body.style.overflow = "";
      if (this._currentKeydownHandler) {
        document.removeEventListener("keydown", this._currentKeydownHandler);
        this._currentKeydownHandler = null;
      }
      this._currentBackdrop.remove();
      this._currentBackdrop = null;
      modalClosed();
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
      modalOpened();

      // Prevent background scroll while modal is open
      document.body.style.overflow = "hidden";

      let selectedFile = null;
      let extractionResult = null;
      let markdown = "";
      let deckName = "presentation";
      let importImages = true;
      let importBackgrounds = true;
      let importTheme = true;
      // Default to per-block auto-detection; "" (None) keeps fences bare.
      let codeLanguage = "auto";
      let isConverting = false;

      const fileInput = backdrop.querySelector(`[data-field="file"]`);
      const dropZone = backdrop.querySelector(`.${P}drop-zone`);
      const saveBtn = backdrop.querySelector('[data-action="save"]');
      const cancelBtn = backdrop.querySelector('[data-action="cancel"]');
      const retryBtn = backdrop.querySelector('[data-action="retry"]');
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
          ${iconString("file", { size: "2xl", strokeWidth: 1.5 })}
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
      let conversionAttempt = 0;
      // True while an extraction promise is in flight — including after a
      // timeout, when the abandoned extraction keeps running in the
      // background. Retry waits for it so attempts don't stack in one tab.
      let extractionActive = false;
      const startConversion = async () => {
        if (!selectedFile || isConverting) return;
        // A timed-out conversion leaves its extraction promise running; the
        // token makes stale results (from a superseded attempt) ignorable.
        const attemptId = ++conversionAttempt;
        isConverting = true;
        cancelBtn.disabled = true;
        retryBtn.hidden = true;
        // A previous conversion's result must not survive a new attempt: with
        // the old result still resolved, Import could return the PREVIOUS
        // file's deck while the drop zone shows the new file's name.
        saveBtn.hidden = true;
        extractionResult = null;
        markdown = "";
        hideError();
        // Remove any dynamically added rows/buttons from previous conversion
        backdrop
          .querySelectorAll(`.${P}checkbox-row, .${P}select-row, .${P}btn--ai, .${P}ai-hint`)
          .forEach((el) => el.remove());
        showSpinner("Converting...");

        const started = Date.now();
        await new Promise((r) => setTimeout(r, 50));

        try {
          const buffer = await selectedFile.arrayBuffer();
          extractionActive = true;
          const extractPromise = PptxExtractor.extract(buffer);
          // Observe the abandoned extraction's eventual settle so a late
          // rejection is never unhandled, and re-enable Retry when it ends.
          // Scoped to this attempt: a stale zombie's settle must not flip the
          // flag while a newer attempt's extraction is in flight.
          extractPromise.then(
            () => {
              if (attemptId !== conversionAttempt) return;
              extractionActive = false;
              retryBtn.disabled = false;
            },
            () => {
              if (attemptId !== conversionAttempt) return;
              extractionActive = false;
              retryBtn.disabled = false;
            },
          );
          const extraction = await ConversionModal.#withTimeout(extractPromise, IMPORT_TIMEOUT_MS);
          if (attemptId !== conversionAttempt) return;
          extractionResult = extraction;
          extractionActive = false;

          deckName = (selectedFile.name || "presentation")
            .replace(/\.pptx$/i, "")
            .replace(/[^a-zA-Z0-9_-]/g, "_");

          // Load saved defaults before conversion
          let savedDefaults = {};
          try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) savedDefaults = JSON.parse(raw) || {};
          } catch (e) {
            Logger.warn("Corrupted conversion defaults in localStorage, clearing:", e);
            localStorage.removeItem(STORAGE_KEY);
          }
          // Load saved defaults
          importImages = savedDefaults.importImages !== false;
          importBackgrounds = savedDefaults.importBackgrounds !== false;
          importTheme = savedDefaults.importTheme !== false;

          markdown = convertToSlideMd(extractionResult, deckName, {
            importImages,
            importBackgrounds,
          });

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
              <option value="auto">Auto-detect</option>
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

          // Content images checkbox
          const imgRow = document.createElement("label");
          imgRow.className = `${P}checkbox-row`;
          imgRow.innerHTML = `<input type="checkbox" class="${P}checkbox" ${importImages ? "checked" : ""} /><span class="${P}checkbox-label">Content images</span>`;
          const imgInput = imgRow.querySelector(`.${P}checkbox`);
          imgInput.addEventListener("change", () => {
            importImages = imgInput.checked;
            markdown = convertToSlideMd(extractionResult, deckName, {
              importImages,
              importBackgrounds,
            });
            saveDefaults({ importImages });
          });
          insertAfter.parentNode.insertBefore(imgRow, insertAfter.nextSibling);
          insertAfter = imgRow;

          // Background images checkbox
          const bgRow = document.createElement("label");
          bgRow.className = `${P}checkbox-row`;
          bgRow.innerHTML = `<input type="checkbox" class="${P}checkbox" ${importBackgrounds ? "checked" : ""} /><span class="${P}checkbox-label">Background images</span>`;
          const bgInput = bgRow.querySelector(`.${P}checkbox`);
          bgInput.addEventListener("change", () => {
            importBackgrounds = bgInput.checked;
            markdown = convertToSlideMd(extractionResult, deckName, {
              importImages,
              importBackgrounds,
            });
            saveDefaults({ importBackgrounds });
          });
          insertAfter.parentNode.insertBefore(bgRow, insertAfter.nextSibling);
          insertAfter = bgRow;

          // Theme checkbox
          const themeRow = document.createElement("label");
          themeRow.className = `${P}checkbox-row`;
          themeRow.innerHTML = `<input type="checkbox" class="${P}checkbox" ${importTheme ? "checked" : ""} /><span class="${P}checkbox-label">Slide theme and colors</span>`;
          const themeInput = themeRow.querySelector(`.${P}checkbox`);
          themeInput.addEventListener("change", () => {
            importTheme = themeInput.checked;
            saveDefaults({ importTheme });
          });
          insertAfter.parentNode.insertBefore(themeRow, insertAfter.nextSibling);
          insertAfter = themeRow;

          // Show Import button
          saveBtn.textContent = "Import";
          saveBtn.hidden = false;
          saveBtn.disabled = false;
          cancelBtn.disabled = false;
          isConverting = false;
        } catch (err) {
          if (attemptId !== conversionAttempt) return;
          hideSpinner();
          const timedOut = err instanceof ImportTimeoutError;
          showError(
            timedOut
              ? `Conversion timed out after ${Math.round(IMPORT_TIMEOUT_MS / 60000)} minutes. The file may be too complex — try again.`
              : `Conversion failed: ${err.message}`,
          );
          retryBtn.hidden = false;
          // The abandoned extraction may still be running after a timeout —
          // hold Retry until it settles so attempts never stack in one tab.
          retryBtn.disabled = extractionActive;
          cancelBtn.disabled = false;
          isConverting = false;
        }
      };
      // Retry — re-run conversion on the same selected file
      retryBtn.addEventListener("click", () => {
        if (selectedFile && !isConverting && !extractionActive) startConversion();
      });

      // Import button
      saveBtn.addEventListener("click", async () => {
        // Guard against a stale result: Import is only meaningful after a
        // completed conversion of the currently selected file.
        if (!extractionResult || isConverting) return;
        // Strip <img> tags when content images are not imported, but preserve
        // diagram-derived images (marked with data-diagram="true") since they
        // are essential content, not decorative photos the user opted out of.
        let finalMarkdown = importImages
          ? markdown
          : markdown.replace(/<img\s+(?![^>]*data-diagram="true")[^>]*>/g, "");
        // Strip background/theme directives when not keeping slide appearance
        if (!importTheme) {
          finalMarkdown = finalMarkdown
            .replace(/^\s*background:.*$/gm, "")
            .replace(/^\s*theme:.*$/gm, "")
            .replace(/\n{3,}/g, "\n\n");
        }
        // Tag opening fences via the shared detector: auto-detect per block
        // (default), a forced language, or "none" to keep fences bare. The
        // module (and highlight.js with it) is loaded on first import so it
        // stays out of the main editor bundle.
        const { applyCodeLanguages } = await import("../data/pptx-code-language.js");
        finalMarkdown = await applyCodeLanguages(
          finalMarkdown,
          codeLanguage === "" ? "none" : codeLanguage,
        );
        ConversionModal.close();
        // Always return images so background images can be uploaded and their
        // file references in the markdown can be rewritten to server paths.
        // When not importing content images, only background images are referenced
        // in the markdown; extra uploaded images are harmless.
        resolve({
          markdown: finalMarkdown,
          images: extractionResult.images || [],
          deckName,
          importImages,
          warnings: extractionResult.warnings?.warnings || [],
        });
      });
      // Cancel
      cancelBtn.addEventListener("click", () => {
        ConversionModal.close();
        resolve(null);
      });

      // Close on backdrop click — track mousedown origin to prevent
      // drag-release-outside from closing the modal.
      let backdropMouseDown = false;
      backdrop.addEventListener("mousedown", (e) => {
        backdropMouseDown = e.target === backdrop;
      });
      backdrop.addEventListener("click", (e) => {
        // Backdrop/Escape must not abandon a running conversion (the Cancel
        // button is disabled for the same reason).
        if (backdropMouseDown && e.target === backdrop && !isConverting) {
          ConversionModal.close();
          resolve(null);
        }
        backdropMouseDown = false;
      });

      // Close on Escape key
      const onKeydown = (e) => {
        if (e.key === "Escape" && !isConverting) {
          e.stopPropagation();
          ConversionModal.close();
          resolve(null);
        }
      };
      document.addEventListener("keydown", onKeydown);
      this._currentKeydownHandler = onKeydown;
    });
  }

  /**
   * Reject with ImportTimeoutError when the promise does not settle in time.
   * @static
   * @template T
   * @param {Promise<T>} promise
   * @param {number} ms
   * @returns {Promise<T>}
   */
  static #withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new ImportTimeoutError()), ms);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
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
    backdrop.className = `modal-base__backdrop ${P}backdrop`;
    backdrop.innerHTML = `
      <div class="modal-base__dialog ${P}dialog">
        <h2 class="modal-base__title ${P}title">Import PowerPoint</h2>

        <div class="${P}drop-zone" tabindex="0" role="button" aria-label="Upload PPTX file">
          ${iconString("upload", { size: "2xl", strokeWidth: 1.5 })}
          <span>Drop .pptx file here or click to browse</span>
        </div>
        <input type="file" data-field="file" accept=".pptx" style="display:none" />

        <div class="${P}spinner-container" hidden></div>
        <div class="${P}error" hidden></div>

        <div class="modal-base__footer ${P}actions">
          <button type="button" data-action="cancel" class="modal-base__btn modal-base__btn--secondary ${P}btn ${P}btn--secondary">Cancel</button>
          <button type="button" data-action="retry" class="modal-base__btn modal-base__btn--secondary ${P}btn ${P}btn--secondary" hidden>Retry</button>
          <button type="button" data-action="save" class="modal-base__btn modal-base__btn--primary ${P}btn ${P}btn--accent" hidden>Import</button>
        </div>
      </div>
    `;
    const dialog = backdrop.querySelector(`.${P}dialog`);
    if (dialog) dialog.style.setProperty("--modal-width", "480px");
    return backdrop;
  }
}
