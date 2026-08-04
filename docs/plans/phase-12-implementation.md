# Phase 12: Deck Store & Patches — Implementation Plan

## Objective

Make the slide array a canonical, patchable store with undo history. After this phase, there is a single source of truth for the slide-string array and active index, a `SlidePatch` type for describing changes, `applyPatch`/`revertPatch` operations, and a `DeckHistory` snapshot stack. `EditController` syncs to/from the store at defined boundaries (slide switch, save, AI apply) without a deep rewire.

This is the apply target for Phase 13's AI orchestrator. The orchestrator will produce `SlidePatch` objects and call `deckStore.applyPatch(patch)` — undoable from day one.

## Current State (do not assume — verify by reading the files)

- `src/editor/core/edit-controller.js` — orchestrator for editor sub-modules. Read this first to understand how it currently manages slide-array state.
- `src/editor/core/slide-operations.js` — slide CRUD operations (add, delete, duplicate, move). These currently manipulate the markdown array directly.
- `src/editor/core/markdown-editor.js` — the CodeMirror editor. Holds the full deck markdown as a string. Edits here are the source of truth today.
- `src/editor/core/slide-preview-updater.js` — parses markdown and re-renders slide previews.
- `src/engine/reload-manager.js` — `replaceDeck()` at ~line 234 replaces the entire deck. Used by PPTX import and AI apply today.
- `src/engine/deck-controller.js` — holds deck data, exposes it to the engine.
- `src/data/markdown-parser.js` — `splitSlides()` at line 195 splits on `---`, `parseDeckMarkdown()` at line 728.
- `src/editor/core/edit-state-manager.js` — may track editing state; read to understand current state management.

Read all of these before designing the store. The store must be shaped to fit the existing architecture, not the other way around.

## New Files to Create

```
src/data/store/
  deck-store.js        # Canonical slide-string array + active index
  slide-patch.js       # { index, before, after, source } type + helpers
  deck-history.js      # Snapshot stack for undo/redo
```

## Files to Modify

- `src/editor/core/edit-controller.js` — wire to DeckStore at boundaries
- `src/editor/core/slide-operations.js` — route through DeckStore.applyPatch
- `src/engine/reload-manager.js` — `replaceDeck()` syncs to DeckStore
- `src/engine/deck-controller.js` — may need to expose DeckStore reference

## Files NOT to Modify

- `src/data/markdown-parser.js` — consumed, not modified
- `src/editor/ai-sidebar.js` — no changes in Phase 12 (Phase 13 rewires it)
- `src/editor/conversion-modal.js` — no changes
- `src/engine/pptx-importer.js` — no changes (still uses ReloadManager)
- `src/renderer/` — no changes (reads from deck data, which DeckStore backs)

## Workstream 1: SlidePatch + DeckStore + DeckHistory (pure logic)

### 1.1 Create `src/data/store/slide-patch.js`

```javascript
/**
 * @typedef {Object} SlidePatch
 * @property {number} index        — 0-based slide index being changed
 * @property {string|null} before  — the slide markdown before the change (null for insert)
 * @property {string|null} after   — the slide markdown after the change (null for delete)
 * @property {string} source       — who made the change: "user" | "ai" | "import" | "system"
 * @property {number} timestamp    — Date.now() when the patch was created
 */

/**
 * Create a SlidePatch for a slide edit (replace).
 * @param {number} index
 * @param {string} before
 * @param {string} after
 * @param {string} source
 * @returns {SlidePatch}
 */
export function createEditPatch(index, before, after, source = "user") {
  return { index, before, after, source, timestamp: Date.now() };
}

/**
 * Create a SlidePatch for a slide insertion.
 * @param {number} index — index where the new slide should be inserted
 * @param {string} after — the new slide markdown
 * @param {string} source
 * @returns {SlidePatch}
 */
export function createInsertPatch(index, after, source = "user") {
  return { index, before: null, after, source, timestamp: Date.now() };
}

/**
 * Create a SlidePatch for a slide deletion.
 * @param {number} index
 * @param {string} before — the slide markdown being deleted
 * @param {string} source
 * @returns {SlidePatch}
 */
export function createDeletePatch(index, before, source = "user") {
  return { index, before, after: null, source, timestamp: Date.now() };
}

/**
 * Check if a patch is an insert (before === null).
 */
export function isInsert(patch) {
  return patch.before === null && patch.after !== null;
}

/**
 * Check if a patch is a delete (after === null).
 */
export function isDelete(patch) {
  return patch.after === null && patch.before !== null;
}

/**
 * Check if a patch is a no-op (before === after).
 */
export function isNoOp(patch) {
  return patch.before === patch.after;
}

/**
 * Invert a patch — returns a patch that undoes the original.
 * @param {SlidePatch} patch
 * @returns {SlidePatch}
 */
export function invertPatch(patch) {
  return { ...patch, before: patch.after, after: patch.before };
}
```

### 1.2 Create `src/data/store/deck-history.js`

```javascript
/**
 * Snapshot stack for undo/redo.
 * Stores full deck snapshots (slide-string arrays) at each patch point.
 * Memory-bounded — when the stack exceeds maxEntries, oldest entries are dropped.
 *
 * @typedef {Object} HistoryEntry
 * @property {string[]} slides     — snapshot of the slide array BEFORE the patch was applied
 * @property {number} activeIndex  — active index BEFORE the patch was applied
 * @property {SlidePatch} patch     — the patch that was applied (for metadata)
 */

export class DeckHistory {
  /**
   * @param {object} opts
   * @param {number} opts.maxEntries — default 100
   */
  constructor({ maxEntries = 100 } = {}) {
    this._undoStack = [];
    this._redoStack = [];
    this._maxEntries = maxEntries;
  }

  /**
   * Push a snapshot before a patch is applied.
   * Clears the redo stack (can't redo after a new action).
   * @param {string[]} slides
   * @param {number} activeIndex
   * @param {SlidePatch} patch
   */
  push(slides, activeIndex, patch) {
    this._undoStack.push({ slides: [...slides], activeIndex, patch });
    if (this._undoStack.length > this._maxEntries) {
      this._undoStack.shift();
    }
    this._redoStack = [];
  }

  /**
   * Pop the last undo entry. Returns the snapshot to restore, or null if empty.
   * Pushes the current state onto the redo stack.
   * @param {string[]} currentSlides
   * @param {number} currentActiveIndex
   * @returns {HistoryEntry|null}
   */
  popUndo(currentSlides, currentActiveIndex) {
    const entry = this._undoStack.pop();
    if (!entry) return null;
    this._redoStack.push({
      slides: [...currentSlides],
      activeIndex: currentActiveIndex,
      patch: entry.patch,
    });
    return entry;
  }

  /**
   * Pop the last redo entry. Returns the snapshot to restore, or null if empty.
   * Pushes the current state onto the undo stack.
   * @param {string[]} currentSlides
   * @param {number} currentActiveIndex
   * @returns {HistoryEntry|null}
   */
  popRedo(currentSlides, currentActiveIndex) {
    const entry = this._redoStack.pop();
    if (!entry) return null;
    this._undoStack.push({
      slides: [...currentSlides],
      activeIndex: currentActiveIndex,
      patch: entry.patch,
    });
    return entry;
  }

  canUndo() {
    return this._undoStack.length > 0;
  }
  canRedo() {
    return this._redoStack.length > 0;
  }

  clear() {
    this._undoStack = [];
    this._redoStack = [];
  }
}
```

### 1.3 Create `src/data/store/deck-store.js`

````javascript
import { DeckHistory } from "./deck-history.js";
import { isInsert, isDelete, isNoOp, invertPatch } from "./slide-patch.js";

/**
 * Canonical source of truth for the slide-string array and active index.
 * All mutations go through applyPatch / revertPatch.
 *
 * Events (via simple callback list — no event emitter library):
 * - "change"   — slides array changed (any patch applied or reverted)
 * - "slide"    — active index changed
 * - "patch"    — a patch was applied (receives the patch)
 *
 * Listeners are notified AFTER the store state is updated.
 */
export class DeckStore {
  /**
   * @param {object} opts
   * @param {number} opts.maxHistory — max history entries (default 100)
   */
  constructor({ maxHistory = 100 } = {}) {
    this._slides = []; // string[] — one entry per slide (no --- separators)
    this._activeIndex = 0;
    this._history = new DeckHistory({ maxEntries: maxHistory });
    this._listeners = new Map(); // event name -> Set<callback>
  }

  // --- Read API ---

  /** @returns {string[]} — a copy of the slide array */
  getSlides() {
    return [...this._slides];
  }

  /** @returns {string} — the slide at the active index */
  getActiveSlide() {
    return this._slides[this._activeIndex] ?? "";
  }

  /** @returns {number} */
  getActiveIndex() {
    return this._activeIndex;
  }

  /** @returns {number} */
  getSlideCount() {
    return this._slides.length;
  }

  /** @returns {boolean} */
  canUndo() {
    return this._history.canUndo();
  }

  /** @returns {boolean} */
  canRedo() {
    return this._history.canRedo();
  }

  // --- Write API ---

  /**
   * Load a full deck markdown string into the store.
   * Resets history. Used on deck open / import / replace.
   * @param {string} markdown — full deck markdown with --- separators
   * @param {number} [activeIndex=0]
   */
  loadFromMarkdown(markdown, activeIndex = 0) {
    this._slides = splitSlidesSimple(markdown);
    this._activeIndex = activeIndex;
    this._history.clear();
    this._emit("change");
    this._emit("slide");
  }

  /**
   * Apply a patch to the store. Pushes the pre-patch state to history.
   * @param {SlidePatch} patch
   * @returns {boolean} — true if applied, false if no-op
   */
  applyPatch(patch) {
    if (isNoOp(patch)) return false;

    this._history.push(this._slides, this._activeIndex, patch);

    if (isInsert(patch)) {
      this._slides.splice(patch.index, 0, patch.after);
      if (patch.index <= this._activeIndex) this._activeIndex++;
    } else if (isDelete(patch)) {
      this._slides.splice(patch.index, 1);
      if (patch.index < this._activeIndex) this._activeIndex--;
      if (this._activeIndex >= this._slides.length) {
        this._activeIndex = Math.max(0, this._slides.length - 1);
      }
    } else {
      // Edit (replace)
      this._slides[patch.index] = patch.after;
    }

    this._emit("patch", patch);
    this._emit("change");
    return true;
  }

  /**
   * Revert (undo) the last patch.
   * @returns {boolean} — true if something was undone
   */
  undo() {
    const entry = this._history.popUndo(this._slides, this._activeIndex);
    if (!entry) return false;
    this._slides = entry.slides;
    this._activeIndex = entry.activeIndex;
    this._emit("change");
    this._emit("slide");
    return true;
  }

  /**
   * Redo the last undone patch.
   * @returns {boolean} — true if something was redone
   */
  redo() {
    const entry = this._history.popRedo(this._slides, this._activeIndex);
    if (!entry) return false;
    this._slides = entry.slides;
    this._activeIndex = entry.activeIndex;
    this._emit("change");
    this._emit("slide");
    return true;
  }

  /**
   * Set the active slide index.
   * @param {number} index
   */
  setActiveIndex(index) {
    if (index < 0 || index >= this._slides.length) return;
    if (index === this._activeIndex) return;
    this._activeIndex = index;
    this._emit("slide");
  }

  /**
   * Export the full deck as a markdown string with --- separators.
   * @returns {string}
   */
  toMarkdown() {
    return this._slides.join("\n---\n");
  }

  // --- Event system ---

  on(event, callback) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(callback);
    return () => this._listeners.get(event)?.delete(callback);
  }

  _emit(event, data) {
    this._listeners.get(event)?.forEach((cb) => cb(data));
  }
}

/**
 * Simple slide splitter — splits on --- at the start of a line.
 * Does NOT use MarkdownParser (avoids window.markdownit dependency for the store).
 * Must produce the same result as MarkdownParser.splitSlides().
 * Read src/data/markdown-parser.js splitSlides() (line 195) to match its behavior exactly.
 */
function splitSlidesSimple(markdown) {
  // Read markdown-parser.js splitSlides() and replicate the exact splitting logic.
  // It splits on lines that are exactly "---" (possibly with whitespace).
  // It handles frontmatter (the first --- pair is frontmatter, not a slide separator).
  // It handles code fences (--- inside ``` blocks are not separators).
  // If the logic is complex enough that duplicating it is risky,
  // export a pure splitSlides function from markdown-parser.js and import it here.
  // (Preferably: refactor markdown-parser.js to export splitSlides as a standalone
  // function that doesn't require window.markdownit, then import it here.)
}
````

Critical implementation note for `splitSlidesSimple`: The existing `splitSlides()` in `markdown-parser.js` (line 195) may depend on `window.markdownit` or other setup. Read it carefully. If it's a pure function that doesn't need markdown-it, export it and import it here. If it has dependencies, extract the pure splitting logic into a shared utility that both `markdown-parser.js` and `deck-store.js` can import. **Do not duplicate splitting logic** — that's a bug source.

### 1.4 Tests

Create `src/__tests__/slide-patch.test.js`:

- `createEditPatch` produces correct shape
- `createInsertPatch` has `before: null`
- `createDeletePatch` has `after: null`
- `isInsert`, `isDelete`, `isNoOp` classify correctly
- `invertPatch` swaps before/after
- Edge case: `isNoOp` on a patch where both are null (shouldn't happen but handle)

Create `src/__tests__/deck-history.test.js`:

- `push` adds to undo stack, clears redo
- `popUndo` returns the entry, pushes to redo
- `popRedo` returns the entry, pushes to undo
- `canUndo`/`canRedo` correct after operations
- `maxEntries` drops oldest when exceeded
- `clear` empties both stacks

Create `src/__tests__/deck-store.test.js`:

- `loadFromMarkdown` splits correctly, resets history
- `applyPatch` edit: replaces slide at index, pushes history
- `applyPatch` insert: inserts at index, adjusts active index if needed
- `applyPatch` delete: removes at index, adjusts active index
- `applyPatch` no-op: returns false, doesn't push history
- `undo` after edit: restores previous slide
- `undo` after insert: removes the inserted slide
- `undo` after delete: restores the deleted slide
- `redo` after undo: re-applies the patch
- New action after undo: clears redo stack
- `setActiveIndex` with valid/invalid indices
- `toMarkdown` joins with `---`
- Event listeners: "change", "slide", "patch" fire correctly
- Event listener unsubscribe works

### 1.5 Verification

- `npm test` — all new tests pass, existing tests unaffected
- `npm run lint && npm run format:check`

---

## Workstream 2: Wire EditController to DeckStore (boundary sync)

This is the riskiest workstream. Read `edit-controller.js` and all its sub-modules thoroughly before starting. The goal is **boundary sync**, not a deep rewire.

### 2.1 Understand the current state flow

Read these files and trace how slide state flows today:

1. `src/editor/core/edit-controller.js` — how does it get the current slide array? From `DeckController`? From the markdown editor string? Both?
2. `src/editor/core/markdown-editor.js` — the CodeMirror editor holds the full deck as a string. When the user types, what happens? Does it call `slide-preview-updater`? How does the slide array get updated?
3. `src/editor/core/slide-operations.js` — when a slide is added/deleted/moved, how does it update the array? Does it edit the CodeMirror string directly, or manipulate a separate array?
4. `src/engine/reload-manager.js` — `replaceDeck()` replaces the entire deck. How does the editor learn about this?
5. `src/engine/deck-controller.js` — what state does it hold? Is it the current source of truth for the engine?

Document your findings as comments in the code (or in a design note) before writing any wiring code.

### 2.2 Create the DeckStore instance

In `deck.js` (the application entry point), create a `DeckStore` instance and pass it to both `EditController` and `DeckController`:

```javascript
import { DeckStore } from "./data/store/deck-store.js";

const deckStore = new DeckStore({ maxHistory: 100 });
```

Pass `deckStore` to `EditController` via constructor dependency injection (following the existing pattern in AGENTS.md — sub-modules receive specific dependencies, not the full controller).

### 2.3 Boundary sync points

The store syncs at these boundaries (NOT on every keystroke):

1. **Deck load/open**: When a deck is loaded (via `DeckController` or `ReloadManager.replaceDeck()`), call `deckStore.loadFromMarkdown(markdown)`. This resets the store and history.

2. **Slide switch**: When the active slide changes (user clicks a thumbnail, arrow keys, etc.), call `deckStore.setActiveIndex(index)`. The store does NOT need to sync the slide content here — the editor still holds the current text. Content sync happens at save time.

3. **Save / apply**: When the user saves, or when an external operation (AI, import) applies changes, the store is the source of truth. Call `deckStore.applyPatch(patch)` with the appropriate patch.

4. **Slide operations** (add/delete/duplicate/move): Route through `deckStore.applyPatch()`:
   - Add slide: `createInsertPatch(index, newSlideMarkdown, "user")`
   - Delete slide: `createDeletePatch(index, oldSlideMarkdown, "user")`
   - Duplicate slide: `createInsertPatch(index + 1, slideMarkdown, "user")`
   - Move slide: this is a delete + insert — apply two patches, or create a composite patch type (decide and document)

5. **ReloadManager.replaceDeck()**: After replacing the deck, call `deckStore.loadFromMarkdown(newMarkdown)` to reset the store.

### 2.4 What NOT to rewire (yet — Phase 14 does this)

- Do NOT make the markdown editor read from DeckStore on every keystroke
- Do NOT make slide-preview-updater read from DeckStore
- Do NOT make SlideRenderer read from DeckStore
- Do NOT remove any existing state from EditController or DeckController

The store runs **alongside** the existing state. It becomes the canonical source at defined boundaries. Phase 14 does the deep rewire that makes everything read from the store directly.

### 2.5 Undo/redo wiring (minimal)

Wire `Ctrl+Z` / `Ctrl+Y` to `deckStore.undo()` / `deckStore.redo()`. After undo/redo:

- Update the markdown editor content from `deckStore.toMarkdown()`
- Update the active slide from `deckStore.getActiveIndex()`
- Re-render the current slide and thumbnails

This is the user-visible feature of Phase 12. However, be careful: the markdown editor (CodeMirror) has its own undo stack. The global undo/redo via DeckStore should work at the slide level (undo the last slide-level operation), not at the keystroke level. Consider:

- Should `Ctrl+Z` in the markdown editor do CodeMirror's native undo (keystroke-level), or DeckStore undo (slide-level)?
- Recommendation: `Ctrl+Z` does DeckStore undo when the editor is not focused, and CodeMirror undo when the editor IS focused. Or: always DeckStore undo, and the editor content is replaced wholesale. Decide and document.

Read `src/engine/keyboard-shortcuts.js` and `src/engine/keyboard-handler.js` to understand the existing keyboard handling before adding undo/redo shortcuts.

### 2.6 Tests

- Integration test: load a deck → apply an edit patch → undo → verify the slide content is restored
- Integration test: load a deck → delete a slide → undo → verify the slide is back
- Integration test: load a deck → add a slide → undo → redo → verify the slide is added again
- Integration test: `replaceDeck()` resets the store and history
- Test that boundary sync doesn't break existing editor operations (manual verification — see below)

### 2.7 Verification

This workstream requires careful manual verification because it touches the core editing loop:

1. `npm run lint && npm run format:check && npm test && npm run build` — all pass
2. Manual browser testing (use `npm run dev` or the dev server):
   - Open a deck
   - Edit a slide's content in the markdown editor → save → undo → confirm content reverts
   - Add a new slide → undo → confirm the slide is removed
   - Delete a slide → undo → confirm the slide is restored
   - Move a slide up/down → undo → confirm it moves back
   - Duplicate a slide → undo → confirm the duplicate is removed
   - Switch between slides rapidly → confirm no state corruption
   - Run PPTX import → confirm the store resets and the new deck loads
   - Run AI fix-mode (existing flow, not Phase 13) → confirm the store resets after `replaceDeck()`
   - Open a large deck (50+ slides) → confirm no performance regression
3. If anything breaks, the boundary sync is too aggressive — narrow the sync points.

---

## Sequencing

WS1 (pure logic: SlidePatch + DeckStore + DeckHistory + tests) is completely independent of all other code. Land it first.

WS2 (EditController wiring) depends on WS1 and is the risky part. Do it carefully with manual verification at each step.

## What NOT to Do

- Do NOT create `AiOperation`, `AiOrchestrator`, or any AI modules — those are Phase 13
- Do NOT do a deep rewire of EditController sub-modules — Phase 14
- Do NOT add `ConflictResolver` — Phase 14
- Do NOT modify `ai-sidebar.js` — Phase 13
- Do NOT modify `markdown-parser.js` — if you need `splitSlides()` as a pure function, extract and export it, but don't change its behavior
- Do NOT remove existing state from `EditController` or `DeckController` — the store runs alongside
- Do NOT make the markdown editor read from the store on every keystroke — boundary sync only

## Quality Gates (run before committing)

```bash
npm run lint          # ESLint (errors only)
npm run format:check  # Prettier formatting
npm test              # Vitest unit tests
npm run build         # Build script
```

All four must pass. If `npm run format:check` fails, run `npx prettier --write .` to fix.

## Parallel Development Notes

This phase can be developed in parallel with Phase 11 (AI Operations Foundation). The two phases have zero file overlap:

- Phase 11 touches: `src/data/ai/`, `src/editor/ai-sidebar.js`, `src/editor/settings-modal.js`, `src/data/ai-enhancer.js`, `src/data/prompts/`, `src/__tests__/ai-*.test.js`
- Phase 12 touches: `src/data/store/`, `src/editor/core/edit-controller.js`, `src/editor/core/slide-operations.js`, `src/engine/reload-manager.js`, `src/engine/deck-controller.js`, `deck.js`, `src/__tests__/deck-store.test.js`, `src/__tests__/slide-patch.test.js`, `src/__tests__/deck-history.test.js`

No merge conflicts expected if both branches are developed simultaneously.
