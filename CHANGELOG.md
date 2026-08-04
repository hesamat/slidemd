# Changelog

## 0.7.6 (2026-08-04)

### AI Provider & Settings

- Add configurable AI providers: OpenRouter, OpenAI, Anthropic, Gemini, Ollama, LM Studio, Custom.
- Validate base URL scheme and host before sending API keys; block non-local `http:` endpoints.
- Persist custom base URL override state so saved endpoints survive reopening Settings.
- Cross-reference OpenRouter reasoning metadata for OpenAI models.
- Fix model list caching across provider switches and reset dropdown scroll position.
- Re-read provider after settings dialog in conversion modal.

### AI Output & Prompts

- Add `AiOutputValidator` with layout, area, and content-rule checks.
- Add `AiPromptComposer` for reusable system/user prompt fragments.
- Split prompts into `system-prompt.md`, `generate-prompt.md`, `fix-prompt.md`.
- Remove duplicate diagram instruction and add success criteria to fix prompt.
- Accept partial fix output after exhausting batch validation retries.
- Surface provider error body in failure messages.

### Security

- Remove `HTTP-Referer` header from AI requests.
- Send Gemini API key via `x-goog-api-key` header instead of URL query string.

### Testing

- Total tests now **654**.

## 0.7.5 (2026-08-04)

### Security

- Harden slide and speaker-note HTML sanitization with DOMPurify and an explicit safe-URI allow-list.
- Escape DOMPurify failures to plain text instead of inserting unsanitized HTML, with a one-time console warning.
- Sanitize editor preview fast-path and exported HTML/JS bundles before writing to the DOM.

### Renderer

- Store Mermaid source as base64 in `data-mermaid-source` to survive DOMPurify's stripping of HTML comment-end sequences.
- Wrap emoji grapheme clusters in `<span class="slide-emoji">` and size them to `0.8em` for consistent heading rendering.
- Scope KaTeX font URL rewriting to KaTeX `@font-face` blocks.

### Export

- Make DOMPurify available in exported HTML bundles and throw if it cannot be fetched.
- Fix Mermaid rendering in exported HTML, bundled dist builds, and PDF generation.
- Fix Google Fonts, syntax highlighting, and KaTeX font loading in standalone HTML exports.
- Make base64 encoding fallible; only add the `b64:` prefix when encoding succeeds.

### Syntax Highlighting

- Align Prism language maps and dependencies across runtime, HTML export, and build script.
- Load `prism-markup-templating` before `prism-php` to resolve `tokenizePlaceholders` runtime error.

### Testing

- Add regression tests for emoji normalization and HTML export hardening.
- Total tests now **612**.

## 0.7.4 (2026-08-03)

### Editor

- Add per-area `area-style-<name>` directive support.
- Right-click an `@area` label to set a background color for that column only.
- Right-click the slide preview to open the Format dropdown as a context menu.

### Infrastructure

- Update `MarkdownParser`, `DeckLoader`, `SlideRenderer`, and related types for per-area styles.

## 0.7.3 (2026-08-02)

### Command Palette

- Add fuzzy command palette for quick access to deck actions (`Ctrl+K` / `Cmd+K`).
- Display keyboard shortcuts next to each command.
- Filter commands by availability and mode (edit/view).

### Full-Text Slide Search

- Add full-text search across slide titles, body content, and speaker notes.
- Open search with `/`, `?`, footer shortcut, or `Ctrl+Shift+F` in edit mode.
- Keyboard navigation and selection in results.

### Editor / Navigation

- Centralize command definitions and key bindings in `src/engine/command-registry.js`.
- Fix command palette visibility while presenting in fullscreen.
- Fix slide-search keyboard focus and Enter selection behavior.

### Dependencies

- Updated npm dependencies.

## 0.7.2 (2026-07-31)

### Text Blocks

- Added multi-column text block support with `::: text-block { column-count=... }`.
- PPTX import wraps long lists in `::: text-block { column-count=... }` instead of `multi-column-list`.
- Pre-render multi-column content with `html: false` to avoid raw HTML injection (XSS).
- Restore `data-source-line` for source-jump on pre-rendered multi-column list items.

### Editor

- Keep all multi-column text blocks out of the text-block edit path to prevent pre-rendered markdown from being flattened to plain text.
- Extract `TextBlockHandler.isMultiColumn()` helper.
- Fix CodeMirror `scrollIntoView` crash by passing the cursor position.

### AI PPTX Fix

- PPTX import waits for background image uploads before running AI Fix, preventing `blob:` URLs from being written to the markdown.
- Fix prompt now explicitly preserves `images/...` paths and `background: url(images/...)` values.

### Styling

- Tightened multi-column text-block spacing to fit more list items.
- Default text-block font size reduced from 32px to 30px.
- Reduced line-height for list items.
- Convert PPTX lettered sublist markers (`a.`, `b.`, etc.) into nested bullets.

### Documentation

- README mentions `::: text-block` multi-column usage.
- Example deck includes a multi-column text-block slide.
- `docs/prompt-template.md` now covers `::: text-block`, `column-count`, image preservation, and a multi-column list example.
- `fix-prompt`, `generate-prompt`, and `system-prompt` updated to preserve and use multi-column text blocks and `images/...` paths.

## 0.7.0 (2026-07-28)

### AI-Powered PPTX Post-Processing

- **OpenRouter Integration**: Connect to OpenRouter API for AI-enhanced slide processing
- **Settings Modal**: Configure API key, model selection, reasoning options, and model search
- **Fix Issues Mode**: AI cleans up formatting, headers, code blocks, and common extraction problems
- **AI Inspiration Mode**: AI reorganizes and redesigns the entire presentation with better flow, layouts, and Mermaid diagrams
- **Streaming Sidebar**: Non-blocking panel shows AI output in real-time while you can still interact with the deck
- **Reasoning Support**: Optional extended thinking for better AI results (model-dependent)
- **Model Selection**: Searchable dropdown with 200+ models from OpenRouter, with reasoning capability detection
- **AI Prompts**: Readable prompt files in `src/data/prompts/` for easy editing

### Focus Layout Improvements

- **Reduced Whitespace**: Header and footer rows reduced from 0.3fr/0.2fr to 0.08fr/0.08fr, giving main content ~92% of slide height
- **Tighter List Spacing**: Bullet point gaps reduced from 10px to 2px in focus layout
- **Centered Lists**: Lists are now properly centered in focus layout

### PPTX Import Improvements

- **AI Post-Processing**: Optional AI enhancement after PPTX import
- **Fix Issues**: Conservative mode that cleans up formatting without restructuring
- **AI Inspiration**: Full redesign mode that reorganizes slides for better flow
- **Diagram Conversion**: `[Diagram: ...]` markers converted to Mermaid code blocks
- **Image Alt Text**: Improved alt text generation for imported images
- **Background Preservation**: Backgrounds and themes preserved through AI processing
- **Flex-row rendering**: Support for flex-row layouts in PPTX import (#140)
- **Set-as-background**: Support for setting images as slide backgrounds (#140)
- **Image upload fix**: Fixed 400 error when no deck loaded (#145)

### HTML Export Fixes

- **Image Inlining**: Images now properly inlined as data URIs in exported HTML
- **Mermaid Rendering**: Mermaid diagrams now render correctly in exported HTML
- **KaTeX Fonts**: Fixed font loading from CDN in exported HTML
- **API Skip**: Skip API fetches and live reload in exported HTML files
- **Module Bundling**: Fixed missing modules in HTML export bundle
- **MERMAID_INIT_OPTIONS**: Inlined constant to fix undefined error

### Documentation

- **AI Prompt Templates**: New documentation for AI post-processing prompts
- **Example Deck**: Added AI post-processing slide to example deck
- **README**: Updated with AI features section under PPTX Import

### Testing

- **HTML Export Tests**: Added 21 tests for HTML export manager
- **Total Tests**: 500+ unit tests across 22 test files

### Bug Fixes

- **wrapLongLists**: Fixed area markers and infinite blank lines being absorbed into multi-column div wrappers
- **Blockquote Linger**: Removed transition causing blockquote to linger on slide change
- **Full-page Tables**: Fixed escapeHtml not being applied, preventing XSS from entity-decoded content
- **AI Sidebar**: Fixed reasoning tokens corrupting JSON parse
- **AI Sidebar**: Fixed scrollbar jumping during streaming
- **AI Sidebar**: Fixed wheel events changing slides during streaming
- **Settings Modal**: Fixed API key hint showing incorrectly
- **Settings Modal**: Fixed model dropdown not closing on outside click
- **Settings Modal**: Fixed checkbox state not updating after API key save
- **Conversion Modal**: Fixed duplicate AI button on re-import
- **PPTX Export**: Fixed two-column layout detection for wide elements
- **HTML Export**: Fixed EditController and MERMAID_INIT_OPTIONS not defined errors
- **Image Picker**: Restored ImagePicker modal with Existing/Upload/URL tabs (#142)
- **Image Float**: Restored image float feature (#142)
- **PPTX Import**: Flex-row rendering and set-as-background fixes (#140)
- **Titles**: Sanitize markdown from deck/slide titles (#144)
- **PPTX Upload**: Fixed 400 error when no deck loaded (#145)
- **Area Overflow**: Fixed overflow warning not hiding on fix and fit-to-column spacing (#146)

## 0.6.1 (2026-07-26)

### Bug Fixes

- Fix example deck images, mermaid in PDF, and consistent naming (#136)
- Fix example deck loading, image handling, and PPTX import UX (#137)

## 0.6.0 (2026-07-24)

### CLI Dev Server

- New lightweight Node.js CLI dev server (`tools/dev-server.mjs`) with SSE live reload
- Accepts `.md` files with auto-discovered `images/` sidecar folder
- Accepts `.textpack` ZIP archives, extracts to temp directory
- HTTP API: `GET /api/deck`, `POST /api/deck`, `POST /api/deck/load`, `GET /api/images`, `POST /api/upload-image`, `GET /api/events`
- File watching on `.md` and `images/` with 100ms debounce
- Human-readable upload filenames (`architecture-a3f2.png`)
- Path traversal protection and CORS headers

### Primary Format: `.md + images/`

- Plain Markdown files with sidecar `images/` folder as the primary deck format
- Images referenced with relative paths (`images/foo.png`)
- Images served by CLI dev server during development
- Diffable in git, no binary bundles

### `.textpack` Export

- New export format: ZIP archive containing `text.markdown` + `assets/` folder
- HTML-to-markdown conversion for slide content (mermaid, images, formatting)
- Fetches referenced images and embeds in ZIP with STORE compression
- Accessible from the export menu

### Open Deck Modal

- Replaced `.smd` with `.textpack` support
- `.textpack` opening: extracts ZIP, reads markdown, extracts assets to object URLs
- `.md` file support via File System Access API
- Recent deck click handler is now async with File System Access API fallback

### Image Handling

- `DeckImagesResolver` now resolves images via HTTP (`/images/foo.png`), no blob URLs
- Removed in-memory blob URL caching and lifecycle management
- PPTX import uploads extracted images via `POST /api/upload-image`
- PPTX import notification changed from "Save as .smd" to success message

### Save Manager

- Primary save via `POST /api/deck` to CLI dev server (writes directly to disk)
- Fallback to `showSaveFilePicker` / blob download when no CLI server
- Removed `.smd` ZIP generation on save

### Deck Loader

- API-first loading: tries `GET /api/deck`, then embedded JSON, then welcome deck
- Removed IndexedDB draft recovery flow
- `loadRecentDeck()` tries localStorage cache, then File System Access API file handle registry
- `openExampleFile()` fetches `docs/example/slides.md` as plain text

### Build Script

- Removed `.smd` (ZIP) input support, reads plain `.md` files only
- Auto-discovers `images/` directory and inlines as data URIs
- Removed JSZip dependency from build

### BREAKING: Removed `.smd` Format

- Deleted `src/core/smd-handler.js` and tests
- Deleted `docs/example.smd` (replaced by `docs/example/slides.md` + `images/`)
- Deleted `tools/build-example-smd.mjs` and `tools/inspect-smd.mjs`
- Removed all `.smd` references from codebase

### Image Drag Reorder and Alignment

- New `ImageDragController` for cross-area drag with drop-gap indicators and reorder in markdown
- New `ImageMarkdownUtils` for image markdown manipulation
- New `ImagePositionPresets` for positioning presets
- Interact.js powered draggable setup with resize handles
- Cap image size presets to column width; enable cross-column drag

### PPTX Import Improvements

- **Layout detection improvements**: better heading threshold detection using font size
- **Per-deck folder structure and editable filename**: organized imported deck files
- **Code block detection**: auto-convert on file select, language tag regex fixes
- **Dominant image handling**: auto-detect dominant images, filter tiny decorative images
- **Chart data tables** and diagram rendering as markdown lists
- **TIFF image support** via utif2
- **Keep-backgrounds checkbox** and image import checkbox in conversion modal
- **Header detection improvements**: markdown markers, font-size thresholds, bold subheadings
- Blocking loading modal during save operation

### Notification System Redesign

- Bottom-center snackbar-style toasts replacing native alerts
- `Notification.critical()` with blurred backdrop and cancel confirmation
- Fullscreen-aware: re-parents to fullscreenElement when active
- Blocking notifications with overlay and shake feedback
- Max 4 visible toasts with queue system

### UI/UX Improvements

- Toggle dashed area outlines with Columns button
- Full-height media column for better image display
- Simplified image editor panel
- Increased slide area bounding box border on edit mode
- Image drag reorder with cross-area support and drop-gap indicators

### Bug Fixes

**PPTX Conversion Fixes:**

- Skip white backgrounds during PPTX conversion
- Adjust group child positions during flattening
- Require text on both sides for two-column layout
- Require substantial body text for two-column layout
- Only use two-column for dominant images when body text exists
- Reject long text as headers in PPTX conversion (max 60 chars)
- Use H2 for all headings; omit dimensions for single-image slides
- Use H2 for bold subheadings; add space after closing bold markers
- Escape hash at start of lines so PPTX text like `# Print` is preserved
- Preserve angle brackets in code blocks; merge consecutive backtick lines
- Bullet lists at top of slide should not be treated as header
- Preserve spaces around italic spans; fix btoa unicode error
- Skip code blocks in header detection; language tag only on opening fences
- Skip `#` escaping inside code blocks; only escape in non-monospace text
- Prevent font-size detection from heading long text
- Apply length check to markdown-detected headings too
- Correct image dimension conversion; filter tiny decorative images
- Correct image dimension preservation when clicking HTML img tags with explicit dimensions

**Image Handling Fixes:**

- Fix image rotation wraparound (negative values)
- Fix portrait image fit-to-width sizing
- Fix image fit proportions
- Preserve HTML image width/height attributes when clicked in editor

**Editor Fixes:**

- Fix edit-mode keyboard shortcuts: global undo/redo and no-preview-blink
- Code blocks size to content with no scrollbar
- Improve area handling for layout switches and context menu
- Title decoration still disabled when only border width cleared
- Suppress duplicate slide refresh when toggling per-slide theme
- Title decoration stays disabled after removing borders; theme-aware border color
- Allow cancelling the saving deck dialog during PPTX import
- Prompt user for File System API permission on load
- Restore edit mode area outlines and fix content overflow
- Strip markdown bold/italic markers from slide thumbnail titles
- Preserve indentation inside fenced code blocks in formatTextElement
- Add footer area to title-slide layout
- Fix markdown editor suppressChange reset on exceptions
- Ensure setValue propagates preview updates
- Make notifications fullscreen-aware

### Infrastructure / Refactoring

- Refactor: decouple edit-controller via dependency injection
- Refactor: split pptx-extractor into smaller modules
- Refactor: code-review fixes, duplicate logic cleanup
- New test files added (12 new test files)
- Major test expansions for pptx-extractor.test.js and pptx-to-slide-md.test.js
- New core modules: draft-manager.js
- New editor modules: slide-preview-updater.js, style-applier.js, source-jump-handler.js, directive-utils.js, area-context-menu.js
- New image modules: image-drag-controller.js, image-markdown-utils.js, image-position-presets.js
- New modules: textpack-export-manager.js, dev-server.mjs, dev.mjs
- New CSS: notification.css (expanded)
- Updated AGENTS.md with new editor sub-module architecture documentation
- Package dependencies updated

## 0.5.0 (2026-07-02)

### PPTX Import

- Added rule-based PPTX to SlideMD conversion
- Import PPTX via menu item with conversion modal and progress spinner
- Preserves headings, bold/italic formatting, lists (including nested), tables, and images
- Extracts images from PPTX and saves to deck folder via File System Access API
- Auto-trims transparent margins from EMF-converted images
- Opens edit mode after conversion; prompts user to pick save directory

### Image Editing

- Removed image snapping behavior (snap-to-grid and sibling images)
- Removed trim transparency feature from image properties panel
- Fixed image deletion index mismatch and slide preview update

### Bug Fixes

- Fixed slide theme toggle not working
- Fixed bold/italic formatting in PPTX extraction (triple-asterisk markers, entity decoding, whitespace-only markers)
- Fixed span merge dropping content and nbsp leaking into markers
- Fixed nested list depth tracking and double-dash bullets
- Fixed title slide detection and image paths per deck namespace
- Fixed CSS bullet detection and centered element column detection
- Fixed image expand on click in edit mode
- Fixed element ordering in PPTX conversion
- Fixed QuotaExceededError for large decks with embedded images

### Infrastructure

- Grouped main menu items and fixed PPTX label typo
- Added unit tests for image deletion logic

## 0.4.0 (2026-06-29)

### Testing & Type Safety

- Added 107 new unit tests across 5 test files (218 total)
- Added integration test for full deck pipeline (markdown → parse → normalize)
- Added JSDoc type annotations to core modules (asset-loader, element-gatherer, directory-handle-store, markdown-parser, deck-loader)
- Created `src/types.js` with shared `@typedef` definitions (Slide, Deck, DeckMeta, Layout, DirectiveResult, AreaParseResult, DirectoryMode, GatheredElements)

### UI Polish

- Moved slide up/down from inline arrows to right-click context menu on thumbnails
- Added `Alt+Shift+ArrowUp` / `Alt+Shift+ArrowDown` keyboard shortcuts for moving slides
- Removed slide actions dropdown from thumbnails header (actions available via context menu and keyboard)
- Added "Right-click for options" hover tooltip on slide thumbnails
- Added keyboard activation on thumbnails (Enter/Space to navigate, ContextMenu/Shift+F10 for context menu)
- Re-hid focus layout from layout picker (duplicate of header-content)

### AI Generation Removal

- Removed entire AI slide generation feature (course profiles, lecture plans, deck generation)
- Deleted 10 source files, 3 CSS files, and 1 UI file (~4,500 lines removed)
- Moved New Presentation Modal to `src/editor/` (not AI-related)
- Removed AI menu items: Course Profiles, AI Configuration, Generate Deck
- Removed AI generation from package.json description and keywords

### Prompt Unification

- Merged `docs/prompt-template.md` and `docs/prompts/lecture-deck-prompt.md` into single unified prompt template
- Removed `docs/prompts/` directory

### Documentation Updates

- Removed AI Generation section from README.md
- Removed AI Generation slide from docs/example.md
- Removed AI Generation section from AGENTS.md
- Updated ROADMAP.md with Phase 5 completion

### Bug Fixes

- Fixed image properties panel: size presets (Small/Medium/Large) now respect aspect ratio lock

## 0.3.0 (2026-06-28)

### New Presentation Modal

- Added stepper wizard for creating new presentations (Template → Background → Styling)
- Template selection: blank, standard, lecture starter decks
- Background picker with color mode, solid color, and image options
- Styling panel with header style, border, and code block options
- Image support in background picker with drag/resize

### Slide Style Panel

- Added slide-specific styling with image background support
- Shared style helpers module (41 unit tests)
- Deduplicated panel CSS across editors

### Bug Fixes

- Fixed DeckImagesResolver not initialized when picking image in Slide Style Panel
- Fixed background not applied in edit mode
- Fixed premature live apply from Slide Style Panel
- Fixed event listener leak in style panels
- Fixed dark theme tables and mermaid styling

### Infrastructure

- Added 41 unit tests for style-helpers.js
- Extracted shared style helpers for code reuse

## 0.2.0 (2026-06-26)

### Build Modernization

- Migrated build script from regex-based ESM bundler to esbuild
- Bundle Mermaid locally (no more CDN dependency in dist builds)
- Added source maps for dist builds
- Removed terser dependency (esbuild handles minification)
- Fixed KaTeX auto-render initialization (deferred until DOM ready)
- Fixed @title/@header area aliasing in build-time parser
- Disabled markdown-it linkify to prevent auto-linking filenames
- Removed manifest/icon link tags from dist (CORS errors under file://)

## 0.1.0 (2026-06-26)

### Features

- Live Markdown editor with CodeMirror 6
- Presenter view with break timer
- 7 layout presets (title-slide, header-content, two-column, media-span, left-heavy, right-heavy, three-column)
- Custom CSS grid layouts
- Dark/light theme support (app and per-slide)
- Syntax highlighting via PrismJS
- Math rendering via KaTeX
- Mermaid diagram support
- Image insertion with drag/resize
- AI-powered deck generation (GLM/Zhipu AI, OpenRouter)
- Course profile management
- Lecture plan generation
- Export to standalone HTML
- Export to PDF via Playwright
- Click-to-source from preview to editor
- Slide thumbnails with context menu
- Keyboard shortcuts for all operations

### Infrastructure

- ESLint 10 with flat config (minimal rules)
- Prettier for code formatting
- Vitest with 70 unit tests
- GitHub Actions CI with lint, format, test, build, and PDF steps
- Modular architecture (61 source files across 7 directories)

### Documentation

- Comprehensive README with features, shortcuts, and layout presets
- Example deck showcasing all features
- AI generation prompt template
- Refactoring documentation
