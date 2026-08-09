/**
 * Compose system and user prompts from reusable fragments.
 * Replaces the inline `fixPrompt.replace("{{markdown}}", cleaned)` pattern.
 *
 * Composition is strict: every `{{placeholder}}` in a fragment must be
 * supplied, and every supplied substitution must be used. A typo in a
 * placeholder or a substitution key fails loudly instead of sending a
 * literal `{{placeholder}}` to the model.
 */

/**
 * Collect all `{{placeholder}}` names present in the given fragments.
 * @param {...string} fragments
 * @returns {Set<string>}
 */
export function collectPlaceholders(...fragments) {
  const set = new Set();
  for (const fragment of fragments) {
    for (const match of fragment.matchAll(/\{\{(\w+)\}\}/g)) {
      set.add(match[1]);
    }
  }
  return set;
}

/**
 * Replace `{{placeholders}}` in a fragment with the given substitutions.
 * Uses a function replacement to avoid String.replaceAll's special
 * substitution patterns ($$, $&, $`, $') which corrupt dollar signs in deck
 * content (e.g. $$...$$ math delimiters).
 *
 * When `strict` is true, throws if any `{{placeholder}}` remains after
 * substitution. Compose does not use strict mode: substituted deck content
 * may legitimately contain `{{...}}` (e.g. template syntax), and those must
 * pass through untouched.
 *
 * @param {string} fragment
 * @param {Object<string, string>} substitutions
 * @param {object} [opts]
 * @param {boolean} [opts.strict] — throw on leftover placeholders
 * @returns {string}
 */
export function replacePlaceholders(fragment, substitutions, { strict = false } = {}) {
  let result = fragment;
  for (const [key, value] of Object.entries(substitutions)) {
    const placeholder = `{{${key}}}`;
    const replacement = () => value;
    result = result.replaceAll(placeholder, replacement);
  }
  if (strict) {
    const remaining = [...new Set(result.match(/\{\{(\w+)\}\}/g) || [])];
    if (remaining.length > 0) {
      throw new Error(`Unresolved placeholder(s) after substitution: ${remaining.join(", ")}`);
    }
  }
  return result;
}

export class AiPromptComposer {
  /**
   * @param {object} opts
   * @param {string} opts.systemFragment  — raw system prompt text
   * @param {string} opts.userFragment    — raw user prompt template with {{placeholders}}
   */
  constructor({ systemFragment, userFragment }) {
    this._system = systemFragment;
    this._user = userFragment;
  }

  /**
   * @param {Object} substitutions — e.g. { markdown: "...", layoutList: "..." }
   * @returns {{ system: string, user: string }}
   */
  compose(substitutions) {
    const placeholders = collectPlaceholders(this._system, this._user);
    const missing = [...placeholders].filter((p) => !(p in substitutions));
    if (missing.length > 0) {
      throw new Error(
        `Missing substitution(s) for placeholder(s): ${missing.map((p) => `{{${p}}}`).join(", ")}. ` +
          `Add the missing key(s) to the compose call.`,
      );
    }
    const unused = Object.keys(substitutions).filter((key) => !placeholders.has(key));
    if (unused.length > 0) {
      throw new Error(
        `Unused substitution(s): ${unused.map((k) => `{{${k}}}`).join(", ")}. ` +
          `No such placeholder exists in the fragments.`,
      );
    }
    // Substitute `{{markdown}}` LAST so the inserted deck content is never
    // re-scanned by the other substitution passes: a deck containing the
    // literal text `{{layoutList}}` or `{{outputFormat}}` must pass through
    // untouched instead of being replaced inside the user's own content.
    const entries = Object.entries(substitutions);
    const ordered = entries.sort((a, b) => {
      if (a[0] === "markdown") return 1;
      if (b[0] === "markdown") return -1;
      return 0;
    });
    const orderedSubstitutions = Object.fromEntries(ordered);
    return {
      system: replacePlaceholders(this._system, orderedSubstitutions),
      user: replacePlaceholders(this._user, orderedSubstitutions),
    };
  }
}
