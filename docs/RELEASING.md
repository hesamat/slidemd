# Release Process

This document describes the release process for SlideMD.

## Prerequisites

- All checks pass locally: `npm run lint && npm run format:check && npm run build && npm test`
- You have admin access to the repository
- GitHub CLI (`gh`) is installed and authenticated

## Steps

### 1. Create a release branch

```bash
git checkout main
git pull origin main
git checkout -b release/X.Y.Z
```

### 2. Prepare release content

- Update `CHANGELOG.md` with release notes
- Update `package.json` version
- Commit changes

### 3. Create PR to main

```bash
git push origin release/X.Y.Z
gh pr create --base main --title "release: vX.Y.Z" --body "Release vX.Y.Z"
```

### 4. Merge PR

All checks must pass (lint, format, build, tests). Requires 1 approval.

```bash
gh pr merge N --admin --merge
```

### 5. Tag and create GitHub release

```bash
git checkout main
git pull origin main
git tag vX.Y.Z
git push origin vX.Y.Z
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file CHANGELOG.md
```

## Branch Protection Rules

Main branch requires:

- Pull request for all changes
- 1 approving review
- Build status check to pass
- No force pushes or deletions
