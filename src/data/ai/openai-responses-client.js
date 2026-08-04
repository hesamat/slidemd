import { AiAbortError, AiHttpError, AiParseError } from "./ai-provider-client.js";

/**
 * OpenAI Responses API client (/v1/responses).
 *
 * The Responses API differs from chat/completions:
 * - System messages become a top-level "instructions" field
 * - The messages array becomes an "input" array
 * - max_tokens becomes max_output_tokens
 * - The response shape is: { output: [{ content: [{ type: "output_text", text: "..." }] }], usage: {...} }
 * - finish_reason is in: status or output[].status
 *
 * @typedef {import("./ai-provider-client.js").ChatRequest} ChatRequest
 * @typedef {import("./ai-provider-client.js").ChatResponse} ChatResponse
 */

export class OpenAIResponsesClient {
  /**
   * @param {object} opts
   * @param {() => string} opts.getBaseUrl
   * @param {() => string} opts.getApiKey
   * @param {() => string} opts.getModel
   */
  constructor({ getBaseUrl, getApiKey, getModel }) {
    this._getBaseUrl = getBaseUrl;
    this._getApiKey = getApiKey;
    this._getModel = getModel;
  }

  /**
   * @param {ChatRequest} request
   * @param {AbortSignal} [signal]
   * @returns {Promise<ChatResponse>}
   * @throws {AiAbortError|AiHttpError|AiParseError}
   */
  async chat({ messages, maxTokens, responseFormat, reasoning }, signal) {
    if (signal?.aborted) {
      throw new AiAbortError();
    }

    const apiKey = this._getApiKey();
    if (!apiKey) {
      throw new AiHttpError(0, "API key is required");
    }

    const baseUrl = (this._getBaseUrl() || "").replace(/\/+$/, "");
    const url = `${baseUrl}/v1/responses`;

    const { instructions, input } = this._mapMessages(messages);
    const body = {
      model: this._getModel(),
      input,
      max_output_tokens: maxTokens,
    };
    if (instructions) {
      body.instructions = instructions;
    }
    if (responseFormat?.type === "json_object") {
      body.text = { format: { type: "json_object" } };
    }
    if (reasoning) {
      body.reasoning = reasoning;
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        throw new AiHttpError(res.status, bodyText);
      }

      const json = await res.json().catch(() => {
        throw new AiParseError("Failed to parse Responses API JSON");
      });

      const content = this._extractContent(json);
      if (typeof content !== "string") {
        throw new AiParseError("Responses API missing output text");
      }

      const finishReason = this._mapFinishReason(json);
      const usage = json.usage
        ? {
            prompt_tokens: json.usage.input_tokens,
            completion_tokens: json.usage.output_tokens,
            total_tokens: (json.usage.input_tokens || 0) + (json.usage.output_tokens || 0),
          }
        : null;

      return { content, usage, raw: { ...json, finish_reason: finishReason } };
    } catch (err) {
      if (err instanceof AiHttpError || err instanceof AiParseError) {
        throw err;
      }
      if (signal?.aborted || err.name === "AbortError") {
        throw new AiAbortError();
      }
      throw new AiHttpError(0, String(err.message || err));
    }
  }

  /**
   * Map chat-style messages to Responses API format.
   * System messages become "instructions"; user/assistant become "input" items.
   * @param {Array<{role: string, content: string}>} messages
   * @returns {{ instructions: string, input: Array<{role: string, content: string}> }}
   */
  _mapMessages(messages) {
    const instructionsParts = [];
    const input = [];

    for (const msg of messages) {
      const text = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      if (msg.role === "system") {
        instructionsParts.push(text);
      } else {
        input.push({ role: msg.role, content: text });
      }
    }

    return {
      instructions: instructionsParts.join("\n\n"),
      input,
    };
  }

  /**
   * Extract text from the Responses API output array.
   * The output array contains items with type "message" that have content arrays.
   * Each content item may have type "output_text" with a text field.
   * @param {object} json
   * @returns {string|null}
   */
  _extractContent(json) {
    const output = Array.isArray(json.output) ? json.output : [];
    const texts = [];
    for (const item of output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part.type === "output_text" && typeof part.text === "string") {
            texts.push(part.text);
          }
        }
      }
    }
    if (texts.length === 0) return null;
    return texts.join("");
  }

  /**
   * Map the Responses API status to a finish_reason compatible with our pipeline.
   * @param {object} json
   * @returns {string|null}
   */
  _mapFinishReason(json) {
    // Check top-level status first
    if (json.status === "completed") return "stop";
    if (json.status === "incomplete" || json.status === "incomplete_output") return "length";
    // Check the last output item
    const output = Array.isArray(json.output) ? json.output : [];
    const last = output[output.length - 1];
    if (last?.status === "completed") return "stop";
    if (last?.status === "incomplete") return "length";
    return json.status || null;
  }
}
