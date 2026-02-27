# Phase 8: Publish - Research

**Researched:** 2026-02-27
**Domain:** npm registry publishing, account creation, smoke testing
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Smoke test scope:** Full functional test — install globally in a clean environment, run against a real Claude Code session, verify the complete auto-continue cycle triggers (rate limit detection, countdown, auto-resume)
- **Clean environment:** Fresh directory, no local node_modules, simulates a real user's first install
- **Registry propagation:** Wait a few minutes between publishing and smoke testing to allow npm registry propagation
- **Publish procedure format:** Step-by-step checklist (not just a command to copy-paste)
- **npm account:** User does not have an npm account yet — account creation is part of this phase's procedure
- **2FA:** Skip 2FA setup for now — can add later
- **Package name:** Unscoped — `claude-auto-continue` (not @dakmor/claude-auto-continue)
- **Name availability:** Verify package name availability on npm before attempting to publish
- **Pre-publish trust:** Trust Phase 7's pre-publish verification — no redundant dry-run before publish
- **Post-publish actions:** No announcement needed — just publish and verify; clean up `.planning/` directory after successful publish
- **Recovery plan:** Patch release (1.0.1) for critical bugs — do not use npm unpublish

### Claude's Discretion

- Node.js version testing strategy for smoke test
- Whether to create a GitHub release/tag for v1.0.0
- Whether to add npm badges to README as part of this phase or defer
- Whether to include pre-planned debug steps for common failure modes (node-pty build issues, permissions, etc.)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PUBL-02 | Package published to npm registry as 1.0.0 | npm account creation flow, session-based auth (Dec 2025 changes), `npm login` + `npm publish` procedure, name availability check via `npm view` |
| PUBL-03 | Post-publish smoke test confirms `npm install -g claude-auto-continue` works | Clean environment setup with nvm, native addon (node-pty) build requirements, propagation delay, functional cycle verification |
</phase_requirements>

---

## Summary

Publishing `claude-auto-continue@1.0.0` to npm is a user-action-only phase — Claude cannot run `npm publish` or create npm accounts on the user's behalf. The phase decomposes into two sequential human tasks: (1) create an npm account and publish the package, and (2) smoke-test the published package in a clean environment to prove end-users can install and run it.

**Critical context (December 2025 npm auth change):** As of December 9, 2025, npm classic tokens have been permanently revoked. `npm login` now issues a two-hour session token (not a long-lived token). The session token is invisible in the npm UI — it works silently. For a first-time manual publish from a local terminal, `npm login` followed immediately by `npm publish` is the correct procedure (session stays alive for two hours, which is more than enough).

The package has a native C++ dependency (`node-pty`) that compiles via `node-gyp` at install time. The smoke test environment must have build tools available (Xcode CLT on macOS, `build-essential` on Linux). The README already documents this. The smoke test must exercise the full auto-continue loop — rate limit hit, countdown, auto-resume — not just `--help`.

**Primary recommendation:** Write a numbered checklist plan with explicit verification commands at every step, include the account-creation flow, and give the user pre-planned debug steps for the two most common failure modes (node-pty build failure, permissions on global install).

---

## Standard Stack

### Core

| Tool/CLI | Version | Purpose | Why Standard |
|----------|---------|---------|--------------|
| npm CLI | Ships with Node >=18 | Publishing to registry | Only official publish mechanism |
| npmjs.com | n/a | Account creation, web UI verification | Official registry website |
| `npm login` | session-based as of Dec 2025 | Authenticate local terminal | Required before publish |
| `npm publish` | n/a | Upload tarball to registry | The publish command |
| `npm view <pkg>` | n/a | Check name availability, verify live | Standard verification command |
| `npm install -g` | n/a | Smoke test global install | Standard global install path |

### Supporting

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `nvm` | Clean Node environment for smoke test | Best way to create an isolated, fresh Node install on macOS/Linux |
| `node-gyp` (transitive) | Compiles node-pty native addon at install time | Runs automatically — user needs build tools present |
| `gh release create` | Create GitHub release/tag v1.0.0 | If Claude's discretion recommends it — after npm publish succeeds |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `npm login` session | Granular access token | Token is more CI-friendly, but adds complexity for a one-time manual publish; session token is simpler for first-time use |
| Manual `npm publish` | `np` or `release-it` | Tools like `np` add safeguards but are overkill for a single v1.0.0 publish; user explicitly decided no release automation |
| nvm clean env | Docker container | Docker is more isolated but requires Docker Desktop; nvm is lower friction on macOS |

---

## Architecture Patterns

### Publish Procedure (Checklist Pattern)

This phase is entirely a user-action checklist. The plan should produce a walkable document, not implementation code. Each step includes a verification command so the user knows it succeeded before moving on.

**Pattern: Verify → Act → Verify**

Every action in the checklist follows the pattern:
1. Verify pre-condition (check state before acting)
2. Execute the action
3. Verify post-condition (confirm it worked)

### Smoke Test Pattern

The smoke test uses nvm to create a clean Node environment that doesn't share global modules with the development environment:

```bash
# Create an isolated env using a specific node version
nvm install 20        # or nvm use 20 if already installed
nvm exec 20 npm install -g claude-auto-continue
nvm exec 20 claude-auto-continue --help
```

For the full functional test, the user must actually run against Claude Code (not just `--help`). The smoke test requirement is:

1. Install globally in a fresh environment
2. Launch `claude-auto-continue` (or `clac`)
3. Let Claude Code hit a usage limit
4. Observe: countdown card appears, timer counts down, `continue` auto-sent
5. Confirm Claude Code resumes

### Anti-Patterns to Avoid

- **Publishing without checking name availability first:** `npm view claude-auto-continue` MUST return a 404-style error ("npm ERR! code E404") before publishing. If it returns data, the name is taken.
- **Running smoke test immediately after publish:** npm registry propagation takes a few minutes. `npm view claude-auto-continue` returning version data is the gate before attempting `npm install -g`.
- **Testing smoke test in the same node environment as development:** Global node_modules from the development environment can mask missing dependencies. Use nvm or a fresh shell.
- **Using npm unpublish for bugs:** User has explicitly decided patch release (1.0.1) is the recovery path. npm unpublish has a 72-hour window and causes confusion for any users who already installed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Package availability check | Custom HTTP call to registry API | `npm view <pkg>` | Built-in, handles auth, returns correct E404 |
| Published package verification | Manual curl to registry | `npm view claude-auto-continue version` | Canonical check, works after propagation |
| Clean test environment | Delete global node_modules manually | `nvm exec <version>` with fresh install | Isolated by design, doesn't break development env |

---

## Common Pitfalls

### Pitfall 1: npm Login Session Expiry (NEW as of Dec 2025)

**What goes wrong:** User runs `npm login`, does other things, comes back an hour+ later, tries `npm publish` — gets auth error.
**Why it happens:** Session tokens are now two-hour-lived. They do not appear in the npm UI (tokens page is empty), so users don't realize they have one.
**How to avoid:** Run `npm login` immediately before `npm publish` in the same terminal session. The entire checklist should be done in one sitting (takes <15 minutes total).
**Warning signs:** `npm ERR! code E401` or `npm ERR! need auth` after a delay.

### Pitfall 2: Email Not Verified Before First Publish

**What goes wrong:** User creates account on npmjs.com, goes straight to CLI publish, gets error about needing email verification.
**Why it happens:** npm requires email verification before the first publish. The verification email may land in spam.
**How to avoid:** Create account → check email immediately → click verification link → confirm verified → then go to CLI.
**Warning signs:** `npm ERR! publish Failed PUT 403` with message about email verification.

### Pitfall 3: node-pty Build Failure on Smoke Test Machine

**What goes wrong:** `npm install -g claude-auto-continue` fails with `node-gyp` errors during the native addon compilation step.
**Why it happens:** `node-pty` is a native C++ addon. It needs Python 3, `make`, and a C++ compiler (`g++` or Xcode CLT) at install time. If the smoke test machine doesn't have Xcode Command Line Tools, the compile fails.
**How to avoid:** Before smoke testing, verify: `xcode-select -p` returns a path (macOS). On Linux: `which make && which g++`.
**Warning signs:** `gyp ERR! build error`, `Error: ENOENT: no such file or directory`, references to `node_modules/node-pty/build`.

### Pitfall 4: Global Install Permission Errors with Homebrew Node

**What goes wrong:** `npm install -g` requires `sudo` or fails with `EACCES` permission denied.
**Why it happens:** Node installed via Homebrew (not nvm) uses a directory that requires elevated permissions for global installs.
**How to avoid:** Use nvm for the smoke test environment — nvm installs node in `~/.nvm/` which is user-owned. `npm install -g` works without `sudo`.
**Warning signs:** `npm ERR! Error: EACCES: permission denied, mkdir '/usr/local/lib/node_modules/claude-auto-continue'`.

### Pitfall 5: Package Name Already Taken

**What goes wrong:** `npm publish` returns `403 Forbidden` — name is taken by another user.
**Why it happens:** `claude-auto-continue` is a plausible name that may have been registered. Must check before attempting publish.
**How to avoid:** Run `npm view claude-auto-continue` BEFORE publishing. If it returns `npm ERR! code E404`, the name is free. If it returns package data, need to pick a different name.
**Warning signs:** `npm ERR! 403 Forbidden - PUT https://registry.npmjs.org/claude-auto-continue - Package name too similar to existing packages` or similar.

### Pitfall 6: `prepublishOnly` Script Runs Build — Build May Fail

**What goes wrong:** `npm publish` triggers `prepublishOnly` which runs `npm run build` (i.e., `tsc`). If the TypeScript build has errors, publish fails.
**Why it happens:** `package.json` has `"prepublishOnly": "npm run build"`. Phase 7 should have verified this, but worth being aware.
**How to avoid:** Phase 7's pre-publish verification covers this. If `npm publish` fails with a TS error, run `npm run build` separately to see the error.
**Warning signs:** `npm ERR! code ELIFECYCLE` during publish.

---

## Code Examples

### Check Package Name Availability

```bash
# Source: npm CLI docs
npm view claude-auto-continue
# Expected output if free: npm ERR! code E404 npm ERR! 404 Not Found - GET https://registry.npmjs.org/claude-auto-continue
# Expected output if taken: returns JSON metadata for the existing package
```

### Authenticate and Publish

```bash
# Source: npm docs + Dec 2025 session auth changes
npm login
# Opens browser for web-based login (npm 8.14+/9+) OR prompts for username/password
# Session token lasts 2 hours — proceed immediately

npm publish
# No flags needed for unscoped public package
# prepublishOnly hook runs tsc automatically
# Output: "npm notice Publishing to https://registry.npmjs.org/"
# Output: "+ claude-auto-continue@1.0.0"
```

### Verify Publication

```bash
# Wait 2-5 minutes for registry propagation, then:
npm view claude-auto-continue
# Should return package metadata including version: '1.0.0', author: 'dakmor', etc.

npm view claude-auto-continue version
# Short form: returns just "1.0.0"
```

### Smoke Test with Clean Environment (macOS/nvm)

```bash
# Source: nvm docs, npm install -g docs
nvm install 20            # or pick node 18 for minimum supported
nvm use 20

# Install from registry (NOT local)
npm install -g claude-auto-continue

# Verify binary is on PATH
which claude-auto-continue
which clac

# Basic sanity check
claude-auto-continue --help

# Full functional test (requires Claude Code installed in this env)
clac
# Then trigger a rate limit in Claude Code, observe countdown and auto-resume
```

### Create GitHub Release (Claude's Discretion — Recommended)

```bash
# Source: gh CLI docs
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0

gh release create v1.0.0 \
  --title "v1.0.0" \
  --notes "Initial public release. Install: npm install -g claude-auto-continue"
```

### Clean Up .planning Directory (Post-Success)

```bash
# Remove planning artifacts from working tree (not from git history)
rm -rf .planning/
git add -A
git commit -m "chore: remove planning artifacts post-publish"
git push
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| npm classic tokens (long-lived) | Session tokens via `npm login` (2h) | December 9, 2025 | Must `npm login` immediately before publish; can't use saved token file |
| `npm adduser` (alias for `npm login`) | `npm login` (same behavior, `adduser` still works) | Stable | No impact — either command works |
| `--access public` flag required for scoped packages | Not needed for unscoped | Stable | `claude-auto-continue` (unscoped) needs no `--access` flag |
| `npm publish --provenance` | Still exists but requires OIDC/CI | Stable | Project explicitly excluded this (see REQUIREMENTS.md) |

**Deprecated/outdated:**
- npm classic tokens: Permanently revoked December 9, 2025. Do not look for them in the npm UI — they're gone.
- `.npmrc` with `_authToken=` for local publish: Still works for granular tokens, but the session-based `npm login` flow is simpler for a one-time manual publish.

---

## Open Questions

1. **Is `claude-auto-continue` currently available as a package name?**
   - What we know: Web search found no package of this name in the registry. The name is plausible but not confirmed free.
   - What's unclear: Cannot confirm availability without running `npm view claude-auto-continue` against the live registry.
   - Recommendation: Make `npm view claude-auto-continue` step 1 in the plan's checklist. If taken, fallback to `claude-autocontinue` or `auto-continue-claude`.

2. **Should the plan include a GitHub release tag?**
   - What we know: Standard practice for npm-published OSS packages is to create a matching git tag and GitHub release.
   - What's unclear: User didn't mandate it; it's Claude's discretion.
   - Recommendation: YES — include `git tag v1.0.0 && git push origin v1.0.0 && gh release create v1.0.0` as a step after successful npm publish. Takes 30 seconds, gives users a changelog entry and source tarball. Aligns with professional OSS practice.

3. **Should npm badges be added to README in this phase?**
   - What we know: The README already has npm version and node version badges (shields.io). They resolve to live data once the package is on the registry.
   - What's unclear: The badges appear to already be present (`[![npm version](https://img.shields.io/npm/v/claude-auto-continue.svg)]`). They just resolve to "N/A" or show an error until the package is live.
   - Recommendation: No README change needed. Badges auto-activate once published. Verify they render correctly as a post-publish check.

4. **Node.js version testing strategy for smoke test**
   - What we know: Package requires `node >= 18`. User has Node.js via nvm (assumed from macOS dev environment).
   - What's unclear: Should the smoke test be on Node 18 (minimum) or Node 20/22 (current LTS)?
   - Recommendation: Test on Node 20 LTS (most common user environment) and note that Node 18 is the minimum. Testing both would be ideal but is likely overkill for v1.0.0.

---

## Validation Architecture

`workflow.nyquist_validation` is not present in `.planning/config.json` — this section is skipped per agent instructions.

---

## Sources

### Primary (HIGH confidence)

- [GitHub Changelog Dec 9 2025](https://github.blog/changelog/2025-12-09-npm-classic-tokens-revoked-session-based-auth-and-cli-token-management-now-available/) — Session token behavior, classic token revocation
- [GitHub Changelog Nov 5 2025](https://github.blog/changelog/2025-11-05-npm-security-update-classic-token-creation-disabled-and-granular-token-changes/) — Granular token changes
- [npm Docs: Creating and publishing unscoped public packages](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/) — Official publish flow
- [npm Docs: Creating a new user account](https://docs.npmjs.com/creating-a-new-npm-user-account/) — Account creation requirements
- [ApostropheCMS npm cheat sheet Dec 2025](https://apostrophecms.com/blog/npm-cheat-sheet-how-to-publish-and-deploy-modules-after-december-9th-2025) — Verified Dec 2025 auth changes (two-hour session tokens)

### Secondary (MEDIUM confidence)

- [DEV Community: Publishing Your First NPM Package](https://dev.to/mir_mursalin_ankur/publishing-your-first-npm-package-a-real-world-guide-that-actually-helps-4l4) — Verified first-publish steps align with official docs
- [GitHub community: npm registry propagation](https://github.com/orgs/community/discussions/46463) — "a few minutes" propagation delay, `npm view` as readiness gate
- [nvm-sh/nvm](https://github.com/nvm-sh/nvm) — Clean environment pattern for smoke testing

### Tertiary (LOW confidence)

- Web search results on node-pty global install failure modes — common patterns, not officially documented; treated as plausible pitfalls to pre-plan for

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm publish flow is stable and well-documented; Dec 2025 auth changes verified via GitHub official changelog
- Architecture (checklist pattern): HIGH — straightforward procedure, no novel architecture
- Pitfalls: MEDIUM-HIGH — auth change (HIGH, verified); node-pty build issues (MEDIUM, well-known native addon pattern); email verification (HIGH, official docs); propagation delay (MEDIUM, community-verified)
- Open questions: LOW — package name availability cannot be confirmed without live registry check

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable domain; auth changes are recent but settled)
