/**
 * LayoutParser
 * Parses layout specifications and generates CSS grid templates for slide areas. Supports preset layouts and custom grid definitions for flexible slide design.
 */
// Layout parsing and grid generation
import { safeString } from "../core/utils.js";
import { LayoutData } from "./layout-data.js";

export class LayoutParser {
  static resolvePreset(layoutSpec) {
    const key = safeString(layoutSpec).trim().toLowerCase();
    if (!key) return layoutSpec;
    return LayoutData.getGridTemplate(key) || layoutSpec;
  }

  static parse(layoutSpec, { fallbackAreas = ["main"] } = {}) {
    const spec = safeString(layoutSpec).trim();
    if (!spec) {
      return {
        gridTemplateAreas: '"main"',
        gridTemplateColumns: "1fr",
        gridTemplateRows: "minmax(0, 1fr)",
        orderedAreas: [...new Set(fallbackAreas)],
      };
    }

    const parts = spec.split("/");
    const left = safeString(parts[0]).trim();
    const cols = safeString(parts.slice(1).join("/")).trim() || "1fr";

    const rowMatches = left.match(/"[^"]*"|'[^']*'/g) || [];
    const rows = rowMatches.map((q) => (q.startsWith("'") ? `"${q.slice(1, -1)}"` : q));
    const rowsRaw = rows.map((q) => q.slice(1, -1));

    // Determine which areas appear in every row. These are treated as
    // full-height spanning areas, so a header/footer row can still be auto.
    const rowAreaNames = rowsRaw.map((r) =>
      r
        .split(/\s+/)
        .filter(Boolean)
        .filter((n) => !/^\.+$/.test(n)),
    );
    const areaRowCounts = new Map();
    for (const names of rowAreaNames) {
      for (const n of [...new Set(names)]) {
        areaRowCounts.set(n, (areaRowCounts.get(n) || 0) + 1);
      }
    }
    const fullSpanAreas = new Set();
    for (const [n, c] of areaRowCounts) {
      // An area only spans the full height if it appears in more than one row.
      if (c === rowAreaNames.length && rowAreaNames.length > 1) fullSpanAreas.add(n);
    }

    const rowSizes = [];
    let hasExplicitRowSizes = false;
    for (let i = 0; i < rowMatches.length; i++) {
      const afterRow = left.indexOf(rowMatches[i]) + rowMatches[i].length;
      const nextRowIdx = i + 1 < rowMatches.length ? left.indexOf(rowMatches[i + 1]) : left.length;
      const between = left.slice(afterRow, nextRowIdx).trim();

      if (between && !between.startsWith('"') && !between.startsWith("'")) {
        // Explicit size provided
        rowSizes.push(between);
        hasExplicitRowSizes = true;
      } else {
        // Header/footer/title rows stay compact (auto). A full-height spanning
        // area (present in every row) does not force an otherwise compact row
        // to grow.
        const cellNames = rowAreaNames[i] || [];
        const isAuto =
          cellNames.length > 0 &&
          cellNames.every((n) => /^(header|footer|title)$/i.test(n) || fullSpanAreas.has(n));
        rowSizes.push(isAuto ? "auto" : "minmax(0, 1fr)");
      }
    }

    const gridTemplateAreas = rows.length ? rows.join(" ") : '"main"';
    const gridTemplateRows = rowSizes.length ? rowSizes.join(" ") : "minmax(0, 1fr)";

    const orderedAreas = [];
    const areaNameRe = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
    for (const row of rowsRaw) {
      const names = row.split(/\s+/).filter(Boolean);
      for (const name of names) {
        // In CSS grid-template-areas, '.' means an empty cell.
        // Avoid generating a corresponding slide area for it.
        if (/^\.+$/.test(name)) continue;
        if (!areaNameRe.test(name)) continue;
        if (!orderedAreas.includes(name)) orderedAreas.push(name);
      }
    }

    return {
      gridTemplateAreas,
      gridTemplateColumns: cols,
      gridTemplateRows,
      rowSizes,
      hasExplicitRowSizes,
      orderedAreas: orderedAreas.length ? orderedAreas : [...new Set(fallbackAreas)],
    };
  }
}
