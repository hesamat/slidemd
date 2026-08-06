import { describe, it, expect, vi } from "vitest";
import { AiOrchestrator } from "../data/ai/ai-orchestrator.js";
import { createOperation } from "../data/ai/ai-operation.js";

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
  });

  describe("runWholeDeckOperation (remix)", () => {
    const TWO_SLIDE_MD =
      "layout: header-content\n@header\n## Slide 1\n\n@main\n- Item 1\n\n---\n\nlayout: header-content\n@header\n## Slide 2\n\n@main\n- Item 2";

    const REMIX_PLAN_RESPONSE = JSON.stringify({
      plan: [
        { action: "keep", source: [0], brief: "", title: "Slide 1" },
        {
          action: "rewrite",
          source: [1],
          brief: "Make this more concise",
          title: "Slide 2",
        },
      ],
    });

    // With the keep short-circuit, only the non-keep (rewrite) plan entry is
    // sent to the execute call, so the mock response contains 1 slide.
    const EXECUTE_RESPONSE = JSON.stringify({
      slides: [
        {
          layout: "header-content",
          content: "@header\n## Slide 2\n\n@main\n- Concise point",
        },
      ],
    });

    it("runs plan phase then execute phase for fidelity=rewrite", async () => {
      // Provide enough execute responses for validation retries
      const provider = mockProviderSequence([
        REMIX_PLAN_RESPONSE,
        EXECUTE_RESPONSE,
        EXECUTE_RESPONSE,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { fidelity: "rewrite" });
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
      expect(logs.some((l) => l.includes("[Plan] Keep"))).toBe(true);
      expect(logs.some((l) => l.includes("[Plan] Rewrite"))).toBe(true);
    });

    it("does not route to remix for fidelity=enhance", async () => {
      const provider = mockProvider(SINGLE_SLIDE_RESPONSE);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, SINGLE_SLIDE_MD, { fidelity: "enhance" });
      await orchestrator.runWholeDeckOperation(op);
      // No plan phase — the call count matches the normal generate path
      // (1 or 2 depending on validation retry), not the remix 2-phase flow.
      expect(provider.chat).toHaveBeenCalled();
    });

    it("throws on invalid plan action", async () => {
      const badPlan = JSON.stringify({
        plan: [{ action: "split", source: [0], brief: "split this", title: "X" }],
      });
      const provider = mockProviderSequence([badPlan, EXECUTE_RESPONSE]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { fidelity: "rewrite" });
      await expect(orchestrator.runWholeDeckOperation(op)).rejects.toThrow("Invalid remix plan");
    });

    it("throws on out-of-range source index", async () => {
      const badPlan = JSON.stringify({
        plan: [
          { action: "keep", source: [0], brief: "", title: "S1" },
          { action: "rewrite", source: [5], brief: "fix", title: "S5" },
        ],
      });
      const provider = mockProviderSequence([badPlan, EXECUTE_RESPONSE]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { fidelity: "rewrite" });
      await expect(orchestrator.runWholeDeckOperation(op)).rejects.toThrow("Invalid remix plan");
    });

    it("throws on uncovered source slide", async () => {
      const badPlan = JSON.stringify({
        plan: [{ action: "keep", source: [0], brief: "", title: "S1" }],
      });
      const provider = mockProviderSequence([badPlan, EXECUTE_RESPONSE]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { fidelity: "rewrite" });
      await expect(orchestrator.runWholeDeckOperation(op)).rejects.toThrow("Invalid remix plan");
    });

    it("handles merge action in plan", async () => {
      const mergePlan = JSON.stringify({
        plan: [
          {
            action: "merge",
            source: [0, 1],
            brief: "Combine into one slide",
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
      const op = createOperation("generate", null, TWO_SLIDE_MD, { fidelity: "rewrite" });
      const logs = [];
      const result = await orchestrator.runWholeDeckOperation(op, undefined, {
        onLog: (msg) => logs.push(msg),
      });

      expect(result).toContain("Combined");
      expect(logs.some((l) => l.includes("[Plan] Merge"))).toBe(true);
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
