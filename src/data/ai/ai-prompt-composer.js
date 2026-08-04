/**
 * Compose system and user prompts from reusable fragments.
 * Replaces the inline `fixPrompt.replace("{{markdown}}", cleaned)` pattern.
 */

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
    let system = this._system;
    let user = this._user;
    for (const [key, value] of Object.entries(substitutions)) {
      const placeholder = `{{${key}}}`;
      // Use a function replacement to avoid String.replaceAll's special
      // substitution patterns ($$, $&, $`, $') which corrupt dollar signs
      // in deck content (e.g. $$...$$ math delimiters).
      const replacement = () => value;
      system = system.replaceAll(placeholder, replacement);
      user = user.replaceAll(placeholder, replacement);
    }
    return { system, user };
  }
}
