/**
 * GridResizer
 * Injects draggable handles between CSS Grid column and row tracks in the live
 * slide preview.  When the user drags a handle the new proportions are written
 * back into the slide markdown as a custom grid layout spec.
 *
 * Only tracks whose sizes are expressed in `fr` units (or `minmax(0,1fr)`) get
 * handles.  Fixed `px` and `auto` tracks are left alone.
 */

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

    // The slide DOM can be reused in edit mode (e.g. navigating without rerender),
    // so clear any previous injected handles before attaching fresh ones.
    slideEl.querySelectorAll('.grid-resize-handle').forEach((el) => el.remove());

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

function _getGridElement(slideEl) {
    return slideEl.querySelector('.slide__grid') || slideEl.firstElementChild || slideEl;
}

function _parsePxList(value) {
    return _parseTrackList(value).map(token => {
        const match = token.raw.match(/^(-?[\d.]+)px$/i);
        return match ? parseFloat(match[1]) : 0;
    });
}

function _getRenderedTrackMetrics(slideEl, scale = 1) {
    const grid = _getGridElement(slideEl);
    const gridStyle = window.getComputedStyle(grid);
    const slideRect = slideEl.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const normalizedScale = scale > 0 ? scale : 1;

    return {
        // DOMRect values are in viewport pixels (post-transform). Convert to
        // slide design-space coordinates so absolute handle positions align.
        leftOffset: (gridRect.left - slideRect.left) / normalizedScale,
        topOffset: (gridRect.top - slideRect.top) / normalizedScale,
        columns: _parsePxList(gridStyle.gridTemplateColumns),
        rows: _parsePxList(gridStyle.gridTemplateRows),
        columnGap: parseFloat(gridStyle.columnGap || gridStyle.gap || '0') || 0,
        rowGap: parseFloat(gridStyle.rowGap || gridStyle.gap || '0') || 0,
        grid,
    };
}

function _getBoundaryPositions(sizes, gap) {
    const positions = [0];
    let cursor = 0;
    for (let i = 0; i < sizes.length; i++) {
        cursor += sizes[i];
        positions.push(cursor);
        if (i < sizes.length - 1) {
            cursor += gap;
        }
    }
    return positions;
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
    if (colTracks.length < 2) return;

    const metrics = _getRenderedTrackMetrics(slideEl, scale);
    const boundaries = _getBoundaryPositions(metrics.columns, metrics.columnGap);
    const totalGridHeight = boundaries.length ? (_getBoundaryPositions(metrics.rows, metrics.rowGap).at(-1) || 0) : 0;

    for (let i = 0; i < colTracks.length - 1; i++) {
        const xDesign = metrics.leftOffset + boundaries[i + 1];
        const leftTrackIdx = i;
        const rightTrackIdx = i + 1;

        const handle = document.createElement('div');
        handle.className = 'grid-resize-handle grid-resize-handle--col';
        handle.setAttribute('aria-label', 'Resize column');
        handle.style.left = `${xDesign}px`;
        handle.style.top = `${metrics.topOffset}px`;
        handle.style.height = `${totalGridHeight}px`;
        slideEl.appendChild(handle);

        _attachColDragLogic(handle, slideEl, colTracks, leftTrackIdx, rightTrackIdx, scale, layoutInfo, onLayoutChange, metrics);
    }
}

function _attachColDragLogic(handle, slideEl, colTracks, leftIdx, rightIdx, scale, layoutInfo, onLayoutChange, metrics) {
    let startClientX = 0;
    let startLeftPx = 0;
    let startRightPx = 0;
    let totalWidth = 0;

    const onMouseMove = (e) => {
        const deltaDesign = (e.clientX - startClientX) / scale;
        const newLeftPx = Math.max(MIN_TRACK_PX, startLeftPx + deltaDesign);
        const newRightPx = Math.max(MIN_TRACK_PX, startRightPx - deltaDesign);

        const newTracks = _buildResizedTrackList(colTracks, leftIdx, rightIdx, newLeftPx, newRightPx, totalWidth);

        // Live visual update: set the column template directly on the slide grid
        const slideGrid = _getGridElement(slideEl);
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
        const newTracks = _buildResizedTrackList(colTracks, leftIdx, rightIdx, newLeftPx, newRightPx, totalWidth);

        onLayoutChange({ cols: newTracks.join(' '), rows: null });
    };

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        startClientX = e.clientX;

        const trackWidths = metrics.columns;
        startLeftPx = trackWidths[leftIdx] ?? (DESIGN_SIZE.width / colTracks.length);
        startRightPx = trackWidths[rightIdx] ?? (DESIGN_SIZE.width / colTracks.length);
        totalWidth = startLeftPx + startRightPx;

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
    if (rowTracks.length < 2) return;

    const metrics = _getRenderedTrackMetrics(slideEl, scale);
    const boundaries = _getBoundaryPositions(metrics.rows, metrics.rowGap);
    const totalGridWidth = (_getBoundaryPositions(metrics.columns, metrics.columnGap).at(-1) || 0);

    for (let i = 0; i < rowTracks.length - 1; i++) {
        const yDesign = metrics.topOffset + boundaries[i + 1];
        const topTrackIdx = i;
        const bottomTrackIdx = i + 1;

        const handle = document.createElement('div');
        handle.className = 'grid-resize-handle grid-resize-handle--row';
        handle.setAttribute('aria-label', 'Resize row');
        handle.style.top = `${yDesign}px`;
        handle.style.left = `${metrics.leftOffset}px`;
        handle.style.width = `${totalGridWidth}px`;
        slideEl.appendChild(handle);

        _attachRowDragLogic(handle, slideEl, rowTracks, topTrackIdx, bottomTrackIdx, scale, layoutInfo, onLayoutChange, metrics);
    }
}

function _attachRowDragLogic(handle, slideEl, rowTracks, topIdx, bottomIdx, scale, layoutInfo, onLayoutChange, metrics) {
    let startClientY = 0;
    let startTopPx = 0;
    let startBottomPx = 0;
    let totalHeight = 0;

    const onMouseMove = (e) => {
        const deltaDesign = (e.clientY - startClientY) / scale;
        const newTopPx = Math.max(MIN_TRACK_PX, startTopPx + deltaDesign);
        const newBottomPx = Math.max(MIN_TRACK_PX, startBottomPx - deltaDesign);

        const newTracks = _buildResizedTrackList(rowTracks, topIdx, bottomIdx, newTopPx, newBottomPx, totalHeight);

        const slideGrid = _getGridElement(slideEl);
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
        const newTracks = _buildResizedTrackList(rowTracks, topIdx, bottomIdx, newTopPx, newBottomPx, totalHeight);

        onLayoutChange({ cols: null, rows: newTracks.join(' ') });
    };

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        startClientY = e.clientY;

        const trackHeights = metrics.rows;
        startTopPx = trackHeights[topIdx] ?? (DESIGN_SIZE.height / rowTracks.length);
        startBottomPx = trackHeights[bottomIdx] ?? (DESIGN_SIZE.height / rowTracks.length);
        totalHeight = startTopPx + startBottomPx;

        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
        slideEl.style.pointerEvents = 'none';
        handle.style.pointerEvents = 'auto';

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

function _buildResizedTrackList(tracks, firstIdx, secondIdx, firstPx, secondPx, totalPx) {
    const pairTotalPx = Math.max(1, totalPx || (firstPx + secondPx));
    const firstTrack = tracks[firstIdx];
    const secondTrack = tracks[secondIdx];

    // Keep fr semantics only when both resized tracks are fr-based.
    if (firstTrack?.isFr && secondTrack?.isFr) {
        const pairFrBase = (firstTrack.frValue + secondTrack.frValue) || 1;
        const firstFr = (firstPx / pairTotalPx) * pairFrBase;
        const secondFr = (secondPx / pairTotalPx) * pairFrBase;
        return tracks.map((track, index) => {
            if (index === firstIdx) return `${firstFr.toFixed(4)}fr`;
            if (index === secondIdx) return `${secondFr.toFixed(4)}fr`;
            return track.raw;
        });
    }

    return tracks.map((track, index) => {
        if (index === firstIdx) return `${Math.round(firstPx)}px`;
        if (index === secondIdx) return `${Math.round(secondPx)}px`;
        return track.raw;
    });
}
