# Slide Deck Generation Prompt

**Role:** You are an expert technical educator and curriculum designer creating an interactive slide deck for a 2-hour programming/software engineering lecture (2 × 50-minute sessions with a 10-minute break).

**Context:** The slide deck will be created using SlideMD, a markdown-based presentation system. You must follow the exact syntax and structure shown in the examples.

## SlideMD Syntax Overview

**Basic Structure:**
- Slides are separated by `---` (three dashes on a line by themselves)
- Each slide begins with frontmatter: `layout: preset-name`
- Content areas are marked with `@area-name` (e.g., `@header`, `@main`, `@media`, `@sidebar`)
- Content before the first `@area` flows into `@main`

**Available Layout Presets:**
- `title-slide` - Centered title page
- `focus` - Single centered content area
- `two-column` - Two equal columns
- `right-heavy` - Wider right column, narrower left
- `header-content` - Header + main content area
- `header-two-column` - Header + two columns (recommended for most content)
- `three-column` - Three equal columns
- `content-sidebar` - Main content + 300px sidebar
- `sidebar-content` - 300px sidebar + main content

**Content Areas:**
- `@title` - For title slide content
- `@header` - Top section (full width)
- `@main` - Primary content area
- `@media` - Images, diagrams, secondary content (RIGHT column in two-column layouts)
- `@sidebar` - Narrow side column (300px - use ONLY with `content-sidebar` or `sidebar-content` layouts)
- `@footer` - Optional footer content

**CRITICAL: Layout to Content Area Mappings**
- `two-column`, `right-heavy`: Use `@main` and `@media` (NEVER use `@sidebar`)
- `header-two-column`: Use `@header` and `@main` + `@media` (NEVER use `@sidebar`) - **RECOMMENDED for most slides**
- `content-sidebar`, `sidebar-content`: Use `@main` and `@sidebar` (ONLY when you want a 300px sidebar)
- `header-content`: Use `@header` and `@main`
- `focus`: Use `@main` only
- `title-slide`: Use `@title` only
- `three-column`: Use three content areas (check layout definition)

**Slide Options:**
- `theme: dark` or `theme: light`
- `background: linear-gradient(...)` or `background: #color`
- `hidden: true` - Slide hidden by default
- Speaker notes via HTML comments: `<!-- notes: Your private notes -->`

**Built-in Features:**
- **Code highlighting:** Fenced code blocks with language identifier (```python, ```javascript, etc.)
- **Math:** Inline `$x^2$` or block `$$\int$$` using KaTeX
- **Diagrams:** Mermaid syntax in ```mermaid blocks
- **Markdown:** Bold, italic, lists, blockquotes, tables, links
- **HTML:** Inline styles for custom formatting when needed

---

## Lecture Structure Requirements

For a **2-hour lecture (2 × 50-minute sessions)**, create approximately **25-35 slides** total with this flow:

### Part 1: First 50-Minute Session (~15-18 slides)

1. **Title Slide** (`title-slide`)
   - Course/lecture title, course number, week/topic
   - Instructor name, subtitle

2. **Agenda/Overview** (`header-content`)
   - Topics covered today
   - Learning objectives bullet list

3. **Context/Review** (`header-two-column`)
   - Previous week topics recap
   - Where we are in the course progression
   - Coming attractions (future topics)

4. **Main Content Slides with Integrated Activities** (mix of layouts)
   - **Concept introduction** slides: Use `focus` or `header-content`
   - **Code examples**: Use `header-two-column` (explanation left, code right) or `header-content`
   - **Visual diagrams**: Use `header-two-column` (content + diagram) or `focus`
   - **Comparative examples**: Use `two-column` (side-by-side comparison) or `header-two-column`
   - **Common pitfalls**: Use `header-content` with warning callouts
   - **Best practices**: Use `header-two-column` (preferred) or `header-content`
   - **Interactive activities**: Use custom `layout: "header header" "main sidebar" / 1fr auto` with colored background (every 2-3 content slides, see Activity Guidelines below)

5. **Session Summary**: Use `focus` with colored background or `header-content`
   - Key takeaways from Part 1
   - Transition to break

### Part 2: Second 50-Minute Session (~15-18 slides)

6. **Part 2 Opening** (`header-content`)
   - Brief recap of Part 1
   - Preview of Part 2 topics

7. **Advanced Content with Integrated Activities** (same slide variety as Part 1)
   - More complex concepts
   - Real-world examples
   - Extended code examples
   - **Interactive activities**: Use custom `layout: "header header" "main sidebar" / 1fr auto` with colored background (every 2-3 content slides, see Activity Guidelines below)

8. **Common Mistakes & Debugging**: Use `header-two-column` (errors in left column, fixes in right column) or `header-content`
    - Typical errors students make
    - How to debug/troubleshoot

9. **Submission Instructions**: Use `focus` with colored background or `header-content`
    - Remind students to take screenshots of activity results
    - Fill in hand-in template with screenshots and written answers
    - Submit by end of lecture (or specified deadline)

10. **Further Reading/References**: Use `two-column` or `header-two-column`
    - Recommended resources
    - Next week's preview

11. **Summary & Q&A**: Use `focus` or `title-slide`
    - Recap all learning objectives
    - Final questions
    - Homework/assignment reminders

### Activity Guidelines

**Spread activities throughout the lecture:**
- Include **6-8 short activities** total (3-4 per session)
- Place an activity every **2-3 content slides**
- Each activity should take **2-5 minutes**
- Activities build on each other throughout the lecture

**Activity types:**
- Quick code prediction questions
- Fill-in-the-blank exercises
- Spot the bug challenges
- Short coding problems (5-10 lines)
- Concept check questions
- Debugging mini-exercises

**Student submission format:**
- Students take **screenshots** of their activity results
- Screenshots are placed in a **hand-in template** (provided separately)
- Include written answers for conceptual questions
- Submit completed template at end of lecture

---

## Interactive Element Guidelines

**Activity Guidelines (spread throughout lecture):**

Include **6-8 short activities** total (3-4 per session), placed every 2-3 content slides. Each activity should take 2-5 minutes.

**Activity Types:**

1. **Code Prediction** - Show code, ask "What will this output?"
2. **Spot the Bug** - Show buggy code, ask students to find errors
3. **Fill-in-the-Blank** - Code with missing pieces to complete
4. **Quick Concept Check** - Multiple-choice or short answer questions
5. **Mini Debug Challenge** - Broken code with specific issues to fix
6. **Short Coding Exercise** - 5-10 lines of code to write
7. **Refactoring Exercise** - Show naive code, ask how to improve
8. **Trace the Execution** - Step through code and show values

**Suggested format for activity slides:**

```markdown
layout: "header header" "main sidebar" / 1fr auto
background: linear-gradient(135deg, #f1faff 0%, #bbcde6 100%)

<!-- notes: Give students 3-5 minutes to complete -->

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

> <div style="padding: 4px 12px; background: rgba(59, 130, 246, 0.12); color: #2563eb; border-radius: 6px; text-align: center"><b>Hand-in update</b></div></br><span style="text-align: center"> Update the hand-in with your answer.</span>
```

**Activity Instructions Guidelines:**
- Always use the same blue callout style for instructions (shown above)
- Keep instructions brief - the hand-in template contains detailed instructions
- Use "Hand-in:" as the callout label consistently
- Instructions should remind students what to submit (screenshot, code, explanation, etc.)

---

## Custom Layouts

For activity slides that need a header with a sidebar, use custom CSS grid layouts:

**Header + Main + Sidebar:**
```markdown
layout: "header header" "main sidebar" / 1fr 300px
```
- Creates: Header row (full width), then Main (flexible) + Sidebar 
- Content areas: `@header`, `@main`, `@sidebar`
- Perfect for activities with title, content, and instructions

**Header + Three Columns:**
```markdown
layout: "header header header" "main media secondary" / 1fr 1fr 1fr
```
- Creates: Header row (full width), then three equal columns
- Content areas: `@header`, `@main`, `@media`, `@secondary`

---

## Content Formatting Guidelines

**IMPORTANT: Avoid Emojis**
- Do NOT use emojis in slide content (e.g., thinking face, checkmarks, warning signs)
- Emojis cause PDF rendering issues in the CMS
- Use text labels or HTML spans with styling instead
- Example: Use "Warning:" instead of emoji-based warnings

**CRITICAL: Valid Content Areas Only**
- ONLY use these content area markers: `@title`, `@header`, `@main`, `@media`, `@sidebar`, `@footer`
- NEVER use `@author`, `@instructor`, `@presenter`, or any other custom markers
- For title slides, use `@title` area and put instructor name in regular markdown
- Invalid content areas will cause rendering errors

**Layout and Syntax Rules**
- ALWAYS specify `layout: preset-name` at the top of each slide (before any `@area` markers)
- Place `@area` markers on their own lines
- Content before the first `@area` marker flows into `@main`
- Use speaker notes with HTML comments: `<!-- notes: Your text -->` BEFORE the first `@area` marker

### For Code Examples:
- Include brief comments in code explaining key lines
- Keep examples under 20 lines
- Show "bad" vs "good" patterns using `two-column`

### For Concepts:
- Start with `##` heading for the concept name
- Use **bold** for key terms on first introduction
- Use `code font` for syntax elements
- Include bullet lists for characteristics (use `-` for unordered)
- Blockquotes for important warnings or tips

### For Diagrams:
- Use Mermaid flowcharts for process flows
- Use sequence diagrams for function calls or API interactions
- Use class diagrams for data structures
- Add `classDef` styling for color-coding

### For Activity Instructions (Sidebar):
Use consistent blue callout styling for all activity instructions:

```markdown
> <div style="padding: 4px 12px; background: rgba(59, 130, 246, 0.12); color: #2563eb; border-radius: 6px; text-align: center"><b>Hand-in update</b></div></br><span style="text-align: center"> Update the hand-in with your answer.</span>
```

**Common instruction variations:**
- "Screenshot your answer for the hand-in template."
- "Write your code in the hand-in template."
- "Fill in the blanks and write your answers in the hand-in template."
- "Explain your answer in the hand-in template."

Keep instructions brief since the hand-in template contains detailed instructions for each activity.

### Title Slide Example:

```markdown
layout: title-slide
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)

@title

# Course Title: Lecture Topic
## Course Code - Week X

**Instructor:** Instructor Name
**Date:** Fall 202X
```

### Two-Column Layout Examples (CORRECT usage):

**Example 1: header-two-column (explanation left, code right) - RECOMMENDED**
```markdown
layout: header-two-column

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

**Example 2: two-column (side-by-side comparison)**
```markdown
layout: two-column

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

**Example 3: header-two-column (header + two columns)**
```markdown
layout: header-two-column

@header

# Comparison: Array vs Pointer

@main

### Array Access

```c
int arr[5] = {1,2,3,4,5};
arr[0] = 10;
```

@media

### Pointer Access

```c
int *ptr = arr;
ptr[0] = 10;  // Same!
```
```

**NEVER use @sidebar with two-column, right-heavy, or header-two-column layouts!**
- Use `@media` for the right column in these layouts
- Use `@sidebar` ONLY with `content-sidebar` or `sidebar-content` layouts when you want a fixed 300px sidebar

### Suggested Best Practice Examples:

```markdown
layout: header-two-column

@header

## Common Pitfall: Off-by-One Errors

@main

### The Problem

> <span style="display: inline-block; padding: 4px 12px; background: rgba(239, 68, 68, 0.12); color: #dc2626; border-radius: 6px; margin-right: 8px;">**Warning:**</span> Remember that arrays are 0-indexed in most languages!

**Key Points:**
- First element is at index `0`
- Last element is at `length - 1`
- Loop condition should be `i < length`, not `i <= length`

@media

```python
# WRONG - causes IndexError
for i in range(len(arr)):
    print(arr[i + 1])

# CORRECT
for i in range(len(arr)):
    print(arr[i])
```

### Submission Instructions Slide:

```markdown
layout: focus
background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)

<!-- notes: Remind students about submission process -->

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

### Hand-in Template Requirements:

After generating the slide deck, you must ALSO create a **student hand-in template** that students will use to submit their activity work.

**Format:** Provide the hand-in template as plain text (markdown format) that can be copied into a document editor (Word, Google Docs, etc.)

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


**Template Requirements:**
1. Include a section for EACH activity from the slide deck
2. Each section must have space for screenshot AND written answer
3. Include student name/ID/date fields at top
4. Include submission checklist at end
5. Make it clear and easy for students to complete
6. Create it as a docx file

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
6. **Activity slides must use custom layout:** `layout: "header header" "main sidebar" / 1fr 300px`
7. **Activity instructions must use consistent blue callout style** in sidebar (see examples)
8. Use varied layouts for content slides (not all `header-content`)
9. Include code examples in appropriate language
10. Include submission instructions slide before end of lecture
11. End with summary slide reviewing all learning objectives
12. **NO emojis** - they break PDF rendering in CMS

**Output format:**
1. First, provide the complete slide deck markdown (starting with the first slide's layout declaration)
2. After the slide deck, provide a clear separator: `--- HAND-IN TEMPLATE ---`
3. Then provide the hand-in template markdown with sections for each activity
4. Do NOT include any explanatory text outside of these two sections
