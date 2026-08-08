import { describe, expect, it, vi } from "vitest";
import { findDeckFileInDir } from "../core/directory-handle-store.js";

describe("findDeckFileInDir", () => {
  it("verifies an exact .md name", async () => {
    const handle = { getFileHandle: vi.fn().mockResolvedValue({}) };

    await expect(findDeckFileInDir(handle, "Deck.md")).resolves.toBe(true);
    expect(handle.getFileHandle).toHaveBeenCalledWith("Deck.md");
  });

  it("tries the .md suffix for extension-less deck names (PPTX/textpack)", async () => {
    const handle = {
      getFileHandle: vi.fn(async (name) => {
        if (name === "Deck.md") return {};
        throw new DOMException("not found", "NotFoundError");
      }),
    };

    await expect(findDeckFileInDir(handle, "Deck")).resolves.toBe(true);
    expect(handle.getFileHandle).toHaveBeenNthCalledWith(1, "Deck");
    expect(handle.getFileHandle).toHaveBeenNthCalledWith(2, "Deck.md");
  });

  it("returns false when no candidate exists", async () => {
    const handle = {
      getFileHandle: vi.fn(async () => {
        throw new DOMException("not found", "NotFoundError");
      }),
    };

    await expect(findDeckFileInDir(handle, "Deck")).resolves.toBe(false);
  });

  it("propagates permission errors instead of reporting not-found", async () => {
    const handle = {
      getFileHandle: vi.fn(async () => {
        throw new DOMException("denied", "NotAllowedError");
      }),
    };

    await expect(findDeckFileInDir(handle, "Deck")).rejects.toThrow("denied");
  });
});
