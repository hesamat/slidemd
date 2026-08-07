# Phase 14: Conflict Resolution & Global Undo — Implementation Plan

Goal: Make the current working deck safe under asynchronous AI edits and undoable as a single state track. Reconcile stale single-slide patches, define global undo semantics for committed deck operations, synchronize `DeckStore` with the editor view, and remove the Phase 12 boundary-sync mirror.

This plan implements the roadmap in two delivery slices:

- **Phase 14.1 — State safety and conflicts:** working-state capture, stale-operation guards, store-to-view synchronization, `ConflictResolver`, and the minimal conflict-choice UI.
- **Phase 14.2 — Undo semantics and editor rewire:** committed-operation undo/redo behavior, sub-module migration, external writer migration, and removal of `originalMarkdown` / `syncStoreFromSlides`. Undo/redo controls are an optional stretch item after the core undo behavior is complete.

## Roadmap Alignment

The roadmap defines three outcomes:

1. Reconcile overlapping user and AI edits before applying a patch.
2. Make committed deck operations undoable through `DeckHistory`.
3. Replace the Phase 12 boundary-sync pattern with direct `DeckStore` reads/writes across the editor.

Whole-deck `generate`, Remix, and Reimagine remain outside `ConflictResolver` scope. They use `AiOrchestrator`, return complete Markdown, and are committed atomically through `DeckStore.replaceDeck()` rather than as single-slide patches.

## Current State (verified against code)

### Existing state infrastructure

- `DeckStore` — <ref_file file="/home/hesam/Documents/Projects/html-presentation/src/data/store/deck-store.js" /> — stores slide Markdown and the active index, supports `applyPatch`/`applyPatches`, `replaceDeck`, `syncSlides`, `undo`, `redo`, and change listeners.
- `DeckHistory` — <ref_file file="/home/hesam/Documents/Projects/html-presentation/src/data/store/deck-history.js" /> — stores full pre-operation snapshots with bounded undo/redo stacks.
- `SlidePatch` — <ref_file file="/home/hesam/Documents/Projects/html-presentation/src/data/store/slide-patch.js" /> — supports edit, insert, delete, no-op, and compound move patches.
- Single-slide AI operations return patches from `AiOrchestrator.runOperation()` — <ref_snippet file="/home/hesam/Documents/Projects/html-presentation/src/data/ai/ai-orchestrator.js" lines="320-328" />.
- Whole-deck AI operations use the orchestrator but return Markdown and are applied through `DeckStore.replaceDeck()` — <ref_snippet file="/home/hesam/Documents/Projects/html-presentation/src/editor/core/edit-controller.js" lines="841-870" />.

### Current gaps

1. **Conflict detection is too late and uses stale state.** `runSingleSlideAi()` prepares the store before starting the request, but later editor input is kept in `unsavedMarkdown`, not automatically synchronized into `DeckStore` — <ref_snippet file="/home/hesam/Documents/Projects/html-presentation/src/editor/core/edit-controller.js" lines="595-625" />. A result can therefore overwrite text typed while the request was in flight.
2. **No structural-operation guard exists.** AI patches target an index and `before` string. Insert/delete/move operations during an async AI request can make that index stale or point to the wrong duplicate slide.
3. **Undo semantics are mixed.** CodeMirror handles local editor undo while `DeckHistory` handles committed structural/AI operations — <ref_snippet file="/home/hesam/Documents/Projects/html-presentation/src/engine/keyboard-handler.js" lines="197-214" />. Phase 14 must document and test this boundary rather than describe undo as universally global.
4. **Store rejection can leave state divergent.** `SlideOperations._applyStorePatches()` currently retries and then proceeds even if the store still rejects the patch — <ref_snippet file="/home/hesam/Documents/Projects/html-presentation/src/editor/core/slide-operations.js" lines="73-103" />. This is incompatible with a canonical store.
5. **The parsed deck and DOM are not subscribed to store changes.** Existing operations update `DeckStore`, the parsed `deck`, and the DOM separately. The rewire needs one explicit store-to-view synchronization boundary.
6. **`originalMarkdown` is used by several services.** `SaveManager`, `SlideOperations`, `StyleApplier`, `EditController`, Open Deck, and PPTX background-upload code all depend on it. It must be replaced only after working-state and view synchronization are in place.
7. **Undo controls are not wired.** The shortcut registry contains undo/redo entries, but toolbar controls would also require markup, element gathering, event wiring, and styling.

## State Model and Design Decisions

### D1: Working state versus committed store state

Use two explicit layers:

- **Committed working deck:** `DeckStore.getSlides()`. This includes committed structural, style, AI, and saved editor operations and is the basis for `DeckHistory`.
- **Current working deck:** `DeckStore.getSlides()` with the `unsavedMarkdown` editor overlay applied. This is the state the user currently sees while typing.

`SaveManager` becomes the canonical working-state adapter:

```text
getFullSlide(index)  -> store slide with unsaved editor value overlaid
getFullSlides()      -> all store slides with unsaved values overlaid
getFullMarkdown()    -> getFullSlides().join("\n\n---\n\n")
```

No sub-module should reimplement the overlay.

### D2: AI application transaction

A single-slide AI result must use the latest working state, not only the state captured when the request began.

```text
1. Capture the current editor buffer.
2. Read the current working deck through SaveManager.
3. Check the target and structural revision.
4. Resolve the patch against the current working target slide.
5. If keeping edits, do nothing.
6. If overwriting or rebasing, sync the latest working deck into DeckStore without history.
7. Apply the final AI patch once so DeckHistory stores the user's latest state before the AI result.
8. Re-render from the store and preserve non-targeted working edits.
```

The no-history synchronization in step 6 is intentional: the following AI `applyPatch` records one history entry whose `before` snapshot includes the user's latest edits.

### D3: Structural-operation guard

Add a monotonic structural revision to `DeckStore` or an equivalent operation token. Capture it when a single-slide AI operation begins. Increment it for operations that can change slide identity or index:

- `loadFromMarkdown`
- `replaceDeck`
- insert
- delete
- move
- duplicate

Text-only editor changes do not invalidate the structural revision; they are handled by D2.

If the structural revision changes before an AI result returns, do not apply the original index-based patch. Cancel or show a conflict message. This prevents an AI result from applying to a different slide after reordering, including duplicate-slide edge cases.

### D4: Undo semantics

Phase 14 uses **committed-operation undo**:

- CodeMirror handles local typing undo while the editor has an uncommitted buffer.
- `DeckHistory` handles committed AI, structural, style, saved-editor, and whole-deck operations.
- Toolbar undo/redo buttons call the same `EditController.undo()` / `redo()` methods as keyboard shortcuts.
- The UI must make this boundary clear; Phase 14 does not convert every keystroke into a `DeckHistory` entry.

If the product later requires every keystroke to be globally undoable, that is a separate text-edit transaction project.

### D5: Store-to-view synchronization

`DeckStore` is the canonical Markdown state, but the renderer uses parsed deck objects. Add one EditController-owned synchronization path for store mutations:

```text
DeckStore mutation
  -> store change handler
  -> parse DeckStore.toMarkdown()
  -> update controller deck, navigator, thumbnails, preview, and editor
```

Avoid independent ad hoc store/deck/DOM mutations where possible. If an operation needs an optimized targeted DOM update, it must still leave the parsed deck and store consistent and must not proceed after a rejected store patch.

### D6: Conflict scope

`ConflictResolver` handles only single-slide patch operations:

- `enhanceSlide`: destructive; reject as a rebase and offer keep/overwrite.
- `addSpeakerNotes`: additive; replace the existing notes comment while preserving visible content.

Whole-deck `generate`, Remix, and Reimagine are atomic `replaceDeck` operations and are not passed through `ConflictResolver`.

### D7: No targeted `revertPatch`

Do not add `revertPatch`. `DeckHistory` is snapshot-based and already provides sequential undo/redo. The roadmap has been corrected to describe snapshot-based history instead of a targeted revert API.

## Phase 14.1: State Safety and Conflicts

### Task 1: Working-state adapter

Update `SaveManager` to receive `DeckStore` or a store getter and add:

- `getFullSlide(index)`
- `getFullSlides()` based on `deckStore.getSlides()` plus `unsavedMarkdown`
- `getFullMarkdown()` based on `getFullSlides()`

Remove its dependency on `getOriginalMarkdown` for working-state reads. Keep save-state flags separate from the working Markdown source.

Update `EditController.prepareStoreOperation()` and the AI path so that the latest editor buffer is captured immediately before conflict resolution and before any final apply.

### Task 2: Structural revision and fail-closed patch application

Add the structural revision/token to `DeckStore` and expose a read-only getter. Update structural operations to capture and validate it.

Change `SlideOperations._applyStorePatches()` so that a rejected patch:

- Does not mutate `deck.slides`.
- Does not mutate the DOM.
- Does not silently continue.
- Returns failure and shows a user-facing notification or lets the caller handle the failure.

A one-time recovery sync may be attempted only if it is proven safe; after a second rejection, the operation must stop.

### Task 3: Store-to-view synchronization

Add an EditController-owned store change handler or equivalent adapter that updates the parsed deck and editor-facing UI after store mutations. Ensure it does not create recursive store writes.

Use this path for:

- AI patch application.
- Undo/redo restore.
- Structural operations.
- Style application.
- New deck loads.

Add tests for store mutation, rejection, undo, and redo projections.

### Task 4: `ConflictResolver`

**New file:** `src/data/store/conflict-resolver.js`

Keep the resolver pure and independent of DOM and `DeckStore`:

```js
resolveConflict({
  patch,
  currentSlideMarkdown,
  intent,
  structuralRevisionChanged,
  rebase,
})
  -> { action: "apply" | "rebase" | "reject", reason, rebasedPatch? }
```

Rules:

- If the structural revision changed, return `reject` with a stale-target reason.
- If `patch.before === currentSlideMarkdown`, return `apply`.
- If the target text changed and the intent is `enhanceSlide`, return `reject`.
- If the target text changed and the intent is `addSpeakerNotes`, call the notes rebase strategy.
- If the notes strategy cannot extract a valid notes block from `patch.after`, return `reject`.

For `addSpeakerNotes`, use `MarkdownParser` helpers to:

1. Extract only the notes content from `patch.after`.
2. Strip existing notes comments from the current working slide.
3. Append one canonical `<!-- notes: ... -->` block.
4. Preserve all visible Markdown from the user's current slide.

Do not copy the full AI slide during a notes rebase.

### Task 5: Conflict-choice UI

**New file:** `src/editor/ui/conflict-modal.js` with matching styles following the existing modal naming convention.

The modal is a choice UI, not a merge editor. It displays:

- Affected slide number.
- Intent name.
- A concise stale-edit explanation.
- `Keep my edits`.
- `Overwrite with AI`.

Behavior:

- **Keep:** close without changing `DeckStore`, the editor buffer, or history.
- **Overwrite:** capture the current editor buffer again, re-read the current working slide, re-check the structural revision and patch precondition, then sync the working deck and apply only if still valid.
- If the state changed while the modal was open, do not overwrite silently; re-prompt or reject.

### Task 6: Single-slide AI integration

Update `EditController.runSingleSlideAi()`:

1. Capture the initial operation context and structural revision.
2. Run the orchestrator.
3. Capture the latest editor state when the result returns.
4. Resolve against `SaveManager.getFullSlide(targetSlide)`.
5. Apply the transaction from D2.
6. Preserve non-targeted unsaved edits.
7. Reload/render from the resulting store state.

The existing generic `DeckStore.applyPatches()` failure notification becomes a final defensive check, not the primary conflict mechanism.

### Phase 14.1 Tests

Add or update tests for:

- User typing after the AI request begins.
- User editing another slide while AI is pending.
- Insert/delete/move during an AI request.
- Duplicate slides with identical Markdown.
- `enhanceSlide` reject and keep/overwrite paths.
- `addSpeakerNotes` replacement with existing notes.
- Visible content preservation during notes rebase.
- Typing while the conflict modal is open.
- Store rejection leaving the parsed deck and DOM unchanged.

## Phase 14.2: Undo Semantics and Editor Rewire

### Task 7: Complete committed-operation undo/redo

Keep CodeMirror local undo behavior for uncommitted editor text. Ensure committed operations use `DeckHistory` consistently:

- AI single-slide patch.
- AI refine-all `replaceDeck`.
- Insert, delete, duplicate, and move.
- Style application.
- Saved editor changes.

Do not add speculative `beginBatch()` / `endBatch()` work: `DeckStore.applyPatches()` already records one history snapshot for a patch array. Add batching only if the rewire introduces separate per-slide history entries and a failing test demonstrates the need.

Verify:

- Undo and redo from the preview.
- Local CodeMirror undo while typing.
- AI operation followed by new local typing.
- Redo invalidation after a new committed operation.
- History clearing on a new deck load.
- Refine-all undo restoring the complete previous deck.

### Task 8: Undo/redo controls (stretch)

Only implement this task if the core Phase 14 acceptance criteria are complete. Add optional editor buttons in the `editor__body-header` next to the insert dropdown. They must:

- Call `EditController.undo()` / `redo()`.
- Reflect `DeckStore.canUndo()` / `canRedo()` for committed history.
- Use accessible labels and titles.
- Be disabled when no committed history exists.
- Not claim to replace CodeMirror's local typing undo.

Required integration files:

- `index.html` — button markup.
- `src/core/element-gatherer.js` — element references.
- `src/editor/core/edit-controller.js` — event wiring and cleanup.
- `styles/editor.css` or the appropriate editor stylesheet — button styling.

### Task 9: Rewire structural operations

Update `SlideOperations` to:

- Read source Markdown through `SaveManager.getFullSlide()` or `DeckStore` as appropriate.
- Build insert/delete/edit/move patches.
- Apply through `DeckStore.applyPatch(es)`.
- Stop on rejection.
- Update the view through the store-to-view synchronization path.
- Avoid mutating `originalMarkdown`.

Migrate `src/__tests__/slide-operations.test.js` from a mutable `originalMarkdown` fixture to a `DeckStore` fixture and assert history behavior.

### Task 10: Rewire editor services

Update `StyleApplier` to read the working overlay through `SaveManager` and apply all-slide style changes as one patch transaction where the operation is intended to be committed immediately. It must not mutate only the parsed deck or only `unsavedMarkdown` while leaving the store stale.

Update `SaveManager`:

- Read working Markdown from `DeckStore` plus the unsaved overlay.
- On successful save, clear the overlay and dirty state without assigning a replacement `originalMarkdown` array.
- Keep save preparation and store synchronization explicit.

Update `EditController` reads:

- Use `DeckStore.getSlides()` for committed state.
- Use `SaveManager.getFullSlide()` / `getFullSlides()` for current working state.
- Remove `_cacheOriginalMarkdown`, `getOriginalMarkdown`, and `setOriginalMarkdown` after all consumers migrate.

### Task 11: Migrate external writers

Update direct `originalMarkdown` writers:

- `src/editor/ui/open-deck-modal.js` — use `DeckStore.loadFromMarkdown()` for a complete new deck, or `syncSlides()` for a controlled background image-path replacement.
- `src/engine/pptx-importer.js` — update the active store with the server-path Markdown after background uploads; preserve the intended history boundary.

Verify that these updates do not accidentally retain history from a previous deck or discard newer working edits.

### Task 12: Remove the boundary-sync mirror

Only after Tasks 7–11 are green:

- Delete `originalMarkdown` from `EditController`.
- Delete `syncStoreFromSlides()`.
- Remove `getOriginalMarkdown` / `setOriginalMarkdown` dependencies.
- Remove the mirror listener if it was used during migration.
- Confirm no source references remain except historical documentation.

### Phase 14.2 Tests

Add or update tests for:

- Store-to-view synchronization after structural operations.
- Insert/delete/duplicate/move undo and redo.
- Style application as one history operation.
- Save with working-state overlay.
- Open Deck history reset.
- PPTX background image-path replacement.
- Undo/redo controls and disabled states, if the optional stretch task is implemented.
- No remaining `originalMarkdown` or `syncStoreFromSlides` references.

## Files Touched

### New

- `src/data/store/conflict-resolver.js`
- `src/editor/ui/conflict-modal.js`
- Conflict modal CSS, following existing style conventions
- `src/__tests__/conflict-resolver.test.js`
- Conflict integration tests, either a new file or the existing EditController test suite

### Modified

- `ROADMAP.md`
- `src/data/store/deck-store.js` — structural revision/token and fail-safe state support
- `src/editor/core/edit-controller.js` — working-state capture, conflict flow, store-to-view sync, optional undo controls, final mirror removal
- `src/editor/core/slide-operations.js` — store-backed structural operations and fail-closed rejection
- `src/editor/core/style-applier.js` — working-state reads and store-backed style transactions
- `src/editor/ui/save-manager.js` — canonical working-state overlay
- `src/editor/ui/open-deck-modal.js` — store-backed external update
- `src/engine/pptx-importer.js` — store-backed background image-path update
- `src/engine/keyboard-handler.js` — only if shortcut behavior needs explicit committed-operation handling
- `src/core/element-gatherer.js` — undo/redo controls
- `index.html` — undo/redo controls
- `styles/editor.css` or the selected editor stylesheet
- `src/__tests__/deck-store.test.js`
- `src/__tests__/deck-history.test.js`
- `src/__tests__/slide-operations.test.js`
- `src/__tests__/ai-orchestrator.test.js` if operation metadata changes
- EditController/conflict integration tests

### Removed after migration

- `EditController.originalMarkdown`
- `_cacheOriginalMarkdown()`
- `syncStoreFromSlides()`
- `getOriginalMarkdown` / `setOriginalMarkdown` dependency wiring

## Execution Order

```text
14.1a Working-state adapter + structural revision
      ↓
14.1b Store-to-view synchronization + fail-closed patch handling
      ↓
14.1c ConflictResolver + conflict-choice UI
      ↓
14.1d Single-slide AI integration and conflict tests
      ↓
14.2a Committed-operation undo semantics and tests
      ↓
14.2b Undo/redo controls (stretch, optional)
      ↓
14.2c Structural/editor service rewire
      ↓
14.2d External writers + originalMarkdown removal
```

The work is intentionally ordered around state safety. Conflict handling must be built on the latest working-state adapter and structural guard. Mirror removal must wait until store-to-view synchronization and all external writers are migrated.

## Acceptance Criteria

1. A single-slide AI result never overwrites editor text typed after the request began without an explicit user choice.
2. Insert/delete/move/duplicate operations during an AI request cannot apply the result to the wrong slide.
3. `enhanceSlide` conflicts offer keep/overwrite without a three-way diff editor.
4. `addSpeakerNotes` replaces only the notes comment and preserves visible user content.
5. Keep leaves the editor, store, and history unchanged.
6. Overwrite/rebase revalidate state immediately before applying and create correct undo history.
7. Every committed store operation is undoable and redoable according to the documented CodeMirror/DeckHistory boundary.
8. Store patch rejection leaves the parsed deck, renderer, thumbnails, and DOM unchanged.
9. Opening/loading a new deck does not retain history from the previous deck.
10. Save uses the store plus unsaved overlay and loses no content.
11. Open Deck and PPTX background image updates write through `DeckStore`.
12. No production references to `originalMarkdown` or `syncStoreFromSlides` remain after Phase 14.2.

## Manual Verification

### Phase 14.1

1. Start an `enhanceSlide` request, type additional content before the AI returns, and confirm the result does not overwrite it silently.
2. While AI is pending, move or delete the target slide. Confirm the result is rejected or cancelled and cannot affect another slide.
3. Trigger `enhanceSlide` on a changed slide. Choose Keep and confirm no store/history change. Choose Overwrite and confirm the AI result is undoable.
4. Trigger `addSpeakerNotes` on a slide with existing notes and visible edits. Confirm only the notes comment is replaced.
5. Edit another slide while AI is pending. Confirm that edit survives both apply and reject paths.

### Phase 14.2

6. Type in CodeMirror and verify local undo remains local until the editor change is committed.
7. Perform AI, structural, style, and refine-all operations. Confirm each committed operation is undoable and redoable.
8. Confirm undo/redo buttons update their disabled states and match shortcut behavior.
9. Insert, delete, duplicate, and move slides. Confirm store, parsed deck, thumbnails, preview, and editor remain consistent.
10. Open a new deck and confirm old history cannot be undone.
11. Import a PPTX with images, wait for background upload, save, and verify server image paths persist.
12. Save a deck with unsaved text and confirm the store-plus-overlay output contains all edits.

## Verification Commands

Per `AGENTS.md`, run the full quality gate when implementation is ready for commit:

```bash
npm run lint
npm run format:check
npm test
npm run build
```

Before the full gate, run targeted tests and browser verification for each delivery slice. Do not update roadmap checkboxes to complete until the acceptance criteria and manual verification pass.
