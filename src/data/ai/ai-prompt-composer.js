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
 * When `strict` is true, throws if the template declares a placeholder with
 * no supplied substitution. The check is computed from the template's own
 * placeholders before substitution — never by scanning the substituted
 * result, because substituted values can legitimately contain `{{...}}`
 * (e.g. validation errors that embed model output echoing deck template
 * syntax). Compose does not use strict mode: substituted deck content may
 * contain `{{...}}` and must pass through untouched.
 *
 * @param {string} fragment
 * @param {Object<string, string>} substitutions
 * @param {object} [opts]
 * @param {boolean} [opts.strict] — throw on template placeholders without a key
 * @returns {string}
 */
export function replacePlaceholders(fragment, substitutions, { strict = false } = {}) {
  if (strict) {
    const placeholders = collectPlaceholders(fragment);
    const missing = [...placeholders].filter((p) => !Object.hasOwn(substitutions, p));
    if (missing.length > 0) {
      throw new Error(
        `Unresolved placeholder(s) in template: ${missing.map((p) => `{{${p}}}`).join(", ")}. ` +
          `Add the missing key(s) to the substitution call.`,
      );
    }
  }
  // Single pass: every {{placeholder}} resolves simultaneously. A substituted
  // value containing {{...}} (deck content, model-echoed error text, guidance
  // fragments) is inserted as-is and never re-scanned, because the regex only
  // matches positions in the original fragment text. This protects every
  // substitution key — not just {{markdown}} — from nested expansion. The
  // function replacement also keeps $$/$&/$`/$' in values literal.
  // Object.hasOwn (not `in`) so inherited keys like toString/constructor are
  // never spliced into the prompt.
  return fragment.replace(/\{\{(\w+)\}\}/g, (match, name) =>
    Object.hasOwn(substitutions, name) ? substitutions[name] : match,
  );
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
    const missing = [...placeholders].filter((p) => !Object.hasOwn(substitutions, p));
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
    // replacePlaceholders resolves all placeholders in a single pass, so no
    // substituted value (deck content, guidance fragments) is ever re-scanned
    // by another substitution.
    return {
      system: replacePlaceholders(this._system, substitutions),
      user: replacePlaceholders(this._user, substitutions),
    };
  }
}
