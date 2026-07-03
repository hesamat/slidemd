/**
 * HTML-to-Markdown converter for PPTX content.
 *
 * Converts HTML strings produced by pptxtojson into GitHub-flavored
 * Markdown. Handles inline formatting (bold, italic, monospace),
 * block elements (paragraphs, lists, pre blocks), CSS-based
 * bullet detection, and font-size-based heading detection.
 */

// Font-size thresholds for heading detection (in points).
// These are based on typical PowerPoint default font sizes:
// Title: 36-44pt, Subtitle: 24-28pt, Body: 18-24pt, Small: 12-14pt
const HEADING_H2_THRESHOLD = 36;
const HEADING_H3_THRESHOLD = 28;

// Monospace font-family pattern for detecting code content
const MONOSPACE_PATTERN =
  /font-family:\s*(?:consolas|courier\s*new|courier|lucida\s*console|monaco|monospace)/i;

/**
 * Extract the largest font size from a DOM element's child spans.
 * Returns 0 if no font-size is found.
 * @param {Element} element
 * @returns {number}
 */
function getLargestFontSize(element) {
  let maxSize = 0;
  const spans = element.querySelectorAll("span");
  for (const span of spans) {
    const style = span.getAttribute("style") || "";
    const match = style.match(/font-size:\s*(\d+(?:\.\d+)?)\s*pt/i);
    if (match) {
      const size = parseFloat(match[1]);
      if (size > maxSize) maxSize = size;
    }
  }
  return maxSize;
}

/**
 * Check if all text content in a DOM element is monospace.
 * Returns true if every span with text has a monospace font-family.
 * @param {Element} element
 * @returns {boolean}
 */
function isAllMonospace(element) {
  const spans = element.querySelectorAll("span");
  if (spans.length === 0) return false;
  for (const span of spans) {
    const style = span.getAttribute("style") || "";
    if (!MONOSPACE_PATTERN.test(style)) return false;
  }
  return true;
}

/**
 * Convert HTML to Markdown using native DOM parsing.
 * @param {string} html
 * @returns {string}
 */
export function htmlToMarkdown(html) {
  if (!html) return "";

  // Detect CSS-based bullets: PowerPoint uses text-indent: -XXpt
  // (negative hanging indent) to create space for the bullet marker
  // without using <ul>/<li>.  A negative text-indent >= 10pt is a
  // reliable signal of bullet formatting, regardless of whether
  // margin-left is also present.
  const withBullets = html.replace(/<p\s+style="([^"]*)">([\s\S]*?)<\/p>/gi, (match, style) => {
    const m = style.match(/text-indent:\s*-(\d+)/);
    if (!m) return match;
    const indent = parseInt(m[1], 10);
    if (indent >= 10) return `<li>${match}</li>`;
    return match;
  });

  // DOMParser normalizes the HTML.  Existing <ul><li> structures are
  // preserved.  Standalone <li> tags (from CSS bullet detection) are
  // placed directly under <body> and handled by processBlockNodes.
  const doc = new DOMParser().parseFromString(withBullets, "text/html");
  const body = doc.body;

  const result = [];
  processBlockNodes(body.childNodes, result);
  let md = result.join("");
  md = md.replace(/\n{3,}/g, "\n\n");

  // Group consecutive backtick-wrapped lines into fenced code blocks.
  // Match any line that starts and ends with backtick (inline code),
  // including lines with backticks inside (e.g., `id``(test_value)`).
  const lines = md.split("\n");
  const grouped = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmedLine = line.trim();
    const isBacktickLine = /^`.+`$/.test(trimmedLine);
    if (isBacktickLine) {
      const codeLines = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (/^`.+`$/.test(t)) {
          // Preserve indentation by extracting content between backticks
          // without trimming the original line
          const content = lines[i].replace(/^\s*`/, "").replace(/`\s*$/, "");
          codeLines.push(content);
          i++;
        } else if (t === "") {
          i++;
        } else {
          break;
        }
      }
      if (codeLines.length >= 2) {
        grouped.push("```\n" + codeLines.join("\n") + "\n```");
      } else if (codeLines.length === 1) {
        // Keep single backtick lines as inline code (preserve backticks)
        grouped.push(trimmedLine);
      }
    } else {
      grouped.push(line);
      i++;
    }
  }
  md = grouped.join("\n");

  // Escape < and > characters, but preserve content inside backticks and
  // fenced code blocks. Split by backtick-wrapped content and fenced code
  // blocks, escape only the non-code parts.
  md = md
    .split(/(`[^`]+`|^```\n[\s\S]*?\n```)/m)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/</g, "&lt;").replace(/>/g, "&gt;")))
    .join("");
  return md.trim();
}

/**
 * Strip all HTML tags, returning plain text only.
 * @param {string} html
 * @returns {string}
 */
export function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Process block-level nodes and accumulate markdown output.
 * @param {NodeList} nodes
 * @param {string[]} out
 */
function processBlockNodes(nodes, out) {
  for (const node of nodes) {
    if (node.nodeType === 3) {
      const text = node.textContent;
      if (text.trim()) out.push(text);
      continue;
    }
    if (node.nodeType !== 1) continue;

    const tag = node.tagName;

    if (tag === "UL" || tag === "OL") {
      processList(node, 0, out);
      out.push("\n");
      continue;
    }

    // Standalone <li> (from CSS bullet detection) — treat as a list item
    if (tag === "LI") {
      const inline = [];
      processInlineNodes(node.childNodes, inline);
      const merged = mergeAdjacentMarkers(inline.join("").trim());
      if (merged) {
        out.push("- " + merged + "\n");
      }
      continue;
    }

    if (tag === "TABLE") {
      continue;
    }

    if (tag === "PRE") {
      const text = node.textContent || "";
      if (text.trim()) {
        out.push("```\n" + text + "\n```\n\n");
      }
      continue;
    }

    if (tag === "P" || tag === "DIV") {
      const inline = [];
      processInlineNodes(node.childNodes, inline);
      let merged = mergeAdjacentMarkers(inline.join(""));
      if (merged.trim()) {
        // Skip heading detection if all content is monospace code —
        // these paragraphs should be treated as code, not headings.
        const allMono = isAllMonospace(node);
        if (allMono) {
          out.push(merged + "\n\n");
        } else {
          // Escape # at start of lines so PPTX text like "# Print using..."
          // is preserved as literal text. Skip lines starting with backticks
          // (monospace code) since # inside code blocks should not be escaped.
          merged = merged
            .split("\n")
            .map((line) => (/^`/.test(line.trim()) ? line : line.replace(/^#/gm, "\\#")))
            .join("\n");
          // Detect headings by font size — use ## for heading-sized text
          // but only if the text is short enough to be a heading
          const fontSize = getLargestFontSize(node);
          if (fontSize >= HEADING_H3_THRESHOLD && merged.trim().length <= 80) {
            out.push(`## ${merged.trim()}\n\n`);
          } else {
            out.push(merged + "\n\n");
          }
        }
      }
      continue;
    }

    if (tag === "BR") {
      out.push("\n");
      continue;
    }

    const inline = [];
    processInlineNodes(node.childNodes, inline);
    const merged = mergeAdjacentMarkers(inline.join(""));
    if (merged.trim()) {
      out.push(merged + "\n\n");
    }
  }
}

/**
 * Process a list element and its children with proper indentation.
 * @param {Element} listNode
 * @param {number} depth
 * @param {string[]} out
 */
function processList(listNode, depth, out) {
  for (const child of listNode.children) {
    if (child.tagName !== "LI") continue;

    const inline = [];
    const nestedLists = [];
    for (const cn of child.childNodes) {
      if (cn.nodeType === 1 && (cn.tagName === "UL" || cn.tagName === "OL")) {
        nestedLists.push(cn);
      } else {
        processInlineNodes([cn], inline);
      }
    }
    const merged = mergeAdjacentMarkers(inline.join("").trim());
    if (merged) {
      out.push("  ".repeat(depth) + "- " + merged + "\n");
    }
    for (const nl of nestedLists) {
      processList(nl, depth + 1, out);
    }
  }
}

/**
 * Process inline-level nodes, accumulating markdown text.
 * @param {NodeList} nodes
 * @param {string[]} out
 */
function processInlineNodes(nodes, out) {
  for (const node of nodes) {
    if (node.nodeType === 3) {
      out.push(node.textContent.replace(/\u00a0/g, " "));
      continue;
    }
    if (node.nodeType !== 1) continue;

    const tag = node.tagName;

    if (tag === "STRONG" || tag === "B") {
      const inner = [];
      processInlineNodes(node.childNodes, inner);
      const raw = inner.join("");
      const trimmed = raw.trim();
      if (trimmed) {
        out.push("**" + trimmed + "**");
      } else if (raw) {
        // Preserve whitespace-only spans as a single space
        out.push(" ");
      } else {
        out.push(raw);
      }
      continue;
    }

    if (tag === "EM" || tag === "I") {
      const inner = [];
      processInlineNodes(node.childNodes, inner);
      const raw = inner.join("");
      const trimmed = raw.trim();
      if (trimmed) {
        out.push("*" + trimmed + "*");
      } else if (raw) {
        // Preserve whitespace-only spans as a single space
        out.push(" ");
      } else {
        out.push(raw);
      }
      continue;
    }

    if (tag === "SPAN") {
      const style = (node.getAttribute("style") || "").toLowerCase();
      const isBold = /font-weight:\s*(?:bold|[6-9]\d{2})/.test(style);
      const isItalic = /font-style:\s*italic/.test(style);
      const isMono =
        /font-family:\s*(?:consolas|courier\s*new|courier|lucida\s*console|monaco|monospace)/i.test(
          style,
        );

      const inner = [];
      processInlineNodes(node.childNodes, inner);
      const raw = inner.join("");
      const trimmed = raw.trim();

      if (trimmed) {
        let text = isMono ? raw : trimmed;
        if (isMono) {
          // Monospace text — use backticks, skip bold/italic markers
          text = "`" + text.replace(/`/g, "\\`") + "`";
          out.push(text);
        } else if (isBold && isItalic) {
          out.push("***" + trimmed + "***");
        } else if (isBold) {
          out.push("**" + trimmed + "**");
        } else if (isItalic) {
          out.push("*" + trimmed + "*");
        } else {
          // Plain text span — preserve original spacing
          out.push(raw);
        }
      } else if (raw) {
        // Whitespace-only span — preserve as a single space
        out.push(" ");
      }
      continue;
    }

    if (tag === "A") {
      const href = node.getAttribute("href") || "";
      const inner = [];
      processInlineNodes(node.childNodes, inner);
      const text = inner.join("").trim();
      if (href) {
        out.push("[" + (text || href) + "](" + href + ")");
      } else if (text) {
        out.push(text);
      }
      continue;
    }

    if (tag === "BR") {
      out.push("\n");
      continue;
    }

    const inner = [];
    processInlineNodes(node.childNodes, inner);
    out.push(inner.join(""));
  }
}

/**
 * Merge adjacent same-type markdown markers.
 * Converts "**a** **b**" → "**a b**" and "***a*** ***b***" → "***a b***".
 * @param {string} text
 * @returns {string}
 */
function mergeAdjacentMarkers(text) {
  let s = text;
  for (let i = 0; i < 10; i++) {
    const prev = s;
    s = s.replace(/\*\*\*([^*]+?)\*\*\*(\s*)\*\*\*(?!\*)/g, "***$1$2");
    if (s === prev) break;
  }
  for (let i = 0; i < 10; i++) {
    const prev = s;
    s = s.replace(/\*\*([^*]+?)\*\*(\s*)\*\*(?!\*)/g, "**$1$2");
    if (s === prev) break;
  }
  for (let i = 0; i < 10; i++) {
    const prev = s;
    s = s.replace(/(?<!\*)\*([^*]+?)\*(\s+)\*(?!\*)/g, "*$1$2");
    if (s === prev) break;
  }
  s = s.replace(/\*\*\s*\*\*/g, " ");
  s = s.replace(/(?<!\*)\*\s+\*(?!\*)/g, " ");
  // Ensure a space after closing bold markers when followed by text
  // e.g. "**word**next" → "**word** next" but only for ** (not ***)
  s = s.replace(/(\S)\*\*(\S)/g, (match, before, after) => {
    // Don't add space if this is part of a *** (bold+italic) marker
    if (before === "*" || after === "*") return match;
    return `${before}** ${after}`;
  });
  return s;
}
