# Phase 11: AI Operations Foundation — Implementation Plan

## Objective

Build the stateless AI building blocks and wire them into the existing whole-deck AI flow. After this phase, the AI feature uses a configurable OpenAI-compatible provider (#148), validates output against layout/area/content rules (#150), and composes prompts from reusable fragments. No operation model, registry, or orchestrator — those are Phase 13.

## Current State (do not assume — verify by reading the files)

- `src/data/ai-enhancer.js` (~473 lines): prompt building (`buildMessages`, `buildBatchMessages`), JSON parsing (`parseAiResponse`), directive extract/restore (`extractDirectives`, `injectDirectives`, `restoreDirectives`), token estimation (`estimateMaxTokens`), slide conversion (`slidesToMarkdown`), count-only validation (`validateFixOutput`).
- `src/editor/ai-sidebar.js` (~644 lines): UI panel, single-call path (`#runSingleCall` ~line 384), batch path (`#streamBatch` ~line 510), hardcoded `OPENROUTER_URL` at line 12, two `fetch()` call sites (~line 435, ~line 572).
- `src/editor/settings-modal.js` (~449 lines): API key/model/reasoning/effort in `webdeck_openrouter_*` storage keys, model dropdown fetched from `https://openrouter.ai/api/v1/models`.
- `src/data/prompts/system-prompt.md` (79 lines), `generate-prompt.md` (99 lines), `fix-prompt.md` (69 lines): loaded as `?raw` in `ai-enhancer.js:8-10`, substituted via `fixPrompt.replace("{{markdown}}", cleaned)`.
- `src/data/markdown-parser.js` (~945 lines): `parseDeckMarkdown()` at line 728, `parseAreas()` static at line 417, validates area markers against layout at line 813.
- `src/data/layout-data.js` (~246 lines): `hasLayout()` at line 232, `getAreaNames()` at line 190.
- `src/__tests__/ai-enhancer.test.js` (~503 lines): unit tests for all ai-enhancer functions.

## New Files to Create

```
src/data/ai/
  ai-provider-client.js       # OpenAI-compatible /chat/completions client
  ai-output-schema.js         # Per-intent expected Markdown structure
  ai-output-validator.js      # Parse + validate layout/areas/slots + content rules
  ai-prompt-composer.js       # Compose system+user from fragments + substitutions
  ai-repair-message.js        # Build focused repair messages from validation errors
```

## Files to Modify

- `src/editor/settings-modal.js` — add base URL + provider label fields
- `src/editor/ai-sidebar.js` — replace inline fetch + buildMessages + validateFixOutput with new modules
- `src/data/ai-enhancer.js` — remove migrated functions, re-export from new modules as facade
- `src/data/prompts/system-prompt.md`, `generate-prompt.md`, `fix-prompt.md` — refactor into fragments
- `src/__tests__/ai-enhancer.test.js` — update tests to use new module paths

## Files NOT to Modify

- `src/data/markdown-parser.js` — consumed, not modified
- `src/data/layout-data.js` — consumed, not modified
- `src/data/layouts.json` — read-only
- `src/editor/conversion-modal.js` — no changes needed (it calls `AiSidebar.show()` which keeps its signature)
- `src/engine/pptx-importer.js` — no changes needed (it calls `AiSidebar.show()` and `applyAiResult()`)

## Workstream 1: AiProviderClient + Settings (#148)

### 1.1 Create `src/data/ai/ai-provider-client.js`

```javascript
/**
 * OpenAI-compatible chat completions client.
 * Works with OpenRouter, Ollama, LM Studio, and any OpenAI-compatible endpoint.
 *
 * @typedef {Object} ChatRequest
 * @property {Array<{role: string, content: string}>} messages
 * @property {number} maxTokens
 * @property {{ type: string }|null} responseFormat
 * @property {{ effort: string }|null} reasoning
 *
 * @typedef {Object} ChatResponse
 * @property {string} content
 * @property {Object|null} usage
 * @property {Object} raw
 */

export class AiProviderClient {
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
    // Build OpenAI-compatible request body:
    // { model, messages, max_tokens, stream: false, response_format?, reasoning? }
    //
    // Headers:
    //   Authorization: Bearer <key>  — omit if key is empty (local providers)
    //   Content-Type: application/json
    //   HTTP-Referer: <app url>      — OpenRouter ranking, harmless elsewhere
    //
    // POST to `${baseUrl}/chat/completions`
    //
    // Parse response.choices[0].message.content
    // Throw typed errors:
    //   - AiAbortError: signal aborted
    //   - AiHttpError: non-2xx response (include status + body text)
    //   - AiParseError: response JSON missing choices[0].message.content
  }
}

export class AiAbortError extends Error {
  constructor() {
    super("Aborted");
    this.name = "AiAbortError";
  }
}
export class AiHttpError extends Error {
  constructor(status, body) {
    super(`HTTP ${status}`);
    this.name = "AiHttpError";
    this.status = status;
    this.body = body;
  }
}
export class AiParseError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "AiParseError";
  }
}
```

Key implementation details:

- Empty API key → omit `Authorization` header entirely (Ollama/LM Studio don't need auth)
- `HTTP-Referer` header is OpenRouter-specific for usage ranking; harmless to send to other providers
- `response_format: { type: "json_object" }` — some local providers may not support this; if the request fails with a 400 mentioning `response_format`, retry once without it (the existing JSON parsing in `parseAiResponse` handles non-JSON-wrapped output)
- Do NOT add a retry loop here — retries/repair are the orchestrator's job (Phase 13). This client does one request, returns or throws.

### 1.2 Modify `src/editor/settings-modal.js`

Add two new storage keys and accessors:

- `webdeck_ai_base_url` (localStorage) — default `https://openrouter.ai/api/v1`
- `webdeck_ai_provider` (localStorage) — cosmetic label: "OpenRouter" | "Ollama" | "LM Studio" | "Custom"

Add to the modal UI:

- A "Provider" dropdown (OpenRouter / Ollama / LM Studio / Custom) that sets the base URL to known defaults:
  - OpenRouter: `https://openrouter.ai/api/v1`
  - Ollama: `http://localhost:11434/v1`
  - LM Studio: `http://localhost:1234/v1`
  - Custom: user enters base URL manually
- A "Base URL" text field (editable when provider is "Custom", read-only otherwise with an "override" toggle)
- When base URL is NOT `https://openrouter.ai/api/v1`: replace the model dropdown with a free-text model input field (Ollama/LM Studio don't expose OpenRouter's `/models` shape). Add a "Fetch models" button that tries `GET ${baseUrl}/models` and populates a dropdown if it succeeds; falls back to free text on failure.

Add accessors:

```javascript
static getBaseUrl() {
  return localStorage.getItem("webdeck_ai_base_url") || "https://openrouter.ai/api/v1";
}
static getProvider() {
  return localStorage.getItem("webdeck_ai_provider") || "OpenRouter";
}
```

Keep all existing `webdeck_openrouter_*` keys working — they store the API key, model, reasoning, effort. The base URL is the only new piece.

### 1.3 Wire `ai-sidebar.js` to use `AiProviderClient`

Replace the hardcoded `const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"` (line 12) and both `fetch(OPENROUTER_URL, ...)` call sites (~line 435 in `#runSingleCall`, ~line 572 in `#streamBatch`) with:

```javascript
import { AiProviderClient } from "../data/ai/ai-provider-client.js";

// At initialization:
const provider = new AiProviderClient({
  getBaseUrl: () => SettingsModal.getBaseUrl(),
  getApiKey: () => SettingsModal.getApiKey(),
  getModel: () => SettingsModal.getModel(),
});

// At each call site:
const response = await provider.chat(
  { messages, maxTokens, responseFormat, reasoning },
  abortSignal,
);
const contentText = response.content;
```

Keep the existing retry loop (3 attempts for fix mode) and escalation message logic in `ai-sidebar.js` for now — the repair loop refactor is WS3.

### 1.4 Tests

Create `src/__tests__/ai-provider-client.test.js`:

- Success: mocked `fetch` returns `{ choices: [{ message: { content: "..." } }] }` → assert `response.content` matches
- Abort: pass an `AbortSignal` that's already aborted → assert `AiAbortError`
- HTTP error: mocked `fetch` returns `{ ok: false, status: 400, text() }` → assert `AiHttpError` with status
- Parse error: mocked `fetch` returns `{ ok: true, json() }` with missing `choices` → assert `AiParseError`
- Empty API key: assert `Authorization` header is NOT present in the fetch call args
- `response_format` fallback: mock first fetch returns 400 mentioning `response_format`, second fetch (without `response_format`) succeeds → assert content returned

### 1.5 Verification

- `npm test` passes (existing ai-enhancer tests + new provider client tests)
- Manual: open Settings, switch provider to Ollama, enter `http://localhost:11434/v1`, run fix-mode on a small deck — confirm it works against a running Ollama instance (or at minimum, confirm the request is sent to the correct URL via browser DevTools network tab)
- Manual: switch back to OpenRouter, confirm existing flow still works identically

---

## Workstream 2: AiPromptComposer + Prompt Fragment Refactor

### 2.1 Create `src/data/ai/ai-prompt-composer.js`

```javascript
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
    let user = this._user;
    for (const [key, value] of Object.entries(substitutions)) {
      user = user.replaceAll(`{{${key}}}`, value);
    }
    return { system: this._system, user };
  }
}
```

### 2.2 Refactor prompt files

Read the current `src/data/prompts/system-prompt.md`, `generate-prompt.md`, `fix-prompt.md` and refactor per the AGENTS.md prompt rules:

- Combined system + user ≤ 150 lines
- ≤ 5 strong negative directives ("NEVER", "Do NOT") per prompt
- Layout list in sync with `src/data/layouts.json` allowed layouts: `title-slide`, `header-content`, `two-column`, `media-span`, `left-heavy`, `right-heavy`, `three-column`, `focus`, `full-image`
- Most critical rules first
- Success criteria at end of each user prompt
- No duplicated rules between system and user prompts

The system prompt stays shared across intents. The two user prompts (`fix-prompt.md`, `generate-prompt.md`) keep their existing `{{markdown}}` placeholder and gain a `{{layoutList}}` placeholder if the layout list isn't already in the system prompt.

### 2.3 Migrate prompt building from `ai-enhancer.js`

In `ai-enhancer.js`, `buildMessages(markdown, mode)` (line 197) currently:

1. Calls `stripFrontmatter(markdown, mode)` to remove directives
2. Substitutes `{{markdown}}` with cleaned markdown
3. Returns `{ system: systemPrompt, user: promptWithMarkdown }`

Replace with:

```javascript
import { AiPromptComposer } from "./ai/ai-prompt-composer.js";

export function buildMessages(markdown, mode) {
  const cleaned = stripFrontmatter(markdown, mode);
  const fragment = mode === "fix" ? fixPrompt : generatePrompt;
  const composer = new AiPromptComposer({ systemFragment: systemPrompt, userFragment: fragment });
  return composer.compose({ markdown: cleaned, layoutList: getAllowedLayoutList() });
}
```

`getAllowedLayoutList()` is a small helper that reads from `LayoutData` and returns the area validity table as a string (same content currently hardcoded in `system-prompt.md:44-58` — move it to a substitution so it stays in sync with `layouts.json`).

Keep `buildBatchMessages` working similarly — it adds context slides and pagination instructions on top of the composed user prompt.

### 2.4 Tests

Update `src/__tests__/ai-enhancer.test.js`:

- `buildMessages` tests: assert the composed output still contains the expected system prompt and the substituted markdown
- Add a test that `{{layoutList}}` is replaced with the actual layout list (not left as a literal placeholder)
- Add a test in a new `src/__tests__/ai-prompt-composer.test.js`:
  - `compose({ markdown: "test" })` replaces `{{markdown}}` with "test"
  - Multiple substitutions work
  - Missing substitutions leave the placeholder as-is (or are stripped — decide and document)

### 2.5 Verification

- `npm test` passes
- Snapshot test: compose a prompt for a known input and assert the output matches a stored snapshot (catches accidental prompt regressions)
- `npm run format:check` passes (prompt .md files are not formatted by Prettier, but the JS is)

---

## Workstream 3: AiOutputSchema + AiOutputValidator + Content Rules (#150) + Repair Message

### 3.1 Create `src/data/ai/ai-output-schema.js`

```javascript
/**
 * Defines the expected Markdown structure for each AI intent.
 * Used by AiOutputValidator to know what to check.
 *
 * @typedef {Object} AiOutputSchema
 * @property {number} minSlides
 * @property {number} maxSlides  — null = unbounded
 * @property {boolean} requireLayout — every slide must have a layout directive
 * @property {boolean} checkAreaValidity — validate @area markers against layout
 * @property {boolean} checkContentRules — enforce #150 content rules
 */

export const SCHEMAS = {
  fix: {
    minSlides: 1,
    maxSlides: null,
    requireLayout: false, // fix mode preserves existing layouts
    checkAreaValidity: true,
    checkContentRules: true,
  },
  generate: {
    minSlides: 1,
    maxSlides: null,
    requireLayout: true, // generate mode assigns layouts
    checkAreaValidity: true,
    checkContentRules: true,
  },
  // Stubs for Phase 13 intents — not used yet but defined here:
  enhanceSlide: {
    minSlides: 1,
    maxSlides: 1,
    requireLayout: false,
    checkAreaValidity: true,
    checkContentRules: true,
  },
  summarize: {
    minSlides: 1,
    maxSlides: 1,
    requireLayout: false,
    checkAreaValidity: true,
    checkContentRules: true,
  },
  toMetricCards: {
    minSlides: 1,
    maxSlides: 1,
    requireLayout: false,
    checkAreaValidity: true,
    checkContentRules: true,
  },
  addSpeakerNotes: {
    minSlides: 1,
    maxSlides: 1,
    requireLayout: false,
    checkAreaValidity: false, // notes don't change layout
    checkContentRules: false,
  },
};

export function getSchema(intent) {
  return SCHEMAS[intent] || SCHEMAS.fix;
}
```

### 3.2 Create `src/data/ai/ai-output-validator.js`

```javascript
import { MarkdownParser } from "../markdown-parser.js";
import { LayoutData } from "../layout-data.js";
import { getSchema } from "./ai-output-schema.js";

/**
 * Validates AI-generated Markdown against an output schema.
 * Reuses MarkdownParser and LayoutData — does not reinvent parsing.
 *
 * @typedef {Object} ValidationError
 * @property {number} slide — 0-based slide index, or -1 for deck-level
 * @property {string} code — machine-readable error code
 * @property {string} message — human-readable message
 *
 * @typedef {Object} ValidationResult
 * @property {boolean} ok
 * @property {ValidationError[]} errors
 * @property {ValidationError[]} warnings
 * @property {Object[]} slides — parsed slide data (from MarkdownParser)
 */

export class AiOutputValidator {
  /**
   * @param {object} opts
   * @param {string} opts.inputMarkdown — the original input (for content rules that compare input vs output)
   */
  constructor({ inputMarkdown }) {
    this._inputMarkdown = inputMarkdown;
    this._parser = new MarkdownParser();
  }

  /**
   * @param {string} outputMarkdown
   * @param {string} intent
   * @returns {ValidationResult}
   */
  validate(outputMarkdown, intent) {
    const schema = getSchema(intent);
    const errors = [];
    const warnings = [];

    // 1. Parse the output with MarkdownParser
    //    - If parse throws, return { ok: false, errors: [{ slide: -1, code: "PARSE_ERROR", message }] }
    //    - Requires window.markdownit — in Node test env, mock or skip
    let deckData;
    try {
      deckData = this._parser.parseDeckMarkdown(outputMarkdown);
    } catch (e) {
      return {
        ok: false,
        errors: [{ slide: -1, code: "PARSE_ERROR", message: e.message }],
        warnings,
        slides: [],
      };
    }

    const slides = deckData.slides || [];

    // 2. Check slide count
    if (slides.length < schema.minSlides) {
      errors.push({
        slide: -1,
        code: "TOO_FEW_SLIDES",
        message: `Expected at least ${schema.minSlides} slide(s), got ${slides.length}`,
      });
    }
    if (schema.maxSlides !== null && slides.length > schema.maxSlides) {
      errors.push({
        slide: -1,
        code: "TOO_MANY_SLIDES",
        message: `Expected at most ${schema.maxSlides} slide(s), got ${slides.length}`,
      });
    }

    // 3. Per-slide checks
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];

      // 3a. Layout existence
      if (schema.requireLayout && !slide.layout) {
        errors.push({
          slide: i,
          code: "MISSING_LAYOUT",
          message: `Slide ${i + 1} has no layout directive`,
        });
      }
      if (slide.layout && !LayoutData.hasLayout(slide.layout)) {
        errors.push({
          slide: i,
          code: "UNKNOWN_LAYOUT",
          message: `Slide ${i + 1} uses unknown layout "${slide.layout}"`,
        });
      }

      // 3b. Area validity — check each @area marker in the slide against the layout's allowed areas
      if (schema.checkAreaValidity && slide.layout) {
        const allowedAreas = LayoutData.getAreaNames(slide.layout);
        const usedAreas = Object.keys(slide.areas || {});
        for (const area of usedAreas) {
          if (!allowedAreas.includes(area)) {
            errors.push({
              slide: i,
              code: "INVALID_AREA",
              message: `Slide ${i + 1} uses @${area} but layout "${slide.layout}" allows only: ${allowedAreas.join(", ")}`,
            });
          }
        }
      }

      // 3c. Content rules (#150)
      if (schema.checkContentRules) {
        this._checkContentRules(slide, i, errors, warnings);
      }
    }

    return { ok: errors.length === 0, errors, warnings, slides };
  }

  /**
   * Content rules (#150):
   * - header-default-h1: if a slide has a header area, its first heading should be h1 (warning, not error)
   * - no-header-on-multi-image: if a slide has >1 image, layout must not be header-content (error)
   * - preserve-multi-column-list: detect multi-column-list HTML in input, assert it survives in output (error)
   */
  _checkContentRules(slide, index, errors, warnings) {
    // header-default-h1:
    //   Check slide.areas.header — if it contains markdown headings, the first should be # (h1)
    //   Parse the header area markdown and look for heading lines (^#+)
    //   If first heading is ## or deeper, add a warning
    // no-header-on-multi-image:
    //   Count <img tags across all areas in the slide
    //   If count > 1 and slide.layout === "header-content", add error
    // preserve-multi-column-list:
    //   Search inputMarkdown for class="multi-column-list" or the multi-column-list directive
    //   If present in input, search outputMarkdown for the same
    //   If missing in output, add error
    //   (This requires access to the output markdown string — pass it in or store from validate())
  }
}
```

Implementation notes:

- `MarkdownParser.parseDeckMarkdown()` requires `window.markdownit` to be loaded. In the browser this is already set up. In Node tests, you'll need to mock `window.markdownit` or set up jsdom with the markdown-it library — check how existing tests in `src/__tests__/` handle this (look at `markdown-parser.test.js` or integration tests).
- `LayoutData.getAreaNames()` for custom layouts (grid template strings) parses the grid template. For preset layouts, it reads from the preset definition. This already works — just call it.
- The area validity check in `MarkdownParser` (line 813) already does this validation and emits warnings. The validator should surface the same checks as structured errors instead of console warnings. Read `markdown-parser.js` around line 813 to understand the existing logic and reuse it rather than duplicating.

### 3.3 Create `src/data/ai/ai-repair-message.js`

```javascript
/**
 * Build a focused repair message from validation errors.
 * This is sent back to the LLM as a follow-up user message when validation fails.
 *
 * @param {ValidationError[]} errors
 * @returns {string} — a concise message telling the LLM exactly what to fix
 */
export function buildRepairMessage(errors) {
  const lines = ["The previous output had these issues:"];
  for (const err of errors) {
    const location = err.slide >= 0 ? `Slide ${err.slide + 1}` : "Deck";
    lines.push(`- ${location}: ${err.message}`);
  }
  lines.push("");
  lines.push("Fix these issues and return the complete corrected output.");
  return lines.join("\n");
}
```

### 3.4 Wire validator into `ai-sidebar.js`

Replace the current `validateFixOutput(originalDirectives, parsed.slides)` call (~line 479 in `#runSingleCall`, ~line 603 in `#streamBatch`) with:

```javascript
import { AiOutputValidator } from "../data/ai/ai-output-validator.js";
import { buildRepairMessage } from "../data/ai/ai-repair-message.js";

// After parsing the AI response:
const validator = new AiOutputValidator({ inputMarkdown: markdown });
const result = validator.validate(enhancedMarkdown, mode);

if (!result.ok) {
  // Instead of the old escalation message, use the focused repair message:
  const repairMsg = buildRepairMessage(result.errors);
  // Add repairMsg as a new user message and retry (existing retry loop)
  messages.push({ role: "assistant", content: contentText });
  messages.push({ role: "user", content: repairMsg });
  continue; // retry loop
}
```

Keep the existing 3-attempt retry loop structure in `ai-sidebar.js`. The only change is what message gets sent on retry: instead of a generic escalation, it's now the specific validation errors.

### 3.5 Update `ai-enhancer.js`

- Remove `validateFixOutput` (migrated to `AiOutputValidator`)
- Keep `extractDirectives`, `injectDirectives`, `restoreDirectives`, `parseAiResponse`, `estimateMaxTokens`, `slidesToMarkdown`, `stripFrontmatter` — these are still used
- Re-export the new modules for backwards compatibility:
  ```javascript
  export { AiProviderClient } from "./ai/ai-provider-client.js";
  export { AiOutputValidator } from "./ai/ai-output-validator.js";
  export { AiPromptComposer } from "./ai/ai-prompt-composer.js";
  export { buildRepairMessage } from "./ai/ai-repair-message.js";
  ```

### 3.6 Tests

Create `src/__tests__/ai-output-validator.test.js`:

- Valid output: well-formed single slide with correct layout and areas → `ok: true`
- Unknown layout: slide with `layout: nonexistent` → error code `UNKNOWN_LAYOUT`
- Invalid area: slide with `layout: header-content` and `@sidebar` marker → error code `INVALID_AREA`
- Missing layout (generate mode): slide without `layout:` directive → error code `MISSING_LAYOUT`
- Too many slides (single-slide intent): 2 slides when schema says maxSlides=1 → error code `TOO_MANY_SLIDES`
- Content rule — header-default-h1: header area starts with `##` → warning (not error)
- Content rule — no-header-on-multi-image: `layout: header-content` with 2 `<img>` tags → error
- Content rule — preserve-multi-column-list: input has `multi-column-list` class, output drops it → error
- Parse error: output is not valid markdown at all → error code `PARSE_ERROR`

Create `src/__tests__/ai-repair-message.test.js`:

- Multiple errors → message lists all of them with slide locations
- Empty errors array → returns message with no bullet points (edge case — should not happen in practice)

Update `src/__tests__/ai-enhancer.test.js`:

- Remove or update `validateFixOutput` tests (function is deleted)
- Keep tests for `extractDirectives`, `injectDirectives`, `parseAiResponse`, `estimateMaxTokens`, `slidesToMarkdown`, `stripFrontmatter` — these functions stay

### 3.7 Verification

- `npm run lint && npm run format:check && npm test && npm run build` — all pass
- Manual: run fix-mode on `docs/example/slides.md` — confirm validator passes clean or shows structured errors in the sidebar log
- Manual: run generate-mode on a small deck — confirm content rules fire if the LLM produces h2 headers in a header area (should show as warning)
- Manual: if you have Ollama running, test with a local model to confirm #148 works end-to-end

---

## Sequencing

WS1 (provider) and WS2 (composer) are independent and can be developed in parallel. WS3 (validator) is also independent but its wiring into `ai-sidebar.js` touches the same file as WS1's wiring — coordinate the merge or do WS3's wiring after WS1 lands.

Recommended order: WS1 → WS2 → WS3, but any order works if file conflicts are managed.

## What NOT to Do

- Do NOT create `AiOperation`, `AiIntentRegistry`, or `AiOrchestrator` — those are Phase 13
- Do NOT add `enhanceSlide()` or single-slide editing — Phase 13
- Do NOT change how AI results are applied (still `ReloadManager.replaceDeck()`) — Phase 13 changes this to `DeckStore.applyPatch()`
- Do NOT delete `ai-enhancer.js` — keep it as a re-export facade until Phase 13
- Do NOT modify `markdown-parser.js` or `layout-data.js` — consume them as-is
- Do NOT add undo/redo — Phase 12/14
- Do NOT touch `conversion-modal.js` or `pptx-importer.js` — their `AiSidebar.show()` / `applyAiResult()` interfaces stay the same

## Quality Gates (run before committing)

```bash
npm run lint          # ESLint (errors only)
npm run format:check  # Prettier formatting
npm test              # Vitest unit tests
npm run build         # Build script
```

All four must pass. If `npm run format:check` fails, run `npx prettier --write .` to fix.
