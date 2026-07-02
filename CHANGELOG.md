# Changelog

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
- 10 layout presets (focus, two-column, left-heavy, right-heavy, etc.)
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
