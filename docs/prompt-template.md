# Slide Deck Generation Prompt

**Role:** You are an expert technical educator and curriculum designer creating an interactive slide deck for a 2-hour programming/software engineering lecture (2 × 50-minute sessions with a 10-minute break).

**Context:** The slide deck will be created using SlideMD, a markdown-based presentation system. You must follow the exact syntax and structure shown in the examples.

## SlideMD Syntax Overview

**Basic Structure:**
- Slides are separated by `---` (three dashes on a line by themselves)
- Each slide begins with frontmatter: `layout: "grid definition" / "columns" / "alignment"`
- Content areas are marked with `@area-name` (e.g., `@header`, `@main`, `@media`, `@sidebar`)
- Content before the first `@area` flows into `@main`

**Useful Layout Patterns:**

```markdown
# Title slide (centered)
layout: "title" / 1fr / center
# Content: @title

# Header + single content
layout: "header" "main" / auto 1fr
# Content: @header, @main

# Header + two equal columns
layout: "header header" "main media" / 1fr 1fr
# Content: @header, @main, @media

# Two equal columns (no header)
layout: "main media" / 1fr 1fr
# Content: @main, @media

# Header + main + sidebar (for activities)
layout: "header header" "main sidebar" / 1fr 300px
# Content: @header, @main, @sidebar
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
- Speaker notes: `<!-- notes: Your private notes -->`

**Built-in Features:**
- **Code highlighting:** Fenced code blocks with language identifier
- **Math:** Inline `$x^2$` or block `$$\int$$` using KaTeX
- **Diagrams:** Mermaid syntax in ```mermaid blocks
- **Markdown:** Bold, italic, lists, blockquotes, tables, links
- **HTML:** Inline styles for custom formatting

---

## Lecture Structure Requirements

For a **2-hour lecture (2 × 50-minute sessions)**, create approximately **25-35 slides** total with this flow:

**Part 1: First 50-Minute Session (~15-18 slides)**
1. Title Slide (centered layout)
2. Agenda/Overview (header + main) - topics and learning objectives
3. Context/Review (header + two columns) - previous week recap, course progression
4. Main Content with Integrated Activities (mix of layouts)
   - Concept introduction: single centered or header + main
   - Code examples: header + two columns (explanation left, code right)
   - Visual diagrams: header + two columns or single centered
   - Comparative examples: two equal columns
   - Common pitfalls: header + main with warning callouts
   - Best practices: header + two columns
   - **Interactive activities every 2-3 slides** (use header + main + sidebar with colored background)
5. Session Summary (single centered with colored background)

**Part 2: Second 50-Minute Session (~15-18 slides)**
6. Part 2 Opening (header + main) - recap Part 1, preview Part 2
7. Advanced Content with Integrated Activities (same variety as Part 1)
8. Common Mistakes & Debugging (header + two columns - errors left, fixes right)
9. Submission Instructions (single centered with colored background) - screenshots, hand-in template
10. Further Reading/References (two equal columns)
11. Summary & Q&A (single centered or centered title)

**Activity Guidelines:**
- Include **6-8 short activities** total (3-4 per session)
- Place an activity every **2-3 content slides**
- Each activity takes **2-5 minutes**
- Types: Code prediction, spot the bug, fill-in-the-blank, concept checks, mini debug challenges, short coding exercises
- Students take screenshots and paste into hand-in template with written answers

---

## Content Formatting Guidelines

**IMPORTANT: No emojis** - they cause PDF rendering issues. Use text labels or styled HTML spans instead.

**Layout and Syntax Rules:**
- ALWAYS specify `layout:` at the top of each slide (before any `@area` markers)
- Place `@area` markers on their own lines
- Content before first `@area` flows into `@main`
- Speaker notes with `<!-- notes: -->` BEFORE the first `@area` marker

**For Code Examples:**
- Include brief comments explaining key lines
- Keep examples under 20 lines
- Show "bad" vs "good" patterns using two equal columns

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
layout: title-slide
background: linear-gradient(135deg, #eae4f0 0%, #f9fcfe 100%)

<!-- notes: Welcome students. Acknowledge the density of today's lecture. We are bridging the gap between basic scripting and software engineering today. -->

@title

# Course Topic
## [Course Code] - Week X
### Instructor Name
```

### Activity Slide

```markdown
layout: "header header" "main sidebar" / 1fr 300px
background: linear-gradient(135deg, #f1faff 0%, #bbcde6 100%)

<!-- notes: Give students 3-5 minutes -->

@header

# Activity 1: Code Prediction

@main

## What will this code output?

```python
def mystery(x):
    return x + [3]

print(mystery([1, 2]))
```

@sidebar

## Instructions

> <div style="padding: 4px 12px; background: rgba(59, 130, 246, 0.12); color: #2563eb; border-radius: 6px; text-align: center"><b>Hand-in update</b></div></br><span style="text-align: center"> Screenshot your answer for the hand-in template.</span>
```

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
```
```

### Comparison Slide

```markdown
layout: "main media" / 1fr 1fr

@main

## Bad Code Example

```c
int *p;
*p = 5;  // Crash!
```

@media

## Good Code Example

```c
int *p = NULL;
if (p != NULL) {
    *p = 5;  // Safe
}
```
```

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
```
```

### Submission Instructions Slide

```markdown
layout: "main" / 1fr / center
background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)

@main

# Submitting Your Work

## Hand-in Instructions

1. **Compile screenshots** from all 8 activities
2. **Paste screenshots** into the hand-in template
3. **Add written answers** for conceptual questions
4. **Submit** the completed template by end of lecture

**Template location:** [Course LMS page / Handout folder]
**Deadline:** End of class today
```

---

## Hand-in Template

After generating the slide deck, create a **student hand-in template** for students to submit activity work.

**Format:** Plain markdown that can be copied into a document editor (Word, Google Docs, etc.)

**Template Structure:**

```markdown
# [Course Name] - Week X Activity Hand-in

**Student Name:** ___________________
**Student ID:** ___________________
**Date:** ___________________

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

[Continue for all activities]

---

```

**Template Requirements:**
1. Include a section for EACH activity
2. Each section has space for screenshot AND written answer
3. Include student name/ID/date fields at top
4. Include submission checklist at end

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
2. Create 25-35 slides total for 2-hour lecture
3. **Create a student hand-in template** as a separate markdown document after the slide deck
4. Use speaker notes (`<!-- notes: -->`) on at least 10 slides
5. Include **6-8 short activities** spread throughout (every 2-3 slides), not grouped together
6. **Activity slides should use:** `layout: "header header" "main sidebar" / 1fr 300px` with colored background
7. **Activity instructions must use consistent blue callout style** (see examples)
8. Use varied layouts for content slides (not all the same)
9. Include code examples in appropriate language
10. Include submission instructions slide before end of lecture
11. End with summary slide reviewing all learning objectives

**Output format:**
1. First, provide the complete slide deck markdown (starting with the first slide's layout declaration)
2. After the slide deck, provide a clear separator: `--- HAND-IN TEMPLATE ---`
3. Then provide the hand-in template markdown with sections for each activity
4. Do NOT include any explanatory text outside of these two sections
