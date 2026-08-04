/**
 * ContentEnhancer
 * Provides static methods for enhancing slide content, including diagram rendering (Mermaid), syntax highlighting (Prism), and math typesetting (KaTeX).
 */
import { normalizeCodeLanguage, escapeHtml, base64Encode, base64Decode } from "../core/utils.js";

const EMOJI_SEQUENCE_RE =
  /(?:[0-9#*]\uFE0F?\u20E3|\p{Regional_Indicator}{2}|(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F|\p{Emoji}\uFE0F)(?:\p{Emoji_Modifier})?(?:\u200D(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F|\p{Emoji}\uFE0F)(?:\p{Emoji_Modifier})?)*)/gu;

function normalizeEmojiTextInRoot(rootEl) {
  const doc = rootEl.ownerDocument || document;
  const showText = doc.defaultView?.NodeFilter?.SHOW_TEXT || 4;
  const walker = doc.createTreeWalker(rootEl, showText);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (
      node.parentElement?.closest("code, pre, script, style, svg, .mermaid, .katex, .slide-emoji")
    ) {
      continue;
    }
    if (EMOJI_SEQUENCE_RE.test(node.nodeValue)) {
      textNodes.push(node);
    }
    EMOJI_SEQUENCE_RE.lastIndex = 0;
  }

  for (const textNode of textNodes) {
    const fragment = doc.createDocumentFragment();
    let lastIndex = 0;
    EMOJI_SEQUENCE_RE.lastIndex = 0;
    for (const match of textNode.nodeValue.matchAll(EMOJI_SEQUENCE_RE)) {
      if (match.index > lastIndex) {
        fragment.append(textNode.nodeValue.slice(lastIndex, match.index));
      }
      const emoji = doc.createElement("span");
      emoji.className = "slide-emoji";
      emoji.textContent = match[0];
      fragment.append(emoji);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < textNode.nodeValue.length) {
      fragment.append(textNode.nodeValue.slice(lastIndex));
    }
    textNode.replaceWith(fragment);
  }
}

function normalizeEmojiText(rootEl) {
  if (!rootEl) return;
  const areaRoots = rootEl.matches?.(".slide__area")
    ? [rootEl]
    : [...(rootEl.querySelectorAll?.(".slide__area") || [])];
  const roots = areaRoots.length > 0 ? areaRoots : [rootEl];
  roots.forEach(normalizeEmojiTextInRoot);
}

export class ContentEnhancer {
  static normalizeEmojiText(rootEl) {
    normalizeEmojiText(rootEl);
  }

  /**
   * Scans the deck to see what enhancers are needed.
   */
  static scanDeck(deck) {
    let hasMermaid = false;
    let hasMath = false;
    let hasCode = false;

    const checkText = (text) => {
      if (!text) return;
      if (!hasMermaid && /class=["'][^"']*\bmermaid\b[^"']*["']/.test(text)) hasMermaid = true;
      if (!hasMermaid && /(```|~~~)\s*mermaid/.test(text)) hasMermaid = true;
      if (!hasMath && /\$\$|\$|\\\(|\\\[|\\begin\{/.test(text)) hasMath = true;
      if (!hasCode && /<pre\b[\s\S]*?<code\b/i.test(text)) hasCode = true;
    };

    for (const slide of deck.slides) {
      if (hasMermaid && hasMath && hasCode) break;
      if (slide.notes) checkText(slide.notes);
      if (slide.areas) {
        for (const area of Object.values(slide.areas)) checkText(area);
      }
    }
    return { hasMermaid, hasMath, hasCode };
  }

  /**
   * Initializes and returns the Mermaid instance.
   */
  static async initializeMermaid() {
    if (window.__WEBDECK_MERMAID__) return window.__WEBDECK_MERMAID__;

    // Prefer global AssetLoader when available (exported HTML bundles it)
    const loader = window.AssetLoader || (await import("../core/asset-loader.js")).AssetLoader;
    await loader.ensureMermaidLoaded();
    return window.__WEBDECK_MERMAID__;
  }

  static getMermaidSandbox() {
    let box = document.getElementById("mermaid-sandbox");
    if (!box) {
      box = document.createElement("div");
      box.id = "mermaid-sandbox";
      box.setAttribute("aria-hidden", "true");
      box.style.cssText = `
position: fixed;
left: -10000px;
top: 0;
width: 1920px;
height: 1080px;
overflow: hidden;
pointer-events: none;
contain: layout paint style;
`;
      document.body.appendChild(box);
    }
    return box;
  }

  /**
   * Reads a Mermaid source from a `data-mermaid-source` attribute.
   * The parser base64-encodes the source to survive DOMPurify; older plain-text
   * attributes are still supported.
   */
  static getMermaidSource(el) {
    const raw = el.dataset.mermaidSource;
    if (!raw) return raw;
    if (raw.startsWith("b64:")) {
      return base64Decode(raw.slice(4));
    }
    return raw;
  }

  /**
   * Encodes Mermaid source for storage in a `data-mermaid-source` attribute.
   */
  static encodeMermaidSource(source) {
    const encoded = base64Encode(source);
    return encoded === null ? source : `b64:${encoded}`;
  }

  /**
   * Renders Mermaid diagrams.
   */
  static async renderMermaidDiagrams(rootEl, options = {}) {
    const mermaidBlocks = rootEl?.querySelectorAll(".mermaid:not([data-mermaid-processed])") || [];
    if (mermaidBlocks.length === 0) return true;

    const { renderAllSlides = false } = options;
    const mermaidHandle = await this.initializeMermaid();
    if (!mermaidHandle?.mermaid) return false;
    const { mermaid } = mermaidHandle;

    for (const el of mermaidBlocks) {
      const slide = el.closest(".slide");
      if (slide && !renderAllSlides && !slide.classList.contains("active")) continue;

      const source = this.getMermaidSource(el);
      if (!source) {
        el.dataset.mermaidProcessed = "1";
        continue;
      }

      try {
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const sandbox = this.getMermaidSandbox();

        // Fonts can affect Mermaid's label measurement (and thus spacing/wrapping)
        if (document.fonts?.ready) await document.fonts.ready;

        let out;
        try {
          out = await mermaid.render(id, source, sandbox);
        } catch {
          // Fallback for Mermaid builds that don't accept a container arg
          out = await mermaid.render(id, source);
        }
        const svg = typeof out === "string" ? out : out?.svg;
        if (svg) el.innerHTML = svg;
        if (out && typeof out !== "string") out.bindFunctions?.(el);
      } catch (e) {
        const errorMessage = escapeHtml(e.message || "Mermaid rendering failed");
        const safeSource = escapeHtml(source);
        el.innerHTML = `
                    <div class="mermaid-error" role="alert">
                        <div class="mermaid-error__title">Mermaid error</div>
                        <div class="mermaid-error__message">${errorMessage}</div>
                        <details class="mermaid-error__details">
                            <summary>Show source</summary>
                            <pre>${safeSource}</pre>
                        </details>
                    </div>
                `;
      }
      el.dataset.mermaidProcessed = "1";
    }

    return true;
  }

  /**
   * Enhances rendered content with syntax highlighting, diagrams, and math.
   */
  static async enhanceRenderedContent(rootEl, options = {}) {
    if (!rootEl) return;
    const { renderAllSlides = false, force = false, skipMermaidRendering = false } = options;

    if (!force && rootEl.dataset?.webdeckEnhanced === "1") return true;

    // 0. Add target="_blank" to footer links
    const footerLinks = rootEl.querySelectorAll(".slide__area--footer a[href]");
    for (const link of footerLinks) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }

    // Load assets if needed
    if (
      !window.Prism ||
      !window.renderMathInElement ||
      (!window.__WEBDECK_MERMAID__ && rootEl.querySelector(".mermaid"))
    ) {
      try {
        const loader = window.AssetLoader || (await import("../core/asset-loader.js")).AssetLoader;
        await loader.ensureRichTextEnhancers();
      } catch (e) {
        console.warn("Enhancer load error", e);
      }
    }

    // 1. Convert Mermaid code blocks to divs
    const mermaidCodeNodes = rootEl.querySelectorAll(
      "pre code.language-mermaid, pre code.lang-mermaid",
    );
    for (const codeEl of mermaidCodeNodes) {
      const pre = codeEl.parentElement;
      if (pre?.tagName === "PRE") {
        const source = codeEl.textContent?.trim();
        if (!source) continue;

        const div = document.createElement("div");
        div.className = "mermaid";
        // Base64-encode so DOMPurify-like sanitizers do not strip the arrow syntax.
        div.dataset.mermaidSource = this.encodeMermaidSource(source);
        // Include source for runtime rendering (used in exports)
        div.textContent = source;
        pre.replaceWith(div);
      }
    }

    // 2. Prism syntax highlighting (run before Mermaid so code blocks are coloured
    // immediately even if the diagram library is still loading).
    if (window.Prism) {
      const codeNodes = Array.from(rootEl.querySelectorAll("pre code"));
      for (const codeEl of codeNodes) {
        const match = codeEl.className.match(/(?:lang|language)-(\S+)/);
        const lang = match ? normalizeCodeLanguage(match[1]) : "none";
        codeEl.className = `language-${lang}`;
      }
      try {
        if (window.Prism.highlightAllUnder) window.Prism.highlightAllUnder(rootEl);
        else codeNodes.forEach((c) => window.Prism.highlightElement(c));
      } catch (e) {
        console.warn("Prism error:", e);
      }
    }

    // 3. KaTeX math
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(rootEl, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\(", right: "\\)", display: false },
            { left: "\\[", right: "\\]", display: true },
          ],
          ignoredClasses: ["no-math", "katex-ignore", "mermaid"],
          throwOnError: false,
        });
      } catch (e) {
        console.warn("KaTeX error:", e);
      }
    }

    // 4. Render Mermaid diagrams (run last so syntax highlighting and math do not
    //    wait for the diagram library).
    const mermaidBlocks = rootEl.querySelectorAll(".mermaid");
    if (mermaidBlocks.length > 0) {
      mermaidBlocks.forEach((el) => el.closest(".slide__area")?.classList.add("media"));
      if (!skipMermaidRendering) {
        await this.renderMermaidDiagrams(rootEl, { renderAllSlides });
      }
    }

    normalizeEmojiText(rootEl);
    if (rootEl.dataset) rootEl.dataset.webdeckEnhanced = "1";
    return true;
  }
}

// Expose for non-module consumers (exported HTML bundle, PDF export, dist builds)
if (typeof window !== "undefined") {
  window.ContentEnhancer = ContentEnhancer;
}
