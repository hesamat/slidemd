import { describe, expect, it } from "vitest";
import { COMMANDS, buildPaletteCommands } from "../engine/command-registry.js";

describe("command-registry", () => {
  it("includes AI palette commands", () => {
    const ids = COMMANDS.filter((c) => c.category === "AI").map((c) => c.id);
    expect(ids).toEqual(["enhanceSlide", "addSpeakerNotes", "polish", "importAiResult"]);
  });

  it("keeps AI commands disabled when not in an editor window", () => {
    const actions = {
      enhanceSlide: () => {},
      addSpeakerNotes: () => {},
      polish: () => {},
      importAiResult: () => {},
    };
    const ctx = { roleManager: { isEditorWindow: false }, isEditMode: () => false };
    const commands = buildPaletteCommands(ctx, actions);
    for (const id of ["enhanceSlide", "addSpeakerNotes", "polish", "importAiResult"]) {
      const cmd = commands.find((c) => c.id === id);
      expect(cmd).toBeTruthy();
      expect(cmd.isEnabled()).toBe(false);
    }
  });

  it("enables whole-deck AI commands in editor without edit mode", () => {
    const actions = {
      enhanceSlide: () => {},
      addSpeakerNotes: () => {},
      polish: () => {},
      importAiResult: () => {},
    };
    const ctx = { roleManager: { isEditorWindow: true }, isEditMode: () => false };
    const commands = buildPaletteCommands(ctx, actions);
    const enhance = commands.find((c) => c.id === "enhanceSlide");
    const notes = commands.find((c) => c.id === "addSpeakerNotes");
    const polish = commands.find((c) => c.id === "polish");
    const importAi = commands.find((c) => c.id === "importAiResult");

    expect(enhance.isEnabled()).toBe(false);
    expect(notes.isEnabled()).toBe(false);
    expect(polish.isEnabled()).toBe(true);
    expect(importAi.isEnabled()).toBe(true);
  });

  it("enables all AI commands in editor + edit mode", () => {
    const actions = {
      enhanceSlide: () => {},
      addSpeakerNotes: () => {},
      polish: () => {},
      importAiResult: () => {},
    };
    const ctx = { roleManager: { isEditorWindow: true }, isEditMode: () => true };
    const commands = buildPaletteCommands(ctx, actions);
    for (const id of ["enhanceSlide", "addSpeakerNotes", "polish", "importAiResult"]) {
      const cmd = commands.find((c) => c.id === id);
      expect(cmd.isEnabled()).toBe(true);
    }
  });
});
