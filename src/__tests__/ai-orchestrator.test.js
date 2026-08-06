import { describe, it, expect, vi } from "vitest";
import { AiOrchestrator } from "../data/ai/ai-orchestrator.js";
import { createOperation } from "../data/ai/ai-operation.js";

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
      expect(logs.some((l) => l.includes("[Plan] Keep"))).toBe(true);
      expect(logs.some((l) => l.includes("[Plan] Rewrite"))).toBe(true);
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
      expect(planUser).toContain("Preserve the original theme");
    });

    it("routes to remix for mode=reimagine", async () => {
      const provider = mockProviderSequence([
        JSON.stringify({
          plan: [
            { action: "keep", source: [0], brief: "", title: "Slide 1" },
            { action: "rewrite", source: [1], brief: "Bold rewrite", title: "Slide 2" },
          ],
        }),
        EXECUTE_RESPONSE,
        EXECUTE_RESPONSE,
      ]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "reimagine" });
      const result = await orchestrator.runWholeDeckOperation(op);
      expect(result).toContain("Slide 1");
      expect(result).toContain("Slide 2");
      // The plan prompt should mention bold approach and allow visual changes
      const planUser = provider.chat.mock.calls[0][0].messages.find(
        (m) => m.role === "user",
      ).content;
      expect(planUser).toContain("Take a bold editorial approach");
      expect(planUser).toContain("You may change the theme");
    });

    it("throws on invalid plan action", async () => {
      const badPlan = JSON.stringify({
        plan: [{ action: "split", source: [0], brief: "split this", title: "X" }],
      });
      const provider = mockProviderSequence([badPlan, EXECUTE_RESPONSE]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "remix" });
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
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "remix" });
      await expect(orchestrator.runWholeDeckOperation(op)).rejects.toThrow("Invalid remix plan");
    });

    it("throws on uncovered source slide", async () => {
      const badPlan = JSON.stringify({
        plan: [{ action: "keep", source: [0], brief: "", title: "S1" }],
      });
      const provider = mockProviderSequence([badPlan, EXECUTE_RESPONSE]);
      const orchestrator = new AiOrchestrator({ provider });
      const op = createOperation("generate", null, TWO_SLIDE_MD, { mode: "remix" });
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
          title: "Slide 1",
          keepImages: [0],
        },
        { action: "keep", source: [1], brief: "", title: "Slide 2" },
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
            title: "S1",
            keepImages: "not-an-array",
          },
          { action: "keep", source: [1], brief: "", title: "S2" },
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
            title: "S1",
            keepImages: [0], // keep only a.png, drop b.png
          },
          { action: "keep", source: [1], brief: "", title: "S2" },
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
            title: "S1",
            keepImages: [0], // hallucinated — no images were ever sent
          },
          { action: "keep", source: [1], brief: "", title: "S2" },
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
