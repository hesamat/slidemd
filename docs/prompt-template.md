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
# Title slide (centered)

layout: title-slide

# Content: @title

# Header + single content

layout: header-content

# Content: @header, @main (optional: @footer)

# Header + two equal columns

layout: two-column

# Content: @header, @main, @media

# Two equal columns (no header)

layout: two-column

# Content: @main, @media

# Header + main + sidebar (for activities)

layout: "header header" "main sidebar" / 1fr 300px

# Content: @header, @main, @sidebar

# Other commonly used presets

layout: left-heavy
layout: right-heavy
layout: three-column
```

**Content Areas:**

- `@title` - Title slide content
- `@header` - Top section (full width)
- `@main` - Primary content area
- `@media` - Secondary content (typically right column)
- `@sidebar` - Narrow side column (300px)
- `@footer` - Optional footer

**Slide Options:**

- `theme: dark` or `theme: light`
- `background: linear-gradient(...)` or `background: #color`
- `hidden: true` - Slide hidden by default
- Speaker notes: `<!-- notes: Your private notes -->` (must be the first line of the slide, before `layout:`)

**Built-in Features:**

- **Code highlighting:** Fenced code blocks with language identifier
- **Math:** Inline `$x^2$` or block `$$\int$$` using KaTeX
- **Diagrams:** Mermaid syntax in ```mermaid blocks
- **Markdown:** Bold, italic, lists, blockquotes, tables, links
- **HTML:** Inline styles for custom formatting

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
- Keep examples under 20 lines
- Show "bad" vs "good" patterns using two equal columns when appropriate

**For Concepts:**

- Start with `##` heading for concept name
- Use **bold** for key terms on first introduction
- Use `code font` for syntax elements
- Bullet lists for characteristics
- Blockquotes for warnings or tips

**For Diagrams:**

- Mermaid flowcharts for process flows
- Sequence diagrams for function calls or API interactions
- Class diagrams for data structures
- Add `classDef` styling for color-coding

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
10. **Create a student hand-in template** as a separate markdown document after the slide deck

**Output format:**

1. First, provide the complete slide deck markdown (starting with the first slide's layout declaration)
2. After the slide deck, provide a clear separator: `--- HAND-IN TEMPLATE ---`
3. Then provide the hand-in template markdown with sections for each activity
4. Do NOT include any explanatory text outside of these two sections
5. Do NOT wrap the output in fenced code blocks (no ```markdown around the final deck/template)
````

---

## PPTX-to-SlideMD Conversion Prompt

Use this prompt when converting an existing PowerPoint presentation to SlideMD format.

**Role:** You are an expert at converting PowerPoint presentations into SlideMD markdown format. You preserve the original content and structure while adapting it to SlideMD's layout system.

**Input:** You will receive plain text extracted from a PPTX file. Each slide is delimited by `--- Slide N ---`. The text includes the slide's title, notes, and all content elements (text, tables, image placeholders, chart placeholders).

**Your task:** Convert this into clean SlideMD markdown that:

1. Preserves ALL original content — do not summarize, omit, or rewrite
2. Maps each PPTX slide to one SlideMD slide
3. Chooses appropriate layouts based on content structure
4. Preserves speaker notes as `<!-- notes: ... -->` comments
5. Converts tables to markdown tables
6. Keeps image placeholders as `![description](images/imageN.ext)` references
7. Adds `<!-- [Chart: type] -->` or `<!-- [Diagram: description] -->` comments for non-text elements

**Layout selection rules:**

| Content Pattern                   | Layout                                               |
| --------------------------------- | ---------------------------------------------------- |
| Title only (short text, centered) | `layout: title-slide`                                |
| Heading + single content area     | `layout: header-content`                             |
| Heading + two columns of content  | `layout: two-column`                                 |
| Heading + main + sidebar/notes    | `layout: "header header" "main sidebar" / 1fr 300px` |
| Three columns of content          | `layout: three-column`                               |
| Content heavier on left           | `layout: left-heavy`                                 |
| Content heavier on right          | `layout: right-heavy`                                |

**Output format:**

- Output ONLY the SlideMD markdown
- No explanatory text before or after
- No fenced code blocks wrapping the output
- First slide should use `layout: title-slide` if it's a title/cover slide

**Example conversion:**

Input:

```
--- Slide 1 ---
Title: Introduction to C Programming
Background: linear-gradient(135deg, #eae4f0 0%, #f9fcfe 100%)

What we'll cover today:
- Variables and data types
- Control flow
- Functions

Notes: Welcome students to the course.
```

Output:

```markdown
<!-- notes: Welcome students to the course. -->

layout: title-slide
background: linear-gradient(135deg, #eae4f0 0%, #f9fcfe 100%)

@title

# Introduction to C Programming

## What we'll cover today

- Variables and data types
- Control flow
- Functions
```
