# Agent Instructions

User-facing documentation lives in [README.md](README.md) and [docs/example/slides.md](docs/example/slides.md). This file contains only AI-assistant guidance for working on the codebase.

## Git Workflow

- **ALWAYS** suggest a git commit command after completing any code change. Check what is staged and what is not before that.
- Before marking a task complete, ask yourself: "Did I suggest a commit?"
- Never include `Co-Authored-By:` trailer in commit messages.
- The main branch is `main`; feature branches should follow `feature/` or `fix/` convention.
- All changes to `main` require a pull request (branch protection enabled).
- **Do NOT automatically merge PRs.** Always wait for the user to review and merge.

## Quality Gates

Before committing, run these checks locally:

```bash
npm run lint          # ESLint (errors only)
npm run format:check  # Prettier formatting
npm test              # Vitest unit tests
npm run build         # Build script
```

All four must pass. If `npm run format:check` fails, run `npx prettier --write .` to fix.

**Important**: Before running quality gates, verify the feature actually works by testing it in the browser or inspecting the code logic. Do NOT run the full lint/format/test/build cycle prematurely — it wastes time when the code still has issues.

## Code Organization

### Source Structure ([src/](src))

- **core/** - Core utilities (asset-loader, element-gatherer, utils, directory-handle-store, mermaid-config)
- **data/** - Data parsing (layout-data, layout-parser, markdown-parser, deck-loader, layouts.json)
- **editor/** - Live editing features
  - **core/** - Edit controller, markdown editor, slide thumbnails, slide operations, slide preview updater, style applier, source jump handler, directive utils, edit state manager
  - **image/** - Image picker, inserter, interaction handler, properties panel, background handler, deck images resolver
  - **layout/** - Layout picker, layout manager, grid resizer, grid resizer manager
  - **navigation/** - Area navigation, area guide manager, slide warning manager
  - **ui/** - Background picker, insert dropdown, mermaid helper, panel resizer, save manager, slide style panel, theme manager
- **engine/** - Presentation logic (deck-controller, slide-navigator, keyboard-handler, break-manager, reload-manager, role-manager, wheel-handler, freeze-manager)
- **renderer/** - Display logic (slide-renderer, stage-scaler, theme-manager, content-enhancer, html-export-manager, print-manager, notification)
- **ui/** - UI actions (ui-actions)

### Entry Points

- [index.html](index.html) - Main deck page (dev mode)
- [deck.js](deck.js) - Application entry point and orchestrator
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

- Edit controller: [src/editor/core/edit-controller.js](src/editor/core/edit-controller.js) — orchestrator, delegates to sub-modules
- Slide preview updater: [src/editor/core/slide-preview-updater.js](src/editor/core/slide-preview-updater.js) — parses markdown and re-renders slide preview
- Style applier: [src/editor/core/style-applier.js](src/editor/core/style-applier.js) — applies style directives to all slides
- Source jump handler: [src/editor/core/source-jump-handler.js](src/editor/core/source-jump-handler.js) — click-to-jump markdown source
- Markdown editor: [src/editor/core/markdown-editor.js](src/editor/core/markdown-editor.js)
- Layout picker: [src/editor/layout/layout-picker.js](src/editor/layout/layout-picker.js)
- Slide thumbnails: [src/editor/core/slide-thumbnails.js](src/editor/core/slide-thumbnails.js)
- Image handling: [src/editor/image/](src/editor/image/)
- Grid resizer: [src/editor/layout/grid-resizer.js](src/editor/layout/grid-resizer.js)

#### Editor Sub-Module Architecture

All editor sub-modules use **dependency injection** — they receive only the specific dependencies they need via constructor parameters, not the full EditController instance. Mutable state is accessed via getter functions (e.g., `getCurrentSlideIndex`), and cross-module actions are passed as callbacks (e.g., `onPreviewUpdate`). The EditController constructor wires everything together.

Pattern for new sub-modules:

```javascript
export class NewModule {
  /**
   * @param {object} opts
   * @param {() => Type} opts.getSomething  — getter for mutable state
   * @param {(arg: Type) => void} opts.onAction  — callback for actions
   */
  constructor({ getSomething, onAction }) {
    this._getSomething = getSomething;
    this._onAction = onAction;
  }
}
```

## Common Tasks

- **Add a new layout preset**: Add to [src/data/layout-data.js](src/data/layout-data.js)
- **Modify deck content**: Edit [docs/example/slides.md](docs/example/slides.md)
- **Change build input**: Update argument in [tools/build.mjs](tools/build.mjs)
- **Add a rendering feature**: Enhance [src/renderer/content-enhancer.js](src/renderer/content-enhancer.js) or [src/renderer/slide-renderer.js](src/renderer/slide-renderer.js)
- **Add keyboard shortcut**: Modify [src/engine/keyboard-handler.js](src/engine/keyboard-handler.js)

## AI Prompt Engineering (2026 Best Practices)

AI prompts live in [src/data/prompts/](src/data/prompts/). There are three prompts used by the AI enhancement feature:

| File                 | Role     | Purpose                                             |
| -------------------- | -------- | --------------------------------------------------- |
| `system-prompt.md`   | `system` | Global rules, structure, formatting                 |
| `generate-prompt.md` | `user`   | Creative reorganization task + `{{markdown}}` input |
| `fix-prompt.md`      | `user`   | Conservative cleanup task + `{{markdown}}` input    |

User-facing documentation: [docs/prompt-template.md](docs/prompt-template.md) (layout syntax, area markers, examples) and [docs/example/slides.md](docs/example/slides.md) (example deck). The AI prompts used by the enhancement feature live in [src/data/prompts/](src/data/prompts/).

### Architecture Rules

- **Do NOT duplicate** rules across system and user prompts. The `system` role already sets immutable rules; repeating them in `user` prompts wastes tokens and creates version skew risk. Task-specific guidance belongs in the user prompt only.
- **Put constraints before creative freedom** in user prompts: Formatting Rules → Content Strategy → Creative Guidelines → Input. This prevents the model from generating creative output that violates structural rules.
- **Keep prompts focused**: The system + user prompts should not exceed ~150 combined lines of instructions. Beyond that, signal-to-noise ratio drops.

### Writing Rules

- **Prefer positive instructions** over negative ones. Say "Use only content present in the input" instead of "Do NOT invent content". Models simulate forbidden behaviors to understand them, which can increase their likelihood.
- **Limit strong negative directives** ("NEVER", "Do NOT") to ~5 per prompt. Current count across all three prompts is ~12 total (system: 4, generate: 2, fix: 2) — well within the per-prompt target.
- **Place the most critical rules first** — the model weights earlier instructions more heavily.
- **Add success criteria** at the end of each prompt so the model can self-check.

### Modification Checklist

1. Check all three prompts for consistency — a change to one rule may need updates in the others
2. Run `npm test` — AI enhancer tests verify prompt processing
3. Verify the combined system + user prompt length stays under 150 lines
4. Count strong negative directives ("NEVER", "Do NOT"); aim for ≤5 per prompt
5. Keep both layout lists in sync: `system-prompt.md` rule line 18 and layout table
6. Reflect changes in user docs: [docs/prompt-template.md](docs/prompt-template.md) and [docs/example/slides.md](docs/example/slides.md)

## Known Issues

- **`nul` file on Windows**: The `.gitignore` previously contained `nul` which created an untracked file that cannot be deleted via normal Windows commands (it's a reserved device name). This was removed from `.gitignore` but the file may still appear in `git status`. Ignore it.
- **PowerShell quoting**: The `gh` CLI and `npm` commands with special characters (parentheses, quotes) fail in PowerShell. Use `cmd /c` wrapper or write content to temp files and use `--body-file`, `-F` flags.
- **npm via PowerShell**: `npm.ps1` is blocked by execution policy on this system. Use `cmd /c "npm ..."` to run npm commands.
