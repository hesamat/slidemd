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
      // 12 slides / 8 per batch = 2 batches; progress is reported in slide count
      expect(progressCalls).toHaveLength(2);
      expect(progressCalls[0].total).toBe(12);
      expect(progressCalls[0].completed).toBe(8);
      expect(progressCalls[1].completed).toBe(12);
    });
  });
});
