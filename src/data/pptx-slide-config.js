/**
 * PPTX Conversion Constants
 *
 * Shared configuration for PPTX-to-SlideMD conversion.
 * Extracted from pptx-to-slide-md.js for reuse and clarity.
 */

// Layout Definitions
export const LAYOUT = {
  TITLE_SLIDE: { type: "title-slide", spec: "title-slide" },
  FOCUS: { type: "focus", spec: "focus" },
  HEADER_CONTENT: { type: "header-content", spec: "header-content" },
  TWO_COLUMN: { type: "two-column", spec: "two-column" },
  MEDIA_SPAN: { type: "media-span", spec: "media-span-right" },
  MEDIA_SPAN_LEFT: { type: "media-span", spec: "media-span-left" },
  MEDIA_SPAN_RIGHT: { type: "media-span", spec: "media-span-right" },
  THREE_COLUMN: { type: "three-column", spec: "three-column" },
  FULL_IMAGE: { type: "full-image", spec: "full-image" },
};

// Conversion Ratios & Normalization Thresholds
export const CONVERSION = {
  EMU_PER_POINT: 12700,
  EMU_THRESHOLD: 10000, // Value threshold above which numbers are treated as EMUs
  POINTS_TO_PX: 96 / 72, // DPI point-to-pixel scale ratio (72 points = 96 pixels)
  INDENT_DIVISOR: 2,
};

export const DEFAULT_SLIDE_SIZE = {
  WIDTH_EMU: 9144000,
  HEIGHT_EMU: 5143500,
};

export const DEFAULTS = {
  DECK_NAME: "presentation",
  IMAGE_FILENAME: "image.png",
  IMAGE_MIME_PNG: ".png",
  IMAGE_SUBDIR: "images/",
  NOTES_COMMENT_START: "<!-- notes: ",
  NOTES_COMMENT_END: " -->",
  CHART_COMMENT_PREFIX: "<!-- ",
  CHART_COMMENT_SUFFIX: " -->",
  CHART_PLACEHOLDER: "[Chart]",
};

export const ELEMENT_TYPES = {
  FOOTER: "footer",
  TEXT: "text",
  IMAGE: "image",
  TABLE: "table",
  CHART: "chart",
  DIAGRAM: "diagram",
};

export const MARKDOWN_TAGS = {
  TITLE: "@title",
  HEADER: "@header",
  MAIN: "@main",
  MEDIA: "@media",
  SECONDARY: "@secondary",
  FOOTER: "@footer",
};

export const LUMINANCE = {
  RED_COEFF: 299,
  GREEN_COEFF: 587,
  BLUE_COEFF: 114,
  SCALE_DIVISOR: 1000,
  DARK_THRESHOLD: 128,
  HEX_MIN_LENGTH: 6,
};

export const REGEX = {
  BULLET: /^(?:[\u2022\u2023\u25E6\u2043\u2219•-]\s*)+/,
  NUMBER: /^\d+[.)]\s*/,
  HEADING_MARKER: /^#{1,3}\s/,
  BULLET_LINE: /(?:^|\n)\s*[-*•]\s/,
  NUMBER_LINE: /(?:^|\n)\s*\d+[.)]\s/,
  CODE_BLOCK: /```/,
  BOLD_HEADING: /^\*\*[^*]+\*\*$/,
  HEADING_REPLACE: /^#{1,3}\s+/,
  NOTES_HTML_COMMENT_START: /<!--/g,
  NOTES_HTML_COMMENT_END: /-->/g,
  NOTES_HTML_BR: /<br\s*\/?>/gi,
  NOTES_HTML_TAGS: /<[^>]+>/g,
  IMAGE_VECTOR_EXT: /\.(emf|wmf)$/i,
  DECK_NAME_SANITIZE: /[^a-zA-Z0-9_-]/g,
  FILE_EXTENSION: /\.[^.]+$/,
  HYPHEN_UNDERSCORE: /[-_]/g,
  NEWLINE_CRLF: /\r\n?/g,
  NEWLINE: /\n/g,
  PIPE: /\|/g,
  ESCAPE_PIPE: "\\|",
  DOUBLE_NEWLINE: "\n\n",
  TRIPLE_NEWLINE_OR_MORE: /\n{3,}/g,
};

export const CONFIG = {
  bodyTopRatio: 0.22,
  rowMaxVerticalDiffRatio: 0.1,
  minColumnSpreadRatio: 0.15,
  maxTitleLength: 300,
  maxTitleElements: 3,
  headerThinRatio: 0.4,
  maxHeaderHeightRatio: 0.35,
  centerToleranceRatio: 0.1,
  minSubstantialBodyLength: 80,
  maxHeaderLength: 150,
  maxHeaderLengthShort: 80,
  // A plain (non-marker) title must span at least this fraction of the slide
  // width — narrow top text (slide numbers, dates, labels) is not a title.
  minTitleWidthRatio: 0.3,
  minMediaAreaRatio: 0.005,
  maxMediaAreaRatio: 0.85,
  maxLogoAreaRatio: 0.015,
  maxBackgroundCardRatio: 1.5,
  minDominantAreaRatio: 0.05,
  thinLineThresholdPoints: 15,
  microNoiseThresholdPoints: 150,
  // Top band (fraction of slide height): small images inside it are dropped
  // only when a real header-like title is present. The same band is used for
  // small icons beside titles, keeping one source of truth for header height.
  marginBottomRatio: 0.9,
  aspectRatioUpperLimit: 8,
  aspectRatioLowerLimit: 0.125,
  overlapRatioThreshold: 0.5,
  dominantImageThreshold: 0.6,
  backgroundOverlapThreshold: 0.1,
  spreadOverlapThreshold: 0.5,
  partitionMidTolerance: 0.05,
  tallColumnHeightRatio: 0.5,
  fullScreenTableThreshold: 0.8,
  flexRowVerticalTolerance: 0.15,
  flexRowMinHorizontalGap: 0.1,
  // Overflow detection, calibrated to the fixed 1920x1080 render geometry
  // (not the source deck's page size, which varies between PowerPoint
  // templates): the vertical space available to a slide's body area, and the
  // rendered height (px) per content line. When the body of a single-column
  // slide needs more space than the area provides, the layout is upgraded to
  // two-column and content is split. Line heights reflect the renderer's
  // typography: h3 32px x 1.3 + margins, body 24px x 1.4, code 22px, blank.
  overflowBodyAreaHeight: 760,
  overflowLineHeightHeading: 58,
  overflowLineHeightBody: 34,
  overflowLineHeightCode: 28,
  overflowLineHeightBlank: 16,
  overflowWrapLength: 60,
};
