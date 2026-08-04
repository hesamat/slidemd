# Agent Instructions

User-facing documentation lives in [README.md](README.md) and [docs/example/slides.md](docs/example/slides.md). This file contains only AI-assistant guidance for working on the codebase.

## Hard Rules — Always On

1. **Git history and git commands are off-limits unless the user explicitly says so.**
   - Suggest the exact `git add`, `git commit`, and `git push` commands in a code block.
   - Wait for the user to run them.
   - Only execute these commands when the user explicitly says the words "commit" and/or "push".
   - Do **not** automatically merge pull requests.
   - The main branch is `main`; branches use `fix/`, `feature/`, `feat/`, or `refactor/` prefixes. All changes to `main` require a pull request.
   - Never include a `Co-Authored-By:` trailer in commit messages.

2. **Do not perform destructive, irreversible, or side-effecting actions without explicit user approval.**
   - This includes deleting files/directories, dropping database tables, force-pushing, rewriting git history, sending emails, making payments, or calling APIs with real-world side effects.
   - When in doubt, stop and ask.

3. **Do not log, write, or commit secrets, keys, or credentials.**

4. **Do not use emojis in code or communication unless the user explicitly asks for them.**

## Quality Gates

Before committing (only when asked to commit), run these checks in this order:

```bash
npm run lint          # ESLint (errors only)
npm run format:check  # Prettier formatting
npm test              # Vitest unit tests
npm run build         # Build script
```

All four must pass. If `npm run format:check` fails, run `npx prettier --write .` to fix.

Do not run the full gate cycle prematurely — first verify the feature actually works by testing in the browser or inspecting the code logic.

## Code Organization

### Source Structure ([src/](src))

- **core/** — Core utilities (asset-loader, element-gatherer, utils, directory-handle-store, mermaid-config)
- **data/** — Data parsing (layout-data, layout-parser, markdown-parser, deck-loader, layouts.json)
- **editor/** — Live editing features
  - **core/** — Edit controller, markdown editor, slide thumbnails, slide operations, slide preview updater, style applier, source jump handler, directive utils, edit state manager
  - **image/** — Image picker, inserter, interaction handler, properties panel, background handler, deck images resolver
  - **layout/** — Layout picker, layout manager, grid resizer, grid resizer manager
  - **navigation/** — Area navigation, area guide manager, slide warning manager
  - **ui/** — Background picker, insert dropdown, mermaid helper, panel resizer, save manager, slide style panel, theme manager
- **engine/** — Presentation logic (deck-controller, slide-navigator, keyboard-handler, break-manager, reload-manager, role-manager, wheel-handler, freeze-manager)
- **renderer/** — Display logic (slide-renderer, stage-scaler, theme-manager, content-enhancer, html-export-manager, print-manager, notification)
- **ui/** — UI actions (ui-actions)

### Entry Points

- [index.html](index.html) — Main deck page (dev mode)
- [deck.js](deck.js) — Application entry point and orchestrator
- [tools/build.mjs](tools/build.mjs) — Build script
- [tools/pdf.mjs](tools/pdf.mjs) — PDF export script

### When Working with Layouts

- Layout definitions are in [src/data/layout-data.js](src/data/layout-data.js). Built-in presets live in [src/data/layouts.json](src/data/layouts.json); user-created custom layouts are persisted in `localStorage` under `webdeck:custom-layouts`.
- `layout:` accepts either a preset name or a CSS `grid-template` shorthand string with quoted area names, e.g. `layout: "header header" "main media" / 2fr 1fr`.
- Area markers route content to specific grid regions; the `@` name must match a name in the `layout:` grid.
- Text before the first `@area` marker flows into `@main`.
- The Layout Picker's `Custom` tile lets users save named grid strings to `localStorage` and reuse them across decks.

### When Working with Themes

- Theme management is in [src/renderer/theme-manager.js](src/renderer/theme-manager.js)
- Themes can be set per-slide via `theme:` frontmatter

### When Working with Export

- **App UI HTML export**: [src/renderer/html-export-manager.js](src/renderer/html-export-manager.js)
- **App UI PDF export**: [src/renderer/print-manager.js](src/renderer/print-manager.js)
- **Build script HTML**: [tools/build.mjs](tools/build.mjs)
- **Build script PDF**: [tools/pdf.mjs](tools/pdf.mjs) — Uses Playwright for headless PDF generation

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

All editor sub-modules use **dependency injection** — they receive only the specific dependencies they need via constructor parameters, not the full `EditController` instance. Mutable state is accessed via getter functions (e.g., `getCurrentSlideIndex`), and cross-module actions are passed as callbacks (e.g., `onPreviewUpdate`). The `EditController` constructor wires everything together.

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

## Development Guidelines

### Core Principles

1. **Deterministic rendering**: All positioning uses the 1920x1080 coordinate system.
2. **Offline-first**: Build script inlines all assets; no runtime CDN dependencies.
3. **No reflow on resize**: Use [stage-scaler.js](src/renderer/stage-scaler.js) for letterboxing/pillarboxing.
4. **Markdown-driven**: Deck content comes from parsed Markdown files.

## Common Tasks

- **Add a new layout preset**: Add to [src/data/layout-data.js](src/data/layout-data.js)
- **Modify deck content**: Edit [docs/example/slides.md](docs/example/slides.md)
- **Change build input**: Update argument in [tools/build.mjs](tools/build.mjs)
- **Add a rendering feature**: Enhance [src/renderer/content-enhancer.js](src/renderer/content-enhancer.js) or [src/renderer/slide-renderer.js](src/renderer/slide-renderer.js)
- **Add or change a keyboard shortcut**: Update [src/engine/keyboard-shortcuts.js](src/engine/keyboard-shortcuts.js), then run the quality gates

## AI Prompt Engineering (2026 Best Practices)

AI prompts live in [src/data/prompts/](src/data/prompts/):

| File                 | Role     | Purpose                                             |
| -------------------- | -------- | --------------------------------------------------- |
| `system-prompt.md`   | `system` | Global rules, structure, formatting                 |
| `generate-prompt.md` | `user`   | Creative reorganization task + `{{markdown}}` input |
| `fix-prompt.md`      | `user`   | Conservative cleanup task + `{{markdown}}` input    |

### Prompt Rules

- **Do NOT duplicate** rules across `system` and `user` prompts.
- **Put constraints before creative freedom** in user prompts.
- **Keep prompts focused** — system + user prompts should not exceed ~150 combined lines.
- **Prefer positive instructions** over negative ones.
- **Limit strong negative directives** ("NEVER", "Do NOT") to ~5 per prompt.
- **Place the most critical rules first**.
- **Add success criteria** at the end of each prompt.

### Modification Checklist

1. Check all three prompts for consistency.
2. Run `npm test` — AI enhancer tests verify prompt processing.
3. Verify the combined system + user prompt length stays under 150 lines.
4. Count strong negative directives; aim for ≤5 per prompt.
5. Keep both layout lists in sync.
6. Reflect changes in [docs/prompt-template.md](docs/prompt-template.md) and [docs/example/slides.md](docs/example/slides.md).

## Renderer Hardening

- All user-authored Markdown HTML assigned to `SlideRenderer` slide areas is sanitized with `DOMPurify` before `innerHTML` is set. Mermaid SVG output and hardcoded UI `innerHTML` strings are trusted library/output markup and are not sanitized.
- `ContentEnhancer` is exposed on `window` so the runtime, exported HTML, and PDF paths can all call the same `ContentEnhancer.enhanceRenderedContent(...)` entry point.

## Known Issues

- **`nul` file on Windows**: The `.gitignore` previously contained `nul` which created an untracked file that cannot be deleted via normal Windows commands (it's a reserved device name). This was removed from `.gitignore` but the file may still appear in `git status`. Ignore it.
- **PowerShell quoting**: The `gh` CLI and `npm` commands with special characters (parentheses, quotes) fail in PowerShell. Use `cmd /c` wrapper or write content to temp files and use `--body-file`, `-F` flags.
- **npm via PowerShell**: `npm.ps1` is blocked by execution policy on this system. Use `cmd /c "npm ..."` to run npm commands.

## Pull Requests

When a PR changes user-facing behavior (image loading, `.textpack` open, PPTX import, save/export, editing flows, etc.), include the specific manual/browser verification steps in the PR description. Use the `## Acceptance Criteria` or `## Manual Verification` section to list the exact actions to perform, not just a generic "manual test" checkbox.
