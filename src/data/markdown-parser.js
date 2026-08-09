/**
 * MarkdownParser
 * Extracts and parses slides from markdown files. Handles code fences, directives,
 * and metadata for slide generation and content structuring.
 *
 * @class
 */
// Markdown parsing and slide extraction
import {
  safeString,
  slugifyTitle,
  DESIGN_SIZE,
  escapeBareHtmlTags,
  escapeHtml,
  base64Encode,
  unescapeHtml,
} from "../core/utils.js";
import { convertTextBlockDirectivesToHtml } from "../core/text-block-directive.js";
import { LayoutParser } from "./layout-parser.js";

class FenceTracker {
  constructor() {
    this.inFence = false;
    this.fenceMarker = null;
  }

  toggle(line) {
    const m = line.match(/^\s*(```+|~~~+)\s*/);
    if (!m) return;
    const marker = m[1][0];
    if (!this.inFence) {
      this.inFence = true;
      this.fenceMarker = marker;
    } else if (this.fenceMarker === marker) {
      this.inFence = false;
      this.fenceMarker = null;
    }
  }

  get isInFence() {
    return this.inFence;
  }
}

/**
 * Make every markdown link open in a new tab with `rel="noopener noreferrer"`.
 * In-page anchor links (`#…`) are left alone so they don't open a blank tab
 * when used for in-deck navigation.
 * @param {object} md — markdown-it instance
 * @returns {void}
 */
export function applyOpenInNewTabToLinks(md) {
  if (!md?.renderer) return;
  const defaultRender =
    md.renderer.rules.link_open ||
    ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const href = token.attrGet("href") || "";
    if (!href.startsWith("#")) {
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noopener noreferrer");
    }
    return defaultRender(tokens, idx, options, env, self);
  };
}

export function splitSlides(markdownText) {
  const lines = safeString(markdownText).replace(/\r\n?/g, "\n").split("\n");
  const slides = [];
  let buf = [];
  const fence = new FenceTracker();

  for (const line of lines) {
    fence.toggle(line);
    if (!fence.isInFence && /^\s*---\s*$/.test(line)) {
      const text = buf.join("\n").trim();
      if (text) slides.push(text);
      buf = [];
      continue;
    }
    buf.push(line);
  }

  const last = buf.join("\n").trim();
  if (last) slides.push(last);
  return slides;
}

export class MarkdownParser {
  constructor() {
    this.md = null;
  }

  /**
   * Parse a boolean directive value ("true"/"false"/"yes"/"no"/"1"/"0"/etc.).
   * @param {string} raw - Raw directive value.
   * @returns {boolean|null} `true`, `false`, or `null` if unrecognized.
   */
  parseBooleanDirectiveValue(raw) {
    const s = safeString(raw).trim().toLowerCase();
    if (!s) return null;
    if (["1", "true", "yes", "y", "on"].includes(s)) return true;
    if (["0", "false", "no", "n", "off"].includes(s)) return false;
    return null;
  }

  /**
   * Extract the first `# heading` from markdown text (skipping fenced code blocks).
   * @param {string} markdownText
   * @returns {string} The heading text, or empty string if none found.
   */
  /**
   * Strip common inline markdown formatting from plain text.
   * Removes bold, italic, underline, strikethrough, inline code, and link syntax,
   * keeping only the readable text content.
   * @param {string} text
   * @returns {string} Text with markdown formatting removed.
   */
  static stripFormatting(text) {
    let s = safeString(text);
    // Remove inline code backticks
    s = s.replace(/`([^`]+)`/g, "$1");
    // Remove links: [text](url) → text
    s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    // Remove bold+italic: ***text*** or ___text___ → text
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, "$1");
    s = s.replace(/___(.+?)___/g, "$1");
    // Remove bold: **text** or __text__ → text
    s = s.replace(/\*\*(.+?)\*\*/g, "$1");
    s = s.replace(/__(.+?)__/g, "$1");
    // Remove italic: *text* or _text_ → text
    s = s.replace(/\*(.+?)\*/g, "$1");
    s = s.replace(/_(.+?)_/g, "$1");
    // Remove strikethrough: ~~text~~ → text
    s = s.replace(/~~(.+?)~~/g, "$1");
    return s.trim();
  }

  /**
   * Derive a readable slide title from raw area markdown: scan lines for the
   * first one that yields text once HTML tags are removed, decode entities,
   * strip markdown formatting, collapse whitespace, and truncate. Lines that
   * are pure markup (e.g. the flex-row/fullpage-grid wrappers emitted by PPTX
   * imports) are skipped so the title never shows raw HTML.
   * Returns "" when no line carries readable text.
   * @param {string} raw
   * @returns {string}
   */
  _deriveFallbackTitle(raw) {
    for (const line of safeString(raw).split("\n")) {
      // An area that opens with an image titles from the image's alt text —
      // but only when the line is entirely that image (markdown or HTML).
      // A line that also carries readable text (e.g. a flex-row with an
      // image plus a caption) must title from that text, not from the
      // auto-generated "Slide image N" alt.
      const mdImg = line.trim().match(/^!\[([^\]]*)\]\([^)]*\)\s*$/);
      if (mdImg && mdImg[1].trim()) return mdImg[1].trim().slice(0, 80);
      const htmlImg = line.match(/^\s*<img\b[^>]*>\s*$/i);
      if (htmlImg) {
        const htmlAlt = line.match(/<img[^>]*\salt=["']([^"']*)["']/i);
        if (htmlAlt && htmlAlt[1].trim()) return htmlAlt[1].trim().slice(0, 80);
      }
      const text = this._htmlToPlainText(line);
      if (text) {
        return text.length > 80 ? text.slice(0, 80).trim() + "…" : text;
      }
    }
    return "";
  }

  /**
   * Strip HTML tags (replacing them with spaces so cell/wrapper content keeps
   * word boundaries), decode common entities, and remove markdown formatting.
   * Complete open/close tag pairs are removed anywhere in the line with their
   * inner text preserved (so wrapper markup keeps its cell content); stray
   * single tags are left untouched, so prose that merely mentions a tag
   * ("write &lt;div&gt; tags") keeps it.
   * @param {string} line
   * @returns {string}
   */
  _htmlToPlainText(line) {
    let s = line
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");
    // Comments may be unterminated in user content — strip to end of line.
    s = s.replace(/<!--[\s\S]*?(?:-->|$)/g, " ");
    // Void elements (no closing tag) are removed anywhere — an <img> inside a
    // flex-row line must not survive into the derived title.
    s = s.replace(
      /<(img|br|hr|input|meta|link|wbr|source|embed|area|base|col|param|track)\b[^>]*>/gi,
      " ",
    );
    // Remove complete tag pairs (innermost first), keeping the inner text
    // and surrounding it with spaces so adjacent cell content keeps word
    // boundaries. Inner content that itself contains "<" (e.g. "<<" operator
    // cells) is handled by a tolerant second pass — by then every inner pair
    // is gone, so a non-greedy match lands on the correct closing tag.
    let prev = null;
    while (prev !== s) {
      prev = s;
      s = s.replace(/<([a-zA-Z][a-zA-Z0-9-]*)[^>]*>([^<]*)<\/\1>/gi, " $2 ");
    }
    prev = null;
    while (prev !== s) {
      prev = s;
      s = s.replace(/<([a-zA-Z][a-zA-Z0-9-]*)[^>]*>([\s\S]*?)<\/\1>/gi, " $2 ");
    }
    // Stray tags left after pair removal are either wrapper openers (a
    // flex-row <div> whose close lives on another line) or prose mentions.
    // Strip them when they leave no text OR when an opening tag leads the
    // line (a wrapper opener with text on the same line); keep the line when
    // a tag is merely mentioned mid-sentence ("write <div> tags").
    if (/<[a-zA-Z]/.test(s)) {
      const withoutTags = s.replace(/<\/?[a-zA-Z][^>]*>/gi, " ");
      if (!withoutTags.trim() || /^<\s*[a-zA-Z]/.test(s.trimStart())) s = withoutTags;
    }
    s = MarkdownParser.stripFormatting(s);
    return s.replace(/\s+/g, " ").trim();
  }

  extractTitle(markdownText) {
    const lines = safeString(markdownText).replace(/\r\n?/g, "\n").split("\n");
    const fence = new FenceTracker();
    let title = "";

    for (const line of lines) {
      fence.toggle(line);

      if (!title && !fence.isInFence) {
        const m = line.match(/^\s*#{1,6}\s+(.+?)\s*$/);
        if (m) {
          title = MarkdownParser.stripFormatting(m[1]);
        }
      }
    }

    return title;
  }

  /**
   * Initialize `this.md` (markdown-it instance) if not already done.
   * Sets up source-line tracking on the renderer.
   * @returns {void}
   */
  ensureMarkdownIt() {
    if (this.md) return;
    if (typeof window.markdownit !== "function") {
      throw new Error("markdown-it not available");
    }
    this.md = window.markdownit({
      html: true,
      linkify: false,
      typographer: false,
      breaks: true,
    });

    applyOpenInNewTabToLinks(this.md);

    // Source-map plugin: add data-source-line to all block-level opening tags.
    // token.map[0] is the 0-indexed physical line inside the rendered area
    // string (empty lines are counted). The click handler offsets this by the
    // area's content-start line in the editor to jump to the exact source line.
    const addSourceLineAttr = (token) => {
      if (token.map) {
        token.attrPush(["data-source-line", String(token.map[0])]);
      }
    };

    const originalRenderToken = this.md.renderer.renderToken.bind(this.md.renderer);
    this.md.renderer.renderToken = function (tokens, idx, options, env) {
      const token = tokens[idx];
      if (token.map && token.type.endsWith("_open")) {
        addSourceLineAttr(token);
      }
      return originalRenderToken(tokens, idx, options, env);
    };

    // fence, code_block and hr use dedicated renderer rules instead of the
    // generic renderToken path, so wrap those rules too.
    const blockRules = ["fence", "code_block", "hr"];
    for (const ruleName of blockRules) {
      const originalRule = this.md.renderer.rules[ruleName];
      if (!originalRule) continue;
      this.md.renderer.rules[ruleName] = function (tokens, idx, options, env, slf) {
        const token = tokens[idx];
        addSourceLineAttr(token);
        return originalRule(tokens, idx, options, env, slf);
      };
    }
  }

  /**
   * Split a markdown document into individual slide strings on `---` separators.
   * Ignores `---` inside fenced code blocks.
   * @param {string} markdownText
   * @returns {string[]} Non-empty slide text segments.
   */
  splitSlides(markdownText) {
    return splitSlides(markdownText);
  }

  /**
   * Split text into fence-aware segments, marking each as inside or outside a code fence.
   * @param {string} markdownText
   * @returns {{ inFence: boolean, text: string }[]}
   */
  splitFenceAwareSegments(markdownText) {
    const lines = safeString(markdownText).replace(/\r\n?/g, "\n").split("\n");
    const segments = [];
    const plainLines = [];
    const fence = new FenceTracker();

    const flushPlain = () => {
      if (plainLines.length === 0) return;
      segments.push({ inFence: false, text: plainLines.join("\n") });
      plainLines.length = 0;
    };

    for (const line of lines) {
      const isFenceMarker = /^\s*(```+|~~~+)\s*/.test(line);

      if (!fence.isInFence && isFenceMarker) {
        flushPlain();
        segments.push({ inFence: true, text: line });
        fence.toggle(line);
        continue;
      }

      if (fence.isInFence) {
        segments.push({ inFence: true, text: line });
        if (isFenceMarker) fence.toggle(line);
        continue;
      }

      plainLines.push(line);
    }

    flushPlain();
    return segments;
  }

  /**
   * Extract speaker notes from `<!-- notes: ... -->` HTML comments (outside code fences).
   * @param {string} markdownText
   * @returns {string} Notes joined by double newline, or empty string.
   */
  extractNotes(markdownText) {
    const notes = [];

    for (const segment of this.splitFenceAwareSegments(markdownText)) {
      if (segment.inFence) continue;

      const re = /<!--\s*notes\s*:(.*?)-->/gis;
      let m;
      while ((m = re.exec(segment.text))) {
        notes.push(safeString(m[1]).trim());
      }
    }

    return notes.join("\n\n").trim();
  }

  /**
   * Remove all `<!-- notes: ... -->` comments from text (outside code fences).
   * @param {string} markdownText
   * @returns {string}
   */
  stripNotes(markdownText) {
    return this.splitFenceAwareSegments(markdownText)
      .map((segment) =>
        segment.inFence ? segment.text : segment.text.replace(/<!--\s*notes\s*:.*?-->/gis, ""),
      )
      .join("\n");
  }

  /**
   * Extract a named directive (e.g. "layout", "theme") from slide markdown.
   * @param {string} markdownText
   * @param {string} directiveName - Case-insensitive directive name.
   * @returns {import('../types.js').DirectiveResult}
   */
  extractDirective(markdownText, directiveName) {
    const text = safeString(markdownText).replace(/\r\n?/g, "\n");
    const lines = text.split("\n");
    const fence = new FenceTracker();
    let value = "";
    let found = false;
    let from = -1;
    let to = -1;
    const out = [];
    let offset = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineStart = offset;
      const lineEnd = offset + line.length + (i < lines.length - 1 ? 1 : 0);
      fence.toggle(line);
      if (!fence.isInFence) {
        const pattern = new RegExp(`^\\s*${directiveName}\\s*:\\s*(.*)\\s*$`, "i");
        const match = line.match(pattern);
        if (match) {
          value = match[1].trim();
          found = true;
          from = lineStart;
          to = lineEnd;
          offset = lineEnd;
          continue;
        }
      }
      out.push(line);
      offset = lineEnd;
    }

    return { value, found, from, to, markdown: out.join("\n").trim() };
  }

  /**
   * Extract all `area-style-<name>:` directives and return a map of
   * area names to their CSS declaration strings, along with the markdown
   * stripped of those directives.
   * @param {string} markdownText
   * @returns {{ areaStyles: Record<string, string>, markdown: string }}
   */
  extractAreaStyleDirectives(markdownText) {
    const text = safeString(markdownText).replace(/\r\n?/g, "\n");
    const lines = text.split("\n");
    const fence = new FenceTracker();
    const out = [];
    const areaStyles = {};

    for (const line of lines) {
      fence.toggle(line);
      if (!fence.isInFence) {
        const match = line.match(/^\s*area-style-([a-zA-Z0-9_-]+)\s*:\s*(.*)\s*$/i);
        if (match) {
          areaStyles[match[1].toLowerCase()] = match[2].trim();
          continue;
        }
      }
      out.push(line);
    }

    return { areaStyles, markdown: out.join("\n").trim() };
  }

  /**
   * Escape LaTeX bracket delimiters (`\[`, `\]`) and convert `$$` math blocks to single-line.
   * @param {string} src
   * @returns {string}
   */
  escapeKatexBracketDelimiters(src) {
    const lines = safeString(src).replace(/\r\n?/g, "\n").split("\n");
    const fence = new FenceTracker();
    let inMathBlock = false;
    let mathBlockLines = [];
    const result = [];

    for (const line of lines) {
      fence.toggle(line);
      if (fence.isInFence) {
        result.push(line);
        continue;
      }

      // Check for $$ math block delimiters
      if (line.trim() === "$$") {
        if (!inMathBlock) {
          // Start of math block
          inMathBlock = true;
          mathBlockLines = [];
        } else {
          // End of math block - convert to single-line format
          const mathContent = mathBlockLines.join(" ").trim();
          // Escape all backslashes in the math content
          const escaped = mathContent.replace(/\\/g, "\\\\");
          result.push(`$$${escaped}$$`);
          inMathBlock = false;
          mathBlockLines = [];
        }
      } else if (inMathBlock) {
        // Collect lines inside the math block
        mathBlockLines.push(line);
      } else {
        // Outside math blocks, escape LaTeX bracket delimiters
        result.push(
          line
            .replace(/\\\[/g, "\\\\[")
            .replace(/\\\]/g, "\\\\]")
            .replace(/\\\$/g, '<span class="katex-ignore">$</span>'),
        );
      }
    }

    return result.join("\n");
  }

  /**
   * Split slide markdown by `@area` markers into named content regions.
   * @param {string} markdownText
   * @returns {import('../types.js').AreaParseResult}
   */
  static parseAreas(markdownText) {
    const lines = safeString(markdownText).replace(/\r\n?/g, "\n").split("\n");
    const areas = {};
    const areaOffsets = {}; // 0-indexed editor line where each area's content starts
    let current = "main";
    const fence = new FenceTracker();

    const ensure = (name) => {
      if (!areas[name]) areas[name] = [];
    };

    ensure(current);
    let lineIdx = 0;
    let seenMarker = false;

    for (const line of lines) {
      fence.toggle(line);
      if (!fence.isInFence) {
        const m = line.match(/^\s*@([a-zA-Z_][a-zA-Z0-9_-]*)\s*$/);
        if (m) {
          seenMarker = true;
          current = m[1].toLowerCase();
          ensure(current);
          // Record the content start line the first time we see this
          // area. Keep the earliest start for repeated markers.
          if (!(current in areaOffsets)) {
            areaOffsets[current] = lineIdx + 1;
          }
          lineIdx++;
          continue;
        }
      }
      areas[current].push(line);
      if (current === "main" && !seenMarker && line.trim() !== "") {
        areaOffsets.main = 0;
      }
      lineIdx++;
    }

    // If main never received content, default it to the top of the slide.
    if (!("main" in areaOffsets)) {
      areaOffsets.main = 0;
    }

    const out = {};
    for (const [name, buf] of Object.entries(areas)) {
      const text = buf.join("\n");
      if (text.trim()) out[name] = text;
    }

    return { areas: out, areaOffsets };
  }

  /**
   * Return the physical `@area` markers in the source, in document order,
   * each with its 0-indexed line number. Markers inside code fences are
   * ignored. Used by the editor to position inserted area placeholders.
   * @param {string} markdownText
   * @returns {{name: string, line: number}[]}
   */
  findAreaMarkers(markdownText) {
    const lines = safeString(markdownText).replace(/\r\n?/g, "\n").split("\n");
    const fence = new FenceTracker();
    const markerRe = /^\s*@([a-zA-Z_][a-zA-Z0-9_-]*)\s*$/;
    const markers = [];
    lines.forEach((line, i) => {
      fence.toggle(line);
      if (!fence.isInFence) {
        const m = line.match(markerRe);
        if (m) markers.push({ name: m[1].toLowerCase(), line: i });
      }
    });
    return markers;
  }

  /**
   * Remove @area markers and their content for areas not in `allowedAreas`,
   * and normalize header<->title aliases to match the target layout.
   *
   * Content before the first @area marker (the implicit "main" area) is
   * always preserved. Markers inside code fences are left untouched.
   *
   * @param {string} markdownText
   * @param {string[]} allowedAreas  — area names the target layout supports
   * @returns {string} cleaned markdown
   */
  collapseUnsupportedAreas(markdownText, allowedAreas) {
    const allowed = new Set((allowedAreas || []).map((a) => a.toLowerCase()));
    const lines = safeString(markdownText).replace(/\r\n?/g, "\n").split("\n");
    const fence = new FenceTracker();
    const markerRe = /^\s*@([a-zA-Z_][a-zA-Z0-9_-]*)\s*$/;

    // Determine which alias the layout expects.
    const wantsTitle = allowed.has("title");
    const wantsHeader = allowed.has("header");

    const out = [];

    for (const line of lines) {
      fence.toggle(line);

      if (!fence.isInFence) {
        const m = line.match(markerRe);
        if (m) {
          const rawName = m[1].toLowerCase();

          // --- alias normalization ---
          let name = rawName;
          if (rawName === "header" && wantsTitle && !wantsHeader) {
            name = "title";
          } else if (rawName === "title" && wantsHeader && !wantsTitle) {
            name = "header";
          }

          if (!allowed.has(name)) {
            // Unsupported area: skip the marker but keep its content
            // (it gets absorbed into the previous supported area).
            continue;
          }

          // Supported area — emit (possibly renamed) marker.
          if (name !== rawName) {
            out.push(`@${name}`);
          } else {
            out.push(line);
          }
          continue;
        }
      }

      // Content lines are always emitted — content from unsupported areas
      // is absorbed into the preceding supported area.
      out.push(line);
    }

    return out.join("\n");
  }

  /**
   * Rename unsupported @area markers to the closest supported area that is not
   * already present in the markdown. If no supported slot is available, the
   * marker is dropped and its content is merged into the previous area.
   *
   * @param {string} markdownText
   * @param {string[]} allowedAreas — area names the target layout supports
   * @returns {string} normalized markdown
   */
  normalizeAreaMarkers(markdownText, allowedAreas) {
    const allowed = new Set((allowedAreas || []).map((a) => a.toLowerCase()));
    if (!allowed.size) return markdownText;

    const markers = this.findAreaMarkers(markdownText);
    const present = new Set(markers.map((m) => m.name));
    const missing = (allowedAreas || []).map((a) => a.toLowerCase()).filter((a) => !present.has(a));

    const lines = safeString(markdownText).replace(/\r\n?/g, "\n").split("\n");
    const fence = new FenceTracker();
    const markerRe = /^\s*@([a-zA-Z_][a-zA-Z0-9_-]*)\s*$/;

    const wantsTitle = allowed.has("title");
    const wantsHeader = allowed.has("header");

    const out = [];
    const used = new Set();

    for (const line of lines) {
      fence.toggle(line);

      if (!fence.isInFence) {
        const m = line.match(markerRe);
        if (m) {
          const rawName = m[1].toLowerCase();

          // --- alias normalization ---
          let name = rawName;
          if (rawName === "header" && wantsTitle && !wantsHeader) {
            name = "title";
          } else if (rawName === "title" && wantsHeader && !wantsTitle) {
            name = "header";
          }

          if (allowed.has(name)) {
            out.push(name === rawName ? line : `@${name}`);
            used.add(name);
            continue;
          }

          // Unsupported marker — convert to the closest missing supported area.
          const candidates = missing.filter((a) => !used.has(a));
          if (candidates.length === 0) continue;

          let slot = candidates[0];
          let best = _editDistance(rawName, slot);
          for (let i = 1; i < candidates.length; i++) {
            const d = _editDistance(rawName, candidates[i]);
            if (d < best) {
              best = d;
              slot = candidates[i];
            }
          }

          out.push(`@${slot}`);
          used.add(slot);
          continue;
        }
      }

      out.push(line);
    }

    return out.join("\n");
  }

  /**
   * Compute the 0-indexed editor line where each area's content begins in the
   * raw slide markdown. Directives (layout, background, etc.) and HTML
   * comments (e.g. <!-- notes: ... -->) are treated as non-content lines:
   * they occupy editor lines but do not start an area. This is used for
   * click-to-source mapping in the editor.
   */
  computeAreaOffsets(markdownText) {
    const lines = safeString(markdownText).replace(/\r\n?/g, "\n").split("\n");
    const areaOffsets = {};
    let current = "main";
    const fence = new FenceTracker();
    const isDirective = (line) =>
      /^\s*(layout|background|theme|hidden|hide|align|header-style|area-style(?:-[a-zA-Z0-9_-]+)?|code-font-size)\s*:/i.test(
        line,
      );

    let lineIdx = 0;
    let seenMarker = false;
    let inHtmlComment = false;

    for (const line of lines) {
      fence.toggle(line);

      // Track HTML comments so they don't count as area-start content.
      const startsComment = /^\s*<!--/.test(line);
      const endsComment = /-->\s*$/.test(line);
      if (startsComment) inHtmlComment = true;

      if (!fence.isInFence && !inHtmlComment) {
        const m = line.match(/^\s*@([a-zA-Z_][a-zA-Z0-9_-]*)\s*$/);
        if (m) {
          seenMarker = true;
          current = m[1].toLowerCase();
          if (!(current in areaOffsets)) {
            areaOffsets[current] = lineIdx + 1;
          }
          lineIdx++;
          if (endsComment) inHtmlComment = false;
          continue;
        }
      }

      if (
        current === "main" &&
        !seenMarker &&
        !inHtmlComment &&
        !isDirective(line) &&
        line.trim() !== ""
      ) {
        areaOffsets.main = lineIdx;
      }

      lineIdx++;
      if (endsComment) inHtmlComment = false;
    }

    if (!("main" in areaOffsets)) {
      areaOffsets.main = 0;
    }

    return areaOffsets;
  }

  /**
   * Convert `<pre><code class="language-mermaid">` blocks to `<div class="mermaid">` for client-side rendering.
   * @param {string} htmlText
   * @returns {string}
   */
  convertMermaidCodeBlocksToDiv(htmlText) {
    // Convert <pre><code class="language-mermaid">...</code></pre> to <div class="mermaid">...</div>
    // Capture attributes before/after the class so we can preserve data-source-line.
    const re =
      /<pre>\s*<code([^>]*)class=["'][^"']*(?:language|lang)-mermaid[^"']*["']([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/gi;
    return htmlText.replace(re, (match, beforeAttrs, afterAttrs, content) => {
      // Extract the source line added by the source-map plugin, if present.
      const allAttrs = (beforeAttrs || "") + (afterAttrs || "");
      const sourceLineMatch = allAttrs.match(/data-source-line="(\d+)"/);
      const sourceAttr = sourceLineMatch ? ` data-source-line="${sourceLineMatch[1]}"` : "";

      // Store Mermaid source base64-encoded so DOMPurify does not strip it
      // (raw Mermaid syntax like "A-->B" looks like an HTML comment end to sanitizers).
      // The captured content may contain HTML entities from markdown-it, so decode first.
      const source = unescapeHtml(content);
      const encoded = base64Encode(source);

      // Create a div with a data attribute for client-side rendering
      const sourceValue = encoded === null ? escapeHtml(source) : `b64:${encoded}`;
      return `<div class="mermaid"${sourceAttr} data-mermaid-source="${sourceValue}"></div>`;
    });
  }

  /**
   * Parse a full markdown document into a deck structure with slides, areas, and metadata.
   * Requires `window.markdownit` to be loaded (call `AssetLoader.ensureMarkdownItLoaded()` first).
   * @param {string} markdownText
   * @returns {import('../types.js').Deck}
   */
  parseDeckMarkdown(markdownText) {
    this.ensureMarkdownIt();

    const slideTexts = this.splitSlides(markdownText);
    const usedIds = new Map();

    const slides = slideTexts.map((raw, idx) => {
      const notes = this.extractNotes(raw);
      let cleaned = this.stripNotes(raw);

      // Compute raw editor line offsets for click-to-source mapping.
      // Directives and HTML comments are treated as non-content lines.
      const rawAreaOffsets = this.computeAreaOffsets(raw);

      // Extract all directives
      const { value: layout, markdown: withoutLayout } = this.extractDirective(cleaned, "layout");
      cleaned = withoutLayout;

      // For backwards compatibility, extract but ignore align directive
      const { markdown: withoutAlign } = this.extractDirective(cleaned, "align");
      cleaned = withoutAlign;

      const { value: background, markdown: withoutBackground } = this.extractDirective(
        cleaned,
        "background",
      );
      cleaned = withoutBackground;

      const { value: theme, markdown: withoutTheme } = this.extractDirective(cleaned, "theme");
      cleaned = withoutTheme;

      const { value: headerStyle, markdown: withoutHeaderStyle } = this.extractDirective(
        cleaned,
        "header-style",
      );
      cleaned = withoutHeaderStyle;

      const { value: areaStyle, markdown: withoutAreaStyle } = this.extractDirective(
        cleaned,
        "area-style",
      );
      cleaned = withoutAreaStyle;

      const { areaStyles, markdown: withoutAreaStyles } = this.extractAreaStyleDirectives(cleaned);
      cleaned = withoutAreaStyles;

      const { value: codeFontSize, markdown: withoutCodeFontSize } = this.extractDirective(
        cleaned,
        "code-font-size",
      );
      cleaned = withoutCodeFontSize;
      const parsedCodeFontSize = codeFontSize ? parseInt(codeFontSize, 10) : 0;

      // Hide slides from the viewer deck by default. Use ?showHidden=1 to include them.
      const {
        value: hiddenValue,
        found: hiddenFound,
        markdown: withoutHidden,
      } = this.extractDirective(cleaned, "hidden");
      cleaned = withoutHidden;
      const {
        value: hideValue,
        found: hideFound,
        markdown: withoutHide,
      } = this.extractDirective(cleaned, "hide");
      cleaned = withoutHide;
      const hiddenParsed = this.parseBooleanDirectiveValue(hiddenValue);
      const hideParsed = this.parseBooleanDirectiveValue(hideValue);
      const hidden = hiddenFound
        ? (hiddenParsed ?? true)
        : hideFound
          ? (hideParsed ?? true)
          : false;

      const explicitTitle = this.extractTitle(cleaned);

      cleaned = this.escapeKatexBracketDelimiters(cleaned);

      const { areas: areasMd } = MarkdownParser.parseAreas(cleaned);
      const markerList = this.findAreaMarkers(cleaned);
      const markerNames = [...new Set(markerList.map((m) => m.name))];

      const resolvedLayout = LayoutParser.parse(LayoutParser.resolvePreset(layout), {
        fallbackAreas: Object.keys(areasMd).length ? Object.keys(areasMd) : ["main"],
      });
      const layoutAreas = new Set(resolvedLayout.orderedAreas);
      const hasTitleArea = layoutAreas.has("title");

      // Treat @title and @header as aliases, but keep only the area the layout can actually render.
      if (hasTitleArea) {
        if (!areasMd.title && areasMd.header) {
          areasMd.title = areasMd.header;
        }
        if (!rawAreaOffsets.title && rawAreaOffsets.header) {
          rawAreaOffsets.title = rawAreaOffsets.header;
        }
        delete areasMd.header;
        delete rawAreaOffsets.header;
      } else {
        if (!areasMd.header && areasMd.title) {
          areasMd.header = areasMd.title;
        }
        if (!rawAreaOffsets.header && rawAreaOffsets.title) {
          rawAreaOffsets.header = rawAreaOffsets.title;
        }
        delete areasMd.title;
        delete rawAreaOffsets.title;
      }

      const areas = {};
      for (const [name, src] of Object.entries(areasMd)) {
        const withTextBlocks = convertTextBlockDirectivesToHtml(src);
        const escaped = escapeBareHtmlTags(withTextBlocks);
        let html = this.md.render(escaped);
        // Convert Mermaid code blocks to divs for client-side rendering
        html = this.convertMermaidCodeBlocksToDiv(html);
        areas[name] = html;
      }

      // Derive title: prefer explicit '# Title', then @header heading/content, then @main heading/content, then default
      let slideTitle = explicitTitle;
      if (!slideTitle) {
        const headerText = areasMd.header || "";
        const headerHeading = headerText.match(/^#{1,6}\s+(.+)$/m);
        if (headerHeading) {
          slideTitle = MarkdownParser.stripFormatting(headerHeading[1]);
        } else {
          // Fallback: first line of @header that yields readable text
          slideTitle = this._deriveFallbackTitle(headerText);
        }
      }

      if (!slideTitle) {
        const mainText = areasMd.main || "";
        const mainHeading = mainText.match(/^#{1,6}\s+(.+)$/m);
        if (mainHeading) {
          slideTitle = MarkdownParser.stripFormatting(mainHeading[1]);
        } else {
          // Fallback: first line of @main that yields readable text
          slideTitle = this._deriveFallbackTitle(mainText);
        }
      }

      if (!slideTitle) {
        slideTitle = `Slide ${idx + 1}`;
      }

      let id = slugifyTitle(slideTitle);
      const n = (usedIds.get(id) || 0) + 1;
      usedIds.set(id, n);
      if (n > 1) id = `${id}-${n}`;

      const themeSafe = safeString(theme).toLowerCase();
      const themeNormalized = themeSafe === "dark" ? "dark" : themeSafe === "light" ? "light" : "";

      return {
        id,
        title: slideTitle,
        notes,
        layout: layout || "",
        background: background || "",
        theme: themeNormalized,
        headerStyle: safeString(headerStyle).toLowerCase() || "",
        hidden,
        areas,
        areaStyle: areaStyle || "",
        areaStyles,
        codeFontSize: parsedCodeFontSize || 0,
        _areaOffsets: rawAreaOffsets,
        _markerNames: markerNames,
      };
    });

    const metaTitle = slides[0]?.title || "Slide Deck";
    return {
      meta: {
        id: slugifyTitle(metaTitle),
        title: metaTitle,
        aspect: "16:9",
        stage: { ...DESIGN_SIZE },
      },
      slides,
    };
  }
}

function _editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) {
      prev[j] = curr[j];
    }
  }

  return prev[n];
}
