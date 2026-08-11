import { describe, it, expect } from "vitest";
import { normalizeBeats } from "../data/ai/beat-normalizer.js";

describe("normalizeBeats", () => {
  it("changes first slide punctuation to continuation", () => {
    const slides = [{ visualBeat: "punctuation" }, { visualBeat: "continuation" }];
    normalizeBeats(slides);
    expect(slides[0].visualBeat).toBe("continuation");
    expect(slides[1].visualBeat).toBe("continuation");
  });

  it("changes first slide divider to continuation", () => {
    const slides = [{ visualBeat: "divider" }, { visualBeat: "continuation" }];
    normalizeBeats(slides);
    expect(slides[0].visualBeat).toBe("continuation");
  });

  it("changes first slide emotional to continuation", () => {
    const slides = [{ visualBeat: "emotional" }, { visualBeat: "continuation" }];
    normalizeBeats(slides);
    expect(slides[0].visualBeat).toBe("continuation");
  });

  it("leaves first slide transition unchanged", () => {
    const slides = [{ visualBeat: "transition" }, { visualBeat: "continuation" }];
    normalizeBeats(slides);
    expect(slides[0].visualBeat).toBe("transition");
  });

  it("leaves first slide continuation unchanged", () => {
    const slides = [{ visualBeat: "continuation" }, { visualBeat: "continuation" }];
    normalizeBeats(slides);
    expect(slides[0].visualBeat).toBe("continuation");
  });

  it("downgrades second consecutive high-impact beat to continuation", () => {
    const slides = [
      { visualBeat: "continuation" },
      { visualBeat: "punctuation" },
      { visualBeat: "emotional" },
    ];
    normalizeBeats(slides);
    expect(slides[0].visualBeat).toBe("continuation");
    expect(slides[1].visualBeat).toBe("punctuation");
    expect(slides[2].visualBeat).toBe("continuation");
  });

  it("downgrades second consecutive divider to continuation", () => {
    const slides = [
      { visualBeat: "continuation" },
      { visualBeat: "divider" },
      { visualBeat: "divider" },
    ];
    normalizeBeats(slides);
    expect(slides[1].visualBeat).toBe("divider");
    expect(slides[2].visualBeat).toBe("continuation");
  });

  it("leaves non-consecutive high-impact beats unchanged", () => {
    const slides = [
      { visualBeat: "continuation" },
      { visualBeat: "punctuation" },
      { visualBeat: "continuation" },
      { visualBeat: "emotional" },
    ];
    normalizeBeats(slides);
    expect(slides[1].visualBeat).toBe("punctuation");
    expect(slides[3].visualBeat).toBe("emotional");
  });

  it("leaves normal sequences unchanged", () => {
    const slides = [
      { visualBeat: "continuation" },
      { visualBeat: "continuation" },
      { visualBeat: "transition" },
      { visualBeat: "continuation" },
      { visualBeat: "punctuation" },
      { visualBeat: "continuation" },
    ];
    const original = slides.map((s) => ({ ...s }));
    normalizeBeats(slides);
    expect(slides).toEqual(original);
  });

  it("handles empty array", () => {
    expect(normalizeBeats([])).toEqual([]);
  });

  it("handles single slide", () => {
    const slides = [{ visualBeat: "continuation" }];
    normalizeBeats(slides);
    expect(slides[0].visualBeat).toBe("continuation");
  });

  it("handles single high-impact slide (normalized to continuation)", () => {
    const slides = [{ visualBeat: "punctuation" }];
    normalizeBeats(slides);
    expect(slides[0].visualBeat).toBe("continuation");
  });

  it("handles three consecutive high-impact beats", () => {
    const slides = [
      { visualBeat: "punctuation" },
      { visualBeat: "emotional" },
      { visualBeat: "divider" },
    ];
    normalizeBeats(slides);
    // First: punctuation → continuation (rule 1)
    expect(slides[0].visualBeat).toBe("continuation");
    // Second: emotional, preceded by continuation → stays emotional
    expect(slides[1].visualBeat).toBe("emotional");
    // Third: divider, preceded by emotional (high-impact) → continuation (rule 2)
    expect(slides[2].visualBeat).toBe("continuation");
  });
});
