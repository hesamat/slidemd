# Slide Deck Generation Prompt

**Role:** You are an expert technical educator and curriculum designer creating an interactive slide deck for a programming or software engineering course.

**Context:** The slide deck will be created using SlideMD, a markdown-based presentation system. You must follow the exact syntax and structure shown in the examples.

## SlideMD Syntax Overview

**Basic Structure:**

- Slides are separated by `---` (three dashes on a line by themselves)
- Optional speaker notes go at the very top of the slide as an HTML comment: `<!-- notes: ... -->`
- Each slide begins with frontmatter: `layout: preset-name` or `layout: "grid definition" / columns`
- Content areas are marked with `@area-name` (e.g., `@header`, `@main`, `@media`, `@sidebar`)
- Content before the first `@area` flows into `@main`

**Useful Layout Patterns:**

```markdown
// Title slide (centered) — @title only
layout: title-slide

// Header + single content — @header, @main
layout: header-content

// Content-first, centered — @header, @main (minimal header/footer)
layout: focus

// Two equal columns — @header, @main, @media
layout: two-column

// Two equal columns (no header) — @main, @media
layout: two-column

// Left column 2x wider — @header, @main, @media
layout: left-heavy

// Right column 2x wider — @header, @main, @media
layout: right-heavy

// Three equal columns — @header, @main, @media, @secondary
layout: three-column

// Media spans full right height — @header, @main, @media
layout: media-span

// Full-bleed image — @main only (img tag fills entire slide)
layout: full-image

// Custom sidebar layout — @header, @main, @sidebar
layout: "header header" "main sidebar" / 1fr 300px
```

**Content Areas by Layout:**

- `title-slide`: `@title`, `@footer`
- `header-content`, `focus`: `@header`, `@main`, `@footer`
- `two-column`, `left-heavy`, `right-heavy`: `@header`, `@main`, `@media`, `@footer`
- `three-column`: `@header`, `@main`, `@media`, `@secondary`, `@footer`
- `media-span`: `@header`, `@main`, `@media`, `@footer`
- `full-image`: `@main` only (contains an `<img>` tag, no text)
- Custom grids: `@main` (required), plus any of `@header`, `@media`, `@sidebar`, `@secondary`, `@footer` as defined in the grid

**Slide Options:**

- `theme: dark` or `theme: light`
- `background: linear-gradient(...)` or `background: #color`
- `hidden: true` - Slide hidden by default
- Speaker notes: `<!-- notes: Your private notes -->` (must be the first line of the slide, before `layout:`)

**Custom Grid Layouts:**

When a preset layout doesn't fit, define a custom CSS grid directly in the `layout:` directive:

```markdown
layout: "header header" "main media" / 1fr 1fr

@header

## Title

@main
Left content

@media
Right content
```

The `layout:` value follows CSS `grid-template` shorthand syntax. Quoted rows list the area names; column sizes follow `/`. Always use `@main` for the primary content area.

**Built-in Features:**

- **Code highlighting:** Fenced code blocks with language identifier
- **Math:** Inline `$x^2$` or block `$$\int$$` using KaTeX
- **Diagrams:** Mermaid syntax in ```mermaid blocks
- **Markdown:** Bold, italic, lists, blockquotes, tables, links
- **HTML:** Inline styles for custom formatting
- **Text blocks:** `::: text-block { ... }` for styled, positioned, or multi-column text; use `column-count=N` to flow long lists across N columns

---

## Content Capacity (IMPORTANT)

Slides render at **1920×1080px**. Content overflows if too much is added. These are approximate maximums for a single content area:

| Content Type             | Max Items/Lines | Notes                                  |
| ------------------------ | --------------- | -------------------------------------- |
| Bullet list items        | ~13             | Single column, `header-content` layout |
| Bullet list (two-column) | ~6 per column   | `two-column` layout                    |
| Body text paragraphs     | ~15 lines       | At 30px font size                      |
| Code lines               | ~18 lines       | At 24px mono font                      |
| h2 headings              | ~8              | 42px each                              |
| Table rows               | ~8              | Including header row                   |

**Layout-specific guidance:**

- `focus`: Content-first, centered — ~13 bullet items or ~18 code lines, minimal header/footer
- `header-content`: ~13 bullet items in `@main`, or ~18 code lines
- `two-column`: ~6 items per column in `@main`/`@media`
- `media-span`: ~10 items in `@main`, media spans full height
- `title-slide`: Title + subtitle + author only
- `left-heavy`/`right-heavy`: Larger column holds ~10 items, smaller ~5
- `full-image`: Single `<img>` tag only, no text — image fills the entire slide

**If content exceeds these limits:**

- Split across multiple slides
- Use two-column layout to distribute content
- Remove redundant items
- Use shorter phrasing

---

## Content Formatting Guidelines

**IMPORTANT: No emojis** - they cause PDF rendering issues. Use text labels or styled HTML spans instead.

**Layout and Syntax Rules:**

- ALWAYS specify `layout:` at the top of each slide (before any `@area` markers)
- Place `@area` markers on their own lines
- Content before first `@area` flows into `@main`
- Speaker notes with `<!-- notes: -->` go at the very top of the slide (before `layout:`)
- Keep each slide self-contained; do not let a fenced code block accidentally span across slide separators

**For Code Examples:**

- Include brief comments explaining key lines
- Keep examples under 18 lines
- Show "bad" vs "good" patterns using two equal columns when appropriate

**For Concepts:**

- Start with `##` heading for concept name
- Use **bold** for key terms on first introduction
- Use `code font` for syntax elements
- Bullet lists for characteristics (max ~13 items per column)
- Blockquotes for warnings or tips

**For Diagrams:**

- Mermaid flowcharts for process flows
- Sequence diagrams for function calls or API interactions
- Class diagrams for data structures
- Add `classDef` styling for color-coding

**For Images:**

- Preserve every `<img src="images/...">` and `background: url(images/...)` exactly as they appear
- Do NOT replace `images/...` paths with `blob:` URLs, data URIs, or any other form
- Keep image filenames, dimensions, and alt text unchanged
- When generating image tags, use `src="images/filename.png"` and place them in the appropriate `@media` or `@main` area

---

## Slide Examples

### Title Slide

```markdown
<!-- notes: Welcome students. Acknowledge the density of today's lecture. We are bridging the gap between basic scripting and software engineering today. -->

layout: title-slide
background: linear-gradient(135deg, #eae4f0 0%, #f9fcfe 100%)

@title

# Course Topic

## [Course Code] - Week X

### Instructor Name
```

### Activity Slide

````markdown
<!-- notes: Give students 3-5 minutes -->

layout: "header header" "main sidebar" / 1fr 300px
background: linear-gradient(135deg, #f1faff 0%, #bbcde6 100%)

@header

# Activity 1: Code Prediction

@main

## What will this code output?

```python
def mystery(x):
    return x + [3]

print(mystery([1, 2]))
```
````

@sidebar

## Instructions

> <div style="padding: 4px 12px; background: rgba(59, 130, 246, 0.12); color: #2563eb; border-radius: 6px; text-align: center"><b>Hand-in update</b></div>
> <br />
> <span style="text-align: center">Screenshot your answer for the hand-in template.</span>

````

**Activity Instructions Guidelines:**
- Always use the blue callout style shown above
- Keep instructions brief - hand-in template has details
- Remind students what to submit (screenshot, code, explanation)

### Content Slide with Code

```markdown
layout: "header header" "main media" / 1fr 1fr

@header

# Function Parameters in C

@main

### Pass-by-Value Behavior

Parameters are passed by value in C.

**Key points:**
- Copies are made
- Original not modified
- Use pointers to modify

@media

```c
void func(int x) {
    x = 10;  // Only modifies copy
}
````

````

### Comparison Slide

```markdown
layout: "main media" / 1fr 1fr

@main

## Bad Code Example

```c
int *p;
*p = 5;  // Crash!
````

@media

## Good Code Example

```c
int *p = NULL;
if (p != NULL) {
    *p = 5;  // Safe
}
```

````

### Best Practices Slide

```markdown
layout: "header header" "main media" / 1fr 1fr

@header

## Common Pitfall: Off-by-One Errors

@main

> <span style="display: inline-block; padding: 4px 12px; background: rgba(239, 68, 68, 0.12); color: #dc2626; border-radius: 6px; margin-right: 8px;">**Warning:**</span> Arrays are 0-indexed!

**Key Points:**
- First element at index `0`
- Last element at `length - 1`
- Use `i < length`, not `i <= length`

@media

```python
# WRONG - IndexError
for i in range(len(arr)):
    print(arr[i + 1])

# CORRECT
for i in range(len(arr)):
    print(arr[i])
````

````

### Submission Instructions Slide

```markdown
layout: "main" / 1fr / center
background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)

@main

# Submitting Your Work

## Hand-in Instructions

1. **Compile screenshots** from all activities
2. **Paste screenshots** into the hand-in template
3. **Add written answers** for conceptual questions
4. **Submit** the completed template by end of lecture

**Template location:** [Course LMS page / Handout folder]
**Deadline:** End of class today
````

### Multi-column List Slide

```markdown
layout: header-content

@header

# Long List Example

@main

::: text-block { column-count=2 }

1. First item
2. Second item
3. Third item
4. Fourth item
5. Fifth item
6. Sixth item

:::
```

---

## Hand-in Template

After generating the slide deck, create a **student hand-in template** for students to submit activity work.

**Format:** Plain markdown that can be copied into a document editor (Word, Google Docs, etc.)

**Template Structure:**

````markdown
# [Course Name] - Week X Activity Hand-in

**Student Name:** **\*\*\*\***\_\_\_**\*\*\*\***
**Student ID:** **\*\*\*\***\_\_\_**\*\*\*\***
**Date:** **\*\*\*\***\_\_\_**\*\*\*\***

---

## Activity 1: [Activity Title]

**Your Screenshot:**
[Paste screenshot here]

**Your Answer/Explanation:**
[Type your answer here]

---

## Activity 2: [Activity Title]

**Your Screenshot:**
[Paste screenshot here]

**Your Answer/Explanation:**
[Type your answer here]

---

## Your Task

**Generate a complete slide deck markdown file for:**

**Topic:** [Your topic here]

**Target Audience:** [Your audience here - e.g., "Undergraduate CS students, Week 3 of Web Development course"]

**Prerequisites:** [What students should know before this lecture]

**Learning Objectives:** [3-5 specific learning objectives]

---

### Requirements:

1. Follow exact SlideMD syntax (no markdown rendering errors)
2. Use speaker notes (`<!-- notes: -->`) on at least 10 slides
3. Include **4-6 short activities** spread throughout (every 4-5 slides), not grouped together
4. **Activity slides should use:** `layout: "header header" "main sidebar" / 1fr 300px` with colored background
5. **Activity instructions must use consistent blue callout style** (see examples)
6. Use varied layouts for content slides (not all the same)
7. Include code examples in appropriate language
8. Include submission instructions slide before end
9. End with summary slide reviewing all learning objectives
10. Respect content capacity limits (~13 bullet items per column, ~18 code lines)
11. **Create a student hand-in template** as a separate markdown document after the slide deck

**Output format:**

1. First, provide the complete slide deck markdown (starting with the first slide's layout declaration)
2. After the slide deck, provide a clear separator: `--- HAND-IN TEMPLATE ---`
3. Then provide the hand-in template markdown with sections for each activity
4. Do NOT include any explanatory text outside of these two sections
5. Do NOT wrap the output in fenced code blocks (no ```markdown around the final deck/template)
````
