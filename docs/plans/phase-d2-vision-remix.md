# Plan for Vision-Augmented Remix

### Goal

Send raw slide images (not screenshots) to the AI in the Remix plan phase so it can visually assess layout quality, image content, and content density. The AI decides which images to keep, where to place them, and whether to use custom positioning. Background images are dropped. Images are compressed to <40KB each. The user sees a token estimate and opts in via a toggle in the generate modal.

### Why Raw Images, Not Screenshots

PPTX import misplaces images — layout inference puts them in `@media` or `@main` based on heuristics. A screenshot would show the misplaced result. Instead, we send the raw image files so the AI sees the actual image content and can decide the best placement in the restructured deck.

### Architecture

```
User opens generate modal, selects "Remix"
  → Modal extracts image count + token estimate from markdown (no fetch, fast)
  → Modal shows "Send slide images to AI" toggle with estimated tokens (off by default)
  → User toggles on/off, clicks Generate
  → EditController passes includeImages to createOperation opts
  → AiOrchestrator.#runRemix() checks opts.includeImages
    If true:
      1. Extract content images from each slide (parseAllImages, filter backgrounds)
      2. Fetch + compress to <40KB each (canvas resize → JPEG, quality loop)
      3. Build multi-modal plan message (text outline + image blocks per slide)
      4. provider.chat() with multi-modal message
      5. If provider rejects images: retry text-only (fallback)
    If false: text-only plan (current behavior)
  → #planToVirtualDeck() respects keepImages → existing execute path (text-only)
```

### Image Compression

Each image compressed to <40KB before sending:

1. Fetch image → Blob → Image object (via `URL.createObjectURL`).
2. Draw to canvas at max 768px width (preserve aspect ratio).
3. `canvas.toDataURL("image/jpeg", 0.85)` → check base64 size.
4. If >40KB base64 (~30KB binary): reduce quality to 0.7, then 0.5, then 0.3.
5. If still >40KB: reduce width to 512px, repeat.
6. If still >40KB: reduce width to 256px (last resort).
7. Return compressed data URL.

### Image Token Estimation

OpenAI vision token formula (approximate):

- `tiles = ceil(width/512) * ceil(height/512)`
- `tokens = tiles * 170 + 85`

For a 768x576 image: `tiles = 2*2 = 4`, `tokens = 765`.
For a 512x384 image: `tiles = 1*1 = 1`, `tokens = 255`.

The modal estimates without fetching: assume 768px max width, compute tiles from aspect ratio (assume 4:3 if unknown), sum across all images.

### Modal UI Addition

When fidelity=rewrite, show a new row in the cost section:

```
[ ] Send slide images to AI (vision)    ~12,300 image tokens (16 images)
```

- Checkbox, off by default.
- Token estimate computed from image count + estimated dimensions (no fetch needed).
- Hidden when fidelity != rewrite.
- `includeImages` returned in `GenerateOptions`.

### Multi-Modal Message Format

OpenAI-compatible (internal representation):

```javascript
{
  role: "user",
  content: [
    { type: "text", text: "Analyze this deck...\n\nSlide 1: [header-content] Introduction\n..." },
    { type: "text", text: "Slide 1 images:" },
    { type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } },
    { type: "text", text: "Slide 2 images:" },
    { type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } },
  ]
}
```

Provider-specific mapping:

| Provider          | Image block format                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| OpenAI-compatible | `{ type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } }` — native pass-through |
| Anthropic         | `{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "..." } }`          |
| Gemini            | `{ inline_data: { mime_type: "image/jpeg", data: "..." } }`                                     |

### Background Image Dropping

1. Parse `background:` directive → extract `url(...)` srcs.
2. When collecting image srcs from `parseAllImages()`, skip any src matching a background image URL.
3. Only content images (inline `<img>` and `![alt](src)`) are sent.

### Plan Schema Addition

Add `keepImages` to plan entries:

```json
{
  "action": "rewrite",
  "source": [2],
  "brief": "Make this more concise",
  "title": "Roadmap",
  "keepImages": [0]
}
```

- `keepImages`: 0-based indices into the source slide's extracted images. Defaults to all if omitted. `[]` means drop all.

### Prompt Changes

#### `remix-plan-prompt.md` additions

```
- You will also receive the raw images from each slide (background images are excluded). Use these images to assess their content and quality when deciding whether to keep, rewrite, or merge slides.
- In the plan, each entry can reference which images to keep via the `keepImages` field (array of 0-based image indices from the source slide).
- When merging slides, choose which images from each source slide to keep in the merged output.
- You are not limited to placing images in a `@media` area. Images can be freely positioned using `position: relative` with `left`, `top`, `width`, and `height` style attributes on the `<img>` tag. Use this when an image needs custom placement that doesn't fit the standard area layout.
- If an image is low quality, redundant, or doesn't add value, drop it (don't include it in `keepImages`).
```

#### `generate-prompt.md` additions

```
- Images can be freely positioned using `position: relative` with `left`, `top`, `width`, and `height` style attributes on the `<img>` tag. Use this for custom placement. Example: `<img src="images/chart.png" style="position: relative; left: 20px; top: 10px; width: 400px;">`.
- You may drop images that are low quality, redundant, or don't add value to the slide.
- You may change or drop `background:` directives if they don't fit the restructured content.
```

#### `system-prompt.md` additions

```
- Handle `<img>` tags in the input: preserve them unless instructed to drop specific images. When repositioning, use `style="position: relative; left: ...; top: ...; width: ...;"` on the `<img>` tag.
```

### New Files

```
src/data/ai/
  ai-vision-message.js          # Build multi-modal messages + provider format helpers + token estimation
  slide-image-extractor.js      # Extract content images from markdown → fetch → compress → data URLs
src/__tests__/
  ai-vision-message.test.js     # Message building, base64 extraction, provider mappings, token estimation
  slide-image-extractor.test.js # Image extraction, background filtering, compression (mock canvas/fetch)
```

### Files to Modify

- `src/data/ai/ai-provider-client.js` — Update `ChatRequest` typedef to accept content arrays.
- `src/data/ai/anthropic-provider-client.js` — Handle array content in `_mapMessages` + `_concatText`.
- `src/data/ai/gemini-provider-client.js` — Handle array content in `_mapMessages`.
- `src/data/ai/ai-orchestrator.js` — In `#runRemix()`: extract images if `opts.includeImages`, pass to `#runRemixPlan()`, build multi-modal message, fallback to text-only on error. Update `#validatePlan()` for `keepImages`. Update `#planToVirtualDeck()` to filter images per `keepImages`.
- `src/data/ai/ai-operation.js` — Add `includeImages` to opts type (passthrough).
- `src/editor/ui/ai-generate-modal.js` — Add image toggle + token estimate row (visible when fidelity=rewrite). Return `includeImages` in `GenerateOptions`.
- `src/editor/core/edit-controller.js` — Pass `includeImages` to `createOperation` opts.
- `src/data/prompts/remix-plan-prompt.md` — Add image + positioning instructions, `keepImages` schema.
- `src/data/prompts/generate-prompt.md` — Add custom positioning note, image dropping, background changes.
- `src/data/prompts/system-prompt.md` — Add image handling rule.
- `ROADMAP.md` — Add Phase D.2 section.
- `CHANGELOG.md` — Add entry to `0.9.0`.
- `AGENTS.md` — Note new modules.
- `docs/prompt-template.md` — Note `remix-plan-prompt.md` receives images.

### Files NOT to Modify

- `src/editor/image/image-markdown-utils.js` — consumed as-is (`parseAllImages()`).
- `src/editor/image/deck-images-resolver.js` — consumed as-is (`resolvePreviewSrc()`).
- `src/renderer/html-export-manager.js` — pattern reused but not imported.
- `src/renderer/slide-renderer.js` — not used (no DOM rendering).
- `src/data/markdown-parser.js` — not used for image extraction.
- `src/data/ai/ai-prompt-composer.js` — consumed as-is.
- `src/data/ai/ai-response-parser.js` — consumed as-is.
- `src/editor/ai-sidebar.js` — no changes.
- `src/data/ai/ai-token-estimator.js` — image token estimation lives in `ai-vision-message.js`.

### Implementation Steps

#### Step 1: Multi-modal message builder + token estimation (pure logic)

1. Create `src/data/ai/ai-vision-message.js`:
   - `buildVisionMessage(text, slideImages)` → OpenAI-format content array.
   - `extractBase64FromDataUri(dataUri)` → `{mimeType, data}`.
   - `mapContentForAnthropic(content)` — convert to Anthropic format.
   - `mapContentForGemini(content)` — convert to Gemini format.
   - `stripImages(content)` — return text-only string (for fallback).
   - `estimateImageTokens(width, height)` → number.
   - `estimateTotalImageTokens(imageCount, avgWidth, avgHeight)` → number.

2. Create `src/__tests__/ai-vision-message.test.js`.

#### Step 2: Provider client multi-modal support

3. Update `src/data/ai/ai-provider-client.js` — typedef only.
4. Update `src/data/ai/anthropic-provider-client.js` — handle array content.
5. Update `src/data/ai/gemini-provider-client.js` — handle array content.

#### Step 3: Slide image extractor with compression

6. Create `src/data/ai/slide-image-extractor.js`:
   - `async extractAll(markdown)` → `Promise<Array<string[] | null>>`.
   - `async compressImage(dataUrl, maxBytes)` → compressed data URL.
   - `countContentImages(markdown)` → `{count, estimatedTokens}` (fast, no fetch).

7. Create `src/__tests__/slide-image-extractor.test.js`.

#### Step 4: Generate modal — image toggle + token estimate

8. Update `src/editor/ui/ai-generate-modal.js`:
   - Call `countContentImages(markdown)` on open when fidelity=rewrite.
   - Add toggle row with token estimate.
   - Return `includeImages` in `GenerateOptions`.

9. Update `src/editor/core/edit-controller.js` — pass `includeImages` to opts.

#### Step 5: Orchestrator integration

10. Update `src/data/ai/ai-orchestrator.js`:
    - `#runRemix()`: extract images if `opts.includeImages`, pass to plan.
    - `#runRemixPlan()`: build multi-modal message, fallback on error.
    - `#validatePlan()`: accept optional `keepImages`.
    - `#planToVirtualDeck()`: filter images per `keepImages`.

#### Step 6: Prompt updates

11. Update `remix-plan-prompt.md`, `generate-prompt.md`, `system-prompt.md`.

#### Step 7: Tests + docs

12. Add orchestrator remix-vision tests.
13. Update ROADMAP, CHANGELOG, AGENTS.md, prompt-template.md.
14. Run quality gates.

### Verification

- [ ] `npm run lint` passes
- [ ] `npm run format:check` passes
- [ ] `npm test` — all existing + new tests pass
- [ ] `npm run build` succeeds
- [ ] Manual: generate modal + Remix → image toggle appears with token estimate
- [ ] Manual: toggle on → Generate → plan phase extracts + compresses images → AI receives image blocks
- [ ] Manual: toggle off → Generate → text-only plan (current behavior)
- [ ] Manual: deck with background images → backgrounds NOT sent, only content images
- [ ] Manual: text-only model + toggle on → plan fails → retries text-only → plan works
- [ ] Manual: PPTX-imported deck → AI sees raw images → can decide custom positioning
- [ ] Manual: each compressed image <40KB (verify in DevTools)
- [ ] Manual: "Tidy up" and "Restyle" → no image toggle
- [ ] Manual: plan with `keepImages: []` → virtual deck has images stripped

### Risks

- **Token cost** — each <40KB image ~10K tokens. 20-slide deck with 1 image each = ~200K image tokens. Modal shows estimate, user opts in, off by default.
- **Compression quality** — JPEG 85% at 768px is readable for charts/diagrams but loses fine detail. Acceptable for content assessment.
- **Canvas in tests** — jsdom doesn't support canvas. Tests mock `canvas.toDataURL` and `Image`.
- **Image fetch failures** — broken URLs, expired blob URLs, CORS → skip image, continue.
- **Vision model detection** — graceful fallback (retry text-only on error).
- **`keepImages` indexing** — images indexed by appearance order via `parseAllImages()`. Consistent between plan call and virtual deck.
- **Execute phase unchanged** — only plan phase gets images. `keepImages` filtering in `#planToVirtualDeck()`.
- **No html2canvas** — no new dependencies. Images extracted from markdown + fetched + compressed via canvas API.
