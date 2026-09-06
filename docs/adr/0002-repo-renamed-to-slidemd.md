# ADR-0002: Repo Renamed to slidemd; Internal WebDeck Identifiers Retained

- **Status:** accepted
- **Date:** 2026-09-06
- **Decision makers:** Hesam Alizadeh

## Context

The repository was originally named `html-presentation`, while the product had
already been branded **SlideMD** across the UI, README, docs, and AI prompts.
A third naming layer, the internal codename **WebDeck**, survives in code
identifiers: `webdeck_*` / `webdeck:*` localStorage and sessionStorage keys,
the `webdeck`-prefixed IndexedDB databases (persisted directory handles and
editor drafts), `__WEBDECK_*__` window globals, the `webdeck:ready` event and
BroadcastChannel names, `webdeck-hidden` and `data-webdeck-*` CSS hooks,
`WEBDECK_*` environment variables, and `.webdeck-*` working directories.

Alternatives considered:

1. **Full rebrand** — rename every internal identifier to `slidemd`. Rejected:
   user-data storage keys (custom layouts, theme/palette, AI settings and API
   keys, current-deck state) would need a migration shim; renaming the
   IndexedDB databases would orphan persisted directory handles and drafts;
   and the `webdeck:ready` event plus `__WEBDECK_*__` globals are baked
   verbatim into every exported HTML file and dist artifact, so the runtime
   and its frozen output would need to interoperate across the rename.
2. **Repo rename only** — change the repository identifier and the metadata
   that references it, touch nothing internal. Chosen.

## Decision

- The GitHub repository identifier becomes `hesamat/slidemd`. GitHub
  redirects the old URL automatically; `package.json`
  (`repository`/`homepage`/`bugs`), the README release link, the CONTRIBUTING
  clone instructions, and the e2e parity fixture point at the new identifier.
- The product display name remains **SlideMD** everywhere it already appears.
- Internal `webdeck` identifiers are retained as implementation details,
  deliberately: storage keys, IndexedDB names, window globals, event and
  channel names, CSS classes and attributes, environment variables, and
  working directories keep their existing names. No migration ships.

## Consequences

- No user data migration: themes, custom layouts, AI settings and keys,
  editor drafts, and granted directory handles survive the rename untouched.
- Previously exported HTML decks keep working; they are self-contained and
  were never coupled to the repo name.
- The codebase carries an internal codename that no longer matches the repo
  or product name. This ADR and the Phase 17 "Rename & Branding" rows in
  [`ROADMAP.md`](../../ROADMAP.md) are the pointer for new contributors.
- If a future release ever needs user-facing persistence renamed, it requires
  a read-old/write-new migration, a renamed-or-dual-fired `webdeck:ready`
  bootstrap, and an IndexedDB migration; the identifier families listed above
  are the inventory to start from.
- Reversible at low cost: the repository can be renamed back, and since no
  internal identifiers changed, nothing else needs reverting.

## Links

- [ADR-0001](./0001-record-architecture-decisions.md) — ADR practice
- [`ROADMAP.md`](../../ROADMAP.md) — Phase 17, "Rename & Branding"
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) — updated clone instructions
