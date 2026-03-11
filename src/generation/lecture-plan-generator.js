/**
 * Lecture Plan Generator
 * Generates structured lecture plans before full deck generation.
 */

import { AIProviderRegistry } from "./ai-provider-registry.js";
import { Notification } from "../renderer/notification.js";

export class LecturePlanGenerator {
    static ROW_TYPES = ["intro", "concept", "break", "summary"];

    static async generatePlan(profile, topic, options = {}) {
        if (!topic || !topic.trim()) {
            Notification.error("Topic is required");
            throw new Error("Topic is required");
        }

        const provider = AIProviderRegistry.getProvider(profile.aiProvider);
        if (!provider) {
            Notification.error("AI provider not configured.");
            throw new Error("AI provider not configured");
        }

        const totalMinutes = Math.max(20, parseInt(options.totalMinutes, 10) || 60);
        const breakCount = Math.max(0, parseInt(options.breakCount, 10) || 0);
        const activityCount = Math.max(0, parseInt(options.activityCount, 10) || 0);

        try {
            Notification.info("Generating lecture plan...");

            const response = await AIProviderRegistry.generateCompletion(
                profile.aiProvider,
                {
                    messages: [
                        { role: "system", content: this.getSystemPrompt() },
                        {
                            role: "user",
                            content: this.buildPlanPrompt(profile, topic, {
                                totalMinutes,
                                breakCount,
                                activityCount,
                                lastWeekSummary: options.lastWeekSummary
                            })
                        }
                    ],
                    maxTokens: 12000,
                    timeoutMs: 120000,
                    signal: options.signal
                }
            );

            const text = this.extractResponseText(response);
            const plan = this.parsePlanResponse(text, {
                topic,
                totalMinutes,
                breakCount,
                activityCount
            });

            const validation = this.validatePlan(plan, { totalMinutes, breakCount });
            if (!validation.valid) {
                const error = new Error("Generated lecture plan is invalid.");
                error.rawResponse = text;
                error.validationErrors = validation.errors;
                error.validationWarnings = validation.warnings;
                throw error;
            }

            if (validation.warnings.length > 0) {
                Notification.warning(validation.warnings.join(" | "));
            }

            Notification.success("Lecture plan generated successfully!");
            return plan;
        } catch (error) {
            console.error("Lecture plan generation failed:", error);

            if (error.name === "AbortError") {
                throw error;
            }

            if (error.message.includes("401")) {
                Notification.error("Invalid API key. Please check your AI configuration.");
            } else if (error.message.includes("429")) {
                Notification.error("Rate limit exceeded. Please try again later.");
            } else {
                Notification.error("Failed to generate lecture plan: " + error.message);
            }

            throw error;
        }
    }

    static getSystemPrompt() {
        return "You are an expert instructional designer who creates structured lecture plans before writing slides.";
    }

    static buildPlanPrompt(profile, topic, options) {
        const { totalMinutes, breakCount, activityCount, lastWeekSummary } = options;

        return `Create a structured lecture plan for a class session.

## Course Context
Course: ${profile.name}
${profile.description ? `Description: ${profile.description}` : ""}
${profile.prerequisites ? `Prerequisites: ${profile.prerequisites}` : ""}

## Learning Objectives
${(profile.learningObjectives || []).map(objective => `- ${objective}`).join("\n")}

${lastWeekSummary ? `## Previous Session Summary\n${lastWeekSummary}\n` : ""}

## Topic
${topic}

## Session Constraints
- Total lecture duration: ${totalMinutes} minutes
- Number of planned breaks: ${breakCount}
- Number of conceptual activity slides to include later: ${activityCount}

## Output Requirements
- Return ONLY JSON in a fenced code block with language json.
- Use this exact shape:

\`\`\`json
{
  "title": "Short lecture title",
  "totalMinutes": ${totalMinutes},
  "breakCount": ${breakCount},
  "rows": [
    {
      "type": "intro",
      "title": "Why this topic matters",
      "durationMinutes": 10,
            "targetSlides": 2,
      "notes": "Set context, connect to prior knowledge"
    },
    {
      "type": "concept",
      "title": "Core concept",
      "durationMinutes": 15,
            "targetSlides": 3,
      "notes": "Main explanation or worked example"
    },
    {
      "type": "break",
      "title": "Short break",
      "durationMinutes": 10,
            "targetSlides": 0,
      "notes": "Pause, reset attention, collect questions"
    },
    {
      "type": "summary",
      "title": "Wrap-up and next steps",
      "durationMinutes": 10,
            "targetSlides": 1,
      "notes": "Reinforce takeaways and preview next class"
    }
  ]
}
\`\`\`

## Row Rules
- Allowed row types only: intro, concept, break, summary.
- The sum of all row durations must equal exactly ${totalMinutes}.
- Include exactly ${breakCount} break row${breakCount === 1 ? "" : "s"}.
- Break rows are planning markers only. They are not deck slides.
- Every non-break row must include a rough targetSlides count.
- Break rows must use targetSlides: 0.
- Use integer durations only.
- Keep the sequence teachable: intro first, summary last, concepts in the middle.
- Focus the plan on lecture topics and pacing only. Do not include activity rows in the plan.

Return only the JSON block.`;
    }

    static extractResponseText(response) {
        if (typeof response === "string") {
            return response;
        }

        if (response && typeof response === "object") {
            const fromChoices = response?.choices?.[0]?.message?.content;
            if (typeof fromChoices === "string") {
                return fromChoices;
            }
            if (Array.isArray(fromChoices)) {
                return fromChoices.map(part => {
                    if (typeof part === "string") return part;
                    if (part && typeof part.text === "string") return part.text;
                    if (part && typeof part.content === "string") return part.content;
                    return "";
                }).join("");
            }

            const fromMessage = response?.message?.content;
            if (typeof fromMessage === "string") {
                return fromMessage;
            }
            if (Array.isArray(fromMessage)) {
                return fromMessage.map(part => {
                    if (typeof part === "string") return part;
                    if (part && typeof part.text === "string") return part.text;
                    if (part && typeof part.content === "string") return part.content;
                    return "";
                }).join("");
            }
        }

        throw new Error("Unsupported AI response shape");
    }

    static parsePlanResponse(text, defaults) {
        const jsonPayload = this.extractJsonPayload(text);
        const sanitized = this.sanitizeJSON(jsonPayload);

        try {
            const parsed = JSON.parse(sanitized);
            return this.normalizePlan(parsed, defaults);
        } catch (error) {
            console.error("Failed to parse lecture plan response:", error);
            const parseError = new Error("Failed to parse AI response as lecture plan JSON.");
            parseError.rawResponse = text;
            parseError.jsonPayload = jsonPayload;
            throw parseError;
        }
    }

    static extractJsonPayload(responseText) {
        const trimmed = String(responseText || "").trim();
        const fenceMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
        if (fenceMatch?.[1]) {
            return fenceMatch[1].trim();
        }

        const objectMatch = trimmed.match(/\{[\s\S]*\}/);
        if (objectMatch) {
            return objectMatch[0];
        }

        return trimmed;
    }

    static sanitizeJSON(str) {
        let result = "";
        let inString = false;
        let escapeNext = false;

        for (let index = 0; index < str.length; index += 1) {
            const char = str[index];

            if (escapeNext) {
                result += char;
                escapeNext = false;
            } else if (char === "\\") {
                result += char;
                escapeNext = true;
            } else if (char === '"') {
                inString = !inString;
                result += char;
            } else if (inString) {
                if (char === "\n") {
                    result += "\\n";
                } else if (char === "\r") {
                    result += "\\r";
                } else if (char === "\t") {
                    result += "\\t";
                } else {
                    result += char;
                }
            } else {
                result += char;
            }
        }

        return result;
    }

    static normalizePlan(rawPlan, defaults = {}) {
        const rowsSource = Array.isArray(rawPlan) ? rawPlan : (Array.isArray(rawPlan?.rows) ? rawPlan.rows : []);
        const rows = rowsSource.map((row, index) => this.normalizeRow(row, index));
        const topic = defaults.topic || rawPlan?.topic || rawPlan?.title || "Generated Lecture";

        return {
            title: String(rawPlan?.title || topic).trim() || topic,
            topic,
            totalMinutes: Math.max(1, parseInt(rawPlan?.totalMinutes, 10) || defaults.totalMinutes || this.sumMinutes(rows)),
            breakCount: Math.max(0, parseInt(rawPlan?.breakCount, 10) || defaults.breakCount || rows.filter(row => row.type === "break").length),
            activityCount: Math.max(0, parseInt(rawPlan?.activityCount, 10) || defaults.activityCount || 0),
            rows
        };
    }

    static normalizeRow(row, index) {
        const rawType = String(row?.type || row?.kind || "concept").trim().toLowerCase();
        const type = this.normalizeType(rawType);
        const durationMinutes = Math.max(1, parseInt(row?.durationMinutes ?? row?.minutes ?? row?.duration, 10) || this.getDefaultDuration(type));
        const title = String(row?.title || this.getDefaultTitle(type, index)).trim() || this.getDefaultTitle(type, index);
        const notes = String(row?.notes || row?.teachingGoal || row?.goal || row?.description || "").trim();

        return {
            id: String(row?.id || `plan-row-${index + 1}`),
            type,
            title,
            durationMinutes,
            targetSlides: type === "break"
                ? 0
                : Math.max(1, parseInt(row?.targetSlides ?? row?.slides ?? row?.slideCount, 10) || this.getDefaultTargetSlides(type)),
            notes
        };
    }

    static normalizeType(type) {
        const aliases = {
            opener: "intro",
            opening: "intro",
            title: "intro",
            lecture: "concept",
            explanation: "concept",
            pause: "break",
            intermission: "break",
            recap: "summary",
            conclusion: "summary",
            closing: "summary"
        };
        const normalized = aliases[type] || type;
        return this.ROW_TYPES.includes(normalized) ? normalized : "concept";
    }

    static validatePlan(plan, constraints = {}) {
        const errors = [];
        const warnings = [];
        const rows = Array.isArray(plan?.rows) ? plan.rows : [];
        const totalMinutes = Math.max(0, parseInt(constraints.totalMinutes ?? plan?.totalMinutes, 10) || 0);
        const expectedBreaks = Math.max(0, parseInt(constraints.breakCount ?? plan?.breakCount, 10) || 0);
        const allocatedMinutes = this.sumMinutes(rows);
        const actualBreaks = rows.filter(row => row.type === "break").length;

        if (rows.length === 0) {
            errors.push("Lecture plan has no rows");
        }

        rows.forEach((row, index) => {
            if (!this.ROW_TYPES.includes(row.type)) {
                errors.push(`Row ${index + 1}: Invalid type`);
            }
            if (!row.title || !row.title.trim()) {
                errors.push(`Row ${index + 1}: Missing title`);
            }
            if (!Number.isFinite(row.durationMinutes) || row.durationMinutes < 1) {
                errors.push(`Row ${index + 1}: Duration must be at least 1 minute`);
            }
            if (row.type === "break" && row.targetSlides !== 0) {
                errors.push(`Row ${index + 1}: Break rows must have 0 target slides`);
            }
            if (row.type !== "break" && (!Number.isFinite(row.targetSlides) || row.targetSlides < 1)) {
                errors.push(`Row ${index + 1}: Teaching rows must have at least 1 target slide`);
            }
        });

        if (totalMinutes > 0 && allocatedMinutes !== totalMinutes) {
            errors.push(`Allocated minutes (${allocatedMinutes}) must equal requested duration (${totalMinutes})`);
        }

        if (actualBreaks !== expectedBreaks) {
            errors.push(`Expected ${expectedBreaks} break row${expectedBreaks === 1 ? "" : "s"}, found ${actualBreaks}`);
        }

        const nonBreakRows = rows.filter(row => row.type !== "break");
        if (nonBreakRows.length < 2) {
            errors.push("Lecture plan needs at least two teaching rows");
        }

        if (rows[0] && rows[0].type === "break") {
            warnings.push("The lecture plan starts with a break row");
        }
        if (rows[rows.length - 1] && rows[rows.length - 1].type === "break") {
            warnings.push("The lecture plan ends with a break row");
        }
        if (!rows.some(row => row.type === "intro")) {
            warnings.push("No intro row detected");
        }
        if (!rows.some(row => row.type === "summary")) {
            warnings.push("No summary row detected");
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            allocatedMinutes,
            expectedMinutes: totalMinutes,
            actualBreaks,
            expectedBreaks
        };
    }

    static generateFallbackPlan(topic, options = {}) {
        const totalMinutes = Math.max(20, parseInt(options.totalMinutes, 10) || 60);
        const breakCount = Math.max(0, parseInt(options.breakCount, 10) || 0);
        const activityCount = Math.max(0, parseInt(options.activityCount, 10) || 0);
        const breakDuration = breakCount > 0 ? Math.max(5, Math.min(10, Math.floor(totalMinutes / Math.max(5, breakCount + 4)))) : 0;
        const teachingMinutes = Math.max(10, totalMinutes - (breakDuration * breakCount));

        const teachingRows = [
            {
                type: "intro",
                title: `Why ${topic} matters`,
                targetSlides: 2,
                notes: "Frame the problem, connect to prior knowledge"
            },
            {
                type: "concept",
                title: `Core ideas in ${topic}`,
                targetSlides: 3,
                notes: "Define the key vocabulary and mental model"
            },
            {
                type: "concept",
                title: `${topic} in practice`,
                targetSlides: 3,
                notes: "Worked example, architecture, or applied scenario"
            },
            {
                type: "summary",
                title: "Key takeaways and next steps",
                targetSlides: 1,
                notes: "Close the loop and preview follow-up work"
            }
        ];

        const allocatedTeachingRows = this.assignDurations(teachingRows, teachingMinutes);
        const rows = this.insertBreakRows(allocatedTeachingRows, breakCount, breakDuration);

        return {
            title: String(topic || "Generated Lecture").trim() || "Generated Lecture",
            topic,
            totalMinutes,
            breakCount,
            activityCount,
            rows: rows.map((row, index) => ({
                id: `plan-row-${index + 1}`,
                ...row
            }))
        };
    }

    static assignDurations(rows, totalMinutes) {
        const weights = rows.map(row => {
            switch (row.type) {
                case "intro":
                    return 1.1;
                case "activity":
                    return 1.3;
                case "summary":
                    return 0.9;
                default:
                    return 1.2;
            }
        });
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        const allocated = rows.map((row, index) => ({
            ...row,
            durationMinutes: Math.max(5, Math.floor((totalMinutes * weights[index]) / totalWeight))
        }));

        let remainder = totalMinutes - this.sumMinutes(allocated);
        let pointer = 0;
        while (remainder !== 0 && allocated.length > 0) {
            const direction = remainder > 0 ? 1 : -1;
            const row = allocated[pointer % allocated.length];
            if (direction > 0 || row.durationMinutes > 5) {
                row.durationMinutes += direction;
                remainder -= direction;
            }
            pointer += 1;
        }

        return allocated;
    }

    static insertBreakRows(rows, breakCount, breakDuration) {
        if (breakCount < 1) {
            return rows;
        }

        const result = [...rows];
        for (let index = 0; index < breakCount; index += 1) {
            const insertAfter = Math.min(
                result.length - 1,
                Math.max(1, Math.round(((index + 1) * rows.length) / (breakCount + 1)))
            );
            result.splice(insertAfter + index, 0, {
                type: "break",
                title: `Break ${index + 1}`,
                durationMinutes: breakDuration,
                notes: "Pause, stretch, and collect questions"
            });
        }
        return result;
    }

    static sumMinutes(rows) {
        return rows.reduce((sum, row) => sum + (parseInt(row.durationMinutes, 10) || 0), 0);
    }

    static getDefaultDuration(type) {
        switch (type) {
            case "intro":
                return 10;
            case "break":
                return 10;
            case "summary":
                return 10;
            default:
                return 12;
        }
    }

    static getDefaultTargetSlides(type) {
        switch (type) {
            case "intro":
                return 2;
            case "summary":
                return 1;
            case "break":
                return 0;
            default:
                return 2;
        }
    }

    static getDefaultTitle(type, index) {
        switch (type) {
            case "intro":
                return "Opening and context";
            case "break":
                return `Break ${index + 1}`;
            case "summary":
                return "Summary and next steps";
            default:
                return `Concept ${index + 1}`;
        }
    }
}