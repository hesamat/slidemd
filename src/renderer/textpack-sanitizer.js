/**
 * TextpackSanitizer
 * Converts rendered HTML back to markdown for .textpack round-tripping.
 * Used both when exporting (deck→markdown) and opening (markdown→deck)
 * to ensure the markdown is always clean, renderable source.
 */

export function htmlToMarkdown(html) {
  if (!html) return "";

  let md = html;

  // 1. Convert <div class="mermaid" data-mermaid-source="..."> back to ```mermaid code blocks
  md = md.replace(
    /<div\s+class="mermaid"[^>]*data-mermaid-source="([^"]*)"[^>]*><\/div>/gi,
    (_match, source) => {
      const decoded = source
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"');
      return `\n\n\`\`\`mermaid\n${decoded}\n\`\`\`\n\n`;
    },
  );

  // Also handle mermaid divs with inner text content
  md = md.replace(/<div\s+class="mermaid"[^>]*>([\s\S]*?)<\/div>/gi, (_match, content) => {
    const decoded = content
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .trim();
    if (!decoded) return "";
    return `\n\n\`\`\`mermaid\n${decoded}\n\`\`\`\n\n`;
  });

  // 2. Convert <img> tags to markdown images
  md = md.replace(/<img\s+[^>]*src=["']([^"']*)["'][^>]*>/gi, (_match, src) => {
    const decodedSrc = src.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    return `![](${decodedSrc})`;
  });

  // 3. Convert headings: <h1>...</h1> through <h6>...</h6>
  md = md.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level, content) => {
    const text = content.replace(/<[^>]+>/g, "").trim();
    return `${"#".repeat(Number(level))} ${text}\n`;
  });

  // 4. Convert <em>/<i> to italic
  md = md.replace(/<em>([\s\S]*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i>([\s\S]*?)<\/i>/gi, "*$1*");

  // 5. Convert <strong>/<b> to bold
  md = md.replace(/<strong>([\s\S]*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b>([\s\S]*?)<\/b>/gi, "**$1**");

  // 6. Convert <code> to inline code (skip if inside <pre>)
  md = md.replace(/<pre[^>]*>[\s\S]*?<\/pre>/gi, (preBlock) => {
    // Preserve <pre> blocks — they'll be handled by markdown-it as code blocks
    return preBlock;
  });
  md = md.replace(/<code>([\s\S]*?)<\/code>/gi, "`$1`");

  // 7. Convert <a href="...">text</a> to [text](url)
  md = md.replace(
    /<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href, text) => {
      const decodedHref = href.replace(/&amp;/g, "&");
      const innerText = text.replace(/<[^>]+>/g, "");
      return `[${innerText}](${decodedHref})`;
    },
  );

  // 8. Convert <br> to newlines
  md = md.replace(/<br\s*\/?>/gi, "\n");

  // 9. Convert <hr> to horizontal rule
  md = md.replace(/<hr\s*\/?>/gi, "\n---\n");

  // 10. Convert <li> to list items
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_match, content) => {
    const text = content.replace(/<[^>]+>/g, "").trim();
    return `- ${text}\n`;
  });

  // 11. Convert <p> tags to paragraphs
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_match, content) => {
    return content.trim() + "\n\n";
  });

  // 12. Convert <blockquote> to blockquotes
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_match, content) => {
    const text = content.replace(/<[^>]+>/g, "").trim();
    return `> ${text}\n\n`;
  });

  // 13. Strip any remaining HTML tags
  md = md.replace(/<[^>]+>/g, "");

  // 14. Clean up excessive blank lines
  md = md.replace(/\n{3,}/g, "\n\n");

  return md.trim();
}
