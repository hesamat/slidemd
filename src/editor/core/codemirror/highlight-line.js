import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";

/**
 * Line highlight for click-to-jump.
 *
 * When a user clicks a slide thumbnail the editor jumps to the corresponding
 * markdown line and briefly highlights it.  These CodeMirror StateEffects
 * coordinate the highlight: `addHighlight` applies a temporary CSS class to a
 * line, and `removeHighlight` clears it.
 *
 * The `highlightField` StateField wires the effects into the editor's
 * decoration layer.  `highlightLine()` on MarkdownEditor dispatches the
 * effects with a timed sequence (clear → apply → clear after 1.2 s).
 *
 * The `cm-highlighted-line` CSS class used by the decoration is defined in
 * `styles/editor.css`.
 */

export const addHighlight = StateEffect.define();
export const removeHighlight = StateEffect.define();

const highlightLineDeco = Decoration.line({ attributes: { class: "cm-highlighted-line" } });

export const highlightField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    if (tr.effects.length) {
      let d = deco;
      for (const e of tr.effects) {
        if (e.is(addHighlight)) {
          const doc = tr.state.doc;
          let lineNum = e.value + 1;
          if (lineNum < 1) lineNum = 1;
          if (lineNum > doc.lines) lineNum = doc.lines;
          const line = doc.line(lineNum);
          d = Decoration.set([highlightLineDeco.range(line.from)]);
        } else if (e.is(removeHighlight)) {
          d = Decoration.none;
        }
      }
      return d;
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});
