# Feature Research

**Domain:** npm package publishing — CLI tool presentation and discoverability
**Researched:** 2026-02-27
**Confidence:** HIGH (npm official docs, shields.io docs, direct inspection of successful npm CLI packages, community best-practice articles)

---

## Context

This milestone is not about new product features. It is about publishing the already-built tool to npm with the artifacts that turn a working binary into a findable, trustworthy, installable package. The "features" here are publishing artifacts: README sections, package.json fields, and supporting files.

The tool being published: `claude-auto-continue` (alias: `cac`) — wraps Claude Code in a PTY, detects rate-limit messages, waits for reset, auto-resumes. Already ships v1.0 with full functionality.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist on any serious npm package page. Missing these = package feels abandoned or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| README with one-liner description | First line of README is shown in npm search results; without it the package is invisible | LOW | Currently missing entirely — top priority |
| Install command in README | Every CLI tool README must show `npm install -g <name>` prominently; users expect to copy-paste it | LOW | Single line; `npm install -g claude-auto-continue` |
| Usage example in README | Users need to see the command syntax before they install; no usage = no trust | LOW | `claude-auto-continue` or `cac` invocation with short explanation of what happens |
| `--help` output or equivalent documented | CLI users run `--help` first; README should show the same output so they can preview before install | LOW | CLI already has `--help`; just document it in README |
| author field in package.json | npm package page shows "Maintainers" section — empty author looks like an abandoned/bot package | LOW | Currently `""` — must be filled in before publish |
| version 1.0.0 in package.json | Currently `0.1.0`; milestone goal is to publish as 1.0.0; pre-1.0 signals "unstable API" | LOW | Single field change; semver convention matters for perception |
| license field in package.json | Displayed prominently on npm page sidebar; "ISC" is fine but must be present and accurate | LOW | Already `ISC`; acceptable for this type of tool |
| repository field in package.json | npm page sidebar shows "Repository" link; missing = no source code trust signal | LOW | Add `{ "type": "git", "url": "https://github.com/<user>/claude-auto-continue" }` |
| keywords in package.json (5-10 relevant terms) | npm search indexes keywords; affects search ranking directly | LOW | Currently has 5 keywords; can expand to improve discovery |
| engines field in package.json | Users on older Node versions must know before install; displayed on npm page | LOW | Already has `"node": ">=18"` — good, keep it |

### Differentiators (Competitive Advantage)

Features that make the package stand out from the noise of half-baked npm CLI tools.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| README "What it does" animated demo (GIF or asciicast) | A 30-second recording showing the countdown card and auto-resume is worth 1,000 words; converts skeptics | MEDIUM | Record with `asciinema` or `vhs`; host on GitHub; embed in README — competitive tools don't have this |
| Badges row at top of README | npm version, license, and node version badges give at-a-glance health signals; professional projects always have them | LOW | shields.io provides URLs: `https://img.shields.io/npm/v/claude-auto-continue`, `https://img.shields.io/npm/l/claude-auto-continue`, `https://img.shields.io/node/v/claude-auto-continue` |
| "How it works" section in README | Explains PTY wrapping, pattern detection, and auto-resume for users who want to trust the mechanism | LOW | 3-4 bullet points or a small ASCII diagram; builds credibility over shell-script alternatives |
| Explicit "Requirements" section in README | States `Claude Code` must be installed and in `$PATH`; prevents 90% of install-time confusion | LOW | One sentence: requires `claude` CLI from `@anthropic-ai/claude-code` |
| homepage field in package.json | Displayed in npm sidebar as a clickable link; send users to GitHub README or a dedicated page | LOW | Set to the GitHub repository URL; same as repository URL for a simple tool like this |
| bugs field in package.json | npm page shows "Report a vulnerability" / issues link; shows project is maintained | LOW | `{ "url": "https://github.com/<user>/claude-auto-continue/issues" }` |
| `files` field already correct in package.json | Only `dist/` and `bin/` published — small install footprint; `node_modules`, `src/`, `test/` excluded | LOW | Already correct in package.json — verify with `npm pack --dry-run` before publish |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem like good publishing practice but add noise without value for this tool.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Changelog / CHANGELOG.md in README | Convention in large projects | This is a v1.0 initial release; a changelog with one entry adds no value and looks like padding | If needed later, maintain CHANGELOG.md as a separate file; don't embed in README |
| API documentation section | Library packages need this | `claude-auto-continue` is a CLI, not a library; there is no importable API to document | Document the CLI flags and behavior; mention that there is no programmatic API |
| Contributing guide in README | Open source projects include this | Adds length before the user has even installed the tool; a distraction | Put in CONTRIBUTING.md or GitHub wiki if needed; keep README user-focused |
| Long "Background" / "Motivation" section | Authors often want to explain context | npmjs.com displays README top-to-bottom; long motivation pushes install instructions below the fold | One sentence of context is enough; get to "Install" fast |
| `prepublishOnly` test run in package.json | Some recommend running tests before publish | `prepublishOnly` already runs `build`; adding test run here means a slow publish and can fail in environments without all dev deps | Run tests manually before publish; `prepublishOnly` should remain `npm run build` only |
| `.npmignore` file | Often recommended to control published files | The `files` field in package.json already whitelists `dist/` and `bin/`; adding `.npmignore` creates a second source of truth that can contradict `files` | Use `files` field only (already done); verify with `npm pack --dry-run` |
| Scoped package name `@user/claude-auto-continue` | Scoped packages have unique namespaces | Adds friction (`npm install -g @user/claude-auto-continue` is harder to remember); unscoped name `claude-auto-continue` is cleaner for a public CLI tool | Keep the unscoped name; verify it is available before publish |

---

## Feature Dependencies

```
README with description
    └──enables──> npm search visibility (description indexed by npm)

README with install command
    └──requires──> version 1.0.0 in package.json (don't advertise a pre-1.0 install)
    └──requires──> author field filled in (looks abandoned without it)
    └──requires──> repository field in package.json (so users can find source)

Badges row
    └──requires──> version 1.0.0 published to npm (badge pulls live version from registry)
    └──requires──> repository field in package.json (license badge reads from npm metadata)

Demo GIF/asciicast
    └──enhances──> README credibility (visual proof over prose description)
    └──requires──> README "Usage" section (demo supplements, does not replace, text docs)

homepage field
    └──enhances──> npm sidebar display (shown as clickable link)
    └──conflicts──> leaving repository field as only URL (use both; they serve different sidebar positions)

keywords expansion
    └──enhances──> npm search ranking (more indexed terms without noise)
    └──requires──> description field quality (keywords amplify a good description; can't compensate for a bad one)
```

### Dependency Notes

- **author field required before publish:** npm associates package ownership with the account; the display name visible on the package page comes from the author field. Publishing with `""` makes the package look orphaned.
- **version 1.0.0 should precede any README instructions:** The README will say "install v1.0.0"; if the package.json still says `0.1.0` when published, the badge and npm install will serve the wrong version.
- **Demo GIF is high-value but not blocking:** It is the single best differentiator for a terminal tool (proof over prose) but the package can be published without it and the demo added in a follow-up patch release.
- **`files` field already correct:** Do not add `.npmignore`; the two mechanisms conflict and `files` wins, making `.npmignore` a source of confusion.

---

## MVP Definition

### Launch With (v1.0.0)

Minimum viable npm publish — what makes the package professional and trustworthy on day one.

- [x] version bumped to `1.0.0` in package.json — signals stable API to users; semver convention
- [x] author field filled in package.json — required for ownership display on npm page
- [x] repository field added to package.json — source trust signal; enables npm sidebar link
- [x] homepage field added to package.json — links to project page from npm sidebar
- [x] bugs field added to package.json — shows project is maintained; enables issue reporting link
- [x] keywords expanded to 8-10 relevant terms in package.json — improves npm search ranking
- [x] README.md written with: one-liner description, badges, requirements, install command, usage, how it works, options table — the complete user story before they install
- [x] `npm pack --dry-run` verified — confirms only `dist/` and `bin/` are published, no test or source leakage

### Add After Validation (v1.x)

Features to add once the 1.0.0 is live and the package URL is shareable.

- [ ] Demo GIF / asciicast embedded in README — record with `vhs` or `asciinema`; most impactful single addition post-launch; add in v1.0.1
- [ ] Badges row in README — npm version, license, and node version via shields.io; clean up after package is live so badge URLs resolve

### Future Consideration (v2+)

- [ ] CHANGELOG.md — only when there are multiple meaningful versions to document
- [ ] CONTRIBUTING.md — only if external contributors appear

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| README: description + install + usage | HIGH | LOW | P1 |
| version 1.0.0 in package.json | HIGH | LOW | P1 |
| author field in package.json | HIGH | LOW | P1 |
| repository field in package.json | HIGH | LOW | P1 |
| README: requirements (needs `claude` CLI) | HIGH | LOW | P1 |
| README: options / --help output | MEDIUM | LOW | P1 |
| homepage field in package.json | MEDIUM | LOW | P1 |
| bugs field in package.json | MEDIUM | LOW | P1 |
| keywords expanded (8-10 terms) | MEDIUM | LOW | P1 |
| npm pack --dry-run verification | HIGH | LOW | P1 |
| README: how it works (brief) | MEDIUM | LOW | P1 |
| Badges row (npm version, license, node) | MEDIUM | LOW | P2 |
| Demo GIF / asciicast in README | HIGH | MEDIUM | P2 |
| CHANGELOG.md | LOW | LOW | P3 |
| CONTRIBUTING.md | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for launch — blocking publish
- P2: Should have — add in v1.0.1
- P3: Nice to have, future consideration

---

## README Section Order (Recommended)

This ordering maximizes value above the fold. Users scan top-down; get them to "install" fast.

1. **Title + one-line description** — what is it, in one sentence
2. **Badges row** — npm version, license, node version (shields.io URLs)
3. **Demo** — GIF or asciicast showing countdown card + auto-resume (if available at publish time)
4. **Requirements** — `node >= 18`, `claude` CLI from `@anthropic-ai/claude-code` installed
5. **Install** — `npm install -g claude-auto-continue` (or `cac` alias)
6. **Usage** — `claude-auto-continue` starts it; what the user sees; the `cac` alias
7. **How it works** — 3-4 bullet points: PTY wrap, pattern detection, countdown, auto-resume
8. **Options** — `--help` output rendered as a code block or table
9. **License** — ISC, one line

---

## package.json Fields: Impact Reference

| Field | npm Page Display | Search Ranking Impact | Current State |
|-------|------------------|-----------------------|---------------|
| `name` | Package title | HIGH — primary identifier | Good: `claude-auto-continue` |
| `version` | Version badge in header | N/A | Needs bump: `0.1.0` → `1.0.0` |
| `description` | Subtitle on page, shown in search results | HIGH — indexed for search | Good: "Automatically resumes Claude Code sessions after usage limits reset" |
| `keywords` | Listed on page, indexed by npm search | HIGH — direct ranking factor | Needs expansion: currently 5, aim for 8-10 |
| `author` | Maintainers section in sidebar | N/A | Missing: currently `""` |
| `license` | License badge in sidebar | N/A | Good: `ISC` |
| `repository` | Repository link in sidebar | MEDIUM — trust signal | Missing — add GitHub URL |
| `homepage` | Homepage link in sidebar | LOW — convenience | Missing — add GitHub URL |
| `bugs` | Bug tracker link | LOW — maintenance signal | Missing — add GitHub issues URL |
| `engines` | "Engines" in sidebar | LOW — install compatibility signal | Good: `"node": ">=18"` |
| `bin` | Install confirmation (CLI commands) | N/A | Good: both `claude-auto-continue` and `cac` |
| `files` | Controls what is published | N/A — affects install size | Good: `["dist/", "bin/"]` |

### Keywords to Use

Current: `claude`, `claude-code`, `auto-continue`, `rate-limit`, `cli`

Recommended additions: `automation`, `anthropic`, `pty`, `terminal`, `rate-limit-handler`, `auto-resume`

Rationale: `automation` and `anthropic` match how users search ("anthropic claude rate limit tool"); `auto-resume` matches user intent language ("auto resume claude"). Keep total under 12 to avoid keyword stuffing perception.

---

## Competitor Package Analysis (npm)

| Package | npm Page Quality | README Quality | Key Lessons |
|---------|-----------------|----------------|-------------|
| `@anthropic-ai/claude-code` | Excellent — full description, badges, links | Comprehensive — install, usage, full docs | Shows the ecosystem context our package lives in |
| `claude-code-manager` | Minimal — sparse README, few keywords | Weak — shows what NOT to do | Keyword stuffing without clear description harms credibility |
| `ccexp` | Average — description present, no badges | Acceptable — install present, usage minimal | One-paragraph README is the floor; we should exceed this |

Our package should aim for quality between `@anthropic-ai/claude-code` (full docs with dedicated website) and `ccexp` (minimal but functional). A focused README of 60-100 lines is the right size for a single-purpose CLI tool.

---

## Sources

- [npm Docs: About package README files](https://docs.npmjs.com/about-package-readme-files/) — official guidance on what npm displays from README (MEDIUM confidence — page content was CSS-heavy)
- [npm Docs: package.json reference](https://docs.npmjs.com/cli/v8/configuring-npm/package-json/) — canonical field definitions including `keywords`, `description`, `repository`, `bugs`, `homepage`, `engines`, `files` (HIGH confidence)
- [npm Docs: Publishing packages](https://docs.npmjs.com/cli/v8/commands/npm-publish/) — `files` field behavior, `prepublishOnly` lifecycle, `npm pack` verification (HIGH confidence)
- [nodejs-cli-apps-best-practices — lirantal/GitHub](https://github.com/lirantal/nodejs-cli-apps-best-practices) — zero-config startup, UX empathy, POSIX conventions, dependency minimization for CLI tools (HIGH confidence)
- [WebbyLab: Best practices for building CLI and publishing to npm](https://webbylab.com/blog/best-practices-for-building-cli-and-publishing-it-to-npm/) — bin field, .npmignore, visual demos, logging best practices (MEDIUM confidence)
- [Gleb Bahmutov: How I Organize README](https://glebbahmutov.com/blog/how-i-organize-readme/) — badge placement, section ordering, the five-badge pattern (HIGH confidence)
- [Shields.io: npm version badge](https://shields.io/badges/npm-version) — badge URL format for npm version, downloads, license, node version (HIGH confidence)
- [survivejs.com: Anatomy of a Package](https://survivejs.com/books/maintenance/packaging/anatomy/) — which fields show on npm page, keywords fill strategy, `files` whitelist pattern (MEDIUM confidence)
- [npm Blog: Publishing what you mean to publish](https://blog.npmjs.org/post/165769683050/publishing-what-you-mean-to-publish.html) — `files` vs `.npmignore` interaction; README and LICENSE always included (HIGH confidence)
- [npmjs.com: @anthropic-ai/claude-code package page](https://www.npmjs.com/package/@anthropic-ai/claude-code) — direct inspection of the ecosystem anchor package (MEDIUM confidence — page returned 403)

---
*Feature research for: npm publishing — README and package.json for claude-auto-continue*
*Researched: 2026-02-27*
