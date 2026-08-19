<!-- variant: full -->

- A "line" counts as one paragraph, one bullet item, one table row, or one line of code:
  - `title-slide`: `@title` only (one or two short lines) and `@footer` only (one or two short lines). No `@main` content.
  - `focus`: `@main` should hold at most 8–11 lines. This layout uses a larger font, so be selective — a headline plus supporting points, a short code block, or a compact table.
  - `header-content`: `@header` is one line; `@main` should hold about 10–14 lines total. That budget is consumed by any combination of paragraphs, bullets, table rows, and code lines.
  - `two-column`: `@header` is one line; each column (`@main` and `@media`) should hold about 6–10 lines and be roughly balanced — neither column should be more than twice as tall as the other.
  - `media-span-left` / `media-span-right`: `@header` is one line; `@main` should hold about 8–12 lines; `@media` holds one image or one Mermaid diagram.
  - `full-image`: `@main` is just the full-bleed image; keep any text to a short caption (≤2 lines) or omit it.
- Dense elements consume the budget quickly: a code block, a table, or a Mermaid diagram each count as roughly their number of rendered lines. Use them singly, not stacked. If a code example is longer than ~10 lines, trim it or split it across slides.
- Long lists and tables may exceed a single column without being "too dense." When they do, use a multi-column text block (`::: text-block { column-count=N markdown=true } ... :::`) or a multi-column layout (`two-column`, `three-column`, `left-heavy`, `right-heavy`). For a `column-count=N` text block, the line budget for that content is multiplied by N. Do not trim or delete list items or table rows just to fit the per-area budget.

<!-- variant: compact -->

Rough per-area line budgets: `title-slide` `@title`/`@footer` one or two short lines each and no `@main` content, `header-content` `@main` ~10-13 lines, `focus` `@main` ~8-11 lines, `two-column` columns ~6-10 lines each, `media-span` `@main` ~8-12 lines, `full-image` `@main` is the full-bleed image with at most a short caption. A code block, table, or diagram counts as roughly its number of rendered lines. Long lists/tables can overflow a single column if placed in a multi-column text block (`::: text-block { column-count=N }`) or split across a multi-column layout; the budget for `column-count=N` content scales by N.
