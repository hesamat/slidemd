# Slide Deck Generation Prompt

**Role:** You are an expert technical educator and curriculum designer creating an interactive slide deck for a computer science / software engineering course

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

**Activity Guidelines:**

- Each activity takes **2-5 minutes**
- Students take screenshots and paste into hand-in template with written answers

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

- Keep examples under 6 lines

**For Concepts:**

- Start with `##` heading for concept name
- Use **bold** for key terms on first introduction
- Use `code font` for syntax elements
- Bullet lists for characteristics
- Blockquotes for warnings or tips

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

### Activity Slide (simple example)

````markdown
<!-- notes: Give students 3-5 minutes -->

layout: "header header" "main sidebar" / 1fr 300px

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

```

**Activity Instructions Guidelines:**
- Always use the blue callout style shown above
- Keep instructions brief - hand-in template has details

---

## Your Task

**Generate a complete slide deck markdown file for:**

**Topic:** [INSERT YOUR TOPIC HERE - e.g., "Async/Await in JavaScript", "Hash Tables in Python", "REST API Design"]

**Target Audience:** [INSERT - e.g., "Undergraduate CS students, Week 3 of Web Development course"]

**Prerequisites:** [INSERT - e.g., "Basic JavaScript, familiarity with callbacks"]

**Learning Objectives:** [INSERT 3-5 specific learning objectives]

---

### Requirements:

1. Follow exact SlideMD syntax (no markdown rendering errors)
2. Use speaker notes (`<!-- notes: -->`) on at least 10 slides
3. **Activity slides should use:** `layout: "header header" "main sidebar" / 1fr 300px` with colored background
4. **Activity instructions must use consistent blue callout style** (see examples)
5. Use varied layouts for content slides (not all the same)
6. Include code examples in appropriate language
7. End with summary slide reviewing all learning objectives

**Output format:**
1. First, provide the complete slide deck markdown (starting with the first slide's layout declaration)
2. Do NOT include any explanatory text outside of these two sections
```
