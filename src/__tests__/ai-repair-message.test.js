import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildRepairMessage } from "../data/ai/ai-repair-message.js";
import { LayoutData } from "../data/layout-data.js";

describe("buildRepairMessage", () => {
  it("lists errors on different slides with their locations", () => {
    const errors = [
      { slide: 0, code: "SOME_CODE", message: "@sidebar is not allowed" },
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

  it("groups multiple errors on the same slide under one location", () => {
    const errors = [
      { slide: 1, code: "MISSING_LAYOUT", message: "Slide 2 has no layout directive" },
      { slide: 1, code: "UNKNOWN_TEXT_BLOCK_ATTR", message: "Slide 2 text-block uses padding" },
      { slide: 3, code: "SLIDE_CONTENT_OVERFLOW", message: "Slide 4 @main has too much content" },
    ];
    const msg = buildRepairMessage(errors);
    expect(msg).toContain(
      "- Slide 2:\n" +
        "  - Slide 2 has no layout directive\n" +
        "  - Slide 2 text-block uses padding",
    );
    expect(msg).toContain("- Slide 4: Slide 4 @main has too much content");
  });

  it("preserves the order slides first appear in", () => {
    const errors = [
      { slide: 2, code: "MISSING_LAYOUT", message: "third" },
      { slide: 0, code: "MISSING_LAYOUT", message: "first" },
      { slide: 2, code: "UNKNOWN_LAYOUT", message: "third again" },
    ];
    const msg = buildRepairMessage(errors);
    const slide3Index = msg.indexOf("Slide 3");
    const slide1Index = msg.indexOf("Slide 1");
    expect(slide3Index).toBeGreaterThan(-1);
    expect(slide1Index).toBeGreaterThan(slide3Index);
  });

  it("adds overflow-specific guidance for SLIDE_CONTENT_OVERFLOW errors", () => {
    const errors = [
      {
        slide: 0,
        code: "SLIDE_CONTENT_OVERFLOW",
        message: "Slide 1 @main has too much content (20 lines, max 14)",
      },
    ];
    const msg = buildRepairMessage(errors);
    expect(msg).toContain("Guidance:");
    expect(msg).toContain(
      "Reduce content density — trim bullets, move detail to speaker notes, or split the slide.",
    );
  });

  it("adds the valid layout list for UNKNOWN_LAYOUT errors", () => {
    const errors = [
      { slide: 0, code: "UNKNOWN_LAYOUT", message: 'Slide 1 uses unknown layout "foo"' },
    ];
    const msg = buildRepairMessage(errors);
    expect(msg).toContain("Guidance:");
    for (const layout of LayoutData.getValidLayoutNames()) {
      expect(msg).toContain(layout);
    }
  });

  describe("UNKNOWN_LAYOUT guidance with a stale custom layout", () => {
    // Save/restore is symmetric across beforeEach/afterEach (rather than
    // capturing the original inside the test body) so cleanup runs
    // correctly even if the test throws before mutating globalThis, and so
    // a real jsdom localStorage would never be dropped if this file later
    // gains an `@vitest-environment jsdom` pragma.
    let originalLocalStorage;

    beforeEach(() => {
      originalLocalStorage = globalThis.localStorage;
    });

    afterEach(() => {
      if (originalLocalStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = originalLocalStorage;
      LayoutData.deleteCustomLayout("stale-custom");
      // Force a fresh read from the (now-restored) localStorage on next
      // access, so this test's stub doesn't leak into later tests via the
      // module-level cache.
      LayoutData._customMap = null;
    });

    it("excludes a custom layout name whose stored grid template is empty", () => {
      // LayoutData.getAllLayouts() lists custom names regardless of whether
      // their stored grid template is a non-empty string; hasLayout() (and
      // the validator's own layout check) rejects an empty template.
      // getValidLayoutNames() must apply the same hasLayout filter so the
      // repair guidance never tells the AI a name is "valid" when the
      // validator would reject it on the next repair attempt.
      const store = {};
      globalThis.localStorage = {
        getItem: (key) => store[key] ?? null,
        setItem: (key, value) => {
          store[key] = value;
        },
      };
      LayoutData._customMap = null;
      LayoutData.setCustomLayout("stale-custom", "");

      expect(LayoutData.getAllLayouts()).toContain("stale-custom");
      expect(LayoutData.getValidLayoutNames()).not.toContain("stale-custom");

      const msg = buildRepairMessage([
        { slide: 0, code: "UNKNOWN_LAYOUT", message: 'Slide 1 uses unknown layout "foo"' },
      ]);
      expect(msg).not.toContain("stale-custom");
    });
  });

  it("reminds the AI to use only the areas its own issue message lists for INVALID_AREA errors", () => {
    const errors = [
      {
        slide: 0,
        code: "INVALID_AREA",
        message: 'Slide 1 uses @sidebar but layout "header-content" allows only: header, main',
      },
    ];
    const msg = buildRepairMessage(errors);
    expect(msg).toContain("Guidance:");
    expect(msg).toContain(
      "Each area issue above lists that slide's allowed @areas — use only those.",
    );
    // The guidance points back at the issue text itself (which is always
    // present in the same message, not dependent on earlier conversation
    // turns), so the referent is always available.
    expect(msg.indexOf("allows only: header, main")).toBeLessThan(msg.indexOf("Guidance:"));
  });

  it("tells the AI to add a layout directive for MISSING_LAYOUT errors", () => {
    const errors = [
      { slide: 0, code: "MISSING_LAYOUT", message: "Slide 1 has no layout directive" },
    ];
    const msg = buildRepairMessage(errors);
    expect(msg).toContain("Guidance:");
    expect(msg).toContain("Add a `layout:` directive at the top of each slide.");
  });

  it("points back at the issue text for UNKNOWN_TEXT_BLOCK_ATTR errors instead of repeating the attribute list", () => {
    // The validator's own issue message already lists every supported
    // attribute ("Supported: ..."), so the guidance must not repeat that
    // ~20-name list a second time in the same repair message — it should
    // just point back at the issue text above it.
    const errors = [
      {
        slide: 0,
        code: "UNKNOWN_TEXT_BLOCK_ATTR",
        message:
          "Slide 1 text-block uses unsupported attributes: style. Supported: id, float, x, y, fontSize.",
      },
    ];
    const msg = buildRepairMessage(errors);
    expect(msg).toContain("Guidance:");
    expect(msg).toContain(
      "Each text-block issue above lists the supported attributes — use only those.",
    );
    expect(msg.indexOf("Supported: id, float")).toBeLessThan(msg.indexOf("Guidance:"));
    // The guidance line itself must not re-embed the attribute list.
    const guidanceSection = msg.slice(msg.indexOf("Guidance:"));
    expect(guidanceSection).not.toContain("fontSize");
  });

  it("tells the AI to use braces for MALFORMED_TEXT_BLOCK errors", () => {
    const errors = [
      {
        slide: 0,
        code: "MALFORMED_TEXT_BLOCK",
        message: "Slide 1 has a text-block directive without braces",
      },
    ];
    const msg = buildRepairMessage(errors);
    expect(msg).toContain("Guidance:");
    expect(msg).toContain("Wrap text-block attributes in braces");
  });

  it("does not add a guidance section for error codes without specific guidance", () => {
    const errors = [{ slide: -1, code: "TOO_FEW_SLIDES", message: "Expected at least 1 slide" }];
    const msg = buildRepairMessage(errors);
    expect(msg).not.toContain("Guidance:");
  });

  it("only includes one guidance line per distinct error code", () => {
    const errors = [
      { slide: 0, code: "MISSING_LAYOUT", message: "Slide 1 has no layout directive" },
      { slide: 1, code: "MISSING_LAYOUT", message: "Slide 2 has no layout directive" },
    ];
    const msg = buildRepairMessage(errors);
    const occurrences = msg.split("Add a `layout:` directive").length - 1;
    expect(occurrences).toBe(1);
  });

  it("stays reasonably concise for a single error", () => {
    const errors = [
      {
        slide: 0,
        code: "SLIDE_CONTENT_OVERFLOW",
        message: "Slide 1 @main has too much content (20 lines, max 14)",
      },
    ];
    const msg = buildRepairMessage(errors);
    expect(msg.length).toBeLessThan(500);
  });
});
