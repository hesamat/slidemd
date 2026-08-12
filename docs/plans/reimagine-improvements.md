# Reimagine Mode — Improvement Plan (P1 & P2)

## Background

The reimagine mode (outline -> breakdown -> generate) was introduced in 0.9.1.
Real-world testing revealed four issues:

| Priority | Items  | Scope                                                 | Status          |
| -------- | ------ | ----------------------------------------------------- | --------------- |
| P0       | A1-A3  | Overflow: prompt caps + validator + repair            | Shipped (0.9.3) |
| P1       | B4, B5 | Color: remove neutral-only, add visual system palette | This plan       |
| P1       | C6, C7 | Images: source-image inventory + reuse pipeline       | This plan       |
| P2       | D8     | Voice: presentation-oriented prose                    | This plan       |

P0 is done. This document covers P1 (Color + Images) and P2 (Voice).

**Design decision — palette application:** The AI emits `background:` and
`theme:` directives from the visual system palette. The app does **not**
apply the palette programmatically post-generation. Rationale:

- The AI needs to know the final colors while composing (text color, image
  treatment, contrast decisions all depend on the background).
- The existing architecture already has the AI set `background:` and `theme:`.
- A programmatic post-pass would be a new token-resolution subsystem, which
  the `visual-system-beat-engine.md` plan explicitly rules out.
- A light validator check (flag missing `background:`/`theme:` when a visual
  system is present) is sufficient to catch drift via the repair loop.

---

## P1a — Color (B4, B5)

### B4: Remove neutral-only styling constraints

Multiple prompt locations force the AI to use the app's default neutral
styling and forbid `background:`, `theme:`, `color`, and `backgroundColor`.
These must be removed or relaxed for the reimagine flow so the AI can use
the visual system palette.

**Files to edit:**

| File                                                | Current behavior                                                                                  | Change                                                                                                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate-prompt.md` line 26                        | "Use the app's default neutral styling. Do not output `background:`, `theme:`..."                 | Replace with: when a `{{visualSystemBrief}}` is present, use the palette to set `background:` and `theme:`; when absent, fall back to the existing "pick one coherent visual theme" guidance |
| `generate-prompt.md` line 64                        | "No custom `background:`, `theme:`... are emitted"                                                | Remove this success criterion when a visual system is present                                                                                                                                |
| `visual-styling-note.md` (present variant)          | "Do not use the palette colors in `background:`... the app provides its own neutral color scheme" | Replace with: use the palette to set `background:` and `theme: dark`/`theme: light` per slide; maintain legibility                                                                           |
| `visual-identity-guidance.md` (discard variant)     | "Do not introduce new colors... The app provides its own neutral color scheme"                    | Replace with: when a visual system is present, use its palette; otherwise pick a coherent theme                                                                                              |
| `remix-visual-identity-guidance.md` (both variants) | "Do not introduce new colors... The app provides its own neutral color scheme"                    | Same change as above (remix does not use visual system today, but the discard variant should not forbid colors outright)                                                                     |
| `polish-prompt.md` lines 15, 26                     | "Do not add new `theme:`/`background:` values, colored text..."                                   | Leave unchanged — polish preserves existing styling and should not introduce new colors                                                                                                      |
| `fix-prompt.md` line 19                             | "Do NOT use `color` or `backgroundColor`"                                                         | Leave unchanged — single-slide fix is conservative                                                                                                                                           |
| `reimagine-outline-prompt.md` line 110              | "Do not preserve the original theme, colors, backgrounds"                                         | Already correct — the outline AI proposes a new visual direction                                                                                                                             |

**Non-goal:** Do not change the polish or fix-prompt flows. They are
conservative by design and should not start introducing new colors.

### B5: Add visual system palette to the generate prompt

This is the core of the `visual-system-beat-engine.md` plan — thread the
`visualSystem` from the outline output through to the generate prompt.

**Changes:**

1. **Outline output schema** — add `visualSystem` field (palette, typography,
   composition, imagery, motifs, contrastRules). Add `validateVisualSystem()`
   with `DEFAULT_VISUAL_SYSTEM` fallback. Validation is best-effort and
   decoupled from outline validation (palette is the only hard requirement;
   missing palette = full default; valid palette + missing fields = partial
   merge).

2. **Generate prompt** — add `{{visualSystemBrief}}` placeholder. When
   present, it expands to a formatted summary of the palette (hex colors),
   typography, composition, imagery mood, motifs, and contrast rules. The
   prompt instructs the AI to:
   - Set `background:` using the palette's `base`/`surface` colors.
   - Set `theme: dark` or `theme: light` based on the palette's luminance.
   - Use `accent` and `contrast` colors for emphasis (via `::: text-block`
     with `color`/`backgroundColor` attributes, which are already supported
     by the renderer).
   - Apply motifs and contrast rules as compositional guidance.

3. **Validator** — when a visual system is present, flag slides that are
   missing `background:` or `theme:` as a repair-worthy error (not a hard
   reject). This catches AI drift without a programmatic override.

4. **Outline modal** — add a read-only visual-system summary (color swatches
   with hex values, typography character, composition style, imagery mood,
   motifs). No editing UI.

**Non-goals:**

- No color-contrast helper / WCAG token resolver.
- No new renderer layout types.
- No CSS variable system — the AI emits directives the renderer already
  understands.

---

## P1b — Images (C6, C7)

### C6: Source-image inventory in the breakdown phase

The breakdown prompt currently allows `imageQuery: "reuse:<path>"` but does
not tell the AI which images exist in the source deck. As a result, the AI
cannot assign reuse queries because it doesn't know the paths.

**Changes:**

1. **Orchestrator** — extract the source deck's image inventory (paths + alt
   text) using the existing `SlideImageExtractor` (already used for vision).
   Pass the inventory to the breakdown phase as part of the virtual deck
   context.

2. **Breakdown prompt** — add a "Source images" section listing each image
   path and its alt text. Instruct the AI to assign
   `imageQuery: "reuse:<path>"` to slides where a source image is relevant.
   Do not require every slide to have an image — only assign reuse when the
   image adds value.

### C7: Image placement in the generate phase

The generate prompt currently only honors `reuse:<path>` but does not
explicitly instruct the AI to place the image in the slide.

**Changes:**

1. **Generate prompt** — when a `reuse:<path>` query is present in the brief
   comment, instruct the AI to place the image using `![alt](path)` in the
   appropriate area (usually `@media`, or `@main` for full-bleed layouts).
   The existing `| image: reuse:<path>` serialization in the brief comment
   already works; the prompt just needs to tell the AI to act on it.

2. **Validator** — add a warning-level check (not a hard error) when a slide
   has a `reuse:<path>` image query in its brief but no `<img>` or
   `![...](...)` in the generated markdown. This drives a repair retry.

**Non-goals:**

- No web image search (Unsplash, Pexels, etc.).
- No automatic image query generation for non-reuse queries.
- No image cropping or composition AI.

---

## P2 — Voice (D8)

### D8: Presentation-oriented prose

The generate prompt's content guidance produces flat, encyclopedic prose.
Slides read like textbook paragraphs rather than presentation talking points.

**Changes:**

1. **Generate prompt content guidance** — replace prescriptive content rules
   with presentation-oriented guidance:
   - Use conversational headlines (not full sentences, not label-only).
   - Prefer bullet points and short phrases over paragraphs.
   - One idea per bullet; no compound bullets.
   - Use progressive disclosure: headline teases, body delivers.
   - Vary sentence structure; avoid starting every bullet with a verb.
   - Use concrete examples, analogies, and real-world references.

2. **Flow-aware voice** — the existing `flow` option (story / technical /
   persuasive / instructional) should influence the voice:
   - **Story**: narrative arcs, anecdotes, before/after framing.
   - **Technical**: precise terminology, code examples, architecture diagrams.
   - **Persuasive**: problem-solution, evidence, calls to action.
   - **Instructional**: step-by-step, examples, tips/warnings.

3. **Beat-aware content density** (depends on P1a visual system work):
   - `punctuation` slides: 1-3 key points, large type, minimal text.
   - `emotional` slides: 1-2 lines, image-dominant.
   - `divider` slides: title + optional subtitle only.
   - `continuation` slides: normal density (within line budget).
   - `transition` slides: slightly reduced density to signal a shift.

4. **Speaker notes** — when `addSpeakerNotes` is enabled, instruct the AI to
   write notes in a conversational speaking voice, not as a restatement of
   the slide content.

**Non-goals:**

- No automated A/B testing of voice quality.
- No per-slide tone detection or adjustment.
- No LLM-as-judge scoring in the validation loop.

---

## Implementation Order

1. **P1a (color)** — remove neutral-only constraints, add visual system
   palette to the generate prompt. This is the largest change and unblocks
   beat-aware density in P2.
2. **P1b (images)** — source-image inventory + reuse pipeline. Independent
   of P1a but ships in the same PR to keep the reimagine flow coherent.
3. **P2 (voice)** — prompt edits only. Depends on beat metadata from P1a
   for beat-aware density; the rest can be done independently.

P1a + P1b should ship as one PR. P2 can ship as a follow-up PR or be
included if the review surface is manageable.
