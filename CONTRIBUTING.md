# Contributing to SlideMD

Thanks for your interest in contributing to SlideMD. This document covers setup,
quality gates, branch and PR conventions, and testing instructions for external
contributors.

For AI-assistant guidance aimed at coding tools working on this repository, see
[`AGENTS.md`](AGENTS.md). For the AI/tool feature boundary, see
[`docs/ai-positioning.md`](docs/ai-positioning.md). For the release process, see
[`docs/RELEASING.md`](docs/RELEASING.md).

## Prerequisites

- **Node.js** `>=22.12` (Node 22 LTS "Jod" or newer). The repo pins `22.12`
  via `.nvmrc`; run `nvm use` to pick it up automatically.
- **npm** `>=10` (ships with Node 22).
- A Chromium-based browser (Chrome, Edge, Brave) for the File System Access API
  features used in dev. Other browsers can view decks but cannot open or save
  files directly from the filesystem.

## Setup

```bash
git clone https://github.com/hesamat/html-presentation.git
cd html-presentation
npm install
npm run dev
```

`npm run dev` opens http://localhost:8000/index.html and starts two processes:

- **CLI server** (`tools/dev-server.mjs`) — serves the deck API, images, and
  file watching.
- **Vite** — serves the frontend with module transforms and proxies API calls
  to the CLI server.

To open a specific deck:

```bash
npm run dev -- path/to/slides.md
```

## Quality Gates

Run all four checks before opening a PR. They must pass.

```bash
npm run lint
npm run format:check
npm test
npm run build
```

If `npm run format:check` fails, run `npm run format` (or
`npx prettier --write .`) and rerun the check.

### Lint

```bash
npm run lint
```

ESLint flat config lives in `eslint.config.js`. Browser source (`src/**/*.js`,
`deck.js`) gets browser globals; Node tooling (`tools/**/*.mjs`, root `*.mjs`)
gets Node globals only, so accidental use of browser-only APIs like `document`
or `localStorage` in build/dev scripts is reported. Unused variables matching
`^_` are allowed (intentional unused args/caught errors).

### Format

```bash
npm run format:check   # CI check
npm run format         # write fixes
```

Prettier enforces formatting. Do not hand-format code; let Prettier do it.

### Tests

```bash
npm test
```

Tests run on Vitest with a jsdom environment. Specs live in
`src/__tests__/**/*.test.js`. Snapshot tests
(`src/__tests__/ai-prompt-snapshots.test.js`) pin composed AI prompts; update
them deliberately with `npx vitest run -u` and review the diff.

### Build

```bash
npm run build
```

Bundles the example deck via esbuild into `dist/slides.html`. The build must
succeed and produce a self-contained HTML file.

## Branch and PR Conventions

### Branch naming

Use one of these prefixes:

- `fix/` — bug fixes
- `feature/` or `feat/` — new features
- `refactor/` — refactors with no behavioral change
- `release/` — release preparation

One branch per logical change, one PR per branch, short-lived. Branches should
not live longer than ~30 days. A scheduled workflow
(`.github/workflows/branch-cleanup.yml`) deletes branches older than 60 days
with no open PR and closes PRs inactive for 45+ days. Apply the `keep-open` or
`roadmap` label to exempt a branch.

### Opening a PR

- All changes to `main` require a pull request. Never push to `main` directly.
- Keep PRs focused. One logical change per PR.
- Include a clear title and a body that explains the **why**, not just the what.
- When a PR changes user-facing behavior (image loading, `.textpack` opening,
  PPTX import, save/export, editing flows), include a `## Manual Verification`
  (or `## Acceptance Criteria`) section with the exact steps a reviewer should
  perform in the browser. Do not use a generic "manual test" checkbox when
  concrete steps can be provided.
- All quality gates must pass before requesting review.

### After merge

- Branches are deleted automatically after merge if "Automatically delete head
  branches" is enabled in repo settings; otherwise delete the branch manually.
- After any branch deletion, run `git fetch --prune origin` and delete the
  matching local branch.
- Remove worktrees when their PR merges (`git worktree remove <path>`).

## Commit Messages

Use the imperative mood in the subject line:

```text
Fix markdown parser dropping trailing blank lines

The slide splitter treated a trailing blank line as fence content and
dropped it. Preserve it so the last slide keeps its closing whitespace.
```

Do not include `Co-Authored-By:` trailers or `Generated with ...` lines unless
the maintainer asks for them.

## Testing Instructions

### Unit tests

Add or update tests in `src/__tests__/` alongside your change. Tests use
Vitest with jsdom. Name test files `*.test.js` and place them under
`src/__tests__/` mirroring the source path where practical.

When changing AI prompts:

1. Update the prompt files in `src/data/prompts/`.
2. Run `npm test` — the hygiene tests (`ai-prompt-hygiene.test.js`) check that
   composed prompts contain no dangling `{{placeholders}}` and that the layout
   list stays in sync with `src/data/layout-data.js`.
3. Update the snapshot tests (`ai-prompt-snapshots.test.js`) deliberately with
   `npx vitest run -u` and review the diff.
4. Update [`docs/prompt-template.md`](docs/prompt-template.md) and
   [`docs/example/slides.md`](docs/example/slides.md) to reflect prompt or
   layout changes.

### Manual verification

For user-facing changes, verify in the browser before opening the PR:

1. `npm run dev` and open the example deck.
2. Exercise the affected flow (edit, save, export, import, AI refine, etc.).
3. Confirm no console errors and no regressions in adjacent flows.
4. List the exact steps in the PR description under `## Manual Verification`.

### PPTX import fixtures

PPTX import fixtures live in `src/__tests__/fixtures/pptx/` and are generated
by `tools/generate-pptx-fixtures.mjs`. Regenerate with:

```bash
node tools/generate-pptx-fixtures.mjs
```

Do not commit binary `.pptx` files edited by hand; regenerate them from the
script so the fixtures stay small and byte-identical.

## Code Organization

See [`AGENTS.md`](AGENTS.md) for the full source structure and module-by-module
guidance. The short version:

- `src/core/` — core utilities
- `src/data/` — parsing and data (layouts, markdown, deck loader, AI prompts
  and orchestrator, PPTX import)
- `src/editor/` — live editing features (editor core, image, layout,
  navigation, UI panels)
- `src/engine/` — presentation runtime (deck controller, navigation,
  keyboard, breaks, roles)
- `src/renderer/` — display logic (slide renderer, stage scaler, theme
  manager, content enhancer, export, print, notification)
- `src/ui/` — UI actions
- `tools/` — build, dev server, PDF export, fixture generation
- `deck.js` — application entry point

## Questions

- Open an issue for bugs or feature requests.
- See [`ROADMAP.md`](ROADMAP.md) for planned phases and architecture direction.
- See [`docs/ai-positioning.md`](docs/ai-positioning.md) for the AI/tool
  feature boundary.
- See [`docs/prompt-template.md`](docs/prompt-template.md) for the AI prompt
  architecture.
