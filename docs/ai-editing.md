# AI Editing

SlideMD includes built-in AI editing for refining slides individually or across the whole deck. Configure a provider in **Settings** (supports OpenRouter, OpenAI, Anthropic, Gemini, Ollama, LM Studio, and custom OpenAI-compatible endpoints).

## Single-Slide AI

Available from the AI dropdown in the editor toolbar:

- **Enhance slide** — cleans up formatting, headers, code blocks, and layout without changing content.
- **Add speaker notes** — generates speaker notes for the current slide without modifying visible content.

Both are undoable via `Ctrl+Z`.

## Whole-Deck AI

Available from "Refine all slides" in the AI dropdown:

- **Polish** — fix formatting, wording, and layouts. Keeps the slide count and order.
- **Remix** — two-phase plan→execute flow: a planning call produces a restructuring plan (polish/rewrite/merge), then the execute phase generates the new deck. Moderate creative freedom; preserves visual identity by default.
- **Reimagine** — same two-phase flow, with the freedom to rethink the topic, examples, notes, and visuals for a fresh deck. The AI's outline includes a freeform visual direction (mood, background rules) that the user can edit before generation.

### Options

- **Flow** — Instructional / Story / Technical / Persuasive
- **Speaker notes** — generate notes during the refine
- **Vision** — send content images to the AI for visual-aware restructuring (Remix/Reimagine only). Automatically falls back to text-only if the model doesn't support images.
- **Preserve visual identity** — keep existing backgrounds and themes (Remix only; Reimagine always discards them).

Whole-deck refine is undoable via `Ctrl+Z`.

## Provider Setup

Open **Settings** from the menu to configure:

- **API key** — required for cloud providers (OpenRouter, OpenAI, Anthropic, Gemini). Leave empty for local providers (Ollama, LM Studio).
- **Base URL** — defaults to `https://openrouter.ai/api/v1`. Change to point to a custom endpoint.
- **Model** — free-text field when using a non-OpenRouter base URL; searchable dropdown for OpenRouter.
- **Reasoning** — optional extended thinking for better results, if the model supports it.

## How It Works

1. The AI receives your slide markdown plus a system prompt defining the allowed layouts and content rules.
2. The returned markdown is parsed and validated — invalid layouts, missing areas, or overflow are caught and a repair message is sent back to the AI.
3. Validated results are applied as patches through the `DeckStore`, making them undoable.
4. For single-slide edits, a conflict resolver checks if you've typed anything since the request started and offers "Keep my edits" or "Overwrite with AI".

The AI behavior is defined in [src/data/prompts/](../src/data/prompts/) — see [docs/prompt-template.md](prompt-template.md) for the prompt structure. For the AI/tool feature boundary, see [docs/ai-positioning.md](ai-positioning.md).
