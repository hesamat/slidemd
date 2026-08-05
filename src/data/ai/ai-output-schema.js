/**
 * Defines the expected Markdown structure for each AI intent.
 * Used by AiOutputValidator to know what to check.
 *
 * @typedef {Object} AiOutputSchema
 * @property {number} minSlides
 * @property {number} maxSlides  — null = unbounded
 * @property {boolean} requireLayout — every slide must have a layout directive
 * @property {boolean} checkAreaValidity — validate @area markers against layout
 * @property {boolean} checkContentRules — enforce #150 content rules
 */

export const SCHEMAS = {
  fix: {
    minSlides: 1,
    maxSlides: null,
    requireLayout: false, // fix mode preserves existing layouts
    checkAreaValidity: true,
    checkContentRules: true,
  },
  generate: {
    minSlides: 1,
    maxSlides: null,
    requireLayout: true, // generate mode assigns layouts
    checkAreaValidity: true,
    checkContentRules: true,
  },
  // Stubs for Phase 13 intents — not used yet but defined here:
  enhanceSlide: {
    minSlides: 1,
    maxSlides: 1,
    requireLayout: false,
    checkAreaValidity: true,
    checkContentRules: true,
  },
  summarize: {
    minSlides: 1,
    maxSlides: 1,
    requireLayout: false,
    checkAreaValidity: true,
    checkContentRules: true,
  },
  toMetricCards: {
    minSlides: 1,
    maxSlides: 1,
    requireLayout: false,
    checkAreaValidity: true,
    checkContentRules: true,
  },
  addSpeakerNotes: {
    minSlides: 1,
    maxSlides: 1,
    requireLayout: false,
    checkAreaValidity: false, // notes don't change layout
    checkContentRules: false,
  },
};

export function getSchema(intent) {
  return SCHEMAS[intent] || SCHEMAS.fix;
}
