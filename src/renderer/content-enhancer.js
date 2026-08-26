/**
 * ContentEnhancer
 * Provides static methods for enhancing slide content, including diagram rendering (Mermaid), syntax highlighting (Prism), and math typesetting (KaTeX).
 */
import { normalizeCodeLanguage, base64Encode, base64Decode } from "../core/utils.js";
import { Logger } from "../core/logger.js";
import { icon } from "../core/icon.js";
import createDOMPurify from "dompurify";

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

// Use module-specific names to avoid duplicate declaration errors when the
// runtime HTML export path concatenates this file with slide-renderer.js
// (which has its own _purify / getDOMPurify) into a single IIFE scope.
let _enhancerPurify;
let _enhancerPurifyWarned = false;

function getEnhancerDOMPurify() {
  if (_enhancerPurify !== undefined) return _enhancerPurify;

  if (typeof createDOMPurify !== "undefined") {
    try {
      _enhancerPurify = createDOMPurify(window);
    } catch {
      _enhancerPurify = null;
    }
  }

  if (!_enhancerPurify && typeof window !== "undefined" && window.DOMPurify) {
    _enhancerPurify = window.DOMPurify;
  }

  return _enhancerPurify;
}

/**
 * Sanitize a Mermaid-rendered SVG string before it is inserted into the DOM.
 * DOMPurify removes script tags, event handlers, and other executable vectors.
 *
 * Returns `null` when DOMPurify is unavailable so the caller can fall back to
 * a text-only sink (`textContent`) instead of assigning raw SVG to `innerHTML`.
 *
 * Mermaid renders flowchart/node labels inside `<foreignObject>` using HTML
 * elements (`<div>`, `<span>`). DOMPurify strips these by default because:
 *   1. `foreignObject` is in DOMPurify's `svgDisallowed` list.
 *   2. `foreignObject` is not in DOMPurify's `HTML_INTEGRATION_POINTS`, so
 *      HTML elements inside it are treated as invalid in the SVG namespace
 *      and removed.
 * We explicitly allow `foreignObject` and register it as an HTML integration
 * point so the HTML labels survive sanitization.
 *
 * `SAFE_FOR_XML` is left at its default (true) to protect against mutation XSS
 * (mXSS) vectors. Mermaid arrow syntax (`A --> B`) in label text is preserved
 * correctly — DOMPurify escapes `>` to `&gt;` which renders identically in the
 * browser.
 */
const MERMAID_SVG_PURIFY_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true, html: true },
  ADD_TAGS: ["foreignObject"],
  HTML_INTEGRATION_POINTS: { "annotation-xml": true, foreignobject: true },
  SAFE_FOR_XML: true,
};

export function sanitizeMermaidSvg(svg) {
  const purify = getEnhancerDOMPurify();
  if (!purify) {
    if (!_enhancerPurifyWarned) {
      _enhancerPurifyWarned = true;
      Logger.warn("DOMPurify not available; rendering Mermaid source as text");
    }
    return null;
  }
  return purify.sanitize(svg, MERMAID_SVG_PURIFY_CONFIG);
}

const COPY_BUTTON_TIMEOUT_MS = 2000;

const COPY_ICONS = {
  default: "copy",
  copied: "check",
  failed: "triangle-alert",
};

function isCopyButtonSurface() {
  if (typeof window === "undefined") return false;
  // Enable in the editor (role="editor") and in self-contained exports/bundles.
  // The viewer/audience window (role="viewer") and server-side rendering
  // contexts do not get copy buttons.
  const role =
    typeof document !== "undefined"
      ? document.documentElement?.getAttribute("data-webdeck-role")
      : null;
  return (
    window.__WEBDECK_EXPORTED__ === true ||
    window.__WEBDECK_BUNDLED_BUILD__ === true ||
    role === "editor"
  );
}

async function copyTextToClipboard(text) {
  if (
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function" &&
    window.isSecureContext
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      Logger.warn("Clipboard write failed, falling back to execCommand", e);
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "readonly");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
  document.body.appendChild(textarea);
  textarea.select();

  let success = false;
  try {
    success = document.execCommand("copy");
  } catch (e) {
    Logger.warn("execCommand copy failed", e);
  }

  document.body.removeChild(textarea);
  return success;
}

function setCopyButtonIcon(button, name) {
  const existing = button.querySelector(".code-copy-button__icon");
  if (existing) existing.remove();

  const svg = icon(name, { size: "md" });
  if (!svg) return;

  svg.classList.add("code-copy-button__icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("data-copy-icon", name);
  button.appendChild(svg);
}

function resetCopyButton(button) {
  button.classList.remove("is-copied", "is-copy-failed");
  button.setAttribute("aria-label", "Copy code to clipboard");
  button.setAttribute("title", "Copy");
  setCopyButtonIcon(button, COPY_ICONS.default);
}

async function onCopyButtonClick(button, codeEl) {
  const text = codeEl.textContent || "";
  let success;
  try {
    success = await copyTextToClipboard(text);
  } catch {
    success = false;
  }

  if (success) {
    button.classList.add("is-copied");
    button.setAttribute("aria-label", "Copied");
    button.setAttribute("title", "Copied");
    setCopyButtonIcon(button, COPY_ICONS.copied);
  } else {
    button.classList.add("is-copy-failed");
    button.setAttribute("aria-label", "Copy failed");
    button.setAttribute("title", "Copy failed");
    setCopyButtonIcon(button, COPY_ICONS.failed);
  }

  setTimeout(() => resetCopyButton(button), COPY_BUTTON_TIMEOUT_MS);
}

function createCopyButton(codeEl) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "code-copy-button";
  button.setAttribute("aria-label", "Copy code to clipboard");
  button.setAttribute("title", "Copy");

  button.addEventListener("click", () => onCopyButtonClick(button, codeEl));
  resetCopyButton(button);
  return button;
}

function isMermaidCodeBlock(codeEl) {
  const className = codeEl.className || "";
  return /(?:^|\s)(?:language|lang)-mermaid(?:\s|$)/.test(className);
}

function addCopyButtonsToCodeBlocks(rootEl) {
  if (!rootEl || !isCopyButtonSurface()) return;

  const pres = rootEl.querySelectorAll("pre");
  for (const pre of pres) {
    if (pre.querySelector(".code-copy-button")) continue;
    const codeEl = pre.querySelector(":scope > code");
    if (!codeEl) continue;
    if (isMermaidCodeBlock(codeEl)) continue;
    if ((codeEl.textContent || "").trim() === "") continue;
    pre.classList.add("has-copy-button");
    pre.appendChild(createCopyButton(codeEl));
  }
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
        if (svg) {
          const safeSvg = sanitizeMermaidSvg(svg);
          if (safeSvg) {
            el.innerHTML = safeSvg;
          } else {
            el.textContent = source;
          }
        }
        if (out && typeof out !== "string") out.bindFunctions?.(el);
      } catch (e) {
        el.textContent = "";
        const alert = document.createElement("div");
        alert.className = "mermaid-error";
        alert.setAttribute("role", "alert");

        const title = document.createElement("div");
        title.className = "mermaid-error__title";
        title.textContent = "Mermaid error";
        alert.appendChild(title);

        const message = document.createElement("div");
        message.className = "mermaid-error__message";
        message.textContent = e.message || "Mermaid rendering failed";
        alert.appendChild(message);

        const details = document.createElement("details");
        details.className = "mermaid-error__details";
        const summary = document.createElement("summary");
        summary.textContent = "Show source";
        details.appendChild(summary);
        const pre = document.createElement("pre");
        pre.textContent = source;
        details.appendChild(pre);
        alert.appendChild(details);

        el.appendChild(alert);
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
        Logger.warn("Enhancer load error", e);
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
        Logger.warn("Prism error:", e);
      }
    }

    // 2b. Add copy-to-clipboard buttons to code blocks in student-facing exports.
    addCopyButtonsToCodeBlocks(rootEl);

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
        Logger.warn("KaTeX error:", e);
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
