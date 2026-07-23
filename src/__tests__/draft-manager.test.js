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
      const images = new Map();
      await DraftManager.saveDraft("# My Deck\n\nSlide content", images);
      const draft = await DraftManager.loadDraft();
      expect(draft).not.toBeNull();
      expect(draft.markdown).toBe("# My Deck\n\nSlide content");
    });

    it("saves and retrieves images as Blobs", async () => {
      const images = new Map([
        ["images/photo.png", new Blob([new Uint8Array([0x89])])],
      ]);
      await DraftManager.saveDraft("# Deck", images);
      const draft = await DraftManager.loadDraft();
      expect(draft.images.size).toBe(1);
      expect(draft.images.get("images/photo.png")).toBeInstanceOf(Blob);
    });

    it("returns null when no draft exists", async () => {
      const draft = await DraftManager.loadDraft();
      expect(draft).toBeNull();
    });

    it("overwrites previous draft on save", async () => {
      await DraftManager.saveDraft("# First", new Map());
      await DraftManager.saveDraft("# Second", new Map());
      const draft = await DraftManager.loadDraft();
      expect(draft.markdown).toBe("# Second");
    });
  });

  describe("clearDraft", () => {
    it("removes saved draft", async () => {
      await DraftManager.saveDraft("# Deck", new Map());
      await DraftManager.clearDraft();
      const draft = await DraftManager.loadDraft();
      expect(draft).toBeNull();
    });

    it("is safe to call when no draft exists", async () => {
      await expect(DraftManager.clearDraft()).resolves.not.toThrow();
    });
  });
});
