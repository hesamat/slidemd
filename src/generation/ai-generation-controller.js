/**
 * AI Generation Controller
 * Main controller for the AI-powered deck generation workflow
 */

import { CourseProfileModal } from "./course-profile-modal.js";
import { AIConfigModal } from "./ai-config-modal.js";
import { DeckGenerator } from "./deck-generator.js";
import { LecturePlanGenerator } from "./lecture-plan-generator.js";
import { LecturePlanModal } from "./lecture-plan-modal.js";
import { AIProviderRegistry } from "./ai-provider-registry.js";
import { Notification } from "../renderer/notification.js";
import { DeckLoader } from "../data/deck-loader.js";

export class AIGenerationController {
  constructor(deck, controller, elements) {
    this.deck = deck;
    this.controller = controller;
    this.elements = elements;
    this.currentProfile = null;
    this.currentLecturePlan = null;
    this.isGenerating = false;
    this.abortController = null;
  }

  /**
   * Initialize the generation controller
   */
  init() {
    // Initialization happens via GenerationActions
  }

  /**
   * Show course profile manager modal
   */
  async showProfileManager() {
    // Just show the profile list - it will handle empty state gracefully
    // Directory is only needed when creating/saving profiles
    const profile = await CourseProfileModal.showList();
    if (profile) {
      this.currentProfile = profile;
      Notification.info(`Selected: ${profile.name}`);
    }
  }

  /**
   * Show AI configuration modal
   */
  async showAIConfig() {
    const config = await AIConfigModal.show();
    if (config) {
      Notification.success(`AI configuration saved for ${config.providerId}`);
    }
  }

  /**
   * Start deck generation workflow
   */
  async startGeneration() {
    if (this.isGenerating) {
      Notification.info("Generation already in progress");
      return;
    }

    this.isGenerating = true;
    this.abortController = new AbortController();

    let topic;
    let lastWeekSummary;
    let options;

    // Step 1: Ensure we have a profile
    try {
      if (!this.currentProfile) {
        await this.showProfileManager();
        if (!this.currentProfile) {
          return; // User cancelled
        }
      }

      // Step 2: Ensure AI is configured
      const apiKey = this.getApiKey(this.currentProfile.aiProvider);
      if (!apiKey) {
        Notification.info("Please configure your AI settings first");
        await this.showAIConfig();
        if (!this.getApiKey(this.currentProfile.aiProvider)) {
          return; // User cancelled or didn't configure
        }
      }

      // Step 3: Get topic from user
      const topicInput = await this.promptForTopic();
      if (!topicInput) {
        return; // User cancelled
      }
      topic = topicInput.topic;
      lastWeekSummary = topicInput.lastWeekSummary;

      // Step 4: Get generation options
      options = await this.promptForOptions();
      if (!options) {
        return; // User cancelled
      }

      // Step 5: Generate lecture plan
      const planLoadingModal = this.showLoadingModal("Drafting lecture plan...", {
        allowCancel: true,
        onCancel: () => this.abortGeneration(),
      });

      let lecturePlan = null;
      try {
        lecturePlan = await LecturePlanGenerator.generatePlan(this.currentProfile, topic, {
          ...options,
          lastWeekSummary,
          signal: this.abortController?.signal,
        });
      } catch (error) {
        if (error.name === "AbortError") {
          Notification.info("Generation cancelled");
          return;
        }

        if (error.rawResponse) {
          lecturePlan = await this.showPlanFormatError(error, topic, options);
          if (!lecturePlan) {
            return;
          }
        } else {
          await this.showGenerationError(error);
          return;
        }
      } finally {
        this.hideLoadingModal(planLoadingModal);
      }

      this.currentLecturePlan = lecturePlan;

      // Step 6: Review and approve lecture plan
      const approvedPlan = await LecturePlanModal.show(lecturePlan);
      if (!approvedPlan) {
        Notification.info("Generation cancelled");
        return;
      }

      this.currentLecturePlan = approvedPlan;

      // Step 7: Generate deck from approved plan
      const deckLoadingModal = this.showLoadingModal("Generating deck from approved plan...", {
        allowCancel: true,
        onCancel: () => this.abortGeneration(),
      });

      let markdown = null;
      try {
        markdown = await DeckGenerator.generateDeckFromPlan(this.currentProfile, approvedPlan, {
          ...options,
          lastWeekSummary,
          signal: this.abortController?.signal,
        });
      } catch (error) {
        if (error.name === "AbortError") {
          Notification.info("Generation cancelled");
          return;
        }

        if (error.rawResponse) {
          markdown = await this.showDeckFormatError(error, topic, options);
          if (!markdown) {
            return;
          }
        } else {
          await this.showGenerationError(error);
          return;
        }
      } finally {
        this.hideLoadingModal(deckLoadingModal);
      }

      // Step 8: Load deck into presentation view so user can see it rendered
      await this.loadIntoEditor(markdown, topic);

      // Step 9: Show compact confirmation with save option
      await this.showDeckPreview(markdown, topic);
    } catch (error) {
      console.error("Generation failed:", error);
      if (error.name !== "AbortError") {
        await this.showGenerationError(error);
      }
    } finally {
      this.isGenerating = false;
      this.abortController = null;
    }
  }

  /**
   * Abort the current generation flow
   */
  abortGeneration() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Prompt user for topic
   * @returns {Promise<string|null>} Topic or null if cancelled
   */
  async promptForTopic() {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "modal";
      backdrop.innerHTML = `
                <div class="modal__overlay"></div>
                <div class="modal__dialog" style="max-width: 500px;">
                    <div class="modal__header">
                        <h2 class="modal__title">Plan Lecture</h2>
                        <button class="modal__close" aria-label="Close">&times;</button>
                    </div>
                    <div class="modal__body">
                        <form id="topicForm">
                            <div style="margin-bottom: 16px;">
                                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--text-medium);">
                                    Profile: <strong style="color: var(--text-high);">${this.currentProfile?.name || "None selected"}</strong>
                                </label>
                            </div>
                            <div style="margin-bottom: 16px;">
                                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--text-medium);">
                                    Topic <span style="color: #ef4444;">*</span>
                                </label>
                                <textarea id="topicInput" class="course-profile-modal__input" rows="4" placeholder="e.g., Testing Distributed Software Systems" required></textarea>
                                <div style="margin-top: 6px; font-size: 12px; color: var(--text-medium);">Start by drafting an editable lecture plan, then generate the deck from that approved plan.</div>
                            </div>
                            <div style="margin-bottom: 16px;">
                                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--text-medium);">
                                    Last Week's Summary
                                </label>
                                <textarea id="lastWeekInput" class="course-profile-modal__input" rows="3" placeholder="Optional: Brief summary of what was covered last week..."></textarea>
                            </div>
                            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                                <button type="button" class="course-profile-modal__btn course-profile-modal__btn--secondary" id="cancelBtn">Cancel</button>
                                <button type="submit" class="course-profile-modal__btn course-profile-modal__btn--primary">Next</button>
                            </div>
                        </form>
                    </div>
                </div>
            `;

      document.body.appendChild(backdrop);

      const form = backdrop.querySelector("#topicForm");
      const input = backdrop.querySelector("#topicInput");
      const lastWeekInput = backdrop.querySelector("#lastWeekInput");
      const cancelBtn = backdrop.querySelector("#cancelBtn");
      const closeBtn = backdrop.querySelector(".modal__close");
      const overlay = backdrop.querySelector(".modal__overlay");

      input.focus();

      const cleanup = () => {
        backdrop.classList.add("hide");
        setTimeout(() => backdrop.remove(), 200);
      };

      form.onsubmit = (e) => {
        e.preventDefault();
        const topic = input.value.trim();
        const lastWeekSummary = lastWeekInput.value.trim();
        if (topic) {
          cleanup();
          resolve({ topic, lastWeekSummary });
        }
      };

      cancelBtn.onclick = () => {
        cleanup();
        resolve(null);
      };

      closeBtn.onclick = () => {
        cleanup();
        resolve(null);
      };

      overlay.onclick = () => {
        cleanup();
        resolve(null);
      };

      // Close on escape
      const onEscape = (e) => {
        if (e.key === "Escape") {
          cleanup();
          resolve(null);
          document.removeEventListener("keydown", onEscape);
        }
      };
      document.addEventListener("keydown", onEscape);
    });
  }

  /**
   * Prompt user for generation options
   * @returns {Promise<Object|null>} Options or null if cancelled
   */
  async promptForOptions() {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "modal";
      backdrop.innerHTML = `
                <div class="modal__overlay"></div>
                <div class="modal__dialog" style="max-width: 500px;">
                    <div class="modal__header">
                        <h2 class="modal__title">Lecture Constraints</h2>
                        <button class="modal__close" aria-label="Close">&times;</button>
                    </div>
                    <div class="modal__body">
                        <form id="optionsForm">
                            <div style="margin-bottom: 16px;">
                                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--text-medium);">
                                    Total Lecture Length (minutes)
                                </label>
                                <input type="number" id="totalMinutes" class="course-profile-modal__input" value="60" min="20" max="240" step="5">
                            </div>
                            <div style="margin-bottom: 16px;">
                                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--text-medium);">
                                    Number of Breaks
                                </label>
                                <input type="number" id="breakCount" class="course-profile-modal__input" value="1" min="0" max="6">
                                <div style="margin-top: 6px; font-size: 12px; color: var(--text-medium);">Breaks appear in the lecture plan table and shape timing, but they do not generate dedicated break slides.</div>
                            </div>
                            <div style="margin-bottom: 16px;">
                                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--text-medium);">
                                    Conceptual Activity Slides
                                </label>
                                <input type="number" id="activityCount" class="course-profile-modal__input" value="${this.currentProfile?.includeActivities ? 1 : 0}" min="0" max="6">
                                <div style="margin-top: 6px; font-size: 12px; color: var(--text-medium);">Activities are generated outside the lecture plan as conceptual discussion or reflection slides with minimal coding.</div>
                            </div>
                            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                                <button type="button" class="course-profile-modal__btn course-profile-modal__btn--secondary" id="cancelBtn">Cancel</button>
                                <button type="submit" class="course-profile-modal__btn course-profile-modal__btn--primary">Draft Plan</button>
                            </div>
                        </form>
                    </div>
                </div>
            `;

      document.body.appendChild(backdrop);

      const form = backdrop.querySelector("#optionsForm");
      const cancelBtn = backdrop.querySelector("#cancelBtn");
      const closeBtn = backdrop.querySelector(".modal__close");
      const overlay = backdrop.querySelector(".modal__overlay");

      const cleanup = () => {
        backdrop.classList.add("hide");
        setTimeout(() => backdrop.remove(), 200);
      };

      form.onsubmit = (e) => {
        e.preventDefault();
        const options = {
          totalMinutes: parseInt(backdrop.querySelector("#totalMinutes").value) || 60,
          breakCount: parseInt(backdrop.querySelector("#breakCount").value) || 0,
          activityCount: parseInt(backdrop.querySelector("#activityCount").value) || 0,
        };
        cleanup();
        resolve(options);
      };

      cancelBtn.onclick = () => {
        cleanup();
        resolve(null);
      };

      closeBtn.onclick = () => {
        cleanup();
        resolve(null);
      };

      overlay.onclick = () => {
        cleanup();
        resolve(null);
      };

      // Close on escape
      const onEscape = (e) => {
        if (e.key === "Escape") {
          cleanup();
          resolve(null);
          document.removeEventListener("keydown", onEscape);
        }
      };
      document.addEventListener("keydown", onEscape);
    });
  }

  /**
   * Show a lecture plan format error modal with raw AI response.
   * @param {Error} error - Parse/format error from lecture plan generation
   * @param {string} topic - Deck topic
   * @param {Object} options - Generation options
   * @returns {Promise<Object|null>} Fallback lecture plan or null
   */
  async showPlanFormatError(error, topic, options) {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "modal";

      const rawResponse = error.rawResponse || "";
      const jsonPayload = error.jsonPayload || "";

      backdrop.innerHTML = `
                <div class="modal__overlay"></div>
                <div class="modal__dialog" style="max-width: 720px;">
                    <div class="modal__header">
                        <h2 class="modal__title">Lecture Plan Formatting Failed</h2>
                        <button class="modal__close" aria-label="Close">&times;</button>
                    </div>
                    <div class="modal__body" style="display: grid; gap: 12px;">
                        <div style="color: var(--text-high);">
                            The AI response could not be converted into a valid lecture plan. You can copy the raw output or continue with a basic fallback plan.
                        </div>
                        <label style="font-size: 12px; color: var(--text-medium);">Raw Response</label>
                        <textarea class="course-profile-modal__input" style="min-height: 180px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;" readonly>${this.escapeHtml(rawResponse)}</textarea>
                        ${
                          jsonPayload
                            ? `<label style="font-size: 12px; color: var(--text-medium);">Extracted JSON (best effort)</label>
                        <textarea class="course-profile-modal__input" style="min-height: 120px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;" readonly>${this.escapeHtml(jsonPayload)}</textarea>`
                            : ""
                        }
                    </div>
                    <div class="modal__footer" style="display: flex; justify-content: space-between; align-items: center;">
                        <button type="button" class="btn btn--sm" id="copyResponseBtn">Copy Raw Response</button>
                        <div style="display: flex; gap: 10px;">
                            <button type="button" class="btn btn--sm" id="cancelBtn">Close</button>
                            <button type="button" class="btn btn--sm btn--primary" id="fallbackBtn">Use Fallback Plan</button>
                        </div>
                    </div>
                </div>
            `;

      document.body.appendChild(backdrop);

      const closeBtn = backdrop.querySelector(".modal__close");
      const overlay = backdrop.querySelector(".modal__overlay");
      const cancelBtn = backdrop.querySelector("#cancelBtn");
      const fallbackBtn = backdrop.querySelector("#fallbackBtn");
      const copyResponseBtn = backdrop.querySelector("#copyResponseBtn");

      const cleanup = () => {
        backdrop.classList.add("hide");
        setTimeout(() => backdrop.remove(), 200);
      };

      const resolveWith = (value) => {
        cleanup();
        resolve(value);
      };

      closeBtn.onclick = () => resolveWith(null);
      overlay.onclick = () => resolveWith(null);
      cancelBtn.onclick = () => resolveWith(null);
      fallbackBtn.onclick = () => {
        const fallback = LecturePlanGenerator.generateFallbackPlan(topic, options);
        resolveWith(fallback);
      };

      copyResponseBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(rawResponse);
          Notification.success("Raw response copied");
        } catch {
          Notification.error("Failed to copy response");
        }
      };
    });
  }

  /**
   * Show compact post-generation confirmation (deck is already loaded at this point)
   * @param {string} markdown - Generated markdown
   * @param {string} topic - Topic
   */
  async showDeckPreview(markdown, topic) {
    const slideCount = markdown.split(/\n---\n/).filter(Boolean).length;
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "modal";
      backdrop.innerHTML = `
                <div class="modal__overlay"></div>
                <div class="modal__dialog" style="max-width: 420px;">
                    <div class="modal__header">
                        <h2 class="modal__title">Deck Ready</h2>
                        <button class="modal__close" aria-label="Close">&times;</button>
                    </div>
                    <div class="modal__body">
                        <p style="color: var(--text-high); margin-bottom: 20px;">
                            ${slideCount} slide${slideCount !== 1 ? "s" : ""} generated and loaded. Review and edit using the editor panel.
                        </p>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <button id="saveBtn" class="course-profile-modal__btn course-profile-modal__btn--secondary" style="width: 100%;">
                                💾 Save as Markdown File
                            </button>
                            <button id="closeBtn" class="course-profile-modal__btn course-profile-modal__btn--primary" style="width: 100%;">
                                View Deck
                            </button>
                        </div>
                    </div>
                </div>
            `;

      document.body.appendChild(backdrop);

      const saveBtn = backdrop.querySelector("#saveBtn");
      const closeBtn = backdrop.querySelector("#closeBtn");
      const headerCloseBtn = backdrop.querySelector(".modal__close");
      const overlay = backdrop.querySelector(".modal__overlay");

      const onEscape = (e) => {
        if (e.key === "Escape") {
          cleanup();
        }
      };

      const cleanup = () => {
        document.removeEventListener("keydown", onEscape);
        backdrop.classList.add("hide");
        setTimeout(() => backdrop.remove(), 200);
        resolve();
      };

      saveBtn.onclick = () => {
        cleanup();
        this.saveToFile(markdown, topic);
      };

      closeBtn.onclick = cleanup;
      headerCloseBtn.onclick = cleanup;
      overlay.onclick = cleanup;

      document.addEventListener("keydown", onEscape);
    });
  }

  /**
   * Load generated deck into editor
   * @param {string} markdown - Generated markdown
   */
  async loadIntoEditor(markdown, topic = "") {
    // Load the markdown into the deck
    const fileName = this.buildDeckFileName(topic);
    await this.loadMarkdown(markdown, { fileName });
  }

  buildDeckFileName(topic) {
    const fallback = "ai-generated.md";
    const cleanTopic = String(topic || "")
      .toLowerCase()
      .trim();
    if (!cleanTopic) return fallback;
    const slug = cleanTopic.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!slug) return fallback;
    return `${slug}.md`;
  }

  /**
   * Save deck to file
   * @param {string} markdown - Generated markdown
   * @param {string} topic - Topic (for filename)
   */
  async saveToFile(markdown, topic) {
    const filename = `${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`;

    // Use File System Access API if available
    if (window.showSaveFilePicker) {
      try {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: "Markdown file",
              accept: { "text/markdown": [".md"] },
            },
          ],
        });

        const writable = await fileHandle.createWritable();
        await writable.write(markdown);
        await writable.close();

        Notification.success("Deck saved successfully!");
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Save failed:", error);
          Notification.error("Failed to save file");
        }
      }
    } else {
      // Fallback: download as blob
      const blob = new Blob([markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      Notification.success("Deck downloaded!");
    }
  }

  /**
   * Load markdown into the current deck
   * @param {string} markdown - Markdown content
   */
  async loadMarkdown(markdown, options = {}) {
    try {
      // Parse the markdown
      const deckData = await DeckLoader.parseMarkdown(markdown);

      if (!deckData || !deckData.slides) {
        throw new Error("Failed to parse markdown: no slides generated");
      }

      const { fileName } = options;

      if (markdown) {
        localStorage.setItem("webdeck_local_file", markdown);
        localStorage.setItem("webdeck_local_file_type", "md");
        if (fileName) {
          localStorage.setItem("webdeck_local_file_name", fileName);
        }
        localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
      }

      // Update the current deck using the reload manager if available
      if (this.controller?.reloadManager?.replaceDeck) {
        await this.controller.reloadManager.replaceDeck(deckData, { startAtFirstSlide: true });
      } else {
        Object.assign(this.deck.meta, deckData.meta);
        this.deck.slides = deckData.slides;

        const slidesContainer = document.getElementById("slidesContainer");
        if (slidesContainer) {
          slidesContainer.innerHTML = "";
        }

        if (this.controller?.render) {
          this.controller.render();
        }
      }

      // Update editor if open
      const editor = document.getElementById("markdownEditor");
      if (editor && editor.CodeMirror) {
        editor.CodeMirror.setValue(markdown);
      }

      Notification.success("Deck loaded into editor!");
    } catch (error) {
      console.error("Failed to load markdown:", error);
      Notification.error(`Failed to load deck: ${error.message}`);
    }
  }

  /**
   * Get API key for a provider
   * @param {string} providerId - Provider ID
   * @returns {string|null} API key
   */
  getApiKey(providerId) {
    // Use the registry directly (already imported at top of file)
    return AIProviderRegistry.getApiKey(providerId);
  }

  /**
   * Show a loading modal during generation
   * @param {string} message - Message to display
   * @returns {HTMLElement} Modal element
   */
  showLoadingModal(message, { allowCancel = false, onCancel = null } = {}) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal loading-modal";

    const cancelHtml = allowCancel
      ? `<button type="button" class="btn btn--sm loading-modal__cancel">Cancel</button>`
      : "";

    backdrop.innerHTML = `
            <div class="modal__overlay"></div>
            <div class="modal__dialog loading-modal__dialog">
                <div class="loading-modal__content">
                    <div class="loading-modal__spinner"></div>
                    <div class="loading-modal__message">${message}</div>
                    <div class="loading-modal__hint">This may take a moment...</div>
                    ${cancelHtml}
                </div>
            </div>
        `;
    document.body.appendChild(backdrop);

    if (allowCancel) {
      const cancelBtn = backdrop.querySelector(".loading-modal__cancel");
      if (cancelBtn) {
        cancelBtn.onclick = () => {
          if (typeof onCancel === "function") {
            onCancel();
          }
        };
      }
    }

    // Trigger animation
    requestAnimationFrame(() => {
      backdrop.classList.add("show");
    });

    return backdrop;
  }

  /**
   * Hide the loading modal
   * @param {HTMLElement} modal - Modal element to hide
   */
  hideLoadingModal(modal) {
    if (!modal || !modal.parentNode) return;

    modal.classList.remove("show");
    modal.classList.add("hide");

    setTimeout(() => {
      if (modal.parentNode) {
        modal.remove();
      }
    }, 200);
  }

  /**
   * Show a detailed deck format error modal with raw AI response
   * @param {Error} error - Parse/format error from deck generation
   * @param {string} topic - Deck topic
   * @param {Object} options - Generation options
   * @returns {Promise<string|null>} Fallback markdown deck or null
   */
  async showDeckFormatError(error, topic, options) {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "modal";

      const rawResponse = error.rawResponse || "";
      const jsonPayload = error.jsonPayload || "";

      backdrop.innerHTML = `
                <div class="modal__overlay"></div>
                <div class="modal__dialog" style="max-width: 720px;">
                    <div class="modal__header">
                        <h2 class="modal__title">Deck Formatting Failed</h2>
                        <button class="modal__close" aria-label="Close">&times;</button>
                    </div>
                    <div class="modal__body" style="display: grid; gap: 12px;">
                        <div style="color: var(--text-high);">
                            The AI response could not be converted into valid deck markdown. You can copy the raw output or continue with a basic fallback deck.
                        </div>
                        <label style="font-size: 12px; color: var(--text-medium);">Raw Response</label>
                        <textarea class="course-profile-modal__input" style="min-height: 180px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;" readonly>${this.escapeHtml(rawResponse)}</textarea>
                        ${
                          jsonPayload
                            ? `<label style="font-size: 12px; color: var(--text-medium);">Extracted JSON (best effort)</label>
                        <textarea class="course-profile-modal__input" style="min-height: 120px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;" readonly>${this.escapeHtml(jsonPayload)}</textarea>`
                            : ""
                        }
                    </div>
                    <div class="modal__footer" style="display: flex; justify-content: space-between; align-items: center;">
                        <button type="button" class="btn btn--sm" id="copyResponseBtn">Copy Raw Response</button>
                        <div style="display: flex; gap: 10px;">
                            <button type="button" class="btn btn--sm" id="cancelBtn">Close</button>
                            <button type="button" class="btn btn--sm btn--primary" id="fallbackBtn">Use Fallback Deck</button>
                        </div>
                    </div>
                </div>
            `;

      document.body.appendChild(backdrop);

      const closeBtn = backdrop.querySelector(".modal__close");
      const overlay = backdrop.querySelector(".modal__overlay");
      const cancelBtn = backdrop.querySelector("#cancelBtn");
      const fallbackBtn = backdrop.querySelector("#fallbackBtn");
      const copyResponseBtn = backdrop.querySelector("#copyResponseBtn");

      const cleanup = () => {
        backdrop.classList.add("hide");
        setTimeout(() => backdrop.remove(), 200);
      };

      const resolveWith = (value) => {
        cleanup();
        resolve(value);
      };

      closeBtn.onclick = () => resolveWith(null);
      overlay.onclick = () => resolveWith(null);
      cancelBtn.onclick = () => resolveWith(null);
      fallbackBtn.onclick = () => {
        const planEstimatedSlideCount = this.currentLecturePlan?.estimatedSlideCount;
        const slideCount =
          planEstimatedSlideCount ??
          options?.slideCount ??
          this.currentProfile?.defaultSlideCount ??
          5;
        const fallback = DeckGenerator.generateFallbackDeck(topic, slideCount);
        resolveWith(fallback);
      };

      copyResponseBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(rawResponse);
          Notification.success("Raw response copied");
        } catch {
          Notification.error("Failed to copy response");
        }
      };
    });
  }

  /**
   * Show a detailed error modal during generation
   * @param {Error} error - Generation error
   */
  async showGenerationError(error) {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "modal";

      const message = error?.message || "Generation failed.";
      const details = error?.stack || String(error);

      backdrop.innerHTML = `
                <div class="modal__overlay"></div>
                <div class="modal__dialog" style="max-width: 640px;">
                    <div class="modal__header">
                        <h2 class="modal__title">Generation Error</h2>
                        <button class="modal__close" aria-label="Close">&times;</button>
                    </div>
                    <div class="modal__body" style="display: grid; gap: 12px;">
                        <div style="color: var(--text-high);">${this.escapeHtml(message)}</div>
                        <label style="font-size: 12px; color: var(--text-medium);">Details</label>
                        <textarea class="course-profile-modal__input" style="min-height: 140px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;" readonly>${this.escapeHtml(details)}</textarea>
                    </div>
                    <div class="modal__footer" style="display: flex; justify-content: space-between; align-items: center;">
                        <button type="button" class="btn btn--sm" id="copyErrorBtn">Copy Error Details</button>
                        <button type="button" class="btn btn--sm" id="closeBtn">Close</button>
                    </div>
                </div>
            `;

      document.body.appendChild(backdrop);

      const closeBtn = backdrop.querySelector(".modal__close");
      const overlay = backdrop.querySelector(".modal__overlay");
      const footerCloseBtn = backdrop.querySelector("#closeBtn");
      const copyErrorBtn = backdrop.querySelector("#copyErrorBtn");

      const cleanup = () => {
        backdrop.classList.add("hide");
        setTimeout(() => backdrop.remove(), 200);
      };

      const resolveWith = () => {
        cleanup();
        resolve();
      };

      closeBtn.onclick = resolveWith;
      overlay.onclick = resolveWith;
      footerCloseBtn.onclick = resolveWith;

      copyErrorBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(details);
          Notification.success("Error details copied");
        } catch {
          Notification.error("Failed to copy error details");
        }
      };
    });
  }

  /**
   * Escape HTML for safe injection in modals
   * @param {string} unsafe - Raw string
   * @returns {string} Escaped string
   */
  escapeHtml(unsafe) {
    return String(unsafe)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
