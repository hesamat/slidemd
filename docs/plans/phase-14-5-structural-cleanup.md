# Phase 14.5: Structural Cleanup & Test Infrastructure — Implementation Plan

Goal: Pay down structural debt and close test gaps before building new features on top of Phases 15-17. These tasks are independent of each other and can be parallelized. Two structural refactors (EditController decomposition and `ai-orchestrator.js` split) are carried over from Phase 14.

## Roadmap Alignment

The roadmap defines ten tasks across three categories (one already complete):

1. **Refactoring** — extract shared bundle-order module, decompose EditController, split `ai-orchestrator.js`.
2. **Test Infrastructure** — Playwright E2E harness, PPTX import integration test (done, PR #191).
3. **Developer Experience** — client-side logging utility, `CONTRIBUTING.md`, ADR template, `docs/ai-positioning.md`, lint `tools/` and `*.mjs`.

## Current State (verified against code)

### Refactoring targets

- `JS_BUNDLE_ORDER` is defined in `src/renderer/html-export-manager.js` (lines 25-65) as a 40+ entry array of source file paths. `tools/build.mjs` does **not** duplicate this constant — it uses esbuild's dependency resolution via `buildBundleJs()` (line 525). The drift risk is therefore lower than the roadmap originally assumed, but the export-manager's manual order should still be extracted so both paths can share a single source of truth if the build script ever needs explicit ordering.
- `src/editor/core/edit-controller.js` is 1,446 lines. The `EditController` class manages store-to-view sync, editor buffer, history, AI edit flows, and area/layout operations in a single class. It already instantiates 16 sub-modules via dependency injection, but the orchestration logic for sync, buffer, history, and AI remains inline.
- `src/data/ai/ai-orchestrator.js` is 1,628 lines. The `AiOrchestrator` class handles single-slide operations (`runSingleSlideOperation`, line 138), whole-deck operations (`runWholeDeckOperation`, line 249), Remix (`#runRemix`, line 726), and Reimagine (`#runReimagine`, line 880) in a single class.

### Test infrastructure

- Playwright is a dev dependency used only by `tools/pdf.mjs` (252 lines) for headless PDF generation. No Playwright test config or E2E specs exist.
- PPTX import integration test landed in PR #191 (`src/__tests__/pptx-import-integration.test.js` with four specimen fixtures and `tools/generate-pptx-fixtures.mjs`).

### Developer experience

- 90 `console.*` calls exist across `src/`. No level-based logger exists.
- `CONTRIBUTING.md` does not exist.
- `docs/adr/` directory does not exist.
- `docs/ai-positioning.md` does not exist. The AI/tool boundary is documented only implicitly across `AGENTS.md`, `docs/prompt-template.md`, and `README.md`.
- ESLint flat config (`eslint.config.js`, line 31) explicitly ignores `tools/` and `*.mjs`. Build scripts (`tools/build.mjs`, `tools/pdf.mjs`, `tools/generate-pptx-fixtures.mjs`) are not linted.

## PR Breakdown

Three PRs, grouped by logical cohesion and blast radius. PRs 1 and 2 can start in parallel; PR 3 depends on PR 2.

### Dependency graph

```
PR 1 (DX & docs)  ──────────────────────────────────────┐
                                                        ├──> PR 3 (structural refactors)
PR 2 (logging & E2E harness) ───────────────────────────┘
```

### PR 1 — `feature/phase-14-5-dx-docs`

**Tasks:** Lint `tools/` and `*.mjs` + `docs/ai-positioning.md` + `CONTRIBUTING.md` + ADR template + Extract shared bundle-order module

Five independent, no-conflict changes bundled into one coherent DX/docs PR:

1. Add a Node-specific ESLint config block for `tools/` and `*.mjs` files (currently ignored in `eslint.config.js` line 31). Fix any lint errors surfaced in `tools/build.mjs`, `tools/pdf.mjs`, and `tools/generate-pptx-fixtures.mjs`.
2. Add `docs/ai-positioning.md` documenting what the AI does (enhance, fix, remix, reimagine, speaker notes) vs. what the tool does (deterministic rendering, layout validation, export). Clarifies the boundary for users and external AI agents. Complements `AGENTS.md` which targets coding assistants.
3. Add `CONTRIBUTING.md` documenting setup, quality gates, branch/PR conventions, and testing instructions for external contributors.
4. Add `docs/adr/` directory with a lightweight ADR template (`docs/adr/template.md` and `docs/adr/0001-record-architecture-decisions.md`).
5. Extract `JS_BUNDLE_ORDER` from `src/renderer/html-export-manager.js` into a shared module (e.g. `src/data/bundle-order.js`). Update `HtmlExportManager` to import from it. Audit `tools/build.mjs` to determine whether it can also consume the shared module or whether the esbuild path makes sharing unnecessary.

- **Files:** `eslint.config.js` (modified), `tools/*.mjs` (lint fixes), `docs/ai-positioning.md` (new), `CONTRIBUTING.md` (new), `docs/adr/` (new), `src/data/bundle-order.js` (new), `src/renderer/html-export-manager.js` (modified)
- **Blast radius:** Low — no behavioral change. Lint fixes in `tools/` are mechanical. Bundle-order extraction is a pure constant move.
- **Dependencies:** None. Can merge immediately.
- **Verification:** Full quality gate (`npm run lint`, `npm run format:check`, `npm test`, `npm run build`). Confirm HTML export still bundles scripts in the correct order.

### PR 2 — `feature/phase-14-5-logging-e2e`

**Tasks:** Client-side logging utility + Playwright E2E test harness

The logger is foundational for the E2E specs (structured failure output). Bundling them gives a PR that adds real observability and test coverage together:

1. Add a level-based logger (`src/core/logger.js`) with `debug`, `info`, `warn`, `error` methods. Replace ad-hoc `console.*` calls across `src/` (90 calls). Use `console.*` directly only in the logger itself.
2. Add a Playwright test config (`playwright.config.js`) with a dev-server fixture that serves the app.
3. Add E2E specs for critical UI flows:
   - Open deck (`.md` and `.textpack`)
   - Edit slide text and verify preview updates
   - Switch layout
   - Export HTML
   - PPTX import (feed a small `.pptx` fixture through the full pipeline)

- **Files:** `src/core/logger.js` (new), all `src/` files with `console.*` calls, `playwright.config.js` (new), `e2e/` directory (new), `package.json` (add `test:e2e` script)
- **Blast radius:** Medium — the logger swap is mechanical but touches many files. E2E specs are test-only additions.
- **Dependencies:** Can start in parallel with PR 1 (logger work is in `src/`, not `tools/`). Should land before PR 3 so the E2E safety net catches refactor regressions.
- **Verification:** Full quality gate (`npm run lint`, `npm run format:check`, `npm test`, `npm run build`). `npx playwright test` and `npm run test:e2e` pass. Confirm logger output is visible in dev mode and silenced appropriately in production builds.

### PR 3 — `refactor/phase-14-5-structural`

**Tasks:** Decompose EditController + Split `ai-orchestrator.js`

Both deferred Phase 14 refactors in one PR to avoid two rounds of touching the `EditController` ↔ `AiOrchestrator` wiring. The E2E harness from PR 2 catches regressions.

#### EditController decomposition

Split the inline orchestration logic in `src/editor/core/edit-controller.js` into dedicated DI modules, following the existing sub-module pattern (constructor receives getters and callbacks, not the full controller). Target extractions:

1. **Store-to-view sync** — `_handleStoreChange`, `_restoreStoreSnapshot`, `_reconcileUnsavedOverlays`, `prepareStoreOperation`, `recordStoreOperation` (lines 653-751).
2. **Editor buffer** — `loadSlideIntoEditor`, `onEditorInput`, `_captureEditorMarkdown`, `captureCurrentEditorState`, `_getSourceMarkdown`, `_setSourceMarkdown` (lines 354-363, 625-649, 1098-1158).
3. **History** — `undo`, `redo`, and the `_historyOperation` guard (lines 773-840).
4. **AI edit flows** — `runSingleSlideAi`, `runWholeDeckAi`, `_applyAiPatches` (lines 841-1097).

Area/layout operations (`_deleteAreaFromMarkdown`, `_swapAreaInMarkdown`, etc.) stay in `EditController` or move to a separate module only if the class is still too large after the above extractions.

#### ai-orchestrator split

Separate the `AiOrchestrator` class (1,628 lines) into focused classes:

1. **Single-slide orchestrator** — `runSingleSlideOperation`, the repair loop, directive re-injection (lines 138-248, 320-338).
2. **Whole-deck orchestrator** — `runWholeDeckOperation`, `#runWholeDeckSingleCall`, `#runWholeDeckBatched`, `#processBatch` (lines 249-725).
3. **Remix/Reimagine orchestrator** — `#runRemix`, `#runRemixPlan`, `#runReimagine`, `#runReimagineOutline`, `#outlineToVirtualSlides`, `#flattenReimagineOutline` (lines 726-1212).

Shared helpers (`_buildReasoningBody`, provider/model configuration) stay in a base class or shared utility.

- **Files:** `src/editor/core/edit-controller.js`, new sub-module files under `src/editor/core/`, `src/data/ai/ai-orchestrator.js`, new files under `src/data/ai/`
- **Blast radius:** High — every editor and AI path flows through these two classes. Must preserve all existing behavior, DI wiring, patch formats, and callback contracts.
- **Dependencies:** PR 2 must land first (E2E safety net).
- **Verification:** Full quality gate (`npm run lint`, `npm run format:check`, `npm test`, `npm run build`). `npx playwright test` passes. Pay special attention to:
  - `SaveManager.getFullSlides()` / `getFullMarkdown()` still work without `DeckStore`.
  - `prepareStoreOperation()` does not broadcast `storeChange` or clear CodeMirror history.
  - Undo after save reverts the just-saved text.
  - `loadSlideIntoEditor()` preserves the undo stack when the slide hasn't changed.
  - No `[object Object]` in AI prompts.
  - `DeckStore.applyPatches` default remains `emit: true`.
  - Single-slide patches, whole-deck Markdown, Remix plan→execute, and Reimagine outline→review→generate flows all work.
- **PR description:** Include Manual Verification steps for the key editor/AI flows (single-slide AI, undo after save, save/export, Remix, Reimagine) per AGENTS.md.

## Suggested Merge Order

1. **PR 1 and PR 2** — parallel. PR 1 is low-risk DX/docs; PR 2 adds observability and the E2E safety net.
2. **PR 3** — after PR 2 merges. The big structural refactor, validated by the new E2E harness.

## Plan Maintenance

As each PR merges, update `ROADMAP.md` to mark the corresponding Phase 14.5 tasks `[x]`.

## Acceptance Criteria

- `JS_BUNDLE_ORDER` is defined in one place; `HtmlExportManager` imports it.
- `tools/` and `*.mjs` files pass ESLint.
- `docs/ai-positioning.md` documents the AI/tool boundary.
- `CONTRIBUTING.md` documents setup, quality gates, and conventions.
- `docs/adr/` exists with a template and at least one initial ADR.
- Ad-hoc `console.*` calls in `src/` are replaced by a level-based logger.
- Playwright E2E tests cover open deck, edit slide, switch layout, export HTML, and PPTX import.
- `EditController` delegates store-to-view sync, editor buffer, history, and AI edit flows to dedicated DI modules; all existing tests pass.
- `ai-orchestrator.js` is split into focused classes for single-slide, whole-deck, and Remix/Reimagine flows; all existing tests pass.
