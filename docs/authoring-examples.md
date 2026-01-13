# Authoring Examples and Recipes

These examples show common patterns when editing decks/deck.md. Slides are separated by `---`, and any text before the first `@area` marker flows into `@main`.

## Basic Two-Column Slide

```markdown
layout: "header header" "main media" / 1fr 1fr
<!-- notes: Say the quiet part out loud here -->

@header
## Two Column Example

@main
- Point A
- Point B

@media
![diagram](images/waterfall.png)
```

## Hidden Slides

Mark a slide as hidden to skip it during normal navigation. Add `?showHidden=1` to the URL to include them when reviewing.

```markdown
layout: header-two-column
hidden: true

@header
## Instructor Notes Slide

@main
This slide will not appear in the deck by default.
```

## Custom Layouts (CSS Grid)

`layout:` sets `grid-template-areas`, `grid-template-columns`, and `grid-template-rows` on the slide grid.

- Rows: one or more quoted strings; each string is a grid row. Use spaces between area names and `.` for empty cells.
- Optional row sizes: place a size after a row (before the next row or before the `/`). If omitted, the runtime guesses (`minmax(0, 1fr)` for content rows, `auto` for others).
- Columns: everything after the first `/` becomes `grid-template-columns`. If omitted, columns default to `1fr`.
- Area names are case-sensitive in CSS; `@area` markers are normalized to lowercase. Prefer lowercase names in layout strings.

### Examples

**Header + two columns + footer**

```markdown
layout: "header header" auto "main media" minmax(0, 1fr) "footer footer" auto / 1fr 1fr

@header
## Custom Header + Two Column

@main
- Left side

@media
![img](images/waterfall.png)

@footer
Small footer text
```

**Fixed-width sidebar + content**

```markdown
layout: "header header" auto "sidebar main" minmax(0, 1fr) / 320px 1fr

@header
## Sidebar Layout

@sidebar
- Agenda
- Links

@main
Content here
```

**Spacer column with empty cell**

```markdown
layout: "header header header" auto "main . media" minmax(0, 1fr) / 1fr 48px 1fr

@header
## Spacer Column Example

@main
Left content

@media
Right content
```

Tips:
- Keep every row the same number of cells (same count of names or dots).
- If a named area appears in the layout but no `@area` content is provided, it renders as an empty region (useful for reserved space).
- If you provide `@area` content but forget to include that area name in the layout, it still renders but will not be positioned as expected.

## Slide Backgrounds

Use `background:` for per-slide backgrounds; local images are inlined during build.

```markdown
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)

@header
## Gradient Background

@main
Content here...

---

background: url(images/hero.jpg) center/cover

@header
## Image Background

@main
Content here...

---

background: #1a1a1a
theme: dark

@header
## Solid Color

@main
Light text on dark background
```

## Theming

Set `theme: light` or `theme: dark` to override the default theme for a slide.

```markdown
theme: dark

@header
## Dark Slide

@main
This slide uses light text on dark background

---

theme: light

@header
## Light Slide

@main
This slide uses dark text on light background
```
