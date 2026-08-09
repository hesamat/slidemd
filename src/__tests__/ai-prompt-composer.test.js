import { describe, it, expect } from "vitest";
import {
  AiPromptComposer,
  collectPlaceholders,
  replacePlaceholders,
} from "../data/ai/ai-prompt-composer.js";

describe("AiPromptComposer", () => {
  it("replaces a single placeholder", () => {
    const composer = new AiPromptComposer({
      systemFragment: "You are helpful.",
      userFragment: "Input: {{markdown}}",
    });
    const { system, user } = composer.compose({ markdown: "# Title" });
    expect(system).toBe("You are helpful.");
    expect(user).toBe("Input: # Title");
  });

  it("replaces multiple placeholders", () => {
    const composer = new AiPromptComposer({
      systemFragment: "System.",
      userFragment: "Input: {{markdown}}\nLayouts: {{layoutList}}",
    });
    const { user } = composer.compose({ markdown: "# Title", layoutList: "header-content" });
    expect(user).toContain("# Title");
    expect(user).toContain("header-content");
    expect(user).not.toContain("{{markdown}}");
    expect(user).not.toContain("{{layoutList}}");
  });

  it("throws when a placeholder has no substitution", () => {
    const composer = new AiPromptComposer({
      systemFragment: "System.",
      userFragment: "Input: {{markdown}}\nExtra: {{extra}}",
    });
    expect(() => composer.compose({ markdown: "# Title" })).toThrow(/{{extra}}/);
  });

  it("throws when a substitution has no matching placeholder", () => {
    const composer = new AiPromptComposer({
      systemFragment: "System.",
      userFragment: "Input: {{markdown}}",
    });
    expect(() => composer.compose({ markdown: "# Title", typo: "x" })).toThrow(/{{typo}}/);
  });

  it("passes deck-content {{placeholders}} through untouched", () => {
    // Deck markdown may contain template syntax; it must not throw or be
    // treated as an unresolved fragment placeholder.
    const composer = new AiPromptComposer({
      systemFragment: "System.",
      userFragment: "Input: {{markdown}}",
    });
    const { user } = composer.compose({ markdown: "Use {{variable}} here" });
    expect(user).toBe("Input: Use {{variable}} here");
  });

  it("substitutes {{markdown}} last so deck content is not re-scanned", () => {
    // If deck content literally contains {{layoutList}}, it must stay
    // untouched — the markdown pass runs after the other substitutions, so
    // it can never be replaced inside user content.
    const composer = new AiPromptComposer({
      systemFragment: "Layouts: {{layoutList}}.",
      userFragment: "Input: {{markdown}}",
    });
    const { system, user } = composer.compose({
      markdown: "Deck mentions {{layoutList}} literally",
      layoutList: "header-content",
    });
    expect(system).toBe("Layouts: header-content.");
    expect(user).toBe("Input: Deck mentions {{layoutList}} literally");
  });

  it("uses function replacement so $$...$$ math delimiters survive", () => {
    const composer = new AiPromptComposer({
      systemFragment: "System.",
      userFragment: "Input: {{markdown}}",
    });
    const { user } = composer.compose({ markdown: "$$x^2$$ and $& $` $'" });
    expect(user).toBe("Input: $$x^2$$ and $& $` $'");
  });
});

describe("collectPlaceholders", () => {
  it("collects unique placeholder names across fragments", () => {
    const names = collectPlaceholders("{{a}} x {{b}}", "{{a}} y");
    expect([...names]).toEqual(["a", "b"]);
  });
});

describe("replacePlaceholders", () => {
  it("replaces placeholders and throws on template placeholders without a key in strict mode", () => {
    const out = replacePlaceholders("{{a}} and {{b}}", { a: "1", b: "2" }, { strict: true });
    expect(out).toBe("1 and 2");
    expect(() => replacePlaceholders("{{a}} and {{b}}", { a: "1" }, { strict: true })).toThrow(
      /{{b}}/,
    );
  });

  it("strict mode does not scan substituted values for placeholders", () => {
    // Model-derived content (e.g. validation errors echoing deck template
    // syntax) may legitimately contain {{...}} — the check must look only at
    // the template's own placeholders, not the substituted result.
    const out = replacePlaceholders(
      "Template: {{issues}}",
      { issues: 'Slide 1 uses unknown layout "{{weird}}"' },
      { strict: true },
    );
    expect(out).toBe('Template: Slide 1 uses unknown layout "{{weird}}"');
  });

  it("leaves leftovers untouched when strict is false", () => {
    expect(replacePlaceholders("{{a}} and {{b}}", { a: "1" })).toBe("1 and {{b}}");
  });
});
