# Requirements: claude-auto-continue

**Defined:** 2026-02-27
**Core Value:** Unattended Claude Code sessions that automatically resume after usage limits reset

## v1.0 Requirements

Requirements for npm publishing release. Each maps to roadmap phases.

### Package Metadata

- [x] **META-01**: Version bumped to 1.0.0 in package.json
- [x] **META-02**: Author field set to "dakmor"
- [x] **META-03**: Bin alias renamed from `cac` to `clac`
- [x] **META-04**: Repository, homepage, bugs fields populated with GitHub URL

### Documentation

- [x] **DOCS-01**: README.md includes project description and badges
- [x] **DOCS-02**: README includes install and usage instructions
- [x] **DOCS-03**: README documents Linux build tool requirements for node-pty
- [x] **DOCS-04**: README includes how-it-works section

### Hosting

- [x] **HOST-01**: GitHub repository created
- [x] **HOST-02**: Code pushed to GitHub with proper .gitignore

### Publishing

- [ ] **PUBL-01**: Pre-publish verification passes (npm pack --dry-run confirms correct files)
- [ ] **PUBL-02**: Package published to npm registry as 1.0.0
- [ ] **PUBL-03**: Post-publish smoke test confirms `npm install -g claude-auto-continue` works

## Future Requirements

### Post-publish Polish

- **POST-01**: npm badges added to README (requires live registry entry)
- **POST-02**: Demo GIF/asciicast showing live countdown and auto-resume

## Out of Scope

| Feature | Reason |
|---------|--------|
| CI/CD pipeline | Manual publish is fine for v1.0; automate later if needed |
| npm provenance | Requires GitHub Actions OIDC — not feasible from local publish |
| Release automation (np, semantic-release) | Overkill for a single manual publish |
| ESM migration | CJS works, node-pty interop is better with CJS |
| .npmignore file | `files` whitelist already handles this correctly |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| META-01 | Phase 5 | Complete |
| META-02 | Phase 5 | Complete |
| META-03 | Phase 5 | Complete |
| META-04 | Phase 5 | Complete |
| DOCS-01 | Phase 5 | Complete |
| DOCS-02 | Phase 5 | Complete |
| DOCS-03 | Phase 5 | Complete |
| DOCS-04 | Phase 5 | Complete |
| HOST-01 | Phase 6 | Complete |
| HOST-02 | Phase 6 | Complete |
| PUBL-01 | Phase 7 | Pending |
| PUBL-02 | Phase 8 | Pending |
| PUBL-03 | Phase 8 | Pending |

**Coverage:**
- v1.0 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-27 after roadmap creation*
