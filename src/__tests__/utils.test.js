import { describe, it, expect, vi } from "vitest";
import {
  DESIGN_SIZE,
  EventEmitter,
  clamp,
  safeString,
  escapeHtml,
  slugifyTitle,
  getDeckId,
  normalizeCodeLanguage,
  simpleHash,
  yieldToMain,
  withTimeout,
} from "../core/utils.js";

describe("DESIGN_SIZE", () => {
  it("has correct dimensions", () => {
    expect(DESIGN_SIZE.width).toBe(1920);
    expect(DESIGN_SIZE.height).toBe(1080);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(DESIGN_SIZE)).toBe(true);
  });
});

describe("clamp", () => {
  it("clamps value below min", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it("clamps value above max", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("returns value within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("works with equal min/max", () => {
    expect(clamp(5, 3, 3)).toBe(3);
  });
});

describe("safeString", () => {
  it("returns string as-is", () => {
    expect(safeString("hello")).toBe("hello");
  });

  it("returns empty string for non-string", () => {
    expect(safeString(null)).toBe("");
    expect(safeString(undefined)).toBe("");
    expect(safeString(42)).toBe("");
    expect(safeString({})).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(safeString("")).toBe("");
  });
});

describe("escapeHtml", () => {
  it("escapes ampersand", () => {
    expect(escapeHtml("a&b")).toBe("a&amp;b");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml("<div>")).toBe("&lt;div&gt;");
  });

  it("escapes quotes", () => {
    expect(escapeHtml('"hello"')).toBe("&quot;hello&quot;");
    expect(escapeHtml("'hello'")).toBe("&#39;hello&#39;");
  });

  it("returns empty string for non-string input", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(42)).toBe("");
  });

  it("leaves clean strings unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });
});

describe("slugifyTitle", () => {
  it("converts to lowercase slug", () => {
    expect(slugifyTitle("Hello World")).toBe("hello-world");
  });

  it("removes special characters", () => {
    expect(slugifyTitle("Hello, World!")).toBe("hello-world");
  });

  it("collapses multiple hyphens", () => {
    expect(slugifyTitle("a---b")).toBe("a-b");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugifyTitle("-hello-")).toBe("hello");
  });

  it("returns 'slide' for empty input", () => {
    expect(slugifyTitle("")).toBe("slide");
    expect(slugifyTitle(null)).toBe("slide");
  });

  it("handles unicode normalization", () => {
    expect(slugifyTitle("café")).toBe("cafe");
  });
});

describe("getDeckId", () => {
  it("returns meta.id if present", () => {
    expect(getDeckId({ meta: { id: "my-deck" } })).toBe("my-deck");
  });

  it("returns 'webdeck' for missing id", () => {
    expect(getDeckId({})).toBe("webdeck");
    expect(getDeckId(null)).toBe("webdeck");
  });

  it("returns 'webdeck' for whitespace-only id", () => {
    expect(getDeckId({ meta: { id: "   " } })).toBe("webdeck");
  });
});

describe("normalizeCodeLanguage", () => {
  it("returns 'none' for empty input", () => {
    expect(normalizeCodeLanguage("")).toBe("none");
    expect(normalizeCodeLanguage(null)).toBe("none");
  });

  it("resolves common aliases", () => {
    expect(normalizeCodeLanguage("js")).toBe("javascript");
    expect(normalizeCodeLanguage("ts")).toBe("typescript");
    expect(normalizeCodeLanguage("py")).toBe("python");
    expect(normalizeCodeLanguage("sh")).toBe("bash");
    expect(normalizeCodeLanguage("html")).toBe("markup");
    expect(normalizeCodeLanguage("yml")).toBe("yaml");
  });

  it("passes through unknown languages", () => {
    expect(normalizeCodeLanguage("rust")).toBe("rust");
    expect(normalizeCodeLanguage("go")).toBe("go");
  });

  it("normalizes case", () => {
    expect(normalizeCodeLanguage("JavaScript")).toBe("javascript");
    expect(normalizeCodeLanguage("  Python  ")).toBe("python");
  });
});

describe("simpleHash", () => {
  it("returns consistent hash", () => {
    expect(simpleHash("hello")).toBe(simpleHash("hello"));
  });

  it("returns different hashes for different strings", () => {
    expect(simpleHash("hello")).not.toBe(simpleHash("world"));
  });

  it("returns 'h0' for empty string", () => {
    expect(simpleHash("")).toBe("h0");
  });

  it("starts with 'h'", () => {
    expect(simpleHash("test")).toMatch(/^h/);
  });
});

describe("yieldToMain", () => {
  it("returns a promise", () => {
    const result = yieldToMain();
    expect(result).toBeInstanceOf(Promise);
  });

  it("resolves", async () => {
    await expect(yieldToMain()).resolves.toBeUndefined();
  });
});

describe("withTimeout", () => {
  it("resolves if promise finishes before timeout", async () => {
    const fast = Promise.resolve("done");
    await expect(withTimeout(fast, 1000)).resolves.toBe("done");
  });

  it("rejects if promise takes too long", async () => {
    const slow = new Promise((resolve) => setTimeout(() => resolve("done"), 500));
    await expect(withTimeout(slow, 10)).rejects.toThrow("Timeout");
  });
});

describe("EventEmitter", () => {
  it("calls listener on event", () => {
    const emitter = new EventEmitter();
    const fn = vi.fn();
    emitter.addEventListener("test", fn);
    emitter.dispatchEvent("test", "data");
    expect(fn).toHaveBeenCalledWith("data");
  });

  it("supports multiple listeners", () => {
    const emitter = new EventEmitter();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    emitter.addEventListener("test", fn1);
    emitter.addEventListener("test", fn2);
    emitter.dispatchEvent("test");
    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).toHaveBeenCalledOnce();
  });

  it("removes listener", () => {
    const emitter = new EventEmitter();
    const fn = vi.fn();
    emitter.addEventListener("test", fn);
    emitter.removeEventListener("test", fn);
    emitter.dispatchEvent("test");
    expect(fn).not.toHaveBeenCalled();
  });

  it("removes all listeners for an event", () => {
    const emitter = new EventEmitter();
    const fn = vi.fn();
    emitter.addEventListener("test", fn);
    emitter.removeAllListeners("test");
    emitter.dispatchEvent("test");
    expect(fn).not.toHaveBeenCalled();
  });

  it("removes all listeners when no event specified", () => {
    const emitter = new EventEmitter();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    emitter.addEventListener("a", fn1);
    emitter.addEventListener("b", fn2);
    emitter.removeAllListeners();
    emitter.dispatchEvent("a");
    emitter.dispatchEvent("b");
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();
  });

  it("handles errors in listeners gracefully", () => {
    const emitter = new EventEmitter();
    emitter.addEventListener("test", () => {
      throw new Error("boom");
    });
    // Should not throw
    expect(() => emitter.dispatchEvent("test")).not.toThrow();
  });

  it("ignores non-function callbacks", () => {
    const emitter = new EventEmitter();
    emitter.addEventListener("test", "not a function");
    // Should not throw
    expect(() => emitter.dispatchEvent("test")).not.toThrow();
  });
});
