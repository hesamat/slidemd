/**
 * Prompt hygiene checks that catch real bugs:
 * - the layout list injected into the system prompt stays in sync with the
 *   layout registry
 * - every composed prompt has no dangling {{placeholders}}
 *
 * Style-guide rules (line budgets, negative-directive counts) are deliberately
 * not enforced here — they churn with every prompt tweak.
 */

import { describe, it, expect } from "vitest";
import { getAllowedLayoutList } from "../data/ai/ai-prompt-fragments.js";
import { LayoutData } from "../data/layout-data.js";
import {
  buildMessagesForIntent,
  buildPolishMessages,
  listIntents,
} from "../data/ai/ai-intent-registry.js";
import { buildBatchMessages } from "../data/ai/ai-prompt-builder.js";

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

describe("layout list sync", () => {
  it("covers every layout with defined areas", () => {
    const list = getAllowedLayoutList();
    const listed = LayoutData.getValidLayoutNames();
    for (const name of listed) {
      expect(list).toContain(`${name}:`);
    }
  });

  it("injects the layout list into the composed system prompt", () => {
    const { system } = buildMessagesForIntent("generate", { markdown: FIXTURE_DECK });
    expect(system).not.toContain("{{layoutList}}");
    expect(system).toContain(getAllowedLayoutList());
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
