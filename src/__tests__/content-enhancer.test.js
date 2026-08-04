// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { ContentEnhancer } from "../renderer/content-enhancer.js";

describe("ContentEnhancer", () => {
  beforeAll(() => {
    // Minimal DOM for mermaid sandbox
    if (!document.body) document.body = document.createElement("body");

    // Stub Mermaid: render returns a stable SVG and binds functions.
    const fakeMermaid = {
      render: vi.fn(async (_id, source) => ({
        svg: `<svg data-source="${source}"><text>diagram</text></svg>`,
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
    expect(div.innerHTML).toContain('data-source="graph TD\nA --> B"');
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
});
