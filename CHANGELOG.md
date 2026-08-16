# Changelog

## 0.11.0 (2026-08-15)

### Editor & UI

- Overhaul the area background picker: replace the buggy hidden `<input type="color">` in the `@area` right-click "Set background…" menu with a popover panel featuring color swatches, an editable hex input, a transparency slider, and a live preview directly on the area element (composited over the slide background). Hex and transparency controls are always visible. Dismissing the popover (outside click, Escape, scroll, resize, or Cancel) restores the area's original background. (#233)
- Add background sizing, positioning, and repetition controls to the Slide Styles background panel and the New Presentation modal: background-size (cover, contain, fit, auto), a 9-point background-position grid, and background-repeat (no-repeat, repeat, repeat-x, repeat-y). `fit` maps to `100% 100%` and round-trips when loading existing decks. (#194, #233)
- Show the selected image path inline next to the Browse button (truncated with an ellipsis) and make the dark-theme toggle sticky at the bottom of the scrollable background panel. (#233)
- Replace the full-width background preview with a compact, centered 16:9 box that keeps slide proportions without dominating the modal or forcing a horizontal scrollbar. (#233)
- Rename the per-area directive from `area-style-<name>:` to `area-bg-<name>:`, storing a raw CSS background value (e.g. `#1e293b`) instead of a full CSS declaration string. The area popover is color-only; image/gradient area backgrounds are not offered. (#233)
- Set the `.slides` container background to black. (#233)

### AI

- Document the `area-bg-<name>:` directive in the AI system prompt and visual-styling note so the AI can set per-area/column backgrounds; the AI output validator, prompt builder, and response parser recognize the directive. (#233)
- Strip `area-bg-<name>:` in remix discard-identity mode (same image-vs-color rule as `background:`), and preserve per-area backgrounds through single-slide fix-mode and whole-deck generate-mode AI round-trips. (#233)

### PPTX Import

- Use `focus` for short fenced wide code blocks: a fenced code block with 10+ lines spanning >80% of the slide width is a single snippet, not merged two-column content, so it now uses `focus` unless the total content is substantial. Unfenced wide code (how PPTX merged-column code arrives) keeps two-column. Based on an 11-deck corpus audit completing the Phase 14.9 threshold review. (#232)
- Fix static HTML exports (`npm run build`) leaking `area-bg-<name>:` lines into rendered slide content and dropping per-area backgrounds; `tools/md-to-deck.mjs` now matches the runtime parser. (#233)

## 0.10.1 (2026-08-15)

### Security

- Pin third-party GitHub Actions to immutable commit SHAs in the release workflow, mitigating mutable-tag supply-chain risk.
- Restrict GitHub Actions workflow-level permissions to `permissions: {}` and grant minimum required scopes (`contents: write`, `pull-requests: write`) only at the job level in `release.yml` and `branch-cleanup.yml`.
- Add path-traversal validation to `tools/build.mjs` and `tools/dev-server.mjs` to reject file paths containing `..` sequences or absolute paths before filesystem operations, mitigating file inclusion attacks.
- Sanitize SAST-flagged `innerHTML`/`outerHTML`/`document.write` sinks: Mermaid-rendered SVGs are passed through DOMPurify before insertion, and the image picker, area context menu, reimagine outline stats, and notification icons are built with safe DOM construction (`textContent`, `createElement`) instead of interpolated HTML strings.

### Reimagine & Visual System

- Replace the strict 3-color palette with a freeform `visualDirection` string threaded through the outline, breakdown, and generate prompts; stop serializing the visual system as a top-of-markdown HTML comment and remove `DeckStore.getVisualSystem()`/`setVisualSystem()` and `DeckHistory` visual-system snapshots.
- Add flow-specific technique menus (instructional, story, technical, persuasive) replacing the fixed 7-item list, and extend the `flowTag` vocabulary with instructional (`objectives`, `steps`, `practice`, `recap`) and technical (`assertion`, `implication`) tags. Thread flow tags into the breakdown prompt so they inform beat assignment and density.
- Show a read-only visual direction panel in the reimagine outline review modal with palette swatches, imagery mood, first-slide identity, and kept source images.
- Enforce polish-mode image-source restrictions: reject `<img>` and `background: url(...)` references that do not match a source image or `reuse:<path>` directive.
- Add a concept-level guard so outline, breakdown, and generate prompts instruct the AI not to introduce concepts more advanced than the source deck.
- Make Mermaid diagrams opt-in (branches/decisions/loops/parallel paths only), capped at two per chapter or five content slides, limited to 3–7 nodes.
- Fix `applyVisualSystemIdentity` to replace `background: transparent`/`none`/missing with a real color so slides are never see-through; fix `themeForColor` to handle gradients and avoid truncating 6-digit hex to 3-digit.
- Fix Mermaid diagram label text being stripped by DOMPurify by adding `foreignObject` to `ADD_TAGS` and registering it in `HTML_INTEGRATION_POINTS`.
- Harden Reimagine batch generation against truncation and malformed JSON; add beat treatment, voice, and density budget guidance to prompts.
- Emit advisory visual-system validation warnings from `AiOutputValidator` for invalid theme values, malformed background directives, and results that ignore the visual direction; `applyVisualSystemIdentity` fixes them deterministically.
- Add 5 pipeline tests covering per-flow technique menus, flowTag threading, and extended vocabulary acceptance, plus 15 `AiOutputValidator` unit tests for visual-system compliance warnings.

### Editor & UI

- Restructure the dark theme into a shared base plus three selectable palette variants: Warm Graphite (default), Cool Indigo-Gray, and Blue Slate. Add an Appearance card to the Settings modal with Light/Dark toggle and live-preview variant swatches. Each variant has lighter `--input-bg` surfaces so textfields read as editable recessed wells. Replace hardcoded dark-mode colors across dropdowns, context menus, notifications, and the AI sidebar with CSS variables.
- Add per-code-block centering via the `{ center }` fence info-string keyword (e.g. ` ```js { center } `), wired in both `MarkdownParser` and the build-time `md-to-deck.mjs` renderer.
- Allow short bulleted content (up to 6 elements) and header + short body to use the `focus` layout for centered presentation instead of falling through to `header-content`.
- Restrict model auto-fetch to hosted providers (OpenRouter, OpenAI); local providers (Ollama, LM Studio) now require an explicit Fetch click, eliminating `ERR_CONNECTION_REFUSED` console spam when the local service isn't running. Mark the model-dropdown `wheel` listener as `passive: true` to silence the Chrome non-passive-event-listener violation. Fix persisted reasoning preference restoration for local providers on modal init. Add 13 settings-modal tests covering auto-fetch gating, Fetch button visibility, provider-switch behavior, and persisted reasoning restoration.

### PPTX Import

- Stop escaping `>` to `&gt;` in markdown output; only `<` is escaped, since `>` has no special meaning in markdown except at line start (blockquote).

### Exported HTML

- Fix `ReferenceError: isModalOpen is not defined` in exported HTML by adding `src/core/modal-state.js` to the runtime bundle order.
- Prevent exported HTML from dynamically importing `node_modules` KaTeX/Prism/markdown-it resources by adding `window.__WEBDECK_EXPORTED__` early-return guards in `AssetLoader`.
- Use `window.location.hash` instead of `history.replaceState` on `file:` protocol, eliminating the unsafe frame warning when navigating slides in an exported file.

## 0.10.0 (2026-08-13)

### Remix & Reimagine

- Replace the Remix plan `keep` action with `polish`. Polish now lightly improves/fixes each slide instead of copying it unchanged; `rewrite` and `merge` remain unchanged. Update the AI sidebar badges, plan prompt, and `docs/ai-editing.md` accordingly.
- Make `instructional` the default whole-deck AI flow and wire flow-aware restructuring priorities (`instructional`/`story`/`technical`/`persuasive`) into the remix plan via `remix-flow-guidance.md`.
- Enforce visual identity mechanically in preserve mode: `applyPreservedIdentity` deterministically restores source `theme:`/`background:` after the execute phase, removing the need for validator retry loops. Discard mode and Reimagine strip stale theme/background/color directives while keeping legitimate image backgrounds.
- Restrict execute-phase images to source-deck paths. Models may not invent `background: url(...)` or `<img src>` values; `normalizeImageSrc` handles `./` prefixes and percent-encoding. Dropped images and fabricated URLs are flagged or stripped mechanically.
- Limit remix `merge` actions to two source slides and prevent merging image/diagram-heavy slides. Tighten keep/rewrite/merge criteria in the plan prompt.

### AI Model Reliability

- Detect reasoning-model token exhaustion (`content: null` with `finish_reason: "length"`) and retry once with a widened `max_tokens` budget. Surface clear guidance to the user if the wider budget also exhausts.
- Raise the reasoning `max_tokens` floor to 32k (medium) and 40k (high) to reduce exhaustion on non-trivial tasks.

### Prompt & Quality Fixes

- Preserve original closing sign-off, thank-you, and call-to-action text in recap/closing slides.
- Prevent the AI from adding answers, expected outputs, or result comments to code blocks unless the source already contains them.
- Make directive extraction/stripping fence-aware for both ` ``` ` and `~~~` fences; track fence markers and escape directive names in regex helpers.
- Preserve original background layer structure and place solid colors behind images in restored backgrounds.
- Update prompt catalogs (`AGENTS.md`, `docs/prompt-template.md`) and `ROADMAP.md` for `polish`/`rewrite`/`merge` terminology.

## 0.9.2 (2026-08-12)

### Reimagine Outline

- Remove the visual system palette dropdown, drop custom color theming, add image reuse, editable plan, palette presets, modal shortcut suppression, and breakdown/chapter alignment resilience.

### AI Prompt Tightening

- Only honor `reuse:<path>` image queries; do not invent image URLs or use placeholder `src` values.
- Add `object-fit: contain;` for logos/diagrams and `object-fit: cover;` for full-bleed photos to the system prompt.
- Add KaTeX math syntax guidance (`$...$` inline, `$$...$$` display) to the system prompt.
- Add text-block grammar guidance to AI prompts and validate unknown text-block attributes.
- Tighten polish and remix prompts: remove contradictions, preserve existing styling, and discourage over-merging.
- Instruct polish and remix AIs to review fenced code blocks and fix syntax errors, broken logic, and nonsensical/placeholder code — not just formatting.
- Balance remix merge guidance: use `merge` instead of `prefer merge`, and explicitly tell the AI not to merge slides with distinct topics or standalone value.

### Media Full-Bleed

- Rename the directive from `media-span: left|right` to `media-full-bleed: true`.
- Restrict the full-bleed context menu option to the `@media` area.
- Rename the CSS attribute from `data-media-span` to `data-media-full-bleed` and the helper from `getMediaSpanSideFromGrid` to `getMediaFullBleedSideFromGrid`.
- Preserve backwards compatibility for old `media-span:` directives.
- Only show the full-bleed toggle when the renderer will actually apply it (multi-row, uniform grids).
- Add the full-bleed media toggle to the CodeMirror `@media` context menu.

### PPTX Import Fixes

- Fix slide order when slides have been reordered in PowerPoint: read `<p:sldIdLst>` from `presentation.xml` and re-sort slides to match the author's intended order.
- Fix slide loss/scrambling when file numbering has gaps (e.g. slide1, slide2, slide4 after a deletion): build a `fileNum → arrayIndex` map from the actual sorted slide files instead of assuming `raw.slides[slideNum - 1]`.
- Use focus layout for caption-only body beside a single dominant image instead of forcing media-span.
- Add `pptx-slide-order.test.js` with 5 tests covering slide reordering via `sldIdLst`, file-number gaps, gap+reorder, and empty-`sldIdLst` fallback.

### Editor & Modal Fixes

- Consolidate modal state into `src/core/modal-state.js` and fix modal open/close idempotency across the editor (ConversionModal, OpenDeckModal, SlideSearch, Notification loading modals, SettingsModal).
- Fix `NewPresentationModal` close (×) button bypassing the modal-state counter — wired it through `dismiss()` so it properly decrements the counter.
- Fix `Notification.prompt` (file-name chooser) not participating in the modal-state counter, so keyboard shortcuts are now suppressed while it is visible.
- Make `Notification.showLoadingModal` cleanup idempotent so double-dismisses don't unbalance the modal-state counter.
- Export `resetModalState` and call it from `ReloadManager.replaceDeck` as a safety valve against leaked modal-open state.
- Suppress all keyboard shortcuts while any modal is open (interactive dialogs and loading modals).
- Replace `WheelHandler` DOM-query `isModalOpen()` with the centralized `modal-state.js` API.
- Remove `slideIn` CSS animation causing a white flash on dark slides.

### Bare-Tag Escaping Hardening

- Rewrite `splitCodeAware` with CommonMark-compliant fence detection: fences must start at line beginning (up to 3 spaces indent), use matching marker characters (backtick or tilde), closer must be at least as long as the opener, and unclosed fences run to end of document.
- Add proper inline code span detection with backslash-escape handling and multi-backtick span support.
- Prevents prose containing `~~~...~~~` from being incorrectly treated as a protected code block, ensuring blocked HTML tags (`<script>`, `<iframe>`) in such prose are still escaped.

### AI Validator Fixes

- Skip the content-volume/overflow check for polish mode (polish must preserve the same slide count and content, so the "split into multiple slides" remedy was unavailable and only pressured the AI to delete content).
- Add per-area line budgets to `generate-prompt.md` to prevent slide overflow (replaces rigid per-item caps).
- Replace the hardcoded `AREA_CONTENT_LIMITS` table with `computeAreaLimits()` that derives per-area line budgets from grid geometry, eliminating the layout-name drift risk flagged in `REVIEW.md`. Media areas get a 2.0x multiplier for verbose image/mermaid markdown. Custom layouts are now supported automatically.
- Emit `SLIDE_CONTENT_OVERFLOW` errors from `AiOutputValidator` when a slide exceeds its line budget, driving the existing repair-message retry loop.
- Defend the remix/reimagine plan validator against 1-based source index off-by-one errors and duplicate source indices.
- Avoid double-sending vision images when a truncated batch is split in the whole-deck orchestrator.
- Fix vision-retry fallback in `#runReimagineOutline` to use `userWithPlan` instead of `user`, so the user's edited plan survives a text-only retry on image-incapable models.

### Cleanup

- Remove dead `LayoutData.getMediaSpanSide` method (no production callers after the full-bleed refactor) and its test assertions.
- Remove 48 lines of dead CSS for the removed visual-system palette dropdown from `ai-reimagine-outline-modal.css`.
- Update `slides.css` comments from `media-span` to `media-full-bleed` terminology.
- Parse colon-style text-block attribute assignments so repair messages don't list value fragments as unsupported attributes.
- Always emit braces from `buildTextBlockDirective` so attribute-less text blocks round-trip correctly.
- Move the reimagine outline regenerate handler registration after its dependencies are declared.
- Update beat-normalizer documentation to reflect that `emotional` is also downgraded on the first slide.

### Documentation

- Split the 360-line README into a concise landing page with focused guides: `docs/authoring.md`, `docs/ai-editing.md`, `docs/keyboard-shortcuts.md`, `docs/import-export.md`.
- Update `docs/example/slides.md` to showcase Phase 14.5 features (text-block attributes, auto-save, Ctrl+S, vision, editable outline, media-full-bleed, PPTX slide-order preservation).
- Add `reimagine-breakdown-prompt.md` and `visual-styling-note.md` to the AGENTS.md prompt catalog table.
- Update `reimagine-outline-prompt.md` description in AGENTS.md to include `visualSystem`, `keepImages`, and `firstSlideIdentity` output fields.

### Dependency Hygiene

- Regenerate `package-lock.json` to align with `package.json` (version `0.9.1`, dompurify exact pin `3.4.13`).

## 0.9.1 (2026-08-10)

### Whole-Deck Modes (Polish, Remix, Reimagine)

- **New mode selector** — the "Refine all slides" modal now offers three modes:
  - **Polish** — fix formatting, improve wording, pick better layouts; keeps slide count and order.
  - **Remix** — two-phase plan→execute flow with moderate creative freedom; preserves visual identity by default.
  - **Reimagine** — three-phase outline→review→generate flow with bold creative freedom. The AI proposes a `plan` + chapter-grouped outline (with narrative flow tags), the user reviews and edits it in a modal, then the full deck is generated from the outline. Visual identity is not preserved and the checkbox is hidden. A slide-count guard targets 70-120% of the source deck (soft warn if outside range). Vision is available for Reimagine so the AI can see the original slide images.
- **Flow dropdown replaces tone** — the pre-flight modal now has a "Flow" selector (Story, Technical, Persuasive, Instructional) instead of the old tone dropdown. The flow sets the narrative genre; the AI picks storytelling techniques (problem-solution, historical context arc, compare-contrast, etc.) within that genre. Flow is shown only for Remix and Reimagine.
- **Add speaker notes** — now an explicit checkbox for all three modes instead of being bundled into "Restyle".
- **Preserve visual identity** — checkbox for Remix only; controls whether the AI keeps the original theme, colors, and backgrounds. Reimagine always discards visual identity.
- **Vision checkbox** — now available for Remix and Reimagine, and only appears when the deck has content images.
- Replace the old `fidelity` (`polish`/`enhance`/`rewrite`) option with a single `mode` (`polish`/`remix`/`reimagine`) and explicit boolean options.
- Replace the old `tone` (`default`/`formal`/`casual`/`technical`) option with a `flow` (`story`/`technical`/`persuasive`/`instructional`) option.
- Add `polish-prompt.md` — focused whole-deck prompt that combines formatting cleanup with layout and wording improvement while preserving structure.
- Update `remix-plan-prompt.md` with mode-aware `{{creativeGuidance}}` and `{{visualIdentityGuidance}}` placeholders and relaxed structural rules (reordering allowed; no arbitrary slide-count cap).
- Update `generate-prompt.md` and `ai-prompt-builder.js#buildGenerateOptionsSuffix` to use the new `mode`, `flow`, `addSpeakerNotes`, and `preserveVisualIdentity` options.
- Update `generate-prompt.md` to ask the AI to pick one coherent visual theme, set `background:` and `theme:` directives (with `theme: dark` for dark backgrounds), place content images, use only Mermaid for diagrams, and ban ASCII art and text-based diagrams.
- Add `{{sourceCount}}` and `{{maxSourceIndex}}` placeholders to `remix-plan-prompt.md` so the plan AI knows the exact valid 0-based source range and is less likely to emit out-of-range indices.
- Remove unconditional theme/background preservation from `generate-prompt.md`. Visual identity is now controlled by the mode-aware options suffix.
- Add `stripThemeAndBackground()` helper and strip original `theme:`/`background:` directives from the Reimagine virtual deck and kept slides so the result is not anchored to the old visual style.
- Make sidebar plan header and orchestrator logs mode-aware (`Remix plan`, `Reimagine plan`, etc.).
- Add `reimagine-outline-prompt.md` — outline phase prompt that asks the AI for a `{ plan, chapters }` JSON from the deck summary. Includes a palette of storytelling techniques, a fixed flow-tag vocabulary, a slide-count guard targeting 70-120% of the source deck, and image-aware instructions.
- Add `AiReimagineOutlineModal` — modal for reviewing/editing the AI-proposed `plan` + chapter-grouped outline between the outline and generate phases. Read-only mode shows collapsible chapters with colored flow badges; an "Edit" toggle reveals inputs for editing chapters, slides, flow tags, reordering, adding, and removing.
- Route Reimagine through a dedicated `#runReimagine` flow in the orchestrator (outline → user review via `onOutline` callback → generate from virtual brief-only deck). Phase 2 sees only the outline, not the original deck, so content is generated fresh. Includes a soft slide-count guard that warns when the outline is outside 70-120% of the source. Includes multi-modal vision support for the outline phase when the user opts in.

### Vision-Augmented Remix & Reimagine

- **Vision toggle in generate modal** — when the mode is Remix or Reimagine and the deck has content images, a "Send slide images to AI (vision)" checkbox appears with an estimated image token count. Off by default.
- **Multi-modal plan phase** — when the user opts in, the plan phase sends raw content images (compressed to <40KB JPEG each) alongside the deck summary so the AI can visually assess layout quality, image content, and placement.
- **`keepImages` plan schema** — plan entries can now include `keepImages: [0, 1]` to specify which images to keep per output slide. `[]` drops all, omit keeps all. The virtual deck filters images per `keepImages` before the execute phase.
- **Provider multi-modal support** — Anthropic and Gemini provider clients now handle array content (vision blocks) in addition to plain strings. OpenAI-compatible clients pass arrays natively.
- **Text-only fallback** — if the provider rejects images (e.g. model doesn't support vision), the plan phase retries with text-only automatically. The sidebar retry also skips images when the model rejects vision input; the error message now says "Try again will continue without images".
- **Background image filtering** — background images (from `background: url(...)` directives) are excluded from vision; only content images (inline `<img>` and `![alt](src)`) are sent.
- **Image compression** — canvas-based: max 768px width, JPEG quality loop (0.85 → 0.7 → 0.5 → 0.3), halve width if still >40KB. No new dependencies.
- Add `ai-vision-message.js` (message builder, provider mappings, token estimation).
- Add `slide-image-extractor.js` (image extraction, background filtering, compression, fast count for modal).
- Update `remix-plan-prompt.md` with `keepImages` schema and image-aware instructions.
- Total tests now **863**.

## 0.9.0 (2026-08-06)

### AI Orchestrator & Single-Slide Editing

- Add `AiOrchestrator` — single entry point for all AI operations with built-in validation and repair loop.
- Add `AiOperation` type and `AiIntentRegistry` for intent-to-prompt-builder mapping.
- Add single-slide AI intents: `enhanceSlide`, `addSpeakerNotes`.
- Drop `toMetricCards` intent — the referenced `metric-cards` layout doesn't exist and the fallback to `header-content` added no value.
- Add AI dropdown in the editor toolbar with per-slide and whole-deck actions.
- Single-slide AI operations return `SlidePatch[]` applied via `DeckStore.applyPatches()` — undoable from day one.
- Add prompt files: `add-speaker-notes-prompt.md`, `remix-plan-prompt.md`.
- Reuse `fix-prompt.md` as the user fragment for `enhanceSlide` (same cleanup rules, scoped to one slide).

### Remix Two-Phase Flow

- **Remix ("rewrite" fidelity) now uses a two-phase plan→execute flow.** A cheap planning call produces a structured restructuring plan (keep/rewrite/merge actions), logged in the AI sidebar. The plan is converted to a virtual deck and fed through the existing batched generate path.
- **Remix is available for decks of any size** (was limited to ≤8 slides). The execute phase batches through the existing 2-worker queue for large decks.
- The plan phase uses `remix-plan-prompt.md` and returns a JSON plan with 3 action types: `keep`, `rewrite`, `merge`.
- `generate-prompt.md` now instructs the LLM to follow `<!-- brief: ... -->` comments in the virtual deck.

### Import Flow Simplification

- **Drop whole-deck "Fix Issues" from PPTX import.** The "Fix Issues" checkbox is removed from the conversion modal.
- Import is now instant — no AI options remain in the conversion modal; users refine slides via the AI dropdown afterward.
- Remove `extractDirectives`/`injectDirectives` from the import path (no longer needed without fix mode).

### Module Migration

- Delete `ai-enhancer.js` transition facade — all functions migrated to focused modules.
- Add `ai-prompt-builder.js` (layout list, frontmatter stripping, message building, batch messages).
- Add `ai-response-parser.js` (JSON parsing, slides-to-markdown, areas-to-markdown, heading extraction).
- Add `ai-directive-utils.js` (extract/restore/inject per-slide directives, fence-aware).
- Add `ai-token-estimator.js` (token count and max_tokens estimation).
- Add `ai-output-validator.js`, `ai-output-schema.js`, `ai-prompt-composer.js`, `ai-repair-message.js`.
- Add `ai-provider-client.js` (OpenAI-compatible client with retry logic) and `ai-provider-factory.js`.
- Add `dropdown-registry.js` — shared registry so Format and AI dropdowns can't overlap.
- Split `ai-enhancer.test.js` into per-module test files.
- Total tests now **734**.

### Robustness & Hardening

- **Truncation loop fix** — cap truncation splits per batch so a single oversized slide can't loop forever re-queuing itself; partial output is accepted when the batch can't split further.
- **Speaker-notes validation** — strip `data-source-line` attributes before comparing rendered areas so blank-line normalisation by the AI no longer triggers false positives (previously wasted 2 extra repair calls per "Add speaker notes").
- **Directive preservation** — `extractDirectives` and `buildBatchMessages` now use fence-aware `MarkdownParser.splitSlides` so `---` inside code blocks doesn't shift backgrounds/themes onto wrong slides.
- **Directive injection without layout** — fix mode now prepends `background:`/`theme:` at the top of the section when the AI omits the `layout:` line, instead of dropping the slide's styling entirely.
- **Reasoning guard** — `AiReasoningError` only thrown when reasoning was actually sent, so non-OpenRouter providers with `reasoning: null` get the full `AiHttpError` with status/body.
- **Error sanitization** — `AiHttpError` includes a short sanitized excerpt (credential-like lines and inline `sk-`/`Bearer` patterns stripped) so users get actionable detail without leaking secrets.
- **Retry guard** — `response_format` retry only fires when it was actually sent, avoiding a wasted duplicate request on every parse error.
- **Whole-deck undo** — `DeckStore.replaceDeck` enables Ctrl+Z for whole-deck refine instead of clearing history.
- **Whole-deck refine ordering** — deckStore updated before `reloadManager.replaceDeck` so the `deckchange` handler reads the correct post-refine state.
- **Minimize button** — wired in both single-slide and whole-deck AI panels.
- **OpenAI model discovery** — restored to `isModelSearchProvider` so Fetch models and reasoning cross-reference work again.
- **Remix directive injection** — remix path no longer calls `injectDirectives` positionally (it intentionally reorders/splits/merges); non-remix generate only gap-fills when the output slide count matches the input.

### Prompt & Modal Improvements (PPTX-focused)

- **Polish fidelity uses fix-prompt.md** — "Tidy up" now applies the same specific PPTX cleanup rules as single-slide "Clean up slide" (rejoin split code lines, remove bold wrapping, fix broken links/lists/tables, downgrade mismatched layouts) instead of a vague "fix formatting" suffix on `generate-prompt.md`.
- **Image handling guidance** — system and generate prompts now instruct the AI to preserve `<img>` tags, reposition images with `position: relative` + `left`/`top`/`width` for custom placement, and drop low-quality or redundant images.
- **PPTX-aware guidance** — `generate-prompt.md` now tells the AI to fix mismatched layouts, reposition misplaced images, and tighten verbose text when the input appears to be from a PPTX import.
- **Conditional background preservation** — the AI may now change or drop `background:` directives that are decorative overlays or don't fit the restructured content (previously unconditional). `theme:` is still preserved.
- **Token estimate in modal** — the pre-flight "Refine all slides" modal now shows a rough input/output token estimate alongside slide count and API call count.
- **`buildDeckSummary` fence-aware** — uses `MarkdownParser.splitSlides` instead of naive `split(/\n---\n/)` so `---` inside code blocks doesn't create phantom slides in the deck outline.
- **Layout list format** — replaced the wide 8-column cross-reference table with a per-layout list of allowed `@area` names (e.g. `two-column: @header, @main, @media, @footer`). The table format was hard for the AI to scan accurately — it frequently used `@secondary` for `two-column` (which only has `@media`) or dropped `@main` from `media-span`.
- Total tests now **744**.

## 0.8.0 (2026-08-06)

### Deck Store & Patches

- Add canonical `DeckStore` with `SlidePatch` and `DeckHistory` for undoable, patch-based slide mutations.
- Add `SlidePatch` type and helpers for insert, delete, edit, and move operations.
- Add `DeckHistory` with bounded undo/redo snapshots.
- Wire `EditController`, `SlideOperations`, `ReloadManager`, and `DeckController` to the store at defined boundaries.
- Add `DeckLoader.getSourceMarkdown()` helper to centralize markdown source resolution.
- Extract `splitSlides()` as a fence-aware shared utility for `MarkdownParser` and `DeckStore`.
- Route undo/redo keyboard shortcuts through `EditController`.
- Add unit tests for `SlidePatch`, `DeckHistory`, `DeckStore`, and `SlideOperations`.
- Total tests now **668**.

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
- Update `fix-prompt.md` to remove duplicate diagram rule and add success criteria.
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
