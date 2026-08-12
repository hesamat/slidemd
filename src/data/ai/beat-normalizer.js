/**
 * Beat Normalizer
 *
 * A small deterministic post-processing step after the Breakdown AI.
 * Its purpose is only to catch obvious bad outputs, not to redesign the
 * sequence.
 *
 * Rules:
 * 1. If the first slide is `divider`, `punctuation`, or `emotional`, change it to
 *    `continuation` (a high-impact beat on slide 1 has no preceding state to
 *    transition from).
 * 2. If two high-impact beats (`punctuation`, `emotional`, `divider`) occur
 *    consecutively, downgrade the second to `continuation`.
 * 3. Preserve all other model decisions.
 */

/**
 * @typedef {Object} SlideBeat
 * @property {('continuation'|'transition'|'punctuation'|'emotional'|'divider')} visualBeat
 * @property {('low'|'medium'|'high')} energy
 * @property {('subtle'|'moderate'|'strong')} contrast
 * @property {('continue'|'break')} relationship
 * @property {string} [imageQuery]
 */

const HIGH_IMPACT_BEATS = new Set(["punctuation", "emotional", "divider"]);

/**
 * Normalize the visual beats across a flat list of slides.
 * Mutates each slide's `visualBeat` in place and returns the same array.
 *
 * @param {Array<{visualBeat: string}>} slides — flat list of slide objects with a `visualBeat` field
 * @returns {Array<{visualBeat: string}>}
 */
export function normalizeBeats(slides) {
  if (!Array.isArray(slides) || slides.length === 0) return slides;

  // Rule 1: first slide cannot be a high-impact beat.
  if (HIGH_IMPACT_BEATS.has(slides[0].visualBeat)) {
    slides[0].visualBeat = "continuation";
  }

  // Rule 2: no two consecutive high-impact beats.
  for (let i = 1; i < slides.length; i++) {
    if (
      HIGH_IMPACT_BEATS.has(slides[i].visualBeat) &&
      HIGH_IMPACT_BEATS.has(slides[i - 1].visualBeat)
    ) {
      slides[i].visualBeat = "continuation";
    }
  }

  return slides;
}
