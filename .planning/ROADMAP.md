# Roadmap: Claude Auto-Continue

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-02-27)
- 🚧 **v1.0 npm Publishing** — Phases 5-8 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED 2026-02-27</summary>

- [x] Phase 1: Detection Engine (3/3 plans) — completed 2026-02-27
- [x] Phase 2: Single-Session PTY Wrapper (2/2 plans) — completed 2026-02-27
- [x] Phase 3: Single-Session Status Display (3/3 plans) — completed 2026-02-27
- [x] Phase 4: CLI Packaging and Distribution (1/1 plan) — completed 2026-02-27

</details>

### 🚧 v1.0 npm Publishing (In Progress)

**Milestone Goal:** Publish `claude-auto-continue@1.0.0` to the npm registry with a professional README so any Node.js >=18 developer can install and use the tool.

- [x] **Phase 5: Package Preparation** — Edit package.json metadata and write README.md so the package is registry-ready (completed 2026-02-27)
- [ ] **Phase 6: GitHub Hosting** *(user action required)* — Create the GitHub repository and push the codebase
- [ ] **Phase 7: Pre-publish Verification** — Run the pre-publish checklist to confirm tarball, tests, and auth are good before committing to publish
- [ ] **Phase 8: Publish** *(user action required)* — Execute `npm publish` and confirm the package is live and installable

## Phase Details

### Phase 5: Package Preparation
**Goal**: The package.json and README.md are complete and correct, ready for a first-impression npm page
**Depends on**: Phase 4 (v1.0 MVP complete)
**Requirements**: META-01, META-02, META-03, META-04, DOCS-01, DOCS-02, DOCS-03, DOCS-04
**Success Criteria** (what must be TRUE):
  1. `package.json` version reads `1.0.0`, author is `"dakmor"`, and bin alias `cac` is renamed to `clac`
  2. `package.json` has `repository`, `homepage`, and `bugs` fields pointing to `https://github.com/dakmor/claude-auto-continue`
  3. `README.md` exists at project root with a description, badges (using placeholder/live URLs), install command, usage instructions, Linux build-tool note, and a how-it-works section
  4. Running `npm pack --dry-run` shows `README.md` is included in the tarball
**Plans**: TBD

Plans:
- [ ] 05-01: Edit package.json — bump version, set author, rename bin alias, add repository/homepage/bugs fields
- [ ] 05-02: Write README.md — description, badges, install, usage, Linux prerequisites, how-it-works

### Phase 6: GitHub Hosting
**Goal**: The codebase is publicly hosted on GitHub so repository URLs resolve and the package has a trusted source link
**Depends on**: Phase 5
**Requirements**: HOST-01, HOST-02
**User action required**: Create the GitHub repo at `https://github.com/dakmor/claude-auto-continue` and push the codebase
**Success Criteria** (what must be TRUE):
  1. `https://github.com/dakmor/claude-auto-continue` loads and shows the repository with the correct codebase
  2. The repository has a `.gitignore` that excludes `node_modules/`, `dist/`, and other build artifacts from version control
  3. The npm registry sidebar will link to the correct GitHub URL once the package is published
**Plans**: 1 plan

Plans:
- [ ] 06-01-PLAN.md — Expand .gitignore, create LICENSE, fix package.json license field, then user creates GitHub repo and pushes

### Phase 7: Pre-publish Verification
**Goal**: All 91 tests pass, the tarball contains exactly the right files, and the npm account is authenticated — no surprises at publish time
**Depends on**: Phase 6
**Requirements**: PUBL-01
**Success Criteria** (what must be TRUE):
  1. `npm test` exits 0 with all 91 tests passing
  2. `npm pack --dry-run` shows `dist/` and `bin/` present, `node_modules/` absent, version reads `1.0.0`, and `README.md` is included
  3. `node dist/cli.js --help` executes and prints the help text without error
  4. `npm whoami` returns the correct npm account name, confirming publish auth is ready
**Plans**: TBD

Plans:
- [ ] 07-01: Run pre-publish checklist (tests, build, pack dry-run, binary check, npm auth)

### Phase 8: Publish
**Goal**: `claude-auto-continue@1.0.0` is live on the npm registry and installable by any Node.js >=18 user
**Depends on**: Phase 7
**Requirements**: PUBL-02, PUBL-03
**User action required**: Run `npm publish` (entering OTP if 2FA is enabled) and run the smoke test install in a fresh environment
**Success Criteria** (what must be TRUE):
  1. `npm view claude-auto-continue` returns version `1.0.0` with correct author, description, repository, and keywords
  2. `npm install -g claude-auto-continue && claude-auto-continue --help` completes without error in a clean environment
  3. The npm page at `https://www.npmjs.com/package/claude-auto-continue` shows the README with description, install instructions, and how-it-works section
**Plans**: TBD

Plans:
- [ ] 08-01: User runs npm publish; verify registry entry; smoke-test install

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Detection Engine | v1.0 MVP | 3/3 | Complete | 2026-02-27 |
| 2. Single-Session PTY Wrapper | v1.0 MVP | 2/2 | Complete | 2026-02-27 |
| 3. Single-Session Status Display | v1.0 MVP | 3/3 | Complete | 2026-02-27 |
| 4. CLI Packaging and Distribution | v1.0 MVP | 1/1 | Complete | 2026-02-27 |
| 5. Package Preparation | 2/2 | Complete   | 2026-02-27 | - |
| 6. GitHub Hosting | v1.0 npm Publishing | 0/1 | Not started | - |
| 7. Pre-publish Verification | v1.0 npm Publishing | 0/1 | Not started | - |
| 8. Publish | v1.0 npm Publishing | 0/1 | Not started | - |
