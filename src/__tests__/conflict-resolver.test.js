import { describe, expect, it } from "vitest";
import { resolveConflict } from "../data/store/conflict-resolver.js";
import { createEditPatch } from "../data/store/slide-patch.js";

const ORIGINAL = `layout: header-content
@header
## Slide 1

@main
- Point 1`;

const AI_ENHANCED = `layout: header-content
@header
## Slide 1

@main
- Point 1 enhanced`;

const NOTES = `Some speaker notes`;
const NOTES_AI_RESULT = `${ORIGINAL}

<!-- notes: ${NOTES} -->`;

const DRIFTED = `layout: header-content
@header
## Slide 1

@main
- Point 1 edited by user`;

const CURRENT_WITH_OLD_NOTES = `${ORIGINAL}

<!-- notes: Old notes -->`;

describe("resolveConflict", () => {
  it("applies an enhanceSlide patch when the current slide is unchanged", () => {
    const patch = createEditPatch(0, ORIGINAL, AI_ENHANCED, "ai");
    const result = resolveConflict({
      patch,
      currentSlideMarkdown: ORIGINAL,
      intent: "enhanceSlide",
    });
    expect(result.action).toBe("apply");
    expect(result.rebasedPatch).toBeUndefined();
    expect(result.reason).toBeUndefined();
  });

  it("rejects an enhanceSlide patch when the user drifted and no rebase is given", () => {
    const patch = createEditPatch(0, ORIGINAL, AI_ENHANCED, "ai");
    const result = resolveConflict({
      patch,
      currentSlideMarkdown: DRIFTED,
      intent: "enhanceSlide",
    });
    expect(result.action).toBe("reject");
    expect(result.reason).toContain("slide has changed");
  });

  it("rebases enhanceSlide apply-to-latest", () => {
    const patch = createEditPatch(0, ORIGINAL, AI_ENHANCED, "ai");
    const result = resolveConflict({
      patch,
      currentSlideMarkdown: DRIFTED,
      intent: "enhanceSlide",
      rebase: "apply-to-latest",
    });
    expect(result.action).toBe("rebase");
    expect(result.rebasedPatch).toMatchObject({
      index: 0,
      before: DRIFTED,
      after: AI_ENHANCED,
      source: "ai",
      kind: "rebase",
    });
  });

  it("rebases enhanceSlide apply-to-original", () => {
    const patch = createEditPatch(0, ORIGINAL, AI_ENHANCED, "ai");
    const result = resolveConflict({
      patch,
      currentSlideMarkdown: DRIFTED,
      intent: "enhanceSlide",
      rebase: "apply-to-original",
    });
    expect(result.action).toBe("rebase");
    expect(result.rebasedPatch).toMatchObject({
      index: 0,
      before: DRIFTED,
      after: ORIGINAL,
      source: "ai",
      kind: "rebase",
    });
  });

  it("rejects an enhanceSlide patch when the structural revision changed and no rebase is given", () => {
    const patch = createEditPatch(0, ORIGINAL, AI_ENHANCED, "ai");
    const result = resolveConflict({
      patch,
      currentSlideMarkdown: DRIFTED,
      intent: "enhanceSlide",
      structuralRevisionChanged: true,
    });
    expect(result.action).toBe("reject");
    expect(result.reason).toContain("structure changed");
  });

  it("rejects an addSpeakerNotes patch when the slide body changed and no rebase is given", () => {
    const patch = createEditPatch(0, ORIGINAL, NOTES_AI_RESULT, "ai");
    const result = resolveConflict({
      patch,
      currentSlideMarkdown: DRIFTED,
      intent: "addSpeakerNotes",
    });
    expect(result.action).toBe("reject");
    expect(result.reason).toContain("rebase choice");
  });

  it("applies an addSpeakerNotes patch when the current slide still matches the original", () => {
    const patch = createEditPatch(0, ORIGINAL, NOTES_AI_RESULT, "ai");
    const result = resolveConflict({
      patch,
      currentSlideMarkdown: ORIGINAL,
      intent: "addSpeakerNotes",
    });
    expect(result.action).toBe("apply");
  });

  it("rejects addSpeakerNotes when the visible content is unchanged and no rebase is chosen", () => {
    const patch = createEditPatch(0, ORIGINAL, NOTES_AI_RESULT, "ai");
    const result = resolveConflict({
      patch,
      currentSlideMarkdown: CURRENT_WITH_OLD_NOTES,
      intent: "addSpeakerNotes",
    });
    expect(result.action).toBe("reject");
    expect(result.reason).toContain("choose");
  });

  it("rebases addSpeakerNotes apply-to-latest when the visible content is unchanged", () => {
    const patch = createEditPatch(0, ORIGINAL, NOTES_AI_RESULT, "ai");
    const result = resolveConflict({
      patch,
      currentSlideMarkdown: CURRENT_WITH_OLD_NOTES,
      intent: "addSpeakerNotes",
      rebase: "apply-to-latest",
    });
    expect(result.action).toBe("rebase");
    expect(result.rebasedPatch).toMatchObject({
      index: 0,
      before: CURRENT_WITH_OLD_NOTES,
      source: "ai",
      kind: "rebase",
    });
    expect(result.rebasedPatch.after).toContain("<!-- notes: Some speaker notes -->");
    expect(result.rebasedPatch.after).not.toContain("Old notes");
  });

  it("rejects addSpeakerNotes when the AI result has no notes", () => {
    const patch = createEditPatch(0, ORIGINAL, ORIGINAL, "ai");
    const result = resolveConflict({
      patch,
      currentSlideMarkdown: ORIGINAL,
      intent: "addSpeakerNotes",
    });
    expect(result.action).toBe("reject");
    expect(result.reason).toContain("does not contain a speaker notes block");
  });

  it("rejects addSpeakerNotes when the structural revision changed", () => {
    const patch = createEditPatch(0, ORIGINAL, NOTES_AI_RESULT, "ai");
    const result = resolveConflict({
      patch,
      currentSlideMarkdown: ORIGINAL,
      intent: "addSpeakerNotes",
      structuralRevisionChanged: true,
    });
    expect(result.action).toBe("reject");
    expect(result.reason).toContain("structure changed");
  });

  it("rebases addSpeakerNotes apply-to-latest with changed body", () => {
    const patch = createEditPatch(0, ORIGINAL, NOTES_AI_RESULT, "ai");
    const result = resolveConflict({
      patch,
      currentSlideMarkdown: DRIFTED,
      intent: "addSpeakerNotes",
      rebase: "apply-to-latest",
    });
    expect(result.action).toBe("rebase");
    expect(result.rebasedPatch).toMatchObject({
      index: 0,
      before: DRIFTED,
      source: "ai",
      kind: "rebase",
    });
    expect(result.rebasedPatch.after).toContain("- Point 1 edited by user");
    expect(result.rebasedPatch.after).toContain("<!-- notes: Some speaker notes -->");
  });

  it("rebases addSpeakerNotes apply-to-original", () => {
    const patch = createEditPatch(0, ORIGINAL, NOTES_AI_RESULT, "ai");
    const result = resolveConflict({
      patch,
      currentSlideMarkdown: DRIFTED,
      intent: "addSpeakerNotes",
      rebase: "apply-to-original",
    });
    expect(result.action).toBe("rebase");
    expect(result.rebasedPatch).toMatchObject({
      index: 0,
      before: DRIFTED,
      source: "ai",
      kind: "rebase",
    });
    expect(result.rebasedPatch.after).toContain("- Point 1");
    expect(result.rebasedPatch.after).not.toContain("edited by user");
    expect(result.rebasedPatch.after).toContain("<!-- notes: Some speaker notes -->");
  });

  it("rejects an unsupported intent", () => {
    const patch = createEditPatch(0, ORIGINAL, AI_ENHANCED, "ai");
    const result = resolveConflict({
      patch,
      currentSlideMarkdown: ORIGINAL,
      intent: "remixDeck",
    });
    expect(result.action).toBe("reject");
    expect(result.reason).toContain("Unsupported intent");
  });
});
