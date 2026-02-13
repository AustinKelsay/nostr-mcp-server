# Release Process

This document outlines the release process for `nostr-mcp-server`.

## Quick Release Steps

For a new release, follow these steps in order:

### 0. Prep on `staging`

- Pull the latest `staging` branch
- Confirm a clean working tree
- Ensure `CHANGELOG.md` has an up-to-date `[Unreleased]` section
- Ensure docs are updated for any new/removed tools

### 1. Run Pre-release Checks

```bash
# Recommended (runs test + build)
bun run prerelease

# Equivalent manual checks
bun test
bun run build
```

### 2. Update Version Number

Use one of the release scripts:

```bash
# Patch release (bug fixes): 3.0.0 -> 3.0.1
bun run release:patch

# Minor release (new features): 3.0.0 -> 3.1.0
bun run release:minor

# Major release (breaking changes): 3.0.0 -> 4.0.0
bun run release:major
```

These scripts run `bun run prerelease` first, then `npm version ...`.

### 3. Finalize `CHANGELOG.md`

1. Move items from `[Unreleased]` into a new version section
2. Add the release version and date
3. Add a new empty `[Unreleased]` section at the top

Example:
```markdown
## [Unreleased]

## [3.1.0] - 2026-03-01

### Added
- Feature X
```

### 4. Commit and Tag

```bash
# Stage release files
git add CHANGELOG.md package.json package-lock.json

# Commit
git commit -m "Release v3.1.0"

# Tag
git tag -a v3.1.0 -m "Release v3.1.0"

# Push branch and tag
git push origin main
git push origin v3.1.0
```

### 5. Create GitHub Release

1. Go to https://github.com/AustinKelsay/nostr-mcp-server/releases
2. Click "Draft a new release"
3. Choose your tag (for example `v3.1.0`)
4. Set release title to match the tag
5. Copy the relevant `CHANGELOG.md` section into the release description
6. Click "Publish release"

### 6. Publish to npm

```bash
npm publish
```

Note: You must be logged in to npm with publish permissions.

## Version Guidelines

- **Patch version (`0.0.X`)**: Bug fixes, documentation updates, minor tweaks
- **Minor version (`0.X.0`)**: New features and improvements without breaking existing usage
- **Major version (`X.0.0`)**: Breaking changes and incompatible API updates

## Pre-release Checklist

- [ ] `staging` has the expected commits for this release
- [ ] All tests pass (`bun test`)
- [ ] Build succeeds (`bun run build`)
- [ ] `CHANGELOG.md` is updated and grouped by `Added/Changed/Fixed/Removed`
- [ ] `README.md` is accurate for current tool set
- [ ] No debug logs interfere with MCP JSON responses

## Release Notes Template

When creating GitHub release notes, use this format:

```text
## What's Changed

### New Features
- Feature description

### Fixes
- Fix description

### Maintenance
- Internal improvement

**Full Changelog**: https://github.com/AustinKelsay/nostr-mcp-server/compare/v3.0.0...v3.1.0
```

## Troubleshooting

- **Forgot to update CHANGELOG?** Update it and amend or add a follow-up commit before publishing
- **Tagged wrong commit?** Delete and recreate the tag before publishing
- **Need a post-release fix?** Cut a patch release (for example `3.1.0` -> `3.1.1`)

---

Keep releases small, repeatable, and verifiable.
