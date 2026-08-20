import { describe, it, expect } from "vitest";
import { buildExportablePrompt, formatPromptForExport } from "../data/ai/ai-prompt-export.js";
import { createOperation } from "../data/ai/ai-operation.js";
import { buildMessagesForIntent, buildPolishMessages } from "../data/ai/ai-intent-registry.js";
import { buildGenerateOptionsSuffix } from "../data/ai/ai-prompt-builder.js";

const MARKDOWN = `layout: header-content
@header
# Title

@main
- Point one
- Point two`;

describe("ai-prompt-export", () => {
  describe("buildExportablePrompt", () => {
    it("builds the same system+user as the orchestrator for generate mode", () => {
      const op = createOperation("generate", null, MARKDOWN, {
        mode: "remix",
        flow: "story",
        addSpeakerNotes: true,
        includeImages: false,
        preserveVisualIdentity: true,
      });
      const exported = buildExportablePrompt(op);

      const { system, user } = buildMessagesForIntent("generate", {
        markdown: MARKDOWN,
        hasVisualSystem: false,
        preserveVisualIdentity: true,
      });
      const optionsSuffix = buildGenerateOptionsSuffix(op.opts);

      expect(exported.system).toBe(system);
      expect(exported.user).toBe(user + optionsSuffix);
      expect(exported.optionsSuffix).toBe(optionsSuffix);
    });

    it("builds the same system+user as the orchestrator for polish mode", () => {
      const op = createOperation("generate", null, MARKDOWN, {
        mode: "polish",
        flow: "instructional",
        addSpeakerNotes: false,
        includeImages: false,
        preserveVisualIdentity: true,
      });
      const exported = buildExportablePrompt(op);

      const { system, user } = buildPolishMessages(MARKDOWN);
      const optionsSuffix = buildGenerateOptionsSuffix(op.opts);

      expect(exported.system).toBe(system);
      expect(exported.user).toBe(user + optionsSuffix);
    });

    it("produces a messages array with system and user roles", () => {
      const op = createOperation("generate", null, MARKDOWN, { mode: "polish" });
      const exported = buildExportablePrompt(op);
      expect(exported.messages).toHaveLength(2);
      expect(exported.messages[0].role).toBe("system");
      expect(exported.messages[1].role).toBe("user");
      expect(exported.messages[0].content).toBe(exported.system);
      expect(exported.messages[1].content).toBe(exported.user);
    });

    it("formattedText contains both system and user sections", () => {
      const op = createOperation("generate", null, MARKDOWN, { mode: "polish" });
      const exported = buildExportablePrompt(op);
      expect(exported.formattedText).toContain("### System");
      expect(exported.formattedText).toContain("### User");
      expect(exported.formattedText).toContain(exported.system);
      expect(exported.formattedText).toContain(exported.user);
    });

    it("does not produce [object Object] in the formatted text", () => {
      const op = createOperation("generate", null, MARKDOWN, {
        mode: "remix",
        flow: "story",
        addSpeakerNotes: true,
        preserveVisualIdentity: false,
      });
      const exported = buildExportablePrompt(op);
      expect(exported.formattedText).not.toContain("[object Object]");
    });

    it("throws when operation is missing", () => {
      expect(() => buildExportablePrompt(null)).toThrow();
      expect(() => buildExportablePrompt(undefined)).toThrow();
    });

    it("throws when operation.context is not a string", () => {
      const bad = { intent: "generate", context: 123, opts: {} };
      expect(() => buildExportablePrompt(bad)).toThrow();
    });
  });

  describe("formatPromptForExport", () => {
    it("separates system and user with headers", () => {
      const text = formatPromptForExport({ system: "SYS", user: "USR" });
      expect(text).toBe("### System\n\nSYS\n\n### User\n\nUSR");
    });
  });
});
