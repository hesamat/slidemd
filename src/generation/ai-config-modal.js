/**
 * AI Configuration Modal
 * Modal for configuring AI providers and API keys
 */

import { Notification } from "../renderer/notification.js";
import { AIProviderRegistry } from "./ai-provider-registry.js";

export class AIConfigModal {
  static backdrop = null;

  /**
   * Show AI configuration modal
   * @returns {Promise<Object|null>} Configuration object or null if cancelled
   */
  static async show() {
    return new Promise((resolve) => {
      const backdrop = this.createModal();
      document.body.appendChild(backdrop);

      const form = backdrop.querySelector(".ai-config-modal__form");
      const confirmBtn = backdrop.querySelector(".ai-config-modal__btn--primary");
      const cancelBtn = backdrop.querySelector(".ai-config-modal__btn--secondary");

      // Get UI elements
      const providerCards = backdrop.querySelectorAll(".ai-config-modal__provider-card");
      const apiKeyInput = backdrop.querySelector('[name="apiKey"]');
      const modelSelect = backdrop.querySelector('[name="model"]');
      const testBtn = backdrop.querySelector(".ai-config-modal__test-btn");
      const apiKeyToggle = backdrop.querySelector(".ai-config-modal__api-key-toggle");

      // Load current settings
      const defaultProvider = AIProviderRegistry.getDefaultProvider();
      if (defaultProvider) {
        const selectedCard = backdrop.querySelector(
          `[data-provider="${defaultProvider.providerId}"]`,
        );
        if (selectedCard) {
          selectProvider(selectedCard);
        }
      }

      // Provider selection
      function selectProvider(card) {
        providerCards.forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");

        const providerId = card.dataset.provider;
        const provider = AIProviderRegistry.getProvider(providerId);

        // Update model options
        modelSelect.innerHTML = provider.models
          .map((m) => `<option value="${m.id}">${m.name}</option>`)
          .join("");

        // Load saved API key and model
        const savedKey = AIProviderRegistry.getApiKey(providerId);
        const savedModel = AIProviderRegistry.getModel(providerId);

        if (savedKey) {
          apiKeyInput.value = savedKey;
        } else {
          apiKeyInput.value = "";
        }

        if (savedModel) {
          modelSelect.value = savedModel;
        }

        // Update test button
        testBtn.classList.remove(
          "ai-config-modal__test-btn--success",
          "ai-config-modal__test-btn--error",
        );
        testBtn.textContent = "Test API Key";
      }

      providerCards.forEach((card) => {
        card.onclick = () => selectProvider(card);
      });

      // API key visibility toggle
      apiKeyToggle.onclick = () => {
        const type = apiKeyInput.type === "password" ? "text" : "password";
        apiKeyInput.type = type;
        apiKeyToggle.innerHTML =
          type === "password"
            ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`
            : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
      };

      // Test API key
      testBtn.onclick = async () => {
        const providerId = backdrop.querySelector(".ai-config-modal__provider-card.selected")
          ?.dataset.provider;
        if (!providerId) {
          Notification.error("Please select a provider");
          return;
        }

        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
          Notification.error("Please enter an API key");
          return;
        }

        testBtn.classList.add("testing");
        testBtn.textContent = "Testing...";

        const result = await AIProviderRegistry.testApiKey(providerId, apiKey);

        testBtn.classList.remove("testing");

        if (result.valid) {
          testBtn.classList.add("ai-config-modal__test-btn--success");
          testBtn.textContent = "✓ Valid";
          Notification.success("API key is valid!");
        } else {
          testBtn.classList.add("ai-config-modal__test-btn--error");
          testBtn.textContent = "✗ Invalid";
          Notification.error("API key test failed: " + result.error);
        }
      };

      // Form submission
      const submit = async () => {
        const selectedCard = backdrop.querySelector(".ai-config-modal__provider-card.selected");
        if (!selectedCard) {
          Notification.error("Please select a provider");
          return;
        }

        const providerId = selectedCard.dataset.provider;
        const apiKey = apiKeyInput.value.trim();
        const model = modelSelect.value;

        if (!apiKey) {
          const provider = AIProviderRegistry.getProvider(providerId);
          if (provider.requiresAuth !== false) {
            Notification.error("Please enter an API key");
            return;
          }
        }

        // Save settings
        if (apiKey) {
          AIProviderRegistry.setApiKey(providerId, apiKey);
        }
        AIProviderRegistry.setModel(providerId, model);

        const result = { providerId, model };
        cleanup();
        resolve(result);
      };

      confirmBtn.onclick = submit;
      form.onsubmit = (e) => {
        e.preventDefault();
        submit();
      };

      cancelBtn.onclick = () => {
        cleanup();
        resolve(null);
      };

      // Close on escape
      const onEscape = (e) => {
        if (e.key === "Escape") {
          cleanup();
          resolve(null);
        }
      };
      document.addEventListener("keydown", onEscape);

      const cleanup = () => {
        backdrop.classList.add("hide");
        setTimeout(() => backdrop.remove(), 200);
        document.removeEventListener("keydown", onEscape);
      };
    });
  }

  /**
   * Create the modal DOM structure
   * @returns {HTMLElement} Modal element
   */
  static createModal() {
    const backdrop = document.createElement("div");
    backdrop.className = "modal";

    const providers = AIProviderRegistry.getAllProviders();

    const providersHtml = providers
      .map(
        (p) => `
            <label class="ai-config-modal__provider-card" data-provider="${p.providerId}">
                <input type="radio" name="provider" value="${p.providerId}" class="ai-config-modal__provider-radio" ${p.isDefault ? "checked" : ""}>
                <div class="ai-config-modal__provider-info">
                    <div class="ai-config-modal__provider-name">${p.name}</div>
                    <div class="ai-config-modal__provider-description">
                        ${p.openaiCompatible ? "OpenAI-compatible API" : "Native API"}
                    </div>
                </div>
                ${p.isDefault ? '<span class="ai-config-modal__provider-badge">Default</span>' : ""}
            </label>
        `,
      )
      .join("");

    backdrop.innerHTML = `
            <div class="modal__overlay"></div>
            <div class="modal__dialog ai-config-modal">
                <div class="modal__header">
                    <h2 class="modal__title">AI Configuration</h2>
                    <button class="modal__close" aria-label="Close">&times;</button>
                </div>
                <div class="modal__body">
                    <form class="ai-config-modal__form">
                        <div class="ai-config-modal__form-group">
                            <label class="ai-config-modal__label">Select AI Provider</label>
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                ${providersHtml}
                            </div>
                        </div>

                        <div class="ai-config-modal__form-group">
                            <label class="ai-config-modal__label">API Key</label>
                            <div class="ai-config-modal__api-key-group">
                                <input type="password" class="ai-config-modal__input ai-config-modal__api-key-input" name="apiKey" placeholder="Enter your API key">
                                <button type="button" class="ai-config-modal__api-key-toggle" title="Toggle visibility">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                        <circle cx="12" cy="12" r="3"></circle>
                                    </svg>
                                </button>
                            </div>
                            <div class="ai-config-modal__helper">Your API key is stored locally in your browser and never sent to our servers.</div>
                        </div>

                        <div class="ai-config-modal__form-group">
                            <label class="ai-config-modal__label">Model</label>
                            <select class="ai-config-modal__select" name="model">
                                <!-- Populated dynamically based on selected provider -->
                            </select>
                        </div>

                        <button type="button" class="ai-config-modal__test-btn">Test API Key</button>

                        <div class="ai-config-modal__actions">
                            <button type="button" class="ai-config-modal__btn ai-config-modal__btn--secondary">Cancel</button>
                            <button type="submit" class="ai-config-modal__btn ai-config-modal__btn--primary">Save Configuration</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

    // Close button handler
    backdrop.querySelector(".modal__close").onclick = () => {
      backdrop.classList.add("hide");
      setTimeout(() => backdrop.remove(), 200);
    };

    // Overlay click to close
    backdrop.querySelector(".modal__overlay").onclick = () => {
      backdrop.classList.add("hide");
      setTimeout(() => backdrop.remove(), 200);
    };

    return backdrop;
  }
}
