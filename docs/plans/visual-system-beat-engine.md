# Visual System & Beat Engine — Implementation Reference

This document describes the implemented visual-system and beat-engine plumbing for Reimagine mode. It is the lower-level reference for the schema, beat metadata, normalization, and outline → breakdown → generate data flow.

The product-facing direction lives in [`reimagine-improvements.md`](reimagine-improvements.md).

```text
OUTLINE AI
    ↓
visualSystem { visualDirection: string }
    ↓
BREAKDOWN AI
    ↓
visualBeat + energy + contrast + relationship
    ↓
GENERATE AI
    ↓
existing renderer
```

The **Outline AI** defines a deck-wide visual language as a freeform string.
The **Breakdown AI** assigns each slide a semantic visual role (beat).
The **Generate AI** uses both to compose the actual slide.

The implementation is intentionally lightweight. There is no generalized visual rhythm engine, image-search system, or new rendering subsystem.

---

# 1. Visual System

The `visualSystem` field on the Outline output is a single freeform string.

```js
/**
 * @typedef {Object} VisualSystem
 * @property {string} visualDirection
 */
```

Validation is a plain function `validateVisualSystem(obj)` in [`src/data/ai/visual-system-schema.js`](../../src/data/ai/visual-system-schema.js) that returns a normalized `VisualSystem` or `null` (triggering fallback). No Zod — the codebase uses plain JS validators.

## Legacy shapes

The validator accepts two legacy shapes for backwards compatibility with older saved decks:

- `{ mood: string, styleNotes: string }` — merged into a single `visualDirection`.
- `{ palette: { base, accent, highlight } }` — converted to a prose description of background tones (dark/light/bright) rather than forwarding specific hex colors.

## Default

`DEFAULT_VISUAL_SYSTEM` is a neutral editorial direction that instructs the AI to vary backgrounds, pair `theme:` with `background:`, and use kept images for emotional beats.

---

# 2. Breakdown-Level Visual Beats

Each breakdown slide carries beat metadata:

```js
/**
 * @typedef {Object} SlideBeat
 * @property {('continuation'|'transition'|'punctuation'|'emotional'|'divider')} visualBeat
 * @property {('low'|'medium'|'high')} energy
 * @property {('subtle'|'moderate'|'strong')} contrast
 * @property {('continue'|'break')} relationship
 * @property {string} [imageQuery]
 */
```

Defaults: `energy = "medium"`, `contrast = "moderate"`, `relationship = "continue"`.

### Beat semantics

| Beat         | Meaning                                                           |
| ------------ | ----------------------------------------------------------------- |
| continuation | Maintain the established visual language. Default.                |
| transition   | Move from one visual/narrative chapter to another.                |
| punctuation  | High-emphasis moment: key statistic, conclusion, quote, takeaway. |
| emotional    | Imagery or atmosphere carries more of the communication.          |
| divider      | Chapter/section marker with minimal content.                      |

`relationship: break` means the slide should deliberately contrast with the preceding treatment. `relationship: continue` means preserve visual continuity.

---

# 3. Prompt Changes

## Outline Prompt

`reimagine-outline-prompt.md` asks the AI to produce a `visualDirection` as freeform text describing the mood and rules of thumb for choosing backgrounds and layouts. The prompt does not request a structured palette.

## Breakdown Prompt

`reimagine-breakdown-prompt.md` receives the `visualDirection` via the `{{visualSystem}}` placeholder (serialized by `serializeVisualSystemForBreakdown` in `ai-prompt-fragments.js`). The prompt instructs the AI to assign a `visualBeat` and `imageQuery` to each slide consistent with the visual direction.

The breakdown prompt includes background/layout guidance per beat type and instructs the AI to vary backgrounds across the deck.

### Image queries

`imageQuery` is parsed, validated, and passed to the generate AI as `| image: <query>` inside the `<!-- brief: ... -->` slide separator. Only `reuse:<path>` queries are honored; any other query is ignored by the generate AI. This keeps the reuse path explicit and prevents fabricated image URLs.

## Generate Prompt

The generate prompt receives the visual direction via `buildVisualSystemBrief` in the options suffix (not a placeholder in the prompt template). When a `visualSystem` is present, the `present` variant of `visual-styling-note.md` is injected into the generate prompt, providing:

- instructions to follow the visual direction closely
- rules for pairing `theme:` with `background:`
- guidance on valid background values (hex, `rgb()`, `hsl()`, gradients, kept images — no named CSS colors, no color+image combos)
- beat-to-treatment mapping (layout and background guidance per beat type)
- energy/contrast/relationship modifiers

When no `visualSystem` is present, the `absent` or `absent-preserve` variant is used, which tells the AI to use the app's default neutral styling or preserve the source slide's visual identity.

### Per-slide beat serialization

The orchestrator serializes beat metadata into the brief comment:

```html
<!-- brief: {title} — {intent} (chapter: {title} — {summary}) | beat: punctuation, energy: high, contrast: strong, relationship: break | image: reuse:images/photo.jpg -->
```

This keeps a single comment per slide. The generate prompt tells the AI to read the `| beat: ...` suffix and apply the beat→treatment mapping from `visual-styling-note.md`.

---

# 4. Beat Normalization

`beat-normalizer.js` applies a small deterministic post-processing step after the Breakdown AI:

1. If the first slide is `divider`, `punctuation`, or `emotional`, change it to `continuation`. (A high-impact beat on slide 1 has no preceding state to transition from.)
2. If two high-impact beats (`punctuation`, `emotional`, `divider`) occur consecutively, downgrade the second to `continuation`.
3. Preserve all other model decisions.

No mathematical beat quotas, complex spacing optimization, chapter-aware beat scheduling, or beat scoring.

---

# 5. Post-Processing: applyVisualSystemIdentity

`applyVisualSystemIdentity` in `ai-prompt-fragments.js` runs after the Generate AI produces markdown. It does structural normalization only — it never reads `visualDirection`:

- Infers `theme:` from `background:` when the AI omits it.
- Replaces invalid/blank/transparent backgrounds with a fallback dark or light color.
- Rejects CSS named colors (e.g. `red`, `white`) in favor of explicit hex/rgb/hsl values.
- Does not append a fallback color to image-only backgrounds.
- Drops stray `<!-- visual-system: ... -->` comments from the output.

---

# 6. Orchestrator Data Flow

```text
Outline result
  → visualSystem { visualDirection }

Breakdown input
  → visualSystem (serialized via serializeVisualSystemForBreakdown)

Breakdown result
  → visualBeat metadata per slide

Generate input
  → visualSystem (via buildVisualSystemBrief in options suffix)
  → visualBeat metadata (via brief comment suffix)
```

The orchestrator keeps the data intact between stages. `visualSystem` validation is best-effort and decoupled from outline validation — the outline parser still throws if `plan` or `chapters` are missing, but a missing/invalid `visualSystem` silently falls back to `DEFAULT_VISUAL_SYSTEM`.

---

# 7. Modal / UI

The review modal (`ai-reimagine-outline-modal.js`) shows:

- The editable `plan` textarea.
- The editable `visualDirection` textarea (the card header says "Visual direction").
- The chapter-grouped outline with editable chapter titles, flow tags, and slide titles/intents.

The `visualDirection` is editable — the user can modify it before generation. The modal's close callback passes `outline.visualSystem` through with the user's edits.

---

# 8. Tests

### Schema tests (`visual-system-schema.test.js`)

- Valid `visualDirection` string.
- Empty `visualDirection` → `null`.
- Legacy `{ mood, styleNotes }` shape is merged.
- Legacy `{ palette: {...} }` shape is converted.
- Fallback to `DEFAULT_VISUAL_SYSTEM` when invalid.

### Beat normalization tests (`beat-normalizer.test.js`)

- First slide `punctuation`/`divider`/`emotional` → `continuation`.
- Consecutive high-impact beats → second downgraded to `continuation`.
- Normal sequences remain unchanged.

### Prompt builder tests (`ai-prompt-builder.test.js`)

- `applyVisualSystemIdentity` infers theme, replaces invalid backgrounds, rejects named colors.
- Image-only backgrounds are kept without fallback color appended.
- `buildVisualSystemBrief` wraps the visual direction with prompt-injection delimiters.
- `buildAvailableImagesBrief` serializes image paths as JSON.

### Modal tests (`ai-reimagine-outline-modal.test.js`)

- Modal displays and edits `visualDirection`.
- Modal returns `visualSystem` in the resolved outline.
- Modal handles missing `visualSystem` gracefully.

### Remaining test gaps

- End-to-end pipeline test (outline → breakdown → generate) verifying `visualDirection` threading.
- Beat-to-treatment and voice tests.
- Flow-specific technique menu and `flowTag` vocabulary tests.

---

# 9. Implementation Principle

> **LLM proposes; deterministic code validates obvious failures; the existing renderer renders; the user remains in control of the creative direction.**

The goal is a better visual language and visual rhythm model, not encoding graphic design into TypeScript.
