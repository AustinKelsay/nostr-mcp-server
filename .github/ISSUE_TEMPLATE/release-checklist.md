---
name: Release Checklist
about: Checklist for creating a new release
title: 'Release v[VERSION]'
labels: release
assignees: ''

---

## Release Checklist for v[VERSION]

### Pre-release
- [ ] All new features are documented in README
- [ ] All tests pass locally (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] No console.log/error statements that interfere with MCP
- [ ] CHANGELOG.md has been updated with all changes

### Release Process
- [ ] Run `npm run release:[patch|minor|major]`
- [ ] Update CHANGELOG.md (move Unreleased → new version)
- [ ] Commit changes: `git commit -m "Release v[VERSION]"`
- [ ] Create tag: `git tag -a v[VERSION] -m "Release v[VERSION]"`
- [ ] Push commits: `git push origin main`
- [ ] Push tag: `git push origin v[VERSION]`

### Post-release
- [ ] Verify GitHub Actions created the release
- [ ] Test installation in fresh environment
- [ ] Update any external documentation
- [ ] Announce release (if applicable)

### Notes
<!-- Add any specific notes about this release -->