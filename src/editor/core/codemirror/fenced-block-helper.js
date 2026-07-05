import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/**
 * Fenced block helper.
 *
 * Typing a third backtick or tilde on a line that already has two markers
 * auto-expands to a full fenced code block with the cursor placed inside.
 *
 *   ``  →  ```
 *        |
 *        ```
 */
export const fencedBlockHelper = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== "`" && text !== "~") return false;
  const marker = text === "`" ? "`" : "~";
  const line = view.state.doc.lineAt(from);
  const before = line.text.slice(0, from - line.from);

  if (before.trim() !== marker.repeat(2)) return false;

  const indentMatch = line.text.match(/^\s*/);
  const indent = indentMatch ? indentMatch[0] : "";
  const fence = marker.repeat(3);
  const insertText = `${indent}${fence}\n${indent}\n${indent}${fence}`;
  const cursorPosition = line.from + indent.length + fence.length + 1 + indent.length;

  view.dispatch({
    changes: { from: line.from, to: line.to, insert: insertText },
    selection: EditorSelection.cursor(cursorPosition),
  });

  return true;
});
