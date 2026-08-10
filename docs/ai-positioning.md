# AI Positioning: What the AI Does vs. What the Tool Does

SlideMD is a deterministic rendering and authoring tool with optional AI-assisted
editing. This document draws the boundary between the two so users and external
AI agents know what is handled by the tool (deterministic, repeatable) and what
is delegated to an LLM (creative, probabilistic).

For guidance aimed at coding assistants working on this repository, see
[`AGENTS.md`](../AGENTS.md). For the prompt architecture and per-intent prompt
files, see [`docs/prompt-template.md`](prompt-template.md).

## The boundary in one sentence

The **tool** owns parsing, rendering, layout validation, export, and the editor
surface; the **AI** owns content transformation tasks that benefit from
judgment — enhancing, fixing, remixing, reimagining, and writing speaker notes.

## What the tool does (deterministic)

These paths never call an LLM. They are stable, repeatable, and unit-tested.

- **Markdown parsing** — `src/data/markdown-parser.js` splits the deck into
  slides, parses frontmatter (`layout:`, `theme:`, `background:`, `hidden:`,
  `media-span:`), and routes content to grid areas via `@area` markers.
- **Layout validation** — `src/data/layout-data.js` and `src/data/layout-parser.js`
  resolve preset names and custom CSS grid templates, validate that every
  `@area` marker has a matching grid cell, and surface warnings for mismatches.
- **Rendering** — `src/renderer/slide-renderer.js` renders each slide on a fixed
  1920x1080 stage; `src/renderer/stage-scaler.js` letterboxes/pillarboxes to the
  viewport without reflowing content.
- **Content enhancement (deterministic)** — `src/renderer/content-enhancer.js`
  runs Prism syntax highlighting, KaTeX math, and Mermaid diagrams. This is the
  same pipeline used in dev, export, and PDF.
- **Editor** — CodeMirror-based editor (`src/editor/core/markdown-editor.js`)
  with autocomplete, slash commands, search, image drag-reorder, layout picker,
  and area navigation. All edits are local and undoable.
- **PPTX import** — `src/data/pptx-to-slide-md.js` and friends extract text,
  images, and layout hints from `.pptx` files and convert them to SlideMD
  markdown. Import is instant and AI-free; use the AI features to refine the
  result afterward.
- **Export** — `src/renderer/html-export-manager.js` produces a self-contained
  HTML file; `src/renderer/print-manager.js` and `tools/pdf.mjs` produce PDFs.
  `tools/build.mjs` bundles the deck via esbuild for distribution.
- **Persistence** — save/load via the File System Access API or
  `localStorage`; `.textpack` export for single-file sharing.
- **Presenter view, keyboard navigation, break manager, role manager** — all
  runtime behavior in `src/engine/`.

## What the AI does (probabilistic)

These features call an LLM through `src/data/ai/ai-orchestrator.js`. They are
opt-in, require a configured API key, and are always undoable via `Ctrl+Z`.

- **Enhance slide** (`fix-prompt.md`) — conservative cleanup of a single slide:
  rejoin split code lines, restore collapsed code blocks, fix broken
  lists/links/tables, convert `[Diagram: ...]` to Mermaid, downgrade mismatched
  layouts. Does not change heading levels or slide count.
- **Add speaker notes** (`add-speaker-notes-prompt.md`) — appends
  `<!-- notes: ... -->` to a single slide without touching visible content.
- **Polish** (`polish-prompt.md`) — whole-deck cleanup and wording/layout
  improvement. Preserves slide count, order, and visual identity.
- **Remix** (`remix-plan-prompt.md` → `generate-prompt.md`) — two-phase
  plan→execute restructure. Moderate creative freedom; preserves visual identity
  by default; slide count may change.
- **Reimagine** (`reimagine-outline-prompt.md` → user review →
  `generate-prompt.md`) — three-phase outline→review→generate flow for a fresh
  deck on the same topic. Bold creative freedom; visual identity is discarded;
  slide count targeted at 70-120% of the source.

The AI always returns JSON in the SlideMD slide format (`{ slides: [{ layout,
content }] }`); the orchestrator validates the output, re-injects required
directives, and runs a repair loop on validation failures before applying
patches to the deck. See [`docs/prompt-template.md`](prompt-template.md) for the
full prompt architecture.

## What the AI does not do

- It does not render slides, run syntax highlighting, or execute Mermaid/KaTeX.
  Those are deterministic tool paths.
- It does not validate CSS grid syntax or area geometry — the tool's layout
  validator does that and surfaces warnings.
- It does not import PPTX, save files, or export HTML/PDF.
- It does not have direct filesystem or network access beyond the configured
  LLM endpoint. Image inputs (for vision-augmented planning) are compressed
  in-browser and sent only to the plan/outline phase.
- It does not silently change content the user did not ask to change. Every AI
  operation is initiated explicitly and is undoable.

## Implications for external AI agents

If you are an external agent (editor assistant, bot, or automation) integrating
with SlideMD:

- Treat the tool's parsers, renderers, and validators as the source of truth
  for what constitutes a valid deck. Do not reimplement SlideMD syntax; reuse
  `src/data/markdown-parser.js`, `src/data/layout-data.js`, and
  `src/data/layout-parser.js`.
- When generating or editing deck markdown, follow the system prompt rules in
  `src/data/prompts/system-prompt.md` and the syntax reference in
  [`docs/prompt-template.md`](prompt-template.md). Output JSON in the
  `{ slides: [{ layout, content }] }` format unless you are writing markdown
  directly to disk.
- Preserve `<img src="images/...">` paths verbatim. Do not substitute blob
  URLs, data URIs, or rewritten filenames. The tool resolves `images/...`
  relative to the deck file.
- Run the quality gates (`npm run lint`, `npm run format:check`, `npm test`,
  `npm run build`) after any code change. See [`AGENTS.md`](../AGENTS.md) for
  the full development workflow.
- Do not modify prompt files without updating the snapshot tests
  (`src/__tests__/ai-prompt-snapshots.test.js`) and the hygiene tests
  (`src/__tests__/ai-prompt-hygiene.test.js`), and reviewing the diff.
