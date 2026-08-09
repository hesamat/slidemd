import { describe, it, expect } from "vitest";
import { buildRepairMessage } from "../data/ai/ai-repair-message.js";

describe("buildRepairMessage", () => {
  it("lists multiple errors with slide locations, byte-identical to the pre-refactor format", () => {
    const errors = [
      { slide: 0, code: "INVALID_AREA", message: "@sidebar is not allowed" },
      { slide: -1, code: "TOO_FEW_SLIDES", message: "Expected at least 1 slide" },
    ];
    expect(buildRepairMessage(errors)).toBe(
      "The previous output had these issues:\n" +
        "- Slide 1: @sidebar is not allowed\n" +
        "- Deck: Expected at least 1 slide\n" +
        "\n" +
        "Fix these issues and return the complete corrected output.",
    );
  });

  it("matches the pre-refactor bytes for an empty error list", () => {
    expect(buildRepairMessage([])).toBe(
      "The previous output had these issues:\n" +
        "\n" +
        "Fix these issues and return the complete corrected output.",
    );
  });

  it("does not throw when error text echoes deck template syntax", () => {
    // Validation errors embed model output verbatim; a model that echoes
    // {{...}} template syntax from the deck must not abort the repair path.
    const errors = [
      { slide: 0, code: "INVALID_LAYOUT", message: 'Slide 1 uses unknown layout "{{weird}}"' },
      { slide: 2, code: "INVALID_AREA", message: "uses @{{area}} but layout allows only: @main" },
    ];
    const msg = buildRepairMessage(errors);
    expect(msg).toContain('Slide 1 uses unknown layout "{{weird}}"');
    expect(msg).toContain("uses @{{area}} but layout allows only: @main");
  });
});
