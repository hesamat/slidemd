/**
 * PPTX import code-language detection and fence tagging.
 *
 * The converter emits bare ``` fences for monospace content. This module tags
 * them: `auto` detects the language of each block, an explicit language forces
 * every block, `none` leaves fences bare. The CLI (`tools/pptx-import.mjs`)
 * and the import modal (`conversion-modal.js`) both call `applyCodeLanguages`
 * so they cannot drift apart again.
 *
 * Detection is deliberately conservative — a wrong tag is worse than none
 * (an untagged block can be tagged later by AI polish, a mistagged one will
 * not):
 *   1. Decisive shortcuts: Python REPL transcripts (`>>> `), JSON that parses.
 *   2. A weighted signature table per language picks the best match when it
 *      clears a score floor and a margin over the runner-up. This exists
 *      because highlight.js alone misfires on short snippets (a Java class
 *      scores higher as TypeScript; prose fires SQL at low relevance).
 *   3. highlight.js `highlightAuto` (restricted to the supported subset) as
 *      the fallback for blocks the signatures do not recognize, gated on a
 *      relevance floor.
 */

import { safeString } from "../core/utils.js";

/** Languages the deck markdown's code highlighting supports (mirrors the
 * import modal's dropdown and the CLI's `--code-language` choices). */
export const CODE_LANGUAGES = [
  "javascript",
  "python",
  "java",
  "cpp",
  "html",
  "css",
  "sql",
  "bash",
  "json",
  "typescript",
];

/** highlight.js language id → deck fence language. */
const HLJS_TO_DECK = new Map([
  ["javascript", "javascript"],
  ["typescript", "typescript"],
  ["python", "python"],
  ["java", "java"],
  ["c", "cpp"],
  ["cpp", "cpp"],
  ["xml", "html"],
  ["html", "html"],
  ["css", "css"],
  ["sql", "sql"],
  ["bash", "bash"],
  ["shell", "bash"],
  ["json", "json"],
]);

/** Candidate ids passed to `highlightAuto` (html is `xml` in highlight.js). */
const HLJS_SUBSET = [
  "python",
  "javascript",
  "typescript",
  "java",
  "cpp",
  "xml",
  "css",
  "sql",
  "bash",
  "json",
];

/**
 * Weighted per-language signatures: [regex, weight, cap]. Each match adds the
 * weight, counted up to `cap` times so a long block cannot run one weak
 * signal up indefinitely. Idioms are chosen to be (near-)exclusive to the
 * language so the argmax is meaningful; generic constructs are left out.
 * @type {Array<[string, Array<[RegExp, number, number]>]>}
 */
const SIGNATURES = [
  [
    "python",
    [
      [/^\s*def\s+\w+\s*\(/m, 3, 2],
      [/^\s*from\s+[\w.]+\s+import\s/m, 3, 1],
      [/^\s*import\s+\w+/m, 2, 1],
      [/\bprint\s*\(/, 2, 1],
      [/\bself\./, 2, 1],
      [/\belif\b/, 2, 1],
      [/__name__\s*==/, 3, 1],
      [/#\s\w+/, 1, 2],
      // Trailing-colon control lines (`for x in y:`, `with open(p) as f:`,
      // `try:`), optionally followed by an inline comment (`if a > b: # or
      // >=`) — bash control flow uses `; do`/`then` instead, css has none.
      [/^\s*(for|while|if|elif|with|try|except)\b[^;{}\n]*:\s*(#.*)?$/m, 2, 2],
      // Quoted dict keys, anywhere in the line: 'Canada': 'Ottawa' /
      // student_summary = {"keanu": grades}
      [/['"][\w .-]{1,40}['"]\s*:\s/, 2, 2],
    ],
  ],
  [
    "java",
    [
      [/System\.out\.print/, 3, 1],
      [/\bpublic\s+class\b/, 3, 1],
      [/\bpublic\s+static\s+void\s+main\b/, 3, 1],
      [/\bimport\s+javax?\./, 2, 1],
      [/\bprivate\s+(final\s+)?\w+\s+\w+\s*[;=]/, 2, 1],
    ],
  ],
  [
    "cpp",
    [
      [/#include\s*[<"]/, 3, 2],
      [/\bstd::/, 3, 1],
      [/\b(cout|cin|cerr)\s*(<<|>>)/, 3, 1],
      [/\bint\s+main\s*\(/, 2, 1],
      [/\bnullptr\b/, 2, 1],
    ],
  ],
  [
    "sql",
    [
      [/\bSELECT\b[\s\S]{0,400}?\bFROM\b/i, 3, 1],
      [/\bINSERT\s+INTO\b/i, 3, 1],
      [/\bCREATE\s+(TABLE|VIEW|INDEX)\b/i, 3, 1],
      [/\bUPDATE\s+\w+\s+SET\b/i, 3, 1],
      [/\b(GROUP|ORDER)\s+BY\b/i, 2, 1],
      [/\bJOIN\b/i, 1, 1],
    ],
  ],
  [
    "bash",
    [
      [/^#!\s*\/(usr\/bin\/env\s+)?(ba|z|k)?sh\b/m, 3, 1],
      [/\b(apt(-get)?|brew|yum|dnf)\s+install\b/, 3, 1],
      [/\bsudo\s+/, 2, 1],
      [/^\s*(if|for|while)\s+\[/m, 2, 1],
      [/\bexport\s+\w+=/, 2, 1],
      [/\$\([^)]+\)/, 1, 1],
      [/^\s*echo\s+/m, 1, 1],
    ],
  ],
  [
    "html",
    [
      [/<!DOCTYPE\s+html/i, 3, 1],
      [/<\/(html|head|body|div|p|ul|ol|table|section)\s*>/i, 2, 2],
      [/<(html|head|body|div|span|p|a|h[1-6]|ul|li|table|tr|td|img|br)\b[^>]*>/i, 1, 2],
    ],
  ],
  [
    "css",
    [
      // Rule with declarations. The pre-brace part must not contain `=` — a
      // Python dict literal (`capitals = { 'Canada': 'Ottawa' }`) otherwise
      // reads as a selector with declarations.
      [/^[^{}\n=]{1,80}\{[^{}]*:[^{}]*;?\s*\}/m, 3, 1],
      [/^[.#][\w-]+\s*\{/m, 2, 1],
      [/:(hover|focus|active|before|after)\b/, 2, 1],
      [/^\s*[a-z-]+\s*:\s*[^;{}]+;\s*$/m, 1, 2],
    ],
  ],
  [
    "typescript",
    [
      [/\binterface\s+\w+\s*\{/, 3, 1],
      [/\benum\s+\w+\s*\{/, 3, 1],
      [/:\s*(string|number|boolean|any|void|unknown)\b/, 2, 2],
      [/\btype\s+\w+\s*=\s*[{ "|]/m, 2, 1],
      [/\bimplements\s+\w+/, 2, 1],
    ],
  ],
  [
    "javascript",
    [
      [/\bconsole\.log\s*\(/, 3, 1],
      [/\bmodule\.exports\b/, 3, 1],
      [/\b(const|let)\s+\w+\s*=/m, 2, 2],
      [/=>/, 2, 1],
      [/\bfunction\s+\w+\s*\(/m, 2, 1],
      [/\brequire\s*\(\s*["']/, 2, 1],
      [/\bdocument\.\w+/, 1, 1],
    ],
  ],
];

/** Minimum signature score before a language is considered. Weight-2 idioms
 * (`print(`, `const x =`, `: string`, `sudo `) are language-exclusive enough
 * to stand alone; anything weaker (weight 1) cannot reach this floor alone. */
const MIN_SIGNATURE_SCORE = 2;
/** The winner must beat the runner-up by at least this much. */
const SIGNATURE_MARGIN = 2;
/** Minimum highlightAuto relevance for the fallback path. */
const MIN_HLJS_RELEVANCE = 8;

// highlight.js grammars are imported statically: a template-literal dynamic
// import over package subpaths cannot be analyzed by Vite and would fail at
// runtime in the browser. Static imports work in Vite and plain Node; the
// bundle stays lean because the modal loads this whole module lazily.
import hljsCore from "highlight.js/lib/core";
import hljsJavascript from "highlight.js/lib/languages/javascript";
import hljsTypescript from "highlight.js/lib/languages/typescript";
import hljsPython from "highlight.js/lib/languages/python";
import hljsJava from "highlight.js/lib/languages/java";
import hljsCpp from "highlight.js/lib/languages/cpp";
import hljsXml from "highlight.js/lib/languages/xml";
import hljsCss from "highlight.js/lib/languages/css";
import hljsSql from "highlight.js/lib/languages/sql";
import hljsBash from "highlight.js/lib/languages/bash";
import hljsJson from "highlight.js/lib/languages/json";

hljsCore.registerLanguage("javascript", hljsJavascript);
hljsCore.registerLanguage("typescript", hljsTypescript);
hljsCore.registerLanguage("python", hljsPython);
hljsCore.registerLanguage("java", hljsJava);
hljsCore.registerLanguage("cpp", hljsCpp);
hljsCore.registerLanguage("xml", hljsXml);
hljsCore.registerLanguage("css", hljsCss);
hljsCore.registerLanguage("sql", hljsSql);
hljsCore.registerLanguage("bash", hljsBash);
hljsCore.registerLanguage("json", hljsJson);

/**
 * Detect the language of one fenced code block. Pure and synchronous — pass
 * a highlight.js instance to enable the fallback path (`applyCodeLanguages`
 * loads it once and passes it in for every block).
 *
 * @param {string} code - The block's content (between the fences).
 * @param {object|null} [hljs] - Loaded highlight.js core, when available.
 * @returns {string} One of CODE_LANGUAGES, or "" when not confident.
 */
export function detectCodeLanguage(code, hljs = null) {
  const text = safeString(code);
  const trimmed = text.trim();
  if (!trimmed) return "";

  // Decisive shortcuts.
  // A Python REPL transcript is unmistakable (the `... ` continuation alone
  // is not — prose lines can start with an ellipsis).
  if (/^\s*>>>(\s|$)/m.test(text)) return "python";
  // JSON: only when it actually parses — `{` also opens many other languages.
  if (/^[{[]/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // fall through
    }
  }

  // Weighted signature vote.
  const runnerUp = { lang: "", score: 0 };
  let best = { lang: "", score: 0 };
  for (const [lang, signals] of SIGNATURES) {
    let score = 0;
    for (const [re, weight, cap] of signals) {
      const matches = text.match(
        new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"),
      );
      if (matches) score += weight * Math.min(matches.length, cap);
    }
    if (score > best.score) {
      runnerUp.lang = best.lang;
      runnerUp.score = best.score;
      best = { lang, score };
    } else if (score > runnerUp.score) {
      runnerUp.lang = lang;
      runnerUp.score = score;
    }
  }
  if (
    best.lang &&
    best.score >= MIN_SIGNATURE_SCORE &&
    best.score - runnerUp.score >= SIGNATURE_MARGIN
  ) {
    return best.lang;
  }

  // highlight.js fallback for blocks the signatures do not recognize.
  if (hljs) {
    try {
      const result = hljs.highlightAuto(text, HLJS_SUBSET);
      if (result && result.relevance >= MIN_HLJS_RELEVANCE && result.language) {
        return HLJS_TO_DECK.get(result.language) || "";
      }
    } catch {
      // Detection is best-effort; an hljs error must not break the import.
    }
  }
  return "";
}

/**
 * Tag (or untag) the opening fences of every fenced code block in slide
 * markdown. Opening and closing fences are told apart with a toggle state
 * machine — matching how the converter emits fences (column-0 ``` lines).
 *
 * @param {string} markdown
 * @param {string} mode - "auto" (detect each block), "none" (strip tags), or
 *   one of CODE_LANGUAGES (force onto every block).
 * @returns {Promise<string>} The tagged markdown.
 */
export async function applyCodeLanguages(markdown, mode) {
  const md = safeString(markdown);
  const normalized = String(mode || "").toLowerCase();
  if (normalized === "" || normalized === "none") {
    return stripFenceLanguages(md);
  }

  // "auto": per-block detection with the highlight.js fallback; an explicit
  // language tags every block without consulting the detector.
  const detect = normalized === "auto" ? (block) => detectCodeLanguage(block, hljsCore) : null;

  const lines = md.split("\n");
  let inCode = false;
  let openIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("```")) continue;
    if (!inCode) {
      inCode = true;
      openIndex = i;
      // Explicit mode needs no block content — tag the opening fence at once
      // so even an unclosed trailing fence gets tagged.
      if (normalized !== "auto") lines[i] = "```" + normalized;
    } else {
      inCode = false;
      if (normalized === "auto") {
        const lang = detect(lines.slice(openIndex + 1, i).join("\n"));
        if (lang) lines[openIndex] = "```" + lang;
      }
    }
  }
  return lines.join("\n");
}

/**
 * Remove language tags from opening fences (the `none` mode): ```python → ```.
 * @param {string} markdown
 * @returns {string}
 */
function stripFenceLanguages(markdown) {
  const lines = markdown.split("\n");
  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("```")) continue;
    if (!inCode) {
      inCode = true;
      if (lines[i].length > 3) lines[i] = "```";
    } else {
      inCode = false;
    }
  }
  return lines.join("\n");
}
