import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import MarkdownIt from "markdown-it";
import { applyOpenInNewTabToLinks } from "../data/markdown-parser.js";

/**
 * `applyOpenInNewTabToLinks` rewrites markdown-it's `link_open` rule so
 * that every link gets `target="_blank" rel="noopener noreferrer"`.
 * In-page anchor links (`#…`) are left alone so they don't open a
 * blank tab when used for in-deck navigation.
 */
describe("applyOpenInNewTabToLinks", () => {
  let md;

  beforeEach(() => {
    md = new MarkdownIt({ html: true, linkify: false, typographer: false, breaks: true });
    applyOpenInNewTabToLinks(md);
  });

  it("adds target=_blank and rel=noopener noreferrer to http links", () => {
    const html = md.render("[example](https://example.com)");
    expect(html).toMatch(/<a[^>]*href="https:\/\/example\.com"/);
    expect(html).toMatch(/target="_blank"/);
    expect(html).toMatch(/rel="noopener noreferrer"/);
  });

  it("applies the same treatment to relative links", () => {
    const html = md.render("[docs](/docs/intro)");
    expect(html).toMatch(/target="_blank"/);
    expect(html).toMatch(/rel="noopener noreferrer"/);
  });

  it("leaves in-page anchor links (#…) alone", () => {
    const html = md.render("[jump down](#section-2)");
    expect(html).not.toMatch(/target="_blank"/);
    expect(html).not.toMatch(/rel="noopener noreferrer"/);
  });

  it("does not touch the link text content", () => {
    const html = md.render("[Click here](https://example.com)");
    expect(html).toContain("Click here");
  });

  it("handles a paragraph with mixed link types", () => {
    const md_no_breaks = new MarkdownIt({
      html: true,
      linkify: false,
      typographer: false,
      breaks: false,
    });
    applyOpenInNewTabToLinks(md_no_breaks);
    const html = md_no_breaks.render(
      "See [docs](https://example.com) and [top](#top) for context.",
    );
    // External: gets target
    expect(html).toMatch(/<a[^>]*href="https:\/\/example\.com"[^>]*target="_blank"/);
    // Anchor: does not
    expect(html).toMatch(/<a[^>]*href="#top"[^>]*>(?!.*target="_blank")/s);
  });

  it("is a no-op when given a null/undefined instance", () => {
    expect(() => applyOpenInNewTabToLinks(null)).not.toThrow();
    expect(() => applyOpenInNewTabToLinks(undefined)).not.toThrow();
    expect(() => applyOpenInNewTabToLinks({})).not.toThrow();
  });
});
