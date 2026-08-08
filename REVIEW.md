# Review Guidelines

This file provides guidance to [Devin Review](https://docs.devin.ai/work-with-devin/devin-review)
and other automated reviewers when analyzing pull requests in this repository.
Architecture details, module reference, and pre-review verification checklists
live in `AGENTS.md` — this file contains only review-specific rules.

## Ignore

Do not raise findings in:

- `dist/` — generated build output
- `decks/`, `images/` — user content, not source
- `docs/compose/` — generated documentation
- Formatting and syntax — owned by Prettier and ESLint, not review

## Critical Areas

### DOMPurify sanitization

All user-authored Markdown HTML assigned to slide areas must be sanitized with
DOMPurify before `innerHTML`. This is the most important security invariant.

- Flag any `innerHTML` assignment on a slide area that bypasses DOMPurify.
- Mermaid SVG output and hardcoded UI `innerHTML` strings are trusted — do not
  route user content through those paths.
- Mermaid source is stored base64-encoded in `data-mermaid-source` (`b64:` prefix)
  because DOMPurify strips attributes containing `-->`. Flag changes to this
  encoding that don't verify DOMPurify compatibility.

### Layering & dependency direction

Layers (low to high): `core` → `data` → `renderer` → `engine` → `editor` → `ui`.

- Flag any import that crosses a layer upward (e.g., `renderer/` importing
  `engine/` or `editor/`, `data/` importing `renderer/`, `core/` importing any
  `src/` layer).
- Framework/vendor types (CodeMirror, Mermaid, pptxtojson) must not leak into
  `core/` or `data/` — map them at the boundary.

### Offline-first constraint

The build script inlines all assets as data URIs. No runtime CDN dependencies.

- Flag any new runtime `fetch` or `import` from an external URL.
- Flag moving `markdown-it`, `KaTeX`, or `PrismJS` from `devDependencies` to
  runtime `dependencies` — they are bundled at build time.

### Deterministic rendering

- Flag responsive units (`vw`, `vh`, `%`) in slide content — all positioning
  uses the 1920x1080 coordinate system.
- Flag content reflow on resize — `StageScaler` uses letterboxing/pillarboxing.

## Conventions

### Editor sub-modules (dependency injection)

Editor sub-modules under `src/editor/` use dependency injection. See `AGENTS.md`
for the full pattern.

- Flag any sub-module that imports `EditController` or reaches into another
  sub-module's internals instead of receiving dependencies via constructor.

### AI module decomposition

AI logic lives in focused modules under `src/data/ai/`. `ai-orchestrator.js` is
the single entry point — it delegates, it does not implement.

- Flag new logic added to `ai-orchestrator.js` that belongs in a sub-module.
- Flag a new AI module that duplicates an existing sub-module's responsibility.

### State ownership

`DeckStore` is the single source of truth for committed deck state.
`unsavedMarkdown` is an overlay, not a replacement.

- Flag logic that mutates deck state without going through the store or a
  sync-aware path (multi-window sync uses `BroadcastChannel`).
- Flag cached derived state in a second location where it can drift.
- Flag changes to the return type of public methods (`getFullSlides`,
  `getFullMarkdown`, `getWorkingSlides`) without updating every caller,
  including no-argument overloads.
- Flag removal of a no-store / viewer-window fallback without either removing
  the feature entirely or providing a source-markdown replacement.
- Flag changes to `DeckStore.applyPatches` or `syncSlides` that alter emit or
  history-recording behavior without verifying all callers expect the new
  semantics.
- Flag `markdownEditor.setValue()` calls that clear history on same-slide
  reloads or use full-document replacement where a targeted transaction would
  suffice.

### Extension points ("add one of many")

Register-and-wire patterns: layout presets, theme definitions, AI providers,
keyboard shortcuts, command-palette actions.

- A missed wiring spot degrades silently — flag a new case that doesn't mirror
  its siblings (registration, routing, serialization, docs, autocomplete).
- Flag a new case that doesn't honor the same contract as its peers.

### Reuse before reinvention

- Flag duplicated bundle-ordering logic between `HtmlExportManager` and
  `tools/build.mjs` — prefer extracting a shared module.
- Flag hardcoded layout names outside `src/data/layout-data.js` and
  `src/data/layouts.json` — both lists must stay in sync.
