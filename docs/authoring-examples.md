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

## HTML Elements and Inline Styling

You can use HTML elements and inline CSS styles within your markdown content for additional formatting flexibility:

### Basic HTML Elements

```markdown
layout: header-content

@header
## HTML Elements Demo

@main
<div style="padding: 1rem; background: #f0f0f0; border-radius: 8px;">
  <p style="color: #e74c3c; font-weight: bold;">This is a styled paragraph</p>
  <p style="color: #27ae60;">This is another styled paragraph</p>
</div>
```

### Styled Lists and Tables

```markdown
layout: header-content

@header
## Styled Content

@main
<table style="width: 100%; border-collapse: collapse;">
  <tr style="background: #3498db; color: white;">
    <th style="padding: 12px; text-align: left;">Feature</th>
    <th style="padding: 12px; text-align: left;">Status</th>
  </tr>
  <tr style="background: #ecf0f1;">
    <td style="padding: 12px;">Markdown Support</td>
    <td style="padding: 12px; color: green;">✓ Built-in</td>
  </tr>
  <tr style="background: #ffffff;">
    <td style="padding: 12px;">HTML Styling</td>
    <td style="padding: 12px; color: green;">✓ Supported</td>
  </tr>
</table>
```

### Callout Boxes

```markdown
layout: header-content

@header
## Callout Examples

@main
<div style="background: #e8f4fd; border-left: 4px solid #2196f3; padding: 16px; margin: 16px 0;">
  <strong>Note:</strong> This is an informational callout box using inline styles.
</div>

<div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 16px; margin: 16px 0;">
  <strong>Warning:</strong> This is a warning callout box.
</div>

<div style="background: #d4edda; border-left: 4px solid #28a745; padding: 16px; margin: 16px 0;">
  <strong>Success:</strong> This is a success callout box.
</div>
```

### Styled Code Blocks

```markdown
layout: header-content

@header
## Code with Custom Styling

@main
<div style="background: #2d2d2d; color: #f8f8f2; padding: 16px; border-radius: 8px; font-family: monospace;">
  <pre style="margin: 0;"><code style="color: #a6e22e;">int main() {
    printf("Hello, World!");
    return 0;
}</code></pre>
</div>
```

### Flexbox Layouts

```markdown
layout: header-content

@header
## Flexbox Layouts

@main
<div style="display: flex; gap: 16px; align-items: center;">
  <div style="flex: 1; background: #e74c3c; color: white; padding: 24px; border-radius: 8px; text-align: center;">
    <h3 style="margin: 0 0 8px 0;">Item 1</h3>
    <p style="margin: 0;">First item</p>
  </div>
  <div style="flex: 1; background: #3498db; color: white; padding: 24px; border-radius: 8px; text-align: center;">
    <h3 style="margin: 0 0 8px 0;">Item 2</h3>
    <p style="margin: 0;">Second item</p>
  </div>
  <div style="flex: 1; background: #2ecc71; color: white; padding: 24px; border-radius: 8px; text-align: center;">
    <h3 style="margin: 0 0 8px 0;">Item 3</h3>
    <p style="margin: 0;">Third item</p>
  </div>
</div>
```

### Inline Styling with Markdown

```markdown
layout: header-content

@header
## Mixed Markdown and HTML

@main
Regular markdown with <span style="color: #e74c3c; font-weight: bold;">red bold text</span>

and <span style="background: #fff3cd; padding: 4px 8px; border-radius: 4px;">highlighted content</span>.

- List item with <span style="color: #9b59b6;">purple text</span>
- Another item with <strong style="text-decoration: underline;">underlined bold</strong>
```

## Tips and Best Practices

- **Keep every row the same number of cells**: When using custom layouts, ensure each row has the same count of area names or dots.
- **Use lowercase area names**: Area names are case-sensitive in CSS; `@area` markers are normalized to lowercase.
- **Named areas without content**: If a named area appears in the layout but no `@area` content is provided, it renders as an empty region.
- **Extra content areas**: If you provide `@area` content but forget to include it in the layout, it still renders but won't be positioned as expected.
- **Row sizing hints**: Content rows (containing main/media/left/right/secondary/content/sidebar) default to `minmax(0, 1fr)`, while header/footer rows default to `auto`.
