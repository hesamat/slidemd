import { snippetCompletion, startCompletion } from "@codemirror/autocomplete";
import { LayoutData } from "../../../data/layout-data.js";

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

function layoutCompletionSource(layoutCompletions) {
  return (context) => {
    const match = context.matchBefore(/layout:\s*[a-z0-9-]*$/i);
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

function areaCompletionSource(areaCompletions) {
  return (context) => {
    const match = context.matchBefore(/@[a-z0-9_-]*$/i);
    if (!match) return null;
    return { from: match.from, options: areaCompletions };
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

  const areaNames = Array.from(
    new Set(
      layoutNames
        .flatMap((name) => LayoutData.getAreaNames(name))
        .concat(["main", "header", "footer", "media", "sidebar", "secondary", "title"]),
    ),
  );
  const areaCompletions = areaNames.map((name) => ({ label: `@${name}`, type: "keyword" }));

  return [
    slashCommandSource(),
    layoutCompletionSource(layoutCompletions),
    directiveCompletionSource(),
    notesCompletionSource(),
    areaCompletionSource(areaCompletions),
    fenceCompletionSource(),
  ];
}
