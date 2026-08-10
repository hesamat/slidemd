# Release Process

This document describes the release process for SlideMD.

## Versioning

- Each released PR gets its own version bump. A release whose changes live on
  a feature branch is released as its own version (e.g. `0.9.2`); it is NOT
  folded into the next pending changelog section.
- `CHANGELOG.md` sections are marked `(Unreleased)` until the release PR is
  merged; the release PR replaces `(Unreleased)` with the release date.
- **Feature branches do NOT bump `package.json` version or edit `CHANGELOG.md`.**
  Those changes belong on the release branch (below), so the feature branch
  stays a clean code-only PR.

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

### 6. Tag and create GitHub release

```bash
git checkout main
git pull origin main
git tag vX.Y.Z
git push origin vX.Y.Z
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file CHANGELOG.md
```

The tag push triggers `.github/workflows/release.yml`, which builds the HTML
and PDF and attaches them to the release.

## Branch Protection Rules

Main branch requires:

- Pull request for all changes
- 1 approving review
- Build status check to pass
- No force pushes or deletions
