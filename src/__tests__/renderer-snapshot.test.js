// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import markdownit from "markdown-it";
import { MarkdownParser } from "../data/markdown-parser.js";
import { DeckLoader } from "../data/deck-loader.js";
import { SlideRenderer } from "../renderer/slide-renderer.js";

beforeAll(() => {
  window.markdownit = markdownit;
});

describe("SlideRenderer markdown → DOM snapshots", () => {
  const markdown = `layout: title-slide

@title

# Hello SlideMD

---

layout: two-column

@header

# Snapshot Sample

@main

Markdown is **great**.

- First bullet
- Second bullet

> A blockquote with \`code\`.

@sidebar

\`\`\`python
def hello():
    return "world"
\`\`\`

---

layout: left-heavy

@header

# Math and Diagrams

@main

Inline math: $x = 1$

Block math:

$$E = mc^2$$

<a href="https://example.com" onclick="alert('xss')">link</a>

<script>alert('xss')</script>

@media

\`\`\`mermaid
graph TD
    A[Start] --> B[End]
\`\`\`
`;

  it("produces a stable title slide", () => {
    const raw = new MarkdownParser().parseDeckMarkdown(markdown);
    const deck = DeckLoader.normalizeDeck(raw, { includeHidden: true });
    const slide = deck.slides[0];
    const el = SlideRenderer.renderSlide(slide, { index: 0, isActive: true, deck });
    expect(el.outerHTML).toMatchSnapshot();
  });

  it("produces a stable two-column slide", () => {
    const raw = new MarkdownParser().parseDeckMarkdown(markdown);
    const deck = DeckLoader.normalizeDeck(raw, { includeHidden: true });
    const slide = deck.slides[1];
    const el = SlideRenderer.renderSlide(slide, { index: 1, isActive: true, deck });
    expect(el.outerHTML).toMatchSnapshot();
  });

  it("produces a stable math + mermaid slide with raw HTML sanitized", () => {
    const raw = new MarkdownParser().parseDeckMarkdown(markdown);
    const deck = DeckLoader.normalizeDeck(raw, { includeHidden: true });
    const slide = deck.slides[2];
    const el = SlideRenderer.renderSlide(slide, { index: 2, isActive: true, deck });
    const html = el.outerHTML;
    expect(html).toMatchSnapshot();
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onclick");
  });
});
