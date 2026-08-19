// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import markdownit from "markdown-it";
import { AiOrchestrator, isVisionError } from "../data/ai/ai-orchestrator.js";
import { createOperation } from "../data/ai/ai-operation.js";
import { DEFAULT_VISUAL_SYSTEM } from "../data/ai/visual-system-schema.js";

// The output validator renders markdown through markdown-it (window.markdownit),
// which is only defined in jsdom. With it available, validation runs for real;
// tests that want to exercise the retry/repair path must supply a genuine
// validation failure (e.g. an invalid area, fabricated image URL, or wrong
// slide count). Identity-preservation retries are no longer used in remix
// because identity is enforced mechanically after the execute phase.
beforeAll(() => {
  window.markdownit = markdownit;
});

// Mock slide-image-extractor so we don't need canvas/Image in orchestrator tests.
// The actual extractAll is async and fetches images; here we return fake data URLs.
vi.mock("../data/ai/slide-image-extractor.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    extractAll: vi.fn(async () => [null, null]), // overridden per-test
  };
});

/**
 * Create a mock provider that returns the given content.
 */
function mockProvider(content) {
  return {
    chat: vi.fn().mockResolvedValue({
      content,
      raw: { finish_reason: "stop" },
    }),
  };
}

/**
 * Create a mock provider that returns different content per call.
 */
function mockProviderSequence(contents) {
  let idx = 0;
  return {
    chat: vi.fn().mockImplementation(() => {
      const content = contents[idx % contents.length];
      idx++;
      return Promise.resolve({ content, raw: { finish_reason: "stop" } });
    }),
  };
}

const SINGLE_SLIDE_MD = "layout: header-content\n@header\n## Title\n\n@main\n- Item 1\n- Item 2";

const SINGLE_SLIDE_RESPONSE = JSON.stringify({
  slides: [
    {
      layout: "header-content",
      content: "@header\n## Title\n\n@main\n- Summarized point",
    },
  ],
});

describe("AiOrchestrator", () => {
  describe("runSingleSlideOperation", () => {
    it("returns a SlidePatch with source: 'ai'", async () => {
      const provider = mockProvider(SINGLE_SLIDE_RESPONSE);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("enhanceSlide", 0, SINGLE_SLIDE_MD);
      const patches = await orchestrator.runSingleSlideOperation(op);
      expect(patches).toHaveLength(1);
      expect(patches[0].index).toBe(0);
      expect(patches[0].before).toBe(SINGLE_SLIDE_MD);
      expect(patches[0].source).toBe("ai");
      expect(patches[0].after).toContain("@header");
    });

    it("throws for non-single-slide intent", async () => {
      const provider = mockProvider("{}");
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, SINGLE_SLIDE_MD);
      await expect(orchestrator.runSingleSlideOperation(op)).rejects.toThrow(
        "not a single-slide intent",
      );
    });

    it("throws when AI returns no slides", async () => {
      const provider = mockProvider(JSON.stringify({ slides: [] }));
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("enhanceSlide", 0, SINGLE_SLIDE_MD);
      await expect(orchestrator.runSingleSlideOperation(op)).rejects.toThrow("no slides");
    });

    it("throws when AI returns invalid JSON", async () => {
      const provider = mockProvider("not json at all");
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("enhanceSlide", 0, SINGLE_SLIDE_MD);
      await expect(orchestrator.runSingleSlideOperation(op)).rejects.toThrow("valid JSON");
    });

    it("retries on validation failure and accepts after max attempts", async () => {
      // Return a slide with an invalid area to trigger validation failure
      const badResponse = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content: "@nonexistent\n## Bad area",
          },
        ],
      });
      const provider = mockProvider(badResponse);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("enhanceSlide", 0, SINGLE_SLIDE_MD);
      const patches = await orchestrator.runSingleSlideOperation(op);
      // Should still return a patch after accepting with validation issues
      expect(patches).toHaveLength(1);
      expect(provider.chat).toHaveBeenCalledTimes(3); // max 3 attempts
    });

    it("passes the abort signal to the provider", async () => {
      const provider = mockProvider(SINGLE_SLIDE_RESPONSE);
      const orchestrator = new AiOrchestrator({ provider });
      const controller = new AbortController();
      const op = createOperation("enhanceSlide", 0, SINGLE_SLIDE_MD);
      await orchestrator.runSingleSlideOperation(op, controller.signal);
      expect(provider.chat).toHaveBeenCalledWith(expect.any(Object), controller.signal);
    });

    it("preserves background and theme directives that the AI dropped", async () => {
      const slideWithBg =
        "layout: header-content\nbackground: linear-gradient(135deg, #1a2a6c, #b21f1f)\ntheme: dark\n@header\n## Title\n\n@main\n- Item 1";
      // AI response omits background and theme
      const responseNoBg = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content: "@header\n## Title\n\n@main\n- Cleaned up item",
          },
        ],
      });
      const provider = mockProvider(responseNoBg);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("enhanceSlide", 0, slideWithBg);
      const patches = await orchestrator.runSingleSlideOperation(op);
      expect(patches).toHaveLength(1);
      expect(patches[0].after).toContain("background: linear-gradient(135deg, #1a2a6c, #b21f1f)");
      expect(patches[0].after).toContain("theme: dark");
    });
  });

  describe("runOperation (unified entry point)", () => {
    it("returns { patches } for single-slide operations", async () => {
      const provider = mockProvider(SINGLE_SLIDE_RESPONSE);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("enhanceSlide", 2, SINGLE_SLIDE_MD);
      const result = await orchestrator.runOperation(op);
      expect(result.patches).toHaveLength(1);
      expect(result.patches[0].index).toBe(2);
      expect(result.markdown).toBeUndefined();
    });

    it("returns { markdown } for whole-deck operations", async () => {
      const deckMd = SINGLE_SLIDE_MD; // 1 slide → single-call path
      const provider = mockProvider(SINGLE_SLIDE_RESPONSE);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deckMd);
      const result = await orchestrator.runOperation(op);
      expect(result.markdown).toContain("@header");
      expect(result.patches).toBeUndefined();
    });
  });

  describe("runWholeDeckOperation", () => {
    it("throws for non-generate intent", async () => {
      const provider = mockProvider("{}");
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("enhanceSlide", null, SINGLE_SLIDE_MD);
      await expect(orchestrator.runWholeDeckOperation(op)).rejects.toThrow(
        'only supports "generate"',
      );
    });

    it("uses single-call path for small decks (≤8 slides)", async () => {
      const provider = mockProvider(SINGLE_SLIDE_RESPONSE);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, SINGLE_SLIDE_MD);
      const result = await orchestrator.runWholeDeckOperation(op);
      expect(result).toContain("@header");
      // Single-call path: 1 or 2 calls (retry on validation failure)
      expect(provider.chat).toHaveBeenCalled();
    });

    it("re-injects background/theme directives the AI dropped", async () => {
      const deckWithBg =
        "layout: header-content\nbackground: red\ntheme: dark\n@header\n## Title\n\n@main\n- Item 1";
      const provider = mockProvider(SINGLE_SLIDE_RESPONSE);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deckWithBg);
      const result = await orchestrator.runWholeDeckOperation(op);
      expect(result).toContain("background: red");
      expect(result).toContain("theme: dark");
    });

    it("uses batched path for large decks (>8 slides)", async () => {
      // Build a 12-slide deck
      const slides = Array.from(
        { length: 12 },
        (_, i) => `layout: header-content\n@header\n## Slide ${i + 1}\n\n@main\n- Item ${i + 1}`,
      );
      const deckMd = slides.join("\n\n---\n\n");

      const batchResponse = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content: "@header\n## Enhanced\n\n@main\n- Enhanced item",
          },
        ],
      });
      const provider = mockProvider(batchResponse);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deckMd);
      const progressCalls = [];
      const result = await orchestrator.runWholeDeckOperation(
        op,
        undefined,
        (completed, total, batch) => progressCalls.push({ completed, total, batch }),
      );
      expect(result).toContain("@header");
      // First call reports 0/12 immediately so the UI can show progress before
      // the first batch completes; then one call per completed batch (2 batches).
      expect(progressCalls).toHaveLength(3);
      expect(progressCalls[0].completed).toBe(0);
      expect(progressCalls[0].total).toBe(12);
      expect(progressCalls[1].total).toBe(12);
      expect(progressCalls[1].completed).toBe(8);
      expect(progressCalls[2].completed).toBe(12);
    });

    it("polish mode uses polish-prompt rules (not generate-prompt)", async () => {
      // polish-prompt.md contains "Rejoin split code lines" — generate-prompt does not.
      // Verify the message sent to the provider includes polish-prompt text.
      const provider = mockProvider(SINGLE_SLIDE_RESPONSE);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, SINGLE_SLIDE_MD, { mode: "polish" });
      await orchestrator.runWholeDeckOperation(op);
      const userMsg = provider.chat.mock.calls[0][0].messages.find(
        (m) => m.role === "user",
      ).content;
      expect(userMsg).toContain("Rejoin split code lines");
    });

    it("polish mode does not append a stale Fidelity suffix", async () => {
      // The mode-aware suffix should not contain the old "Fidelity:" text.
      const provider = mockProvider(SINGLE_SLIDE_RESPONSE);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, SINGLE_SLIDE_MD, { mode: "polish" });
      await orchestrator.runWholeDeckOperation(op);
      const userMsg = provider.chat.mock.calls[0][0].messages.find(
        (m) => m.role === "user",
      ).content;
      expect(userMsg).not.toContain("Fidelity:");
    });

    it("polish mode strips fabricated image filenames from the output", async () => {
      // A model that hallucinates a new filename should not end up in the deck
      // even after the two-attempt repair loop accepts the output.
      const deckWithImage = `layout: header-content
@header
# Title

@main
<img src="images/image16-3245.jpeg" alt="Photo">`;
      const fabricatedResponse = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content: `@header
# Title

@main
<img src="images/image16-2349.jpeg" alt="Photo">`,
          },
        ],
      });
      const provider = mockProvider(fabricatedResponse);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deckWithImage, { mode: "polish" });
      const logs = [];
      const result = await orchestrator.runWholeDeckOperation(op, undefined, {
        onLog: (msg, level) => logs.push({ msg, level }),
      });
      expect(result).not.toContain("images/image16-2349.jpeg");
      expect(logs.some((l) => l.msg.includes("Removing fabricated image"))).toBe(true);
    });
  });

  describe("runWholeDeckOperation (remix)", () => {
    const TWO_SLIDE_MD =
      "layout: header-content\n@header\n## Slide 1\n\n@main\n- Item 1\n\n---\n\nlayout: header-content\n@header\n## Slide 2\n\n@main\n- Item 2";
    const THREE_SLIDE_MD = `${TWO_SLIDE_MD}\n\n---\n\nlayout: header-content\n@header\n## Slide 3\n\n@main\n- Item 3`;

    const REMIX_PLAN_RESPONSE = JSON.stringify({
      plan: [
        {
          action: "polish",
          source: [0],
          brief: "Tighten the title wording",
          reason: "Already clear",
          title: "Slide 1",
        },
        {
          action: "rewrite",
          source: [1],
          brief: "Make this more concise",
          reason: "Content is verbose",
          title: "Slide 2",
        },
      ],
    });

    // All plan entries are sent to the execute call as a virtual deck, so the
    // mock response contains 2 slides (one per plan entry).
    const EXECUTE_RESPONSE = JSON.stringify({
      slides: [
        {
          layout: "header-content",
          content: "@header\n## Slide 1\n\n@main\n- Item 1",
        },
        {
          layout: "header-content",
          content: "@header\n## Slide 2\n\n@main\n- Concise point",
        },
      ],
    });

    it("logs estimated input tokens before the plan request and actual usage after", async () => {
      const provider = {
        chat: vi
          .fn()
          .mockResolvedValueOnce({
            content: REMIX_PLAN_RESPONSE,
            usage: { prompt_tokens: 512, completion_tokens: 128, total_tokens: 640 },
            raw: { finish_reason: "stop" },
          })
          .mockResolvedValueOnce({ content: EXECUTE_RESPONSE, raw: { finish_reason: "stop" } })
          .mockResolvedValueOnce({ content: EXECUTE_RESPONSE, raw: { finish_reason: "stop" } }),
      };
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "remix" });
      const logs = [];
      await orchestrator.runWholeDeckOperation(op, undefined, {
        onLog: (msg) => logs.push(msg),
      });

      // Pre-request estimate log
      expect(
        logs.some((l) => l.includes("[Tokens] Plan request") && l.includes("estimated input")),
      ).toBe(true);
      // Post-response actual usage log, using the provider's reported numbers
      expect(
        logs.some(
          (l) =>
            l.includes("[Tokens] Plan response") &&
            l.includes("512 prompt") &&
            l.includes("128 completion") &&
            l.includes("640 total"),
        ),
      ).toBe(true);
    });

    it("runs plan phase then execute phase for mode=remix", async () => {
      // Provide enough execute responses for validation retries
      const provider = mockProviderSequence([
        REMIX_PLAN_RESPONSE,
        EXECUTE_RESPONSE,
        EXECUTE_RESPONSE,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "remix" });
      const logs = [];
      const result = await orchestrator.runWholeDeckOperation(op, undefined, {
        onLog: (msg) => logs.push(msg),
      });

      // At least 2 LLM calls: plan + execute (possibly more if validation retries)
      expect(provider.chat.mock.calls.length).toBeGreaterThanOrEqual(2);
      // Result contains slide content
      expect(result).toContain("@header");
      expect(result).toContain("Slide 1");
      expect(result).toContain("Slide 2");
      // Plan entries were logged
      expect(logs.some((l) => l.includes("[Plan] Polish"))).toBe(true);
      expect(logs.some((l) => l.includes("[Plan] Rewrite"))).toBe(true);
    });

    it("falls back to original source slides when execute returns a mismatched slide count", async () => {
      // The execute phase returns zero slides even though the plan has two
      // entries. The fallback should use the joined original source slides for
      // each missing entry so the deck doesn't contain literal `undefined`.
      const MISSING_EXECUTE_RESPONSE = JSON.stringify({
        slides: [],
      });
      const provider = mockProviderSequence([
        REMIX_PLAN_RESPONSE,
        MISSING_EXECUTE_RESPONSE,
        MISSING_EXECUTE_RESPONSE,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "remix" });
      const logs = [];
      const result = await orchestrator.runWholeDeckOperation(op, undefined, {
        onLog: (msg) => logs.push(msg),
      });

      expect(logs.some((l) => l.includes("expected 2 slide(s), got 0"))).toBe(true);
      expect(result).toContain("Slide 1");
      expect(result).toContain("Slide 2");
      expect(result).not.toContain("undefined");
    });

    it("repairs execute output that drops identity or fabricates image URLs", async () => {
      const THEMED_DECK =
        'layout: header-content\ntheme: dark\nbackground: #1a1a2e\n@header\n## Slide 1\n\n@main\n<img src="images/a.png">\n\n---\n\nlayout: header-content\n@header\n## Slide 2\n\n@main\n- Item 2';
      const THEMED_PLAN_RESPONSE = JSON.stringify({
        plan: [
          {
            action: "rewrite",
            source: [0],
            brief: "Tighten the slide",
            reason: "Content is verbose",
            title: "Slide 1",
          },
          {
            action: "polish",
            source: [1],
            brief: "Tighten the wording",
            reason: "Fine as-is",
            title: "Slide 2",
          },
        ],
      });
      // First attempt drops theme/background and invents an external image URL.
      const BAD_EXECUTE_RESPONSE = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content:
              '@header\n## Slide 1\n\n@main\n- Concise\n\n<img src="https://example.com/invented.png">',
          },
          {
            layout: "header-content",
            content: "@header\n## Slide 2\n\n@main\n- Item 2",
          },
        ],
      });
      // Repair attempt restores identity and uses only the source image.
      const GOOD_EXECUTE_RESPONSE = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content:
              'theme: dark\nbackground: #1a1a2e\n@header\n## Slide 1\n\n@main\n- Concise\n\n<img src="images/a.png">',
          },
          {
            layout: "header-content",
            content: "@header\n## Slide 2\n\n@main\n- Item 2",
          },
        ],
      });
      const provider = mockProviderSequence([
        THEMED_PLAN_RESPONSE,
        BAD_EXECUTE_RESPONSE,
        GOOD_EXECUTE_RESPONSE,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, THEMED_DECK, { mode: "remix" });
      const logs = [];
      const result = await orchestrator.runWholeDeckOperation(op, undefined, {
        onLog: (msg) => logs.push(msg),
      });

      // Plan + rejected attempt + repaired attempt.
      expect(provider.chat).toHaveBeenCalledTimes(3);
      expect(logs.some((l) => l.includes("Validation attempt 1"))).toBe(true);
      expect(result).toContain("theme: dark");
      expect(result).toContain("background: #1a1a2e");
      expect(result).toContain('src="images/a.png"');
      expect(result).not.toContain("example.com");
    });

    it("strips stale theme/background directives from the final deck in discard mode", async () => {
      const THEMED_DECK =
        "layout: header-content\ntheme: dark\nbackground: #1a1a2e\n@header\n## Slide 1\n\n@main\n- Point A\n\n---\n\nlayout: header-content\n@header\n## Slide 2\n\n@main\n- Item 2";
      const THEMED_PLAN_RESPONSE = JSON.stringify({
        plan: [
          {
            action: "rewrite",
            source: [0],
            brief: "Tighten the slide",
            reason: "Content is verbose",
            title: "Slide 1",
          },
          {
            action: "polish",
            source: [1],
            brief: "Tighten the wording",
            reason: "Fine as-is",
            title: "Slide 2",
          },
        ],
      });
      // The AI echoes the old theme/background even though the plan context
      // was stripped — the orchestrator must strip them from the final deck.
      const ECHO_EXECUTE_RESPONSE = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content:
              "theme: dark\nbackground: #1a1a2e\n@header\n## Slide 1\n\n@main\n- Concise point",
          },
          {
            layout: "header-content",
            content: "@header\n## Slide 2\n\n@main\n- Item 2",
          },
        ],
      });
      const provider = mockProviderSequence([
        THEMED_PLAN_RESPONSE,
        ECHO_EXECUTE_RESPONSE,
        ECHO_EXECUTE_RESPONSE,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, THEMED_DECK, {
        mode: "remix",
        preserveVisualIdentity: false,
      });
      const result = await orchestrator.runWholeDeckOperation(op);

      expect(result).toContain("Concise point");
      expect(result).not.toContain("theme:");
      expect(result).not.toContain("background:");
    });

    it("removes fabricated image references from the final deck mechanically", async () => {
      // Both execute attempts (first + repair) insist on an external image
      // URL. Validation is advisory — it accepts after max attempts — so the
      // orchestrator must strip the fabricated reference from the final deck.
      const deckWithImage =
        'layout: header-content\n@header\n## Slide 1\n\n@main\n<img src="images/a.png">\n\n---\n\nlayout: header-content\n@header\n## Slide 2\n\n@main\n- Item 2';
      const plan = JSON.stringify({
        plan: [
          { action: "rewrite", source: [0], brief: "Tighten", reason: "verbose", title: "S1" },
          { action: "polish", source: [1], brief: "Tighten wording", reason: "ok", title: "S2" },
        ],
      });
      const fabricated = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content:
              '@header\n## Slide 1\n\n@main\n- Tightened\n\n<img src="https://evil.example/x.png">',
          },
        ],
      });
      const provider = mockProviderSequence([plan, fabricated, fabricated]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deckWithImage, { mode: "remix" });
      const result = await orchestrator.runWholeDeckOperation(op);

      expect(result).toContain("Tightened");
      expect(result).not.toContain("evil.example");
      expect(result).not.toContain("<img");
    });

    it("keeps a real image the model wrote with a normalized path variant", async () => {
      const { extractAll } = await import("../data/ai/slide-image-extractor.js");
      extractAll.mockResolvedValue([
        [{ src: "images/a.png", dataUrl: "data:image/jpeg;base64,/9j/a=" }],
        [],
      ]);
      // The source image is `images/a.png` and was analyzed by the plan AI;
      // the model reuses it as `./images/a.png`. Literal comparison would
      // flag it as fabricated and the strip would delete it, emptying the
      // media area — normalized comparison (leading `./` stripped,
      // percent-encoding decoded) must accept it.
      const deckWithImage =
        'layout: header-content\n@header\n## Slide 1\n\n@main\n<img src="images/a.png">\n\n---\n\nlayout: header-content\n@header\n## Slide 2\n\n@main\n- Item 2';
      const plan = JSON.stringify({
        plan: [
          { action: "rewrite", source: [0], brief: "Tighten", reason: "verbose", title: "S1" },
          { action: "polish", source: [1], brief: "Tighten wording", reason: "ok", title: "S2" },
        ],
      });
      const pathVariant = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content: '@header\n## Slide 1\n\n@main\n- Tightened\n\n<img src="./images/a.png">',
          },
        ],
      });
      const provider = mockProviderSequence([plan, pathVariant, pathVariant]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deckWithImage, {
        mode: "remix",
        includeImages: true,
      });
      const result = await orchestrator.runWholeDeckOperation(op);

      expect(result).toContain('src="./images/a.png"');
    });

    it("logs fabricated image removals via onLog", async () => {
      const deckWithImage =
        'layout: header-content\n@header\n## Slide 1\n\n@main\n<img src="images/a.png">\n\n---\n\nlayout: header-content\n@header\n## Slide 2\n\n@main\n- Item 2';
      const plan = JSON.stringify({
        plan: [
          { action: "rewrite", source: [0], brief: "Tighten", reason: "verbose", title: "S1" },
          { action: "polish", source: [1], brief: "Tighten wording", reason: "ok", title: "S2" },
        ],
      });
      const fabricated = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content:
              '@header\n## Slide 1\n\n@main\n- Tightened\n\n<img src="https://evil.example/x.png">',
          },
        ],
      });
      const provider = mockProviderSequence([plan, fabricated, fabricated]);
      const orchestrator = new AiOrchestrator({ provider });
      const logs = [];
      const op = createOperation("generate", null, deckWithImage, { mode: "remix" });
      await orchestrator.runWholeDeckOperation(op, undefined, {
        onLog: (msg, level) => logs.push({ msg, level }),
      });

      // The mechanical strip must surface what it removed instead of
      // silently emptying a media area.
      expect(
        logs.some(
          (l) =>
            l.level === "warn" && l.msg.includes("fabricated") && l.msg.includes("evil.example"),
        ),
      ).toBe(true);
    });

    it("keeps a rewritten slide's own source image in a text-only remix", async () => {
      // No vision: nothing was analyzed, so cross-slide reuse is forbidden —
      // but a rewritten slide may KEEP its own source slide's image
      // (positional exemption; otherwise every text-only remix would
      // silently delete pictures).
      const deck = 'layout: header-content\n@header\n## Slide 1\n\n@main\n<img src="images/a.png">';
      const plan = JSON.stringify({
        plan: [
          { action: "rewrite", source: [0], brief: "Tighten", reason: "verbose", title: "S1" },
        ],
      });
      const keepOwn = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content: '@header\n## Slide 1\n\n@main\n- Tightened\n\n<img src="images/a.png">',
          },
        ],
      });
      const provider = mockProviderSequence([plan, keepOwn, keepOwn]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deck, { mode: "remix" });
      const result = await orchestrator.runWholeDeckOperation(op);

      expect(result).toContain('src="images/a.png"');
    });

    it("strips an un-analyzed source image adopted by another rewritten slide", async () => {
      // Text-only remix: the image was never analyzed, so the model may not
      // move it to a different slide — the per-slide strip must remove it
      // from the adopting slide (its own source slide has no image).
      const deck =
        'layout: header-content\n@header\n## Slide 1\n\n@main\n<img src="images/a.png">\n\n---\n\nlayout: header-content\n@header\n## Slide 2\n\n@main\n- Item 2';
      const plan = JSON.stringify({
        plan: [
          { action: "rewrite", source: [0], brief: "Tighten", reason: "verbose", title: "S1" },
          { action: "rewrite", source: [1], brief: "Tighten", reason: "verbose", title: "S2" },
        ],
      });
      const moved = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content: "@header\n## Slide 1\n\n@main\n- Tightened",
          },
          {
            layout: "header-content",
            content: '@header\n## Slide 2\n\n@main\n- Tightened\n\n<img src="images/a.png">',
          },
        ],
      });
      const provider = mockProviderSequence([plan, moved, moved]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deck, { mode: "remix" });
      const result = await orchestrator.runWholeDeckOperation(op);

      expect(result).toContain("Tightened");
      expect(result).not.toContain("images/a.png");
      expect(result).not.toContain("<img");
    });

    it("strips a source background adopted as content on another slide", async () => {
      // The user-visible bug: a background image from one slide ends up as
      // an <img> on another. Backgrounds are never extracted/analyzed, so
      // they can only stay on their own slide — the adopting slide must have
      // the image removed while the kept source slide keeps its background.
      const deck =
        "layout: full-image\nbackground: url(images/bg.png) center/cover\n@main\n## Kept\n\n---\n\nlayout: header-content\n@header\n## Slide 2\n\n@main\n- Item 2";
      const plan = JSON.stringify({
        plan: [
          { action: "polish", source: [0], brief: "Tighten wording", reason: "ok", title: "S1" },
          { action: "rewrite", source: [1], brief: "Tighten", reason: "verbose", title: "S2" },
        ],
      });
      const adopted = JSON.stringify({
        slides: [
          {
            layout: "full-image",
            content: "background: url(images/bg.png) center/cover\n@main\n## Kept",
          },
          {
            layout: "header-content",
            content: '@header\n## Slide 2\n\n@main\n- Tightened\n\n<img src="images/bg.png">',
          },
        ],
      });
      const provider = mockProviderSequence([plan, adopted, adopted]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deck, { mode: "remix" });
      const result = await orchestrator.runWholeDeckOperation(op);

      // The polished slide's own background survives…
      expect(result).toContain("background: url(images/bg.png) center/cover");
      // …but the adopted <img> on the rewritten slide is stripped.
      expect(result).not.toContain('<img src="images/bg.png"');
    });

    it("preserves kept-slide images through the final fabricated-image strip", async () => {
      // A kept slide carries an image that never appears in the virtual deck
      // (only rewritten slides go through the execute call). The final strip
      // must use the unified allowlist (rewritten + kept srcs) so the kept
      // image is not mistaken for fabricated.
      const deckWithKeptImage =
        'layout: header-content\n@header\n## Slide 1\n\n@main\n- Item 1\n\n---\n\nlayout: header-content\n@header\n## Slide 2\n\n@main\n<img src="images/kept.png">';
      const plan = JSON.stringify({
        plan: [
          { action: "rewrite", source: [0], brief: "Tighten", reason: "verbose", title: "S1" },
          { action: "polish", source: [1], brief: "Tighten wording", reason: "ok", title: "S2" },
        ],
      });
      const execute = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content: "@header\n## Slide 1\n\n@main\n- Tightened",
          },
        ],
      });
      const provider = mockProviderSequence([plan, execute, execute]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deckWithKeptImage, { mode: "remix" });
      const result = await orchestrator.runWholeDeckOperation(op);

      expect(result).toContain('src="images/kept.png"');
      expect(result).toContain("Tightened");
    });

    it("preserves kept-slide image backgrounds through the final strip", async () => {
      // A kept slide carries a full-bleed image background. The final strip
      // must not drop it as fabricated.
      const deckWithKeptBg =
        "layout: full-image\nbackground: url(images/bg.png) center/cover\n@main\n## Kept\n\n---\n\nlayout: header-content\n@header\n## Slide 2\n\n@main\n- Item 2";
      const plan = JSON.stringify({
        plan: [
          { action: "polish", source: [0], brief: "Tighten wording", reason: "ok", title: "S1" },
          { action: "rewrite", source: [1], brief: "Tighten", reason: "verbose", title: "S2" },
        ],
      });
      const execute = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content: "@header\n## Slide 2\n\n@main\n- Tightened",
          },
        ],
      });
      const provider = mockProviderSequence([plan, execute, execute]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deckWithKeptBg, { mode: "remix" });
      const result = await orchestrator.runWholeDeckOperation(op);

      expect(result).toContain("background: url(images/bg.png) center/cover");
    });

    it("remix discard mode preserves kept-slide inline images while stripping theme/color", async () => {
      // Discard mode strips theme/color from the final deck, but kept-slide
      // inline images must survive (they are content, not identity).
      const deck =
        'layout: header-content\ntheme: dark\nbackground: #1a1a2e\n@header\n## Slide 1\n\n@main\n<img src="images/kept.png">\n\n---\n\nlayout: header-content\n@header\n## Slide 2\n\n@main\n- Item 2';
      const plan = JSON.stringify({
        plan: [
          { action: "polish", source: [0], brief: "Tighten wording", reason: "ok", title: "S1" },
          { action: "rewrite", source: [1], brief: "Tighten", reason: "verbose", title: "S2" },
        ],
      });
      const execute = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content: '@header\n## Slide 1\n\n@main\n<img src="images/kept.png">',
          },
          {
            layout: "header-content",
            content: "theme: dark\nbackground: #1a1a2e\n@header\n## Slide 2\n\n@main\n- Tightened",
          },
        ],
      });
      const provider = mockProviderSequence([plan, execute, execute]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deck, {
        mode: "remix",
        preserveVisualIdentity: false,
      });
      const result = await orchestrator.runWholeDeckOperation(op);

      expect(result).toContain('src="images/kept.png"');
      expect(result).not.toContain("theme:");
      expect(result).not.toContain("background: #1a1a2e");
    });

    it("deterministic backstop restores dropped theme/background on a rewritten slide", async () => {
      // Both execute attempts drop the source theme/background. Validation is
      // advisory and accepts after max attempts, but the deterministic
      // backstop must restore the source identity.
      const deck =
        "layout: header-content\ntheme: dark\nbackground: #1a1a2e\n@header\n## Slide 1\n\n@main\n- Item 1";
      const plan = JSON.stringify({
        plan: [
          { action: "rewrite", source: [0], brief: "Tighten", reason: "verbose", title: "S1" },
        ],
      });
      const dropIdentity = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content: "@header\n## Slide 1\n\n@main\n- Tightened",
          },
        ],
      });
      const provider = mockProviderSequence([plan, dropIdentity, dropIdentity]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deck, { mode: "remix" });
      const result = await orchestrator.runWholeDeckOperation(op);

      expect(result).toContain("theme: dark");
      expect(result).toContain("background: #1a1a2e");
      expect(result).toContain("Tightened");
    });

    it("deterministic backstop strips model-invented theme before restoring source theme", async () => {
      // The model swaps theme: dark → theme: light. Without strip-then-insert
      // the renderer's last-directive-wins would keep the model's value.
      const deck = "layout: header-content\ntheme: dark\n@header\n## Slide 1\n\n@main\n- Item 1";
      const plan = JSON.stringify({
        plan: [
          { action: "rewrite", source: [0], brief: "Tighten", reason: "verbose", title: "S1" },
        ],
      });
      const swapTheme = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content: "theme: light\n@header\n## Slide 1\n\n@main\n- Tightened",
          },
        ],
      });
      const provider = mockProviderSequence([plan, swapTheme, swapTheme]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deck, { mode: "remix" });
      const result = await orchestrator.runWholeDeckOperation(op);

      expect(result).toContain("theme: dark");
      expect(result).not.toContain("theme: light");
      expect(result).toContain("Tightened");
    });

    it("deterministic backstop strips model-invented background before restoring source background", async () => {
      // The model swaps background: #1a1a2e → background: blue.
      const deck =
        "layout: header-content\nbackground: #1a1a2e\n@header\n## Slide 1\n\n@main\n- Item 1";
      const plan = JSON.stringify({
        plan: [
          { action: "rewrite", source: [0], brief: "Tighten", reason: "verbose", title: "S1" },
        ],
      });
      const swapBg = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content: "background: blue\n@header\n## Slide 1\n\n@main\n- Tightened",
          },
        ],
      });
      const provider = mockProviderSequence([plan, swapBg, swapBg]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deck, { mode: "remix" });
      const result = await orchestrator.runWholeDeckOperation(op);

      expect(result).toContain("background: #1a1a2e");
      expect(result).not.toContain("background: blue");
      expect(result).toContain("Tightened");
    });

    it("deterministic backstop restores a dropped source image background", async () => {
      // The source slide has a full-bleed image background. The AI drops it
      // entirely (no <img>, no background: url(...)). The backstop must
      // restore the image background.
      const deck =
        "layout: full-image\nbackground: url(images/hero.png) center/cover\n@main\n## Hero";
      const plan = JSON.stringify({
        plan: [
          { action: "rewrite", source: [0], brief: "Tighten", reason: "verbose", title: "S1" },
        ],
      });
      const dropBg = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content: "@header\n## Hero\n\n@main\n- Tightened",
          },
        ],
      });
      const provider = mockProviderSequence([plan, dropBg, dropBg]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deck, { mode: "remix" });
      const result = await orchestrator.runWholeDeckOperation(op);

      expect(result).toContain("background: url(images/hero.png) center/cover");
    });

    it("deterministic backstop does not double-insert an analyzed image converted to a background", async () => {
      const { extractAll } = await import("../data/ai/slide-image-extractor.js");
      extractAll.mockResolvedValue([
        [{ src: "images/hero.png", dataUrl: "data:image/jpeg;base64,/9j/h=" }],
      ]);
      // The source has a content image the plan AI analyzed. The AI converts
      // it to a full-bleed background — a legitimate layout choice. The
      // backstop must not re-insert anything because the URL is still
      // present (as a background), and the strip must not remove it (it is
      // in the analyzed allowlist).
      const deck = 'layout: header-content\n@header\n## Hero\n\n@main\n<img src="images/hero.png">';
      const plan = JSON.stringify({
        plan: [
          { action: "rewrite", source: [0], brief: "Tighten", reason: "verbose", title: "S1" },
        ],
      });
      const convertToBg = JSON.stringify({
        slides: [
          {
            layout: "full-image",
            content: "background: url(images/hero.png) center/cover\n@main\n## Hero",
          },
        ],
      });
      const provider = mockProviderSequence([plan, convertToBg, convertToBg]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deck, {
        mode: "remix",
        includeImages: true,
      });
      const result = await orchestrator.runWholeDeckOperation(op);

      expect(result).toContain("background: url(images/hero.png) center/cover");
      // No duplicate insertion.
      expect(result.match(/background: url\(images\/hero\.png\)/g) || []).toHaveLength(1);
    });

    it("restores a dropped combined color+image background as a single directive", async () => {
      const deck =
        "layout: header-content\ntheme: dark\nbackground: linear-gradient(rgba(0,0,0,0.65),rgba(0,0,0,0.65)), url(images/hero.png) center/cover\n@header\n## Slide 1\n\n@main\n- Item 1";
      const plan = JSON.stringify({
        plan: [
          { action: "rewrite", source: [0], brief: "Tighten", reason: "verbose", title: "S1" },
        ],
      });
      const dropBg = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content: "@header\n## Slide 1\n\n@main\n- Tightened",
          },
        ],
      });
      const provider = mockProviderSequence([plan, dropBg, dropBg]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deck, { mode: "remix" });
      const result = await orchestrator.runWholeDeckOperation(op);

      expect(result).toContain("theme: dark");
      expect(result).toContain(
        "background: linear-gradient(rgba(0,0,0,0.65),rgba(0,0,0,0.65)), url(images/hero.png) center/cover",
      );
      // Must be a single background: line; no split color/image lines.
      const bgMatches = result.match(/^\s*background\s*:/gm) || [];
      expect(bgMatches.length).toBe(1);
    });

    it("restores only the first source image background for merged slides", async () => {
      const deck =
        "layout: header-content\nbackground: linear-gradient(rgba(0,0,0,0.65),rgba(0,0,0,0.65)), url(images/hero1.png) center/cover\n@header\n## Slide 1\n\n@main\n- Item 1\n\n---\n\nlayout: header-content\nbackground: linear-gradient(rgba(0,0,0,0.65),rgba(0,0,0,0.65)), url(images/hero2.png) center/cover\n@header\n## Slide 2\n\n@main\n- Item 2";
      const plan = JSON.stringify({
        plan: [
          {
            action: "merge",
            source: [0, 1],
            brief: "Merge",
            reason: "verbose",
            title: "Merged",
          },
        ],
      });
      const dropBg = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content: "@header\n## Merged\n\n@main\n- Tightened",
          },
        ],
      });
      const provider = mockProviderSequence([plan, dropBg, dropBg]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deck, { mode: "remix" });
      const result = await orchestrator.runWholeDeckOperation(op);

      // First source image only; the second is dropped because a stacked
      // center/cover image would be hidden behind the first.
      expect(result).toContain(
        "background: linear-gradient(rgba(0,0,0,0.65),rgba(0,0,0,0.65)), url(images/hero1.png) center/cover",
      );
      expect(result).not.toContain("images/hero2.png");
    });

    it("merges restored color with a kept background image", async () => {
      const deck =
        "layout: header-content\nbackground: #1a1a2e, url(images/hero.png) center/cover\n@header\n## Slide 1\n\n@main\n- Item 1";
      const plan = JSON.stringify({
        plan: [
          { action: "rewrite", source: [0], brief: "Tighten", reason: "verbose", title: "S1" },
        ],
      });
      const keepImageDropColor = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content:
              "background: url(images/hero.png) center/cover\n@header\n## Slide 1\n\n@main\n- Tightened",
          },
        ],
      });
      const provider = mockProviderSequence([plan, keepImageDropColor, keepImageDropColor]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deck, { mode: "remix" });
      const result = await orchestrator.runWholeDeckOperation(op);

      expect(result).toContain("background: url(images/hero.png) center/cover #1a1a2e");
    });

    it("collapses model-emitted split background layers into one directive", async () => {
      const deck =
        "layout: header-content\nbackground: linear-gradient(rgba(0,0,0,0.65),rgba(0,0,0,0.65)), url(images/hero.png) center/cover\n@header\n## Slide 1\n\n@main\n- Item 1";
      const plan = JSON.stringify({
        plan: [
          { action: "rewrite", source: [0], brief: "Tighten", reason: "verbose", title: "S1" },
        ],
      });
      const splitBg = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content:
              "background: linear-gradient(rgba(0,0,0,0.65),rgba(0,0,0,0.65))\nbackground: url(images/hero.png) center/cover\n@header\n## Slide 1\n\n@main\n- Tightened",
          },
        ],
      });
      const provider = mockProviderSequence([plan, splitBg, splitBg]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deck, { mode: "remix" });
      const result = await orchestrator.runWholeDeckOperation(op);

      expect(result).toContain(
        "background: linear-gradient(rgba(0,0,0,0.65),rgba(0,0,0,0.65)), url(images/hero.png) center/cover",
      );
      const bgMatches = result.match(/^\s*background\s*:/gm) || [];
      expect(bgMatches.length).toBe(1);
    });

    it("allows images relocated across batch boundaries in the batched execute path", async () => {
      // 10 source slides → a 2-batch virtual deck. The deck's only image lives
      // on the last source slide (batch 2), but the model places it on the
      // first batch's output — the explicit full-deck allowlist must accept
      // it (a batch-local allowlist would flag it as fabricated). The image
      // was analyzed by the plan AI (vision is on), so the relocation is
      // legitimate reuse.
      const { extractAll } = await import("../data/ai/slide-image-extractor.js");
      const BIG_DECK = Array.from(
        { length: 10 },
        (_, i) =>
          `layout: header-content\n@header\n## Slide ${i + 1}\n\n@main\n- Item ${i + 1}${i === 9 ? '\n\n<img src="images/a.png">' : ""}`,
      ).join("\n\n---\n\n");
      extractAll.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) =>
          i === 9 ? [{ src: "images/a.png", dataUrl: "data:image/jpeg;base64,/9j/a=" }] : [],
        ),
      );
      const PLAN = JSON.stringify({
        plan: Array.from({ length: 10 }, (_, i) => ({
          action: "rewrite",
          source: [i],
          brief: `Tighten slide ${i + 1}`,
          title: `S${i + 1}`,
        })),
      });
      // Deterministic per-request mock: the execute batches are distinguished
      // by the number of `<!-- brief:` markers in the user message, so both
      // workers get a response matching their batch's expected slide count.
      // The literal `<!-- brief: ... -->` example in the generate prompt must
      // not count.
      const provider = {
        chat: vi.fn().mockImplementation(async ({ messages }) => {
          const user = messages.find((m) => m.role === "user").content;
          const text = Array.isArray(user) ? user.map((b) => b.text || "").join("\n") : user;
          const briefCount = (text.match(/<!-- brief: (?!\.\.\.)/g) || []).length;
          if (briefCount === 0) return { content: PLAN, raw: { finish_reason: "stop" } };
          const slides = Array.from({ length: briefCount }, (_, i) => ({
            layout: "header-content",
            content:
              i === 0 ? '@main\n- Tightened\n\n<img src="images/a.png">' : "@main\n- Tightened",
          }));
          return { content: JSON.stringify({ slides }), raw: { finish_reason: "stop" } };
        }),
      };
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, BIG_DECK, {
        mode: "remix",
        includeImages: true,
      });
      const result = await orchestrator.runWholeDeckOperation(op);

      // Plan + 2 batches, no repair round-trips — both batches validated on
      // the first attempt despite the cross-batch image reuse.
      expect(provider.chat).toHaveBeenCalledTimes(3);
      expect(result).toContain('src="images/a.png"');
      // All 10 rewritten slides made it into the reassembled deck.
      expect(result.split("\n\n---\n\n")).toHaveLength(10);
    });

    it("does not route to remix for mode=polish", async () => {
      const provider = mockProvider(SINGLE_SLIDE_RESPONSE);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, SINGLE_SLIDE_MD, { mode: "polish" });
      await orchestrator.runWholeDeckOperation(op);
      // No plan phase — the call count matches the normal generate path
      // (1 or 2 depending on validation retry), not the remix 2-phase flow.
      expect(provider.chat).toHaveBeenCalled();
    });

    it("does not enforce identity validation for polish with preserveVisualIdentity", async () => {
      // Polish always sets preserveVisualIdentity, but dropped directives are
      // gap-filled after the call — the validator must not fail polish output
      // that omits them (no repair round-trip).
      const themedDeck =
        "layout: header-content\ntheme: dark\n@header\n## Title\n\n@main\n- Item 1\n- Item 2";
      const dropThemeResponse = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content: "@header\n## Title\n\n@main\n- Tightened item",
          },
        ],
      });
      const provider = mockProvider(dropThemeResponse);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, themedDeck, {
        mode: "polish",
        preserveVisualIdentity: true,
      });
      const result = await orchestrator.runWholeDeckOperation(op);

      // Validation passed on the first attempt — no repair round-trip.
      expect(provider.chat).toHaveBeenCalledTimes(1);
      // The dropped theme is restored by positional gap-fill after the call.
      expect(result).toContain("theme: dark");
      expect(result).toContain("Tightened item");
    });

    it("remix plan prompt uses moderate guidance and preserves visual identity", async () => {
      const provider = mockProviderSequence([
        REMIX_PLAN_RESPONSE,
        EXECUTE_RESPONSE,
        EXECUTE_RESPONSE,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "remix" });
      await orchestrator.runWholeDeckOperation(op);
      const planUser = provider.chat.mock.calls[0][0].messages.find(
        (m) => m.role === "user",
      ).content;
      expect(planUser).toContain("Preserve the deck's core message");
      // Preserve mode now relies on mechanical identity enforcement; the
      // prompt tells the model not to emit theme/background directives.
      expect(planUser).toContain("The application will apply the source slides' visual identity");
      expect(planUser).not.toContain("strip out the original color theme");
      expect(planUser).toContain("valid source indices are 0 through 1");
    });

    it("remix plan prompt includes enriched per-slide metadata in the deck summary", async () => {
      const deckWithBullets =
        "layout: header-content\n@header\n## Slide 1\n\n@main\n- Point A\n- Point B\n\n---\n\nlayout: header-content\n@header\n## Slide 2\n\n@main\n```\nconsole.log(1)\n```";
      const provider = mockProviderSequence([
        JSON.stringify({
          plan: [
            { action: "polish", source: [0], brief: "Tighten wording", reason: "ok", title: "S1" },
            { action: "rewrite", source: [1], brief: "fix", reason: "ok", title: "S2" },
          ],
        }),
        EXECUTE_RESPONSE,
        EXECUTE_RESPONSE,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deckWithBullets, { mode: "remix" });
      await orchestrator.runWholeDeckOperation(op);
      const planUser = provider.chat.mock.calls[0][0].messages.find(
        (m) => m.role === "user",
      ).content;
      // Enriched metadata: bullet count and code marker
      expect(planUser).toContain("bullets");
      expect(planUser).toContain("code");
    });

    it("remix plan prompt injects the flow-specific guidance for the chosen flow", async () => {
      const provider = mockProviderSequence([
        REMIX_PLAN_RESPONSE,
        EXECUTE_RESPONSE,
        EXECUTE_RESPONSE,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, {
        mode: "remix",
        flow: "instructional",
      });
      await orchestrator.runWholeDeckOperation(op);
      const planUser = provider.chat.mock.calls[0][0].messages.find(
        (m) => m.role === "user",
      ).content;
      expect(planUser).toContain("This deck teaches");
      expect(planUser).toContain("keep clear sequential steps in their order");
      // Other flows' guidance must not leak in
      expect(planUser).not.toContain("tells a story");
      expect(planUser).not.toContain("assertion-evidence");
    });

    it("remix plan prompt selects guidance matching the flow (story)", async () => {
      const provider = mockProviderSequence([
        REMIX_PLAN_RESPONSE,
        EXECUTE_RESPONSE,
        EXECUTE_RESPONSE,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, {
        mode: "remix",
        flow: "story",
      });
      await orchestrator.runWholeDeckOperation(op);
      const planUser = provider.chat.mock.calls[0][0].messages.find(
        (m) => m.role === "user",
      ).content;
      expect(planUser).toContain("This deck tells a story");
      expect(planUser).not.toContain("This deck teaches");
      expect(planUser).not.toContain("This deck argues");
    });

    it("remix plan prompt is flow-blind when no flow is provided", async () => {
      const provider = mockProviderSequence([
        REMIX_PLAN_RESPONSE,
        EXECUTE_RESPONSE,
        EXECUTE_RESPONSE,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "remix" });
      await orchestrator.runWholeDeckOperation(op);
      const planUser = provider.chat.mock.calls[0][0].messages.find(
        (m) => m.role === "user",
      ).content;
      expect(planUser).not.toContain("This deck teaches");
      expect(planUser).not.toContain("This deck tells a story");
      expect(planUser).not.toContain("This deck explains");
      expect(planUser).not.toContain("This deck argues");
    });

    it("routes reimagine through the outline flow (no remix plan)", async () => {
      const outlineResponse = JSON.stringify({
        plan: "Reframe the deck around outcomes. Use a historical context arc to show how current approaches evolved, then present the solution and close with evidence.",
        chapters: [
          {
            title: "The problem",
            flowTag: "problem",
            summary: "Why current approaches fail.",
            suggestedSlideCount: 2,
          },
          {
            title: "The approach",
            flowTag: "solution",
            summary: "The proposed solution.",
            suggestedSlideCount: 1,
          },
        ],
      });
      const breakdownResponse = JSON.stringify({
        chapters: [
          {
            title: "The problem",
            slides: [
              { title: "Hook", intent: "Open with a surprising statistic." },
              { title: "Stakes", intent: "What we lose by ignoring this." },
            ],
          },
          {
            title: "The approach",
            slides: [{ title: "Approach", intent: "Introduce the solution." }],
          },
        ],
      });
      const executeResponse = JSON.stringify({
        slides: [
          { layout: "header-content", content: "@header\n## Hook\n\n@main\n- Surprising stat" },
          { layout: "header-content", content: "@header\n## Stakes\n\n@main\n- What we lose" },
          { layout: "header-content", content: "@header\n## Approach\n\n@main\n- The solution" },
        ],
      });
      const provider = mockProviderSequence([
        outlineResponse,
        breakdownResponse,
        executeResponse,
        executeResponse,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "reimagine" });
      const result = await orchestrator.runWholeDeckOperation(op);
      expect(result).toContain("Hook");
      expect(result).toContain("Approach");
      // The outline prompt should include flow + storytelling guidance
      const outlineUser = provider.chat.mock.calls[0][0].messages.find(
        (m) => m.role === "user",
      ).content;
      expect(outlineUser).toContain("rethink the topic, examples, notes, and visuals");
      expect(outlineUser).toContain("Do not preserve the original theme");
      expect(outlineUser).toContain("storytelling techniques");
      // At least 3 calls: outline + breakdown + execute (may retry on validation)
      expect(provider.chat.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it("reimagine invokes onOutline callback and uses the edited outline", async () => {
      const outlineResponse = JSON.stringify({
        plan: "Original plan.",
        chapters: [
          {
            title: "Opening",
            flowTag: "hook",
            summary: "Hook the audience.",
            suggestedSlideCount: 2,
          },
        ],
      });
      const breakdownResponse = JSON.stringify({
        chapters: [
          {
            title: "Edited chapter",
            slides: [
              { title: "Edited Hook", intent: "Edited intent 1." },
              { title: "Edited Approach", intent: "Edited intent 2." },
              { title: "New Slide", intent: "Brand new slide." },
            ],
          },
        ],
      });
      const executeResponse = JSON.stringify({
        slides: [
          { layout: "header-content", content: "@header\n## Edited Hook\n\n@main\n- Edited" },
          { layout: "header-content", content: "@header\n## Edited Approach\n\n@main\n- Edited" },
          { layout: "header-content", content: "@header\n## New Slide\n\n@main\n- New" },
        ],
      });
      const provider = mockProviderSequence([
        outlineResponse,
        breakdownResponse,
        executeResponse,
        executeResponse,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "reimagine" });
      const outlines = [];
      const result = await orchestrator.runWholeDeckOperation(op, undefined, {
        onOutline: async (outline) => {
          outlines.push(outline);
          return {
            plan: "Edited plan.",
            chapters: [
              {
                title: "Edited chapter",
                flowTag: "solution",
                summary: "Edited summary.",
                suggestedSlideCount: 3,
              },
            ],
          };
        },
      });
      expect(outlines).toHaveLength(1);
      expect(outlines[0].plan).toBe("Original plan.");
      expect(outlines[0].chapters).toHaveLength(1);
      expect(outlines[0].chapters[0].title).toBe("Opening");
      expect(outlines[0].chapters[0].suggestedSlideCount).toBe(2);
      expect(result).toContain("Edited Hook");
      expect(result).toContain("New Slide");
      // The execute call's context should carry the breakdown briefs
      const execUser = provider.chat.mock.calls[2][0].messages.find(
        (m) => m.role === "user",
      ).content;
      expect(execUser).toContain("Edited Hook");
      expect(execUser).toContain("Brand new slide");
    });

    it("reimagine passes a regenerate function to onOutline", async () => {
      const firstOutline = JSON.stringify({
        plan: "Original plan.",
        chapters: [{ title: "C1", flowTag: "hook", summary: "Hook.", suggestedSlideCount: 1 }],
      });
      const regeneratedOutline = JSON.stringify({
        plan: "Regenerated plan.",
        chapters: [
          { title: "New C1", flowTag: "context", summary: "New context.", suggestedSlideCount: 2 },
          {
            title: "New C2",
            flowTag: "solution",
            summary: "New solution.",
            suggestedSlideCount: 1,
          },
        ],
      });
      const breakdownResponse = JSON.stringify({
        chapters: [
          {
            title: "New C1",
            slides: [
              { title: "S1", intent: "I1." },
              { title: "S2", intent: "I2." },
            ],
          },
          {
            title: "New C2",
            slides: [{ title: "S3", intent: "I3." }],
          },
        ],
      });
      const executeResponse = JSON.stringify({
        slides: [
          { layout: "header-content", content: "@header\n## S1\n\n@main\n- 1" },
          { layout: "header-content", content: "@header\n## S2\n\n@main\n- 2" },
          { layout: "header-content", content: "@header\n## S3\n\n@main\n- 3" },
        ],
      });
      const provider = mockProviderSequence([
        firstOutline,
        regeneratedOutline, // regenerate call
        breakdownResponse,
        executeResponse,
        executeResponse,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "reimagine" });
      const result = await orchestrator.runWholeDeckOperation(op, undefined, {
        onOutline: async (outline, regenerate) => {
          expect(typeof regenerate).toBe("function");
          // Regenerate with an edited plan
          const newOutline = await regenerate("A revised plan direction.");
          expect(newOutline.plan).toBe("Regenerated plan.");
          expect(newOutline.chapters).toHaveLength(2);
          return newOutline;
        },
      });
      expect(result).toContain("S1");
      expect(result).toContain("S3");
    });

    it("reimagine feeds chapter title/summary into the briefs from breakdown", async () => {
      const outlineResponse = JSON.stringify({
        plan: "Original plan.",
        chapters: [
          {
            title: "Opening",
            flowTag: "hook",
            summary: "Hook the audience.",
            suggestedSlideCount: 1,
          },
        ],
      });
      const breakdownResponse = JSON.stringify({
        chapters: [
          {
            title: "Rewritten chapter",
            slides: [{ title: "Hook", intent: "Open with a statistic." }],
          },
        ],
      });
      const executeResponse = JSON.stringify({
        slides: [{ layout: "header-content", content: "@header\n## One\n\n@main\n- A" }],
      });
      const provider = mockProviderSequence([
        outlineResponse,
        breakdownResponse,
        executeResponse,
        executeResponse,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "reimagine" });
      await orchestrator.runWholeDeckOperation(op, undefined, {
        onOutline: async () => ({
          plan: "Edited plan.",
          chapters: [
            {
              title: "Rewritten chapter",
              flowTag: "solution",
              summary: "Rewritten summary.",
              suggestedSlideCount: 1,
            },
          ],
        }),
      });
      const execUser = provider.chat.mock.calls[2][0].messages.find(
        (m) => m.role === "user",
      ).content;
      expect(execUser).toContain(
        "<!-- brief: Hook \u2014 Open with a statistic. (chapter: Rewritten chapter \u2014 Rewritten summary.) | beat: continuation, energy: medium, contrast: moderate, relationship: continue -->",
      );
    });

    it("reimagine returns null when onOutline resolves null (user cancelled)", async () => {
      const outlineResponse = JSON.stringify({
        plan: "Plan.",
        chapters: [
          {
            title: "Ch1",
            flowTag: "hook",
            summary: "S.",
            suggestedSlideCount: 1,
          },
        ],
      });
      const provider = mockProviderSequence([outlineResponse]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "reimagine" });
      const result = await orchestrator.runWholeDeckOperation(op, undefined, {
        onOutline: async () => null,
      });
      expect(result).toBeNull();
      expect(provider.chat).toHaveBeenCalledTimes(1);
    });

    it("reimagine skips onOutline when not provided and runs straight through", async () => {
      const outlineResponse = JSON.stringify({
        plan: "Plan.",
        chapters: [
          {
            title: "Ch1",
            flowTag: "hook",
            summary: "S.",
            suggestedSlideCount: 1,
          },
        ],
      });
      const breakdownResponse = JSON.stringify({
        chapters: [
          {
            title: "Ch1",
            slides: [{ title: "Hook", intent: "Open." }],
          },
        ],
      });
      const executeResponse = JSON.stringify({
        slides: [{ layout: "header-content", content: "@header\n## Hook\n\n@main\n- x" }],
      });
      const provider = mockProviderSequence([
        outlineResponse,
        breakdownResponse,
        executeResponse,
        executeResponse,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "reimagine" });
      const result = await orchestrator.runWholeDeckOperation(op);
      expect(result).toContain("Hook");
    });

    it("reimagine passes flow to the outline prompt", async () => {
      const outlineResponse = JSON.stringify({
        plan: "Plan.",
        chapters: [
          {
            title: "Ch1",
            flowTag: "hook",
            summary: "S.",
            suggestedSlideCount: 1,
          },
        ],
      });
      const breakdownResponse = JSON.stringify({
        chapters: [{ title: "Ch1", slides: [{ title: "Hook", intent: "Open." }] }],
      });
      const executeResponse = JSON.stringify({
        slides: [{ layout: "header-content", content: "@header\n## Hook\n\n@main\n- x" }],
      });
      const provider = mockProviderSequence([
        outlineResponse,
        breakdownResponse,
        executeResponse,
        executeResponse,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, {
        mode: "reimagine",
        flow: "persuasive",
      });
      await orchestrator.runWholeDeckOperation(op);
      const outlineUser = provider.chat.mock.calls[0][0].messages.find(
        (m) => m.role === "user",
      ).content;
      expect(outlineUser).toContain("**persuasive**");
    });

    it("reimagine throws on invalid outline JSON", async () => {
      const provider = mockProviderSequence(["not json"]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "reimagine" });
      await expect(orchestrator.runWholeDeckOperation(op)).rejects.toThrow(
        "Outline response did not contain valid JSON",
      );
    });

    it("reimagine throws on missing plan", async () => {
      const provider = mockProviderSequence([JSON.stringify({ chapters: [] })]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "reimagine" });
      await expect(orchestrator.runWholeDeckOperation(op)).rejects.toThrow("missing 'plan' string");
    });

    it("reimagine throws on missing chapters", async () => {
      const provider = mockProviderSequence([JSON.stringify({ plan: "B.", chapters: [] })]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "reimagine" });
      await expect(orchestrator.runWholeDeckOperation(op)).rejects.toThrow(
        "missing 'chapters' array",
      );
    });

    it("reimagine aligns breakdown with mismatched chapter count and continues", async () => {
      const outlineResponse = JSON.stringify({
        plan: "Plan.",
        chapters: [
          { title: "Ch1", flowTag: "hook", summary: "S.", suggestedSlideCount: 1 },
          { title: "Ch2", flowTag: "solution", summary: "S2.", suggestedSlideCount: 1 },
        ],
      });
      const breakdownResponse = JSON.stringify({
        chapters: [{ title: "Ch1", slides: [{ title: "S", intent: "I." }] }],
      });
      const executeResponse = JSON.stringify({
        slides: [
          { layout: "header-content", content: "@header\n## S\n\n@main\n- A" },
          { layout: "header-content", content: "@header\n## Ch2\n\n@main\n- B" },
        ],
      });
      const provider = mockProviderSequence([
        outlineResponse,
        breakdownResponse,
        executeResponse,
        executeResponse,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "reimagine" });
      const result = await orchestrator.runWholeDeckOperation(op);
      expect(typeof result).toBe("string");
      expect(result).toBeTruthy();
    });

    it("reimagine threads visualSystem from outline through breakdown to generate", async () => {
      const visualSystem = {
        visualDirection:
          "Dark, dramatic, with red accents for emphasis. Use dark backgrounds for continuation slides. Use red accent backgrounds for punctuation and climax moments. Use white or light backgrounds for title and agenda.",
      };
      const outlineResponse = JSON.stringify({
        plan: "Plan.",
        visualSystem,
        chapters: [{ title: "Ch1", flowTag: "hook", summary: "S.", suggestedSlideCount: 1 }],
      });
      const breakdownResponse = JSON.stringify({
        chapters: [
          {
            title: "Ch1",
            slides: [
              {
                title: "Hook",
                intent: "Open.",
                visualBeat: "punctuation",
                energy: "high",
                contrast: "strong",
                relationship: "break",
              },
            ],
          },
        ],
      });
      const executeResponse = JSON.stringify({
        slides: [{ layout: "header-content", content: "@header\n## Hook\n\n@main\n- x" }],
      });
      const provider = mockProviderSequence([
        outlineResponse,
        breakdownResponse,
        executeResponse,
        executeResponse,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "reimagine" });
      const outlines = [];
      await orchestrator.runWholeDeckOperation(op, undefined, {
        onOutline: async (outline) => {
          outlines.push(outline);
          return outline;
        },
      });
      // visualSystem is passed through the onOutline callback
      expect(outlines).toHaveLength(1);
      expect(outlines[0].visualSystem).not.toBeNull();
      expect(outlines[0].visualSystem.visualDirection).toBe(visualSystem.visualDirection);

      // Breakdown prompt receives the visual direction
      const breakdownUser = provider.chat.mock.calls[1][0].messages.find(
        (m) => m.role === "user",
      ).content;
      expect(breakdownUser).toContain(visualSystem.visualDirection);

      // Generate prompt receives the visual direction brief
      const execUser = provider.chat.mock.calls[2][0].messages.find(
        (m) => m.role === "user",
      ).content;
      expect(execUser).toContain("Visual direction");
      expect(execUser).toContain(visualSystem.visualDirection);

      // Brief includes the beat suffix (punctuation on slide 1 is normalized
      // to continuation by the beat normalizer)
      expect(execUser).toContain(
        "| beat: continuation, energy: high, contrast: strong, relationship: break",
      );
    });

    it("reimagine falls back to DEFAULT_VISUAL_SYSTEM when outline omits visualSystem", async () => {
      const outlineResponse = JSON.stringify({
        plan: "Plan.",
        chapters: [{ title: "Ch1", flowTag: "hook", summary: "S.", suggestedSlideCount: 1 }],
      });
      const breakdownResponse = JSON.stringify({
        chapters: [{ title: "Ch1", slides: [{ title: "S", intent: "I." }] }],
      });
      const executeResponse = JSON.stringify({
        slides: [{ layout: "header-content", content: "@header\n## S\n\n@main\n- x" }],
      });
      const provider = mockProviderSequence([
        outlineResponse,
        breakdownResponse,
        executeResponse,
        executeResponse,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "reimagine" });
      const outlines = [];
      await orchestrator.runWholeDeckOperation(op, undefined, {
        onOutline: async (outline) => {
          outlines.push(outline);
          return outline;
        },
      });
      // Falls back to default visual system
      expect(outlines[0].visualSystem).not.toBeNull();
      expect(outlines[0].visualSystem.visualDirection).toBe(DEFAULT_VISUAL_SYSTEM.visualDirection);

      // Generate prompt still receives the visual direction brief (from default)
      const execUser = provider.chat.mock.calls[2][0].messages.find(
        (m) => m.role === "user",
      ).content;
      expect(execUser).toContain("Visual direction");
      expect(execUser).toContain(DEFAULT_VISUAL_SYSTEM.visualDirection);
    });

    it("reimagine falls back to DEFAULT_VISUAL_SYSTEM when visualSystem is invalid", async () => {
      const outlineResponse = JSON.stringify({
        plan: "Plan.",
        visualSystem: { palette: { base: "not-a-hex" } },
        chapters: [{ title: "Ch1", flowTag: "hook", summary: "S.", suggestedSlideCount: 1 }],
      });
      const breakdownResponse = JSON.stringify({
        chapters: [{ title: "Ch1", slides: [{ title: "S", intent: "I." }] }],
      });
      const executeResponse = JSON.stringify({
        slides: [{ layout: "header-content", content: "@header\n## S\n\n@main\n- x" }],
      });
      const provider = mockProviderSequence([
        outlineResponse,
        breakdownResponse,
        executeResponse,
        executeResponse,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "reimagine" });
      const outlines = [];
      await orchestrator.runWholeDeckOperation(op, undefined, {
        onOutline: async (outline) => {
          outlines.push(outline);
          return outline;
        },
      });
      expect(outlines[0].visualSystem.visualDirection).toBe(DEFAULT_VISUAL_SYSTEM.visualDirection);
    });

    it("reimagine includes imageQuery in brief serialization for generate AI", async () => {
      const { extractAll } = await import("../data/ai/slide-image-extractor.js");
      extractAll.mockResolvedValue([
        [{ src: "images/storm.jpg", dataUrl: "data:image/jpeg;base64,/9j/s=" }],
        [],
      ]);
      const outlineResponse = JSON.stringify({
        plan: "Plan.",
        keepImages: [0], // keep images/storm.jpg so reuse: is valid
        chapters: [{ title: "Ch1", flowTag: "hook", summary: "S.", suggestedSlideCount: 1 }],
      });
      const breakdownResponse = JSON.stringify({
        chapters: [
          {
            title: "Ch1",
            slides: [
              {
                title: "Hook",
                intent: "Open.",
                imageQuery: "reuse:images/storm.jpg",
              },
            ],
          },
        ],
      });
      const executeResponse = JSON.stringify({
        slides: [{ layout: "header-content", content: "@header\n## Hook\n\n@main\n- x" }],
      });
      const provider = mockProviderSequence([
        outlineResponse,
        breakdownResponse,
        executeResponse,
        executeResponse,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, {
        mode: "reimagine",
        includeImages: true,
      });
      await orchestrator.runWholeDeckOperation(op);
      const execUser = provider.chat.mock.calls[2][0].messages.find(
        (m) => m.role === "user",
      ).content;
      const execText = Array.isArray(execUser)
        ? execUser.map((b) => b.text || "").join("\n")
        : execUser;
      // imageQuery SHOULD appear in the serialized brief as | image: <query>
      expect(execText).toContain("image: reuse:images/storm.jpg");
    });

    it("reimagine drops imageQuery when reuse: path is not in kept images", async () => {
      const { extractAll } = await import("../data/ai/slide-image-extractor.js");
      extractAll.mockResolvedValue([
        [{ src: "images/a.png", dataUrl: "data:image/jpeg;base64,/9j/a=" }],
        [],
      ]);
      const outlineResponse = JSON.stringify({
        plan: "Plan.",
        keepImages: [0], // keep images/a.png only
        chapters: [{ title: "Ch1", flowTag: "hook", summary: "S.", suggestedSlideCount: 1 }],
      });
      const breakdownResponse = JSON.stringify({
        chapters: [
          {
            title: "Ch1",
            slides: [
              {
                title: "Hook",
                intent: "Open.",
                imageQuery: "reuse:images/storm.jpg", // not in kept set
              },
            ],
          },
        ],
      });
      const executeResponse = JSON.stringify({
        slides: [{ layout: "header-content", content: "@header\n## Hook\n\n@main\n- x" }],
      });
      const provider = mockProviderSequence([
        outlineResponse,
        breakdownResponse,
        executeResponse,
        executeResponse,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, {
        mode: "reimagine",
        includeImages: true,
      });
      await orchestrator.runWholeDeckOperation(op);
      const execUser = provider.chat.mock.calls[2][0].messages.find(
        (m) => m.role === "user",
      ).content;
      const execText = Array.isArray(execUser)
        ? execUser.map((b) => b.text || "").join("\n")
        : execUser;
      // The hallucinated reuse: path must not appear in the brief.
      expect(execText).not.toContain("reuse:images/storm.jpg");
    });

    it("reimagine accepts reuse: path with ./ prefix via normalization", async () => {
      const { extractAll } = await import("../data/ai/slide-image-extractor.js");
      extractAll.mockResolvedValue([
        [{ src: "images/a.png", dataUrl: "data:image/jpeg;base64,/9j/a=" }],
        [],
      ]);
      const outlineResponse = JSON.stringify({
        plan: "Plan.",
        keepImages: [0],
        chapters: [{ title: "Ch1", flowTag: "hook", summary: "S.", suggestedSlideCount: 1 }],
      });
      const breakdownResponse = JSON.stringify({
        chapters: [
          {
            title: "Ch1",
            slides: [
              {
                title: "Hook",
                intent: "Open.",
                imageQuery: "reuse:./images/a.png", // ./ prefix vs kept images/a.png
              },
            ],
          },
        ],
      });
      const executeResponse = JSON.stringify({
        slides: [{ layout: "header-content", content: "@header\n## Hook\n\n@main\n- x" }],
      });
      const provider = mockProviderSequence([
        outlineResponse,
        breakdownResponse,
        executeResponse,
        executeResponse,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, {
        mode: "reimagine",
        includeImages: true,
      });
      await orchestrator.runWholeDeckOperation(op);
      const execUser = provider.chat.mock.calls[2][0].messages.find(
        (m) => m.role === "user",
      ).content;
      const execText = Array.isArray(execUser)
        ? execUser.map((b) => b.text || "").join("\n")
        : execUser;
      // Normalization must match ./images/a.png to images/a.png, so the
      // brief keeps the reuse: reference.
      expect(execText).toContain("reuse:./images/a.png");
    });

    it("reimagine drops free-text imageQuery (not a reuse: reference)", async () => {
      const { extractAll } = await import("../data/ai/slide-image-extractor.js");
      extractAll.mockResolvedValue([
        [{ src: "images/a.png", dataUrl: "data:image/jpeg;base64,/9j/a=" }],
        [],
      ]);
      const outlineResponse = JSON.stringify({
        plan: "Plan.",
        keepImages: [0],
        chapters: [{ title: "Ch1", flowTag: "hook", summary: "S.", suggestedSlideCount: 1 }],
      });
      // A free-text search query is not a reuse:<path> directive — reimagine
      // has no image search, so keeping it in the brief would invite the
      // model to invent a picture that the final strip then deletes.
      const breakdownResponse = JSON.stringify({
        chapters: [
          {
            title: "Ch1",
            slides: [
              {
                title: "Hook",
                intent: "Open.",
                imageQuery: "a stormy sky over mountains at dusk",
              },
            ],
          },
        ],
      });
      const executeResponse = JSON.stringify({
        slides: [{ layout: "header-content", content: "@header\n## Hook\n\n@main\n- x" }],
      });
      const provider = mockProviderSequence([
        outlineResponse,
        breakdownResponse,
        executeResponse,
        executeResponse,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, {
        mode: "reimagine",
        includeImages: true,
      });
      await orchestrator.runWholeDeckOperation(op);
      const execUser = provider.chat.mock.calls[2][0].messages.find(
        (m) => m.role === "user",
      ).content;
      const execText = Array.isArray(execUser)
        ? execUser.map((b) => b.text || "").join("\n")
        : execUser;
      // The free-text query must not appear in the serialized brief (the
      // generate prompt's own `| image:` rule text may legitimately contain
      // the word "image:" — what matters is that no brief carries the query).
      expect(execText).not.toContain("| image: a stormy sky");
      expect(execText).not.toContain("stormy sky");
    });

    it("throws on invalid plan action", async () => {
      const badPlan = JSON.stringify({
        plan: [{ action: "split", source: [0], brief: "split this", reason: "ok", title: "X" }],
      });
      const provider = mockProviderSequence([badPlan, EXECUTE_RESPONSE]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "remix" });
      await expect(orchestrator.runWholeDeckOperation(op)).rejects.toThrow("Invalid remix plan");
    });

    it("does not throw when reason is missing (optional display-only field)", async () => {
      const planNoReason = JSON.stringify({
        plan: [
          { action: "polish", source: [0], brief: "Tighten wording", title: "S1" },
          {
            action: "rewrite",
            source: [1],
            brief: "fix",
            title: "S2",
          },
        ],
      });
      const provider = mockProviderSequence([planNoReason, EXECUTE_RESPONSE, EXECUTE_RESPONSE]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "remix" });
      const result = await orchestrator.runWholeDeckOperation(op);
      expect(result).toContain("Slide 1");
      expect(result).toContain("Slide 2");
    });

    it("coerces non-string reason to string without throwing", async () => {
      const planBadReasonType = JSON.stringify({
        plan: [
          { action: "polish", source: [0], brief: "Tighten wording", reason: 42, title: "S1" },
          {
            action: "rewrite",
            source: [1],
            brief: "fix",
            reason: true,
            title: "S2",
          },
        ],
      });
      const provider = mockProviderSequence([
        planBadReasonType,
        EXECUTE_RESPONSE,
        EXECUTE_RESPONSE,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "remix" });
      const plans = [];
      const result = await orchestrator.runWholeDeckOperation(op, undefined, {
        onPlan: (plan) => plans.push(plan),
      });
      // Should not throw — reason is coerced to string
      expect(result).toContain("Slide 1");
      expect(plans[0][0].reason).toBe("42");
      expect(plans[0][1].reason).toBe("true");
    });

    it("throws on out-of-range source index", async () => {
      const badPlan = JSON.stringify({
        plan: [
          { action: "polish", source: [0], brief: "Tighten wording", reason: "ok", title: "S1" },
          { action: "rewrite", source: [5], brief: "fix", reason: "ok", title: "S5" },
        ],
      });
      const provider = mockProviderSequence([badPlan, EXECUTE_RESPONSE]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "remix" });
      await expect(orchestrator.runWholeDeckOperation(op)).rejects.toThrow("Invalid remix plan");
    });

    it("throws on duplicate source indices after off-by-one clamp", async () => {
      // sourceCount = 2; index 2 is clamped to 1, producing [1, 1]
      const badPlan = JSON.stringify({
        plan: [
          { action: "polish", source: [0], brief: "Tighten wording", reason: "ok", title: "S1" },
          { action: "merge", source: [1, 2], brief: "merge last two", reason: "ok", title: "M" },
        ],
      });
      const provider = mockProviderSequence([badPlan, EXECUTE_RESPONSE]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "remix" });
      await expect(orchestrator.runWholeDeckOperation(op)).rejects.toThrow(/duplicate indices/);
    });

    it("throws on uncovered source slide", async () => {
      const badPlan = JSON.stringify({
        plan: [
          { action: "polish", source: [0], brief: "Tighten wording", reason: "ok", title: "S1" },
        ],
      });
      const provider = mockProviderSequence([badPlan, EXECUTE_RESPONSE]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "remix" });
      await expect(orchestrator.runWholeDeckOperation(op)).rejects.toThrow("Invalid remix plan");
    });

    it("throws on merge of more than two source slides", async () => {
      const badPlan = JSON.stringify({
        plan: [
          {
            action: "merge",
            source: [0, 1, 2],
            brief: "Combine three slides",
            reason: "All thin",
            title: "M",
          },
        ],
      });
      const provider = mockProviderSequence([badPlan, EXECUTE_RESPONSE]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, THREE_SLIDE_MD, { mode: "remix" });
      await expect(orchestrator.runWholeDeckOperation(op)).rejects.toThrow("Invalid remix plan");
    });

    it("handles merge action in plan", async () => {
      const mergePlan = JSON.stringify({
        plan: [
          {
            action: "merge",
            source: [0, 1],
            brief: "Combine into one slide",
            reason: "Both slides are thin",
            title: "Combined",
          },
        ],
      });
      const mergeResponse = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content: "@header\n## Combined\n\n@main\n- Item 1\n- Item 2",
          },
        ],
      });
      const provider = mockProviderSequence([mergePlan, mergeResponse, mergeResponse]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "remix" });
      const logs = [];
      const result = await orchestrator.runWholeDeckOperation(op, undefined, {
        onLog: (msg) => logs.push(msg),
      });

      expect(result).toContain("Combined");
      expect(logs.some((l) => l.includes("[Plan] Merge"))).toBe(true);
    });
  });

  describe("runWholeDeckOperation (remix with vision)", () => {
    const TWO_SLIDE_WITH_IMAGES =
      'layout: header-content\n@header\n## Slide 1\n\n@main\n<img src="images/a.png">\n\n---\n\nlayout: header-content\n@header\n## Slide 2\n\n@main\n- No images';

    const REMIX_PLAN_RESPONSE = JSON.stringify({
      plan: [
        {
          action: "rewrite",
          source: [0],
          brief: "Reposition image",
          reason: "Image placement is off",
          title: "Slide 1",
          keepImages: [0],
        },
        {
          action: "polish",
          source: [1],
          brief: "Tighten the wording",
          reason: "Fine as-is",
          title: "Slide 2",
        },
      ],
    });

    const EXECUTE_RESPONSE = JSON.stringify({
      slides: [
        {
          layout: "header-content",
          content: "@header\n## Slide 1\n\n@main\n- Repositioned",
        },
      ],
    });

    it("sends multi-modal content when includeImages is true", async () => {
      const { extractAll } = await import("../data/ai/slide-image-extractor.js");
      extractAll.mockResolvedValue([
        [{ src: "images/a.png", dataUrl: "data:image/jpeg;base64,/9j/fake=" }],
        null,
      ]);

      const provider = mockProviderSequence([
        REMIX_PLAN_RESPONSE,
        EXECUTE_RESPONSE,
        EXECUTE_RESPONSE,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_WITH_IMAGES, {
        mode: "remix",
        includeImages: true,
      });
      const logs = [];
      await orchestrator.runWholeDeckOperation(op, undefined, {
        onLog: (msg) => logs.push(msg),
      });

      // The plan call (first chat call) should have array content for the user message
      const planCall = provider.chat.mock.calls[0][0];
      const userMsg = planCall.messages.find((m) => m.role === "user");
      expect(Array.isArray(userMsg.content)).toBe(true);
      // Should contain at least one image_url block
      const imageBlocks = userMsg.content.filter((b) => b.type === "image_url");
      expect(imageBlocks.length).toBeGreaterThan(0);
      expect(logs.some((l) => l.includes("image"))).toBe(true);
    });

    it("falls back to text-only when provider rejects images with vision error", async () => {
      const { extractAll } = await import("../data/ai/slide-image-extractor.js");
      extractAll.mockResolvedValue([
        [{ src: "images/a.png", dataUrl: "data:image/jpeg;base64,/9j/fake=" }],
        null,
      ]);

      // First call (with images) throws a vision-related HTTP 400, second call (text-only) succeeds
      const visionError = new Error("HTTP 400: model does not support image content");
      visionError.name = "AiHttpError";
      visionError.status = 400;
      const provider = {
        chat: vi
          .fn()
          .mockRejectedValueOnce(visionError)
          .mockResolvedValueOnce({ content: REMIX_PLAN_RESPONSE, raw: { finish_reason: "stop" } })
          .mockResolvedValueOnce({ content: EXECUTE_RESPONSE, raw: { finish_reason: "stop" } })
          .mockResolvedValueOnce({ content: EXECUTE_RESPONSE, raw: { finish_reason: "stop" } }),
      };
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_WITH_IMAGES, {
        mode: "remix",
        includeImages: true,
      });
      const logs = [];
      const result = await orchestrator.runWholeDeckOperation(op, undefined, {
        onLog: (msg) => logs.push(msg),
      });

      // Should have logged the fallback
      expect(logs.some((l) => l.includes("text-only"))).toBe(true);
      // The retry call should have string content (not array)
      const retryCall = provider.chat.mock.calls[1][0];
      const retryUserMsg = retryCall.messages.find((m) => m.role === "user");
      expect(typeof retryUserMsg.content).toBe("string");
      expect(result).toContain("@header");
    });

    it("does NOT fall back to text-only for non-vision errors (e.g. auth)", async () => {
      const { extractAll } = await import("../data/ai/slide-image-extractor.js");
      extractAll.mockResolvedValue([
        [{ src: "images/a.png", dataUrl: "data:image/jpeg;base64,/9j/fake=" }],
        null,
      ]);

      // Auth error (401) — should NOT trigger vision fallback
      const authError = new Error("HTTP 401: Invalid API key");
      authError.name = "AiHttpError";
      authError.status = 401;
      const provider = {
        chat: vi.fn().mockRejectedValueOnce(authError),
      };
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_WITH_IMAGES, {
        mode: "remix",
        includeImages: true,
      });
      await expect(orchestrator.runWholeDeckOperation(op)).rejects.toThrow("401");
    });

    it("does not send images when includeImages is false", async () => {
      const provider = mockProviderSequence([
        REMIX_PLAN_RESPONSE,
        EXECUTE_RESPONSE,
        EXECUTE_RESPONSE,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_WITH_IMAGES, {
        mode: "remix",
        includeImages: false,
      });
      await orchestrator.runWholeDeckOperation(op);

      // The plan call should have string content (no images)
      const planCall = provider.chat.mock.calls[0][0];
      const userMsg = planCall.messages.find((m) => m.role === "user");
      expect(typeof userMsg.content).toBe("string");
    });

    it("validates keepImages field", async () => {
      const badPlan = JSON.stringify({
        plan: [
          {
            action: "rewrite",
            source: [0],
            brief: "Test",
            reason: "ok",
            title: "S1",
            keepImages: "not-an-array",
          },
          { action: "polish", source: [1], brief: "Tighten wording", reason: "ok", title: "S2" },
        ],
      });
      const provider = mockProviderSequence([badPlan, EXECUTE_RESPONSE]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_WITH_IMAGES, {
        mode: "remix",
      });
      await expect(orchestrator.runWholeDeckOperation(op)).rejects.toThrow(
        "keepImages must be an array",
      );
    });

    it("filters images in virtual deck per keepImages when images were sent", async () => {
      const { extractAll } = await import("../data/ai/slide-image-extractor.js");
      extractAll.mockResolvedValue([
        [
          { src: "images/a.png", dataUrl: "data:image/jpeg;base64,/9j/a=" },
          { src: "images/b.png", dataUrl: "data:image/jpeg;base64,/9j/b=" },
        ],
        null,
      ]);

      const deckWithTwoImages =
        'layout: header-content\n@main\n<img src="images/a.png">\n\n<img src="images/b.png">\n\n---\n\nlayout: header-content\n@main\n- No images';

      const plan = JSON.stringify({
        plan: [
          {
            action: "rewrite",
            source: [0],
            brief: "Keep only first image",
            reason: "Second image is redundant",
            title: "S1",
            keepImages: [0], // keep only a.png, drop b.png
          },
          { action: "polish", source: [1], brief: "Tighten wording", reason: "ok", title: "S2" },
        ],
      });
      const executeResponse = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content: "@main\n- Result with image a.png",
          },
        ],
      });
      const provider = mockProviderSequence([plan, executeResponse, executeResponse]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deckWithTwoImages, {
        mode: "remix",
        includeImages: true,
      });
      const result = await orchestrator.runWholeDeckOperation(op);

      // The execute call's context (virtual deck) should contain a.png but not b.png
      const executeCall = provider.chat.mock.calls[1][0];
      const executeUserMsg = executeCall.messages.find((m) => m.role === "user");
      expect(executeUserMsg.content).toContain("a.png");
      expect(executeUserMsg.content).not.toContain("b.png");
      expect(result).toContain("@main");
    });

    it("ignores keepImages when no images were sent to the plan AI (text-only remix)", async () => {
      const { extractAll } = await import("../data/ai/slide-image-extractor.js");
      extractAll.mockResolvedValue([null, null]);

      const deckWithTwoImages =
        'layout: header-content\n@main\n<img src="images/a.png">\n\n<img src="images/b.png">\n\n---\n\nlayout: header-content\n@main\n- No images';

      const plan = JSON.stringify({
        plan: [
          {
            action: "rewrite",
            source: [0],
            brief: "Keep only first image",
            reason: "ok",
            title: "S1",
            keepImages: [0], // hallucinated — no images were ever sent
          },
          { action: "polish", source: [1], brief: "Tighten wording", reason: "ok", title: "S2" },
        ],
      });
      const executeResponse = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content: "@main\n- Result",
          },
        ],
      });
      const provider = mockProviderSequence([plan, executeResponse, executeResponse]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, deckWithTwoImages, {
        mode: "remix",
      });
      await orchestrator.runWholeDeckOperation(op);

      // Both images must survive into the execute call's virtual deck since
      // the plan AI never saw any pictures.
      const executeCall = provider.chat.mock.calls[1][0];
      const executeUserMsg = executeCall.messages.find((m) => m.role === "user");
      expect(executeUserMsg.content).toContain("a.png");
      expect(executeUserMsg.content).toContain("b.png");
    });
  });

  describe("runWholeDeckOperation (reimagine with image reuse)", () => {
    const TWO_SLIDE_WITH_IMAGES =
      'layout: header-content\n@header\n## Slide 1\n\n@main\n<img src="images/a.png">\n\n---\n\nlayout: header-content\n@header\n## Slide 2\n\n@main\n<img src="images/b.png">';

    const OUTLINE_WITH_KEEP = JSON.stringify({
      plan: "Reimagined plan.",
      visualSystem: null,
      keepImages: [0], // keep only the first image (a.png)
      chapters: [
        {
          title: "Chapter 1",
          flowTag: "hook",
          summary: "Hook.",
          suggestedSlideCount: 2,
        },
      ],
    });

    const BREAKDOWN_RESPONSE = JSON.stringify({
      chapters: [
        {
          title: "Chapter 1",
          slides: [
            { title: "Slide A", intent: "Intent A." },
            { title: "Slide B", intent: "Intent B." },
          ],
        },
      ],
    });

    const EXECUTE_RESPONSE = JSON.stringify({
      slides: [
        { layout: "header-content", content: "@header\n## Slide A\n\n@main\n- A" },
        { layout: "header-content", content: "@header\n## Slide B\n\n@main\n- B" },
      ],
    });

    it("passes keepImages from outline through to onOutline callback", async () => {
      const { extractAll } = await import("../data/ai/slide-image-extractor.js");
      extractAll.mockResolvedValue([
        [{ src: "images/a.png", dataUrl: "data:image/jpeg;base64,/9j/a=" }],
        [{ src: "images/b.png", dataUrl: "data:image/jpeg;base64,/9j/b=" }],
      ]);

      const provider = mockProviderSequence([
        OUTLINE_WITH_KEEP,
        BREAKDOWN_RESPONSE,
        EXECUTE_RESPONSE,
        EXECUTE_RESPONSE,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_WITH_IMAGES, {
        mode: "reimagine",
        includeImages: true,
      });
      const outlines = [];
      await orchestrator.runWholeDeckOperation(op, undefined, {
        onOutline: async (outline) => {
          outlines.push(outline);
          return outline;
        },
      });
      expect(outlines).toHaveLength(1);
      expect(outlines[0].keepImages).toEqual([0]);
    });

    it("sends kept images as vision content to the generate call", async () => {
      const { extractAll } = await import("../data/ai/slide-image-extractor.js");
      extractAll.mockResolvedValue([
        [{ src: "images/a.png", dataUrl: "data:image/jpeg;base64,/9j/a=" }],
        [{ src: "images/b.png", dataUrl: "data:image/jpeg;base64,/9j/b=" }],
      ]);

      const provider = mockProviderSequence([
        OUTLINE_WITH_KEEP,
        BREAKDOWN_RESPONSE,
        EXECUTE_RESPONSE,
        EXECUTE_RESPONSE,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_WITH_IMAGES, {
        mode: "reimagine",
        includeImages: true,
      });
      await orchestrator.runWholeDeckOperation(op, undefined, {
        onOutline: async (outline) => outline,
      });

      // The generate call (3rd chat call) should have vision content
      const generateCall = provider.chat.mock.calls[2][0];
      const userMsg = generateCall.messages.find((m) => m.role === "user");
      expect(Array.isArray(userMsg.content)).toBe(true);
      const imageBlocks = userMsg.content.filter((b) => b.type === "image_url");
      expect(imageBlocks.length).toBe(1); // only the kept image
    });

    it("lists kept image paths in the generate prompt text", async () => {
      const { extractAll } = await import("../data/ai/slide-image-extractor.js");
      extractAll.mockResolvedValue([
        [{ src: "images/a.png", dataUrl: "data:image/jpeg;base64,/9j/a=" }],
        [{ src: "images/b.png", dataUrl: "data:image/jpeg;base64,/9j/b=" }],
      ]);

      const provider = mockProviderSequence([
        OUTLINE_WITH_KEEP,
        BREAKDOWN_RESPONSE,
        EXECUTE_RESPONSE,
        EXECUTE_RESPONSE,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_WITH_IMAGES, {
        mode: "reimagine",
        includeImages: true,
      });
      await orchestrator.runWholeDeckOperation(op, undefined, {
        onOutline: async (outline) => outline,
      });

      // The generate call user content (as text) should mention the kept image path
      const generateCall = provider.chat.mock.calls[2][0];
      const userMsg = generateCall.messages.find((m) => m.role === "user");
      const textPart = Array.isArray(userMsg.content)
        ? userMsg.content.find((b) => b.type === "text")?.text
        : userMsg.content;
      expect(textPart).toContain("images/a.png");
      // The non-kept image should NOT be listed
      expect(textPart).not.toContain("images/b.png");
    });

    it("lists kept images in the breakdown prompt", async () => {
      const { extractAll } = await import("../data/ai/slide-image-extractor.js");
      extractAll.mockResolvedValue([
        [{ src: "images/a.png", dataUrl: "data:image/jpeg;base64,/9j/a=" }],
        [{ src: "images/b.png", dataUrl: "data:image/jpeg;base64,/9j/b=" }],
      ]);

      const provider = mockProviderSequence([
        OUTLINE_WITH_KEEP,
        BREAKDOWN_RESPONSE,
        EXECUTE_RESPONSE,
        EXECUTE_RESPONSE,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_WITH_IMAGES, {
        mode: "reimagine",
        includeImages: true,
      });
      await orchestrator.runWholeDeckOperation(op, undefined, {
        onOutline: async (outline) => outline,
      });

      // The breakdown call (2nd chat call) should list the kept image
      const breakdownCall = provider.chat.mock.calls[1][0];
      const breakdownUser = breakdownCall.messages.find((m) => m.role === "user").content;
      expect(breakdownUser).toContain("images/a.png");
      expect(breakdownUser).not.toContain("images/b.png");
    });

    it("does not send vision content when keepImages is empty", async () => {
      const { extractAll } = await import("../data/ai/slide-image-extractor.js");
      extractAll.mockResolvedValue([
        [{ src: "images/a.png", dataUrl: "data:image/jpeg;base64,/9j/a=" }],
        [{ src: "images/b.png", dataUrl: "data:image/jpeg;base64,/9j/b=" }],
      ]);

      const outlineNoKeep = JSON.stringify({
        plan: "Reimagined plan.",
        visualSystem: null,
        keepImages: [],
        chapters: [{ title: "C1", flowTag: "hook", summary: "Hook.", suggestedSlideCount: 2 }],
      });

      const provider = mockProviderSequence([
        outlineNoKeep,
        BREAKDOWN_RESPONSE,
        EXECUTE_RESPONSE,
        EXECUTE_RESPONSE,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_WITH_IMAGES, {
        mode: "reimagine",
        includeImages: true,
      });
      await orchestrator.runWholeDeckOperation(op, undefined, {
        onOutline: async (outline) => outline,
      });

      // The generate call should be text-only (no vision content)
      const generateCall = provider.chat.mock.calls[2][0];
      const userMsg = generateCall.messages.find((m) => m.role === "user");
      expect(typeof userMsg.content).toBe("string");
    });

    it("falls back to text-only generate when provider rejects vision", async () => {
      const { extractAll } = await import("../data/ai/slide-image-extractor.js");
      extractAll.mockResolvedValue([
        [{ src: "images/a.png", dataUrl: "data:image/jpeg;base64,/9j/a=" }],
        [{ src: "images/b.png", dataUrl: "data:image/jpeg;base64,/9j/b=" }],
      ]);

      const visionError = new Error("HTTP 400: model does not support image content");
      visionError.name = "AiHttpError";
      visionError.status = 400;
      const provider = {
        chat: vi
          .fn()
          .mockResolvedValueOnce({ content: OUTLINE_WITH_KEEP, raw: { finish_reason: "stop" } })
          .mockResolvedValueOnce({ content: BREAKDOWN_RESPONSE, raw: { finish_reason: "stop" } })
          .mockRejectedValueOnce(visionError) // generate with images fails
          .mockResolvedValue({ content: EXECUTE_RESPONSE, raw: { finish_reason: "stop" } }), // text-only retry and any repair
      };
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_WITH_IMAGES, {
        mode: "reimagine",
        includeImages: true,
      });
      const logs = [];
      const result = await orchestrator.runWholeDeckOperation(op, undefined, {
        onOutline: async (outline) => outline,
        onLog: (msg) => logs.push(msg),
      });
      expect(result).not.toBeNull();
      expect(logs.some((l) => l.includes("Vision not supported"))).toBe(true);
    });

    it("retries breakdown parse failure and succeeds on second attempt", async () => {
      const { extractAll } = await import("../data/ai/slide-image-extractor.js");
      extractAll.mockResolvedValue([[], []]);

      const BAD_BREAKDOWN = "Sure! Here {is} the breakdown:\nThis is not JSON at all.";
      const GOOD_BREAKDOWN = JSON.stringify({
        chapters: [
          {
            title: "Chapter 1",
            slides: [
              { title: "Slide A", intent: "Intent A." },
              { title: "Slide B", intent: "Intent B." },
            ],
          },
        ],
      });

      const provider = mockProviderSequence([
        OUTLINE_WITH_KEEP,
        BAD_BREAKDOWN, // first breakdown attempt fails
        GOOD_BREAKDOWN, // retry succeeds
        EXECUTE_RESPONSE,
        EXECUTE_RESPONSE,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_WITH_IMAGES, {
        mode: "reimagine",
        includeImages: true,
      });
      const logs = [];
      const result = await orchestrator.runWholeDeckOperation(op, undefined, {
        onOutline: async (outline) => outline,
        onLog: (msg) => logs.push(msg),
      });
      expect(result).not.toBeNull();
      expect(logs.some((l) => l.includes("Breakdown parse failed"))).toBe(true);
      // The retry consumed an extra provider call: outline + bad breakdown +
      // retry breakdown + execute (which passes validation on the first attempt).
      expect(provider.chat).toHaveBeenCalledTimes(4);
    });

    it("keeps AI-chosen theme/background colors in the reimagine result", async () => {
      const provider = mockProviderSequence([
        OUTLINE_WITH_KEEP,
        BREAKDOWN_RESPONSE,
        JSON.stringify({
          slides: [
            {
              layout: "header-content",
              content: "theme: dark\nbackground: #1a1a2e\n@header\n## Slide A\n\n@main\n- A",
            },
            {
              layout: "header-content",
              content: "@header\n## Slide B\n\n@main\n- B",
            },
          ],
        }),
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_WITH_IMAGES, {
        mode: "reimagine",
      });
      const result = await orchestrator.runWholeDeckOperation(op, undefined, {
        onOutline: async (outline) => outline,
      });

      // Reimagine no longer enforces a strict palette, so AI-chosen colors are
      // preserved and the theme is inferred/confirmed to remain legible.
      expect(result).toContain("Slide A");
      expect(result).toContain("theme: dark");
      expect(result).toContain("background: #1a1a2e");
    });

    it("removes fabricated images from the reimagine result mechanically", async () => {
      const { extractAll } = await import("../data/ai/slide-image-extractor.js");
      extractAll.mockResolvedValue([
        [{ src: "images/a.png", dataUrl: "data:image/jpeg;base64,/9j/a=" }],
        [{ src: "images/b.png", dataUrl: "data:image/jpeg;base64,/9j/b=" }],
      ]);

      // No kept images and no reuse: refs in the briefs — the image-source
      // check is skipped for an empty allowlist, so the fabricated reference
      // must be removed mechanically from the final deck.
      const OUTLINE_NO_KEEP = JSON.stringify({
        plan: "Reimagined plan.",
        visualSystem: null,
        keepImages: [],
        chapters: [
          {
            title: "Chapter 1",
            flowTag: "hook",
            summary: "Hook.",
            suggestedSlideCount: 2,
          },
        ],
      });
      const provider = mockProviderSequence([
        OUTLINE_NO_KEEP,
        BREAKDOWN_RESPONSE,
        JSON.stringify({
          slides: [
            {
              layout: "header-content",
              content:
                '@header\n## Slide A\n\n@main\n- A\n\n<img src="https://evil.example/x.png">',
            },
            { layout: "header-content", content: "@header\n## Slide B\n\n@main\n- B" },
          ],
        }),
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_WITH_IMAGES, {
        mode: "reimagine",
        includeImages: true,
      });
      const result = await orchestrator.runWholeDeckOperation(op, undefined, {
        onOutline: async (outline) => outline,
      });

      // Execute passed validation on the first attempt (3 calls), and the
      // fabricated image is gone from the final deck.
      expect(provider.chat).toHaveBeenCalledTimes(3);
      expect(result).toContain("Slide A");
      expect(result).not.toContain("evil.example");
      expect(result).not.toContain("<img");
    });

    it("keeps image backgrounds in the reimagine result (strips colors/themes only)", async () => {
      const { extractAll } = await import("../data/ai/slide-image-extractor.js");
      extractAll.mockResolvedValue([
        [{ src: "images/a.png", dataUrl: "data:image/jpeg;base64,/9j/a=" }],
        [{ src: "images/b.png", dataUrl: "data:image/jpeg;base64,/9j/b=" }],
      ]);

      const provider = mockProviderSequence([
        OUTLINE_WITH_KEEP,
        BREAKDOWN_RESPONSE,
        JSON.stringify({
          slides: [
            {
              layout: "full-image",
              content:
                'theme: dark\nbackground: #0f172a\nbackground: url(images/a.png) center/cover\n@main\n<img src="images/a.png">',
            },
            { layout: "header-content", content: "@header\n## Slide B\n\n@main\n- B" },
          ],
        }),
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_WITH_IMAGES, {
        mode: "reimagine",
        includeImages: true,
      });
      const result = await orchestrator.runWholeDeckOperation(op, undefined, {
        onOutline: async (outline) => outline,
      });

      // Execute passed validation on the first attempt (3 calls). The theme
      // light/dark is kept, the non-palette color background is stripped, and
      // the full-bleed image background survives.
      expect(provider.chat).toHaveBeenCalledTimes(3);
      expect(result).toContain("background: url(images/a.png) center/cover");
      expect(result).toContain("theme: dark");
      expect(result).not.toContain("background: #0f172a");
    });

    it("allows kept images in the execute output when briefs carry no reuse: refs", async () => {
      const { extractAll } = await import("../data/ai/slide-image-extractor.js");
      extractAll.mockResolvedValue([
        [{ src: "images/a.png", dataUrl: "data:image/jpeg;base64,/9j/a=" }],
        [{ src: "images/b.png", dataUrl: "data:image/jpeg;base64,/9j/b=" }],
      ]);

      // BREAKDOWN_RESPONSE briefs have no imageQuery, so the virtual deck has
      // no reuse:<path> reference — the kept image (a.png) is only known via
      // the available-images suffix list and must be allowed through the
      // explicit allowedImageSrcs union.
      const executeWithKeptImage = JSON.stringify({
        slides: [
          {
            layout: "header-content",
            content: '@header\n## Slide A\n\n@main\n<img src="images/a.png" alt="A">',
          },
          { layout: "header-content", content: "@header\n## Slide B\n\n@main\n- B" },
        ],
      });
      const provider = mockProviderSequence([
        OUTLINE_WITH_KEEP,
        BREAKDOWN_RESPONSE,
        executeWithKeptImage,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_WITH_IMAGES, {
        mode: "reimagine",
        includeImages: true,
      });
      const result = await orchestrator.runWholeDeckOperation(op, undefined, {
        onOutline: async (outline) => outline,
      });

      // Execute passed validation on the first attempt: outline + breakdown +
      // execute = 3 calls, no repair round-trip.
      expect(provider.chat).toHaveBeenCalledTimes(3);
      expect(result).toContain('src="images/a.png"');
    });
  });

  describe("runWholeDeckOperation (reimagine flow-aware outline)", () => {
    const DECK_MD =
      "layout: header-content\n@header\n## Slide 1\n\n@main\n- Item 1\n\n---\n\nlayout: header-content\n@header\n## Slide 2\n\n@main\n- Item 2";
    const outlineResponse = JSON.stringify({
      plan: "Plan.",
      visualSystem: { visualDirection: "Dark, technical." },
      chapters: [{ title: "Ch1", flowTag: "hook", summary: "S.", suggestedSlideCount: 1 }],
    });
    const breakdownResponse = JSON.stringify({
      chapters: [{ title: "Ch1", slides: [{ title: "S", intent: "I." }] }],
    });
    const executeResponse = JSON.stringify({
      slides: [{ layout: "header-content", content: "@header\n## S\n\n@main\n- x" }],
    });

    it("injects instructional technique menu for instructional flow", async () => {
      const provider = mockProviderSequence([
        outlineResponse,
        breakdownResponse,
        executeResponse,
        executeResponse,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, DECK_MD, {
        mode: "reimagine",
        flow: "instructional",
      });
      await orchestrator.runWholeDeckOperation(op);
      const outlineUser = provider.chat.mock.calls[0][0].messages.find(
        (m) => m.role === "user",
      ).content;
      expect(outlineUser).toContain("**instructional**");
      expect(outlineUser).toContain("Objectives");
      expect(outlineUser).toContain("Step-by-step");
      expect(outlineUser).toContain("Recap");
      // Should NOT contain story-specific techniques
      expect(outlineUser).not.toContain("Character arc");
      expect(outlineUser).not.toContain("Hook → Tension → Resolution");
    });

    it("injects technical technique menu for technical flow", async () => {
      const provider = mockProviderSequence([
        outlineResponse,
        breakdownResponse,
        executeResponse,
        executeResponse,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, DECK_MD, {
        mode: "reimagine",
        flow: "technical",
      });
      await orchestrator.runWholeDeckOperation(op);
      const outlineUser = provider.chat.mock.calls[0][0].messages.find(
        (m) => m.role === "user",
      ).content;
      expect(outlineUser).toContain("**technical**");
      expect(outlineUser).toContain("Assertion → Evidence");
      expect(outlineUser).toContain("Context → Concept → Evidence → Implications");
      // Should NOT contain instructional techniques
      expect(outlineUser).not.toContain("Objectives");
      expect(outlineUser).not.toContain("Step-by-step");
    });

    it("injects story technique menu for story flow", async () => {
      const provider = mockProviderSequence([
        outlineResponse,
        breakdownResponse,
        executeResponse,
        executeResponse,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, DECK_MD, {
        mode: "reimagine",
        flow: "story",
      });
      await orchestrator.runWholeDeckOperation(op);
      const outlineUser = provider.chat.mock.calls[0][0].messages.find(
        (m) => m.role === "user",
      ).content;
      expect(outlineUser).toContain("**story**");
      expect(outlineUser).toContain("Hook → Tension → Resolution");
      expect(outlineUser).toContain("Character arc");
      // Should NOT contain instructional or technical techniques
      expect(outlineUser).not.toContain("Objectives");
      expect(outlineUser).not.toContain("Assertion → Evidence");
    });

    it("threads flowTag from outline to breakdown prompt", async () => {
      const outlineWithTag = JSON.stringify({
        plan: "Plan.",
        visualSystem: { visualDirection: "Dark, technical." },
        chapters: [
          {
            title: "Learning objectives",
            flowTag: "objectives",
            summary: "What the audience will learn.",
            suggestedSlideCount: 1,
          },
        ],
      });
      const provider = mockProviderSequence([
        outlineWithTag,
        breakdownResponse,
        executeResponse,
        executeResponse,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, DECK_MD, {
        mode: "reimagine",
        flow: "instructional",
      });
      await orchestrator.runWholeDeckOperation(op);
      const breakdownUser = provider.chat.mock.calls[1][0].messages.find(
        (m) => m.role === "user",
      ).content;
      // flowTag is serialized in the chapters JSON
      expect(breakdownUser).toContain('"flowTag"');
      expect(breakdownUser).toContain("objectives");
      // The breakdown prompt explains flow tags
      expect(breakdownUser).toContain("Flow tags");
    });

    it("accepts extended flowTag vocabulary in outline response", async () => {
      const tags = ["objectives", "steps", "practice", "recap", "assertion", "implication"];
      for (const tag of tags) {
        const outlineWithTag = JSON.stringify({
          plan: "Plan.",
          visualSystem: { visualDirection: "Dark, technical." },
          chapters: [
            {
              title: "Ch1",
              flowTag: tag,
              summary: "S.",
              suggestedSlideCount: 1,
            },
          ],
        });
        const provider = mockProviderSequence([
          outlineWithTag,
          breakdownResponse,
          executeResponse,
          executeResponse,
        ]);
        const orchestrator = new AiOrchestrator({ provider });
        const op = createOperation("generate", null, DECK_MD, {
          mode: "reimagine",
          flow: "instructional",
        });
        const outlines = [];
        await orchestrator.runWholeDeckOperation(op, undefined, {
          onOutline: async (outline) => {
            outlines.push(outline);
            return outline;
          },
        });
        expect(outlines[0].chapters[0].flowTag).toBe(tag);
      }
    });
  });

  describe("truncation handling (batched path)", () => {
    // Build a deck with >BATCH_SIZE slides so the batched path is used.
    // BATCH_SIZE is 8; we use 10 slides.
    const BIG_DECK = Array.from(
      { length: 10 },
      (_, i) => `layout: header-content\n@header\n## Slide ${i + 1}\n\n@main\n- Item ${i + 1}`,
    ).join("\n\n---\n\n");

    it("terminates when a single-slide batch keeps truncating (no infinite loop)", async () => {
      // Every call returns finish_reason: "length" (truncation) so the
      // batch keeps trying to split. With a 1-slide batch it can't split,
      // so it must bail instead of looping forever.
      const provider = {
        chat: vi.fn().mockResolvedValue({
          content: '{"slides":[]}',
          raw: { finish_reason: "length" },
        }),
      };
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, BIG_DECK);
      // Should resolve (not hang) — the truncation cap prevents infinite looping.
      const result = await orchestrator.runWholeDeckOperation(op);
      // Provider was called a finite number of times (not infinite)
      expect(provider.chat.mock.calls.length).toBeLessThan(50);
      // Result may be null or partial, but must not hang
      expect(result).toBeDefined();
    });
  });
});

describe("isVisionError", () => {
  it("classifies 'No endpoints found that support image input' as a vision error", () => {
    const err = new Error("HTTP 404: No endpoints found that support image input");
    err.name = "AiHttpError";
    err.status = 404;
    expect(isVisionError(err)).toBe(true);
  });

  it("classifies 'does not support image input' as a vision error", () => {
    const err = new Error("HTTP 400: model does not support image input");
    err.name = "AiHttpError";
    err.status = 400;
    expect(isVisionError(err)).toBe(true);
  });

  it("does not classify a generic 404 as a vision error", () => {
    const err = new Error("HTTP 404: model not found");
    err.name = "AiHttpError";
    err.status = 404;
    expect(isVisionError(err)).toBe(false);
  });

  it("does not classify auth or rate-limit errors as vision errors", () => {
    for (const status of [401, 403, 429]) {
      const err = new Error(`HTTP ${status}: denied`);
      err.name = "AiHttpError";
      err.status = status;
      expect(isVisionError(err)).toBe(false);
    }
  });
});
