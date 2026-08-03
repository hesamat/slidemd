import { snippetCompletion, startCompletion } from "@codemirror/autocomplete";
import { LayoutData } from "../../../data/layout-data.js";
import { LayoutParser } from "../../../data/layout-parser.js";
import { MarkdownParser } from "../../../data/markdown-parser.js";

/**
 * Autocompletion sources for the markdown editor.
 *
 * Each source is a CodeMirror `CompletionSource` function.  This module
 * exports a factory `createCompletionSources()` that builds the data
 * structures from `LayoutData` once and returns the array of sources.
 */

function createSlashCommand(label, insertText, triggerCompletion) {
  return {
    label,
    type: "keyword",
    apply: (view, _completion, from, to) => {
      view.dispatch({
        changes: { from, to, insert: insertText },
        selection: { anchor: from + insertText.length },
      });
      if (triggerCompletion) {
        startCompletion(view);
      }
    },
  };
}

/**
 * Get the raw text of the slide that contains the cursor position.
 * Uses fence-aware splitting so `---` inside code blocks is not treated
 * as a slide separator.
 */
function getCurrentSlideText(context) {
  const doc = context.state.doc.toString();
  const pos = context.pos;
  const slides = new MarkdownParser().splitSlides(doc);

  let offset = 0;
  for (const slide of slides) {
    const start = doc.indexOf(slide, offset);
    if (start < 0) break;
    const end = start + slide.length;
    if (pos >= start && pos <= end) return slide;
    offset = end;
  }
  return doc;
}

/**
 * Resolve the area names for the current slide's `layout:` directive.
 * Supports preset names, custom names from localStorage, and inline grid strings.
 */
function getCurrentSlideAreaNames(context) {
  const slide = getCurrentSlideText(context);
  const match = slide.match(/^layout\s*:\s*(.+)$/m);
  if (!match) return null;

  const layout = match[1].trim();
  const grid = LayoutData.getGridTemplate(layout) || layout;
  const parsed = LayoutParser.parse(grid);
  return parsed.orderedAreas;
}

function layoutCompletionSource(layoutCompletions) {
  return (context) => {
    const match = context.matchBefore(/(?:^|\n)\s*layout:\s*.*/i);
    if (!match) return null;
    let from = match.from + match.text.indexOf(":") + 1;
    const docText = context.state.doc.sliceString(match.from, match.to);
    while (from < match.to && /\s/.test(docText[from - match.from])) {
      from += 1;
    }
    return { from, options: layoutCompletions };
  };
}

function directiveCompletionSource() {
  return (context) => {
    const match = context.matchBefore(/(?:^|\n)\s*(background|theme|hidden|hide):\s*[^\n]*$/i);
    if (!match) return null;

    const directive = match.text.split(":")[0].trim().toLowerCase();
    let from = match.from + match.text.indexOf(":") + 1;
    const docText = context.state.doc.sliceString(match.from, match.to);
    while (from < match.to && /\s/.test(docText[from - match.from])) {
      from += 1;
    }

    const optionsByDirective = {
      theme: [
        { label: "light", type: "keyword" },
        { label: "dark", type: "keyword" },
      ],
      hidden: [
        { label: "true", type: "keyword" },
        { label: "false", type: "keyword" },
      ],
      hide: [
        { label: "true", type: "keyword" },
        { label: "false", type: "keyword" },
      ],
      background: [
        snippetCompletion("linear-gradient(135deg, #0ea5e9 0%, #1e3a8a 90%)", {
          label: "gradient",
        }),
        snippetCompletion("#eeffdd", { label: "solid color" }),
        snippetCompletion("url(${})", { label: "image URL" }),
      ],
    };

    const options = optionsByDirective[directive];
    if (!options) return null;
    return { from, options };
  };
}

function notesCompletionSource() {
  return (context) => {
    const match = context.matchBefore(/<!--\s*notes\s*:?\s*[^-]*$/i);
    if (!match) return null;
    return {
      from: match.from,
      options: [snippetCompletion("<!-- notes: ${} -->", { label: "notes", type: "keyword" })],
    };
  };
}

function slashCommandSource() {
  return (context) => {
    const match = context.matchBefore(/(?:^|\s)\/[a-z-]*$/i);
    if (!match) return null;

    const start = match.from + match.text.lastIndexOf("/");
    return {
      from: start,
      options: [
        createSlashCommand("/layout", "layout: ", true),
        createSlashCommand("/theme", "theme: ", true),
        createSlashCommand("/background", "background: ", true),
        createSlashCommand("/hidden", "hidden: ", true),
        createSlashCommand("/main", "@main\n", false),
        createSlashCommand("/header", "@header\n", false),
        createSlashCommand("/media", "@media\n", false),
        createSlashCommand("/sidebar", "@sidebar\n", false),
        createSlashCommand("/footer", "@footer\n", false),
        createSlashCommand("/mermaid", "```mermaid\n\n```", false),
        createSlashCommand("/notes", "<!-- notes:  -->", false),
      ],
    };
  };
}

function areaCompletionSource(fallbackAreaNames) {
  return (context) => {
    const match = context.matchBefore(/@[a-z0-9_-]*$/i);
    if (!match) return null;
    const currentAreas = getCurrentSlideAreaNames(context);
    const names = currentAreas && currentAreas.length ? currentAreas : fallbackAreaNames;
    const options = names.map((name) => ({ label: `@${name}`, type: "keyword" }));
    return { from: match.from, options };
  };
}

function fenceCompletionSource() {
  return (context) => {
    const match = context.matchBefore(/```[a-z]*$/i);
    if (!match) return null;
    return {
      from: match.from,
      options: [
        snippetCompletion("```mermaid\n${}\n```", { label: "```mermaid", type: "keyword" }),
        snippetCompletion("```js\n${}\n```", { label: "```js", type: "keyword" }),
        snippetCompletion("```bash\n${}\n```", { label: "```bash", type: "keyword" }),
        snippetCompletion("```md\n${}\n```", { label: "```md", type: "keyword" }),
      ],
    };
  };
}

/**
 * Build and return the array of completion sources.
 *
 * Layout and area data is read from `LayoutData` once at call time so
 * each source can close over the pre-computed options.
 */
export function createCompletionSources() {
  const layoutNames = LayoutData.getAllLayouts();
  const layoutCompletions = layoutNames.map((name) => ({ label: name, type: "keyword" }));

  // Snippet shortcuts for common custom grid patterns.
  layoutCompletions.push(
    snippetCompletion('"header header" "main media" / 1fr 1fr', {
      label: "custom-two-col",
      type: "keyword",
    }),
    snippetCompletion('"header" auto "main" 1fr / 800px', {
      label: "custom-narrow",
      type: "keyword",
    }),
    snippetCompletion('"left right" / 1fr 1fr', {
      label: "custom-split",
      type: "keyword",
    }),
  );

  const fallbackAreaNames = Array.from(
    new Set(
      layoutNames
        .flatMap((name) => LayoutData.getAreaNames(name))
        .concat(["main", "header", "footer", "media", "sidebar", "secondary", "title"]),
    ),
  );

  return [
    slashCommandSource(),
    layoutCompletionSource(layoutCompletions),
    directiveCompletionSource(),
    notesCompletionSource(),
    areaCompletionSource(fallbackAreaNames),
    fenceCompletionSource(),
  ];
}
