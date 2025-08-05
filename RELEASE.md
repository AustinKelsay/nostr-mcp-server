# Release Process

This document outlines the simple release process for nostr-mcp-server.

## Quick Release Steps

For a new release, follow these steps in order:

### 1. Update Version Number

```bash
# For a patch release (bug fixes): 1.0.0 → 1.0.1
npm version patch

# For a minor release (new features): 1.0.0 → 1.1.0
npm version minor

# For a major release (breaking changes): 1.0.0 → 2.0.0
npm version major
```

### 2. Update CHANGELOG.md

1. Move all items from `[Unreleased]` to a new version section
2. Add the version number and today's date
3. Add a new empty `[Unreleased]` section at the top

Example:
```markdown
## [Unreleased]

## [1.1.0] - 2025-01-05

### Added
- Feature X
- Feature Y

### Fixed
- Bug Z
```

### 3. Run Tests

```bash
npm test
npm run build
```

Make sure everything passes!

### 4. Commit and Tag

```bash
# Stage the changes
git add package.json package-lock.json CHANGELOG.md

# Commit with a clear message
git commit -m "Release v1.1.0"

# Create a tag
git tag -a v1.1.0 -m "Release v1.1.0"

# Push everything
git push origin main
git push origin v1.1.0
```

### 5. Create GitHub Release

1. Go to https://github.com/AustinKelsay/nostr-mcp-server/releases
2. Click "Draft a new release"
3. Choose your tag (e.g., `v1.1.0`)
4. Set release title: `v1.1.0`
5. Copy the relevant section from CHANGELOG.md into the description
6. Click "Publish release"

### 6. Publish to npm

Publish your package to npm:

```bash
npm publish
```

Note: You'll need to be logged in to npm (`npm login`) with an account that has publish permissions.

## Version Guidelines

- **Patch version (0.0.X)**: Bug fixes, documentation updates, minor tweaks
- **Minor version (0.X.0)**: New features, new tools, improvements that don't break existing functionality
- **Major version (X.0.0)**: Breaking changes, major refactors, incompatible API changes

## Pre-release Checklist

Before releasing, ensure:

- [ ] All tests pass (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] CHANGELOG.md is updated
- [ ] README.md is accurate (if features were added/removed)
- [ ] No console.log/console.error statements that could interfere with MCP

## Release Notes Template

When creating GitHub release notes, use this format:

```
## What's Changed

### ✨ New Features
- Feature description (#PR if applicable)

### 🐛 Bug Fixes
- Fix description (#PR if applicable)

### 📚 Documentation
- Doc updates

### 🔧 Maintenance
- Internal improvements

**Full Changelog**: https://github.com/AustinKelsay/nostr-mcp-server/compare/v1.0.0...v1.1.0
```

## Troubleshooting

- **Forgot to update CHANGELOG?** Update it and amend your commit: `git commit --amend`
- **Tagged wrong commit?** Delete and recreate: `git tag -d v1.1.0` then `git tag -a v1.1.0 -m "Release v1.1.0"`
- **Need to fix after release?** Create a patch version (1.1.0 → 1.1.1)

---

Remember: Keep it simple! The goal is to ship improvements regularly and reliably.