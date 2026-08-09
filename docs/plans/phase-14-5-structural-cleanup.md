# Phase 14.5: Structural Cleanup & Test Infrastructure — Implementation Plan

Goal: Pay down structural debt and close test gaps before building new features on top of Phases 15-17. These tasks are independent of each other and can be parallelized. Two structural refactors (EditController decomposition and `ai-orchestrator.js` split) are carried over from Phase 14.

## Roadmap Alignment

The roadmap defines nine tasks across three categories:

1. **Refactoring** — extract shared bundle-order module, decompose EditController, split `ai-orchestrator.js`.
2. **Test Infrastructure** — Playwright E2E harness, PPTX import integration test.
3. **Developer Experience** — client-side logging utility, `CONTRIBUTING.md`, ADR template, lint `tools/` and `*.mjs`.

## Current State (verified against code)

### Refactoring targets

- `JS_BUNDLE_ORDER` is defined in `src/renderer/html-export-manager.js` (lines 25-65) as a 40+ entry array of source file paths. `tools/build.mjs` does **not** duplicate this constant — it uses esbuild's dependency resolution via `buildBundleJs()` (line 525). The drift risk is therefore lower than the roadmap originally assumed, but the export-manager's manual order should still be extracted so both paths can share a single source of truth if the build script ever needs explicit ordering.
- `src/editor/core/edit-controller.js` is 1,446 lines. The `EditController` class manages store-to-view sync, editor buffer, history, AI edit flows, and area/layout operations in a single class. It already instantiates 16 sub-modules via dependency injection, but the orchestration logic for sync, buffer, history, and AI remains inline.
- `src/data/ai/ai-orchestrator.js` is 1,628 lines. The `AiOrchestrator` class handles single-slide operations (`runSingleSlideOperation`, line 138), whole-deck operations (`runWholeDeckOperation`, line 249), Remix (`#runRemix`, line 726), and Reimagine (`#runReimagine`, line 880) in a single class.

### Test infrastructure

- Playwright is a dev dependency used only by `tools/pdf.mjs` (252 lines) for headless PDF generation. No Playwright test config or E2E specs exist.
- No PPTX import integration test exists. The PPTX pipeline (`src/engine/pptx-importer.js`) is tested only through unit-level snapshot tests.

### Developer experience

- 90 `console.*` calls exist across `src/`. No level-based logger exists.
- `CONTRIBUTING.md` does not exist.
- `docs/adr/` directory does not exist.
- ESLint flat config (`eslint.config.js`, line 31) explicitly ignores `tools/` and `*.mjs`. Build scripts (`tools/build.mjs`, `tools/pdf.mjs`) are not linted.

## PR Breakdown

Five PRs, grouped by logical cohesion and blast radius. PRs 1-3 can start in parallel.

### Dependency graph

```
PR 1 (bundle-order) ──┐
                      ├──> PR 5 (dev-experience: lint tools/)
PR 2 (EditController) ┤
                      ├──> PR 4 (test infrastructure)
PR 3 (ai-orchestrator)┘
```

### PR 1 — `refactor/extract-bundle-order`

**Task:** Extract shared bundle-order module

Extract `JS_BUNDLE_ORDER` from `src/renderer/html-export-manager.js` into a shared module (e.g. `src/data/bundle-order.js`). Update `HtmlExportManager` to import from it. Audit `tools/build.mjs` to determine whether it can also consume the shared module or whether the esbuild path makes sharing unnecessary.

- **Files:** `src/data/bundle-order.js` (new), `src/renderer/html-export-manager.js`
- **Blast radius:** Low — no behavioral change, pure extraction.
- **Dependencies:** None. Can merge immediately.
- **Verification:** Full quality gate (`npm run lint`, `npm run format:check`, `npm test`, `npm run build`). Confirm HTML export still bundles scripts in the correct order.

### PR 2 — `refactor/decompose-edit-controller`

**Task:** Decompose EditController

Split the inline orchestration logic in `src/editor/core/edit-controller.js` into dedicated DI modules, following the existing sub-module pattern (constructor receives getters and callbacks, not the full controller). Target extractions:

1. **Store-to-view sync** — `_handleStoreChange`, `_restoreStoreSnapshot`, `_reconcileUnsavedOverlays`, `prepareStoreOperation`, `recordStoreOperation` (lines 653-751).
2. **Editor buffer** — `loadSlideIntoEditor`, `onEditorInput`, `_captureEditorMarkdown`, `captureCurrentEditorState`, `_getSourceMarkdown`, `_setSourceMarkdown` (lines 354-363, 625-649, 1098-1158).
3. **History** — `undo`, `redo`, and the `_historyOperation` guard (lines 773-840).
4. **AI edit flows** — `runSingleSlideAi`, `runWholeDeckAi`, `_applyAiPatches` (lines 841-1097).

Area/layout operations (`_deleteAreaFromMarkdown`, `_swapAreaInMarkdown`, etc.) stay in `EditController` or move to a separate module only if the class is still too large after the above extractions.

- **Files:** `src/editor/core/edit-controller.js`, new sub-module files under `src/editor/core/`
- **Blast radius:** High — every editor path flows through `EditController`. Must preserve all existing behavior, DI wiring, and test coverage.
- **Dependencies:** None (can start in parallel with PR 3).
- **Verification:** Full quality gate (`npm run lint`, `npm run format:check`, `npm test`, `npm run build`). Pay special attention to:
  - `SaveManager.getFullSlides()` / `getFullMarkdown()` still work without `DeckStore`.
  - `prepareStoreOperation()` does not broadcast `storeChange` or clear CodeMirror history.
  - Undo after save reverts the just-saved text.
  - `loadSlideIntoEditor()` preserves the undo stack when the slide hasn't changed.
  - No `[object Object]` in AI prompts.
  - `DeckStore.applyPatches` default remains `emit: true`.
- **PR description:** Include Manual Verification steps for the key editor/AI flows (single-slide AI, undo after save, save/export) per AGENTS.md.

### PR 3 — `refactor/split-ai-orchestrator`

**Task:** Split `ai-orchestrator.js`

Separate the `AiOrchestrator` class (1,628 lines) into focused classes:

1. **Single-slide orchestrator** — `runSingleSlideOperation`, the repair loop, directive re-injection (lines 138-248, 320-338).
2. **Whole-deck orchestrator** — `runWholeDeckOperation`, `#runWholeDeckSingleCall`, `#runWholeDeckBatched`, `#processBatch` (lines 249-725).
3. **Remix/Reimagine orchestrator** — `#runRemix`, `#runRemixPlan`, `#runReimagine`, `#runReimagineOutline`, `#outlineToVirtualSlides`, `#flattenReimagineOutline` (lines 726-1212).

Shared helpers (`_buildReasoningBody`, provider/model configuration) stay in a base class or shared utility.

- **Files:** `src/data/ai/ai-orchestrator.js`, new files under `src/data/ai/`
- **Blast radius:** High — every AI operation flows through the orchestrator. Must preserve all existing behavior, patch formats, and callback contracts.
- **Dependencies:** None (can start in parallel with PR 2). Data-layer counterpart to PR 2.
- **Verification:** Full quality gate (`npm run lint`, `npm run format:check`, `npm test`, `npm run build`). `src/__tests__/ai-orchestrator.test.js` must pass unchanged. Verify single-slide patches, whole-deck Markdown, Remix plan→execute, and Reimagine outline→review→generate flows all work.
- **PR description:** Include Manual Verification steps for each AI flow (single-slide enhance, whole-deck generate, Remix, Reimagine) per AGENTS.md.

### PR 4 — `feature/test-infrastructure`

**Tasks:** Playwright E2E harness + PPTX import integration test

1. Add a Playwright test config (`playwright.config.js`) with a dev-server fixture that serves the app.
2. Add E2E specs for critical UI flows:
   - Open deck (`.md` and `.textpack`)
   - Edit slide text and verify preview updates
   - Switch layout
   - Export HTML
   - PPTX import (feed a small `.pptx` fixture through the full pipeline)
3. Add a PPTX import integration test that feeds a real `.pptx` fixture through the full extract→convert→render pipeline and verifies the output deck structure. This test should be written so it can be updated to `officeparser` when the backlog parser switch lands.

- **Files:** `playwright.config.js` (new), `e2e/` directory (new), `e2e/fixtures/` (new with `.pptx` fixture), `package.json` (add `test:e2e` script)
- **Blast radius:** None — test-only additions.
- **Dependencies:** Should land after PR 2 and PR 3 so E2E tests validate the final decomposed architecture.
- **Verification:** `npx playwright test` and `npm run test:e2e` pass. `npm test` (Vitest) and full quality gate remain unaffected.
- **PR description:** Include concrete Manual Verification steps for each E2E flow (open deck, edit slide, etc.) per AGENTS.md Pull Requests section.

### PR 5 — `feature/dev-experience`

**Tasks:** Client-side logging utility + `CONTRIBUTING.md` + ADR template + Lint `tools/` and `*.mjs`

1. Add a level-based logger (`src/core/logger.js`) with `debug`, `info`, `warn`, `error` methods. Replace ad-hoc `console.*` calls across `src/` (90 calls). Use `console.*` directly only in the logger itself.
2. Add `CONTRIBUTING.md` documenting setup, quality gates, branch/PR conventions, and testing instructions.
3. Add `docs/adr/` directory with a lightweight ADR template (`docs/adr/template.md` and `docs/adr/0001-record-architecture-decisions.md`).
4. Add a Node-specific ESLint config block for `tools/` and `*.mjs` files (currently ignored in `eslint.config.js` line 31). Fix any lint errors surfaced.

- **Files:** `src/core/logger.js` (new), `CONTRIBUTING.md` (new), `docs/adr/` (new), `eslint.config.js` (modified), `package.json` (new lint scripts for tools if needed), `tools/build.mjs` and `tools/pdf.mjs` (lint fixes), all `src/` files with `console.*` calls
- **Blast radius:** Medium — the logger swap is mechanical but touches many files. Lint fixes in `tools/` may require code changes.
- **Dependencies:** Should land after PR 1 (lint `tools/` after bundle-order extraction to avoid conflicts).
- **Verification:** Full quality gate (`npm run lint`, `npm run format:check`, `npm test`, `npm run build`). Confirm logger output is visible in dev mode and silenced appropriately in production builds.

## Suggested Merge Order

1. **PR 1** — fast, unblocks PR 5's linting.
2. **PR 2 and PR 3** — parallel, high-risk refactors. Each gets its own focused review.
3. **PR 4** — tests validate the new structure.
4. **PR 5** — DX cleanup, including linting the now-stable `tools/`.

## Plan Maintenance

As each PR merges, update `ROADMAP.md` to mark the corresponding Phase 14.5 tasks `[x]`.

## Acceptance Criteria

- `JS_BUNDLE_ORDER` is defined in one place; `HtmlExportManager` imports it.
- `EditController` delegates store-to-view sync, editor buffer, history, and AI edit flows to dedicated DI modules; all existing tests pass.
- `ai-orchestrator.js` is split into focused classes for single-slide, whole-deck, and Remix/Reimagine flows; all existing tests pass.
- Playwright E2E tests cover open deck, edit slide, switch layout, export HTML, and PPTX import.
- A PPTX import integration test feeds a real `.pptx` fixture through the full pipeline.
- Ad-hoc `console.*` calls in `src/` are replaced by a level-based logger.
- `CONTRIBUTING.md` documents setup, quality gates, and conventions.
- `docs/adr/` exists with a template and at least one initial ADR.
- `tools/` and `*.mjs` files pass ESLint.
