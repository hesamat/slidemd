/**
 * AiIntentRegistry
 *
 * Maps intent names to prompt fragments. Each intent composes { system, user }
 * messages for the AiProviderClient. The registry is the single source of
 * truth for which intents exist and which fragments their prompts use.
 *
 * All fragment copy lives in `src/data/prompts/` and is imported through
 * `ai-prompt-fragments.js`; this module only maps intents to fragments and
 * applies per-intent input transforms (e.g. frontmatter stripping).
 */

import { composeMessages, getFragment, stripFrontmatter } from "./ai-prompt-fragments.js";

const INTENTS = {
  // Single-slide intents — the slide markdown is sent as-is (frontmatter
  // kept — single-slide ops don't strip it because the AI needs to see and
  // preserve the layout).
  enhanceSlide: {
    system: "system-prompt.md",
    user: "fix-prompt.md",
    singleSlide: true,
  },
  addSpeakerNotes: {
    system: "system-prompt.md",
    user: "add-speaker-notes-prompt.md",
    singleSlide: true,
  },
  // Whole-deck intents — strip layout/hidden/code-font-size (generate mode)
  // so the AI can reorganize freely. Background and theme are kept so the AI
  // can see them.
  generate: {
    system: "system-prompt.md",
    user: "generate-prompt.md",
    singleSlide: false,
    transform: (ctx) => ({ markdown: stripFrontmatter(ctx.markdown, "generate") }),
  },
  polish: {
    system: "system-prompt.md",
    user: "polish-prompt.md",
    singleSlide: false,
    // polish-prompt.md combines PPTX-style cleanup with layout improvement
    // while preserving slide count, order, and visual identity. Same
    // frontmatter stripping as generate so the AI can fix layout choices
    // (layout stripped) while seeing background/theme to preserve them.
    transform: (ctx) => ({ markdown: stripFrontmatter(ctx.markdown, "generate") }),
  },
};

/**
 * Compose system + user messages for an intent.
 * @param {string} intent
 * @param {{ markdown: string }} ctx
 * @returns {{ system: string, user: string }}
 */
function composeForIntent(intent, ctx) {
  const def = INTENTS[intent];
  if (!def) throw new Error(`Unknown AI intent: ${intent}`);
  const substitutions = def.transform ? def.transform(ctx) : { markdown: ctx.markdown };
  return composeMessages(getFragment(def.system), getFragment(def.user), substitutions);
}

/**
 * Build messages for the whole-deck polish intent.
 * Kept as a named export for backwards compatibility; it is the same path as
 * buildMessagesForIntent("polish", ...).
 * @param {string} markdown
 * @returns {{ system: string, user: string }}
 */
export function buildPolishMessages(markdown) {
  return buildMessagesForIntent("polish", { markdown });
}

/**
 * Get the user-fragment filename an intent composes with.
 * Used by code that needs the fragment without composing messages (e.g. the
 * batched-message path in ai-prompt-builder.js).
 * @param {string} intent
 * @returns {string}
 */
export function getIntentUserFragment(intent) {
  const def = INTENTS[intent];
  if (!def) throw new Error(`Unknown AI intent: ${intent}`);
  return def.user;
}

/**
 * Get the prompt builder for an intent.
 * @param {string} intent
 * @returns {((ctx: { markdown: string }) => { system: string, user: string })|undefined}
 */
export function getBuilder(intent) {
  if (!(intent in INTENTS)) return undefined;
  return (ctx) => composeForIntent(intent, ctx);
}

/**
 * Build messages for an intent.
 * @param {string} intent
 * @param {{ markdown: string }} ctx
 * @returns {{ system: string, user: string }}
 */
export function buildMessagesForIntent(intent, ctx) {
  return composeForIntent(intent, ctx);
}

/**
 * Check if an intent operates on a single slide.
 * @param {string} intent
 * @returns {boolean}
 */
export function isSingleSlideIntent(intent) {
  return INTENTS[intent]?.singleSlide === true;
}

/**
 * List all registered intent names.
 * @returns {string[]}
 */
export function listIntents() {
  return Object.keys(INTENTS);
}
