// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SettingsModal } from "../editor/settings-modal.js";

const P = "settings-modal__";

/**
 * Stub fetch to return an OpenAI-shaped /models payload. Returns a vi.fn so
 * individual tests can assert on call counts and URLs.
 */
function stubModelsFetch(models = [{ id: "test-model", name: "Test Model" }]) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify({ data: models }),
  });
  globalThis.fetch = fetchMock;
  return fetchMock;
}

/**
 * Open the settings modal and return handles to the key DOM elements.
 * Cleans up the modal after the test by calling SettingsModal.close() in
 * afterEach.
 */
async function openModal() {
  const promise = SettingsModal.show();
  const backdrop = document.querySelector(`.${P}backdrop`);
  const dialog = backdrop.querySelector(`.${P}dialog`);
  const providerSelect = dialog.querySelector('[data-field="provider"]');
  const fetchBtn = dialog.querySelector('[data-action="fetch-models"]');
  const reasoningCheckbox = dialog.querySelector('[data-field="reasoning"]');
  const modelInput = dialog.querySelector(`.${P}model-input`);
  return { promise, backdrop, dialog, providerSelect, fetchBtn, reasoningCheckbox, modelInput };
}

function cancelModal(promise) {
  const backdrop = document.querySelector(`.${P}backdrop`);
  backdrop.querySelector('[data-action="cancel"]').click();
  return promise;
}

describe("SettingsModal provider auto-fetch", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    localStorage.clear();
    sessionStorage.clear();
    // Reset static model caches so tests don't leak state into each other.
    SettingsModal._allModels = [];
    SettingsModal._modelReasoningMap.clear();
    SettingsModal._modelMaxOutputMap.clear();
    SettingsModal._cachedProvider = null;
    SettingsModal._loadingModels = false;
    SettingsModal._lastModelError = "";
  });

  afterEach(() => {
    SettingsModal.close();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("auto-fetches models on open for OpenRouter (default provider)", async () => {
    const fetchMock = stubModelsFetch();
    const { promise } = await openModal();
    // The modal opens and fires #populateOpenRouterModels which calls fetch.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain("openrouter.ai/api/v1/models");
    await cancelModal(promise);
  });

  it("auto-fetches models on open for OpenAI", async () => {
    localStorage.setItem("webdeck_ai_provider", "OpenAI");
    localStorage.setItem("webdeck_ai_base_url", "https://api.openai.com/v1");
    sessionStorage.setItem("webdeck_ai_key_openai", "sk-test");
    const fetchMock = stubModelsFetch();
    const { promise } = await openModal();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain("api.openai.com/v1/models");
    await cancelModal(promise);
  });

  it("does NOT auto-fetch on open for Ollama", async () => {
    localStorage.setItem("webdeck_ai_provider", "Ollama");
    localStorage.setItem("webdeck_ai_base_url", "http://localhost:11434/v1");
    const fetchMock = stubModelsFetch();
    const { promise } = await openModal();
    // Give the async init a chance to run; no fetch should happen.
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).not.toHaveBeenCalled();
    await cancelModal(promise);
  });

  it("does NOT auto-fetch on open for LM Studio", async () => {
    localStorage.setItem("webdeck_ai_provider", "LM Studio");
    localStorage.setItem("webdeck_ai_base_url", "http://localhost:1234/v1");
    const fetchMock = stubModelsFetch();
    const { promise } = await openModal();
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).not.toHaveBeenCalled();
    await cancelModal(promise);
  });

  it("shows the Fetch button for Ollama and LM Studio (manual fetch available)", async () => {
    localStorage.setItem("webdeck_ai_provider", "Ollama");
    localStorage.setItem("webdeck_ai_base_url", "http://localhost:11434/v1");
    stubModelsFetch();
    const { promise, fetchBtn } = await openModal();
    expect(fetchBtn.hidden).toBe(false);
    await cancelModal(promise);
  });

  it("does NOT auto-fetch when switching to Ollama via the provider dropdown", async () => {
    // Start with OpenRouter so the modal opens with an auto-fetch.
    const fetchMock = stubModelsFetch();
    const { promise, providerSelect } = await openModal();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fetchMock.mockClear();
    // Switch to Ollama — should not trigger an auto-fetch.
    providerSelect.value = "Ollama";
    providerSelect.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).not.toHaveBeenCalled();
    await cancelModal(promise);
  });

  it("auto-fetches when switching from Ollama to OpenAI", async () => {
    localStorage.setItem("webdeck_ai_provider", "Ollama");
    localStorage.setItem("webdeck_ai_base_url", "http://localhost:11434/v1");
    const fetchMock = stubModelsFetch();
    const { promise, providerSelect } = await openModal();
    // No fetch on open for Ollama.
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).not.toHaveBeenCalled();
    // Switch to OpenAI — should auto-fetch.
    providerSelect.value = "OpenAI";
    providerSelect.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await cancelModal(promise);
  });
});

describe("SettingsModal persisted reasoning restoration", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    localStorage.clear();
    sessionStorage.clear();
    // Reset static model caches so tests don't leak state into each other.
    SettingsModal._allModels = [];
    SettingsModal._modelReasoningMap.clear();
    SettingsModal._modelMaxOutputMap.clear();
    SettingsModal._cachedProvider = null;
    SettingsModal._loadingModels = false;
    SettingsModal._lastModelError = "";
  });

  afterEach(() => {
    SettingsModal.close();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("restores saved reasoning=true for Ollama when the model supports reasoning", async () => {
    localStorage.setItem("webdeck_ai_provider", "Ollama");
    localStorage.setItem("webdeck_ai_base_url", "http://localhost:11434/v1");
    // Use a model id that guessReasoningForModel recognises as reasoning-capable.
    sessionStorage.setItem("webdeck_ai_model_ollama", "deepseek-r1");
    sessionStorage.setItem("webdeck_ai_reasoning_ollama", "true");
    // No fetch stub needed — Ollama doesn't auto-fetch.
    globalThis.fetch = vi.fn();
    const { promise, reasoningCheckbox } = await openModal();
    // The reasoning checkbox should be restored to checked (not disabled).
    expect(reasoningCheckbox.checked).toBe(true);
    expect(reasoningCheckbox.disabled).toBe(false);
    await cancelModal(promise);
  });

  it("restores saved reasoning=false for Ollama", async () => {
    localStorage.setItem("webdeck_ai_provider", "Ollama");
    localStorage.setItem("webdeck_ai_base_url", "http://localhost:11434/v1");
    sessionStorage.setItem("webdeck_ai_model_ollama", "deepseek-r1");
    sessionStorage.setItem("webdeck_ai_reasoning_ollama", "false");
    globalThis.fetch = vi.fn();
    const { promise, reasoningCheckbox } = await openModal();
    expect(reasoningCheckbox.checked).toBe(false);
    await cancelModal(promise);
  });

  it("restores saved reasoning=true for LM Studio when the model supports reasoning", async () => {
    localStorage.setItem("webdeck_ai_provider", "LM Studio");
    localStorage.setItem("webdeck_ai_base_url", "http://localhost:1234/v1");
    sessionStorage.setItem("webdeck_ai_model_lm_studio", "qwen3");
    sessionStorage.setItem("webdeck_ai_reasoning_lm_studio", "true");
    globalThis.fetch = vi.fn();
    const { promise, reasoningCheckbox } = await openModal();
    expect(reasoningCheckbox.checked).toBe(true);
    expect(reasoningCheckbox.disabled).toBe(false);
    await cancelModal(promise);
  });

  it("does not check reasoning when the saved model does not support reasoning", async () => {
    localStorage.setItem("webdeck_ai_provider", "Ollama");
    localStorage.setItem("webdeck_ai_base_url", "http://localhost:11434/v1");
    // A plain model id that guessReasoningForModel won't flag.
    sessionStorage.setItem("webdeck_ai_model_ollama", "llama3");
    sessionStorage.setItem("webdeck_ai_reasoning_ollama", "true");
    globalThis.fetch = vi.fn();
    const { promise, reasoningCheckbox } = await openModal();
    // Even though saved=true, the model doesn't support reasoning.
    expect(reasoningCheckbox.checked).toBe(false);
    expect(reasoningCheckbox.disabled).toBe(true);
    await cancelModal(promise);
  });

  it("restores saved reasoning for OpenRouter after auto-fetch completes", async () => {
    localStorage.setItem("webdeck_ai_provider", "OpenRouter");
    sessionStorage.setItem("webdeck_ai_model_openrouter", "deepseek/deepseek-r1");
    sessionStorage.setItem("webdeck_ai_reasoning_openrouter", "true");
    stubModelsFetch([{ id: "deepseek/deepseek-r1", name: "DeepSeek R1", reasoning: {} }]);
    const { promise, reasoningCheckbox } = await openModal();
    // After the async fetch + onLoaded callback, the checkbox should be checked.
    await vi.waitFor(() => expect(reasoningCheckbox.checked).toBe(true));
    await cancelModal(promise);
  });
});

describe("SettingsModal save preserves reasoning preference", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    localStorage.clear();
    sessionStorage.clear();
    // Reset static model caches so tests don't leak state into each other.
    SettingsModal._allModels = [];
    SettingsModal._modelReasoningMap.clear();
    SettingsModal._modelMaxOutputMap.clear();
    SettingsModal._cachedProvider = null;
    SettingsModal._loadingModels = false;
    SettingsModal._lastModelError = "";
  });

  afterEach(() => {
    SettingsModal.close();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("saves reasoning=true for Ollama when checkbox is checked and model supports it", async () => {
    localStorage.setItem("webdeck_ai_provider", "Ollama");
    localStorage.setItem("webdeck_ai_base_url", "http://localhost:11434/v1");
    sessionStorage.setItem("webdeck_ai_model_ollama", "deepseek-r1");
    globalThis.fetch = vi.fn();
    const { promise, dialog, reasoningCheckbox } = await openModal();
    expect(reasoningCheckbox.checked).toBe(false);
    // Enable reasoning (model supports it, so checkbox is not disabled).
    reasoningCheckbox.checked = true;
    // Save.
    dialog.querySelector('[data-action="save"]').click();
    const result = await promise;
    expect(result.reasoning).toBe(true);
    expect(sessionStorage.getItem("webdeck_ai_reasoning_ollama")).toBe("true");
  });
});

describe("SettingsModal provider switch restores reasoning preference", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    localStorage.clear();
    sessionStorage.clear();
    SettingsModal._allModels = [];
    SettingsModal._modelReasoningMap.clear();
    SettingsModal._modelMaxOutputMap.clear();
    SettingsModal._cachedProvider = null;
    SettingsModal._loadingModels = false;
    SettingsModal._lastModelError = "";
  });

  afterEach(() => {
    SettingsModal.close();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("restores the new provider's reasoning preference when switching providers", async () => {
    // Start with OpenRouter, reasoning=true, a reasoning-capable model.
    localStorage.setItem("webdeck_ai_provider", "OpenRouter");
    sessionStorage.setItem("webdeck_ai_model_openrouter", "deepseek/deepseek-r1");
    sessionStorage.setItem("webdeck_ai_reasoning_openrouter", "true");
    // Ollama has reasoning=false and a reasoning-capable model.
    sessionStorage.setItem("webdeck_ai_model_ollama", "deepseek-r1");
    sessionStorage.setItem("webdeck_ai_reasoning_ollama", "false");
    localStorage.setItem("webdeck_ai_base_url", "http://localhost:11434/v1");
    stubModelsFetch([{ id: "deepseek/deepseek-r1", name: "DeepSeek R1", reasoning: {} }]);
    const { promise, providerSelect, reasoningCheckbox } = await openModal();
    // OpenRouter init: reasoning should be checked.
    await vi.waitFor(() => expect(reasoningCheckbox.checked).toBe(true));

    // Switch to Ollama — should restore Ollama's saved reasoning=false.
    providerSelect.value = "Ollama";
    providerSelect.dispatchEvent(new Event("change"));
    // Ollama doesn't auto-fetch, so the restore is synchronous.
    expect(reasoningCheckbox.checked).toBe(false);

    await cancelModal(promise);
  });

  it("does not carry over the previous provider's reasoning when switching to a provider with no saved preference", async () => {
    localStorage.setItem("webdeck_ai_provider", "OpenRouter");
    sessionStorage.setItem("webdeck_ai_model_openrouter", "deepseek/deepseek-r1");
    sessionStorage.setItem("webdeck_ai_reasoning_openrouter", "true");
    // LM Studio has a model but no saved reasoning preference (defaults to false).
    sessionStorage.setItem("webdeck_ai_model_lm_studio", "qwen3");
    localStorage.setItem("webdeck_ai_base_url", "http://localhost:1234/v1");
    stubModelsFetch([{ id: "deepseek/deepseek-r1", name: "DeepSeek R1", reasoning: {} }]);
    const { promise, providerSelect, reasoningCheckbox } = await openModal();
    await vi.waitFor(() => expect(reasoningCheckbox.checked).toBe(true));

    // Switch to LM Studio — no saved reasoning, so checkbox should be unchecked.
    providerSelect.value = "LM Studio";
    providerSelect.dispatchEvent(new Event("change"));
    expect(reasoningCheckbox.checked).toBe(false);

    await cancelModal(promise);
  });

  it("preserves reasoning=true when saving before the hosted fetch completes (race)", async () => {
    // Start with Ollama (no auto-fetch), reasoning=true, reasoning-capable model.
    localStorage.setItem("webdeck_ai_provider", "Ollama");
    localStorage.setItem("webdeck_ai_base_url", "http://localhost:11434/v1");
    sessionStorage.setItem("webdeck_ai_model_ollama", "deepseek-r1");
    sessionStorage.setItem("webdeck_ai_reasoning_ollama", "true");
    // OpenAI has reasoning=true and a reasoning-capable model.
    sessionStorage.setItem("webdeck_ai_model_openai", "o3-mini");
    sessionStorage.setItem("webdeck_ai_reasoning_openai", "true");
    sessionStorage.setItem("webdeck_ai_key_openai", "sk-test");

    // Stub fetch with a delayed response that we control. The promise won't
    // resolve until we call _resolveFetch, simulating an in-flight request.
    // We never call it — the test verifies behavior while the fetch is pending.
    let _resolveFetch;
    globalThis.fetch = vi.fn(
      () =>
        new Promise((resolve) => {
          _resolveFetch = () =>
            resolve({
              ok: true,
              text: async () => JSON.stringify({ data: [{ id: "o3-mini", name: "o3-mini" }] }),
            });
        }),
    );

    const { promise, providerSelect, dialog, reasoningCheckbox } = await openModal();
    // Ollama init: reasoning should be checked.
    expect(reasoningCheckbox.checked).toBe(true);

    // Switch to OpenAI — auto-fetch starts but hasn't completed.
    providerSelect.value = "OpenAI";
    providerSelect.dispatchEvent(new Event("change"));

    // The reasoning checkbox should already reflect OpenAI's saved preference
    // (synchronous restore via guessReasoningForModel), even though the fetch
    // hasn't resolved yet.
    expect(reasoningCheckbox.checked).toBe(true);

    // Save before the fetch completes — should preserve reasoning=true.
    dialog.querySelector('[data-action="save"]').click();
    const result = await promise;
    expect(result.reasoning).toBe(true);
    expect(result.provider).toBe("OpenAI");
    expect(sessionStorage.getItem("webdeck_ai_reasoning_openai")).toBe("true");
  });
});
