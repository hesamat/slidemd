/**
 * AiIntentRegistry
 *
 * Maps intent names to prompt builders. Each builder produces { system, user }
 * messages for the AiProviderClient. The registry is the single source of
 * truth for which intents exist and how their prompts are composed.
 */

import { AiPromptComposer } from "./ai-prompt-composer.js";
import { getAllowedLayoutList, stripFrontmatter } from "./ai-prompt-builder.js";
import systemPrompt from "../prompts/system-prompt.md?raw";
import fixPrompt from "../prompts/fix-prompt.md?raw";
import generatePrompt from "../prompts/generate-prompt.md?raw";
import summarizePrompt from "../prompts/summarize-prompt.md?raw";
import toMetricCardsPrompt from "../prompts/to-metric-cards-prompt.md?raw";
import addSpeakerNotesPrompt from "../prompts/add-speaker-notes-prompt.md?raw";

/**
 * Build messages for a single-slide intent.
 * The slide markdown is sent as-is (frontmatter kept — single-slide ops
 * don't strip it because the AI needs to see and preserve the layout).
 * @param {string} userFragment
 * @param {string} slideMarkdown
 * @returns {{ system: string, user: string }}
 */
function buildSingleSlideMessages(userFragment, slideMarkdown) {
  const composer = new AiPromptComposer({
    systemFragment: systemPrompt,
    userFragment,
  });
  return composer.compose({
    markdown: slideMarkdown,
    layoutList: getAllowedLayoutList(),
  });
}

/**
 * Build messages for the whole-deck generate intent.
 * Strips layout/hidden/code-font-size (generate mode) so the AI can
 * reorganize freely. Background and theme are kept so the AI can see them.
 * @param {string} markdown
 * @returns {{ system: string, user: string }}
 */
function buildGenerateMessages(markdown) {
  const cleaned = stripFrontmatter(markdown, "generate");
  const composer = new AiPromptComposer({
    systemFragment: systemPrompt,
    userFragment: generatePrompt,
  });
  return composer.compose({
    markdown: cleaned,
    layoutList: getAllowedLayoutList(),
  });
}

const INTENT_BUILDERS = {
  // Single-slide intents — return { system, user } for one slide
  enhanceSlide: (ctx) => buildSingleSlideMessages(fixPrompt, ctx.markdown),
  summarize: (ctx) => buildSingleSlideMessages(summarizePrompt, ctx.markdown),
  toMetricCards: (ctx) => buildSingleSlideMessages(toMetricCardsPrompt, ctx.markdown),
  addSpeakerNotes: (ctx) => buildSingleSlideMessages(addSpeakerNotesPrompt, ctx.markdown),
  // Whole-deck intent — returns { system, user } for the full deck
  generate: (ctx) => buildGenerateMessages(ctx.markdown),
};

/**
 * Get the prompt builder for an intent.
 * @param {string} intent
 * @returns {((ctx: { markdown: string }) => { system: string, user: string })|undefined}
 */
export function getBuilder(intent) {
  return INTENT_BUILDERS[intent];
}

/**
 * Build messages for an intent.
 * @param {string} intent
 * @param {{ markdown: string }} ctx
 * @returns {{ system: string, user: string }}
 */
export function buildMessagesForIntent(intent, ctx) {
  const builder = INTENT_BUILDERS[intent];
  if (!builder) throw new Error(`Unknown AI intent: ${intent}`);
  return builder(ctx);
}

/**
 * Check if an intent is a single-slide intent.
 * @param {string} intent
 * @returns {boolean}
 */
export function isSingleSlideIntent(intent) {
  return intent !== "generate";
}

/**
 * List all registered intent names.
 * @returns {string[]}
 */
export function listIntents() {
  return Object.keys(INTENT_BUILDERS);
}
