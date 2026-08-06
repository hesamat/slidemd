# Phase D.3: Fix AI Prompt and Modal Gaps for PPTX Imports

Fix the gaps identified in the Part 1 review. These are text/prompt/UI fixes — no vision infrastructure needed. The main use case is imported PPTX slides with wrong layouts, misplaced images, verbose text, and decorative backgrounds.

## Current State (verified by re-reading all files after recent changes)

- **`#runWholeDeckSingleCall`** already accepts `expectedSlideCount` (line 256) and the orchestrator passes `totalSlides` for all non-remix calls (line 205). **Slide count enforcement is already done.**
- **Remix `keep` short-circuit** is implemented — `keep` entries are spliced back from originals, not sent to the execute call. `#planToVirtualDeck` now receives only `rewriteEntries`.
- **`finish_reason: "length"` truncation detection** is in place in both single-call and batched paths.
- **`ai-directive-utils.js`** uses fence-aware `splitSlides` and `stripLeadingDirectives`.
- **`ai-output-validator.js`** early-returns for non-`addSpeakerNotes` intents (no more wasted input parsing).
- **`ai-generate-modal.js`** has `escapeHtml` for model name and `settingsOpen` flag to prevent Escape closing the modal while Settings is open.
- **`ai-token-estimator.js`** already imports `stripFrontmatter` and uses the `length / 4` heuristic.

## Gaps Still to Fix

| #   | Gap                                                                                                            | Impact                                                                                                    | Fix                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | `polish` fidelity uses a vague suffix on `generate-prompt.md` instead of `fix-prompt.md`'s specific PPTX rules | "Tidy up" misses split code lines, bold wrapping, broken links — the exact problems PPTX import produces  | Use `fix-prompt.md` as the user fragment when fidelity=polish                |
| 2   | No image handling guidance in any prompt                                                                       | AI doesn't know it can reposition images, use `position: relative`, or drop low-quality ones              | Add image handling rules to `system-prompt.md` and `generate-prompt.md`      |
| 3   | No PPTX-specific guidance in prompts                                                                           | AI doesn't know imported slides may have wrong layouts or misplaced images                                | Add PPTX-aware guidance to `generate-prompt.md`                              |
| 4   | Background preservation is unconditional                                                                       | PPTX backgrounds are decorative overlays (dark gradients over photos) that don't fit restructured content | Make background preservation conditional — AI may change or drop backgrounds |
| 5   | No token estimate in cost display                                                                              | Users can't gauge cost before committing                                                                  | Add rough input/output token estimate to the modal                           |
| 6   | `buildDeckSummary` uses naive `split(/\n---\n/)`                                                               | `---` inside code blocks creates phantom slides, misaligning the outline                                  | Use fence-aware `splitSlides`                                                |

## Gap 1: Polish fidelity should use fix-prompt.md

### Problem

The `polish` (Tidy up) fidelity appends this vague suffix to `generate-prompt.md`:

```
Fidelity: TIDY UP. Fix formatting and layout choices only. Correct heading hierarchy, fix area markers, clean up spacing. Do not change wording, split, merge, or reorder slides. The output must have the same number of slides as the input.
```

But `fix-prompt.md` (used for single-slide "Clean up slide") has specific PPTX-relevant rules:

- Rejoin split code lines and add language tags
- Remove bold wrapping from headings
- Fix broken links, lists, and tables
- Fix mismatched layouts (downgrade media-span/two-column when no image)

These are exactly the problems PPTX import produces. The whole-deck "Tidy up" should apply the same specific rules.

### What's already done

- `expectedSlideCount` is already passed to the validator for all non-remix calls (line 205). Slide count enforcement works.
- `finish_reason: "length"` truncation detection is in place.

### Fix

When fidelity=polish, use `fix-prompt.md` as the user fragment instead of `generate-prompt.md`. The `fix-prompt.md` already says "Do not add or remove slides" and focuses on formatting fixes — perfect for polish mode.

**Changes:**

- **`src/data/ai/ai-intent-registry.js`** — Add `buildPolishMessages(markdown)` function that uses `fixPrompt` as the user fragment with generate-mode frontmatter stripping (so layout is stripped, AI can fix layout choices, keeps background/theme). Export it.

- **`src/data/ai/ai-prompt-builder.js`** — `buildBatchMessages`: add optional `fidelity` parameter. When `fidelity === "polish"`, use `fixPrompt` as the fragment instead of `generatePrompt`. Keep `mode` as `"generate"` for frontmatter stripping and pagination (polish strips layout like generate, not like fix). `buildGenerateOptionsSuffix`: remove the `polish` case from `fidelityMap` (the rules are in `fix-prompt.md` now). Keep `enhance`. The `rewrite` case is already removed.

- **`src/data/ai/ai-orchestrator.js`** — In `#runWholeDeckSingleCall`: when `operation.opts.fidelity === "polish"`, use `buildPolishMessages(context)` instead of `buildMessagesForIntent(intent, {markdown: context})`. Don't append `optionsSuffix` for polish (the fix-prompt has the rules; tone suffix is still appended via `optionsSuffix` — actually, keep `optionsSuffix` for tone, just remove the fidelity part from it). In `#processBatch`: pass `operation.opts.fidelity` to `buildBatchMessages`.

### Tone suffix handling for polish

`buildGenerateOptionsSuffix` still handles tone. After removing the `polish` fidelity case, the suffix for polish will only contain the tone line (if tone is set). This is correct — tone applies to polish too. The `optionsSuffix` is still appended in both `#runWholeDeckSingleCall` and `#processBatch`.

### Why not change `mode` to `"fix"` for polish?

`fix` mode in `stripFrontmatter` keeps `layout:` (so AI preserves it) and strips `background:`/`theme:`. `generate` mode strips `layout:` (so AI can pick a better one) and keeps `background:`/`theme:`. For polish, we want the AI to fix layout choices (e.g., downgrade media-span when there's no image), so it needs to see the layout but also be able to change it. Generate mode stripping is correct — strip layout so the AI assigns the best one, keep background/theme so the AI sees them.

### Why not use fix mode's neighbor context slides?

Fix mode adds "CONTEXT SLIDE" neighbors with explicit slide indices. This is useful for single-slide fix operations where the AI needs deck context. For whole-deck polish, the AI sees all slides at once (single-call) or a full batch with deck summary (batched). Neighbor context is unnecessary and would conflict with the generate-mode pagination instruction. Keep generate mode's content structure.

## Gap 2: Image handling guidance in prompts

### Problem

No prompt mentions images. The AI doesn't know:

- It can reposition images with `position: relative` + `left`/`top`/`width`/`height`
- It can drop low-quality or redundant images
- `<img>` tags should be preserved unless intentionally dropping them

### Fix

**`src/data/prompts/system-prompt.md`** — Add one rule after the existing rules (before "Allowed layouts"):

```
- Handle `<img>` tags in the input: preserve them unless the FIDELITY instruction says to drop specific images. When repositioning an image, use `style="position: relative; left: Npx; top: Npx; width: Npx;"` on the `<img>` tag for custom placement.
```

**`src/data/prompts/generate-prompt.md`** — Add to content strategy:

```
- Preserve `<img>` tags from the input. You may reposition images using `style="position: relative; left: ...; top: ...; width: ...;"` on the `<img>` tag for custom placement that doesn't fit the standard area layout.
- Drop images that are low quality, redundant, or don't add value to the slide.
```

## Gap 3: PPTX-specific guidance

### Problem

The AI doesn't know it's working with imported slides. PPTX imports produce:

- Wrong layouts (inferred from element positions)
- Misplaced images (dumped into @media or @main)
- Verbose text from text box extraction
- Decorative backgrounds with dark overlays

### Fix

**`src/data/prompts/generate-prompt.md`** — Add a PPTX-aware rule to content strategy:

```
- If the input appears to be from a PPTX import (mismatched layouts, images in wrong areas, verbose text boxes), fix the layout to match the actual content, reposition images to where they make sense, and tighten the text.
```

This is a single rule that triggers the AI's pattern recognition without requiring an explicit "this is PPTX" flag. The AI sees the symptoms and applies the fixes.

## Gap 4: Conditional background preservation

### Problem

`generate-prompt.md` says "Preserve each slide's `background:` and `theme:` directives from the input." This is unconditional. PPTX imports often have `background: linear-gradient(rgba(0,0,0,0.65),...), url(images/foo.png) center / cover no-repeat` — a dark overlay over a photo. When the AI restructures, these backgrounds may not fit the new content.

### Fix

**`src/data/prompts/generate-prompt.md`** — Change the existing rule (line 10):

From:

```
- Preserve each slide's `background:` and `theme:` directives from the input.
```

To:

```
- Preserve each slide's `theme:` directive. Keep `background:` directives unless they don't fit the restructured content — you may change or drop backgrounds that are decorative overlays or don't match the slide's purpose.
```

This gives the AI permission to drop decorative backgrounds while still preserving meaningful ones (solid colors, gradients that match the theme).

**`src/data/ai/ai-prompt-builder.js`** — `stripFrontmatter` in generate mode currently keeps `background:` and `theme:`. This is correct — the AI should see them to make informed decisions. No change needed.

## Gap 5: Token estimate in modal

### Problem

The modal shows slide count and API call count but no token estimate. Users can't gauge cost.

### Fix

**`src/data/ai/ai-token-estimator.js`** — Add exported `estimateTokenCounts(markdown, mode)`:

```javascript
export function estimateTokenCounts(markdown, mode = "generate") {
  const cleaned = stripFrontmatter(markdown, mode);
  const input = Math.ceil(cleaned.length / 4);
  const multiplier = mode === "generate" ? 1.8 : 1.2;
  const output = Math.ceil(input * multiplier);
  return { input, output };
}
```

This reuses the same heuristic as `estimateMaxTokens` (which already imports `stripFrontmatter` and uses `length / 4`). Keep the estimation logic in one place.

**`src/editor/ui/ai-generate-modal.js`** — Import `estimateTokenCounts`. Add a cost row after "Estimated API calls":

```javascript
const { input: inputTokens, output: outputTokens } = estimateTokenCounts(markdown, "generate");
```

Add row in the cost section:

```html
<div class="${P}cost-row">
  <span>Estimated tokens</span>
  <span>~${inputTokens.toLocaleString()} in / ~${outputTokens.toLocaleString()} out</span>
</div>
```

This is a rough estimate — the same heuristic used by `estimateMaxTokens`. It gives the user a ballpark.

## Gap 6: buildDeckSummary fence-aware split

### Problem

`buildDeckSummary` (line 148) uses `markdown.split(/\n---\n/)` which breaks on `---` inside code blocks, creating phantom slides and misaligning the outline.

### Fix

**`src/data/ai/ai-prompt-builder.js`** — `buildDeckSummary`: replace `markdown.split(/\n---\n/)` with `new MarkdownParser().splitSlides(markdown)`. This is the same fix already applied to `buildBatchMessages`, `extractDirectives`, and `injectDirectives`.

`MarkdownParser` is already imported at the top of the file (line 10).

## Files to Modify

| File                                       | Changes                                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/data/prompts/system-prompt.md`        | Add image handling rule (1 line)                                                                                                                                          |
| `src/data/prompts/generate-prompt.md`      | Add image positioning, PPTX guidance, conditional backgrounds (4 lines). Change background preservation rule.                                                             |
| `src/data/ai/ai-intent-registry.js`        | Add `buildPolishMessages(markdown)` function, export it                                                                                                                   |
| `src/data/ai/ai-prompt-builder.js`         | `buildBatchMessages`: accept `fidelity` param, use `fixPrompt` for polish. `buildGenerateOptionsSuffix`: remove `polish` case. `buildDeckSummary`: use fence-aware split. |
| `src/data/ai/ai-orchestrator.js`           | `#runWholeDeckSingleCall`: use `buildPolishMessages` when fidelity=polish. `#processBatch`: pass `fidelity` to `buildBatchMessages`.                                      |
| `src/data/ai/ai-token-estimator.js`        | Add `estimateTokenCounts(markdown, mode)` export                                                                                                                          |
| `src/editor/ui/ai-generate-modal.js`       | Add token estimate row in cost section                                                                                                                                    |
| `src/__tests__/ai-orchestrator.test.js`    | Add test: polish fidelity uses fix-prompt rules                                                                                                                           |
| `src/__tests__/ai-prompt-builder.test.js`  | Add test: buildDeckSummary fence-aware, buildBatchMessages with polish fidelity                                                                                           |
| `src/__tests__/ai-token-estimator.test.js` | Add test: estimateTokenCounts                                                                                                                                             |
| `docs/prompt-template.md`                  | Update prompt descriptions for image handling + PPTX guidance                                                                                                             |
| `CHANGELOG.md`                             | Add entries                                                                                                                                                               |

## Files NOT to Modify

- `src/data/prompts/fix-prompt.md` — already has the right rules for polish. No changes needed.
- `src/data/prompts/add-speaker-notes-prompt.md` — no changes needed.
- `src/data/prompts/remix-plan-prompt.md` — no changes in this phase (vision + keepImages deferred to D.2).
- `src/data/ai/ai-output-schema.js` — no new schema needed. Polish uses the `generate` schema (requireLayout: true) since it strips layout in generate mode.
- `src/data/ai/ai-output-validator.js` — no code changes. `expectedSlideCount` is already passed for all non-remix calls.
- `src/editor/core/edit-controller.js` — no changes. The orchestrator handles fidelity routing internally.

## Implementation Steps

### Step 1: Prompt fixes (Gaps 2, 3, 4)

1. **`src/data/prompts/system-prompt.md`** — Add image handling rule after the existing rules (before "Allowed layouts").

2. **`src/data/prompts/generate-prompt.md`** — Add image positioning, PPTX guidance, conditional background preservation. Change the existing "Preserve each slide's `background:` and `theme:` directives" line.

### Step 2: Polish fidelity uses fix-prompt.md (Gap 1)

3. **`src/data/ai/ai-intent-registry.js`** — Add `buildPolishMessages(markdown)`:

   ```javascript
   function buildPolishMessages(markdown) {
     const cleaned = stripFrontmatter(markdown, "generate");
     const composer = new AiPromptComposer({
       systemFragment: systemPrompt,
       userFragment: fixPrompt,
     });
     return composer.compose({ markdown: cleaned, layoutList: getAllowedLayoutList() });
   }
   ```

   Export it for the orchestrator to use.

4. **`src/data/ai/ai-prompt-builder.js`** — `buildBatchMessages`: add `fidelity` parameter (after `deckSummary`). When `fidelity === "polish"`, use `fixPrompt` as the fragment. `buildGenerateOptionsSuffix`: remove the `polish` case from `fidelityMap` (the rules are in `fix-prompt.md` now).

5. **`src/data/ai/ai-orchestrator.js`** — In `#runWholeDeckSingleCall`: when `operation.opts?.fidelity === "polish"`, use `buildPolishMessages(context)` instead of `buildMessagesForIntent(intent, {markdown: context})`. Import `buildPolishMessages` from `ai-intent-registry.js`.

   In `#processBatch`: pass `operation.opts?.fidelity` to `buildBatchMessages`. This requires passing `fidelity` through the batch params. The `#processBatch` call in the worker already has access to `operation` via the closure — add `fidelity: operation.opts?.fidelity` to the params object.

### Step 3: buildDeckSummary fence-aware split (Gap 6)

6. **`src/data/ai/ai-prompt-builder.js`** — `buildDeckSummary`: replace `markdown.split(/\n---\n/)` with `new MarkdownParser().splitSlides(markdown)`.

### Step 4: Token estimate in modal (Gap 5)

7. **`src/data/ai/ai-token-estimator.js`** — Add `estimateTokenCounts(markdown, mode)` export.

8. **`src/editor/ui/ai-generate-modal.js`** — Import `estimateTokenCounts`. Add token estimate row in cost section.

### Step 5: Tests

9. **`src/__tests__/ai-orchestrator.test.js`** — Add test: polish fidelity produces messages using fix-prompt rules (verify the user message contains "Rejoin split code lines" or similar fix-prompt text). The existing remix test pattern shows how to mock the provider and check the messages.

10. **`src/__tests__/ai-prompt-builder.test.js`** — Add test: `buildDeckSummary` with `---` inside code block doesn't create phantom slides. Add test: `buildBatchMessages` with `fidelity: "polish"` uses fix-prompt fragment (check user message contains fix-prompt text).

11. **`src/__tests__/ai-token-estimator.test.js`** — Add test: `estimateTokenCounts` returns reasonable estimates for generate and fix modes.

### Step 6: Docs + gates

12. **`docs/prompt-template.md`** — Update prompt descriptions for image handling, PPTX guidance, conditional backgrounds.

13. **`CHANGELOG.md`** — Add entries.

14. Run quality gates: lint, format, test, build.

## Verification

- [ ] `npm run lint` passes
- [ ] `npm run format:check` passes
- [ ] `npm test` — all existing + new tests pass
- [ ] `npm run build` succeeds
- [ ] Manual: import a PPTX → "Tidy up" → AI fixes split code lines, bold wrapping, broken links (not just "formatting")
- [ ] Manual: "Tidy up" → slide count unchanged (validator enforces — already works)
- [ ] Manual: "Restyle" → AI can reposition images with `position: relative` (verify in output markdown)
- [ ] Manual: "Restyle" → AI drops decorative `background:` that doesn't fit (verify in output)
- [ ] Manual: generate modal → token estimate row visible with reasonable numbers
- [ ] Manual: deck with `---` inside code block → `buildDeckSummary` doesn't create phantom slides (check plan log)
- [ ] Manual: "Remix" → still works (no regression from polish routing change)

## Risks

- **Polish routing change** — switching from `generate-prompt.md` to `fix-prompt.md` for polish changes the AI's behavior. The `fix-prompt.md` is more conservative (no wording changes). This is the intended behavior for "Tidy up" but users who expected wording changes from "Tidy up" will notice. The modal label says "fix formatting and layouts only" so this aligns with expectations.
- **Background preservation change** — allowing the AI to drop backgrounds could remove meaningful backgrounds. Mitigation: the prompt says "change or drop backgrounds that are decorative overlays or don't match" — the AI should preserve solid colors and meaningful gradients. The user can undo via Ctrl+Z.
- **Token estimate accuracy** — the `length / 4` heuristic is rough. Actual token counts vary by tokenizer. The estimate is labeled "estimated" and is for ballpark cost awareness, not precise billing.
- **`fix-prompt.md` says "Do not add or remove slides"** — this is correct for polish. The validator also enforces slide count (already implemented). Double safety.
- **Batched polish path** — `buildBatchMessages` with `fidelity: "polish"` uses `fixPrompt` but still adds the deck summary prefix and pagination instruction from the generate path. The `fix-prompt.md` says "Do not add or remove slides" which aligns with the pagination instruction ("Return exactly N slides"). No conflict.
- **Tone suffix for polish** — after removing the `polish` fidelity case from `buildGenerateOptionsSuffix`, the suffix for polish will only contain the tone line (if tone is set). This is correct — tone applies to polish too.
