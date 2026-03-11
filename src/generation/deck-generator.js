/**
 * Deck Generator
 * AI generation for full markdown decks
 */

import { AIProviderRegistry } from "./ai-provider-registry.js";
import { Notification } from "../renderer/notification.js";

export class DeckGenerator {
    static async generateDeckFromPlan(profile, lecturePlan, options = {}) {
        if (!lecturePlan || !Array.isArray(lecturePlan.rows) || lecturePlan.rows.length === 0) {
            Notification.error("Lecture plan is required");
            throw new Error("Lecture plan is required");
        }

        const provider = AIProviderRegistry.getProvider(profile.aiProvider);
        if (!provider) {
            Notification.error("AI provider not configured.");
            throw new Error("AI provider not configured");
        }

        const estimatedSlideCount = this.estimateSlideCountFromPlan(lecturePlan, options.activityCount);

        try {
            Notification.info("Generating deck markdown...");

            const response = await AIProviderRegistry.generateCompletion(
                profile.aiProvider,
                {
                    messages: [
                        { role: "system", content: this.getSystemPrompt() },
                        {
                            role: "user",
                            content: this.buildPlanDrivenPrompt(profile, lecturePlan, {
                                estimatedSlideCount,
                                lastWeekSummary: options.lastWeekSummary,
                                activityCount: Math.max(0, parseInt(options.activityCount, 10) || 0)
                            })
                        }
                    ],
                    maxTokens: 20000,
                    timeoutMs: 160000,
                    signal: options.signal
                }
            );

            const text = this.extractResponseText(response);
            let markdown = this.extractDeckMarkdown(text);
            markdown = this.sanitizeMarkdown(markdown);

            const validation = this.validateMarkdown(markdown, estimatedSlideCount);
            if (!validation.valid) {
                const err = new Error("Generated markdown is missing required slide structure.");
                err.rawResponse = text;
                err.validationErrors = validation.errors;
                err.validationWarnings = validation.warnings;
                throw err;
            }

            if (validation.warnings.length > 0) {
                Notification.warning(validation.warnings.join(" | "));
            }

            Notification.success("Deck generated successfully!");
            return markdown;
        } catch (error) {
            console.error("Deck generation failed:", error);

            if (error.name === "AbortError") {
                throw error;
            }

            if (error.message.includes("401")) {
                Notification.error("Invalid API key. Please check your AI configuration.");
            } else if (error.message.includes("429")) {
                Notification.error("Rate limit exceeded. Please try again later.");
            } else {
                Notification.error("Failed to generate deck: " + error.message);
            }

            throw error;
        }
    }

    /**
     * Generate full markdown deck in one AI call.
     * @param {Object} profile - Course profile object
     * @param {string} topic - Topic for the deck
     * @param {Object} options - Generation options
     * @param {number} options.slideCount - Number of slides
     * @param {boolean} options.includeActivities - Include in-class activities
     * @param {string} options.lastWeekSummary - Optional summary of previous session
     * @param {AbortSignal} options.signal - Optional abort signal
     * @returns {Promise<string>} Complete markdown deck
     */
    static async generateDeck(profile, topic, options = {}) {
        if (!topic || !topic.trim()) {
            Notification.error("Topic is required");
            throw new Error("Topic is required");
        }

        const provider = AIProviderRegistry.getProvider(profile.aiProvider);
        if (!provider) {
            Notification.error("AI provider not configured.");
            throw new Error("AI provider not configured");
        }

        const slideCount = options.slideCount || profile.defaultSlideCount || 15;
        const includeActivities = options.includeActivities !== undefined ? options.includeActivities : profile.includeActivities;

        try {
            Notification.info("Generating deck markdown...");

            const prompt = this.buildSinglePassPrompt(profile, topic, {
                slideCount,
                includeActivities,
                lastWeekSummary: options.lastWeekSummary
            });

            const response = await AIProviderRegistry.generateCompletion(
                profile.aiProvider,
                {
                    messages: [
                        { role: "system", content: this.getSystemPrompt() },
                        { role: "user", content: prompt }
                    ],
                    maxTokens: 20000,
                    timeoutMs: 160000,
                    signal: options.signal
                }
            );

            const text = this.extractResponseText(response);
            let markdown = this.extractDeckMarkdown(text);
            markdown = this.sanitizeMarkdown(markdown);

            const validationTrace = [];

            let validation = this.validateMarkdown(markdown, slideCount);
            validationTrace.push({
                stage: "initial",
                valid: validation.valid,
                errors: [...validation.errors],
                warnings: [...validation.warnings],
                slideCountDetected: this.countSlides(markdown)
            });
            console.debug("[DeckGenerator][SinglePass] Validation (initial)", validationTrace[validationTrace.length - 1]);

            if (!validation.valid) {
                const err = new Error("Generated markdown is missing required slide structure.");
                err.rawResponse = text;
                err.validationErrors = validation.errors;
                err.validationWarnings = validation.warnings;
                err.validationTrace = validationTrace;
                console.error("[DeckGenerator][SinglePass] Validation failed after retries", validationTrace);
                throw err;
            }

            if (validation.warnings.length > 0) {
                console.warn("[DeckGenerator][SinglePass] Deck generated with warnings:", validation.warnings);
                Notification.warning(validation.warnings.join(" | "));
            }

            Notification.success("Deck generated successfully!");
            return markdown;
        } catch (error) {
            console.error("Deck generation failed:", error);

            if (error.name === "AbortError") {
                throw error;
            }

            if (error.message.includes("401")) {
                Notification.error("Invalid API key. Please check your AI configuration.");
            } else if (error.message.includes("429")) {
                Notification.error("Rate limit exceeded. Please try again later.");
            } else {
                Notification.error("Failed to generate deck: " + error.message);
            }

            throw error;
        }
    }

    /**
     * System prompt for one-step deck generation.
     * @returns {string} System prompt
     */
    static getSystemPrompt() {
        return "You are an expert instructional designer writing complete markdown slide decks for a 16:9 presentation system.";
    }

    static buildPlanDrivenPrompt(profile, lecturePlan, options) {
        const planRows = lecturePlan.rows.map((row, index) => {
            return `${index + 1}. [${row.type.toUpperCase()}] ${row.durationMinutes} min | target ${row.targetSlides} slide${row.targetSlides === 1 ? "" : "s"} - ${row.title}${row.notes ? `\n   Goal: ${row.notes}` : ""}`;
        }).join("\n");

        return `Generate a COMPLETE markdown slide deck from this approved lecture plan.

## Course Context
Course: ${profile.name}
${profile.description ? `Description: ${profile.description}` : ""}
${profile.prerequisites ? `Prerequisites: ${profile.prerequisites}` : ""}

## Learning Objectives
${(profile.learningObjectives || []).map(obj => `- ${obj}`).join("\n")}

${options.lastWeekSummary ? `## Previous Session Summary\n${options.lastWeekSummary}\n` : ""}

## Lecture Plan
Title: ${lecturePlan.title || lecturePlan.topic}
Topic: ${lecturePlan.topic || lecturePlan.title}
Total Duration: ${lecturePlan.totalMinutes} minutes
Planned Breaks: ${lecturePlan.breakCount}
Conceptual Activity Slides: ${options.activityCount}
Target Slide Count: about ${options.estimatedSlideCount}

${planRows}

## Deck Construction Rules
- Respect the plan row order for all non-break rows.
- Break rows are planning-only markers. DO NOT create break slides.
- Use each non-break row's target slide count as a rough guide for how much coverage that topic receives.
- Longer sections can have more than one slide, but keep the full deck around ${options.estimatedSlideCount} slides.
- Start with a title slide.
- Include an early roadmap slide that reflects the lecture arc.
- End with a summary slide.
- Insert about ${options.activityCount} conceptual activity slide${options.activityCount === 1 ? "" : "s"} across the deck.
- Activity slides should focus on discussion, reasoning, prediction, trade-offs, or critique. Avoid long code-writing tasks.
- Use the provided activity example as a template for style and formatting of all activity slides.
- Every slide must begin with a layout directive.
- Return ONLY markdown deck content — no explanations, no JSON.
- Use slide separator exactly as a line containing only: ---

## Allowed Layouts
| Layout | Area Markers | Use for |
|---|---|---|
| title-slide | @title | Opening title slide |
| header-content | @header, @main, @footer | Explanatory single-column content |
| header-two-column | @header, @main, @media, @footer | Concepts with examples, code, or diagrams |
| two-column | @header, @main, @media | Balanced comparisons |
| three-column | @header, @main, @media, @secondary | Multi-part comparisons |

## Writing Rules
- Do not invent new layout names or area markers.
- Use bullet lists over long paragraphs.
- Code blocks must include language tags and stay concise.
- Use Mermaid only when it genuinely clarifies a process or relationship.
- Keep one teaching goal per slide.

Return only the final markdown deck.`;
    }

    /**
     * Build single-pass markdown generation prompt.
     * @param {Object} profile - Course profile
     * @param {string} topic - Deck topic
     * @param {Object} options - Generation options
     * @returns {string} Prompt
     */
    static buildSinglePassPrompt(profile, topic, options) {
        const { slideCount, includeActivities, lastWeekSummary } = options;

        return `Generate a COMPLETE markdown slide deck in one pass.

## Course Context
Course: ${profile.name}
${profile.description ? `Description: ${profile.description}` : ""}
${profile.prerequisites ? `Prerequisites: ${profile.prerequisites}` : ""}

## Learning Objectives
${(profile.learningObjectives || []).map(obj => `- ${obj}`).join("\n")}

${lastWeekSummary ? `## Previous Session Summary\n${lastWeekSummary}\n` : ""}

## Topic
${topic}

## Requirements
- Number of slides: about ${slideCount}
- Include in-class activities: ${includeActivities ? "Yes" : "No"}

## Available Layouts and Their Area Markers
Only use the layouts and markers listed here. Do not invent new layout names.

| Layout               | Area Markers                                  | Use for                                      |
|----------------------|-----------------------------------------------|----------------------------------------------|
| title-slide          | @title                                                | Opening title slide                          |
| header-content       | @header, @main, @footer                               | Single-column lecture slide with a heading   |
| header-two-column    | @header, @main (left col), @media (right col), @footer | Concept + code/diagram side-by-side          |
| two-column           | @header, @main, @media                                | Two equal columns with optional header       |
| three-column         | @header, @main, @media, @secondary                    | Three parallel concepts                      |
| focus                | @header, @main                                        | Full-bleed emphasis or quote                 |

## Output Format Rules
- Return ONLY markdown deck content — no explanations, no JSON wrapper.
- Use slide separator exactly as a line containing only: ---
- Every slide must begin with a layout directive on its own line: layout: <name>
- An optional background declaration may follow: background: <css value>
- Area markers are bare words on their own line, e.g. @header
- DO NOT write meta-authoring labels like "Left:", "Right:", "Main:", "Media:", "Mermaid diagram:", "Key insight:".
- Pedagogical order: motivation/context first, then concept, then code/application.
- Code blocks: at most 7 lines per block, always include a language tag (e.g. \`\`\`python).
- Use a Mermaid diagram when architecture, data flow, or a process benefits from a visual.
- Mermaid diagrams must use a valid Mermaid diagram type as the FIRST line inside the block, such as: flowchart TD, flowchart LR, graph TD, sequenceDiagram, classDiagram, stateDiagram-v2.
- Never invent shorthand diagram types like: triangle, pyramid, tree, chart.
- For comparison hierarchies like a testing pyramid, use flowchart TD with nodes and arrows, not a custom shape keyword.
- Avoid duplicating the same idea in two areas of the same slide.
- Avoid long paragraphs — prefer bullet lists.
- Each slide should focus on one teaching goal.
- Include 1 summary slide at the end.
${includeActivities ? "- Include 1–2 activity slides with practical discussion tasks." : ""}

## Title Slide Example
\`\`\`
layout: title-slide

@title

# Short Lecture Title
## Optional Subtitle
## COMP 7855 - Week N
### Instructor Name
\`\`\`

## Content + Code Slide Example (header-two-column)
\`\`\`
layout: header-two-column

@header

## Client-Side Rendering (CSR)

@main

The server sends a static HTML shell. JavaScript fetches JSON from the API and updates the DOM.

### Pros
- Real-time partial updates without page reload.
- Backend API is decoupled — works for web and mobile.

### Cons
- Auth tokens must be managed manually in JS.

@media

### CSR Fetch Loop

\`\`\`javascript
async function refresh() {
  const res = await fetch('/api/sensors', {
    headers: { 'Authorization': \`Bearer \${TOKEN}\` }
  });
  const data = await res.json();
  document.getElementById("temp").innerText = data.temp;
}
setInterval(refresh, 2000);
\`\`\`
\`\`\`

## Diagram Slide Example (header-two-column)
\`\`\`
layout: header-two-column

@header

## MQTT Publish / Subscribe

@main

MQTT uses a **Broker** as an intermediary. Hardware publishes to a topic; dashboards subscribe to it. The broker delivers data instantly to all subscribers.

- **Publish:** sensor sends data to \`zone1/temp\`
- **Subscribe:** dashboard listens to \`zone1/temp\`
- Lower bandwidth than HTTP polling

@media

\`\`\`mermaid
flowchart TD
    S1[Sensor 1] -- "zone1/temp" --> Broker((MQTT Broker))
    S2[Sensor 2] -- "zone2/temp" --> Broker
    Broker -- "push" --> D1[Web Dashboard]
    Broker -- "push" --> DB[Data Logger]
\`\`\`
\`\`\`

## Testing Strategy: The Pyramid Example
\`\`\`
layout: header-two-column

@header

## The Testing Pyramid

@main

A framework that dictates test distribution by balancing cost, speed, and fidelity.

### Trade-offs to Consider
- **E2E Tests:** Highest fidelity (real user flows), but slow and brittle. Use sparingly.
- **Integration:** Tests boundary contracts (e.g., API to DB). Moderate speed.
- **Unit Tests:** Lowest fidelity (isolated logic), but incredibly fast and reliable. Write abundantly.

@media

\`\`\`mermaid
flowchart TD
    E2E["E2E Tests\n(10% - High Cost)"] --> INT["Integration Tests\n(20% - Mid Cost)"]
    INT --> UNIT["Unit Tests\n(70% - Low Cost)"]
\`\`\`
\`\`\`

## Activity Slide Example
\`\`\`
layout: header-two-column
background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)

<!-- notes:
**Answer key:**
1. CSR is required for sub-second updates — SSR would need a full reload.
2. Idempotent PUT /motor/state is safer than relative increment commands.
-->

@header

## Activity: Control Panel Design

@main

### Scenario
You are building a motor control panel for a factory floor.

- **Req A:** Operators need sub-second speed feedback.
- **Req B:** A "Set Speed" API replaces an old "Increase Speed" API.

@media

### Discussion
1. Should the speed gauge use SSR or CSR? Why?
2. Is \`POST /motor/increase_speed\` idempotent? How would you redesign the API?
\`\`\`

Return only the final markdown deck — no explanations before or after it.`;
    }

    static estimateSlideCountFromPlan(lecturePlan, activityCount = 0) {
        const topicSlides = (lecturePlan.rows || [])
            .filter(row => row.type !== "break")
            .reduce((sum, row) => sum + (parseInt(row.targetSlides, 10) || 0), 0);
        const structuralSlides = 2;
        return Math.max(4, topicSlides + structuralSlides + Math.max(0, parseInt(activityCount, 10) || 0));
    }

    /**
     * Extract text from provider response shapes.
     * @param {string|Object} response - Provider response
     * @returns {string} Raw text
     */
    static extractResponseText(response) {
        if (typeof response === "string") {
            const trimmed = response.trim();
            if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
                try {
                    const parsed = JSON.parse(trimmed);
                    return this.extractResponseText(parsed);
                } catch (_e) {
                    return response;
                }
            }
            return response;
        }

        if (response && typeof response === "object") {
            const fromChoices = response?.choices?.[0]?.message?.content;
            if (typeof fromChoices === "string") {
                return fromChoices;
            }
            if (Array.isArray(fromChoices)) {
                const joined = fromChoices
                    .map(part => {
                        if (typeof part === "string") return part;
                        if (part && typeof part.text === "string") return part.text;
                        if (part && typeof part.content === "string") return part.content;
                        return "";
                    })
                    .join("")
                    .trim();
                if (joined) return joined;
            }

            const fromMessage = response?.message?.content;
            if (typeof fromMessage === "string") {
                return fromMessage;
            }
            if (Array.isArray(fromMessage)) {
                const joined = fromMessage
                    .map(part => {
                        if (typeof part === "string") return part;
                        if (part && typeof part.text === "string") return part.text;
                        if (part && typeof part.content === "string") return part.content;
                        return "";
                    })
                    .join("")
                    .trim();
                if (joined) return joined;
            }
        }

        throw new Error("Unsupported AI response shape");
    }

    /**
     * Extract markdown deck from response text.
     * @param {string} text - Raw assistant text
     * @returns {string} Deck markdown
     */
    static extractDeckMarkdown(text) {
        const source = (text || "").trim();
        if (!source) {
            throw new Error("AI returned empty response");
        }

        // Only unwrap when the entire response is a single outer markdown fence.
        // Do NOT unwrap first matching fence because deck slides can contain many code blocks.
        const outerFence = source.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i);
        const candidate = outerFence && outerFence[1] ? outerFence[1].trim() : source;

        // If model wrapped markdown inside a JSON field, try to recover.
        if ((candidate.startsWith("{") || candidate.startsWith("[")) && !candidate.includes("layout:")) {
            try {
                const parsed = JSON.parse(candidate);
                const maybe = parsed?.markdown || parsed?.deck || parsed?.content || parsed?.choices?.[0]?.message?.content;
                if (typeof maybe === "string" && maybe.includes("layout:")) {
                    return maybe.trim();
                }
            } catch (_e) {
                // ignore and continue
            }
        }

        const layoutIndex = candidate.search(/(^|\n)layout:\s*/i);
        if (layoutIndex > 0) {
            return candidate.slice(layoutIndex).trim();
        }

        return candidate;
    }

    /**
     * Remove common model meta-noise from generated deck text.
     * @param {string} markdown - Generated markdown
     * @returns {string} Clean markdown
     */
    static sanitizeMarkdown(markdown) {
        const lines = String(markdown || "").split(/\r?\n/);
        const cleaned = [];

        const bannedPrefixes = [
            /^\s*(left|right|main|media)\s*:/i,
            /^\s*mermaid\s+diagram\s*:/i,
            /^\s*(key\s+insight|practical\s+template|core\s+principles\s+to\s+remember|essential\s+components)\s*:/i
        ];

        for (const line of lines) {
            if (bannedPrefixes.some(rx => rx.test(line))) {
                continue;
            }
            cleaned.push(line);
        }

        return cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
    }

    /**
     * Validate generated markdown deck structure.
     * @param {string} markdown - Deck markdown
     * @param {number} expectedSlideCount - Expected number of slides (0 = skip count check)
     * @returns {{valid: boolean, errors: Array<string>, warnings: Array<string>}} Validation result
     */
    static validateMarkdown(markdown, expectedSlideCount = 0) {
        const errors = [];
        const warnings = [];
        const text = String(markdown || "").trim();

        if (!text) {
            errors.push("Deck is empty");
            return { valid: false, errors, warnings };
        }

        const slides = text.split(/\n---\n/).filter(Boolean);
        if (slides.length < 2) {
            errors.push("Deck should have at least 2 slides separated by ---");
        }

        slides.forEach((slide, index) => {
            if (!/\blayout\s*:\s*[a-z0-9-]+/i.test(slide)) {
                errors.push(`Slide ${index + 1}: Missing layout directive`);
            }
        });

        // Detect truncation: last non-empty line of the last slide is an area marker with no content after it
        if (slides.length > 0) {
            const lastSlide = slides[slides.length - 1];
            const nonEmptyLines = lastSlide.split('\n').map(l => l.trim()).filter(Boolean);
            const lastLine = nonEmptyLines[nonEmptyLines.length - 1] || '';
            if (/^@[a-z]/i.test(lastLine)) {
                warnings.push('Deck appears truncated: the last slide ends with an empty area marker');
            }
        }

        // Check if significantly fewer slides were generated than requested
        if (expectedSlideCount > 2 && slides.length < Math.ceil(expectedSlideCount * 0.6)) {
            warnings.push(`Only ${slides.length} slides generated (expected ~${expectedSlideCount})`);
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Count slides using the canonical separator.
     * @param {string} markdown - Deck markdown
     * @returns {number} Slide count
     */
    static countSlides(markdown) {
        return String(markdown || "").trim().split(/\n---\n/).filter(Boolean).length;
    }

    /**
     * Build a deterministic fallback markdown deck.
     * @param {string} topic - Topic
     * @param {number} slideCount - Number of slides
     * @returns {string} Fallback markdown
     */
    static generateFallbackDeck(topic, slideCount = 6) {
        const safeTitle = topic || "Generated Lesson";
        const middleSlides = Math.max(2, slideCount - 2);

        const slides = [];
        slides.push(`layout: title-slide

@title

# ${safeTitle}

## Auto-generated fallback deck

---`);

        for (let i = 1; i <= middleSlides; i += 1) {
            slides.push(`layout: header-content

@header

## Section ${i}

@main

- Key idea ${i}.1
- Key idea ${i}.2
- Example or discussion point

---`);
        }

        slides.push(`layout: header-content

@header

## Summary

@main

- Recap of key points
- Suggested next steps

---`);

        return slides.join("\n\n") + "\n";
    }
}
