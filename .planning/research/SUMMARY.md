# Project Research Summary

**Project:** claude-auto-continue — npm v1.0.0 publishing milestone
**Domain:** CLI tool npm publishing (Node.js, native addon, PTY wrapper)
**Researched:** 2026-02-27
**Confidence:** HIGH

## Executive Summary

`claude-auto-continue` is a fully built, tested (91 tests), production-ready CLI tool that wraps Claude Code in a pseudo-terminal, detects rate-limit messages, waits for the reset window, and auto-resumes the session — preserving conversation context across rate-limit pauses. The current milestone is not about building new functionality. It is about publishing the tool to npm as v1.0.0 so that users can install it with `npm install -g claude-auto-continue`. The core architecture (PTY via node-pty, rolling buffer pattern detection, four-state machine per process instance) is already implemented and validated. What remains is entirely in the publishing and documentation layer.

The recommended approach is a focused, minimal publish: bump the version in package.json from `0.1.0` to `1.0.0`, fill in four missing metadata fields (author, repository, homepage, bugs), write a professional README.md (60-100 lines following standard CLI structure), verify the tarball with `npm pack --dry-run`, and publish. No new dependencies are required. The existing `prepublishOnly` hook runs `tsc` before publish, the `files` field correctly whitelists `dist/` and `bin/`, and node-pty 1.1.0 ships prebuilt binaries for macOS and Windows — the vast majority of developer users will install without any compilation step.

The key risks are all avoidable with a short pre-publish checklist: publishing at the wrong version (0.1.0 instead of 1.0.0), publishing without a README (npm page shows "No readme"), publishing with a blank `author` field (package appears abandoned), the `cac` bin alias conflicting with the npm `cac` library, and CRLF line endings in the bin script breaking Linux/macOS installs. All of these are mechanical checks, not engineering problems. The runtime pitfalls (chunk boundary splitting, ANSI contamination, EPIPE crashes) are already addressed in the implemented codebase.

---

## Key Findings

### Recommended Stack

The existing stack requires zero changes for this milestone. Node.js CJS (CommonJS) is the correct module system — migrating to ESM would break node-pty native interop and `strip-ansi@^6.0.1` (v7+ is ESM-only). TypeScript 5.9.3 compiles to `dist/` via `tsc`, and the `prepublishOnly` hook ensures the build is always fresh before publish. node-pty@1.1.0 bundles prebuilt binaries for `darwin-arm64`, `darwin-x64`, `win32-arm64`, and `win32-x64` — users on these platforms install silently with no build tools required. Linux users need Python and a C++ compiler (the same requirement as VS Code on Linux), which must be documented clearly in the README.

**Core technologies:**
- Node.js CJS (>=18): Runtime — do not add `"type": "module"` or upgrade strip-ansi to v7; both break the project
- TypeScript 5.9.3: Language — compiles to `dist/`; only compiled output ships in the tarball
- node-pty 1.1.0: PTY spawning — prebuilt binaries for all major platforms; `claude-auto-continue` itself ships no native binaries
- strip-ansi 6.0.1: ANSI stripping before regex matching — must stay at v6; v7+ is ESM-only

**Publishing tooling (no install required — built into npm):**
- `npm pack --dry-run`: Verify tarball contents before publish
- `npm publish --dry-run`: Full publish simulation without hitting the registry
- `npm version 1.0.0`: Bump version in package.json and create a git tag atomically

### Expected Features

This milestone's "features" are publishing artifacts — the deliverables that make the package professional, findable, and trustworthy on the npm registry. The tool's functional features are already shipped.

**Must have (table stakes — blocking v1.0.0 publish):**
- README.md at project root — currently does not exist; npm shows "No readme" without it; must include one-liner description, requirements, install command, usage, and how it works
- `version: "1.0.0"` in package.json — currently `0.1.0`; semver convention signals unstable API pre-1.0; once 0.1.0 is published, users on `^0.1.0` will not auto-upgrade to 1.0.0
- `author` field populated in package.json — currently `""`; blank author makes the package look abandoned or suspicious on the npm page
- `repository` field added to package.json — missing; provides source trust signal and GitHub sidebar link
- `homepage` field added to package.json — missing; improves npm sidebar discoverability
- `bugs` field added to package.json — missing; shows the project is maintained and provides issue reporting link
- Keywords expanded to 8-10 terms — currently 5; direct npm search ranking factor; add `automation`, `anthropic`, `auto-resume`, `terminal`, `pty`
- `npm pack --dry-run` verification — confirms dist/ present, node_modules/ absent, README included

**Should have (competitive differentiators — add in v1.0.1):**
- Badges row in README (npm version, license, node version via shields.io) — add after publish so badge URLs resolve against the live registry
- Demo GIF or asciicast embedded in README — the single most impactful post-launch addition for a terminal tool; proof over prose

**Defer (v2+):**
- CHANGELOG.md — only meaningful when multiple versions exist
- CONTRIBUTING.md — only when external contributors appear

**Anti-features to avoid:**
- `.npmignore` file — the `files` field already whitelists correctly; adding `.npmignore` creates a conflicting second system that can accidentally suppress listed files
- Scoped package name (`@user/claude-auto-continue`) — harder to remember and type for a public CLI tool; unscoped name is cleaner
- `np`, `release-it`, or `semantic-release` — excessive release automation for a manual one-time v1.0 publish
- `--provenance` flag at publish time — requires CI/CD OIDC environment (GitHub Actions or GitLab CI); fails from a local terminal with an OIDC token error

### Architecture Approach

The tool's runtime architecture is already implemented and does not change for this milestone. The design follows a layered component model: a thin CLI entry point creates N `ProcessSupervisor` instances, each owning one Claude Code PTY process. Each supervisor runs a four-state machine (RUNNING → LIMIT_DETECTED → WAITING → RESUMING → RUNNING) with PatternDetector (rolling 4KB buffer + ANSI-stripped regex), Scheduler (clock-anchored setTimeout), and StdinWriter (writes `continue\r` to PTY with EPIPE protection) as collaborating components. A shared StatusDisplay subscribes to status events from all supervisors and redraws a multi-line countdown view using ANSI cursor movement. All supervisors run on the Node.js main thread — node-pty is not thread-safe and must not cross worker thread boundaries.

The publishing layer adds one structural consideration: what files get shipped. The current `files: ["dist/", "bin/"]` whitelist is correct and ships 17.4 kB packed / 61.3 kB unpacked across 29 files. README.md is auto-included by npm regardless of the `files` field — it must exist at the project root before publish.

**Major components (all already implemented):**
1. `bin/claude-auto-continue.js` — thin shebang wrapper; requires `dist/cli.js`
2. `dist/cli.js` — entry point; parses args, instantiates ProcessSupervisors, handles SIGINT/SIGTERM
3. `ProcessSupervisor` — state machine; owns one Claude Code PTY; orchestrates detection, scheduling, and resume
4. `PatternDetector` — rolling 4KB buffer + ANSI-stripped regex; detects rate-limit messages; stateless between resume cycles
5. `Scheduler` — clock-anchored setTimeout; drives countdown ticks to StatusDisplay; no timer drift
6. `StdinWriter` — writes `continue\r` to PTY stdin; EPIPE handler + processAlive guard
7. `StatusDisplay` — multi-line terminal UI; subscribes to supervisor status events; read-only (no commands back)

### Critical Pitfalls

**Publishing pitfalls (this milestone — not yet addressed):**

1. **Publishing at wrong version (0.1.0 instead of 1.0.0)** — Run `npm version 1.0.0` as the very first step; verify with `npm version` (no args) before publish. Once 0.1.0 is published to the registry, it cannot be unpublished after 24 hours, and users on `^0.1.0` will not automatically upgrade across the 0.x → 1.x semver boundary.

2. **Missing README causes "No readme" on npm page** — Write README.md before publish; verify with `npm pack --dry-run` that it appears in the file list. npm auto-includes any root-level README regardless of the `files` field, but the file must exist. The npm page is the first thing a potential user sees — a blank README is fatal for adoption.

3. **`cac` bin alias conflicts with the npm `cac` library** — The `cac` npm package (v6.7.14, "Command And Conquer" CLI framework, used by Vite) is a popular library. If users have it installed globally or install it later, npm silently overwrites the `cac` bin entry — last install wins. Rename to `claude-continue` or remove the short alias entirely before first publish. Changing a bin alias after publishing requires a major version bump.

4. **CRLF line endings in bin script break Linux/macOS** — The shebang `#!/usr/bin/env node\r` (with CRLF) causes the shell to look for a binary named `node\r` on Unix systems, which does not exist. Add `.gitattributes` with `bin/* text eol=lf`; verify with `file bin/claude-auto-continue.js` before publish. This is a low-probability risk when publishing from macOS but becomes a problem if Windows contributors commit the file.

5. **node-pty compile failure for Linux users** — node-pty 1.1.0 ships prebuilts for macOS and Windows, but Linux users fall back to `node-gyp rebuild`, which requires Python and a C++ compiler. Document prerequisites clearly in the README with platform-specific install commands. The majority of developer users (macOS/Windows) will never see a compilation step.

**Runtime pitfalls (already addressed in the codebase):**

6. **Chunk boundary splits detection pattern** — Already mitigated by the rolling buffer + full-buffer regex in PatternDetector.

7. **ANSI escape code contamination** — Already mitigated by `strip-ansi@^6.0.1` applied before regex matching.

8. **Writing `continue` to a dead process (EPIPE)** — Already mitigated by EPIPE handler and `processAlive` flag in StdinWriter.

9. **Resume triggers `/rate-limit-options` re-execution loop** — Claude Code issue #14129 documents a bug where resuming with `claude -c` can re-execute the `/rate-limit-options` command, causing an immediate false-positive re-detection. Mitigated by post-resume detection cooldown.

---

## Implications for Roadmap

This milestone has a single engineering concern — getting the package from a local working tool to a public npm package. The research confirms a tight, sequential checklist rather than a multi-phase engineering roadmap. All work is in metadata, documentation, and verification — no new code is needed.

### Phase 1: Pre-publish Metadata and README

**Rationale:** All publishing work is blocked on having correct metadata and a README. These are the only two categories of change required: package.json field edits and a new README.md file. They have no code build dependencies and can be done in any order relative to each other, but both must be complete before any verification or publish step.
**Delivers:** A package.json with correct version, author, repository, homepage, bugs, and expanded keywords; a professional README.md with all standard CLI sections; a `.gitattributes` file protecting bin script line endings.
**Addresses:** All P1 features from FEATURES.md — description, install command, requirements, usage, options documentation.
**Avoids:** Pitfalls 1 (wrong version), 2 (no README), 3 (`cac` alias collision), 4 (CRLF in bin), 5 (undocumented Linux prerequisites).

**Specific tasks in recommended order:**
1. Bump `version` to `1.0.0` — do this first; everything else depends on the version being correct
2. Fill `author` field with name and email
3. Add `repository`, `homepage`, `bugs` fields pointing to the GitHub repo
4. Expand `keywords` from 5 to 8-10 terms: add `automation`, `anthropic`, `auto-resume`, `terminal`, `pty`, `rate-limit-handler`
5. Add `"types": "dist/index.d.ts"` to package.json for TypeScript consumers
6. Resolve the `cac` bin alias — rename to `claude-continue` or remove it entirely
7. Add `.gitattributes` with `bin/* text eol=lf`
8. Write README.md following the documented section order: title + one-liner, requirements, install, usage, how it works, options/--help output, license

### Phase 2: Pre-publish Verification

**Rationale:** Publish is effectively irreversible in the practical sense — npm's 72-hour unpublish window is narrow, and a broken or metadata-incomplete package permanently harms first impressions. Running the verification checklist costs 5 minutes and eliminates all known publish pitfalls.
**Delivers:** Confirmed-good tarball contents, confirmed auth state, confirmed binary is executable, ready for a clean publish.
**Avoids:** Pitfall of missing dist/ in tarball, wrong version published, 2FA blocking the publish flow.

**Specific checklist:**
1. `npm test` — all 91 tests must pass
2. `npm run build` — TypeScript must compile cleanly with zero errors
3. `npm pack --dry-run` — confirm: dist/ present and non-empty, bin/ present, README.md present, node_modules/ absent, version reads 1.0.0
4. `node dist/cli.js --help` — confirm the compiled output actually executes before committing to publish
5. `file bin/claude-auto-continue.js` — confirm LF not CRLF in the shebang line
6. `npm whoami` — confirm authenticated to the npm registry with the correct account
7. Have OTP/2FA authenticator app ready before starting `npm publish`

### Phase 3: Publish

**Rationale:** With metadata complete and verification passed, the publish is a single command. The `prepublishOnly` hook re-runs `tsc` as a safety net before the tarball is created. No manual build step is required by the operator.
**Delivers:** `claude-auto-continue@1.0.0` live on the npm registry, globally installable by any Node.js >=18 user.

**Specific tasks:**
1. `npm publish` — enter OTP when prompted
2. `npm view claude-auto-continue` — verify published version, author, description, repository, keywords all show correctly
3. Test install in a fresh environment: `npm install -g claude-auto-continue && claude-auto-continue --help`

### Phase 4: Post-publish Polish (v1.0.1)

**Rationale:** Two high-value features are not blocking for the initial publish and are better added afterward. Badges need the package to be live — shields.io pulls version data from the registry and shows "not found" before the package exists. The demo GIF requires a screen recording session and is most impactful once the package URL is shareable.
**Delivers:** Badges row in README (npm version, license, node version via shields.io); demo GIF or asciicast showing the countdown card and auto-resume; incremental patch release.

### Phase Ordering Rationale

- Phase 1 before Phase 2: Nothing to verify until the metadata and README exist.
- Phase 2 before Phase 3: Publish is not meaningfully reversible after 24 hours; the 5-minute checklist is cheap insurance against a bad first impression that damages adoption.
- Phase 4 after Phase 3: Badges require a live registry entry; demo can be added in a patch release without disrupting the v1.0.0 install base for any users who installed in the window between launch and v1.0.1.
- No multi-phase engineering required: The tool is built and tested. This is a documentation and operations milestone.

### Research Flags

Phases needing deeper research during planning:
- **None.** npm publishing for Node.js CLI tools with native addons is a mature, thoroughly documented domain. All specific edge cases identified in this research (node-pty prebuilts, `files` vs `.npmignore`, 2FA OTP, CRLF in bin scripts, `cac` alias collision, Linux build tools) have been researched to HIGH or MEDIUM confidence with primary sources. The STACK.md, FEATURES.md, ARCHITECTURE.md, and PITFALLS.md files collectively cover every decision point at sufficient depth to proceed directly to execution.

Phases with standard patterns (research-phase not needed):
- **All phases:** This is a standard npm CLI publish workflow. Every step is documented in official npm docs and validated against the actual project state (`npm pack --dry-run` was run; prebuilt directories were inspected locally). No additional research phase is warranted before execution.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified by local inspection of node_modules/node-pty/prebuilds/ (prebuilt dirs confirmed), npm pack --dry-run output (17.4 kB packed, 29 files confirmed), and npm official docs for publish mechanics |
| Features | HIGH | npm official docs, direct inspection of package pages of comparable tools (@anthropic-ai/claude-code, ccexp), community best-practice articles from active maintainers |
| Architecture | HIGH | Architecture already implemented and passing 91 tests; publishing layer validated against npm pack --dry-run; files field behavior confirmed against npm documentation |
| Pitfalls | MEDIUM-HIGH | Publishing pitfalls documented with primary sources (GitHub npm issues, npm official docs, node-pty issue tracker); runtime pitfalls confirmed via Claude Code GitHub issues and Node.js docs; some edge cases (cac alias collision behavior, timer drift specifics) based on documented behavior but not tested experimentally in this project |

**Overall confidence:** HIGH

### Gaps to Address

- **`cac` bin alias decision:** Research confirms the collision risk clearly, but the resolution — rename to `claude-continue`, use a different short alias, or remove the short alias entirely — is a product decision. This must be resolved before v1.0.0 ships; changing a bin alias after publish requires a major version bump.

- **Author field content:** The specific name and email string for the `author` field was not determined by research — this is information the project owner must provide. At minimum, the name is required; adding an email and website URL makes the npm page attribution more complete.

- **Claude Code output format stability post-publish:** The detection patterns are implemented against confirmed formats (GitHub issues #2087, #9236) but Anthropic treats CLI output as a UI concern, not an API contract. The patterns should be made user-configurable in a follow-on release so that a format change does not require a code release to fix. This is not blocking for v1.0.0 but should appear on the near-term backlog.

- **Linux install experience (untested in this research pass):** node-pty's prebuilt strategy covers macOS and Windows. The README documentation of Linux prerequisites is correct per the node-pty documentation, but a hands-on test of `npm install -g claude-auto-continue` in a fresh Linux environment without build tools was not performed. A Linux CI job in a follow-on release would increase confidence here.

---

## Sources

### Primary (HIGH confidence)
- npm official docs (publish, pack, package.json reference, files field, README auto-inclusion) — all publishing mechanics and field behavior
- Local inspection of `node_modules/node-pty/prebuilds/` and `scripts/prebuild.js` — confirmed prebuilt binary presence for darwin-arm64, darwin-x64, win32-arm64, win32-x64
- `npm pack --dry-run` output — confirmed tarball is 17.4 kB packed, 61.3 kB unpacked, 29 files; dist/ and bin/ correctly scoped
- anthropics/claude-code issue #771 — PTY requirement for Claude Code spawning; all-pipe stdio causes indefinite hang (COMPLETED)
- anthropics/claude-code issue #9236 — confirmed exact rate-limit message text: "Claude usage limit reached. Your limit will reset at [TIME] ([TIMEZONE])"
- anthropics/claude-code issue #14129 — /rate-limit-options re-execution bug when resuming with `claude -c`
- shields.io badge documentation — confirmed badge URL patterns for npm version, license, node version
- nodejs/node issue #40085 — EPIPE behavior on child process stdin confirmed
- npm/npm issues #4607 and #12371 — CRLF in bin scripts is a known npm publish pitfall with documented consequences
- [npm provenance docs](https://docs.npmjs.com/generating-provenance-statements/) — provenance requires CI/CD OIDC; fails from local terminal

### Secondary (MEDIUM confidence)
- prebuildify GitHub — explains bundled prebuilt binary strategy; why node-pty avoids a separate download step on install
- terryso/claude-auto-resume — prior art shell script; acknowledged format fragility; `--dangerously-skip-permissions` anti-pattern documented
- cacjs/cac GitHub — confirmed `cac` library does not register a `cac` bin itself, but collision risk remains from the shared npm global bin directory
- npm/feedback discussion #724 — bin alias collision behavior in global install context
- Gleb Bahmutov: How I Organize README — badge placement, section ordering, five-badge pattern for CLI tools
- survivejs.com: Anatomy of a Package — which fields display on npm page and in what positions
- nodejs/node issue #21822 — setInterval drift over time confirmed (relevant to Scheduler design)
- WebbyLab: Best practices for building CLI and publishing to npm — bin field, .npmignore pitfalls, visual demos

### Tertiary (LOW confidence)
- npm/feedback discussion #724 — bin alias collision behavior (behavior confirmed logically from npm docs; not tested experimentally in this specific version combination)
- @lydell/node-pty npm package — prebuilt-only fork as an alternative if node-gyp compilation is unacceptable; narrower platform support; not evaluated in depth for this project

---
*Research completed: 2026-02-27*
*Ready for roadmap: yes*
