# ADR-0001: Record Architecture Decisions

- **Status:** accepted
- **Date:** 2026-08-09
- **Decision makers:** SlideMD maintainers

## Context

SlideMD has grown organically across rendering, editing, AI orchestration,
PPTX import, and export paths. Many architectural choices — the fixed 1920x1080
stage, the AI/tool boundary, the per-slide CodeMirror EditorState cache, the
source-vs-live state split — are documented only implicitly across
`AGENTS.md`, `README.md`, `docs/prompt-template.md`, and inline code comments.

This makes it hard for new contributors and external AI agents to understand
why the codebase looks the way it does, and which constraints are load-bearing
versus incidental. Decisions get re-litigated in PR reviews because the
original reasoning is not recorded anywhere.

## Decision

We adopt Architecture Decision Records (ADRs) as a lightweight way to capture
significant architectural decisions and their context.

- ADRs live in `docs/adr/`.
- Each ADR is a single Markdown file named `NNNN-kebab-case-title.md`, where
  `NNNN` is a zero-padded sequence number starting at `0001`.
- ADRs use the template at [`docs/adr/template.md`](./template.md):
  Context, Decision, Consequences, Links.
- ADRs are immutable once accepted. To change a decision, write a new ADR that
  marks the previous one as `superseded by ADR-NNNN`.
- Not every change needs an ADR. Use one for decisions that are hard to
  reverse, affect multiple modules, or constrain future work (e.g. choosing a
  state-management approach, a bundling strategy, a persistence model, or a
  public API contract). Trivial refactors, bug fixes, and feature additions
  do not need ADRs.

## Consequences

- Architectural reasoning becomes discoverable in the repo instead of
  scattered across PR threads and chat logs.
- New contributors and AI agents can read `docs/adr/` to understand the
  load-bearing constraints before proposing changes.
- A small ongoing cost: maintainers must remember to write an ADR when making
  a significant decision. The template keeps the bar low.
- ADRs can drift from code if not updated when superseded. The
  `superseded by` convention keeps the chain navigable.

## Links

- Template: [`docs/adr/template.md`](./template.md)
- [`AGENTS.md`](../../AGENTS.md) — AI-assistant guidance, including the
  change-impact guidelines and pre-review verification that encode many of the
  constraints ADRs will formalize.
- [`docs/ai-positioning.md`](../ai-positioning.md) — documents the AI/tool
  feature boundary, a candidate for a future ADR.
