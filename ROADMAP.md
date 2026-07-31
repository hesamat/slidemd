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

## Phase 6: Testing & Polish

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

## Phase 9: Text Insertion & Editor UX

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
| [ ] Add tooltips to edit-mode controls (#121)                           | Show tooltips for editor controls to improve discoverability.                        |
| [ ] Make Alt+N new slide shortcut discoverable (#109)                   | Add a menu item, hint, or keybinding label for the new-slide shortcut.               |
| [ ] Right-click context menu format options (#92)                       | Add font, color, and alignment options to the right-click menu for selected content. |

### Layout & Media

| Task                                                      | Details                                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [ ] Adjust width and alignment of main column (#152)      | Add UI controls for `header-content` and `focus` main column width and alignment.  |
| [ ] Set column background via right-click on @area (#151) | Add a context menu option on area tags to inject the correct background directive. |
| [ ] Allow dragging Mermaid diagrams between areas (#123)  | Support drag-and-drop of Mermaid diagrams across `@area` boundaries.               |
| [ ] Improve image properties style tab UI (#126)          | Improve the style tab in the image properties panel.                               |

---

## Phase 10: Markdown-First Foundation

Goal: Make the Markdown string the single source of truth for both the user and the AI, using YAML frontmatter and lightweight slot directives for layout and styling.

### Data Model

| Task                                           | Details                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [ ] Make `DeckStore` hold the Markdown array   | Source of truth: an array of slide strings joined by `---`.                                          |
| [ ] Canonical split/rejoin API                 | `MarkdownParser.splitIntoSlides(markdown)` and `MarkdownParser.joinSlides(slides)`.                  |
| [ ] Treat `Deck` as a read-only view           | Re-parse the Markdown string when it changes; keep the `Deck` object as a transient view only.       |
| [ ] Use the Markdown string as the only schema | Render through the internal Markdown-it pipeline; keep the Markdown string as the user-facing model. |

### Frontmatter & Area Directives

| Task                                           | Details                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| [ ] Expand `MarkdownParser.extractFrontmatter` | Parse `layout`, `theme`, `background`, `hidden`, etc. into a plain object per slide.    |
| [ ] Document and enforce `@area` as canonical  | Use `@left`, `@right`, `@hero`, `@main` for slot boundaries in examples and AI prompts. |
| [ ] Update AI prompts to emit `@area` markers  | Instruct the LLM to place `@area` directives when it needs multi-slot layouts.          |
| [ ] Enforce `layout` against `LayoutData`      | Use the values defined in the `LayoutData` registry for frontmatter layouts and slots.  |

### Targeted AI Slide Patching

| Task                                                   | Details                                                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [ ] Add `enhanceSlide(slideMarkdown, intent)`          | Build a prompt containing one slide Markdown string and an intent string.                          |
| [ ] Instruct the LLM to output a slide Markdown string | Output one valid slide using the allowed layouts and `@area` markers; no extra text.               |
| [ ] Validate the response with `MarkdownParser`        | Parse the returned Markdown; reject or repair anything that does not produce a valid slide.        |
| [ ] Patch by index                                     | Swap the edited slide string back into the array and rejoin with `---`.                            |
| [ ] Simplify `ai-sidebar.js`                           | Route single-slide requests to `enhanceSlide`; use whole-deck batching only for full-deck intents. |

### PPTX Import & Export

| Task                                             | Details                                                        |
| ------------------------------------------------ | -------------------------------------------------------------- |
| [ ] Convert PPTX extraction directly to Markdown | Stream PPTX content directly into Markdown as it is extracted. |
| [ ] Export PowerPoint shapes and diagrams (#117) | Convert PPTX shapes and diagrams to images during PPTX import. |

---

## Phase 11: Content AST & Renderer

Goal: Add an internal, typed content model over `markdown-it` tokens to drive deterministic rendering, while keeping the user-facing model as Markdown.

### Content Model

| Task                        | Details                                                                  |
| --------------------------- | ------------------------------------------------------------------------ |
| [ ] Add `ContentNode` types | Heading, paragraph, list, code, image, table, mermaid, math, blockquote. |
| [ ] Add `ContentCompiler`   | Convert `markdown-it` tokens to a typed `ContentNode[]`.                 |
| [ ] Add node serializers    | Render each `ContentNode` to HTML/DOM.                                   |

### Renderer

| Task                          | Details                                                                   |
| ----------------------------- | ------------------------------------------------------------------------- |
| [ ] Add `AstRenderer`         | Walk the `ContentNode[]` tree and build the slide DOM.                    |
| [ ] Replace `innerHTML` usage | Use the typed renderer in `SlideRenderer` instead of direct `innerHTML`.  |
| [ ] Add SSR/print support     | Use the same renderer for exported HTML and the `tools/pdf.mjs` pipeline. |

### Exports

| Task                          | Details                                                             |
| ----------------------------- | ------------------------------------------------------------------- |
| [ ] Unify Mermaid/Prism/KaTeX | Single `ContentEnhancer` path across runtime, HTML export, and PDF. |
| [ ] Add AST snapshot tests    | Verify that known decks render to a stable AST.                     |

---

## Phase 12: AI Operations & Output Schema

Goal: Structure the AI layer with a registry of intents, validated output, and a clean operation contract.

### AI Operation Model

| Task                                     | Details                                                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [ ] Add `AiOperation`                    | `{ intent, targetSlide, context, prompt }` object describing one AI call.                                   |
| [ ] Add `AiIntentRegistry`               | Map of `intent` names to prompt builders (`enhanceSlide`, `summarize`, `toMetricCards`, `addSpeakerNotes`). |
| [ ] Add `AiOrchestrator`                 | Pick the right context window, call the LLM, validate and apply the result.                                 |
| [ ] Support locally run AI models (#148) | Add OpenAI-compatible provider support for Ollama, LM Studio, and custom base URLs.                         |

### Output Validation

| Task                                | Details                                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [ ] Add `AiOutputSchema`            | Define the expected Markdown structure for each intent (one valid slide).                                  |
| [ ] Add `AiOutputValidator`         | Parse returned Markdown and check layout, `@area` markers, and slot validity.                              |
| [ ] Enforce AI content rules (#150) | Default headers to h1, avoid `header-content` for multi-image slides, and preserve multi-column-list HTML. |
| [ ] Add repair loop                 | On validation failure, ask the LLM to fix the specific issue or fall back.                                 |

### Prompt Engineering

| Task                           | Details                                                                |
| ------------------------------ | ---------------------------------------------------------------------- |
| [ ] Add `AiPromptComposer`     | Compose system and user prompts from reusable fragments.               |
| [ ] Update `src/data/prompts/` | Keep prompts under the length budget and in sync with allowed layouts. |

---

## Phase 13: State, Patches & History

Goal: Make user edits and AI edits trackable, reversible, and safe to merge.

### State Model

| Task                  | Details                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| [ ] Add `DeckStore`   | Single source of truth for the slide-string array and the active index. |
| [ ] Add `SlidePatch`  | `{ index, before, after, source }` object describing one slide change.  |
| [ ] Add `DeckHistory` | Stack of full deck snapshots for undo/redo.                             |

### Conflict & Merge

| Task                       | Details                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| [ ] Add `ConflictResolver` | Reconcile overlapping user and AI edits before applying a patch.   |
| [ ] Add `applyPatch`       | Apply a `SlidePatch` to the `DeckStore` and push to `DeckHistory`. |
| [ ] Add `revertPatch`      | Roll back to the snapshot before a specific patch.                 |

### Editor Wiring

| Task                           | Details                                                 |
| ------------------------------ | ------------------------------------------------------- |
| [ ] Wire `DeckStore` to editor | Make `EditController` read and write through the store. |
| [ ] Add global undo/redo       | `Ctrl+Z` / `Ctrl+Y` operates on `DeckHistory`.          |

---

## Phase 14: Design System & Theme Registry

Goal: Centralize tokens, themes, and layout governance for consistent and predictable decks.

### Tokens & Themes

| Task                            | Details                                                             |
| ------------------------------- | ------------------------------------------------------------------- |
| [ ] Add `DesignSystem`          | Define and expose color, spacing, typography, and radius tokens.    |
| [ ] Add `ThemeRegistry`         | Register light, dark, and any custom themes as named presets.       |
| [ ] Map themes to CSS variables | Drive `theme-manager.js` and `styles/slides.css` from the registry. |

### Layout Governance

| Task                           | Details                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------- |
| [ ] Enforce `layout` whitelist | Allow only the layouts defined in the `LayoutData` / `DesignSystem` registry. |
| [ ] Enforce `@area` whitelist  | Validate that every `@area` marker is an allowed area for the chosen layout.  |
| [ ] Add style lint to warnings | Surface off-token values in `SlideWarningManager` in real time.               |

### Brand Defaults

| Task                   | Details                                                             |
| ---------------------- | ------------------------------------------------------------------- |
| [ ] Add brand defaults | Default colors, fonts, and accent palette for new decks.            |
| [ ] Add theme preview  | Render a small preview of each theme in the New Presentation modal. |

---

## Phase 15: Presenter, Print & AI Commands

Goal: Build out the presenter experience, simplify print/PDF preparation, and expose contextual AI commands.

### Presenter View

| Task                        | Details                                                           |
| --------------------------- | ----------------------------------------------------------------- |
| [ ] Add `PresenterModel`    | Track elapsed time, clock, current notes, and next-slide preview. |
| [ ] Add speaker notes panel | Dedicated presenter panel with current and next slide notes.      |
| [ ] Add timer and clock UI  | Display elapsed and wall-clock time in presenter view.            |

### Print & PDF

| Task                                    | Details                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| [ ] Add `PrintAdapter`                  | Single DOM preparation path for print and PDF.                                |
| [ ] Unify Mermaid/Prism/KaTeX rendering | One `ContentEnhancer` path used by runtime, HTML export, and `tools/pdf.mjs`. |
| [ ] Support speaker notes in PDF        | Optional page-per-slide or notes section in PDF output.                       |

### Contextual AI Commands

| Task                          | Details                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| [ ] Add AI command palette UI | List of intents: summarize for executive, convert bullets to metric cards, add speaker notes. |
| [ ] Wire `AiOperations` to UI | Each command maps to an `AiOperation` with a prompt and a selected slide.                     |

---

## Phase 16: Cloud Mode

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

| Task                           | Details                                                             |
| ------------------------------ | ------------------------------------------------------------------- |
| [ ] Terminal (primary)         | `node tools/dev-server.mjs path/to/slides.md` opens browser         |
| [ ] `GET /api/browse` endpoint | Browse local `.md` or `.textpack` paths from browser UI             |
| [ ] Open Deck modal            | Path input or directory browser for switching decks without restart |
| [ ] Drag-and-drop `.textpack`  | Unpack in-memory/temp storage on browser canvas                     |

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

| Phase                                    | Status      |
| ---------------------------------------- | ----------- |
| Phase 1: Safety Net                      | ✅ Complete |
| Phase 2: Build Modernization             | ✅ Complete |
| Phase 3: Distribution                    | ✅ Complete |
| Phase 4: New Presentation                | ✅ Complete |
| Phase 5: Quick Fixes                     | ✅ Complete |
| Phase 6: Testing & Polish                | ✅ Complete |
| Phase 7: PPTX Conversion                 | ✅ Complete |
| Phase 7.5: CLI Dev Server                | ✅ Complete |
| Phase 8: AI Post-Processing              | ✅ Complete |
| Phase 9: Text Insertion & Editor UX      | In progress |
| Phase 10: Markdown-First Foundation      | Planned     |
| Phase 11: Content AST & Renderer         | Planned     |
| Phase 12: AI Operations & Output Schema  | Planned     |
| Phase 13: State, Patches & History       | Planned     |
| Phase 14: Design System & Theme Registry | Planned     |
| Phase 15: Presenter, Print & AI Commands | Planned     |
| Phase 16: Cloud Mode                     | Planned     |

### Priority Order

```
Phase 1 ✅ → Phase 2 ✅ → Phase 3 ✅ → Phase 4 ✅ → Phase 5 ✅ → Phase 6 ✅ → Phase 7 ✅ → Phase 7.5 ✅ → Phase 8 ✅ → Phase 9 → Phase 10 → Phase 11 → Phase 12 → Phase 13 → Phase 14 → Phase 15 → Phase 16
```

Phase 7 was originally planned as AI-powered conversion but was implemented as rule-based layout inference instead — no API keys or external services needed. Phase 7.5 added the CLI dev server with `.md + images/` as primary format and `.textpack` for sharing. Phase 8 added AI post-processing via OpenRouter for PPTX imports. Phase 9 (Text Insertion & Editor UX) is the current active workstream and includes draggable text blocks, editor polish, and layout/media controls. Phase 10 (Markdown-First Foundation) transitions the platform to an extended-Markdown source of truth, frontmatter and `@area` directives, and slide-level AI patching. Phases 11-15 add an internal content AST, AI operations and output validation, state patches and history, a design system and theme registry, and presenter/print/AI command layers. Phase 16 (Cloud Mode) adds pluggable storage drivers and cloud image uploads.
