# Changelog

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
