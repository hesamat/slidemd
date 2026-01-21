# Authoring Examples and Recipes

These examples show common patterns when editing decks/deck.md. Slides are separated by `---`, and any text before the first `@area` marker flows into `@main`.

## Layout Presets

The system includes several built-in layout presets that you can reference by name:

| Preset | Description |
|--------|-------------|
| `focus` | Single main area, full width |
| `two-column` | Two equal columns (main, media) |
| `left-heavy` | Two columns with wider left side |
| `right-heavy` | Two columns with wider right side |
| `header-content` | Header, main content, footer (stacked) |
| `header-two-column` | Header, two columns (main, media), footer |
| `title-slide` | Single centered title area |
| `three-column` | Three equal columns |
| `sidebar-content` | Fixed sidebar (300px) + main content |
| `content-sidebar` | Main content + fixed sidebar (300px) |

## Basic Title Slide

```markdown
layout: title-slide
background: linear-gradient(135deg, #eae4f0 0%, #f9fcfe 100%)
align: center

@title

# Loops & Arrays in C
## COMP 5758 – Week 2
### Mo Parsa
```

## Basic Two-Column Slide

Using the `header-two-column` preset:

```markdown
layout: header-two-column

@header
## Where we are in the Course

@main
### Last Week (Week 1)
- C toolchain: **edit → compile → link → run**
- Basic syntax, types, `printf`/`scanf`
- **Decision making:** `if`, `else`, `switch`
- Debugging fundamentals

@media
### Coming Up
- **Week 3:** Functions & Call Stack
- **Week 4:** Pointers
```

## Header + Single Content Area

```markdown
layout: header-content

@header
## By the end of today you can...

@main
- Use **`switch`** statements effectively and avoid fall-through bugs
- Safely write **`while`**, **`for`**, and **`do-while`** loops in C
- Declare, initialize, and iterate over **arrays**
```

## Custom Layouts (CSS Grid)

You can define custom layouts using CSS grid template syntax. The format is:

```
layout: "row1" "row2" ... / column-sizes
```

- **Rows**: One or more quoted strings; each string is a grid row. Use spaces between area names and `.` for empty cells.
- **Columns**: Everything after the `/` becomes `grid-template-columns`. If omitted, defaults to `1fr`.
- **Row sizing**: You can optionally add a size after each row string (before the next row or `/`).
- Area names are case-sensitive in CSS; `@area` markers are normalized to lowercase.

### Custom Layout with Row Sizes

```markdown
layout: "header" auto "main" 1fr / 800px

@header
## Narrow Content Layout

@main
Content constrained to 800px width, centered.
```

### Three-Column Layout with Spacer

```markdown
layout: "header header header" auto "main . media" minmax(0, 1fr) / 1fr 48px 1fr

@header
## Spacer Column Example

@main
Left content

@media
Right content
```

The `.` represents an empty cell for spacing.

### Header + Two Columns (Manual Definition)

```markdown
layout: "header header" "main media" / 1fr 1fr

@header
## Custom Two Column

@main
- Point A
- Point B

@media
![diagram](images/diagram.png)
```

## Slide Backgrounds

Use `background:` for per-slide backgrounds. Supports gradients, images, and solid colors.

```markdown
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)
layout: title-slide
align: center

@main
# Gradient Background
```

```markdown
background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)

@header
## Activity Slide

@main
Content with a subtle gradient background
```

```markdown
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

## Content Alignment

Use `align: center` to center content in slides with a single main area:

```markdown
layout: focus
align: center

@main
# Centered Content

This content is vertically and horizontally centered.
```

## Hidden Slides

Mark a slide as hidden to skip it during normal navigation. Add `?showHidden=1` to the URL to include them when reviewing.

```markdown
layout: header-content
hidden: true

@header
## Instructor Notes Slide

@main
This slide will not appear in the deck by default.
```

## Speaker Notes

Add HTML comments at the top of a slide for speaker notes:

```markdown
layout: header-content
<!-- notes: Explain that loops are fundamental to programming -->

@header
## Loop Concepts

@main
Loops allow repeated execution of code blocks.
```

## Media Areas

Areas containing images, videos, or iframes are automatically styled with the `.media` class for proper sizing:

```markdown
layout: header-two-column

@header
## Diagram Example

@main
Explanation on the left side.

@media
![diagram](images/architecture.png)
```

## Activity Slides

A common pattern for activity/exercise slides:

```markdown
layout: "header" "main" / 1fr
background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)

@header
## 💻 Activity: Loop Patterns

@main
**Write `for` loops to produce each output:**

**1. Print:** `10 8 6 4 2 0`
```c
for (int i = ?; ?; ?) {
    printf("%d ", i);
}
```
```

## Tips and Best Practices

- **Keep every row the same number of cells**: When using custom layouts, ensure each row has the same count of area names or dots.
- **Use lowercase area names**: Area names are case-sensitive in CSS; `@area` markers are normalized to lowercase.
- **Named areas without content**: If a named area appears in the layout but no `@area` content is provided, it renders as an empty region.
- **Extra content areas**: If you provide `@area` content but forget to include it in the layout, it still renders but won't be positioned as expected.
- **Row sizing hints**: Content rows (containing main/media/left/right/secondary/content/sidebar) default to `minmax(0, 1fr)`, while header/footer rows default to `auto`.
