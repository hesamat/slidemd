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
| [x] Add plan phase             | One LLM call with deck summary → returns JSON plan (keep/rewrite/merge actions with briefs). Logged in AI sidebar.         |
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

## Phase 14.5: Structural Cleanup & Test Infrastructure

Goal: Pay down structural debt and close test gaps before building new features on top of Phases 15-17. These tasks are independent of each other and can be parallelized. Two structural refactors (EditController decomposition and `ai-orchestrator.js` split) are carried over from Phase 14.

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

## Phase 15: Design System & Theme Registry

Goal: Centralize tokens, themes, and layout governance for consistent and predictable decks.

### Tokens & Themes

| Task                            | Details                                                                                                                                                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ] Add `DesignSystem`          | Define and expose color, spacing, typography, and radius tokens.                                                                                                                                                                                    |
| [ ] Add `ThemeRegistry`         | Register light, dark, and any custom themes as named presets.                                                                                                                                                                                       |
| [ ] Map themes to CSS variables | Drive `theme-manager.js` and `styles/slides.css` from the registry.                                                                                                                                                                                 |
| [ ] Add `@import` directive     | Support `@import[theme.yaml]` for shared theme tokens and `@import[slides/section.md]` for reusable slide fragments. Recursive resolution, YAML merge into frontmatter, markdown splice into slide array. Enables repo-native multi-deck workflows. |

### Layout Governance

| Task                           | Details                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| [ ] Enforce `layout` whitelist | Allow only the layouts defined in the `LayoutData` / `DesignSystem` registry.                                       |
| [ ] Enforce `@area` whitelist  | Validate that every `@area` marker is an allowed area for the chosen layout.                                        |
| [ ] Add style lint to warnings | Surface off-token values in `SlideWarningManager` in real time.                                                     |
| [ ] Validate image paths       | Warn on unresolved `![...](images/...)` references in `SlideWarningManager` in real time.                           |
| [ ] Detect empty slides        | Warn when a slide has no content areas filled, surfaced in `SlideWarningManager`.                                   |
| [ ] Consolidate diagnostics    | Surface all layout, area, image-path, and empty-slide warnings through the existing `SlideWarningManager` pipeline. |

### Brand Defaults

| Task                               | Details                                                             |
| ---------------------------------- | ------------------------------------------------------------------- |
| [ ] Add brand defaults             | Default colors, fonts, and accent palette for new decks.            |
| [ ] Add theme preview              | Render a small preview of each theme in the New Presentation modal. |
| [ ] Add motion / transition tokens | Define default transition, duration, and easing per theme.          |

---

## Phase 16: Presenter, Print & AI Commands

Goal: Build out the presenter experience, simplify print/PDF preparation, and expose contextual AI commands.

### Presenter View

| Task                          | Details                                                           |
| ----------------------------- | ----------------------------------------------------------------- |
| [ ] Add `PresenterModel`      | Track elapsed time, clock, current notes, and next-slide preview. |
| [ ] Add speaker notes panel   | Dedicated presenter panel with current and next slide notes.      |
| [ ] Add timer and clock UI    | Display elapsed and wall-clock time in presenter view.            |
| [ ] Add next-slide preview    | Show the upcoming slide in the presenter panel.                   |
| [ ] Add slide grid overview   | Grid view of all slides for quick jumping during Q&A.             |
| [ ] Add go-to-slide search    | Search by title or content from presenter view.                   |
| [ ] Add presenter annotations | Optional laser pointer / drawing overlay (stretch).               |

### Print & PDF

| Task                                    | Details                                                                                                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ] Add `PrintAdapter`                  | Single DOM preparation path for print and PDF.                                                                                                                                                        |
| [ ] Unify Mermaid/Prism/KaTeX rendering | One `ContentEnhancer` path used by runtime, HTML export, and `tools/pdf.mjs`.                                                                                                                         |
| [ ] Support speaker notes in PDF        | Optional page-per-slide or notes section in PDF output.                                                                                                                                               |
| [ ] Add per-slide PNG export            | Playwright screenshots of each slide on the 1920x1080 stage; output to a directory. Reuses the same `PrintAdapter` DOM preparation path. Useful for README embeds, visual QA, and regression diffing. |

### Contextual AI Commands

| Task                          | Details                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| [ ] Add AI command palette UI | List of intents: summarize for executive, convert bullets to metric cards, add speaker notes. |
| [ ] Wire `AiOperations` to UI | Each command maps to an `AiOperation` with a prompt and a selected slide.                     |

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
| Phase 15: Design System & Theme Registry     | Planned     |
| Phase 16: Presenter, Print & AI Commands     | Planned     |
| Phase 17: Cloud Mode                         | Planned     |

### Priority Order

```
Phase 1 ✅ → Phase 2 ✅ → Phase 3 ✅ → Phase 4 ✅ → Phase 5 ✅ → Phase 6 ✅ → Phase 7 ✅ → Phase 7.5 ✅ → Phase 8 ✅ → Phase 9 ✅ → Phase 10 ✅ → Phase 11 ✅ → Phase 12 ✅ → Phase 13 ✅ → Phase 13.1 ✅ → Phase 13.2 ✅ → Phase 14 ✅ → Phase 14.5 → Phase 15 → Phase 16 → Phase 17
```

Phase 7 was originally planned as AI-powered conversion but was implemented as rule-based layout inference instead — no API keys or external services needed. Phase 7.5 added the CLI dev server with `.md + images/` as primary format and `.textpack` for sharing. Phase 8 added AI post-processing via OpenRouter for PPTX imports. Phase 9 (Text Insertion & Editor UX) added draggable text blocks, editor polish, and layout/media controls. Phase 10 hardened the renderer pipeline with snapshot tests and a unified `ContentEnhancer`.

Phases 11-14 form the AI/state track and were reordered from their original sequence after planning determined that single-slide AI edits need undoable patches: Phase 11 (AI Operations Foundation) builds the pure-logic layer — OpenAI-compatible provider client (#148), output schema/validator, content rules (#150), prompt composer, and repair message builder — and wires them into the existing whole-deck flow. Phase 12 (Deck Store & Patches) adds the canonical `DeckStore`, `SlidePatch`, snapshot-based `DeckHistory`, and an `EditController` boundary-sync wiring. Phase 13 (AI Orchestrator & Single-Slide Editing) adds the operation model, intent registry, orchestrator entry point, and per-slide AI editing that writes back through `DeckStore`. Phase 14 (Conflict Resolution & Global Undo) adds working-state capture, stale-operation guards, `ConflictResolver`, committed-operation `Ctrl+Z`/`Ctrl+Y`, store-to-view synchronization, and the full `EditController` rewire. Phase 14 is delivered in two slices: 14.1 state safety and conflicts, then 14.2 undo semantics and editor rewire. Phase 14.5 (Structural Cleanup & Test Infrastructure) pays down debt accumulated during the AI/state track — shared bundle-order extraction, E2E and PPTX integration tests, a client-side logging utility, contributor documentation, and lint coverage for build scripts — before Phases 15-17 (Design System, Presenter/Print/AI Commands, Cloud Mode) build new features on top.

## Backlog

Items deferred from earlier phases; re-prioritize when the active phase is complete.

| Task                                                     | Details                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------- |
| [ ] Allow dragging Mermaid diagrams between areas (#123) | Support drag-and-drop of Mermaid diagrams across `@area` boundaries. |
| [ ] Improve image properties style tab UI (#126)         | Improve the style tab in the image properties panel.                 |

### Office Document Import & Export

| Task                                             | Details                                                        |
| ------------------------------------------------ | -------------------------------------------------------------- |
| [ ] Export PowerPoint shapes and diagrams (#117) | Convert PPTX shapes and diagrams to images during PPTX import. |

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
