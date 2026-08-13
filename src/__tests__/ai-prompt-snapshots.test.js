/**
 * Golden snapshot tests for composed AI prompts.
 *
 * Every intent is composed against the fixture deck and the final system +
 * user messages are snapshotted. A prompt change therefore shows up as a
 * clean diff in code review instead of silently altering what the model sees.
 */

import { describe, it, expect } from "vitest";
import { buildMessagesForIntent, buildPolishMessages } from "../data/ai/ai-intent-registry.js";
import { buildBatchMessages } from "../data/ai/ai-prompt-builder.js";
import {
  buildImagesSectionForPrompt,
  buildRemixFlowGuidance,
  buildRemixVisualIdentityGuidance,
  composeMessages,
  getFragment,
} from "../data/ai/ai-prompt-fragments.js";

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

const FIRST_SLIDE = FIXTURE_DECK.split("\n\n---\n\n")[0];

describe("composed prompt snapshots", () => {
  it("enhanceSlide (single-slide fix)", () => {
    const { system, user } = buildMessagesForIntent("enhanceSlide", {
      markdown: FIRST_SLIDE,
    });
    expect({ system, user }).toMatchSnapshot();
  });

  it("addSpeakerNotes (single-slide)", () => {
    const { system, user } = buildMessagesForIntent("addSpeakerNotes", {
      markdown: FIRST_SLIDE,
    });
    expect({ system, user }).toMatchSnapshot();
  });

  it("generate (whole deck)", () => {
    const { system, user } = buildMessagesForIntent("generate", {
      markdown: FIXTURE_DECK,
    });
    expect({ system, user }).toMatchSnapshot();
  });

  it("generate (whole deck, preserve visual identity)", () => {
    // Remix preserve-mode execute: the visual-styling note must tell the model
    // to keep the original theme/background/color directives instead of
    // emitting neutral styling.
    const { system, user } = buildMessagesForIntent("generate", {
      markdown: FIXTURE_DECK,
      preserveVisualIdentity: true,
    });
    expect({ system, user }).toMatchSnapshot();
  });

  it("polish (whole deck)", () => {
    const { system, user } = buildPolishMessages(FIXTURE_DECK);
    expect({ system, user }).toMatchSnapshot();
  });

  it("batched generate with deck summary", () => {
    const { system, user, original } = buildBatchMessages(
      FIXTURE_DECK,
      "generate",
      1,
      3,
      3,
      "Deck: 3 slides.\nOutline:\n1. [title-slide] AI for Presentations",
    );
    expect({ system, user, original }).toMatchSnapshot();
  });

  it("batched fix with context slides", () => {
    const { system, user, original } = buildBatchMessages(FIXTURE_DECK, "fix", 1, 2, 3);
    expect({ system, user, original }).toMatchSnapshot();
  });

  it("remix plan (text-only)", () => {
    const { system, user } = composeMessages(
      getFragment("system-prompt.md"),
      getFragment("remix-plan-prompt.md"),
      {
        markdown: "Deck: 3 slides.\nOutline:\n1. [title-slide] AI for Presentations",
        flowGuidance: buildRemixFlowGuidance(""),
        creativeGuidance: getFragment("creative-guidance.md").trim(),
        visualIdentityGuidance: buildRemixVisualIdentityGuidance(true),
        sourceCount: "3",
        maxSourceIndex: "2",
        imagesSection: buildImagesSectionForPrompt(false),
      },
    );
    expect({ system, user }).toMatchSnapshot();
  });

  it("remix plan with story flow guidance", () => {
    const { system, user } = composeMessages(
      getFragment("system-prompt.md"),
      getFragment("remix-plan-prompt.md"),
      {
        markdown: "Deck: 3 slides.\nOutline:\n1. [title-slide] AI for Presentations",
        flowGuidance: buildRemixFlowGuidance("story"),
        creativeGuidance: getFragment("creative-guidance.md").trim(),
        visualIdentityGuidance: buildRemixVisualIdentityGuidance(true),
        sourceCount: "3",
        maxSourceIndex: "2",
        imagesSection: buildImagesSectionForPrompt(false),
      },
    );
    expect({ system, user }).toMatchSnapshot();
  });

  it("reimagine outline", () => {
    const { system, user } = composeMessages(
      getFragment("system-prompt.md"),
      getFragment("reimagine-outline-prompt.md"),
      {
        markdown: "Deck: 3 slides.\nOutline:\n1. [title-slide] AI for Presentations",
        flow: "story",
        sourceCount: "3",
        minSlides: "2",
        maxSlides: "4",
      },
    );
    expect({ system, user }).toMatchSnapshot();
  });
});
