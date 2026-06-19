/**
 * GridResizer
 * Injects draggable handles between CSS Grid column and row tracks in the live
 * slide preview.  When the user drags a handle the new proportions are written
 * back into the slide markdown as a custom grid layout spec.
 *
 * Only tracks whose sizes are expressed in `fr` units (or `minmax(0,1fr)`) get
 * handles.  Fixed `px` and `auto` tracks are left alone.
 */

import { MarkdownParser } from '../data/markdown-parser.js';
import { DESIGN_SIZE } from '../core/utils.js';

// Minimum track size in design-space pixels to prevent collapsing a track to zero.
const MIN_TRACK_PX = 80;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Attach column and row resize handles to a rendered slide element.
 *
 * @param {HTMLElement} slideEl     - The `.slide` article element.
 * @param {object}      layoutInfo  - Output of `LayoutParser.parse()`.
 * @param {HTMLElement} stageEl     - `#deckStage` — carries `--stage-scale`.
 * @param {function}    onLayoutChange - Called with `{ cols, rows }` after drag.
 *                                       Either value may be `null` if unchanged.
 */
export function attachGridResizer(slideEl, layoutInfo, stageEl, onLayoutChange) {
    if (!slideEl || !layoutInfo) return;

    const colTracks = _parseTrackList(layoutInfo.gridTemplateColumns || '1fr');
    const rowTracks = _parseTrackList(layoutInfo.gridTemplateRows || 'minmax(0, 1fr)');
    const scale = _getScale(stageEl);

    _injectColumnHandles(slideEl, layoutInfo, colTracks, rowTracks, scale, onLayoutChange);
    _injectRowHandles(slideEl, layoutInfo, colTracks, rowTracks, scale, onLayoutChange);
}

/**
 * Reconstruct the full grid spec string from (possibly updated) column and row
 * track lists, interleaving quoted area rows with their row-size tokens.
 *
 * The output format is accepted by `LayoutParser.parse()`:
 *   `"header header" auto "main media" minmax(0,1fr) "footer footer" auto / 2fr 1fr`
 *
 * @param {object} layoutInfo  - Original `LayoutParser.parse()` result.
 * @param {string|null} newCols - Updated column track string, or null to keep current.
 * @param {string|null} newRows - Updated row track string, or null to keep current.
 * @returns {string} Full grid spec.
 */
export function buildLayoutSpec(layoutInfo, newCols, newRows) {
    const cols = newCols ?? layoutInfo.gridTemplateColumns ?? '1fr';
    const rows = newRows ?? layoutInfo.gridTemplateRows ?? 'minmax(0, 1fr)';

    // Split gridTemplateAreas into individual quoted row strings
    // e.g. '"header header" "main media"' → ['"header header"', '"main media"']
    const areaRowMatches = (layoutInfo.gridTemplateAreas || '"main"').match(/"[^"]*"|'[^']*'/g) || ['"main"'];

    // Split gridTemplateRows into per-row size tokens (handles minmax, fr, px, auto)
    const rowSizeTokens = _splitRowSizes(rows);

    // Interleave: "areaRow1" size1 "areaRow2" size2 ...
    const parts = [];
    for (let i = 0; i < areaRowMatches.length; i++) {
        parts.push(areaRowMatches[i]);
        if (i < rowSizeTokens.length) {
            parts.push(rowSizeTokens[i]);
        }
    }

    return `${parts.join(' ')} / ${cols}`;
}

/**
 * Replace (or insert) the `layout:` directive in a slide's markdown text.
 *
 * @param {string} markdown       - The slide's full markdown source.
 * @param {string} newLayoutValue - The new layout value (spec string or preset name).
 * @returns {string} Updated markdown with the `layout:` line replaced/inserted.
 */
export function updateLayoutDirective(markdown, newLayoutValue) {
    const parser = new MarkdownParser();
    const { markdown: stripped } = parser.extractDirective(markdown, 'layout');
    return `layout: ${newLayoutValue}\n${stripped}`;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Parse a CSS `grid-template-columns` / `grid-template-rows` string into an
 * array of track descriptors.
 *
 * @param {string} trackStr
 * @returns {{ raw: string, isFr: boolean, frValue: number }[]}
 */
function _parseTrackList(trackStr) {
    // Tokenize respecting nested parens (e.g. minmax(0, 1fr))
    const tokens = [];
    let depth = 0;
    let current = '';

    for (const ch of (trackStr || '').trim()) {
        if (ch === '(') { depth++; current += ch; }
        else if (ch === ')') { depth--; current += ch; }
        else if (ch === ' ' && depth === 0) {
            if (current) tokens.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    if (current.trim()) tokens.push(current.trim());

    return tokens.map(raw => {
        const frMatch = raw.match(/^([\d.]+)fr$/i);
        const isFr = !!frMatch;
        // minmax(0, Xfr) is also treated as a resizable fr track
        const minmaxFrMatch = !frMatch && raw.match(/^minmax\([^,]+,\s*([\d.]+)fr\s*\)$/i);
        const isMinmaxFr = !!minmaxFrMatch;
        return {
            raw,
            isFr: isFr || isMinmaxFr,
            frValue: frMatch ? parseFloat(frMatch[1]) : (minmaxFrMatch ? parseFloat(minmaxFrMatch[1]) : 0),
        };
    });
}

/**
 * Split a `gridTemplateRows` string into individual per-row size tokens,
 * handling `minmax(…)` which contains a space inside parens.
 */
function _splitRowSizes(rowsStr) {
    return _parseTrackList(rowsStr).map(t => t.raw);
}

/** Read `--stage-scale` CSS variable from the stage element. */
function _getScale(stageEl) {
    if (!stageEl) return 1;
    const val = parseFloat(stageEl.style.getPropertyValue('--stage-scale'));
    return isFinite(val) && val > 0 ? val : 1;
}

/**
 * Collect the unique left-edges of all `.slide__area` elements (in design px),
 * sorted ascending.  These correspond to column-track boundaries.
 */
function _collectColumnBoundaries(slideEl, scale) {
    const slideRect = slideEl.getBoundingClientRect();
    const boundaries = new Set();
    boundaries.add(0);

    slideEl.querySelectorAll('.slide__area').forEach(area => {
        const r = area.getBoundingClientRect();
        const leftDesign = Math.round((r.left - slideRect.left) / scale);
        const rightDesign = Math.round((r.right - slideRect.left) / scale);
        if (leftDesign > 0) boundaries.add(leftDesign);
        if (rightDesign < DESIGN_SIZE.width) boundaries.add(rightDesign);
    });

    boundaries.add(DESIGN_SIZE.width);
    return [...boundaries].sort((a, b) => a - b);
}

/**
 * Collect the unique top-edges of all `.slide__area` elements (in design px),
 * sorted ascending.  These correspond to row-track boundaries.
 */
function _collectRowBoundaries(slideEl, scale) {
    const slideRect = slideEl.getBoundingClientRect();
    const boundaries = new Set();
    boundaries.add(0);

    slideEl.querySelectorAll('.slide__area').forEach(area => {
        const r = area.getBoundingClientRect();
        const topDesign = Math.round((r.top - slideRect.top) / scale);
        const bottomDesign = Math.round((r.bottom - slideRect.top) / scale);
        if (topDesign > 0) boundaries.add(topDesign);
        if (bottomDesign < DESIGN_SIZE.height) boundaries.add(bottomDesign);
    });

    boundaries.add(DESIGN_SIZE.height);
    return [...boundaries].sort((a, b) => a - b);
}

// ─── Column handles ───────────────────────────────────────────────────────────

function _injectColumnHandles(slideEl, layoutInfo, colTracks, rowTracks, scale, onLayoutChange) {
    const totalFr = colTracks.reduce((s, t) => s + (t.isFr ? t.frValue : 0), 0);
    if (totalFr === 0) return; // No fr columns — nothing to resize

    const boundaries = _collectColumnBoundaries(slideEl, scale);

    // Internal boundaries only (not 0 or full width)
    const internal = boundaries.slice(1, -1);

    // For each internal boundary, determine the column index it falls between
    internal.forEach((xDesign, gapIdx) => {
        const leftTrackIdx = gapIdx;       // track to the left of this gap
        const rightTrackIdx = gapIdx + 1;  // track to the right

        // Only inject a handle if BOTH adjacent tracks are fr-based
        const leftTrack = colTracks[leftTrackIdx];
        const rightTrack = colTracks[rightTrackIdx];
        if (!leftTrack?.isFr || !rightTrack?.isFr) return;

        const handle = document.createElement('div');
        handle.className = 'grid-resize-handle grid-resize-handle--col';
        handle.setAttribute('aria-label', 'Resize column');
        handle.style.left = `${xDesign}px`;
        slideEl.appendChild(handle);

        _attachColDragLogic(handle, slideEl, colTracks, leftTrackIdx, rightTrackIdx, scale, layoutInfo, onLayoutChange);
    });
}

function _attachColDragLogic(handle, slideEl, colTracks, leftIdx, rightIdx, scale, layoutInfo, onLayoutChange) {
    let startClientX = 0;
    let startLeftPx = 0;
    let startRightPx = 0;
    let totalWidth = 0;

    const onMouseMove = (e) => {
        const deltaDesign = (e.clientX - startClientX) / scale;
        const newLeftPx = Math.max(MIN_TRACK_PX, startLeftPx + deltaDesign);
        const newRightPx = Math.max(MIN_TRACK_PX, startRightPx - deltaDesign);

        // Recompute fr values proportionally
        const totalFr = colTracks.reduce((s, t) => s + (t.isFr ? t.frValue : 0), 0);

        const newLeftFr = (newLeftPx / totalWidth) * totalFr;
        const newRightFr = (newRightPx / totalWidth) * totalFr;

        const newTracks = colTracks.map((t, i) => {
            if (i === leftIdx) return `${newLeftFr.toFixed(4)}fr`;
            if (i === rightIdx) return `${newRightFr.toFixed(4)}fr`;
            return t.raw;
        });

        // Live visual update: set the column template directly on the slide grid
        const slideGrid = slideEl.querySelector('.slide__grid') || slideEl.firstElementChild;
        if (slideGrid) slideGrid.style.gridTemplateColumns = newTracks.join(' ');
    };

    const onMouseUp = (e) => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        slideEl.style.pointerEvents = '';

        const deltaDesign = (e.clientX - startClientX) / scale;
        const newLeftPx = Math.max(MIN_TRACK_PX, startLeftPx + deltaDesign);
        const newRightPx = Math.max(MIN_TRACK_PX, startRightPx - deltaDesign);
        const totalFr = colTracks.reduce((s, t) => s + (t.isFr ? t.frValue : 0), 0);

        const newTracks = colTracks.map((t, i) => {
            if (i === leftIdx) return `${((newLeftPx / totalWidth) * totalFr).toFixed(4)}fr`;
            if (i === rightIdx) return `${((newRightPx / totalWidth) * totalFr).toFixed(4)}fr`;
            return t.raw;
        });

        onLayoutChange({ cols: newTracks.join(' '), rows: null });
    };

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        startClientX = e.clientX;

        // Measure current rendered widths of the two tracks in design-px
        const areas = slideEl.querySelectorAll('.slide__area');
        const slideRect = slideEl.getBoundingClientRect();

        // Group areas by column-index by examining their left-edge position
        const colBoundaries = _collectColumnBoundaries(slideEl, scale);
        totalWidth = DESIGN_SIZE.width - colBoundaries[0]; // should be ~1920

        // Estimate each track's rendered width from boundaries
        const trackWidths = [];
        for (let i = 0; i < colBoundaries.length - 1; i++) {
            trackWidths.push(colBoundaries[i + 1] - colBoundaries[i]);
        }

        startLeftPx = trackWidths[leftIdx] ?? (DESIGN_SIZE.width / colTracks.length);
        startRightPx = trackWidths[rightIdx] ?? (DESIGN_SIZE.width / colTracks.length);
        totalWidth = colBoundaries[colBoundaries.length - 1] - colBoundaries[0];

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        slideEl.style.pointerEvents = 'none';
        handle.style.pointerEvents = 'auto';

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

// ─── Row handles ──────────────────────────────────────────────────────────────

function _injectRowHandles(slideEl, layoutInfo, colTracks, rowTracks, scale, onLayoutChange) {
    // Count fr-based rows; auto/minmax rows are also allowed (we measure them at drag start)
    // We only skip if there's only a single row track
    if (rowTracks.length < 2) return;

    const boundaries = _collectRowBoundaries(slideEl, scale);
    const internal = boundaries.slice(1, -1);

    internal.forEach((yDesign, gapIdx) => {
        const topTrackIdx = gapIdx;
        const bottomTrackIdx = gapIdx + 1;

        // Both adjacent tracks need to be resizable (fr or minmax-fr or auto/minmax are all ok;
        // only skip fixed-px tracks where the user set an explicit pixel height)
        const topTrack = rowTracks[topTrackIdx];
        const bottomTrack = rowTracks[bottomTrackIdx];
        if (!topTrack || !bottomTrack) return;

        // Skip if either track is a hard pixel value (e.g. "200px")
        const isHardPx = t => /^\d+px$/.test(t?.raw);
        if (isHardPx(topTrack) && isHardPx(bottomTrack)) return;

        const handle = document.createElement('div');
        handle.className = 'grid-resize-handle grid-resize-handle--row';
        handle.setAttribute('aria-label', 'Resize row');
        handle.style.top = `${yDesign}px`;
        slideEl.appendChild(handle);

        _attachRowDragLogic(handle, slideEl, rowTracks, topTrackIdx, bottomTrackIdx, scale, layoutInfo, onLayoutChange);
    });
}

function _attachRowDragLogic(handle, slideEl, rowTracks, topIdx, bottomIdx, scale, layoutInfo, onLayoutChange) {
    let startClientY = 0;
    let startTopPx = 0;
    let startBottomPx = 0;
    let totalHeight = 0;

    const onMouseMove = (e) => {
        const deltaDesign = (e.clientY - startClientY) / scale;
        const newTopPx = Math.max(MIN_TRACK_PX, startTopPx + deltaDesign);
        const newBottomPx = Math.max(MIN_TRACK_PX, startBottomPx - deltaDesign);

        // Convert to fr relative to total slide height
        const totalFrRows = _totalFrRows(rowTracks);
        const newTopFr = (newTopPx / totalHeight) * totalFrRows;
        const newBottomFr = (newBottomPx / totalHeight) * totalFrRows;

        const newTracks = rowTracks.map((t, i) => {
            if (i === topIdx) return `${newTopFr.toFixed(4)}fr`;
            if (i === bottomIdx) return `${newBottomFr.toFixed(4)}fr`;
            return t.raw;
        });

        const slideGrid = slideEl.querySelector('.slide__grid') || slideEl.firstElementChild;
        if (slideGrid) slideGrid.style.gridTemplateRows = newTracks.join(' ');
    };

    const onMouseUp = (e) => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        slideEl.style.pointerEvents = '';

        const deltaDesign = (e.clientY - startClientY) / scale;
        const newTopPx = Math.max(MIN_TRACK_PX, startTopPx + deltaDesign);
        const newBottomPx = Math.max(MIN_TRACK_PX, startBottomPx - deltaDesign);
        const totalFrRows = _totalFrRows(rowTracks);

        const newTracks = rowTracks.map((t, i) => {
            if (i === topIdx) return `${((newTopPx / totalHeight) * totalFrRows).toFixed(4)}fr`;
            if (i === bottomIdx) return `${((newBottomPx / totalHeight) * totalFrRows).toFixed(4)}fr`;
            return t.raw;
        });

        onLayoutChange({ cols: null, rows: newTracks.join(' ') });
    };

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        startClientY = e.clientY;

        const rowBoundaries = _collectRowBoundaries(slideEl, scale);
        totalHeight = rowBoundaries[rowBoundaries.length - 1] - rowBoundaries[0];

        const trackHeights = [];
        for (let i = 0; i < rowBoundaries.length - 1; i++) {
            trackHeights.push(rowBoundaries[i + 1] - rowBoundaries[i]);
        }

        startTopPx = trackHeights[topIdx] ?? (DESIGN_SIZE.height / rowTracks.length);
        startBottomPx = trackHeights[bottomIdx] ?? (DESIGN_SIZE.height / rowTracks.length);

        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
        slideEl.style.pointerEvents = 'none';
        handle.style.pointerEvents = 'auto';

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

/** Sum of all fr values in a row track list; defaults to 1 if none. */
function _totalFrRows(rowTracks) {
    const sum = rowTracks.reduce((s, t) => {
        if (t.isFr) return s + t.frValue;
        // minmax(0, 1fr) style — frValue is already set by _parseTrackList
        return s;
    }, 0);
    return sum > 0 ? sum : 1;
}
