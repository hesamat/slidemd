/**
 * AreaNavigation
 *
 * Utilities for navigating between @area markers inside the markdown
 * editor extracted from EditController.
 */

const MARKER_RE = /^\s*@([a-zA-Z_][a-zA-Z0-9_-]*)\s*$/;

export class AreaNavigation {
  /**
   * @param {object} opts
   * @param {() => object|null} opts.getMarkdownEditor
   * @param {(value: string) => void} opts.onEditorInput
   */
  constructor({ getMarkdownEditor, onEditorInput }) {
    this._getMarkdownEditor = getMarkdownEditor;
    this._onEditorInput = onEditorInput;
  }

  get markdownEditor() {
    return this._getMarkdownEditor();
  }

  navigateToArea(areaName) {
    if (!this.markdownEditor) return;

    const name = String(areaName || "")
      .trim()
      .toLowerCase();
    if (!name) return;

    const markdown = this.markdownEditor.getValue();
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^\\s*@${escapedName}\\s*$`, "mi");
    const match = regex.exec(markdown);

    if (match) {
      const cursorPosition = match.index + match[0].length;
      this.markdownEditor.setValueWithCursor(markdown, cursorPosition, {
        suppressOnChange: true,
        scrollIntoView: true,
      });
      return;
    }

    const spacer = markdown.endsWith("\n") ? "" : "\n";
    const addition = `${spacer}\n@${name}\n`;
    const updated = `${markdown}${addition}`;
    const cursorPosition = updated.length;
    this.markdownEditor.setValueWithCursor(updated, cursorPosition, {
      suppressOnChange: true,
      scrollIntoView: true,
    });
    this._onEditorInput(updated);
  }

  getAreaAtCursor(markdown, position) {
    const text = String(markdown || "").replace(/\r\n?/g, "\n");
    const lines = text.split("\n");

    let currentArea = "main";
    let currentOffset = 0;
    let inFence = false;
    let fenceMarker = null;

    for (const line of lines) {
      const fenceMatch = line.match(/^\s*(```+|~~~+)\s*/);
      if (fenceMatch) {
        const marker = fenceMatch[1][0];
        if (!inFence) {
          inFence = true;
          fenceMarker = marker;
        } else if (fenceMarker === marker) {
          inFence = false;
          fenceMarker = null;
        }
      }

      if (!inFence) {
        const match = line.match(MARKER_RE);
        if (match) {
          if (position >= currentOffset) {
            currentArea = match[1].toLowerCase();
          }
        }
      }
      currentOffset += line.length + 1;
    }
    return currentArea;
  }

  getAreaContentRange(markdown, areaName) {
    const text = String(markdown || "").replace(/\r\n?/g, "\n");
    const lines = text.split("\n");
    const target = String(areaName || "main")
      .trim()
      .toLowerCase();

    const markers = this._collectMarkers(lines);
    const targetEntry = markers.find((m) => m.name === target);
    if (!targetEntry) {
      return { from: text.length, to: text.length };
    }

    const targetIdx = markers.indexOf(targetEntry);
    const nextMarkerIdx =
      targetIdx + 1 < markers.length ? markers[targetIdx + 1].idx : lines.length;

    const lineToChar = (lineIndex) => {
      let pos = 0;
      for (let i = 0; i < lineIndex; i++) {
        pos += lines[i].length + 1;
      }
      return pos;
    };

    return {
      from: lineToChar(targetEntry.idx + 1),
      to: lineToChar(nextMarkerIdx),
    };
  }

  getAreaMarkerRange(markdown, areaName) {
    const text = String(markdown || "").replace(/\r\n?/g, "\n");
    const lines = text.split("\n");
    const target = String(areaName || "")
      .trim()
      .toLowerCase();
    if (!target) return null;

    const markers = this._collectMarkers(lines);
    const entry = markers.find((m) => m.name === target);
    if (!entry) return null;

    let pos = 0;
    for (let i = 0; i < entry.idx; i++) {
      pos += lines[i].length + 1;
    }

    const markerEnd = pos + lines[entry.idx].length;
    const hasTrailingNewline = entry.idx < lines.length - 1;
    return { from: pos, to: hasTrailingNewline ? markerEnd + 1 : markerEnd };
  }

  /**
   * Remove an @area marker line from the markdown, preserving all content.
   * The content that followed the marker is absorbed into the preceding area.
   * Returns the updated markdown string (does NOT write to the editor).
   * Returns null if the area marker was not found.
   *
   * @param {string} markdown
   * @param {string} areaName
   * @returns {string|null}
   */
  deleteArea(markdown, areaName) {
    const text = String(markdown || "").replace(/\r\n?/g, "\n");
    const lines = text.split("\n");
    const target = String(areaName || "")
      .trim()
      .toLowerCase();
    if (!target) return null;

    const markers = this._collectMarkers(lines);
    const entry = markers.find((m) => m.name === target);
    if (!entry) return null;

    lines.splice(entry.idx, 1);
    return lines.join("\n");
  }

  /**
   * Swap the content of an area with the content of the next area.
   * If the area is the last content column, wraps around to swap with the
   * first content column. Only the content lines are moved — the @area
   * markers stay in place.
   * Returns the updated markdown string (does NOT write to the editor).
   * Returns null if the area cannot be found.
   *
   * @param {string} markdown
   * @param {string} areaName
   * @returns {string|null}
   */
  swapAreas(markdown, areaName) {
    const text = String(markdown || "").replace(/\r\n?/g, "\n");
    const lines = text.split("\n");
    const target = String(areaName || "")
      .trim()
      .toLowerCase();
    if (!target) return null;

    const markers = this._collectMarkers(lines).filter(
      (m) => m.name !== "header" && m.name !== "footer" && m.name !== "title",
    );
    if (markers.length < 2) return null;
    const targetPos = markers.findIndex((m) => m.name === target);
    if (targetPos < 0) return null;

    // Determine next area — wrap around for the last one.
    const nextPos = (targetPos + 1) % markers.length;
    if (nextPos === targetPos) return null; // only one marker

    const current = markers[targetPos];
    const next = markers[nextPos];

    // Content ranges (between markers, excluding the markers themselves).
    const nextEndPos = (nextPos + 1) % markers.length;
    const nextEnd = nextEndPos === 0 ? lines.length : markers[nextEndPos].idx;

    // For wrap-around (last swaps with first), the layout is different:
    // current content is between current marker and the end of markers list,
    // next content is between first marker and second marker.
    if (nextPos === 0) {
      // Wrap-around case: last column swaps with first column.
      const afterLast = targetPos + 1 < markers.length ? markers[targetPos + 1].idx : lines.length;
      const firstContent = lines.slice(markers[0].idx + 1, markers[1]?.idx ?? lines.length);
      const lastContent = lines.slice(current.idx + 1, afterLast);

      // Replace first content and last content.
      const out = [...lines];
      // Replace content after first marker with last content.
      out.splice(markers[0].idx + 1, firstContent.length, ...lastContent);
      // Recalculate: after first splice, the last marker position may have shifted.
      const shift = lastContent.length - firstContent.length;
      out.splice(current.idx + 1 + shift, lastContent.length, ...firstContent);
      return out.join("\n");
    }

    // Normal case: adjacent columns.
    const currentContent = lines.slice(current.idx + 1, next.idx);
    const nextContent = lines.slice(next.idx + 1, nextEnd);

    const before = lines.slice(0, current.idx + 1);
    const after = lines.slice(nextEnd);

    return [...before, ...nextContent, lines[next.idx], ...currentContent, ...after].join("\n");
  }

  resolveAreaInsertPositionByRatio(markdown, areaName, ratioY = 1) {
    const text = String(markdown || "").replace(/\r\n?/g, "\n");
    const range = this.getAreaContentRange(text, areaName);
    const segment = text.slice(range.from, range.to);
    if (!segment.length) return range.from;

    const lines = segment.split("\n");
    const lineIndex = Math.max(
      0,
      Math.min(lines.length - 1, Math.floor((Number(ratioY) || 0) * lines.length)),
    );

    let offset = 0;
    for (let i = 0; i < lineIndex; i++) {
      offset += lines[i].length + 1;
    }
    return Math.min(range.to, range.from + offset);
  }

  /**
   * Collect @area markers from lines, respecting code fences.
   * Returns an array of { name, idx } sorted by line index.
   * @param {string[]} lines
   * @returns {{ name: string, idx: number }[]}
   */
  _collectMarkers(lines) {
    const markers = [];
    let inFence = false;
    let fenceMarker = null;

    for (let i = 0; i < lines.length; i++) {
      const fenceMatch = lines[i].match(/^\s*(```+|~~~+)\s*/);
      if (fenceMatch) {
        const marker = fenceMatch[1][0];
        if (!inFence) {
          inFence = true;
          fenceMarker = marker;
        } else if (fenceMarker === marker) {
          inFence = false;
          fenceMarker = null;
        }
      }

      if (!inFence) {
        const match = lines[i].match(MARKER_RE);
        if (match) {
          markers.push({ name: match[1].toLowerCase(), idx: i });
        }
      }
    }

    return markers;
  }
}
