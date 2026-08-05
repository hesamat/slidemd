import { describe, it, expect } from "vitest";
import { buildRepairMessage } from "../data/ai/ai-repair-message.js";

describe("buildRepairMessage", () => {
  it("lists multiple errors with slide locations", () => {
    const errors = [
      { slide: 0, code: "INVALID_AREA", message: "@sidebar is not allowed" },
      { slide: -1, code: "TOO_FEW_SLIDES", message: "Expected at least 1 slide" },
    ];
    const msg = buildRepairMessage(errors);
    expect(msg).toContain("The previous output had these issues:");
    expect(msg).toContain("Slide 1: @sidebar is not allowed");
    expect(msg).toContain("Deck: Expected at least 1 slide");
    expect(msg).toContain("Fix these issues and return the complete corrected output.");
  });

  it("returns a message with no bullet points for empty errors", () => {
    const msg = buildRepairMessage([]);
    expect(msg).toContain("The previous output had these issues:");
    expect(msg).toContain("Fix these issues and return the complete corrected output.");
    expect(msg).not.toContain("- ");
  });
});
