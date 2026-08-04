import { describe, it, expect, vi } from "vitest";
import {
  DESIGN_SIZE,
  EventEmitter,
  clamp,
  safeString,
  escapeHtml,
  escapeBareHtmlTags,
  slugifyTitle,
  getDeckId,
  normalizeCodeLanguage,
  simpleHash,
  yieldToMain,
  withTimeout,
  unescapeHtml,
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

describe("escapeBareHtmlTags", () => {
  it("escapes bare HTML tags like <button>", () => {
    expect(escapeBareHtmlTags("Prefer <button> over <input>")).toBe(
      "Prefer &lt;button&gt; over &lt;input&gt;",
    );
  });

  it("escapes tags with attributes", () => {
    expect(escapeBareHtmlTags('Click <input type="text"> here')).toBe(
      'Click &lt;input type="text"&gt; here',
    );
  });

  it("escapes blocked interactive/embedded tags", () => {
    const input =
      "Try <button>, <input>, <script>, <iframe>, <video>, <select>, <textarea>, <form>";
    const result = escapeBareHtmlTags(input);
    expect(result).toContain("&lt;button&gt;");
    expect(result).toContain("&lt;input&gt;");
    expect(result).toContain("&lt;script&gt;");
    expect(result).toContain("&lt;iframe&gt;");
    expect(result).toContain("&lt;video&gt;");
    expect(result).toContain("&lt;select&gt;");
    expect(result).toContain("&lt;textarea&gt;");
    expect(result).toContain("&lt;form&gt;");
  });

  it("preserves img tags", () => {
    const input = '<img src="a.png"> <br>';
    expect(escapeBareHtmlTags(input)).toBe(input);
  });

  it("escapes any bare tag without attributes (teaching text)", () => {
    expect(escapeBareHtmlTags("Use <div> containers")).toBe("Use &lt;div&gt; containers");
    expect(escapeBareHtmlTags("Learn <section> and <article>")).toBe(
      "Learn &lt;section&gt; and &lt;article&gt;",
    );
    expect(escapeBareHtmlTags("Try <nav>, <header>, <footer>")).toBe(
      "Try &lt;nav&gt;, &lt;header&gt;, &lt;footer&gt;",
    );
    expect(escapeBareHtmlTags("Then </section> closes it")).toBe("Then &lt;/section&gt; closes it");
  });

  it("preserves bare tags that have matching open/close pairs", () => {
    expect(escapeBareHtmlTags("<p>Hello</p>")).toBe("<p>Hello</p>");
    expect(escapeBareHtmlTags("<span>text</span>")).toBe("<span>text</span>");
    expect(escapeBareHtmlTags("<div>content</div>")).toBe("<div>content</div>");
  });

  it("preserves nested pair-matched tags", () => {
    expect(escapeBareHtmlTags("<p><span>nested</span></p>")).toBe("<p><span>nested</span></p>");
  });

  it("escapes unmatched pairs", () => {
    expect(escapeBareHtmlTags("<p>Hello")).toBe("&lt;p&gt;Hello");
    expect(escapeBareHtmlTags("Hello</p>")).toBe("Hello&lt;/p&gt;");
    expect(escapeBareHtmlTags("<p>Hello</div>")).toBe("&lt;p&gt;Hello&lt;/div&gt;");
  });

  it("handles multiple same-name pairs independently", () => {
    expect(escapeBareHtmlTags("<p>First</p> <p>Second</p>")).toBe("<p>First</p> <p>Second</p>");
  });

  it("preserves attributed tags (intentional styling HTML)", () => {
    expect(escapeBareHtmlTags('<div class="flex-row">')).toBe('<div class="flex-row">');
    expect(escapeBareHtmlTags('<span style="color:red">')).toBe('<span style="color:red">');
    expect(escapeBareHtmlTags('<img src="a.png">')).toBe('<img src="a.png">');
  });

  it("preserves full-page grid HTML with attributed divs", () => {
    const gridHtml =
      '<div class="fullpage-grid" style="grid-template-columns:repeat(2,1fr)"><div class="fullpage-grid__cell" style="background:#003C68">Cell 1</div><div class="fullpage-grid__cell" style="background:#003C68">Cell 2</div></div>';
    expect(escapeBareHtmlTags(gridHtml)).toBe(gridHtml);
  });

  it("preserves always-safe bare tags (br, hr)", () => {
    expect(escapeBareHtmlTags("Line 1<br>Line 2")).toBe("Line 1<br>Line 2");
    expect(escapeBareHtmlTags("<hr>")).toBe("<hr>");
  });

  it("escapes closing tags", () => {
    expect(escapeBareHtmlTags("Use </script> tag")).toBe("Use &lt;/script&gt; tag");
  });

  it("leaves valid comparison operators unchanged", () => {
    expect(escapeBareHtmlTags("x < 5 and y > 3")).toBe("x < 5 and y > 3");
  });

  it("leaves backtick-wrapped tags unchanged", () => {
    expect(escapeBareHtmlTags("`<button>` is an HTML element")).toBe(
      "`<button>` is an HTML element",
    );
  });

  it("returns non-string input as-is", () => {
    expect(escapeBareHtmlTags(null)).toBe(null);
    expect(escapeBareHtmlTags(42)).toBe(42);
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

describe("unescapeHtml", () => {
  it("decodes the standard named entities", () => {
    expect(unescapeHtml("&lt;div&gt;")).toBe("<div>");
    expect(unescapeHtml("&quot;hi&quot;")).toBe('"hi"');
    expect(unescapeHtml("&#39;hi&#39;")).toBe("'hi'");
  });

  it("does not double-decode literal escape sequences like &amp;lt;", () => {
    // markdown-it encodes a user-typed &lt; as &amp;lt;
    expect(unescapeHtml("&amp;lt;")).toBe("&lt;");
    expect(unescapeHtml("&amp;gt;")).toBe("&gt;");
  });
});
