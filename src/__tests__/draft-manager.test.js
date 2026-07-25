import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock localforage with an in-memory implementation before importing DraftManager
const store = new Map();

vi.mock("localforage", () => {
  return {
    default: {
      createInstance() {
        return {
          async getItem(key) {
            return store.get(key) ?? null;
          },
          async setItem(key, value) {
            store.set(key, value);
            return value;
          },
          async removeItem(key) {
            store.delete(key);
          },
        };
      },
    },
  };
});

const { DraftManager } = await import("../core/draft-manager.js");

describe("DraftManager", () => {
  beforeEach(async () => {
    store.clear();
    await DraftManager.clearDraft();
  });

  describe("saveDraft / loadDraft", () => {
    it("saves and retrieves markdown", async () => {
      await DraftManager.saveDraft("# My Deck\n\nSlide content");
      const draft = await DraftManager.loadDraft();
      expect(draft).not.toBeNull();
      expect(draft.markdown).toBe("# My Deck\n\nSlide content");
    });

    it("returns null when no draft exists", async () => {
      const draft = await DraftManager.loadDraft();
      expect(draft).toBeNull();
    });

    it("overwrites previous draft on save", async () => {
      await DraftManager.saveDraft("# First");
      await DraftManager.saveDraft("# Second");
      const draft = await DraftManager.loadDraft();
      expect(draft.markdown).toBe("# Second");
    });
  });

  describe("clearDraft", () => {
    it("removes saved draft", async () => {
      await DraftManager.saveDraft("# Deck");
      await DraftManager.clearDraft();
      const draft = await DraftManager.loadDraft();
      expect(draft).toBeNull();
    });

    it("is safe to call when no draft exists", async () => {
      await expect(DraftManager.clearDraft()).resolves.not.toThrow();
    });
  });
});
