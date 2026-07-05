import { EditorView } from "@codemirror/view";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/**
 * Syntax highlighting style for markdown tokens.
 *
 * Uses CSS custom properties so colours adapt to the active theme
 * (light / dark) without any JS-level switching.
 */
const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "var(--cm-token-heading)", fontWeight: "700" },
  { tag: tags.strong, color: "var(--cm-token-strong)", fontWeight: "700" },
  { tag: tags.emphasis, color: "var(--cm-token-emphasis)", fontStyle: "italic" },
  { tag: tags.keyword, color: "var(--cm-token-keyword)" },
  { tag: tags.atom, color: "var(--cm-token-atom)" },
  { tag: tags.string, color: "var(--cm-token-string)" },
  { tag: tags.comment, color: "var(--cm-token-comment)", fontStyle: "italic" },
  { tag: tags.link, color: "var(--cm-token-link)" },
  { tag: tags.url, color: "var(--cm-token-url)", textDecoration: "underline" },
  { tag: tags.monospace, color: "var(--cm-token-code)", fontFamily: "var(--font-mono)" },
  { tag: tags.list, color: "var(--cm-token-list)" },
  { tag: tags.quote, color: "var(--cm-token-quote)" },
  { tag: tags.meta, color: "var(--cm-token-meta)" },
]);

/**
 * Base editor theme (colours, spacing, typography).
 */
const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--surface-bg)",
    color: "var(--text-high)",
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
  },
  ".cm-scroller": {
    fontFamily: "inherit",
  },
  ".cm-content": {
    padding: "14px",
  },
  ".cm-line": {
    lineHeight: "1.6",
  },
  ".cm-gutters": {
    backgroundColor: "var(--surface-bg)",
    color: "var(--text-low)",
    borderRight: "1px solid var(--border-medium)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--surface-elevated)",
  },
});

/**
 * Ready-to-use CodeMirror extensions for syntax highlighting and theme.
 */
export const editorThemeExtensions = [
  syntaxHighlighting(markdownHighlightStyle, { fallback: true }),
  editorTheme,
];
