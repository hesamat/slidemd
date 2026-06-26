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

| Task                                      | Effort   | Details                                                   |
| ----------------------------------------- | -------- | --------------------------------------------------------- |
| [x] Migrate `tools/build.mjs` to esbuild  | 2-3 days | Replace regex-based ESM stripping with esbuild bundler    |
| [x] Bundle Mermaid locally                | 0.5 day  | Currently loaded from CDN in dist builds — breaks offline |
| [x] Verify all assets inline correctly    | 0.5 day  | KaTeX fonts, Prism themes, CSS                            |
| [x] Update build pipeline for source maps | 0.5 day  | Optional but helpful for debugging dist builds            |

**Effort estimate:** 3-4 days

---

## Phase 3: Packaging

Goal: Prepare for distribution and clean up package metadata.

| Task                                          | Effort  | Details                                     |
| --------------------------------------------- | ------- | ------------------------------------------- |
| Add `bin` field to package.json for CLI entry | 0.5 day | `slidemd` command                           |
| Add `files` field to package.json             | 0.5 day | Only ship dist/, not source                 |
| Add `prepublishOnly` script                   | 0.5 day | Auto-build before publish                   |
| Test npm pack / npm publish locally           | 0.5 day | Verify package contents                     |
| Add engines field (Node >=18)                 | 15 min  | File System Access API requires modern Node |

**Effort estimate:** 2-3 days

---

## Phase 4: Quality & Polish

Goal: Comprehensive testing, AI generation improvements, and production hardening.

### Testing

| Task                                | Effort   | Details                                                                     |
| ----------------------------------- | -------- | --------------------------------------------------------------------------- |
| Unit tests for `markdown-parser.js` | 1-2 days | Complex parsing logic, edge cases                                           |
| Unit tests for `directive-utils.js` | 0.5 day  | Pure functions                                                              |
| Unit tests for generation modules   | 2-3 days | `lecture-plan-generator.js`, `deck-generator.js`, `ai-provider-registry.js` |
| Integration tests for deck pipeline | 2-3 days | Full flow: markdown → parse → render                                        |

### AI Generation Overhaul

| Task                                           | Effort  | Details                                                       |
| ---------------------------------------------- | ------- | ------------------------------------------------------------- |
| Fix AI Config Modal close button bug           | 0.5 hr  | Promise never resolves on X click                             |
| Fix `topicsCovered` type inconsistency         | 0.5 hr  | String → array, wire into prompts                             |
| Deduplicate error modals                       | 1 hr    | `showPlanFormatError` / `showDeckFormatError` → shared method |
| Remove dead code: single-pass `generateDeck()` | 0.5 hr  | Never called, only `generateDeckFromPlan()` is used           |
| Remove vestigial `generation-templates.js`     | 1 hr    | Template engine exists but is never used in generation        |
| Add retry with exponential backoff             | 2-3 hrs | Max 3 retries, 429/500/timeout only                           |
| Add truncation recovery                        | 1-2 hrs | Retry with stronger prompt, then warn                         |
| Add token usage tracking                       | 2-3 hrs | Parse usage from API response, display in UI                  |
| Add streaming for deck generation              | 4-6 hrs | SSE parsing, loading modal with token counter                 |
| Add undo for deck replacement                  | 1-2 hrs | Snapshot + 3s undo notification                               |
| Add IndexedDB fallback for profiles            | 2-3 hrs | Non-Chromium browser support                                  |

### TypeScript Definitions

| Task                                          | Effort   | Details                                      |
| --------------------------------------------- | -------- | -------------------------------------------- |
| Add JSDoc type annotations to core modules    | 2-3 days | Better IDE support without full TS migration |
| Add type definitions for deck data structures | 0.5 day  | `Slide`, `Deck`, `Layout`, `Profile` types   |

**Effort estimate:** 8-10 days

---

## Phase 5: Release v0.2.0 ✅

Goal: Ship the improvements.

| Task                                  | Effort  | Details                        |
| ------------------------------------- | ------- | ------------------------------ |
| [x] Update CHANGELOG.md with v0.2.0 entry | 0.5 day | Document all Phase 2-4 changes |
| [x] Update package.json version to 0.2.0  | 5 min   |                                |
| [x] Final QA pass                         | 0.5 day | Manual testing of all features |
| [x] Create release branch and PR          | 0.5 day | Same process as v0.1.0         |
| [x] Tag v0.2.0 and create GitHub release  | 15 min  |                                |

**Effort estimate:** 2-3 days

---

## Phase 6: Cloud Mode

Goal: Enable multi-device editing, cloud image storage, and authenticated access.

### Architecture

- **Storage adapter pattern**: editor uses relative paths (`./images/slide.png`) in both modes
- **Local mode**: paths resolve to local filesystem (current behavior, no server needed)
- **Cloud mode**: images uploaded to cloud storage, paths rewritten to URLs behind the scenes
- **No Amazon services** — use Cloudflare R2 for storage

### Image Storage

| Task                                         | Effort  | Details                                            |
| -------------------------------------------- | ------- | -------------------------------------------------- |
| Set up Cloudflare R2 bucket                  | 0.5 day | Free tier: 10GB storage, 10M reads/mo              |
| Create StorageAdapter interface              | 1 day   | Abstract local vs cloud image paths                |
| Implement R2StorageAdapter                   | 2-3 days| Upload, delete, URL generation                     |
| Update image picker to use adapter           | 1 day   | Transparent to user, paths stay relative           |
| Handle image deletion (cascade from deck)    | 0.5 day | Clean up orphaned images                           |

### Authentication & Access Control

| Task                                         | Effort  | Details                                            |
| -------------------------------------------- | ------- | -------------------------------------------------- |
| Choose auth provider (Clerk, Auth.js, etc.)  | 0.5 day | Prefer self-hosted or edge-compatible              |
| Implement sign-up / sign-in flow             | 2-3 days| Email + OAuth (Google, GitHub)                     |
| Add deck sharing with permission levels      | 2-3 days| Owner / editor / viewer roles                      |
| Add access tokens for API requests           | 1 day   | For programmatic access                            |

### Cloud File Sync

| Task                                         | Effort  | Details                                            |
| -------------------------------------------- | ------- | -------------------------------------------------- |
| Design deck storage schema                   | 0.5 day | Deck metadata + markdown + image references        |
| Implement deck CRUD API                      | 2-3 days| Create, read, update, delete decks                 |
| Add real-time sync (WebSocket or polling)    | 3-4 days| Multi-device live updates                          |
| Add offline support (service worker + cache) | 2-3 days| Edit offline, sync when online                     |

### Deployment

| Task                                         | Effort  | Details                                            |
| -------------------------------------------- | ------- | -------------------------------------------------- |
| Deploy web app to Vercel/Netlify             | 0.5 day | Static frontend                                    |
| Deploy API (Workers or serverless)           | 1 day   | Cloudflare Workers for edge compute                |
| Set up custom domain + SSL                   | 0.5 day |                                                    |
| Add environment config (R2, auth, etc.)      | 0.5 day |                                                    |

### UX

| Task                                         | Effort  | Details                                            |
| -------------------------------------------- | ------- | -------------------------------------------------- |
| Add mode switcher (Local / Cloud)            | 0.5 day | On first open, prompt user to choose               |
| Show cloud status indicator                  | 0.5 day | Syncing / synced / offline badge                   |
| Update export to resolve cloud image URLs    | 0.5 day | Download images inline for portable HTML           |
| Add deck sharing UI                          | 1 day   | Share link with permission selection               |

**Effort estimate:** 25-35 days

---

## Summary

| Phase                               | Effort         | Status             |
| ----------------------------------- | -------------- | ------------------ |
| Phase 1: Safety Net + Documentation | 7-9 days       | ✅ Complete        |
| Phase 2: Build Modernization        | 3-4 days       | ✅ Complete        |
| Phase 3: Packaging                  | 2-3 days       | Not started        |
| Phase 4: Quality & Polish           | 8-10 days      | Not started        |
| Phase 5: Release v0.2.0             | 2-3 days       | ✅ Complete        |
| Phase 6: Cloud Mode                 | 25-35 days     | Not started        |
| **Total**                           | **~12-16 weeks** | **Phase 1-2, 5 done** |

### Priority Order

```
Phase 1 ✅ → Phase 2 ✅ → Phase 5 ✅ → Phase 3 → Phase 4 → Phase 6
```

Phase 4 includes the AI generation overhaul as a major component. Within Phase 4, the recommended order is: bug fixes → cleanup → reliability → token tracking → streaming → polish.

Phase 6 (Cloud Mode) is the long-term vision. It should be tackled after the core product is polished (Phase 3-4). The storage adapter pattern means local-first still works — cloud is an optional layer.
