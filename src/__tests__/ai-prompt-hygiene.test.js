/**
 * Automated prompt hygiene checks.
 *
 * Enforces the rules documented in AGENTS.md ("AI Prompt Engineering"):
 * - manifest / fragment files stay in sync
 * - layout list stays in sync with the layout registry
 * - combined system + user prompt stays under ~150 lines
 * - strong negative directives stay around the ~5 per prompt limit
 * - every intent composes without dangling placeholders
 */

import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FRAGMENTS,
  getAllowedLayoutList,
  getFragment,
  getManifest,
  composeMessages,
  parseVariants,
} from "../data/ai/ai-prompt-fragments.js";
import { LayoutData } from "../data/layout-data.js";
import {
  buildMessagesForIntent,
  buildPolishMessages,
  listIntents,
} from "../data/ai/ai-intent-registry.js";
import { buildBatchMessages } from "../data/ai/ai-prompt-builder.js";

const PROMPTS_DIR = path.resolve(fileURLToPath(import.meta.url), "../../data/prompts");

const FIXTURE_DECK = `layout: title-slide
background: #1a1a2e
theme: dark

@title

# AI for Presentations

@footer

Speaker Name

---

layout: two-column

@header

## Why SlideMD

@main

- Markdown-driven
- Offline-first
- Deterministic layout

@media

![diagram](images/chart.png)

---

layout: header-content

@header

## Roadmap

@main

\`\`\`js
const x = 1;
console.log(x);
\`\`\`

- Ship v1.0
- Add themes
- Export PDF
`;

const NEGATIVE_DIRECTIVE_RE = /do not|never|don't|must not|forbidden|prohibited/gi;
const MAX_NEGATIVE_DIRECTIVES = 5;
const MAX_COMBINED_LINES = 150;

// Whole-deck flow consumers that compose prompts but are not registered
// intents in ai-intent-registry.js (polish / remix plan / reimagine outline).
const FLOW_CONSUMER_INTENTS = new Set(["polish", "remixPlan", "reimagineOutline"]);

describe("prompt manifest", () => {
  it("lists exactly the files in src/data/prompts/", () => {
    // Every non-manifest file in the directory must be cataloged — not just
    // .md files, so a new fragment format (e.g. .txt or .json) is caught too.
    const onDisk = readdirSync(PROMPTS_DIR)
      .filter((f) => f !== "manifest.json")
      .sort();
    const inManifest = getManifest()
      .fragments.map((f) => f.file)
      .sort();
    expect(inManifest).toEqual(onDisk);
  });

  it("matches the fragments module exports", () => {
    const inManifest = getManifest()
      .fragments.map((f) => f.file)
      .sort();
    const inModule = Object.keys(FRAGMENTS).sort();
    expect(inModule).toEqual(inManifest);
  });

  it("has valid roles and unique files", () => {
    const files = new Set();
    for (const entry of getManifest().fragments) {
      expect(["system", "user", "snippet"]).toContain(entry.role);
      expect(files.has(entry.file)).toBe(false);
      files.add(entry.file);
      // Every fragment must load — a stale reference fails loudly here.
      expect(getFragment(entry.file).length).toBeGreaterThan(0);
    }
  });

  it("declares intents that correspond to real prompt consumers", () => {
    const registryIntents = new Set(listIntents());
    for (const entry of getManifest().fragments) {
      if (entry.intent === null) continue;
      const known = registryIntents.has(entry.intent) || FLOW_CONSUMER_INTENTS.has(entry.intent);
      expect(
        known,
        `${entry.file} declares unknown intent "${entry.intent}" (registry: ${[...registryIntents].join(", ")}, flows: ${[...FLOW_CONSUMER_INTENTS].join(", ")})`,
      ).toBe(true);
    }
  });
});

describe("layout list sync", () => {
  it("covers every layout with defined areas", () => {
    const list = getAllowedLayoutList();
    const listed = LayoutData.getAllLayouts().filter((name) => LayoutData.hasLayout(name));
    for (const name of listed) {
      expect(list).toContain(`${name}:`);
    }
  });

  it("injects the layout list into the composed system prompt", () => {
    const { system } = buildMessagesForIntent("generate", { markdown: FIXTURE_DECK });
    expect(system).not.toContain("{{layoutList}}");
    expect(system).toContain(getAllowedLayoutList());
  });

  it("injects the shared output format into the composed system prompt", () => {
    const { system } = buildMessagesForIntent("generate", { markdown: FIXTURE_DECK });
    expect(system).not.toContain("{{outputFormat}}");
    expect(system).toContain('"slides"');
    expect(system).toContain('"layout"');
  });
});

describe("prompt line budget", () => {
  const slideMarkdown = FIXTURE_DECK.split("\n\n---\n\n")[0];

  function assertCombinedLines(messages, label) {
    const lines = messages.system.split("\n").length + messages.user.split("\n").length;
    expect(lines, `${label} exceeded ${MAX_COMBINED_LINES} combined lines`).toBeLessThanOrEqual(
      MAX_COMBINED_LINES,
    );
  }

  it("keeps every registry intent under the budget", () => {
    for (const intent of listIntents()) {
      const messages = buildMessagesForIntent(intent, { markdown: FIXTURE_DECK });
      assertCombinedLines(messages, intent);
    }
  });

  it("keeps single-slide intents under the budget", () => {
    for (const intent of ["enhanceSlide", "addSpeakerNotes"]) {
      const messages = buildMessagesForIntent(intent, { markdown: slideMarkdown });
      assertCombinedLines(messages, intent);
    }
  });

  it("keeps polish under the budget", () => {
    assertCombinedLines(buildPolishMessages(FIXTURE_DECK), "polish");
  });

  it("keeps batched messages under the budget", () => {
    const summary = "Deck: 3 slides.";
    assertCombinedLines(
      buildBatchMessages(FIXTURE_DECK, "generate", 0, 2, 3, summary),
      "batch-generate",
    );
    assertCombinedLines(buildBatchMessages(FIXTURE_DECK, "fix", 1, 2, 3, summary), "batch-fix");
  });

  it("keeps remix plan under the budget", () => {
    const messages = composeMessages(
      getFragment("system-prompt.md"),
      getFragment("remix-plan-prompt.md"),
      {
        markdown: "Deck: 3 slides.\nOutline:\n1. [title-slide] AI for Presentations",
        creativeGuidance: getFragment("creative-guidance.md").trim(),
        visualIdentityGuidance: "Preserve visual identity.",
        sourceCount: "3",
        maxSourceIndex: "2",
        imagesSection: "No images were sent with this request.",
      },
    );
    assertCombinedLines(messages, "remix-plan");
  });

  it("keeps reimagine outline under the budget", () => {
    const messages = composeMessages(
      getFragment("system-prompt.md"),
      getFragment("reimagine-outline-prompt.md"),
      {
        markdown: "Deck: 3 slides.",
        flow: "story",
        sourceCount: "3",
        minSlides: "2",
        maxSlides: "4",
      },
    );
    assertCombinedLines(messages, "reimagine-outline");
  });
});

describe("negative directive budget", () => {
  it("stays within the documented ~5 per fragment", () => {
    for (const entry of getManifest().fragments) {
      const fragment = getFragment(entry.file);
      const count = (fragment.match(NEGATIVE_DIRECTIVE_RE) || []).length;
      expect(
        count,
        `${entry.file} has ${count} negative directives (limit ${MAX_NEGATIVE_DIRECTIVES})`,
      ).toBeLessThanOrEqual(MAX_NEGATIVE_DIRECTIVES);
    }
  });
});

describe("snippet variant coverage", () => {
  // Contract: every variant name a caller may request exists in its snippet.
  // Renaming a variant in a .md file without updating this table (or vice
  // versa) fails here instead of throwing at runtime.
  const EXPECTED_VARIANTS = {
    "flow-guidance.md": ["story", "technical", "persuasive", "instructional"],
    "speaker-notes-guidance.md": ["add", "preserve"],
    "visual-identity-guidance.md": ["preserve", "discard"],
    "remix-visual-identity-guidance.md": ["preserve", "discard"],
    "images-guidance.md": ["sent", "not-sent"],
    "batch-pagination.md": ["fix", "generate"],
  };

  it("exposes exactly the variants each caller expects", () => {
    for (const [file, expected] of Object.entries(EXPECTED_VARIANTS)) {
      const fragment = getFragment(file);
      const actual = [...parseVariants(fragment).keys()].sort();
      expect(actual, file).toEqual([...expected].sort());
    }
  });
});

describe("placeholder resolution", () => {
  it("composes every intent without dangling placeholders", () => {
    for (const intent of listIntents()) {
      const { system, user } = buildMessagesForIntent(intent, { markdown: FIXTURE_DECK });
      expect(system, intent).not.toMatch(/\{\{\w+\}\}/);
      expect(user, intent).not.toMatch(/\{\{\w+\}\}/);
    }
  });

  it("composes polish and batches without dangling placeholders", () => {
    const polish = buildPolishMessages(FIXTURE_DECK);
    expect(polish.user).not.toMatch(/\{\{\w+\}\}/);

    const batch = buildBatchMessages(FIXTURE_DECK, "fix", 1, 2, 3, "Deck: 3 slides.");
    expect(batch.user).not.toMatch(/\{\{\w+\}\}/);
    expect(batch.user).toContain("SLIDE INDEX 1");
    expect(batch.user).toContain("CONTEXT SLIDE");
  });
});
