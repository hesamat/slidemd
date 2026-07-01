/**
 * ConversionModal
 *
 * Modal for converting PPTX files to SlideMD format.
 * Handles file selection and converts in a single step.
 */

import { PptxExtractor } from "../data/pptx-extractor.js";
import { convertToSlideMd } from "../data/pptx-to-slide-md.js";

const P = "conversion-modal__";

/**
 * @typedef {Object} ConversionResult
 * @property {string} markdown - The converted SlideMD markdown.
 * @property {string[]} imageRefs - Image filenames that need to be saved.
 * @property {import('../data/pptx-extractor.js').ExtractedImage[]} images - Extracted images.
 * @property {string} fileName - Original PPTX filename (for naming the .md output).
 */

export class ConversionModal {
  static _currentBackdrop = null;

  /**
   * Close the currently open conversion modal (if any).
   */
  static close() {
    if (this._currentBackdrop) {
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

      let selectedFile = null;
      const fileInput = backdrop.querySelector(`[data-field="file"]`);
      const dropZone = backdrop.querySelector(`.${P}drop-zone`);
      const fileName = backdrop.querySelector(`.${P}file-name`);
      const convertBtn = backdrop.querySelector('[data-action="convert"]');
      const cancelBtn = backdrop.querySelector('[data-action="cancel"]');
      const statusEl = backdrop.querySelector(`.${P}status`);

      const setStatus = (msg, type = "") => {
        statusEl.textContent = msg;
        statusEl.className = `${P}status${type ? ` ${P}status--${type}` : ""}`;
      };

      const setSpinner = (msg) => {
        statusEl.innerHTML = '<span class="' + P + 'spinner"></span> ' + this.#escHtml(msg);
        statusEl.className = P + "status";
      };

      // File handling
      const handleFile = (file) => {
        if (!file || !file.name.endsWith(".pptx")) {
          setStatus("Please select a .pptx file", "error");
          return;
        }
        selectedFile = file;
        fileName.textContent = file.name;
        setStatus(`Selected: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`, "success");
        convertBtn.disabled = false;
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
      dropZone.addEventListener("click", () => fileInput.click());

      // Convert button — extract + convert in one step
      convertBtn.addEventListener("click", async () => {
        if (!selectedFile) return;
        convertBtn.disabled = true;
        cancelBtn.disabled = true;
        setSpinner("Converting...");

        // Let the browser paint the spinner first
        await new Promise((r) => setTimeout(r, 50));

        try {
          const buffer = await selectedFile.arrayBuffer();
          const extractionResult = await PptxExtractor.extract(buffer);

          const deckName = (selectedFile.name || "presentation")
            .replace(/\.pptx$/i, "")
            .replace(/[^a-zA-Z0-9_-]/g, "_");
          const markdown = convertToSlideMd(extractionResult, deckName);

          setStatus(
            `Converted ${extractionResult.slides.length} slides, ${extractionResult.images.length} images`,
            "success",
          );

          resolve({
            markdown,
            imageRefs: extractionResult.images.map((img) => img.ref),
            images: extractionResult.images,
            fileName: selectedFile.name || "presentation.pptx",
          });
        } catch (err) {
          setStatus(`Conversion failed: ${err.message}`, "error");
          convertBtn.disabled = false;
          cancelBtn.disabled = false;
        }
      });

      // Cancel
      cancelBtn.addEventListener("click", () => {
        backdrop.remove();
        resolve(null);
      });

      // Close on backdrop click
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) {
          backdrop.remove();
          resolve(null);
        }
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
        <h2 class="${P}title">Convert PPTX to SlideMD</h2>

        <div class="${P}section">
          <label class="${P}label">PowerPoint File</label>
          <div class="${P}drop-zone" tabindex="0" role="button" aria-label="Upload PPTX file">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span>Drop .pptx file here or click to browse</span>
          </div>
          <input type="file" data-field="file" accept=".pptx" style="display:none" />
          <div class="${P}file-name"></div>
        </div>

        <div class="${P}status"></div>

        <div class="${P}actions">
          <button type="button" data-action="cancel" class="${P}btn ${P}btn--secondary">Cancel</button>
          <button type="button" data-action="convert" class="${P}btn ${P}btn--accent" disabled>Convert</button>
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
        border-radius: 12px; padding: 28px; width: 520px; max-width: 90vw;
        max-height: 85vh; overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      }
      .${P}title { margin: 0 0 20px; font-size: 20px; font-weight: 600; }
      .${P}section { margin-bottom: 16px; }
      .${P}label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; color: var(--text-medium, #666); }
      .${P}drop-zone {
        border: 2px dashed var(--border-medium, #ccc); border-radius: 8px;
        padding: 24px; text-align: center; cursor: pointer;
        display: flex; flex-direction: column; align-items: center; gap: 8px;
        transition: border-color 0.2s, background 0.2s;
      }
      .${P}drop-zone:hover, .${P}drop-zone--active {
        border-color: var(--accent, #6366f1); background: var(--accent-bg, rgba(99,102,241,0.05));
      }
      .${P}file-name { font-size: 13px; color: var(--text-medium, #666); margin-top: 6px; }
      .${P}row { display: flex; gap: 8px; }
      .${P}select, .${P}input {
        flex: 1; padding: 8px 12px; border: 1px solid var(--border-medium, #ccc);
        border-radius: 6px; font-size: 14px; background: var(--surface-bg, #fff);
        color: var(--text-high, #111);
      }
      .${P}status { font-size: 13px; margin: 12px 0; min-height: 20px; }
      .${P}status--error { color: #dc2626; }
      .${P}status--success { color: #16a34a; }
      .${P}actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; }
      .${P}btn {
        padding: 8px 16px; border-radius: 6px; font-size: 14px; font-weight: 500;
        cursor: pointer; border: 1px solid transparent; transition: all 0.2s;
      }
      .${P}btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .${P}btn--secondary { background: var(--surface-hover, #f0f0f0); color: var(--text-high, #111); }
      .${P}btn--primary { background: var(--surface-bg, #fff); border-color: var(--border-medium, #ccc); color: var(--text-high, #111); }
      .${P}btn--accent { background: var(--accent, #6366f1); color: #fff; }
      .${P}btn--accent:hover:not(:disabled) { background: var(--accent-hover, #4f46e5); }
      .${P}spinner {
        display: inline-block; width: 14px; height: 14px;
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
