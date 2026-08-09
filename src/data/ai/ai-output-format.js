/**
 * Canonical JSON output format expected from the model for slide-producing
 * intents. Injected into system-prompt.md via the {{outputFormat}} placeholder
 * so the prompt and any code that parses the response share one definition.
 */

export const OUTPUT_FORMAT_EXAMPLE = `{
  "slides": [
    { "layout": "header-content", "content": "@header\\n# Title\\n\\n@main\\n- Point 1\\n- Point 2" }
  ]
}`;
