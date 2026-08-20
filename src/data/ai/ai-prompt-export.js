/**
 * AI Prompt Export
 *
 * Builds the exact system + user messages the orchestrator would send to the
 * AI provider, formatted as plain text so a user can copy/download them and
 * run the prompt in an external tool (Claude, ChatGPT, a local model, etc.).
 *
 * The message construction mirrors `WholeDeckOrchestrator.runWholeDeckSingleCall`
 * so the exported prompt is byte-identical to what the in-app flow sends.
 */

import { buildMessagesForIntent, buildPolishMessages } from "./ai-intent-registry.js";
import { buildGenerateOptionsSuffix } from "./ai-prompt-builder.js";

/**
 * Build the exportable prompt for a whole-deck AI operation.
 *
 * Produces the same `{ system, user }` pair (and the same `optionsSuffix`)
 * the orchestrator builds internally, plus a `messages` array shaped like the
 * provider's input and a `formattedText` string suitable for clipboard/file.
 *
 * Only the single-phase whole-deck path (polish / generate / remix-single-phase
 * / reimagine-single-phase) is supported. The two-phase remix/reimagine
 * plan→execute flow is not exportable here because the execute phase consumes
 * an internal virtual deck built from the plan, which an external tool cannot
 * reproduce.
 *
 * @param {import("./ai-operation.js").AiOperation} operation — a whole-deck
 *   operation created via `createOperation("generate", null, markdown, opts)`.
 * @returns {{ system: string, user: string, optionsSuffix: string, messages: Array<{role: string, content: string}>, formattedText: string }}
 */
export function buildExportablePrompt(operation) {
  if (!operation || typeof operation !== "object") {
    throw new TypeError("buildExportablePrompt: operation is required");
  }
  const { context, opts = {} } = operation;
  if (typeof context !== "string") {
    throw new TypeError("buildExportablePrompt: operation.context must be a string");
  }

  const hasVisualSystem = !!opts.visualSystem;
  const { system, user } =
    opts.mode === "polish"
      ? buildPolishMessages(context)
      : buildMessagesForIntent("generate", {
          markdown: context,
          hasVisualSystem,
          preserveVisualIdentity: opts.preserveVisualIdentity,
        });
  const optionsSuffix = buildGenerateOptionsSuffix(opts);
  const userText = user + optionsSuffix;
  const messages = [
    { role: "system", content: system },
    { role: "user", content: userText },
  ];
  const formattedText = formatPromptForExport({ system, user: userText });
  return { system, user: userText, optionsSuffix, messages, formattedText };
}

/**
 * Format a system + user message pair as readable text for clipboard/file export.
 * @param {{ system: string, user: string }} param0
 * @returns {string}
 */
export function formatPromptForExport({ system, user }) {
  return `### System\n\n${system}\n\n### User\n\n${user}`;
}
