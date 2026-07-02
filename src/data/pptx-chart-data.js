/**
 * Chart data formatting for PPTX extraction.
 *
 * Builds structured data from chart series for use in
 * markdown table formatting and plain-text output.
 */

/**
 * Build structured chart data (headers + rows) from extracted chart data.
 * Shared by toPlainText and markdown chart formatting.
 * @param {import('./pptx-extractor.js').ChartData[]} chartData
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function buildChartDataRows(chartData) {
  if (!chartData?.length) return { headers: [], rows: [] };

  const allXIndices = new Set();
  for (const series of chartData) {
    for (const point of series.values) {
      allXIndices.add(point.x);
    }
  }
  const sortedX = Array.from(allXIndices).sort((a, b) => a - b);

  const headers = ["Category", ...chartData.map((s) => String(s.key))];
  const rows = [];
  for (const x of sortedX) {
    const firstSeries = chartData[0];
    const category = firstSeries?.xlabels?.[x] ?? String(x);
    const values = chartData.map((s) => {
      const point = s.values.find((p) => p.x === x);
      return point?.y !== undefined ? String(point.y) : "";
    });
    rows.push([category, ...values]);
  }
  return { headers, rows };
}
