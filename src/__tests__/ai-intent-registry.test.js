import { describe, it, expect } from "vitest";
import {
  getBuilder,
  buildMessagesForIntent,
  isSingleSlideIntent,
  listIntents,
} from "../data/ai/ai-intent-registry.js";

describe("AiIntentRegistry", () => {
  describe("listIntents", () => {
    it("includes all Phase 13 intents", () => {
      const intents = listIntents();
      expect(intents).toContain("enhanceSlide");
      expect(intents).toContain("addSpeakerNotes");
      expect(intents).toContain("generate");
    });

    it("does not include whole-deck fix (dropped in Phase 13)", () => {
      const intents = listIntents();
      expect(intents).not.toContain("fix");
    });
  });

  describe("isSingleSlideIntent", () => {
    it("returns true for single-slide intents", () => {
      expect(isSingleSlideIntent("enhanceSlide")).toBe(true);
      expect(isSingleSlideIntent("addSpeakerNotes")).toBe(true);
    });

    it("returns false for whole-deck generate", () => {
      expect(isSingleSlideIntent("generate")).toBe(false);
    });
  });

  describe("getBuilder", () => {
    it("returns a function for known intents", () => {
      expect(typeof getBuilder("enhanceSlide")).toBe("function");
      expect(typeof getBuilder("generate")).toBe("function");
    });

    it("returns undefined for unknown intents", () => {
      expect(getBuilder("unknown")).toBeUndefined();
    });
  });

  describe("buildMessagesForIntent", () => {
    const slideMarkdown = "layout: header-content\n@header\n## Title\n\n@main\n- Item 1\n- Item 2";

    it("builds system + user messages for enhanceSlide", () => {
      const { system, user } = buildMessagesForIntent("enhanceSlide", { markdown: slideMarkdown });
      expect(system).toContain("You are a SlideMD editor");
      expect(user).toContain("@header");
      expect(user).toContain("## Title");
    });

    it("builds system + user messages for addSpeakerNotes", () => {
      const { system, user } = buildMessagesForIntent("addSpeakerNotes", {
        markdown: slideMarkdown,
      });
      expect(system).toContain("You are a SlideMD editor");
      expect(user).toContain("speaker notes");
    });

    it("builds system + user messages for generate (whole-deck)", () => {
      const { system, user } = buildMessagesForIntent("generate", { markdown: slideMarkdown });
      expect(system).toContain("You are a SlideMD editor");
      expect(user).toContain("@header");
    });

    it("replaces {{layoutList}} in system prompt", () => {
      const { system } = buildMessagesForIntent("addSpeakerNotes", { markdown: slideMarkdown });
      expect(system).not.toContain("{{layoutList}}");
      expect(system).toContain("header-content");
    });

    it("replaces {{markdown}} in user prompt", () => {
      const { user } = buildMessagesForIntent("addSpeakerNotes", { markdown: slideMarkdown });
      expect(user).not.toContain("{{markdown}}");
      expect(user).toContain("## Title");
    });

    it("throws for unknown intent", () => {
      expect(() => buildMessagesForIntent("unknown", { markdown: "" })).toThrow(
        "Unknown AI intent: unknown",
      );
    });

    it("enhanceSlide keeps layout in the slide markdown", () => {
      const { user } = buildMessagesForIntent("enhanceSlide", { markdown: slideMarkdown });
      // enhanceSlide uses fix-prompt which keeps layout so AI preserves it
      expect(user).toContain("layout: header-content");
    });

    it("generate strips layout from input markdown", () => {
      const { user } = buildMessagesForIntent("generate", { markdown: slideMarkdown });
      // generate mode strips layout so AI can reorganize
      expect(user).not.toContain("layout: header-content");
    });
  });
});
