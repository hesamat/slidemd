/**
 * TextpackSanitizer
 * Converts rendered HTML back to markdown for .textpack round-tripping.
 * Used both when exporting (deck→markdown) and opening (markdown→deck)
 * to ensure the markdown is always clean, renderable source.
 */

/**
 * Decode common HTML entities.
 * @param {string} s
 * @returns {string}
 */
function decodeEntities(s) {
  if (!s) return "";
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Strip HTML tags but decode entities in the text content.
 * @param {string} s
 * @returns {string}
 */
function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).trim();
}

export function htmlToMarkdown(html) {
  if (!html) return "";

  let md = html;

  // 1. Convert ALL <pre>...</pre> blocks to fenced code blocks.
  //    This must run first and be the most permissive pattern.
  //    It handles <pre><code class="lang-xxx">, <pre><code>, and plain <pre>.
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_match, inner) => {
    // Try to extract language from <code class="language-xxx"> or <code class="lang-xxx">
    const langMatch = inner.match(/<code[^>]*class=["'][^"']*(?:language|lang)-(\w+)["']/i);
    const lang = langMatch ? langMatch[1] : "";
    // Extract code content by stripping all HTML tags
    const code = decodeEntities(inner.replace(/<[^>]+>/g, ""));
    return `\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
  });

  // 2. Convert <div class="mermaid" data-mermaid-source="..."> back to ```mermaid code blocks
  md = md.replace(
    /<div\s+class="mermaid"[^>]*data-mermaid-source="([^"]*)"[^>]*><\/div>/gi,
    (_match, source) => {
      return `\n\n\`\`\`mermaid\n${decodeEntities(source)}\n\`\`\`\n\n`;
    },
  );
  // Also handle mermaid divs with inner text content
  md = md.replace(/<div\s+class="mermaid"[^>]*>([\s\S]*?)<\/div>/gi, (_match, content) => {
    const decoded = stripTags(content);
    if (!decoded) return "";
    return `\n\n\`\`\`mermaid\n${decoded}\n\`\`\`\n\n`;
  });

  // 3. Convert <img> tags to markdown images
  md = md.replace(/<img\s+[^>]*src=["']([^"']*)["'][^>]*>/gi, (_match, src) => {
    return `![](${decodeEntities(src)})`;
  });

  // 4. Convert blockquotes (must come before headings/paragraphs inside blockquotes)
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_match, content) => {
    let inner = content;
    // Convert headings inside blockquotes
    inner = inner.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level, text) => {
      return `${"#".repeat(Number(level))} ${stripTags(text)}\n`;
    });
    // Convert lists inside blockquotes
    inner = inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, text) => `- ${stripTags(text)}\n`);
    // Convert paragraphs inside blockquotes
    inner = inner.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_m, text) => `${stripTags(text)}\n`);
    // Strip remaining tags
    inner = stripTags(inner);
    // Add > prefix to each line
    const lines = inner.split("\n").filter((l) => l.trim());
    return lines.map((l) => `> ${l}`).join("\n") + "\n\n";
  });

  // 5. Convert headings: <h1>...</h1> through <h6>...</h6>
  md = md.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level, content) => {
    return `${"#".repeat(Number(level))} ${stripTags(content)}\n`;
  });

  // 6. Convert <em>/<i> to italic
  md = md.replace(/<em>([\s\S]*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i>([\s\S]*?)<\/i>/gi, "*$1*");

  // 7. Convert <strong>/<b> to bold
  md = md.replace(/<strong>([\s\S]*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b>([\s\S]*?)<\/b>/gi, "**$1**");

  // 8. Convert inline <code> (with or without class) to backtick code
  //    Must run BEFORE step 15 strips all tags
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_match, code) => {
    return `\`${decodeEntities(code)}\``;
  });

  // 9. Convert <a href="...">text</a> to [text](url)
  md = md.replace(
    /<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href, text) => {
      return `[${stripTags(text)}](${decodeEntities(href)})`;
    },
  );

  // 10. Convert <br> to newlines
  md = md.replace(/<br\s*\/?>/gi, "\n");

  // 11. Convert <hr> to horizontal rule
  md = md.replace(/<hr\s*\/?>/gi, "\n---\n");

  // 12. Convert <li> to list items
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_match, content) => {
    return `- ${stripTags(content)}\n`;
  });

  // 13. Convert <p> tags to paragraphs
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_match, content) => {
    return content.trim() + "\n\n";
  });

  // 14. Convert <table> to markdown tables
  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_match, tableContent) => {
    let result = "\n";
    const rows = [];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRe.exec(tableContent))) {
      const cells = [];
      const cellRe = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
      let cellMatch;
      while ((cellMatch = cellRe.exec(rowMatch[1]))) {
        cells.push(stripTags(cellMatch[1]));
      }
      rows.push(cells);
    }
    if (rows.length > 0) {
      result += `| ${rows[0].join(" | ")} |\n`;
      result += `| ${rows[0].map(() => "---").join(" | ")} |\n`;
      for (let i = 1; i < rows.length; i++) {
        result += `| ${rows[i].join(" | ")} |\n`;
      }
      result += "\n";
    }
    return result;
  });

  // 15. Strip any remaining HTML tags
  md = md.replace(/<[^>]+>/g, "");

  // 16. Decode any remaining HTML entities
  md = decodeEntities(md);

  // 17. Clean up excessive blank lines
  md = md.replace(/\n{3,}/g, "\n\n");

  return md.trim();
}
