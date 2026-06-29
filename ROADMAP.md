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

---

## Phase 7: AI Presentation Conversion

Goal: Convert existing presentations (PPTX, PDF, Google Slides) to SlideMD format using AI. Users provide their own API key.

### Core

| Task                                   | Details                                                   |
| -------------------------------------- | --------------------------------------------------------- |
| [ ] AI provider config modal           | API key input (OpenAI, OpenRouter), model selector, test  |
| [ ] PPTX text extraction               | Parse PPTX XML, extract text, shapes, images, slide order |
| [ ] SlideMD generation via AI          | Send extracted content + layout docs to LLM, get markdown |
| [ ] Conversion modal (upload → review) | File upload, progress, preview before apply               |
| [ ] Image extraction from PPTX         | Extract embedded images, save to deck, update references  |
| [ ] Error handling and retry           | Truncation recovery, rate limit backoff, user feedback    |

### Prompt Templates

| Task                               | Details                                                     |
| ---------------------------------- | ----------------------------------------------------------- |
| [ ] Expand docs/prompt-template.md | Add conversion-specific prompt (PPTX → SlideMD)             |
| [ ] Add reusable prompt snippets   | Layout selection rules, code example style, activity format |

### Post-Conversion

| Task                                | Details                                            |
| ----------------------------------- | -------------------------------------------------- |
| [ ] Edit mode integration           | Load converted deck into editor for manual cleanup |
| [ ] Unit tests for extraction logic | PPTX parser, slide mapping, image extraction       |

---

## Phase 8: Cloud Mode

Goal: Enable multi-device editing, cloud image storage, and authenticated access.

### Architecture

- **Storage adapter pattern**: editor uses relative paths (`./images/slide.png`) in both modes
- **Local mode**: paths resolve to local filesystem (current behavior, no server needed)
- **Cloud mode**: images uploaded to cloud storage, paths rewritten to URLs behind the scenes
- **No Amazon services** — use Cloudflare R2 for storage

### Image Storage

| Task                                          | Details                                  |
| --------------------------------------------- | ---------------------------------------- |
| [ ] Set up Cloudflare R2 bucket               | Free tier: 10GB storage, 10M reads/mo    |
| [ ] Create StorageAdapter interface           | Abstract local vs cloud image paths      |
| [ ] Implement R2StorageAdapter                | Upload, delete, URL generation           |
| [ ] Update image picker to use adapter        | Transparent to user, paths stay relative |
| [ ] Handle image deletion (cascade from deck) | Clean up orphaned images                 |

### Authentication & Access Control

| Task                                            | Details                               |
| ----------------------------------------------- | ------------------------------------- |
| [ ] Choose auth provider (Clerk, Auth.js, etc.) | Prefer self-hosted or edge-compatible |
| [ ] Implement sign-up / sign-in flow            | Email + OAuth (Google, GitHub)        |
| [ ] Add deck sharing with permission levels     | Owner / editor / viewer roles         |
| [ ] Add access tokens for API requests          | For programmatic access               |

### Cloud File Sync

| Task                                             | Details                                     |
| ------------------------------------------------ | ------------------------------------------- |
| [ ] Design deck storage schema                   | Deck metadata + markdown + image references |
| [ ] Implement deck CRUD API                      | Create, read, update, delete decks          |
| [ ] Add real-time sync (WebSocket or polling)    | Multi-device live updates                   |
| [ ] Add offline support (service worker + cache) | Edit offline, sync when online              |

### Deployment

| Task                                        | Details                             |
| ------------------------------------------- | ----------------------------------- |
| [ ] Deploy web app to Vercel/Netlify        | Static frontend                     |
| [ ] Deploy API (Workers or serverless)      | Cloudflare Workers for edge compute |
| [ ] Set up custom domain + SSL              |                                     |
| [ ] Add environment config (R2, auth, etc.) |                                     |

### UX

| Task                                          | Details                                  |
| --------------------------------------------- | ---------------------------------------- |
| [ ] Add mode switcher (Local / Cloud)         | On first open, prompt user to choose     |
| [ ] Show cloud status indicator               | Syncing / synced / offline badge         |
| [ ] Update export to resolve cloud image URLs | Download images inline for portable HTML |
| [ ] Add deck sharing UI                       | Share link with permission selection     |

---

## Summary

| Phase                               | Status      |
| ----------------------------------- | ----------- |
| Phase 1: Safety Net                 | ✅ Complete |
| Phase 2: Build Modernization        | ✅ Complete |
| Phase 3: Distribution               | ✅ Complete |
| Phase 4: New Presentation           | ✅ Complete |
| Phase 5: Quick Fixes                | ✅ Complete |
| Phase 6: Testing & Polish           | Not started |
| Phase 7: AI Presentation Conversion | Not started |
| Phase 8: Cloud Mode                 | Not started |

### Priority Order

```
Phase 1 ✅ → Phase 2 ✅ → Phase 3 ✅ → Phase 4 ✅ → Phase 5 ✅ → Phase 6 → Phase 7 → Phase 8
```

Phase 6 covers testing and type safety. Phase 7 is AI-powered presentation conversion (PPTX → SlideMD). Phase 8 (Cloud Mode) is the long-term vision — the storage adapter pattern means local-first still works, cloud is an optional layer.
