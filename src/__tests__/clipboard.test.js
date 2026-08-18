// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { copyText, downloadText } from "../core/clipboard.js";

describe("clipboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("copyText", () => {
    it("uses navigator.clipboard.writeText when available", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });
      await copyText("hello");
      expect(writeText).toHaveBeenCalledWith("hello");
    });

    it("rejects when navigator.clipboard.writeText rejects", async () => {
      const writeText = vi.fn().mockRejectedValue(new Error("denied"));
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });
      await expect(copyText("hello")).rejects.toThrow("denied");
    });

    it("throws TypeError for non-string input", async () => {
      await expect(copyText(123)).rejects.toThrow(TypeError);
    });

    it("falls back to execCommand when clipboard API is absent", async () => {
      Object.defineProperty(navigator, "clipboard", {
        value: undefined,
        configurable: true,
      });
      document.execCommand = vi.fn().mockReturnValue(true);
      await copyText("fallback");
      expect(document.execCommand).toHaveBeenCalledWith("copy");
    });
  });

  describe("downloadText", () => {
    it("creates an anchor with download attribute, clicks it, and revokes the URL", () => {
      const urlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
      const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
      let captured = null;
      const appendSpy = vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
        captured = node;
        return node;
      });
      const removeSpy = vi.spyOn(document.body, "removeChild").mockImplementation((node) => node);
      const clickSpy = vi.spyOn(HTMLElement.prototype, "click").mockImplementation(() => {});

      downloadText("content", "file.txt");

      expect(captured).not.toBeNull();
      expect(captured.tagName).toBe("A");
      expect(captured.download).toBe("file.txt");
      expect(captured.href).toBe("blob:fake");
      expect(urlSpy).toHaveBeenCalledOnce();
      expect(revokeSpy).toHaveBeenCalledOnce();
      expect(clickSpy).toHaveBeenCalledOnce();
      appendSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it("throws TypeError when filename is missing", () => {
      expect(() => downloadText("x", "")).toThrow(TypeError);
      expect(() => downloadText("x", undefined)).toThrow(TypeError);
    });

    it("throws TypeError for non-string text", () => {
      expect(() => downloadText(123, "file.txt")).toThrow(TypeError);
    });
  });
});
