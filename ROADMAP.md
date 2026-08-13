# SlideMD Roadmap

## Phase 1: Safety Net + Documentation ✅

Goal: Establish quality infrastructure and fix all documentation before making further changes.

### Linting & Formatting

- [x] Add ESLint 10 flat config + Prettier (PR #37)
- [x] Add `npm run lint` + `npm run format:check` scripts
- [x] Fix all lint violations across codebase

### Testing

- [x] Add Vitest + unit tests for pure modules (PR #39)
  - `src/core/utils.js` — 42 tests
  - `src/data/layout-parser.js` — 12 tests
  - `src/data/layout-data.js` — 16 tests
- [x] Update CI to run lint + test (PR #41)

### Documentation Fixes

- [x] Fix CLAUDE.md entry point and module listings
- [x] Fix REFACTORING.md module locations and "Next Steps"
- [x] Fix README.md — restructure Layout Presets section (was duplicated, first was empty)
- [x] Fix README.md — add AI generation docs
- [x] Fix docs/example.md typo ("Hidding" → "Hiding")
- [x] Fix docs/prompt-template.md — update speaker notes description
- [x] Fix index.html — remove duplicate preconnect
- [x] Fix .gitignore — remove `nul`, add `.env*`, `Thumbs.db`

### Legal & Metadata

- [x] Add LICENSE file (MIT)
- [x] Add CHANGELOG.md with v0.1.0 entry
- [x] Fix package.json — add version, author, license, repository, keywords
- [x] Fix package.json — update description to include AI generation

### Cleanup

- [x] Move decks/7855.md → docs/prompts/lecture-deck-prompt.md (generalized)
- [x] Remove deprecated layout references from documentation
- [x] Add docs/RELEASING.md

### Release

- [x] Create release branch, merge PRs, tag v0.1.0
- [x] Create GitHub release
- [x] Branch protection on main (PR required, build check)

---

## Phase 2: Build Modernization ✅

Goal: Replace the fragile custom build script with a proper bundler.

| Task                                      | Details                                                   |
| ----------------------------------------- | --------------------------------------------------------- |
| [x] Migrate `tools/build.mjs` to esbuild  | Replace regex-based ESM stripping with esbuild bundler    |
| [x] Bundle Mermaid locally                | Currently loaded from CDN in dist builds — breaks offline |
| [x] Verify all assets inline correctly    | KaTeX fonts, Prism themes, CSS                            |
| [x] Update build pipeline for source maps | Optional but helpful for debugging dist builds            |

---

## Phase 3: Distribution ✅

Goal: Make the app easy to download and install. Not a library — no npm.

| Task                                       | Details                                        |
| ------------------------------------------ | ---------------------------------------------- |
| [x] CI release workflow on tag push (`v*`) | Build dist/, create GitHub Release, attach zip |
| [x] Download page in README                | Direct link to latest release zip              |
| [x] Docker image                           | `docker run -p 8080:80 slidemd`                |

---

## Phase 4: New Presentation ✅

Goal: Add a modal for creating new presentations with theme, style, and template selection.

| Task                                                 | Details                                          |
| ---------------------------------------------------- | ------------------------------------------------ |
| [x] New Presentation modal (stepper wizard)          | Template → Background → Styling steps            |
| [x] Theme section: color mode + accent color         | Light/dark radio cards, accent color grid        |
| [x] Style section: header style, border, code blocks | Underline/pill/none, border toggle, rounded code |
| [x] Template section: blank, standard, lecture       | Starter deck templates                           |
| [x] Menu item + wiring                               | Element references, click handler, CSS           |

---

## Phase 5: Quick Fixes ✅

Goal: Remove AI generation feature and unify prompt documentation.

| Task                                                     | Details                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| [x] Remove AI generation feature entirely                | Deleted 10 source files, 3 CSS files, 1 UI file (~4,500 lines) |
| [x] Move New Presentation Modal to src/editor/           | Not AI-related; manual presentation wizard                     |
| [x] Remove AI menu items from UI                         | Course Profiles, AI Configuration, Generate Deck               |
| [x] Unify prompt templates in docs/                      | Merged 2 prompt files into single docs/prompt-template.md      |
| [x] Update documentation (README, example.md, AGENTS.md) | Removed AI generation references                               |
| [x] Fix image properties panel aspect ratio bug          | Size presets now respect aspect ratio lock                     |

---

## Phase 6: Testing & Polish ✅

Goal: Comprehensive testing and type safety improvements.

### Testing

| Task                                    | Details                              |
| --------------------------------------- | ------------------------------------ |
| [x] Unit tests for `markdown-parser.js` | Complex parsing logic, edge cases    |
| [x] Unit tests for `directive-utils.js` | Pure functions                       |
| [x] Integration tests for deck pipeline | Full flow: markdown → parse → render |

### TypeScript Definitions

| Task                                              | Details                                      |
| ------------------------------------------------- | -------------------------------------------- |
| [x] Add JSDoc type annotations to core modules    | Better IDE support without full TS migration |
| [x] Add type definitions for deck data structures | `Slide`, `Deck`, `Layout`, `Profile` types   |

### UI Polish

| Task                                                      | Details                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| [x] Move slide up/down from inline arrows to context menu | Right-click thumbnail to access; Alt+Shift+Arrow shortcuts added |
| [x] Remove slide actions dropdown from thumbnails header  | Actions available via context menu and keyboard shortcuts        |
| [x] Add hover hint on slide thumbnails                    | "Right-click for options" native tooltip                         |
| [x] Re-hide focus layout from layout picker               | Duplicate of header-content                                      |

---

## Phase 7: PPTX Conversion ✅

Goal: Convert existing presentations (PPTX) to SlideMD format using rule-based layout inference.

### Core

| Task                                    | Details                                                              |
| --------------------------------------- | -------------------------------------------------------------------- |
| [x] PPTX text extraction                | Parse PPTX via pptxtojson, extract text, shapes, images, slide order |
| [x] Rule-based SlideMD generation       | Layout inference from element positions, bullet/heading detection    |
| [x] Conversion modal (upload → convert) | File upload with drag-drop, single-step extract + convert            |
| [x] Image extraction from PPTX          | Extract embedded images, save to deck, update references             |
| [x] EMF/WMF image conversion            | Convert embedded EMF/WMF to PNG via emf-converter                    |
| [x] CSS bullet detection                | Detect text-indent-based bullets without `<ul>/<li>` markup          |
| [x] HTML tag escaping                   | Escape non-structural tags so teaching HTML renders as text          |
| [x] Dark theme detection                | Auto-set theme: dark when slide background is dark                   |
| [x] DOMParser-based HTML-to-markdown    | Replace regex pipeline with proper DOM tree walk                     |
| [x] Two-column layout with images       | Detect images positioned in right column for two-column layout       |
| [x] Layout detection improvements       | Better heading threshold detection using font size                   |
| [x] Per-deck folder structure           | Organized imported deck files with editable filename                 |
| [x] Code block detection                | Auto-convert on file select, language tag regex fixes                |
| [x] Dominant image handling             | Auto-detect dominant images, filter tiny decorative images           |
| [x] Chart data tables                   | Diagram rendering as markdown lists                                  |
| [x] TIFF image support                  | Via utif2 library                                                    |
| [x] Keep-backgrounds checkbox           | Preserve slide backgrounds in conversion modal                       |

### Post-Conversion

| Task                          | Details                                            |
| ----------------------------- | -------------------------------------------------- |
| [x] Edit mode integration     | Load converted deck into editor for manual cleanup |
| [x] Image blob URL management | Rewrite relative paths to blob URLs for preview    |
| [x] Image deletion fix        | Match DOM images to markdown entries by src        |
| [x] Blocking loading modal    | During PPTX import save operation                  |

---

## Phase 7.5: CLI Dev Server & Image Improvements ✅

Goal: CLI dev server with `.md + images/` primary format, `.textpack` sharing, and image drag reorder.

### CLI Dev Server

| Task                                        | Details                                                          |
| ------------------------------------------- | ---------------------------------------------------------------- |
| [x] CLI dev server (`tools/dev-server.mjs`) | Serve deck via HTTP with SSE live reload                         |
| [x] `.md + images/` as primary format       | Markdown files with sidecar `images/` folder                     |
| [x] `.textpack` support                     | ZIP archive bundling `deck.md` + images for sharing              |
| [x] Open Deck modal                         | Recent-decks list, open `.md` or `.textpack` files               |
| [x] File System Access API integration      | Seamless file management on Chromium, fallback on Safari/Firefox |
| [x] Image upload via API                    | `POST /api/upload-image` with human-readable filenames           |
| [x] Deck save via API                       | `POST /api/deck` writes directly to disk                         |
| [x] Example deck as `.md + images/`         | `docs/example/slides.md` with `docs/example/images/`             |

### Image Drag Reorder & Alignment

| Task                                    | Details                                                          |
| --------------------------------------- | ---------------------------------------------------------------- |
| [x] ImageDragController                 | Cross-area drag with drop-gap indicators and reorder in markdown |
| [x] ImageMarkdownUtils                  | Image markdown manipulation utilities                            |
| [x] ImagePositionPresets                | Positioning presets for quick image placement                    |
| [x] Interact.js powered draggable setup | Resize handles and drag functionality                            |
| [x] Cross-column drag                   | Enable dragging images between columns                           |
| [x] Image size presets                  | Cap presets to column width                                      |

### Notification System Redesign

| Task                              | Details                                                        |
| --------------------------------- | -------------------------------------------------------------- |
| [x] Bottom-center snackbar toasts | Replace native alerts with modern snackbar notifications       |
| [x] Notification.critical()       | Blurred backdrop and cancel confirmation for critical messages |
| [x] Fullscreen-aware              | Re-parent to fullscreenElement when active                     |
| [x] Blocking notifications        | Overlay and shake feedback for blocking operations             |
| [x] Toast queue system            | Max 4 visible toasts with queue management                     |

### UI/UX Improvements

| Task                                         | Details                                           |
| -------------------------------------------- | ------------------------------------------------- |
| [x] Toggle dashed area outlines              | Visibility toggle via Columns button in edit mode |
| [x] Full-height media column                 | Better image display in media columns             |
| [x] Simplified image editor panel            | Streamlined image editing interface               |
| [x] Increased slide area bounding box border | Better visibility in edit mode                    |

---

## Phase 8: AI Post-Processing ✅

Goal: Add AI-powered post-processing for PPTX imports via OpenRouter.

### Core

| Task                           | Details                                                       |
| ------------------------------ | ------------------------------------------------------------- |
| [x] OpenRouter API integration | Connect to OpenRouter for AI-enhanced slide processing        |
| [x] Settings modal             | API key, model selection, reasoning options                   |
| [x] Fix Issues mode            | Conservative AI cleanup of formatting, headers, code blocks   |
| [x] AI Inspiration mode        | Full redesign with better flow, layouts, and Mermaid diagrams |
| [x] Streaming sidebar          | Non-blocking panel with real-time AI output                   |
| [x] Reasoning support          | Optional extended thinking for better results                 |
| [x] Model selection            | Searchable dropdown with reasoning capability detection       |

### PPTX Import Integration

| Task                                | Details                                                |
| ----------------------------------- | ------------------------------------------------------ |
| [x] AI post-processing after import | Optional enhancement after PPTX import                 |
| [x] Diagram conversion              | [Diagram: ...] markers to Mermaid code blocks          |
| [x] Image alt text                  | Improved alt text generation for imported images       |
| [x] Background preservation         | Backgrounds and themes preserved through AI processing |

### HTML Export Fixes

| Task                  | Details                                            |
| --------------------- | -------------------------------------------------- |
| [x] Image inlining    | Images as data URIs in exported HTML               |
| [x] Mermaid rendering | Mermaid diagrams render correctly in exported HTML |
| [x] KaTeX fonts       | Fixed font loading from CDN                        |
| [x] API skip          | Skip API fetches and live reload in exported HTML  |
| [x] Module bundling   | Fixed missing modules in HTML export bundle        |

### Testing

| Task                    | Details                              |
| ----------------------- | ------------------------------------ |
| [x] HTML export tests   | 21 tests for HTML export manager     |
| [x] Total test coverage | 500+ unit tests across 22 test files |

### PPTX Import & Image Fixes (from main branch)

| Task                         | Details                                                                   |
| ---------------------------- | ------------------------------------------------------------------------- |
| [x] Flex-row rendering       | Support for flex-row layouts in PPTX import (#140)                        |
| [x] Set-as-background        | Support for setting images as slide backgrounds (#140)                    |
| [x] Image Picker restoration | Restored with Existing/Upload/URL tabs and float feature (#142)           |
| [x] Title sanitization       | Sanitize markdown from deck/slide titles (#144)                           |
| [x] PPTX upload fix          | Fixed 400 error when no deck loaded (#145)                                |
| [x] Area overflow fix        | Fixed overflow warning not hiding on fix and fit-to-column spacing (#146) |

### Bug Fixes

| Task                            | Details                                      |
| ------------------------------- | -------------------------------------------- |
| [x] AI sidebar reasoning tokens | Fixed corruption of JSON parse               |
| [x] AI sidebar scrolling        | Fixed scrollbar jumping and wheel events     |
| [x] Settings modal              | Fixed API key hint and model dropdown issues |
| [x] Conversion modal            | Fixed duplicate AI button on re-import       |
| [x] PPTX export                 | Fixed two-column layout detection            |
| [x] HTML export                 | Fixed missing modules and font loading       |

---

## Phase 9: Text Insertion & Editor UX ✅

Goal: Add draggable text blocks and polish the core editor experience. This is the current active workstream.

### Text Insertion

| Task                                                            | Details                                                                                                                             |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [x] Text insertion with drag, snap, and properties panel (#154) | Implement text blocks with the same UX as image insertion — drag, snap, floating position, right-click properties, and persistence. |
| [x] Persist text position and styling                           | Store position, rotation, background, font size, color, and alignment in the slide markdown.                                        |
| [x] Inline text editing                                         | Allow double-click/inline editing or edit through the properties panel.                                                             |

### Editor UX

| Task                                                                    | Details                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [x] Improve main menu layout, groupings, and edit button options (#147) | Reorganize the header menu for clearer access to edit, save, export, and AI actions. |
| [x] Add tooltips to edit-mode controls (#121)                           | Show tooltips for editor controls to improve discoverability.                        |
| [x] Make Alt+N new slide shortcut discoverable (#109)                   | Add a menu item, hint, or keybinding label for the new-slide shortcut.               |
| [x] Right-click context menu format options (#92)                       | Add font, color, and alignment options to the right-click menu for selected content. |
| [x] Add full-text search across all slides                              | Search slide body, titles, and optional notes; jump to matches.                      |
| [x] Add command palette (Ctrl/Cmd+Shift+P)                              | Quick access to new slide, duplicate, delete, layout, and other actions.             |
| [x] Make keyboard shortcuts discoverable in the palette                 | Surface Alt+N, Alt+D, Alt+Backspace, and other edit shortcuts.                       |

### Layout & Media

| Task                                                      | Details                                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [x] Adjust width and alignment of main column (#152)      | Add UI controls for `header-content` and `focus` main column width and alignment.  |
| [x] Set column background via right-click on @area (#151) | Add a context menu option on area tags to inject the correct background directive. |

---

## Phase 10: Renderer Hardening ✅

Goal: Improve the reliability and maintainability of the existing `markdown-it` → DOM rendering pipeline without replacing it.

### Testing & Stability

| Task                                             | Details                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| [x] Add HTML snapshot tests for known decks      | Capture stable output of the current markdown-it + renderer pipeline for representative slides. |
| [x] Add regression tests for Mermaid/Prism/KaTeX | Ensure diagrams, code blocks, and math render to expected markup after pipeline changes.        |

### Rendering Pipeline Cleanup

| Task                         | Details                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [x] Audit raw HTML injection | Identify every `innerHTML` usage in `SlideRenderer`/`HTMLExportManager` and decide whether sanitization is needed. |
| [x] Unify `ContentEnhancer`  | Make runtime, HTML export, and PDF print paths call the same Mermaid/Prism/KaTeX enhancement code where possible.  |

---

## Phase 11: AI Operations Foundation ✅

Goal: Build the stateless AI building blocks — provider client, output schema/validator, prompt composer, and content rules — and wire them into the existing whole-deck AI flow. No operation model, registry, or orchestrator yet (those need `DeckStore` from Phase 12 as their apply target and move to Phase 13). Ships #148 (local models) and #150 (content rules) before the state refactor lands.

### Provider & Settings

| Task                                          | Details                                                                                                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x] Add `AiProviderClient` (#148)             | OpenAI-compatible `/chat/completions` client with configurable base URL — supports OpenRouter, Ollama, LM Studio, and custom endpoints. Empty API key allowed for local providers. |
| [x] Add base URL + provider label to settings | Default `https://openrouter.ai/api/v1`; free-text model field when base URL is not OpenRouter.                                                                                     |

### Output Validation

| Task                                | Details                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [x] Add `AiOutputSchema`            | Define the expected Markdown structure for each intent (one valid slide, or N slides for whole-deck intents).                                          |
| [x] Add `AiOutputValidator`         | Parse returned Markdown via `MarkdownParser` and check layout, `@area` markers, and slot validity. Reuses `LayoutData.hasLayout()` / `getAreaNames()`. |
| [x] Enforce AI content rules (#150) | Default headers to h1, avoid `header-content` for multi-image slides, and preserve `multi-column-list` HTML.                                           |
| [x] Add repair message builder      | On validation failure, produce a focused repair message listing the specific `errors[]` for the LLM.                                                   |

### Prompt Engineering

| Task                           | Details                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| [x] Add `AiPromptComposer`     | Compose system and user prompts from reusable fragments with `{{markdown}}` / `{{layoutList}}` substitution. |
| [x] Update `src/data/prompts/` | Keep prompts under the length budget and in sync with allowed layouts.                                       |

### Wiring

| Task                                  | Details                                                                                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x] Replace `ai-sidebar.js` internals | Swap `buildMessages`, inline `fetch(OPENROUTER_URL)`, and `validateFixOutput` for composer → provider → validator. Keep mode string and whole-deck apply via `ReloadManager`. |
| [x] Keep `ai-enhancer.js` as facade   | Re-export the new modules during transition; delete after Phase 13 cutover.                                                                                                   |

---

## Phase 12: Deck Store & Patches

Goal: Make the slide array a canonical, patchable store with undo history — the apply target for AI and editor edits. Pulled ahead of the AI orchestrator (Phase 13) because single-slide AI edits need undoable patches to land cleanly.

### State Model

| Task                  | Details                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| [x] Add `DeckStore`   | Single source of truth for the slide-string array and the active index. |
| [x] Add `SlidePatch`  | `{ index, before, after, source }` object describing one slide change.  |
| [x] Add `DeckHistory` | Stack of full deck snapshots for undo/redo.                             |

### Patch Operations

| Task                             | Details                                                                    |
| -------------------------------- | -------------------------------------------------------------------------- |
| [x] Add `applyPatch`             | Apply a `SlidePatch` to the `DeckStore` and push to `DeckHistory`.         |
| [x] Use snapshot-based undo/redo | `DeckHistory` stores full pre-operation snapshots; no targeted revert API. |

### Editor Wiring

| Task                                                     | Details                                                                                                                            |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [x] Wire `EditController` to `DeckStore` (boundary sync) | Sync at slide switch / save / AI apply boundaries rather than a deep rewire of every sub-module. Full rewire deferred to Phase 14. |

---

## Phase 13: AI Orchestrator & Single-Slide Editing

Goal: One entry point owning context selection, the LLM call, validation, and repair; plus per-slide AI editing that writes back through `DeckStore`. Depends on Phase 11 (foundation blocks) and Phase 12 (`DeckStore` as apply target).

### Operation Model

| Task                       | Details                                                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x] Add `AiOperation`      | `{ intent, targetSlide, context, prompt }` object describing one AI call.                                                                                        |
| [x] Add `AiIntentRegistry` | Map of `intent` names to prompt builders (`enhanceSlide`, `addSpeakerNotes`, `generate`).                                                                        |
| [x] Add `AiOrchestrator`   | Pick the right context window, call the LLM via `AiProviderClient`, validate with `AiOutputValidator`, run the repair loop. Returns patches; does **not** apply. |

### Single-Slide AI Editing

| Task                                            | Details                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [x] Add `enhanceSlide(slideMarkdown, intent)`   | Build a prompt containing one slide Markdown string and an intent string.                         |
| [x] Instruct the LLM to output one slide        | Output one valid slide using the allowed layouts and `@area` markers; no extra text.              |
| [x] Validate the response with `MarkdownParser` | Parse the returned Markdown; reject or repair anything that does not produce a valid slide.       |
| [x] Patch by index via `DeckStore.applyPatch`   | Swap the edited slide string back into the array through `DeckStore`; rejoins with `---` on save. |
| [x] Implement intents: `addSpeakerNotes`        | Full prompt builder and schema (stubs from Phase 11 promoted to working intents).                 |

### Wiring

| Task                               | Details                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [x] Simplify `ai-sidebar.js`       | Route single-slide requests to `enhanceSlide`; rewrite whole-deck path as `orchestrator.runOperation(wholeDeckOp)`. |
| [x] Delete `ai-enhancer.js` facade | Remove the transition facade once all callers use the new modules.                                                  |

### Import Flow Change

| Task                                | Details                                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [x] Drop whole-deck fix from import | Removed "Fix Issues" checkbox from conversion modal. Single-slide `enhanceSlide` replaces it. Import is now instant. |

---

## Phase 13.1: Remix Planner (Two-Phase Restructuring)

Goal: Replace the experimental single-shot Remix with a reliable two-phase plan→execute flow. A cheap planning call produces a structured restructuring plan, which is converted to a virtual deck and fed through the existing batched generate path. Unlocks Remix for decks of any size.

### Plan→Execute Flow

| Task                           | Details                                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| [x] Add plan phase             | One LLM call with deck summary → returns JSON plan (polish/rewrite/merge actions with briefs). Logged in AI sidebar.       |
| [x] Add virtual deck trick     | Plan entries converted to a virtual deck markdown with `<!-- brief: ... -->` comments. Fed through existing generate path. |
| [x] Unlock Remix for all sizes | Removed ≤8-slide limit. Execute phase batches through existing 2-worker queue for large decks.                             |
| [x] Add `remix-plan-prompt.md` | User fragment for the plan phase: analyze deck → output restructuring plan JSON.                                           |

---

## Phase 13.2: Vision-Enabled Remix & Hardening

Goal: Add vision support to the two-phase Remix/Reimagine flow and harden the dev server, save, reload, and settings paths.

### Vision-Augmented Remix & Reimagine

| Task                                | Details                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| [x] Vision toggle in generate modal | "Send slide images to AI" checkbox with token estimate for Remix/Reimagine         |
| [x] Multi-modal plan phase          | Send compressed content images with the deck summary for visual assessment         |
| [x] `keepImages` plan schema        | Specify which images to keep per output slide; virtual deck filters before execute |
| [x] Provider multi-modal support    | Anthropic and Gemini handle array vision blocks; OpenAI-compatible passes arrays   |
| [x] Text-only fallback              | Retry plan/retry sidebar without images when the model rejects vision              |
| [x] Background image filtering      | Exclude `background: url(...)` from vision; only inline `<img>` and `![...](...)`  |
| [x] Image compression               | Canvas-based JPEG compression to <40KB; max 768px, quality loop, no new deps       |
| [x] Add `ai-vision-message.js`      | Message builder, provider mappings, token estimation                               |
| [x] Add `slide-image-extractor.js`  | Extraction, background filtering, compression, fast modal count                    |
| [x] Update `remix-plan-prompt.md`   | `keepImages` schema and image-aware instructions                                   |

### Dev Server, Save & Reload Hardening

| Task                                  | Details                                                                |
| ------------------------------------- | ---------------------------------------------------------------------- |
| [x] Harden `POST /api/deck`           | Same-origin validation; no longer trusts client-supplied `source`      |
| [x] Fix reload after picker `.md`     | Clear stale `webdeck_source_url` so reload uses the cached picker file |
| [x] Fix save with cancelled image dir | Write `.md` and warn when the images-folder picker is cancelled        |

### Settings & Reasoning Hardening

| Task                                 | Details                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| [x] Reject empty `reasoning` objects | `settings-modal.js` ignores bare `{}` from providers so reasoning toggle is accurate |

---

## Phase 14: Conflict Resolution & Global Undo

Goal: Make the current working deck safe under asynchronous AI edits and undoable as a single state track. Reconcile stale single-slide patches, define global undo semantics for committed deck operations, synchronize `DeckStore` with the editor view, and remove the Phase 12 boundary-sync mirror.

### State & Operation Safety

| Task                                  | Details                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [x] Add working-state adapter         | Read the latest working deck as `DeckStore` slides plus the `unsavedMarkdown` editor overlay.           |
| [x] Guard stale AI operations         | Capture a store revision/target snapshot; reject or cancel results after insert/delete/move operations. |
| [x] Add store-to-view synchronization | Keep parsed deck data, renderer, thumbnails, navigation, and editor state aligned after store changes.  |
| [x] Fail closed on patch rejection    | Never mutate the parsed deck or DOM when a `DeckStore` patch is rejected.                               |

### Conflict & Merge

| Task                          | Details                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| [x] Add `ConflictResolver`    | Resolve only single-slide `enhanceSlide` and `addSpeakerNotes` patches against the latest working slide. |
| [x] Add conflict-choice UI    | Offer "Keep my edits" or "Overwrite with AI"; no inline diff or three-way merge editor in this phase.    |
| [x] Rebase speaker notes      | Replace the existing `<!-- notes: ... -->` block while preserving the user's visible Markdown content.   |
| [x] Preserve non-target edits | Keep edits on other slides when a single-slide AI result is applied or rejected.                         |

### Undo & Redo

| Task                                | Details                                                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [x] Define committed-operation undo | `DeckHistory` handles committed AI, structural, and whole-deck operations; CodeMirror retains local buffer undo until commit. |
| [x] Complete global undo/redo       | `Ctrl+Z` / `Ctrl+Y` and `Ctrl+Shift+Z` operate consistently on the defined history boundary.                                  |
| [x] Test history boundaries         | Cover AI edits, structural edits, refine-all, local typing, redo invalidation, reload, save, and new-deck loading.            |

### Editor Rewire

| Task                             | Details                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x] Rewire structural operations | `SlideOperations` reads/writes through `DeckStore` and does not proceed after patch rejection.                                                                                  |
| [x] Rewire editor services       | `SaveManager` exposes the working-state overlay; `StyleApplier` and related services use it consistently.                                                                       |
| [x] Migrate external writers     | Open Deck and PPTX background image-upload paths update `DeckStore`, not `originalMarkdown`.                                                                                    |
| [x] Remove boundary-sync mirror  | Delete `originalMarkdown` and `syncStoreFromSlides` after the store/view bridge and tests are complete.                                                                         |
| [x] Preserve editor undo history | Per-slide `EditorState` cache in `MarkdownEditor`; clear on structural/deck changes; drop stale states on doc mismatch (history not preserved across external content changes). |

### Delivery Slices

| Slice                                    | Details                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [x] Phase 14.1: State safety + conflicts | Working-state adapter, stale-operation guard, `ConflictResolver`, conflict-choice UI, and tests. |
| [x] Phase 14.2: Undo + editor rewire     | Undo semantics/UI, store-to-view synchronization, sub-module migration, and mirror removal.      |

### Acceptance Criteria

- A single-slide AI result never overwrites editor text typed after the request began without an explicit user choice.
- Insert/delete/move operations during an AI request cannot apply the result to the wrong slide.
- Keep/overwrite and speaker-note rebase paths preserve the intended content and create correct undo history.
- Every committed store operation is undoable and redoable according to the documented CodeMirror/DeckHistory boundary.
- Store patch rejection leaves the parsed deck, renderer, and DOM unchanged.
- Opening or loading a new deck does not retain history from the previous deck.
- The editor no longer relies on `originalMarkdown` or `syncStoreFromSlides` after the final rewire slice.

---

## Phase 14.5: Structural Cleanup & Test Infrastructure ✅

Goal: Pay down structural debt and close test gaps before improving the existing AI modes in Phases 14.6-14.8 and building new platform features in Phases 15-17. These tasks are independent of each other and can be parallelized. Two structural refactors (EditController decomposition and `ai-orchestrator.js` split) are carried over from Phase 14.

### Refactoring

| Task                                   | Details                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [x] Extract shared bundle-order module | `HtmlExportManager` manually maintains `JS_BUNDLE_ORDER`; extract to a shared module so the build script and any future bundler can share one source of truth. (PR #200) |
| [x] Decompose EditController           | Deferred from Phase 14. Split store-to-view sync, editor buffer, history, and AI edit flows into dedicated DI modules. (PR #202)                                         |
| [x] Split `ai-orchestrator.js`         | Deferred from Phase 14. Separate single-slide coordination from whole-deck/Remix/Reimagine flows into focused classes. (PR #202)                                         |

### Test Infrastructure

| Task                                 | Details                                                                                                                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x] Add Playwright E2E test harness  | Playwright is already a dev dependency (PDF generation); add E2E specs for critical UI flows: open deck, edit slide, switch layout, export HTML, PPTX import. (PR #201) |
| [x] Add PPTX import integration test | Feed a real `.pptx` fixture through the full extract→convert→render pipeline and verify the output deck structure. (PR #191)                                            |

### Developer Experience

| Task                                | Details                                                                                                                                                                                                                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x] Add client-side logging utility | Replace ad-hoc `console.*` calls with a level-based logger. Foundational for systematic error handling across AI failures, PPTX import, and DOMPurify fallback paths. (PR #201)                                                                                                  |
| [x] Add `CONTRIBUTING.md`           | Document setup, quality gates, branch/PR conventions, and testing instructions for external contributors. (PR #200)                                                                                                                                                              |
| [x] Add ADR template                | Lightweight Architecture Decision Record template and `docs/adr/` directory to capture design rationale that currently lives only in roadmap prose. (PR #200)                                                                                                                    |
| [x] Add `docs/ai-positioning.md`    | Document what the AI does (enhance, fix, remix, reimagine, speaker notes) vs. what the tool does (deterministic rendering, layout validation, export). Clarify the boundary for users and external AI agents. Complements `AGENTS.md` which targets coding assistants. (PR #200) |
| [x] Lint `tools/` and `*.mjs`       | Add a Node-specific ESLint config for build/dev scripts currently excluded from linting. (PR #200)                                                                                                                                                                               |

---

## Phase 14.6: Polish Quality & Presentation Readiness ✅

Goal: Make Polish a reliable conservative pass that improves presentation quality without changing the deck's identity, narrative, slide count, or order.

### Content & Layout Quality

| Task                              | Details                                                                                                                                                                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x] Improve presentation prose    | Make headlines concise and human-facing, tighten bullets, replace vague wording, and remove textbook-style repetition without adding content indiscriminately. (PR #208)                                                                                                                 |
| [x] Improve density handling      | Detect crowded slides, move supporting detail to notes where appropriate, and choose clearer layouts without changing the slide sequence. (PR #208)                                                                                                                                      |
| [x] Split lumped PPTX code blocks | PPTX import cannot detect separate code blocks on a slide and often merges them into one fenced block. Instruct all AI modes (Polish, Fix, Generate, Remix, Reimagine) to detect and split lumped code blocks back into separate fenced blocks with appropriate language tags. (PR #208) |
| [x] Improve imported-deck polish  | Continue addressing PPTX-import artifacts: mismatched layouts, misplaced images, verbose text boxes, broken code, and weak hierarchy. (PR #208)                                                                                                                                          |
| [x] Preserve speaker notes        | Keep existing notes unchanged unless the user explicitly enables note generation. (PR #208)                                                                                                                                                                                              |

### Preservation & Validation

| Task                             | Details                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x] Harden identity preservation | Preserve existing `theme:`, `background:`, color scheme, slide count, slide order, and narrative flow. (PR #208)                                              |
| [x] Improve repair feedback      | Make validation and repair messages specific to overflow, malformed layouts, broken diagrams, and formatting failures. (PR #209)                              |
| [x] Add quality fixtures         | Cover dense slides, code, tables, Mermaid, PPTX conversions, notes, images, and already-polished slides that should not be rewritten unnecessarily. (PR #209) |

### Acceptance Criteria

- Polish produces a visibly cleaner deck without changing slide count or order.
- Existing visual identity and speaker notes are preserved.
- Crowded, malformed, and PPTX-imported slides improve without introducing new overflow.
- Polish does not introduce new themes, backgrounds, or arbitrary colors.

---

## Phase 14.7: Remix Quality & Visual Identity

Goal: Make Remix a dependable plan→execute restructuring mode between conservative Polish and fully creative Reimagine.

### Restructuring Plan

| Task                           | Details                                                                                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x] Improve editorial planning | Produce clearer polish/rewrite/merge decisions, stronger one-sentence briefs, purposeful reordering, and fewer redundant or low-value output slides.                             |
| [x] Preserve source coverage   | Ensure every source slide is accounted for and that important source material is not silently lost during restructuring.                                                         |
| [x] Improve merge decisions    | Merge only thin, overlapping, or redundant slides; keep distinct topics and strong standalone takeaways separate.                                                                |
| [x] Improve plan observability | Surface the restructuring plan and important decisions in the AI sidebar so users can understand what Remix changed.                                                             |
| [x] Flow-aware plan guidance   | Inject per-flow restructuring priorities (instructional/story/technical/persuasive) into the remix plan prompt so polish/rewrite/merge/reorder decisions follow the chosen flow. |

### Visual Identity & Assets

| Task                          | Details                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [x] Define preserve behavior  | When visual identity preservation is enabled, retain original themes, backgrounds, layouts, and overall visual language while improving structure and wording. (PR #211) |
| [x] Define discard behavior   | When preservation is disabled, remove the old identity deliberately without inventing unsupported styling or changing the conservative behavior of Polish/Fix. (PR #211) |
| [x] Improve image reuse       | Use vision and exact source paths consistently; keep valuable source images and avoid fabricated or external image references. (PR #211)                                 |
| [x] Validate output alignment | Ensure rewritten and merged slides follow their briefs, preserve required identity, and remain within layout and density constraints. (PR #211)                          |

### Acceptance Criteria

- Remix produces a clearer structure without becoming a full reimagining.
- Keep/rewrite/merge decisions are explainable and cover the source deck.
- Preserve-identity mode does not drift into a new theme.
- Discard-identity mode does not accidentally preserve stale visual directives.
- Images, layouts, and source content remain aligned with the restructuring plan.

---

## Phase 14.8: Reimagine Creative Direction & Presentation Quality

Goal: Make Reimagine feel like a guided editorial art director: surprising in its thinking, reassuring in its structure, and coherent in its execution.

The detailed implementation plan is [`docs/plans/reimagine-improvements.md`](docs/plans/reimagine-improvements.md).

### Creative Direction & Review

| Task                              | Details                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [ ] Strengthen the creative brief | Make the outline state the core message, fresh editorial angle, narrative structure, and inferred audience or desired outcome.                         |
| [ ] Show visual direction         | Add a compact read-only visual-system summary to the outline review: palette, typography, composition, imagery, motifs, and preserved identity/assets. |
| [ ] Preserve user control         | Keep plan/chapter editing and regeneration; do not turn the outline modal into a per-slide design editor.                                              |

### Visual Rhythm & Voice

| Task                              | Details                                                                                                                                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ] Pass full visual-system brief | Thread the complete visual system to the generate prompt: palette roles, typography character, composition, imagery mood/treatment, motifs, and contrast rules — not just theme/background choices. |
| [ ] Activate bounded visual style | For Reimagine only, allow renderer-native `theme:` and `background:` choices from the visual system; keep other AI modes conservative and avoid a post-generation token pass.                       |
| [ ] Use visual beats              | Make continuation, transition, punctuation, emotional, and divider beats affect density, hierarchy, imagery, and contrast.                                                                          |
| [ ] Improve presentation voice    | Add flow-aware prose, conversational headlines, progressive disclosure, concrete examples, and useful speaker notes.                                                                                |
| [ ] Validate image reuse          | Warn and repair when a `reuse:<path>` brief does not result in the requested source image being placed.                                                                                             |

### Flow-Aware Outline Structure

| Task                              | Details                                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [ ] Flow-specific technique menus | Replace the fixed seven-item technique list in `reimagine-outline-prompt.md` with per-flow subsets so instructional and technical decks are steered toward fitting structures. |
| [ ] Extend flowTag vocabulary     | Add instructional (`objectives`, `steps`, `example`, `practice`, `recap`) and technical (`assertion`, `evidence`, `implication`) tags; map them through the breakdown phase.   |

### Validation & Test Coverage

| Task                             | Details                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [ ] Add visual-system validation | Warn on invalid theme values, malformed styling directives, and Reimagine results that completely ignore the visual direction. Do not flag individual slides merely for missing `background:` or `theme:`.   |
| [ ] Add Reimagine test fixtures  | Cover visual-system generation/normalization, review modal display, beat-to-treatment mapping, image reuse validation, conditional styling guidance, and no-regression for Polish/Fix/Remix prompt behavior. |

### Acceptance Criteria

- The user can understand and approve the new editorial and visual direction before generation.
- The generated deck is meaningfully different in thesis, structure, and rhythm—not just wording.
- Visual styling is active only for Reimagine and remains bounded by existing renderer capabilities.
- Beat metadata produces visibly different density and hierarchy.
- Headlines, body content, and speaker notes are presentation-ready.
- Kept source images are placed when requested and never fabricated.
- The output remains valid, repairable, undoable, and within density limits.
- The outline's technique menu and flow tags fit the chosen flow rather than offering a one-size-fits-all narrative menu.

---

## Phase 14.9: PPTX Import Quality

Goal: Improve the PPTX import pipeline itself — layout inference accuracy, shape/diagram visual preservation, and a complementary code-block centering directive. Distinct from Phase 14.6 (which improves AI post-processing of imported decks); this phase fixes the deterministic import path.

### Layout Inference

| Task                                          | Details                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ] Fix focus vs header-content detection     | The thin-strip header check (`headerThinRatio: 0.4`) in `pptx-layout-inference.js` is too restrictive. Slides with a header + short body where the header is not ≥40% shorter than the body fall through to `header-content` even when `focus` is the better choice. Relax the check for short content and add a `focus` path for header + short body regardless of header height. |
| [ ] Add focus path for short bulleted content | Slides with 4+ short bullets (total <300 chars) currently skip the `focus` path because the element count exceeds `maxTitleElements: 3`. Consider element count vs. content density rather than a hard cap.                                                                                                                                                                        |
| [ ] Review layout thresholds                  | Audit `pptx-slide-config.js` thresholds (`bodyTopRatio`, `maxTitleLength`, `maxTitleElements`, `headerThinRatio`) against a corpus of real PPTX files. Tune based on actual failure cases, not intuition.                                                                                                                                                                          |

### Shape & Diagram Preservation (#117)

| Task                               | Details                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ] Screenshot shape groups to PNG | Instead of reconstructing individual shapes in markdown, render each shape group/diagram to a canvas and capture it as a single PNG image. Build an SVG from the shape data already extracted by `pptx-extractor.js` (paths, fills, strokes), draw it to a canvas, and export via `canvas.toDataURL()`. Reuses the Canvas infrastructure in `pptx-image-converter.js`. One image per shape group — much simpler than per-shape reconstruction. |
| [ ] Screenshot SmartArt/diagrams   | SmartArt and manual diagrams (detected by `#isManualDiagram()` / `#shapesToDiagram()`) currently flatten to bullet lists. Render the shape group as a single PNG screenshot and embed as an image instead.                                                                                                                                                                                                                                     |
| [ ] Preserve text as fallback      | Shapes with text should keep the text content in the slide markdown alongside the rendered image, so it remains searchable and editable.                                                                                                                                                                                                                                                                                                       |

### Code Block Centering

| Task                            | Details                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ] Add `code-center` directive | Add a per-slide `code-center: true` directive (parsed in `markdown-parser.js`, applied as a `data-code-center` attribute on the slide element). CSS in `styles.css` centers `pre` blocks via `margin: auto; width: fit-content` — same technique already used by the `focus` layout. Works with any layout. |

### Text Overlay Preservation

| Task                                | Details                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ] Detect text-over-image overlays | During PPTX import, detect text elements that overlap images (using the existing `getOverlapArea()` in `pptx-layout-inference.js`). When overlap exceeds a threshold, emit the text as a float-mode text block (`::: text-block { float=true x=... y=... }`) positioned over the image, preserving the PPTX author's overlay intent. Currently both elements are placed in the same area in document flow and the overlay is lost. Position is calculated from the element's `left`/`top` (already in points after normalization). Z-index derived from element `order` to preserve layering. |

### Acceptance Criteria

- Slides with a header + short body use `focus` instead of `header-content` when the body is short enough to benefit from centered presentation.
- Shapes with solid fills render as PNG images in imported decks instead of being converted to text-only.
- Diagrams render as single screenshot images instead of flattening to bullet lists.
- Text overlaid on images in PPTX is preserved as float-mode text blocks that overlay the image in the rendered slide.
- `code-center: true` centers code blocks in any layout, not just `focus`.
- Existing decks without the directive render unchanged.

---

## Phase 15: Editor Diagnostics & Polish

Goal: Surface real deck-quality problems in the editor and polish existing editor features that are too simplistic in their current form — area backgrounds, background image sizing, text block styling, and mermaid drag. Drops the planned `DesignSystem` / `ThemeRegistry` / custom-theme / `@import` work — no demonstrated user need, and the existing light/dark + accent + layout presets cover the actual distribution of what users want. CSS custom properties in `styles/slides.css` already serve as the token system where they belong.

### Layout Governance

| Task                         | Details                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [ ] Wire image-path warnings | `DeckImagesResolver` already detects unresolved `images/...` paths; surface them as real-time warnings via `SlideWarningManager` instead of silent failures. |
| [ ] Detect empty slides      | Warn when a slide has no content areas filled; route through `SlideWarningManager`. Covers the editor hot path (debounced).                                  |
| [ ] Add style-lint warnings  | Surface off-token values in `area-style:`, `background:`, etc. through `SlideWarningManager`. Advisory only — never blocks rendering.                        |
| [ ] Consolidate diagnostics  | Confirm layout, `@area`, image-path, empty-slide, overflow, and style-lint warnings all flow through the existing `SlideWarningManager` pipeline.            |

### Editor Polish

| Task                                                     | Details                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ] Upgrade area background picker (#151)                | Replace the native color input in the `@area` right-click "Set background..." menu with the full background panel from `style-helpers.js` — color swatches, custom color, image picker, overlay slider, and live preview. Reuses existing slide-level background infrastructure (`buildBackgroundPanelHtml()`, `buildImageBackground()`, `parseBackgroundValue()`). Updates `area-style-<name>:` directives to support gradients and image URLs, not just solid hex colors. |
| [ ] Add background image sizing/position (#194)          | Add `background-size` (cover, contain, fit, custom), `background-position` (center, top, bottom, left, right, combinations), and `background-repeat` controls to both the slide-level and area-level background pickers. `buildImageBackground()` currently hardcodes `center / cover no-repeat`. Existing decks keep default behavior.                                                                                                                                     |
| [ ] Add text block styling presets (#196)                | Add preset styles (quote, callout, highlight, warning) and fine-grained border controls (width, style, color, radius, padding, shadow) to the text block properties panel. Extends `src/core/text-block-directive.js` to persist new attributes. Presets render in editor, HTML export, and PDF.                                                                                                                                                                            |
| [ ] Allow dragging mermaid diagrams between areas (#123) | Extend the interact.js cross-area drag system (currently images-only) to mermaid diagrams. Detect `.mermaid` containers as drag sources, support drop-target snapping, and move the mermaid fenced block between `@area` markers in markdown on drop. Reuses `ImageDragController` patterns.                                                                                                                                                                                |
| [ ] Add theme preview                                    | Render a mini slide preview for light/dark + the selected accent in the New Presentation modal so users see the result before creating a deck. No registry required — uses the existing two themes.                                                                                                                                                                                                                                                                         |

### Deferred / Dropped

| Item                                                 | Reason                                                                                                                                                                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DesignSystem` JS module                             | CSS custom properties in `styles/slides.css` already are the token system. A JS registry adds indirection with no user-facing delta.                                                                                          |
| `ThemeRegistry` + custom themes                      | No demonstrated user need. Light/dark + accent covers actual usage. Custom themes pull in a theme editor UI, portability problems, and export inlining that aren't worth the cost.                                            |
| `@import[theme.yaml]` / `@import[slides/section.md]` | Multi-deck composition, not theming. Belongs with Phase 17 (Cloud Mode / repo-native workflows) if it's ever needed. High parser blast radius.                                                                                |
| Motion / transition tokens                           | No transition system exists to tokenize. A slide-transition feature is a Phase 16 (Presenter) concern at minimum.                                                                                                             |
| Brand defaults                                       | The New Presentation modal already lets users pick colors, fonts, accent, header style, borders, and radius per deck. A localStorage default profile is a small follow-up if demand appears.                                  |
| Enforce `layout` / `@area` whitelist                 | Already implemented: `LayoutData.hasLayout()` / `getAreaNames()` validate in `SlidePreviewUpdater`, `AreaGuideManager` (with click-to-fix and header/title alias normalization), and `AiOutputValidator`. No new work needed. |
| Image properties style tab UI (#126)                 | Too vague to be actionable — "The UI controls and their placements need to be reviewed and improved." No specifics or acceptance criteria. Revisit when concrete requirements are defined.                                    |
| Export PowerPoint shapes as images (#117)            | Moved to Phase 14.9 (PPTX Import Quality). Not editor polish — belongs with the import pipeline.                                                                                                                              |

---

## Phase 15.1: Interactive Classroom Features

Goal: Add the first layer of classroom interactivity that differentiates the app at v1.0 launch — copyable code blocks in student-facing exports and lightweight word cloud / poll embedding via a third-party tool (Slido or Mentimeter). Keeps the deck as the source of truth for slides, code, and structure while using an external service for the real-time audience pipe. No hosting, no realtime infrastructure, no execution engine. Must complete before Phase 15.5 (v1.0 Release).

### Copyable Code Blocks

| Task                               | Details                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ] Add copy button to code blocks | Render a small copy-to-clipboard icon on every `<pre><code>` block in the runtime view and HTML export. Click copies the raw code text. Uses `navigator.clipboard.writeText()` with a fallback for non-secure contexts. Visual feedback (checkmark or "Copied" tooltip) on success. Does not appear in the presenter/audience stage view — only in student-facing HTML. |
| [ ] Style the copy button          | Minimal, unobtrusive styling in `styles/slides.css`. Positioned top-right of the code block, does not overlap syntax-highlighted content. Works in both light and dark themes. Accessible label and keyboard focus.                                                                                                                                                     |
| [ ] PDF fallback                   | PDF is static — no clipboard. Ensure code blocks render cleanly in PDF export with readable font sizing. Optionally add a small caption or footnote pointing to the live HTML version if a URL is available. No copy button in PDF.                                                                                                                                     |
| [ ] Test in HTML export            | Verify copy buttons work in the self-contained HTML build (`tools/build.mjs` output). The button JS must survive the export bundling and run without a dev server.                                                                                                                                                                                                      |

### Live Poll Initiation & Persistence

Modeled on the existing `BreakManager` pattern: the presenter initiates a poll mid-lesson via a button, it renders as an overlay, and when ended it is persisted into the deck as a new slide. The deck grows during the class based on what happened in the room. Unlike the break feature (ephemeral), polls become a permanent part of the deck.

| Task                                        | Details                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ] Add `ActivityManager` engine module     | New module in `src/engine/` modeled on `BreakManager`. Manages live poll state (active/inactive, type, question, provider session ref, started-at). Uses `BroadcastChannel` for cross-window sync (presenter ↔ viewer). Creates an overlay slide element on the stage (like `BreakManager.createBreakSlide()`). Owned by `DeckController`.                                                                                                                                                         |
| [ ] Add "Start Activity" UI                 | A button in the presenter panel or header (like the break button). Clicking opens a lightweight modal: choose type (word cloud, multiple choice, open text, Q&A, quiz, confidence check, pacing pulse), enter question text, paste the Slido/Mentimeter embed URL or session code. Quick and frictionless — the presenter does this live, not in advance. All activity types use the same `activity:` directive and `ActivityManager` pipeline; the type just selects the Slido/Mentimeter widget. |
| [ ] Insert poll slide into deck on creation | When the presenter starts a poll, a new slide is immediately inserted into the deck at the current position via `DeckStore` (undoable, saved). The slide uses the `activity:` directive format: `activity: wordcloud`, `activity-provider: slido`, `activity-id: #abc123`, plus the question as slide content. The deck always reflects what is happening right now — if the window crashes or the presenter navigates away, the poll slide is already persisted.                                  |
| [ ] Render poll overlay on stage            | While the poll is active, render an overlay on top of the poll slide showing the third-party embed (iframe or widget) and the join code/QR for students. The overlay is ephemeral (like the break slide); the underlying slide is the persistent record. Hidden from the audience stage view — only the presenter sees the embed; students join via the external tool.                                                                                                                             |
| [ ] End poll                                | When the presenter clicks "End Poll," the overlay is removed. The poll slide remains in the deck. Optionally capture a snapshot of results into the slide content or speaker notes at this point.                                                                                                                                                                                                                                                                                                  |
| [ ] `activity:` directive parsing           | New frontmatter directive parsed by `MarkdownParser` and stored on the slide object. Format: `activity: wordcloud` (or `poll`, `q&a`), `activity-provider: slido`, `activity-id: #abc123`. Does not affect slide splitting or layout. This is the persisted format for polls created live and for polls pre-authored in markdown.                                                                                                                                                                  |
| [ ] Render saved activity slides            | When a saved slide has an `activity` directive, render the embed (if online) or a static fallback (question text + join code + "results from this class" note). In PDF and offline HTML, show the static fallback only. The activity definition is preserved in the markdown so the deck remains reusable.                                                                                                                                                                                         |
| [ ] Presenter view: join code/QR            | While a poll is active, the presenter panel shows the join code and a QR code so students can connect to the Slido/Mentimeter session. The instructor sees live results in the embedded widget or the external dashboard. No result aggregation in the deck for v1.0.                                                                                                                                                                                                                              |
| [ ] Static fallback for export              | In PDF and offline HTML, the embed cannot run. Render a placeholder: the question text, the activity type, and "Live activity: join with code XYZ at slido.com" or similar. The activity definition is preserved in the markdown.                                                                                                                                                                                                                                                                  |
| [ ] Document the feature                    | Add `activity:` to `docs/authoring.md` with examples for Slido and Mentimeter. Document both flows: (1) live initiation via the Start Poll button, and (2) pre-authoring in markdown. Note free-tier limits (Slido: 100 participants, 3 polls/event; Mentimeter: unlimited audience, 2 questions/presentation).                                                                                                                                                                                    |
| [ ] Update tagline and descriptions         | Update README opening, `docs/example/slides.md` title slide, `package.json` description, and `index.html` meta description to reflect the teaching-focused vision (copyable code, live participation). Proposed tagline: "Presentations that teach, not just show." Keep it grounded in what Phase 15.1 actually ships — no forward-looking platform claims.                                                                                                                                       |

### Acceptance Criteria

- Every code block in the HTML export has a working copy button that copies the raw code to the clipboard.
- Code blocks in PDF export render cleanly without a copy button.
- The presenter can initiate a poll live via a "Start Poll" button (no pre-authoring required). The poll slide is inserted into the deck immediately on creation, written through `DeckStore` (undoable, saved).
- While the poll is active, an overlay renders on stage with the embed and join code/QR. The overlay is ephemeral; the underlying slide is the persistent record.
- Saved activity slides render the embed when online and a static fallback in PDF and offline HTML.
- The presenter panel shows the join code/QR while a poll is active.
- Poll state syncs between presenter and viewer windows via `BroadcastChannel`.
- `docs/authoring.md` documents both flows: live initiation and pre-authoring.
- README, slides.md, package.json, and index.html reflect the teaching-focused vision grounded in Phase 15.1 features.
- Full quality gate passes (lint, format, unit tests, E2E tests, build).

---

## Phase 15.5: v1.0 Release Preparation

Goal: Rename the app, refresh all documentation and positioning, complete manual testing of critical user flows, and prepare launch metadata. This is the release gate — nothing goes public until this phase is done. Phases 14.6-14.9, 15, and 15.1 must be complete first.

### Rename & Branding

| Task                             | Details                                                                                                                                                                                                                                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ] Decide on new app name       | Finalize the new name. Consider domain availability, npm registry (if ever published), GitHub repo name, and searchability.                                                                                                                                |
| [ ] Rename user-facing strings   | Update README, index.html `<title>`, `public/site.webmanifest`, CHANGELOG, ROADMAP, all `docs/`, CONTRIBUTING, ADR. Straightforward find-replace.                                                                                                          |
| [ ] Update AI prompts            | Update "SlideMD" references in `src/data/prompts/system-prompt.md`, `polish-prompt.md`, `fix-prompt.md`, `generate-prompt.md`. Regenerate test snapshots in `ai-prompt-snapshots.test.js.snap`.                                                            |
| [ ] Update package.json metadata | Change `name`, update `repository` URL to match new GitHub repo name, update `description` and `keywords` for public launch.                                                                                                                               |
| [ ] localStorage key strategy    | Decide: keep `webdeck_*` keys as internal implementation detail (simplest, no migration needed), or rename with a migration step on load. The keys are invisible to users. CSS classes (`webdeck-hidden`, `data-webdeck-role`) can stay as internal names. |
| [ ] Rename GitHub repo           | Rename the repository on GitHub, update all clone URLs, badge links, and references in docs.                                                                                                                                                               |

### Documentation Refresh

| Task                               | Details                                                                                                                                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ] Update README feature list     | Add missing features from Phases 9-14.5: text blocks, command palette, full-text search, auto-save + Ctrl+S, vision-augmented AI, editable Reimagine outline, conflict resolution, global undo/redo, grid resizer, area background, media full-bleed. |
| [ ] Add competitive comparison     | New section or doc comparing vs. PowerPoint (proprietary, no diffability), Reveal.js (requires HTML/JS), Marp (CLI-only, no live editor), Slidev (Vue-based, more complex). Focus on what makes this tool different.                                  |
| [ ] Add privacy/security statement | Document where data goes: markdown stays local, AI calls go directly to user-configured OpenRouter/Ollama endpoint, API key stored in localStorage, no telemetry. Essential for public trust.                                                         |
| [ ] Write v1.0 CHANGELOG entry     | Comprehensive `## 1.0.0` summary at the top of CHANGELOG.md covering all major feature categories (authoring, editing, AI, PPTX import, export, presenter). Keep existing version history below.                                                      |
| [ ] Update docs/RELEASING.md       | Add v1.0-specific checklist (positioning, testing, migration guide if applicable).                                                                                                                                                                    |

### Testing & Quality

| Task                           | Details                                                                                                                                                                                                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ] Manual test plan           | Document and execute step-by-step manual testing for all critical flows: presenter view, AI whole-deck operations (Polish, Remix, Reimagine), PPTX import with real files, HTML/PDF export, text blocks, image drag, undo/redo, conflict resolution, auto-save, command palette, full-text search. |
| [ ] Add E2E for presenter view | Playwright spec covering: open presenter panel, navigate slides, verify notes display, verify next-slide preview. (Stretch — manual testing is sufficient for v1.0 if time-constrained.)                                                                                                           |
| [ ] Performance check          | Test large deck load times (50+ slides), export times, PPTX import times. Document any limits.                                                                                                                                                                                                     |
| [ ] Full quality gate          | Run `npm run lint`, `npm run format:check`, `npm test`, `npm run test:e2e`, `npm run build`. All must pass.                                                                                                                                                                                        |

### Launch Metadata

| Task                                  | Details                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [ ] Create README hero image          | One good image (screenshot of a nice slide + app name) for the README. GitHub uses the first README image as the social preview card when the repo link is shared. This replaces separate og-image work for the GitHub-sharing case.                                                       |
| [ ] Update favicon set                | Update favicon, apple-touch-icon, and manifest icons in `public/` to match the new brand. Matters for local use — browser tabs, bookmarks, and home-screen shortcuts.                                                                                                                      |
| [ ] Add OG tags + meta (if demo site) | Only needed if deploying a public demo site: add `og:title`, `og:description`, `og:image`, `og:url`, `og:type`, Twitter card tags, and a 150-160 char meta description to `index.html`. If the public face is the GitHub repo only, the README hero image and repo description cover this. |
| [ ] Update GitHub repo description    | Optimize the GitHub repo "About" description for search and sharing. This is what appears in GitHub search results and on the repo card.                                                                                                                                                   |

### Release

| Task                            | Details                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [ ] Beta pre-release (optional) | Tag `v1.0.0-beta` for early feedback from a small group before the public launch.                                                          |
| [ ] Final manual test pass      | Complete the manual test plan on the release build. No known crash bugs.                                                                   |
| [ ] Tag v1.0.0                  | Create v1.0 release branch, update version to 1.0.0, tag, create GitHub release with release notes.                                        |
| [ ] Public announcement         | Blog post or announcement with: what the tool is, who it's for, key features, competitive positioning, getting started link, roadmap link. |

### Acceptance Criteria

- The app name is consistent across all user-facing surfaces (README, docs, index.html, package.json, GitHub repo, AI prompts).
- README lists all current features with no stale references.
- Competitive comparison and privacy statement are published.
- All critical user flows have been manually tested with no known crash bugs.
- Full quality gate passes (lint, format, unit tests, E2E tests, build).
- Sharing the GitHub repo link produces a preview card with a hero image (README image).
- Favicon and manifest icons reflect the new brand.
- If a public demo site is deployed, OG tags and meta description produce a social preview card.
- CHANGELOG has a comprehensive v1.0 entry.
- v1.0.0 is tagged and released on GitHub.

---

## Phase 16: Presenter, Print & AI Commands

Goal: Fill the real competitive gaps in the presenter experience, make existing AI modes discoverable, and add PDF notes plus a visual-QA export. Extends the existing two-window architecture (editor + viewer) rather than introducing a separate presenter window — the presenter panel lives in the editor window and grows to cover timer, visual next-slide preview, and grid overview.

### Presenter Core

| Task                                 | Details                                                                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ] Auto-exit edit mode on present   | Switch off edit mode automatically when the user starts presenting, so the editor chrome drops away and the presenter panel gets full window space. Re-entering edit mode restores the editor UI. |
| [ ] Add elapsed-time timer and clock | Display elapsed presentation time and wall-clock time in the presenter panel. Extends the existing `BreakManager` timer pattern.                                                                  |
| [ ] Add visual next-slide preview    | Render a scaled-down preview of the upcoming slide in the presenter panel, replacing the current text-only title. Reuses `SlideRenderer` + `ContentEnhancer` off-screen.                          |
| [ ] Add slide grid overview          | Grid view of all slides for quick jumping during Q&A.                                                                                                                                             |

### AI Command Discoverability

| Task                             | Details                                                                                                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ] Add AI category to palette   | Add an "AI" category to the existing command palette (`src/engine/command-palette.js`) and wire the existing intents (`enhanceSlide`, `addSpeakerNotes`, `polish`) as palette commands. |
| [ ] Target current slide or deck | Single-slide intents target the current slide; whole-deck intents target the deck. Uses the existing `AiOrchestrator.runOperation()` path — no new execution logic.                     |

### PDF Notes & Visual QA

| Task                     | Details                                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ] Speaker notes in PDF | Optional page-per-slide or notes section in PDF output via `tools/pdf.mjs`. Useful for handout-style PDFs.                                                                                                          |
| [ ] Per-slide PNG export | Playwright screenshots of each slide on the 1920x1080 stage; output to a directory. Builds on the existing Playwright harness. Justified as a visual-QA / regression-diffing tool, not a user presentation feature. |

### Deferred / Dropped

| Item                                         | Reason                                                                                                                                                                                                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Separate presenter window (PowerPoint-style) | The existing two-window model (editor + viewer) works and is lower-risk. A third window adds window-management and sync surface area (AGENTS.md flags history/broadcasts as cross-cutting). Panel components are reusable if a dedicated window is ever needed. |
| `PrintAdapter` class                         | Technical-debt refactor consolidating `PrintManager` and `tools/pdf.mjs` DOM prep. No user-facing delta. Defer unless the duplicated emoji-removal logic causes bugs.                                                                                           |
| Unify Mermaid/Prism/KaTeX rendering          | Already done. `ContentEnhancer.enhanceRenderedContent()` is the single path used by runtime, HTML export (via runtime), and `tools/pdf.mjs`.                                                                                                                    |
| Laser pointer / drawing overlay              | Explicitly stretch in the original roadmap. High blast radius (touches renderer and event handling), low demand. Drop.                                                                                                                                          |
| "Summarize for executive" AI intent          | Niche, no demonstrated demand. The existing AI modes (enhance, fix, polish, remix, reimagine, addSpeakerNotes) cover the main use cases.                                                                                                                        |
| "Convert bullets to metric cards" AI intent  | Very specific, no demonstrated demand. Same reasoning as above.                                                                                                                                                                                                 |
| `PresenterModel` class                       | The presenter state is already spread across `DeckController`, `BreakManager`, and `RoleManager` and works. A dedicated model class is optional refactoring, not a user-facing gap. Keep the state where it is.                                                 |
| Speaker notes panel (as new work)            | Already implemented: `DeckController.renderNotes()` renders notes as markdown into the existing presenter panel. Not a new task.                                                                                                                                |
| Go-to-slide search                           | Already implemented: `SlideSearch` (`src/engine/slide-search.js`) provides full-text search across slides with a modal UI. Not a new task.                                                                                                                      |

---

## Phase 17: Cloud Mode

Goal: Enable cloud image storage, pluggable storage drivers, and seamless Open/Save UX.

### Pluggable Image Storage Driver (`POST /api/upload-image`)

| Task                                      | Details                                                           |
| ----------------------------------------- | ----------------------------------------------------------------- |
| [ ] GitHub Driver (`--storage=github`)    | Upload images to GitHub repo via API, return raw URLs             |
| [ ] Zero-Setup `gh` CLI check             | Auto-detect authenticated `gh auth status`, use existing token    |
| [ ] Device Auth Flow fallback             | 2-click GitHub Device Authorization Flow when `gh` is unavailable |
| [ ] Cache OAuth token                     | Store in `~/.config/my-app/config.json` after device auth         |
| [ ] Local Driver (`--storage=local`)      | Save to `./images/` with sanitized unique filenames               |
| [ ] Auto Mode (`--storage=auto`, default) | GitHub if token/`gh` exists, fallback to local `./images/`        |
| [ ] CLI invocation flags                  | `--storage=github`, `--storage=local`, `--storage=auto`           |

### User-Facing Open Deck Workflow

| Task                           | Details                                                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [ ] Terminal (primary)         | `node tools/dev-server.mjs path/to/slides.md` opens browser                                                                                                                                |
| [ ] `--init` scaffold flag     | `node tools/dev-server.mjs --init [path]` creates a starter `slides.md` + `images/` folder with a chosen template (blank, standard, lecture), mirroring the in-app New Presentation modal. |
| [ ] `GET /api/browse` endpoint | Browse local `.md` or `.textpack` paths from browser UI                                                                                                                                    |
| [ ] Open Deck modal            | Path input or directory browser for switching decks without restart                                                                                                                        |
| [ ] Drag-and-drop `.textpack`  | Unpack in-memory/temp storage on browser canvas                                                                                                                                            |

### User-Facing Save Deck Workflow

| Task                                    | Details                                                   |
| --------------------------------------- | --------------------------------------------------------- |
| [ ] Silent auto-save                    | Debounced `POST /api/deck`, writes directly to disk       |
| [ ] Manual save (`Cmd+S` / `Ctrl+S`)    | Instant `POST /api/deck`, UI shows `Saved` indicator      |
| [ ] Export as `.textpack` (header menu) | Bundle `slides.md` + images into downloadable ZIP         |
| [ ] Export as `.html` (header menu)     | Run build in memory, download standalone single-file HTML |

### Execution Steps

| Step | Details                                                                             |
| ---- | ----------------------------------------------------------------------------------- |
| 1    | Add `GET /api/browse` and update `POST /api/upload-image` with storage driver logic |
| 2    | Implement GitHub Device OAuth flow helper in `tools/dev-server.mjs`                 |
| 3    | Update UI header/modal buttons for "Open Deck", "Export .textpack", "Export .html"  |

---

## Summary

| Phase                                        | Status      |
| -------------------------------------------- | ----------- |
| Phase 1: Safety Net                          | ✅ Complete |
| Phase 2: Build Modernization                 | ✅ Complete |
| Phase 3: Distribution                        | ✅ Complete |
| Phase 4: New Presentation                    | ✅ Complete |
| Phase 5: Quick Fixes                         | ✅ Complete |
| Phase 6: Testing & Polish                    | ✅ Complete |
| Phase 7: PPTX Conversion                     | ✅ Complete |
| Phase 7.5: CLI Dev Server                    | ✅ Complete |
| Phase 8: AI Post-Processing                  | ✅ Complete |
| Phase 9: Text Insertion & Editor UX          | ✅ Complete |
| Phase 10: Renderer Hardening                 | ✅ Complete |
| Phase 11: AI Operations Foundation           | ✅ Complete |
| Phase 12: Deck Store & Patches               | ✅ Complete |
| Phase 13: AI Orchestrator & Single-Slide     | ✅ Complete |
| Phase 13.1: Remix Planner                    | ✅ Complete |
| Phase 13.2: Vision-Enabled Remix & Hardening | ✅ Complete |
| Phase 14: Conflict Resolution & Undo         | ✅ Complete |
| Phase 14.5: Structural Cleanup & Tests       | ✅ Complete |
| Phase 14.6: Polish Quality & Presentation    | ✅ Complete |
| Phase 14.7: Remix Quality & Visual Identity  | ✅ Complete |
| Phase 14.8: Reimagine Creative Direction     | Planned     |
| Phase 14.9: PPTX Import Quality              | Planned     |
| Phase 15: Editor Diagnostics & Polish        | Planned     |
| Phase 15.1: Interactive Classroom Features   | Planned     |
| Phase 15.5: v1.0 Release Preparation         | Planned     |
| Phase 16: Presenter, Print & AI Commands     | Planned     |
| Phase 17: Cloud Mode                         | Planned     |

### Priority Order

```
Phase 1 ✅ → Phase 2 ✅ → Phase 3 ✅ → Phase 4 ✅ → Phase 5 ✅ → Phase 6 ✅ → Phase 7 ✅ → Phase 7.5 ✅ → Phase 8 ✅ → Phase 9 ✅ → Phase 10 ✅ → Phase 11 ✅ → Phase 12 ✅ → Phase 13 ✅ → Phase 13.1 ✅ → Phase 13.2 ✅ → Phase 14 ✅ → Phase 14.5 ✅ → Phase 14.6 ✅ → Phase 14.7 ✅ → Phase 14.8 → Phase 14.9 → Phase 15 → Phase 15.1 (interactive classroom) → Phase 15.5 (v1.0 release) → Phase 16 → Phase 17
```

Phase 7 was originally planned as AI-powered conversion but was implemented as rule-based layout inference instead — no API keys or external services needed. Phase 7.5 added the CLI dev server with `.md + images/` as primary format and `.textpack` for sharing. Phase 8 added AI post-processing via OpenRouter for PPTX imports. Phase 9 (Text Insertion & Editor UX) added draggable text blocks, editor polish, and layout/media controls. Phase 10 hardened the renderer pipeline with snapshot tests and a unified `ContentEnhancer`.

Phases 11-14 form the AI/state track and were reordered from their original sequence after planning determined that single-slide AI edits need undoable patches: Phase 11 (AI Operations Foundation) builds the pure-logic layer — OpenAI-compatible provider client (#148), output schema/validator, content rules (#150), prompt composer, and repair message builder — and wires them into the existing whole-deck flow. Phase 12 (Deck Store & Patches) adds the canonical `DeckStore`, `SlidePatch`, snapshot-based `DeckHistory`, and an `EditController` boundary-sync wiring. Phase 13 (AI Orchestrator & Single-Slide Editing) adds the operation model, intent registry, orchestrator entry point, and per-slide AI editing that writes back through `DeckStore`. Phase 14 (Conflict Resolution & Global Undo) adds working-state capture, stale-operation guards, `ConflictResolver`, committed-operation `Ctrl+Z`/`Ctrl+Y`, store-to-view synchronization, and the full `EditController` rewire. Phase 14 is delivered in two slices: 14.1 state safety and conflicts, then 14.2 undo semantics and editor rewire. Phase 14.5 (Structural Cleanup & Test Infrastructure) pays down debt accumulated during the AI/state track — shared bundle-order extraction, E2E and PPTX integration tests, a client-side logging utility, contributor documentation, and lint coverage for build scripts — before Phases 14.6-14.8 improve the existing AI modes, Phase 14.9 improves the deterministic PPTX import pipeline (layout inference accuracy, shape/diagram rendering per #117, and a `code-center` directive), and Phases 15-17 (Editor Diagnostics & Polish, Interactive Classroom Features, v1.0 Release Preparation, Presenter/Print/AI Commands, Cloud Mode) build new platform features on top. Phase 15.1 (Interactive Classroom Features) adds the first differentiating interactivity for v1.0: copyable code blocks in student-facing HTML exports and live poll initiation via a third-party tool (Slido or Mentimeter) using a simple `activity:` slide directive, modeled on the existing `BreakManager` pattern. Polls are inserted into the deck on creation so they persist immediately. No hosting or realtime infrastructure required. Phase 15.5 is the v1.0 release gate — app rename, documentation refresh, competitive positioning, manual testing of all critical flows, social metadata, and the v1.0 tag. Phases 16 and 17 are post-v1.0. Phase 15 was rescoped from its original "Design System & Theme Registry" plan after review found no demonstrated user need for a `DesignSystem` JS module, `ThemeRegistry`, custom themes, or the `@import` directive — the existing light/dark + accent + layout presets cover actual usage, and CSS custom properties already serve as the token system. The rescoped phase keeps the layout-governance warnings (real deck-quality pain), upgrades the area-background picker from a native color input to the full background panel (reusing existing slide-level infrastructure), adds background image sizing/position controls (#194), text block styling presets (#196), mermaid cross-area drag (#123), and a theme preview to the New Presentation modal (a real UX gap), while deferring the speculative architecture. Open issues #126 (image properties UI — too vague) and #117 (PPTX shape export — wrong scope) were considered and left out. Phase 16 was rescoped to drop already-done work (ContentEnhancer unification, speaker-notes panel, go-to-slide search), technical-debt refactors (`PrintAdapter`), and speculative items (laser pointer, "summarize for executive" and "convert bullets to metric cards" AI intents, `PresenterModel` class). The rescoped phase extends the existing two-window presenter panel (auto-exit edit mode on present, elapsed-time timer, visual next-slide preview, slide grid overview), wires existing AI intents into the command palette for discoverability, and adds speaker-notes-in-PDF plus per-slide PNG export for visual QA. A separate PowerPoint-style presenter window was considered and deferred — the existing editor + viewer model is lower-risk and the panel components are reusable if a dedicated window is ever needed.

## Backlog

Items deferred from earlier phases; re-prioritize when the active phase is complete. Items that have been moved into a planned phase (#117 → Phase 14.9, #123 → Phase 15, #194/#196 → Phase 15) are tracked there and not duplicated here.

### Stepped Content & Motion

| Task                                      | Details                                                               |
| ----------------------------------------- | --------------------------------------------------------------------- |
| [ ] Add click-step reveal directives      | `<!-- click -->` or `@click` to reveal bullets, code lines, diagrams. |
| [ ] Evaluate Shiki for code highlighting  | Keep offline build; pre-tokenize code blocks with a new highlighter.  |
| [ ] Add CSS-based slide transitions       | Per-deck default and per-slide override via frontmatter.              |
| [ ] Add reduced-motion preference support | Respect `prefers-reduced-motion` for all transitions and reveals.     |

### Logging & Metrics

| Task                              | Details                                                 |
| --------------------------------- | ------------------------------------------------------- |
| [ ] Add error telemetry           | Capture runtime errors and failed operations in the UI. |
| [ ] Add build/PDF runtime metrics | Track build time, PDF render time, and asset sizes.     |
| [ ] Add optional log export       | Download logs for debugging without browser DevTools.   |

### Editor UI

| Task                   | Details                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [ ] Undo/redo controls | Optional editor buttons reflect `DeckStore.canUndo()` / `canRedo()` and follow the same semantics as the shortcuts. |
