/**
 * LayoutParser
 * Parses layout specifications and generates CSS grid templates for slide areas. Supports preset layouts and custom grid definitions for flexible slide design.
 */
// Layout parsing and grid generation
import { safeString } from "./utils.js";
import { LayoutData } from "./layout-data.js";

export class LayoutParser {
    static PRESETS = LayoutData.getPresets();

    static resolvePreset(layoutSpec) {
        const key = safeString(layoutSpec).trim().toLowerCase();
        return this.PRESETS[key] || layoutSpec;
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

        const rowMatches = left.match(/\"[^\"]*\"|'[^']*'/g) || [];
        const rows = rowMatches.map((q) => (q.startsWith("'") ? `"${q.slice(1, -1)}"` : q));
        const rowsRaw = rows.map((q) => q.slice(1, -1));

        const rowSizes = [];
        for (let i = 0; i < rowMatches.length; i++) {
            const afterRow = left.indexOf(rowMatches[i]) + rowMatches[i].length;
            const nextRowIdx = i + 1 < rowMatches.length ? left.indexOf(rowMatches[i + 1]) : left.length;
            const between = left.slice(afterRow, nextRowIdx).trim();

            if (between && !between.startsWith('"') && !between.startsWith("'")) {
                // Explicit size provided
                rowSizes.push(between);
            } else {
                // Determine size based on area names in this row
                const rowContent = rowsRaw[i] || "";
                const isContentRow = /\b(main|media|left|right|secondary|content|sidebar)\b/i.test(rowContent);
                // Header/footer rows should size to content; main content rows grow
                rowSizes.push(isContentRow ? "minmax(0, 1fr)" : "auto");
            }
        }

        const gridTemplateAreas = rows.length ? rows.join(" ") : '"main"';
        const gridTemplateRows = rowSizes.length ? rowSizes.join(" ") : "minmax(0, 1fr)";

        const orderedAreas = [];
        for (const row of rowsRaw) {
            const names = row.split(/\s+/).filter(Boolean);
            for (const name of names) {
                // In CSS grid-template-areas, '.' means an empty cell.
                // Avoid generating a corresponding slide area for it.
                if (/^\.+$/.test(name)) continue;
                if (!orderedAreas.includes(name)) orderedAreas.push(name);
            }
        }

        return {
            gridTemplateAreas,
            gridTemplateColumns: cols,
            gridTemplateRows,
            orderedAreas: orderedAreas.length ? orderedAreas : [...new Set(fallbackAreas)],
        };
    }
}
