/**
 * ConversionModal
 *
 * Modal for converting PPTX files to SlideMD format.
 * Supports two modes:
 * - Rule-based: fast, local conversion using element positions (no API key needed)
 * - AI-powered: sends extracted content to an LLM for smarter layout selection
 */

import { PptxExtractor } from "../data/pptx-extractor.js";
import { convertToSlideMd } from "../data/pptx-to-slide-md.js";

const P = "conversion-modal__";

const PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1/chat/completions",
    modelsUrl: "https://api.openai.com/v1/models",
    models: [],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    modelsUrl: "https://openrouter.ai/api/v1/models",
    models: [],
  },
  {
    id: "opencode",
    name: "Opencode",
    baseUrl: "https://opencode.ai/api/v1/chat/completions",
    modelsUrl: "https://opencode.ai/api/v1/models",
    models: [],
  },
  {
    id: "zai",
    name: "Z.ai",
    baseUrl: "https://api.z.ai/v1/chat/completions",
    modelsUrl: "https://api.z.ai/v1/models",
    models: [],
  },
];

/**
 * @typedef {Object} ConversionResult
 * @property {string} markdown - The converted SlideMD markdown.
 * @property {string[]} imageRefs - Image filenames that need to be saved.
 */

export class ConversionModal {
  /**
   * Show the conversion modal. Returns the converted markdown or null if cancelled.
   * @static
   * @returns {Promise<ConversionResult|null>}
   */
  static async show() {
    return new Promise((resolve) => {
      const backdrop = this.#createDom();
      document.body.appendChild(backdrop);

      let selectedFile = null;
      let extractionResult = null;
      const providerSelect = backdrop.querySelector(`[data-field="provider"]`);
      const apiKeyInput = backdrop.querySelector(`[data-field="api-key"]`);
      const modelInput = backdrop.querySelector(`[data-field="model"]`);
      const fileInput = backdrop.querySelector(`[data-field="file"]`);
      const dropZone = backdrop.querySelector(`.${P}drop-zone`);
      const fileName = backdrop.querySelector(`.${P}file-name`);
      const extractBtn = backdrop.querySelector('[data-action="extract"]');
      const convertBtn = backdrop.querySelector('[data-action="convert"]');
      const convertAiBtn = backdrop.querySelector('[data-action="convert-ai"]');
      const cancelBtn = backdrop.querySelector('[data-action="cancel"]');
      const statusEl = backdrop.querySelector(`.${P}status`);
      const previewEl = backdrop.querySelector(`.${P}preview`);

      // Populate models for the first provider
      const fetchModelsBtn = backdrop.querySelector('[data-action="fetch-models"]');

      const updateModels = (models) => {
        const datalist = backdrop.querySelector("#model-list");
        if (datalist) {
          datalist.innerHTML = models.map((m) => `<option value="${m}">`).join("");
        }
      };

      // Fetch models from provider API
      const fetchModels = async () => {
        const provider = PROVIDERS.find((p) => p.id === providerSelect.value);
        const apiKey = apiKeyInput.value.trim();
        if (!provider?.modelsUrl) {
          setStatus("This provider does not support model listing", "error");
          return;
        }
        if (!apiKey) {
          setStatus("Enter an API key first", "error");
          return;
        }
        fetchModelsBtn.disabled = true;
        setStatus("Fetching models...", "");
        try {
          const res = await fetch(provider.modelsUrl, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const models = (data.data || data.models || [])
            .map((m) => m.id || m.name || m)
            .filter((m) => typeof m === "string")
            .sort();
          if (models.length === 0) {
            setStatus("No models returned by API", "error");
          } else {
            provider.models = models;
            updateModels(models);
            setStatus(`Found ${models.length} models`, "success");
          }
        } catch (err) {
          setStatus(`Failed to fetch models: ${err.message}`, "error");
        } finally {
          fetchModelsBtn.disabled = false;
        }
      };

      fetchModelsBtn.addEventListener("click", fetchModels);
      providerSelect.addEventListener("change", () => {
        const provider = PROVIDERS.find((p) => p.id === providerSelect.value);
        updateModels(provider?.models || []);
      });

      // Load saved config
      const savedKey = localStorage.getItem("slidemd_api_key");
      if (savedKey) apiKeyInput.value = savedKey;
      const savedProvider = localStorage.getItem("slidemd_ai_provider");
      if (savedProvider) providerSelect.value = savedProvider;
      const savedModel = localStorage.getItem("slidemd_ai_model");
      if (savedModel) modelInput.value = savedModel;

      const setStatus = (msg, type = "") => {
        statusEl.innerHTML = msg;
        statusEl.className = `${P}status${type ? ` ${P}status--${type}` : ""}`;
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
        extractBtn.disabled = false;
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

      // Extract button
      extractBtn.addEventListener("click", async () => {
        if (!selectedFile) return;
        extractBtn.disabled = true;
        setStatus("Extracting content from PPTX...", "");
        try {
          const buffer = await selectedFile.arrayBuffer();
          extractionResult = await PptxExtractor.extract(buffer);
          const plainText = PptxExtractor.toPlainText(extractionResult);
          previewEl.textContent = plainText;
          previewEl.style.display = "block";
          setStatus(
            `Extracted ${extractionResult.slides.length} slides, ${extractionResult.images.length} images`,
            "success",
          );
          convertBtn.disabled = false;
          convertAiBtn.disabled = false;
        } catch (err) {
          setStatus(`Extraction failed: ${err.message}`, "error");
          extractBtn.disabled = false;
        }
      });

      // Convert button (rule-based, no AI)
      convertBtn.addEventListener("click", () => {
        if (!extractionResult) {
          setStatus("Please extract a PPTX file first", "error");
          return;
        }
        convertBtn.disabled = true;
        convertAiBtn.disabled = true;
        extractBtn.disabled = true;
        cancelBtn.disabled = true;
        setStatus('<span class="' + P + 'spinner"></span> Converting...', "info");

        // setTimeout lets the browser start painting, rAF ensures
        // a full frame is rendered before the blocking conversion.
        setTimeout(() => {
          requestAnimationFrame(() => {
            const markdown = convertToSlideMd(extractionResult);
            resolve({
              markdown,
              imageRefs: extractionResult.images.map((img) => img.ref),
              images: extractionResult.images,
            });
            backdrop.remove();
          });
        }, 200);
      });

      // Convert with AI button
      convertAiBtn.addEventListener("click", async () => {
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
          setStatus("Please enter an API key", "error");
          return;
        }
        if (!extractionResult) {
          setStatus("Please extract a PPTX file first", "error");
          return;
        }

        const provider = PROVIDERS.find((p) => p.id === providerSelect.value);
        const model = modelInput.value.trim();
        if (!model) {
          setStatus("Please enter or select a model", "error");
          return;
        }

        // Save config
        localStorage.setItem("slidemd_api_key", apiKey);
        localStorage.setItem("slidemd_ai_provider", providerSelect.value);
        localStorage.setItem("slidemd_ai_model", model);

        const plainText = PptxExtractor.toPlainText(extractionResult);

        convertAiBtn.disabled = true;
        setStatus("Sending to AI for conversion...", "");

        try {
          const markdown = await this.#callAI(provider, apiKey, model, plainText);
          setStatus("Conversion complete!", "success");
          resolve({
            markdown,
            imageRefs: extractionResult.images.map((img) => img.ref),
            images: extractionResult.images,
          });
          backdrop.remove();
        } catch (err) {
          setStatus(`AI conversion failed: ${err.message}`, "error");
          convertAiBtn.disabled = false;
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
   * Call the AI API to convert extracted text to SlideMD markdown.
   * @static
   * @param {Object} provider
   * @param {string} apiKey
   * @param {string} model
   * @param {string} extractedText
   * @returns {Promise<string>}
   */
  static async #callAI(provider, apiKey, model, extractedText) {
    const systemPrompt = `You are an expert at converting PowerPoint presentations into SlideMD markdown format. You preserve the original content and structure while adapting it to SlideMD's layout system.

Rules:
- Output ONLY the SlideMD markdown, no explanations
- Preserve ALL original content — do not summarize or omit
- Map each PPTX slide to one SlideMD slide
- Choose appropriate layouts based on content structure
- Preserve speaker notes as <!-- notes: ... --> comments
- Convert tables to markdown tables
- Keep image references as ![description](images/filename.ext)
- Use layout: title-slide for title/cover slides
- Use layout: header-content for heading + content
- Use layout: two-column for two-column content
- Slides are separated by ---`;

    const userPrompt = `Convert this PPTX content to SlideMD markdown:\n\n${extractedText}`;

    const res = await fetch(provider.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(provider.id === "openrouter" ? { "HTTP-Referer": window.location.origin } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 16000,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`API error ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("No content in API response");

    // Strip markdown code fences if the LLM wrapped the output
    return content
      .replace(/^```(?:markdown)?\s*\n?/m, "")
      .replace(/\n?```\s*$/m, "")
      .trim();
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

        <div class="${P}section">
          <label class="${P}label">AI Provider</label>
          <div class="${P}row">
            <select data-field="provider" class="${P}select">
              ${PROVIDERS.map((p) => `<option value="${p.id}">${p.name}</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="${P}section">
          <label class="${P}label">API Key</label>
          <input type="password" data-field="api-key" class="${P}input" placeholder="sk-..." />
        </div>

        <div class="${P}section">
          <label class="${P}label">Model</label>
          <div class="${P}row">
            <input type="text" data-field="model" class="${P}input" list="model-list" placeholder="Select or type a model name" />
            <button type="button" data-action="fetch-models" class="${P}btn ${P}btn--primary ${P}btn--sm">Fetch</button>
          </div>
          <datalist id="model-list"></datalist>
        </div>

        <div class="${P}status"></div>

        <details class="${P}details">
          <summary>Extracted Content Preview</summary>
          <pre class="${P}preview"></pre>
        </details>

        <div class="${P}actions">
          <button type="button" data-action="cancel" class="${P}btn ${P}btn--secondary">Cancel</button>
          <button type="button" data-action="extract" class="${P}btn ${P}btn--primary" disabled>Extract</button>
          <button type="button" data-action="convert" class="${P}btn ${P}btn--accent" disabled>Convert</button>
          <button type="button" data-action="convert-ai" class="${P}btn ${P}btn--accent" disabled>Convert with AI</button>
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
      .${P}details { margin: 12px 0; }
      .${P}preview {
        max-height: 200px; overflow: auto; font-size: 12px;
        background: var(--surface-bg-alt, #f5f5f5); padding: 12px;
        border-radius: 6px; white-space: pre-wrap; display: none;
      }
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
      .${P}btn--sm { padding: 6px 12px; font-size: 13px; flex-shrink: 0; }
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
