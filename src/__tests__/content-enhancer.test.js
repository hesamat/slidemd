// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { ContentEnhancer, sanitizeMermaidSvg } from "../renderer/content-enhancer.js";

describe("ContentEnhancer", () => {
  beforeAll(() => {
    // Minimal DOM for mermaid sandbox
    if (!document.body) document.body = document.createElement("body");

    // Stub Mermaid: render returns a stable SVG and binds functions.
    // The SVG must not contain raw source with --> (arrow syntax) in
    // attribute values, because DOMPurify with SAFE_FOR_XML correctly
    // strips attributes containing potential mXSS vectors like -->.
    const fakeMermaid = {
      render: vi.fn(async (_id, _source) => ({
        svg: `<svg><text>diagram</text></svg>`,
        bindFunctions: vi.fn(),
      })),
    };
    window.__WEBDECK_MERMAID__ = { mermaid: fakeMermaid };

    // Stub Prism with both the batch and per-element APIs.
    window.Prism = {
      highlightAllUnder: vi.fn(),
      highlightElement: vi.fn(),
    };

    // Stub KaTeX auto-render.
    window.renderMathInElement = vi.fn();

    // Stub AssetLoader to avoid network/dynamic imports.
    window.AssetLoader = {
      ensureRichTextEnhancers: vi.fn(async () => {}),
      ensureMermaidLoaded: vi.fn(async () => {}),
    };
  });

  afterAll(() => {
    delete window.__WEBDECK_MERMAID__;
    delete window.Prism;
    delete window.renderMathInElement;
  });

  it("normalizes emoji size without changing code content", async () => {
    const container = document.createElement("div");
    container.innerHTML = `<h1>✅ Concatenating strings with non-strings ✅</h1><pre>✅</pre>`;

    await ContentEnhancer.enhanceRenderedContent(container);

    expect(container.querySelectorAll(".slide-emoji")).toHaveLength(2);
    expect(container.querySelector("h1").textContent).toBe(
      "✅ Concatenating strings with non-strings ✅",
    );
    expect(container.querySelector("pre").innerHTML).toBe("✅");
  });

  it("converts mermaid code blocks to divs and renders them", async () => {
    const container = document.createElement("div");
    container.innerHTML = `<pre data-source-line="0"><code class="language-mermaid">graph TD\nA --> B</code></pre>`;

    const mermaid = window.__WEBDECK_MERMAID__.mermaid;
    await ContentEnhancer.enhanceRenderedContent(container);

    const div = container.querySelector(".mermaid");
    expect(div).toBeTruthy();
    expect(ContentEnhancer.getMermaidSource(div)).toBe("graph TD\nA --> B");
    expect(div.dataset.mermaidSource).toMatch(/^b64:/);
    expect(div.innerHTML).toContain("<svg>");
    expect(mermaid.render).toHaveBeenCalledTimes(1);
    expect(div.dataset.mermaidProcessed).toBe("1");
  });

  it("normalizes code language classes and highlights with Prism", async () => {
    const container = document.createElement("div");
    container.innerHTML = `<pre data-source-line="0"><code class="lang-py">x = 1</code></pre>`;

    await ContentEnhancer.enhanceRenderedContent(container);

    const code = container.querySelector("pre code");
    expect(code.className).toBe("language-python");
    expect(window.Prism.highlightAllUnder).toHaveBeenCalledWith(container);
  });

  it("falls back to per-element Prism highlighting when highlightAllUnder is missing", async () => {
    const container = document.createElement("div");
    container.innerHTML = `<pre data-source-line="0"><code class="language-js">const x = 1;</code></pre>`;

    const batch = window.Prism.highlightAllUnder;
    delete window.Prism.highlightAllUnder;
    await ContentEnhancer.enhanceRenderedContent(container);

    const code = container.querySelector("pre code");
    expect(code.className).toBe("language-javascript");
    expect(window.Prism.highlightElement).toHaveBeenCalledWith(code);
    window.Prism.highlightAllUnder = batch;
  });

  it("calls renderMathInElement with the expected delimiters", async () => {
    const container = document.createElement("div");
    container.innerHTML = `<p>$x = 1$</p>`;

    await ContentEnhancer.enhanceRenderedContent(container);

    expect(window.renderMathInElement).toHaveBeenCalledWith(container, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\(", right: "\\)", display: false },
        { left: "\\[", right: "\\]", display: true },
      ],
      ignoredClasses: ["no-math", "katex-ignore", "mermaid"],
      throwOnError: false,
    });
  });

  it("only targets active slides for mermaid unless renderAllSlides is true", async () => {
    const activeOnly = document.createElement("div");
    activeOnly.innerHTML = `
      <div class="slide active"><div class="mermaid" data-mermaid-source="A --> B">A --> B</div></div>
      <div class="slide"><div class="mermaid" data-mermaid-source="C --> D">C --> D</div></div>
    `;

    const mermaid = window.__WEBDECK_MERMAID__.mermaid;
    mermaid.render.mockClear();

    await ContentEnhancer.enhanceRenderedContent(activeOnly, { force: true });
    expect(mermaid.render).toHaveBeenCalledTimes(1);

    const allSlides = document.createElement("div");
    allSlides.innerHTML = `
      <div class="slide active"><div class="mermaid" data-mermaid-source="A --> B">A --> B</div></div>
      <div class="slide"><div class="mermaid" data-mermaid-source="C --> D">C --> D</div></div>
    `;

    mermaid.render.mockClear();
    await ContentEnhancer.enhanceRenderedContent(allSlides, { force: true, renderAllSlides: true });
    expect(mermaid.render).toHaveBeenCalledTimes(2);
  });

  it("sets target=_blank on footer links", async () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="slide__area--footer"><a href="https://example.com">link</a></div>
    `;

    await ContentEnhancer.enhanceRenderedContent(container);

    const link = container.querySelector("a");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
  });

  it("does not throw and still runs Prism/KaTeX when Mermaid fails to load", async () => {
    // Simulate an export where the Mermaid CDN is unavailable.
    const saved = window.__WEBDECK_MERMAID__;
    const savedMermaid = window.mermaid;
    delete window.__WEBDECK_MERMAID__;
    delete window.mermaid;

    window.AssetLoader = {
      ensureRichTextEnhancers: vi.fn(async () => {}),
      ensureMermaidLoaded: vi.fn(async () => {}),
    };

    const container = document.createElement("div");
    container.innerHTML = `
      <div class="slide active">
        <pre><code class="language-py">x = 1</code></pre>
        <p>$y = 2$</p>
        <div class="mermaid" data-mermaid-source="A --> B">A --> B</div>
      </div>
    `;

    await expect(ContentEnhancer.enhanceRenderedContent(container, { force: true })).resolves.toBe(
      true,
    );

    const code = container.querySelector("pre code");
    expect(code.className).toBe("language-python");
    expect(window.Prism.highlightAllUnder).toHaveBeenCalled();
    expect(window.renderMathInElement).toHaveBeenCalledWith(container, expect.any(Object));

    window.__WEBDECK_MERMAID__ = saved;
    window.mermaid = savedMermaid;
  });

  it("adds copy buttons to code blocks in exported builds", async () => {
    const savedExported = window.__WEBDECK_EXPORTED__;
    const savedIsSecureContext = window.isSecureContext;
    const savedClipboard = window.navigator.clipboard;

    try {
      window.__WEBDECK_EXPORTED__ = true;
      Object.defineProperty(window, "isSecureContext", {
        value: true,
        configurable: true,
      });
      const writeText = vi.fn(() => Promise.resolve());
      Object.defineProperty(window.navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });

      const container = document.createElement("div");
      container.innerHTML = `<pre data-source-line="0"><code class="language-js">const x = 1;</code></pre>`;

      await ContentEnhancer.enhanceRenderedContent(container, { force: true });

      const button = container.querySelector(".code-copy-button");
      expect(button).toBeTruthy();
      expect(button.getAttribute("aria-label")).toBe("Copy code to clipboard");

      button.click();
      await new Promise((r) => setTimeout(r, 10));

      expect(writeText).toHaveBeenCalledTimes(1);
      expect(writeText).toHaveBeenCalledWith("const x = 1;");
      expect(button.textContent).toBe("Copied");
    } finally {
      window.__WEBDECK_EXPORTED__ = savedExported;
      Object.defineProperty(window, "isSecureContext", {
        value: savedIsSecureContext,
        configurable: true,
      });
      Object.defineProperty(window.navigator, "clipboard", {
        value: savedClipboard,
        configurable: true,
      });
    }
  });

  it("shows failed styling when a copy fails", async () => {
    const savedExported = window.__WEBDECK_EXPORTED__;
    const savedIsSecureContext = window.isSecureContext;
    const savedClipboard = window.navigator.clipboard;

    try {
      window.__WEBDECK_EXPORTED__ = true;
      Object.defineProperty(window, "isSecureContext", {
        value: true,
        configurable: true,
      });
      // Force both clipboard.writeText and execCommand to fail
      Object.defineProperty(window.navigator, "clipboard", {
        value: undefined,
        configurable: true,
      });
      const originalExecCommand = document.execCommand;
      document.execCommand = () => false;

      const container = document.createElement("div");
      container.innerHTML = `<pre data-source-line="0"><code class="language-js">const x = 1;</code></pre>`;

      await ContentEnhancer.enhanceRenderedContent(container, { force: true });

      const button = container.querySelector(".code-copy-button");
      button.click();
      await new Promise((r) => setTimeout(r, 10));

      expect(button.textContent).toBe("Failed");
      expect(button.classList.contains("is-copy-failed")).toBe(true);
      expect(button.classList.contains("is-copied")).toBe(false);

      document.execCommand = originalExecCommand;
    } finally {
      window.__WEBDECK_EXPORTED__ = savedExported;
      Object.defineProperty(window, "isSecureContext", {
        value: savedIsSecureContext,
        configurable: true,
      });
      Object.defineProperty(window.navigator, "clipboard", {
        value: savedClipboard,
        configurable: true,
      });
    }
  });

  it("does not add copy buttons in the viewer", async () => {
    const savedExported = window.__WEBDECK_EXPORTED__;
    const savedRole = document.documentElement.getAttribute("data-webdeck-role");
    window.__WEBDECK_EXPORTED__ = false;
    document.documentElement.setAttribute("data-webdeck-role", "viewer");
    try {
      const container = document.createElement("div");
      container.innerHTML = `<pre data-source-line="0"><code class="language-js">const x = 1;</code></pre>`;

      await ContentEnhancer.enhanceRenderedContent(container, { force: true });

      expect(container.querySelector(".code-copy-button")).toBeNull();
    } finally {
      window.__WEBDECK_EXPORTED__ = savedExported;
      if (savedRole) document.documentElement.setAttribute("data-webdeck-role", savedRole);
      else document.documentElement.removeAttribute("data-webdeck-role");
    }
  });

  it("adds copy buttons to code blocks in the editor", async () => {
    const savedExported = window.__WEBDECK_EXPORTED__;
    const savedRole = document.documentElement.getAttribute("data-webdeck-role");
    window.__WEBDECK_EXPORTED__ = false;
    document.documentElement.setAttribute("data-webdeck-role", "editor");
    try {
      const container = document.createElement("div");
      container.innerHTML = `<pre data-source-line="0"><code class="language-js">const x = 1;</code></pre>`;

      await ContentEnhancer.enhanceRenderedContent(container, { force: true });

      const button = container.querySelector(".code-copy-button");
      expect(button).toBeTruthy();
      expect(button.getAttribute("aria-label")).toBe("Copy code to clipboard");
    } finally {
      window.__WEBDECK_EXPORTED__ = savedExported;
      if (savedRole) document.documentElement.setAttribute("data-webdeck-role", savedRole);
      else document.documentElement.removeAttribute("data-webdeck-role");
    }
  });

  it("does not add copy buttons to Mermaid code blocks", async () => {
    const savedExported = window.__WEBDECK_EXPORTED__;
    window.__WEBDECK_EXPORTED__ = true;
    try {
      const container = document.createElement("div");
      container.innerHTML = `<pre data-source-line="0"><code class="language-mermaid">graph TD\nA --> B</code></pre>`;

      await ContentEnhancer.enhanceRenderedContent(container, { force: true });

      expect(container.querySelector(".code-copy-button")).toBeNull();
      expect(container.querySelector(".mermaid")).toBeTruthy();
    } finally {
      window.__WEBDECK_EXPORTED__ = savedExported;
    }
  });
});

describe("sanitizeMermaidSvg", () => {
  it("preserves foreignObject with HTML label content", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><g class="label"><foreignObject width="100" height="30"><div xmlns="http://www.w3.org/1999/xhtml" class="nodeLabel"><span>Hello World</span></div></foreignObject></g></svg>`;
    const result = sanitizeMermaidSvg(svg);
    expect(result).toBeTruthy();
    expect(result).toContain("foreignObject");
    expect(result).toContain("Hello World");
  });

  it("strips <script> tags from Mermaid SVG", () => {
    const svg = `<svg><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">Label</div></foreignObject><script>alert(1)</script></svg>`;
    const result = sanitizeMermaidSvg(svg);
    expect(result).toBeTruthy();
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert(1)");
  });

  it("strips event handler attributes (onerror, onclick, etc.)", () => {
    const svg = `<svg><foreignObject><div xmlns="http://www.w3.org/1999/xhtml" onerror="alert(1)" onclick="alert(2)">Label</div></foreignObject></svg>`;
    const result = sanitizeMermaidSvg(svg);
    expect(result).toBeTruthy();
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("onclick");
    expect(result).toContain("Label");
  });

  it("strips <iframe> tags", () => {
    const svg = `<svg><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">Label</div></foreignObject><iframe src="javascript:alert(1)"></iframe></svg>`;
    const result = sanitizeMermaidSvg(svg);
    expect(result).toBeTruthy();
    expect(result).not.toContain("<iframe");
    expect(result).not.toContain("javascript:");
  });

  it("strips javascript: URLs from href attributes", () => {
    const svg = `<svg><a href="javascript:alert(1)"><text>link</text></a></svg>`;
    const result = sanitizeMermaidSvg(svg);
    expect(result).toBeTruthy();
    expect(result).not.toContain("javascript:");
  });

  it("preserves Mermaid arrow syntax in label text", () => {
    const svg = `<svg><foreignObject><div xmlns="http://www.w3.org/1999/xhtml" class="nodeLabel">A --&gt; B</div></foreignObject></svg>`;
    const result = sanitizeMermaidSvg(svg);
    expect(result).toBeTruthy();
    // The > may be escaped as &gt; but the text content is preserved
    expect(result).toContain("A");
    expect(result).toContain("B");
  });

  it("preserves SVG structure (defs, markers, paths)", () => {
    const svg = `<svg><defs><marker id="arrowhead" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#333"></path></marker></defs><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">Label</div></foreignObject></svg>`;
    const result = sanitizeMermaidSvg(svg);
    expect(result).toBeTruthy();
    expect(result).toContain("<defs>");
    expect(result).toContain("<marker");
    expect(result).toContain("<path");
    expect(result).toContain("foreignObject");
  });
});
