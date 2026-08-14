# Phase 14.9: PPTX Import Quality — Implementation Plan

**Scope:** Layout inference fixes, PPTX import escaping fix, and code-block centering.
Shape/diagram screenshot preservation (#117) is deferred to a follow-up phase.

**Branch:** `feature/14.9`
**Base:** `origin/main` (v0.10.0)

## Workstream 1: Per-Code-Block Centering

**Goal:** Allow centering individual code blocks in any layout using a fence info-string keyword, not just the `focus` layout which centers all code blocks by default.

### Syntax

````
```js { center }
console.log("I am centered");
```
````

The `center` keyword inside a curly-brace attribute block after the language in the fence info string marks that specific code block for centering. This mirrors the text-block directive syntax (`::: text-block { ... }`). Multiple code blocks on the same slide can be independently centered or left-aligned.

### Implementation

1. **`src/data/markdown-parser.js`** — In `ensureMarkdownIt()`, override the fence renderer rule to detect `center` in the info string and add a `code-centered` class to the `<pre>` element. The existing fence wrapper (line ~278) already wraps the rule for source-line tracking — extend it to also check the info string.

2. **`styles/slides.css`** — Add CSS rule:
   ```css
   .slide__area pre.code-centered:has(> code) {
     width: fit-content;
     margin-left: auto;
     margin-right: auto;
     align-self: center;
     text-align: left;
   }
   ```

````

This mirrors the existing `focus` layout rule but applies to individual code blocks marked with the `center` keyword. The `:has(> code)` selector matches the specificity of the language-attribute code block rules and ensures `align-self: center` overrides the default `align-self: flex-start`.

3. **`docs/authoring.md`** — Document the `center` fence info-string keyword in the code blocks section.

4. **`tools/md-to-deck.mjs`** — Mirror the fence centering logic in `makeMarkdownRenderer()` so built presentations also apply the `code-centered` class.

### Tests

- Unit test in `markdown-parser.test.js`: verify ` ```js { center } ` produces `<pre class="code-centered">` and ` ```js ` (without `center`) does not.
- Verify existing decks without the keyword render unchanged (no regression).

### Acceptance

- ` ```js { center } ` centers that specific code block in `header-content`, `two-column`, and other layouts.
- Other code blocks on the same slide without the keyword are not centered.
- Existing decks without the keyword render unchanged.

---

## Workstream 2: Layout Inference Fixes

**Goal:** Make `focus` layout selection smarter for slides with headers and short content.

### Problem 1: Focus vs header-content detection

**Current behavior:** A slide with a header + short body only gets `focus` if the header is a "thin strip" (`headerHi < bodyHi * 0.4`). Otherwise it falls through to `header-content`, even when the body is short enough to benefit from centered presentation.

**Fix:** In `pptx-layout-inference.js` `inferLayout()`, after the existing header + body detection, add a check: if the body content is short (total text < `maxTitleLength` and body has ≤ `maxFocusElements` elements), use `focus` regardless of the header height ratio.

**Files:**

- `src/data/pptx-layout-inference.js` — Add the short-body focus path
- `src/data/pptx-slide-config.js` — Add `maxFocusElements: 6` (allows short bulleted content up to 6 elements)

### Problem 2: Short bulleted content blocked by element count

**Current behavior:** Slides with 4+ short bullets (total <300 chars) skip the `focus` path because `contentEls.length > maxTitleElements (3)`.

**Fix:** In the title/focus candidate check (~line 357), use the new `maxFocusElements` threshold instead of `maxTitleElements` when total length is very short (< `maxTitleLength`). This allows 4-6 short bullets to qualify for `focus`.

**Files:**

- `src/data/pptx-layout-inference.js` — Adjust the element count check
- `src/data/pptx-slide-config.js` — Add `maxFocusElements: 6`

### Tests

- Add cases to `pptx-to-slide-md.test.js`:
  - Header + short body (5 lines, <300 chars) with non-thin header → `focus` (was `header-content`)
  - 4 short bullets, no header, total <300 chars → `focus` (was `header-content`)
  - 8 bullets, total >300 chars → `header-content` (unchanged, regression check)
  - Header + long body (>300 chars) → `header-content` (unchanged, regression check)
- Run existing PPTX integration tests to verify no regressions.

### Acceptance

- Slides with header + short body use `focus` instead of `header-content`.
- Slides with 4-6 short bullets use `focus` when total content is <300 chars.
- Existing layout selection for long-content slides is unchanged.

---

## Workstream 3: PPTX Import Escaping Fix

**Goal:** Stop escaping `>` to `&gt;` in PPTX import markdown output.

### Problem

`pptx-html-to-markdown.js` was escaping both `<` and `>` in text content. While `<` must be escaped (markdown-it would parse it as an HTML tag), `>` has no special meaning in markdown except at the start of a line (blockquote), which is rare in PPTX text. Escaping it produces ugly `&gt;` in the markdown source.

### Fix

In the final escaping pass of `htmlToMarkdown()`, only escape `<` — leave `>` as-is. Content inside backticks and fenced code blocks is already preserved as-is by the split/join logic.

**Files:**

- `src/data/pptx-html-to-markdown.js` — Remove `.replace(/>/g, "&gt;")` from the escaping pass

### Tests

- Unit test in `pptx-extractor.test.js`: verify `>` is preserved and `<` is escaped.

### Acceptance

- PPTX import preserves literal `>` characters in body text.
- `<` is still escaped to `&lt;`.

---

## Implementation Order

1. **Code Block Centering** — simplest, self-contained, good warmup
2. **Layout Inference Fixes** — threshold tuning, run against existing fixtures
3. **PPTX Import Escaping Fix** — one-line change

Each workstream gets its own commit. All quality gates run before commit:

```bash
npm run lint
npm run format:check
npm test
npm run test:e2e
npm run build
```

## Deferred

- **Shape & Diagram Preservation (#117)** — Rendering shape groups/diagrams as PNG screenshots. High value (priority: high issue) but high complexity (SVG construction from PPTX shape data, canvas rendering, coordinate conversion). Deferred to a follow-up phase.
````
