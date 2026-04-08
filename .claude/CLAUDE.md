# Project-Specific Instructions

User-facing documentation lives in [README.md](README.md) and [docs/example.md](docs/example.md). This file contains only AI-assistant guidance for working on the codebase.

## Git Workflow
- **ALWAYS** suggest a git commit command after completing any code change. Check what is staged and what is not before that.
- Before marking a task complete, ask yourself: "Did I suggest a commit?"
- Never include `Co-Authored-By:` trailer in commit messages.
- The main branch is `main`; feature branches should follow `feature/` or `fix/` convention

## Code Organization

### Source Structure ([src/](src))
- **core/** - Core utilities (asset-loader, element-gatherer, utils)
- **data/** - Data parsing (layout-data, layout-parser, markdown-parser, deck-loader)
- **editor/** - Live editing features (markdown-editor, edit-controller, layout-picker, slide-thumbnails)
- **engine/** - Presentation logic (deck-controller, slide-navigator, keyboard-handler, break-manager, reload-manager, role-manager, wheel-handler, freeze-manager)
- **renderer/** - Display logic (slide-renderer, stage-scaler, theme-manager, content-enhancer, html-export-manager, print-manager, notification)
- **generation/** - AI-powered slide generation (deck-generator, outline-generator, ai-provider-registry, course-profile-manager)
- **ui/** - UI actions (ui-actions)

### Entry Points
- [index.html](index.html) - Main deck page (dev mode)
- [src/main.js](src/main.js) - Application entry point
- [tools/build.mjs](tools/build.mjs) - Build script
- [tools/pdf.mjs](tools/pdf.mjs) - PDF export script

## Development Guidelines

### Core Principles
1. **Deterministic rendering**: All positioning uses the 1920x1080 coordinate system
2. **Offline-first**: Build script inlines all assets; no runtime CDN dependencies
3. **No reflow on resize**: Use [stage-scaler.js](src/renderer/stage-scaler.js) for letterboxing/pillarboxing
4. **Markdown-driven**: Deck content comes from parsed Markdown files

### When Working with Layouts
- Layout definitions are in [src/data/layout-data.js](src/data/layout-data.js)
- Use CSS grid strings; consider adding presets for common patterns
- Area markers route content to specific grid regions
- Text before first `@area` marker flows into `@main`

### When Working with Themes
- Theme management is in [src/renderer/theme-manager.js](src/renderer/theme-manager.js)
- Themes can be set per-slide via `theme:` frontmatter

### When Working with Export
- **App UI HTML export**: [src/renderer/html-export-manager.js](src/renderer/html-export-manager.js)
- **App UI PDF export**: [src/renderer/print-manager.js](src/renderer/print-manager.js)
- **Build script HTML**: [tools/build.mjs](tools/build.mjs)
- **Build script PDF**: [tools/pdf.mjs](tools/pdf.mjs) - Uses Playwright for headless PDF generation

### When Working with Editor Features
- Live editing: [src/editor/markdown-editor.js](src/editor/markdown-editor.js)
- Layout picker: [src/editor/layout-picker.js](src/editor/layout-picker.js)
- Slide thumbnails: [src/editor/slide-thumbnails.js](src/editor/slide-thumbnails.js)

### When Working with AI Generation
- Deck generation from outlines: [src/generation/deck-generator.js](src/generation/deck-generator.js)
- Outline generation: [src/generation/outline-generator.js](src/generation/outline-generator.js)
- AI provider registry: [src/generation/ai-provider-registry.js](src/generation/ai-provider-registry.js)
- Course profiles: [src/generation/course-profile-manager.js](src/generation/course-profile-manager.js)

## Common Tasks
- **Add a new layout preset**: Add to [src/data/layout-data.js](src/data/layout-data.js)
- **Modify deck content**: Edit [docs/example.md](docs/example.md)
- **Change build input**: Update argument in [tools/build.mjs](tools/build.mjs)
- **Add a rendering feature**: Enhance [src/renderer/content-enhancer.js](src/renderer/content-enhancer.js) or [src/renderer/slide-renderer.js](src/renderer/slide-renderer.js)
- **Add keyboard shortcut**: Modify [src/engine/keyboard-handler.js](src/engine/keyboard-handler.js)
