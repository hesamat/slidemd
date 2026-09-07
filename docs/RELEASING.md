# Release Process

This document describes the release process for SlideMD.

## Versioning

- SlideMD uses semantic versioning from `1.0.0` onward: breaking changes to
  the authoring syntax, deck formats, or supported environments bump the
  major version, new features bump the minor version, and bug fixes bump
  the patch version.
- The first public release is `1.0.0-beta.1`, published as a GitHub
  prerelease (`gh release create --prerelease`, so it never becomes
  "Latest"). Feedback from the beta window may still change things; the
  stable `1.0.0` follows once it settles. Further betas increment the
  pre-release number (`1.0.0-beta.2`, ...).
- Each released PR gets its own version bump. A release whose changes live
  on a feature branch is released as its own version (e.g. `1.2.1`); it is
  NOT folded into the next pending changelog section.
- `CHANGELOG.md` sections are marked `(Unreleased)` until the release PR is
  merged; the release PR replaces `(Unreleased)` with the release date.
- Public changelog history starts at `1.0.0-beta.1`. Versions
  `0.1.0`–`0.14.0` predate the public release; their history lives in the
  git log.
- **Feature branches do NOT bump `package.json` version or edit
  `CHANGELOG.md`.** Those changes belong on the release branch (below), so
  the feature branch stays a clean code-only PR.

## Prerequisites

- All checks pass locally: `npm run lint && npm run format:check && npm run build && npm test`
- You have admin access to the repository
- GitHub CLI (`gh`) is installed and authenticated

## Steps

### 1. Merge the feature PR to `main`

The feature branch must be a code-only PR (no version or changelog changes).
Merge it first so the release branch starts from the code that will actually ship.

### 2. Create a release branch

```bash
git checkout main
git pull origin main
git checkout -b release/X.Y.Z
```

### 3. Prepare release content

- Update `CHANGELOG.md` with release notes: add a `## X.Y.Z (YYYY-MM-DD)`
  section at the top, and replace `(Unreleased)` with the release date.
- Update `package.json` version
- Run `npm update` and commit `package-lock.json`
- Commit changes

### 4. Create PR to main

```bash
git push origin release/X.Y.Z
gh pr create --base main --title "release: vX.Y.Z" --body "Release vX.Y.Z"
```

### 5. Merge PR

All checks must pass (lint, format, build, tests). Requires 1 approval.

```bash
gh pr merge N --admin --merge
```

### 6. Tag and publish the GitHub release

```bash
git checkout main
git pull origin main
git tag vX.Y.Z
git push origin vX.Y.Z
```

The tag push triggers `.github/workflows/release.yml`, which re-runs the
checks, builds the HTML and PDF, and creates the GitHub release with both
assets attached. Auto-generated release notes are disabled — finish the
release by pasting the new `## X.Y.Z` section from `CHANGELOG.md` into the
release body:

```bash
awk '/^## X.Y.Z \(/{flag=1} flag && /^## [0-9]+\./{exit} flag' CHANGELOG.md > /tmp/release-body.md
gh release edit vX.Y.Z --notes-file /tmp/release-body.md
```

The release notes are the curated changelog section only: GitHub's
auto-generated "What's Changed" list is not used, because the first release
would otherwise pull in the project's entire pre-release PR history.

## Branch Protection Rules

Main branch requires:

- Pull request for all changes
- 1 approving review
- Build status check to pass
- No force pushes or deletions
