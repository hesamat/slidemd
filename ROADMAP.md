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

## Phase 7.5: Self-Contained Format & Image Improvements ✅

Goal: Add self-contained .smd format and improve image handling with drag reorder and alignment.

### Self-Contained .smd Format

| Task                                   | Details                                                          |
| -------------------------------------- | ---------------------------------------------------------------- |
| [x] Self-contained .smd format         | ZIP-based format bundling deck.md + images into single file      |
| [x] SmdHandler class                   | Handle extraction and building of .smd files                     |
| [x] JSZip with STORE compression       | Avoid UI thread freezing during zip operations                   |
| [x] Open Deck modal                    | Custom modal with recent-decks list and dual open buttons        |
| [x] File System Access API integration | Seamless file management on Chromium, fallback on Safari/Firefox |
| [x] Build tooling                      | tools/build-example-smd.mjs and tools/inspect-smd.mjs            |
| [x] Example .smd file                  | docs/example.smd (~1.2 MB bundled presentation)                  |

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

| Phase                            | Status      |
| -------------------------------- | ----------- |
| Phase 1: Safety Net              | ✅ Complete |
| Phase 2: Build Modernization     | ✅ Complete |
| Phase 3: Distribution            | ✅ Complete |
| Phase 4: New Presentation        | ✅ Complete |
| Phase 5: Quick Fixes             | ✅ Complete |
| Phase 6: Testing & Polish        | ✅ Complete |
| Phase 7: PPTX Conversion         | ✅ Complete |
| Phase 7.5: Self-Contained Format | ✅ Complete |
| Phase 8: Cloud Mode              | Not started |

### Priority Order

```
Phase 1 ✅ → Phase 2 ✅ → Phase 3 ✅ → Phase 4 ✅ → Phase 5 ✅ → Phase 6 ✅ → Phase 7 ✅ → Phase 7.5 ✅ → Phase 8
```

Phase 7 was originally planned as AI-powered conversion but was implemented as rule-based layout inference instead — no API keys or external services needed. Phase 7.5 added the self-contained .smd format and image improvements. Phase 8 (Cloud Mode) is the long-term vision — the storage adapter pattern means local-first still works, cloud is an optional layer.
