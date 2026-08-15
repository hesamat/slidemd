<!-- variant: fix -->

CRITICAL: You must return EXACTLY {{actualCount}} slide(s) — one for each "SLIDE INDEX" comment in the input (indices {{startIdx}} through {{endIdx}}). Do NOT return context slides. Each output slide must include the same "SLIDE INDEX" comment as its first line.
<!-- variant: generate -->

CRITICAL: Return exactly {{actualCount}} slide(s) as JSON — one for each "SLIDE INDEX" comment in the input (indices {{startIdx}} through {{endIdx}}). Do NOT return context slides, do NOT split a brief into multiple slides, and do NOT merge briefs into fewer slides.

Output format: a single JSON object with a "slides" array. Each slide object must have:

- "layout": one of the allowed layouts.
- "content": the SlideMD body as a JSON string. Use `\n` for all line breaks inside this string.

The first line of each "content" string must be the same `<!-- SLIDE INDEX n (return this) -->` comment from the input, where n matches the slide index.
