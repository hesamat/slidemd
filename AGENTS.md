# Agent Instructions

User-facing documentation lives in README.md and docs/example/slides.md. This file contains only AI-assistant guidance for working on the codebase.

## Quick Start

For most tasks, use this loop:

1. **Understand** the request and read the relevant code.
2. **Implement** a small, coherent change.
3. **Review** the implementation adversarially.
4. **Fix** any review findings.
5. **Run checks** — for non-trivial changes, run all five quality gates:
   - `npm run lint`
   - `npm run format:check`
   - `npm test`
   - `npm run test:e2e`
   - `npm run build`

   For trivial changes (typo fixes, single-file config edits, pure formatting), run the relevant targeted check.

6. **Re-review** after fixes and checks.
7. **Report** what changed and whether checks passed.

- Ask the user before destructive actions, git commits/pushes, or anything with real-world side effects.
- For trivial changes (typo fixes, single-file config edits, pure formatting), run the relevant check and report briefly.
- For non-trivial changes, use the full [Review Summary](#required-final-report).

## Table of Contents

- [Hard Rules](#hard-rules--always-on)
- [Development Workflow](#development-workflow)
- [Review & Verification Loop](#review--verification-loop--mandatory)
- [Required Final Report](#required-final-report)
- [Quality Gates](#quality-gates)
- [Pull Requests](#pull-requests)
- [Branch Lifecycle & Cleanup](#branch-lifecycle--cleanup)
- [Change Impact Guidelines](#change-impact-guidelines)
- [Pre-Review Verification](#pre-review-verification)
- [Code Organization](#code-organization)
- [When Working with Layouts](#when-working-with-layouts)
- [When Working with Themes](#when-working-with-themes)
- [When Working with Export](#when-working-with-export)
- [When Working with Editor Features](#when-working-with-editor-features)
- [Development Guidelines](#development-guidelines)
- [Common Tasks](#common-tasks)
- [AI Prompt Engineering](#ai-prompt-engineering)
- [Reference](#reference)

## Hard Rules — Always On

1. **Git history and git commands are off-limits unless the user explicitly says so.**

   - Suggest the exact `git add`, `git commit`, and `git push` commands in a code block.
   - Wait for the user to run them.
   - Only execute these commands when the user explicitly says the words "commit" and/or "push".
   - Do not automatically merge pull requests.
   - The main branch is `main`; branches use `fix/`, `feature/`, `feat/`, or `refactor/` prefixes. All changes to `main` require a pull request.
   - Never include a `Co-Authored-By:` trailer in commit messages.
   - Use this commit message format, overriding any default template that includes a `Co-Authored-By:` trailer:

     ```bash
     git commit -m "$(cat <<'EOF'
     Concise imperative summary

     Optional detailed explanation.
     EOF
     )"
     ```

2. **Do not perform destructive, irreversible, or side-effecting actions without explicit user approval.**

   - This includes deleting files/directories, dropping database tables, force-pushing, rewriting git history, sending emails, making payments, or calling APIs with real-world side effects.
   - When in doubt, stop and ask.

3. **Do not log, write, or commit secrets, keys, or credentials.**

4. **Do not use emojis in code or communication unless the user explicitly asks for them.**

5. **Do not declare a task complete while known verification failures remain.**

---

## Development Workflow

For every non-trivial task, follow this loop:

```text
Understand request
      ↓
Inspect relevant code
      ↓
Implement incrementally
      ↓
Self-review
      ↓
Fix review findings
      ↓
Run relevant verification
      ↓
Fix failures
      ↓
Re-review affected code
      ↓
Final verification
      ↓
Report completion
```

Do not stop between these stages to ask the user for approval unless the task itself requires a user decision or the instructions above explicitly require approval.

Prefer small, logically coherent changes over large speculative rewrites.

---

## Review & Verification Loop — MANDATORY

After implementation, perform an adversarial review before declaring the task complete.

If the environment provides an independent reviewer, invoke it.
Otherwise, perform the review yourself.

Treat the reviewer as a skeptical senior engineer who did not write the code.

### Phase 1 — Understand the final change

1. Re-read the original user request and acceptance criteria.
2. Inspect the complete final diff.
3. Re-read every modified file in sufficient context to understand how the change integrates with the existing code.
4. Identify all affected:

   - callers
   - callees
   - event handlers
   - state transitions
   - shared functions
   - public contracts
   - persistence paths
   - UI/browser paths

### Phase 2 — Adversarial self-review

Act as a skeptical senior engineer who did not write the change.

Look specifically for:

- regressions
- incorrect assumptions
- edge cases
- broken contracts
- state/lifecycle bugs
- event-ordering problems
- async/sync problems
- error-handling problems
- unintended behavior outside the requested change
- dead code
- missing wiring
- stale or misleading comments
- changes that work in one path but break another
- changes that pass the obvious test but violate an existing invariant

For every changed shared function or contract:

- search for all important callers
- verify each caller still works
- verify return types and argument expectations
- check no alternate code path was missed

### Phase 3 — Fix review findings

If the review finds a legitimate problem:

1. Fix it immediately.
2. Re-read the affected code.
3. Re-check the relevant callers and surrounding behavior.
4. Do not assume the fix is correct simply because it addresses the original finding.
5. Continue reviewing until there are no known issues.

Do not report `PASS` while known issues remain.

### Phase 4 — Verification

After self-review passes, run the appropriate verification.

For normal changes, use:

```bash
npm run lint
npm run format:check
npm test
npm run test:e2e
npm run build
```

All applicable checks must pass before declaring the task complete.

If `npm run format:check` fails:

```bash
npx prettier --write .
```

Then rerun the formatting check and any affected checks.

For UI/browser changes:

1. First verify the actual behavior in the browser when practical.
2. Then run the relevant automated checks.
3. If browser verification exposes a problem, fix it and repeat the review/verification loop.

Do not stop merely because a check fails. Diagnose the failure, fix it, and rerun the affected checks.

### Phase 5 — Final review

After all fixes and verification:

1. Inspect the final diff again.
2. Confirm the original request is fully satisfied.
3. Confirm relevant tests and checks pass.
4. Confirm no unrelated behavior was accidentally changed.
5. Confirm modified files are actually saved on disk.
6. Report any remaining uncertainty explicitly.

---

## Required Final Report

When the task is complete, provide a report. For trivial changes (typo fixes, single-file config edits, pure formatting), a brief report covering the change and the check result is enough. For non-trivial changes, use the full Review Summary below.

## Review Summary

- `Files changed:` — every modified file and its purpose.
- `Code paths traced:` — important callers, callees, and interactions checked.
- `Regression checks:` — important existing behaviors checked.
- `Dead code / wiring:` — relevant additions/removals checked.
- `Tests/checks:` — commands run and results.
- `Review result:` — `PASS` or `NEEDS_FIX`.
- `Remaining uncertainty:` — only if applicable.

Keep the final report concise. Do not dump unnecessary reasoning or full file contents.

---

## Quality Gates

The normal quality gate is:

```bash
npm run lint
npm run format:check
npm test
npm run test:e2e
npm run build
```

Run all applicable checks before declaring completion.

Do not run expensive checks repeatedly when a cheaper check can first identify an obvious problem. However, after fixing a failure, rerun the affected check and perform another review of the affected code.

If a change is isolated and a full gate is clearly unnecessary during intermediate development, run the most relevant targeted checks first. The full gate should still be run before committing when the user asks for a commit.

---

## Pull Requests

When a PR changes user-facing behavior, including:

- image loading
- `.textpack` opening
- PPTX import
- save/export
- editing flows

include specific manual/browser verification steps in the PR description.

Use either:

```text
## Acceptance Criteria
```

or:

```text
## Manual Verification
```

and list the exact actions to perform.

Do not use a generic "manual test" checkbox when concrete verification steps can be provided.

---

## Branch Lifecycle & Cleanup

### Naming

- Branch prefixes: `fix/`, `feature/` (or `feat/`), `refactor/`, `release/`. Copilot-generated branches use `copilot/`.
- One branch per logical change, one PR per branch, short-lived.

### Lifecycle rules

- After a PR merges, delete the branch (enable "Automatically delete head branches" in repo settings; otherwise delete manually).
- Branches must not live longer than ~30 days. Stale work should be closed, not left dormant.
- The scheduled `.github/workflows/branch-cleanup.yml` bot deletes branches older than 60 days with no open PR, and closes PRs inactive for 45+ days (exempt labels: `keep-open`, `roadmap`).
- Before deleting a stale branch with unique commits, archive its tip with an `archive/YYYY-MM-DD/<branch>` tag.

### Housekeeping

- After any branch deletion, run `git fetch --prune origin` and delete the matching local branch.
- Avoid creating worktrees for merged work; remove worktrees when their PR merges (`git worktree remove <path>`).
- Never push to `main` directly.

---

## Change Impact Guidelines

Before proposing or implementing a change, consider the blast radius beyond the immediate file.

### Shared state and mirrors

If you remove a cached field (`originalMarkdown`, `unsavedMarkdown`, a getter/setter pair, or a callback), search for every consumer in `src/` and `__tests__/` and update or explain each one.

Shared caches are often read by:

- save
- export
- AI
- style
- undo
- preview
- persistence

### Return type contracts

Do not change the return type of a public method (`getFullSlides()`, `getFullMarkdown()`, `getWorkingSlides()`) without updating every caller, including no-argument overloads.

If an overload must remain for backwards compatibility, preserve its existing contract.

### No-store / viewer paths

`DeckStore` may be `null` in viewer, presenter, or export windows.

If removing a no-store fallback:

- remove the feature entirely, or
- provide a source-markdown fallback.

Do not leave half-working code that throws in some paths and warns in others.

### Source vs. live state

`DeckLoader.getSourceMarkdown()` is the on-disk/localStorage snapshot at load.

`DeckStore.getSlides()` is the live in-memory canonical state.

Export, save, and whole-deck AI must use live state; source state is only a fallback when no store is wired.

### History and broadcasts

Every `DeckStore` mutation must consider:

1. Does it record `DeckHistory`?
2. Does it emit `storeChange` to other windows?
3. Does it re-render the editor/preview?

Do not record history or emit events for silent pre-mutation synchronization.

### CodeMirror history and per-slide state cache

Full-document `setValue()` resets the cursor and can wipe undo.

Use targeted `view.dispatch` transactions for in-place directive edits.

`MarkdownEditor` caches a separate `EditorState` per slide (`saveSlideState`) keyed by slide index and deck revision. Load the cached state when the slide and deck are unchanged (`loadSlideState`); it automatically discards the cache when the document changed externally (AI, style, save baseline shift) or the deck revision bumped. Clear the cache (`clearSlideStateCache`) on structural/deck changes. `teardown()` must also clear the cache to avoid retaining large `EditorState` objects after the editor is destroyed.

### Dirty baseline

After a successful save, update the source snapshot (`webdeck_local_file` / `__WEBDECK_MARKDOWN__`) so the dirty flag stays clean until the next real change.

If `localStorage` fails, remove the stale key before falling back to the global.

### AI prompts and exports

Never pass objects to string-join or prompt builders.

Verify that:

- `getFullMarkdown()` produces a plain string.
- `getFullSlides().join()` produces plain strings.
- Whole-deck AI prompts do not contain `[object Object]` or other unexpected stringification.

---

## Pre-Review Verification

When a PR touches `EditController`, `SaveManager`, `SlideOperations`, `StyleApplier`, `DeckStore`, or `MarkdownEditor`, explicitly verify:

- `SaveManager.getFullSlides()` and `SaveManager.getFullMarkdown()` called with no arguments return `string[]` / `string` and work without a `DeckStore`.
- `prepareStoreOperation()` / `onBeforeSave()` does not broadcast a `storeChange` event and does not clear the per-slide `EditorState` cache.
- Saving the deck updates the source baseline so the dirty flag stays clean until the next real change.
- Undo immediately after save reverts the just-saved text, not an earlier structural change.
- `loadSlideIntoEditor()` preserves the undo stack when the slide and deck have not changed.
- No `[object Object]` or other unexpected stringification appears in whole-deck AI prompts.
- `DeckStore.applyPatches` default remains `emit: true`; any new options must be reviewed.

---

## Code Organization

### Source Structure (`src`)

- **core/** — Core utilities (asset-loader, element-gatherer, utils, directory-handle-store, mermaid-config)
- **data/** — Data parsing (layout-data, layout-parser, markdown-parser, deck-loader, layouts.json)
- **editor/** — Live editing features

  - **core/** — Edit controller, markdown editor, slide thumbnails, slide operations, slide preview updater, style applier, source jump handler, directive utils, edit state manager
  - **image/** — Image picker, inserter, interaction handler, properties panel, background handler, deck images resolver
  - **layout/** — Layout picker, layout manager, grid resizer, grid resizer manager
  - **navigation/** — Area navigation, area guide manager, slide warning manager
  - **ui/** — Background picker, insert dropdown, mermaid helper, panel resizer, save manager, slide style panel, theme manager

- **engine/** — Presentation logic (deck-controller, slide-navigator, keyboard-handler, break-manager, reload-manager, role-manager, wheel-handler, freeze-manager)
- **renderer/** — Display logic (slide-renderer, stage-scaler, theme-manager, content-enhancer, html-export-manager, print-manager, notification)
- **ui/** — UI actions (ui-actions)

### Entry Points

- `index.html` — Main deck page (dev mode)
- `deck.js` — Application entry point and orchestrator
- `tools/build.mjs` — Build script
- `tools/pdf.mjs` — PDF export script

---

## When Working with Layouts

- Layout definitions are in `src/data/layout-data.js`.
- Built-in presets live in `src/data/layouts.json`.
- User-created custom layouts are persisted in `localStorage` under `webdeck:custom-layouts`.
- `layout:` accepts either a preset name or a CSS `grid-template` shorthand string with quoted area names, e.g. `layout: "header header" "main media" / 2fr 1fr`.
- Area markers route content to specific grid regions.
- The `@` name must match a name in the `layout:` grid.
- Text before the first `@area` marker flows into `@main`.
- The Layout Picker's `Custom` tile lets users save named grid strings to `localStorage` and reuse them across decks.

---

## When Working with Themes

Theme management is in:

```text
src/renderer/theme-manager.js
```

Themes can be set per-slide via `theme:` frontmatter.

---

## When Working with Export

- **App UI HTML export:** `src/renderer/html-export-manager.js`
- **App UI PDF export:** `src/renderer/print-manager.js`
- **Build script HTML:** `tools/build.mjs`
- **Build script PDF:** `tools/pdf.mjs` — Uses Playwright for headless PDF generation

---

## When Working with Editor Features

- Edit controller: `src/editor/core/edit-controller.js` — orchestrator, delegates to sub-modules
- Slide preview updater: `src/editor/core/slide-preview-updater.js` — parses markdown and re-renders slide preview
- Style applier: `src/editor/core/style-applier.js` — applies style directives to all slides
- Source jump handler: `src/editor/core/source-jump-handler.js` — click-to-jump markdown source
- Markdown editor: `src/editor/core/markdown-editor.js`
- Layout picker: `src/editor/layout/layout-picker.js`
- Slide thumbnails: `src/editor/core/slide-thumbnails.js`
- Image handling: `src/editor/image/`
- Grid resizer: `src/editor/layout/grid-resizer.js`

### Editor Sub-Module Architecture

All editor sub-modules use **dependency injection** — they receive only the specific dependencies they need via constructor parameters, not the full `EditController` instance.

Mutable state is accessed via getter functions (e.g., `getCurrentSlideIndex`), and cross-module actions are passed as callbacks (e.g., `onPreviewUpdate`).

The `EditController` constructor wires everything together.

Pattern for new sub-modules:

```javascript
export class NewModule {
  /**
   * @param {object} opts
   * @param {() => Type} opts.getSomething — getter for mutable state
   * @param {(arg: Type) => void} opts.onAction — callback for actions
   */
  constructor({ getSomething, onAction }) {
    this._getSomething = getSomething;
    this._onAction = onAction;
  }
}
```

---

## Development Guidelines

### Core Principles

1. **Deterministic rendering:** All positioning uses the 1920x1080 coordinate system.
2. **Offline-first:** Build script inlines all assets; no runtime CDN dependencies.
3. **No reflow on resize:** Use `stage-scaler.js` for letterboxing/pillarboxing.
4. **Markdown-driven:** Deck content comes from parsed Markdown files.

---

## Common Tasks

- **Add a new layout preset:** Add to `src/data/layout-data.js`, then regenerate the prompt snapshots (`npx vitest run -u` on `src/__tests__/ai-prompt-snapshots.test.js`) — every snapshot embeds the generated layout list, so an intentional layout change fails them all at once and is not a regression.
- **Modify deck content:** Edit `docs/example/slides.md`
- **Change build input:** Update argument in `tools/build.mjs`
- **Add a rendering feature:** Enhance `src/renderer/content-enhancer.js` or `src/renderer/slide-renderer.js`
- **Add or change a keyboard shortcut:** Update `src/engine/keyboard-shortcuts.js`, then run the quality gates.

---

## AI Prompt Engineering

AI prompts live in `src/data/prompts/`:

| File                                | Role     | Purpose                                                                            |
| ----------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `system-prompt.md`                  | `system` | Global rules, structure, formatting; `{{layoutList}}`                              |
| `polish-prompt.md`                  | `user`   | Whole-deck cleanup and wording/layout improvement; preserves slide count and order |
| `generate-prompt.md`                | `user`   | Creative reorganization task + `{{markdown}}` input                                |
| `fix-prompt.md`                     | `user`   | Conservative cleanup task + `{{markdown}}` input                                   |
| `add-speaker-notes-prompt.md`       | `user`   | Add speaker notes to slide                                                         |
| `remix-plan-prompt.md`              | `user`   | Plan phase for Remix; outputs restructuring plan JSON                              |
| `reimagine-outline-prompt.md`       | `user`   | Outline phase for Reimagine; outputs `{ plan, chapters }` JSON                     |
| `flow-guidance.md`                  | snippet  | Narrative-flow guidance variants used by the generate options suffix               |
| `speaker-notes-guidance.md`         | snippet  | Speaker-notes guidance variants used by the generate options suffix                |
| `visual-identity-guidance.md`       | snippet  | Visual-identity guidance variants (preserve/discard) used by the generate suffix   |
| `remix-visual-identity-guidance.md` | snippet  | Visual-identity guidance variants (preserve/discard) used by the remix plan prompt |
| `images-guidance.md`                | snippet  | Vision images guidance variants for the remix plan prompt                          |
| `batch-pagination.md`               | snippet  | Batch pagination instructions variants for `buildBatchMessages`                    |
| `creative-guidance.md`              | snippet  | Remix creative guidance for the `{{creativeGuidance}}` placeholder                 |
| `repair-message.md`                 | snippet  | Repair message template for validation failures                                    |

Snippet files contain `<!-- variant: name -->` sections; code selects a variant via `extractVariant` in `src/data/ai/ai-prompt-fragments.js`. The `FRAGMENTS` map in that module is the single runtime catalog of every prompt file.

### Prompt Rules

- Do not duplicate rules across `system` and `user` prompts.
- Put constraints before creative freedom in user prompts.
- Keep prompts focused; system + user prompts should stay under ~150 combined lines.
- Prefer positive instructions over negative instructions.
- Limit strong negative directives to approximately five per prompt.
- Place the most critical rules first.
- Add success criteria at the end of each prompt.

### Modification Checklist

1. Check all prompts for consistency.
2. Run `npm test` — the AI hygiene tests (`ai-prompt-hygiene.test.js`) check that composed prompts contain no dangling `{{placeholders}}` and that the layout list stays in sync with `src/data/layout-data.js`.
3. Snapshot tests (`ai-prompt-snapshots.test.js`) pin the composed messages — update the snapshot deliberately when a prompt change is intended, and review the diff.
4. Keep both layout lists in sync (`getAllowedLayoutList()` output and this doc's layout table).
5. Reflect changes in `docs/prompt-template.md` and `docs/example/slides.md` when applicable.

---

## Reference

The following sections are reference material for specific subsystems and known environment quirks.

### AI Module Architecture

The `ai-enhancer.js` facade has been deleted. AI utilities now live in focused modules under `src/data/ai/`:

| Module                     | Purpose                                                                  |
| -------------------------- | ------------------------------------------------------------------------ |
| `ai-orchestrator.js`       | Entry point: context selection, LLM call, validation, repair             |
| `ai-operation.js`          | `AiOperation` type and `createOperation()` factory                       |
| `ai-intent-registry.js`    | Maps intent names to prompt fragments                                    |
| `ai-prompt-fragments.js`   | Fragment imports, frontmatter stripping, layout list, variant extraction |
| `ai-prompt-builder.js`     | Deck summaries, message/batch building                                   |
| `ai-response-parser.js`    | JSON parsing, slides-to-markdown, areas-to-markdown                      |
| `ai-directive-utils.js`    | Extract/restore/inject per-slide directives                              |
| `ai-token-estimator.js`    | Token count and max_tokens estimation                                    |
| `ai-output-validator.js`   | Validate AI output against schema                                        |
| `ai-output-schema.js`      | Per-intent schemas                                                       |
| `ai-prompt-composer.js`    | Strict placeholder composition from fragments                            |
| `ai-repair-message.js`     | Build repair messages for validation failures                            |
| `ai-provider-client.js`    | OpenAI-compatible API client with retry and error sanitization           |
| `ai-provider-factory.js`   | Provider client factory                                                  |
| `ai-vision-message.js`     | Multi-modal message builder, provider mappings, token estimation         |
| `slide-image-extractor.js` | Extract content images, filter backgrounds, compress to <40KB            |

---

### Editor UI Modules

| Module                          | Purpose                                                   |
| ------------------------------- | --------------------------------------------------------- |
| `ai-dropdown-manager.js`        | AI dropdown in editor toolbar                             |
| `ai-generate-modal.js`          | Pre-flight modal for whole-deck Refine                    |
| `ai-reimagine-outline-modal.js` | Chapter-grouped plan + outline editor                     |
| `insert-dropdown-manager.js`    | Format dropdown                                           |
| `dropdown-registry.js`          | Shared registry so Format and AI dropdowns cannot overlap |

---

### Renderer Hardening

- All user-authored Markdown HTML assigned to `SlideRenderer` slide areas is sanitized with `DOMPurify` before `innerHTML` is set.
- Mermaid SVG output and hardcoded UI `innerHTML` strings are trusted library/output markup and are not sanitized.
- Mermaid source is stored in `data-mermaid-source` base64-encoded with a `b64:` prefix because DOMPurify strips attributes containing `-->`.
- The parser decodes HTML entities before encoding.
- `ContentEnhancer` decodes the attribute before passing it to Mermaid.
- `ContentEnhancer` is exposed on `window` so runtime, exported HTML, and PDF paths use the same entry point.

---

### Known Issues

#### Windows `nul` file

The `.gitignore` previously contained `nul`, which created an untracked file that cannot be deleted via normal Windows commands because it is a reserved device name.

This was removed from `.gitignore`, but the file may still appear in `git status`. Ignore it.

#### PowerShell quoting

The `gh` CLI and `npm` commands with special characters such as parentheses or quotes can fail in PowerShell.

Use a `cmd /c` wrapper or write content to temporary files and use `--body-file` / `-F` flags.

#### npm via PowerShell

`npm.ps1` is blocked by execution policy on this system.

Use:

```bash
cmd /c "npm ..."
```

when necessary.
