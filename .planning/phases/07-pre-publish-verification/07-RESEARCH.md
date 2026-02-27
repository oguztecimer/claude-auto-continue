# Phase 7: Pre-publish Verification - Research

**Researched:** 2026-02-27
**Domain:** npm pre-publish verification, CLI testing
**Confidence:** HIGH

## Summary

Phase 7 is a verification gate -- no code changes, only checks. The project is in excellent shape: all 91 tests pass, the tarball contains exactly the right files (dist/, bin/, LICENSE, README.md, package.json -- no node_modules/ or test files), the CLI binary outputs help text cleanly, and the package version reads 1.0.0.

The only check that cannot be pre-verified by Claude is `npm whoami` which requires the user's npm authentication. The plan should run all automated checks and then prompt the user to verify npm auth.

**Primary recommendation:** Run all four success criteria checks in sequence. The first three are fully automatable; the fourth (npm auth) requires user confirmation.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
No locked decisions -- all verification steps are defined by roadmap success criteria.

### Claude's Discretion
- All verification steps are well-defined by the roadmap success criteria
- Failure handling approach (fix-and-rerun vs skip)
- Depth of CLI binary verification (--help vs additional checks)
- Whether to verify tarball excludes specific directories (.planning/, test files)
- Order of verification steps

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PUBL-01 | Pre-publish verification passes (npm pack --dry-run confirms correct files) | All four success criteria verified during research. Tests pass (91/91), tarball correct, CLI works, npm auth is the only user-dependent check. |
</phase_requirements>

## Standard Stack

No new libraries needed. This phase uses only existing project tooling:

| Tool | Version | Purpose | Why |
|------|---------|---------|-----|
| vitest | ^2.1.9 | Test runner | Already configured, `npm test` maps to `vitest run` |
| npm | system | Pack dry-run, auth check | Built-in npm CLI commands |
| node | >=18 | CLI binary execution | Runtime already installed |
| tsc | ^5.9.3 | Build step (prepublishOnly) | Already configured |

## Architecture Patterns

Not applicable -- this phase runs verification commands, not code changes.

### Verification Sequence

The recommended order (fastest-fail-first):

1. **`npm test`** -- catches code regressions (91 tests, ~324ms)
2. **`npm run build`** -- ensures dist/ is fresh from source (prepublishOnly runs this anyway)
3. **`npm pack --dry-run`** -- verifies tarball contents match expectations
4. **`node dist/cli.js --help`** -- confirms the binary entry point works
5. **`npm whoami`** -- confirms npm authentication (user-dependent)

### Expected Outputs

**npm test:** 8 test files, 91 tests, all passing
**npm pack --dry-run:** 31 files including dist/*.js, dist/*.d.ts, dist/*.js.map, bin/claude-auto-continue.js, LICENSE, README.md, package.json. No node_modules/, no test/, no .planning/, no src/.
**node dist/cli.js --help:** Prints usage text with options, examples, and description. Exit code 0.
**npm whoami:** Returns npm username. Requires `npm login` to have been run.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tarball inspection | Custom file listing | `npm pack --dry-run` | npm's own view of what ships |
| Test execution | Manual test runs | `npm test` | Uses project's vitest config |
| Build verification | Manual tsc | `npm run build` | Uses project's tsconfig |

## Common Pitfalls

### Pitfall 1: Stale dist/ directory
**What goes wrong:** dist/ was built from older source; tarball ships outdated code
**Why it happens:** Developer edits src/ but forgets to rebuild
**How to avoid:** Run `npm run build` before `npm pack --dry-run`. The `prepublishOnly` script handles this during actual publish, but for dry-run verification, build explicitly.
**Warning signs:** File timestamps in dist/ older than src/ timestamps

### Pitfall 2: npm auth not configured
**What goes wrong:** `npm whoami` fails, blocking publish
**Why it happens:** npm tokens expire or were never set up on this machine
**How to avoid:** Run `npm whoami` as part of pre-publish checklist. If it fails, run `npm login`.
**Warning signs:** `npm ERR! code ENEEDAUTH`

### Pitfall 3: MaxListenersExceededWarning in tests
**What goes wrong:** Node.js emits a warning about too many event listeners during ProcessSupervisor tests
**Why it happens:** Tests create multiple PTY instances that add resize listeners
**How to avoid:** This is a test-only warning, not a failure. Tests still pass. Could be addressed post-publish by increasing maxListeners in test setup.
**Warning signs:** Warning in test output (does not affect exit code)

## Code Examples

### Verification Commands
```bash
# 1. Run all tests
npm test

# 2. Build from source
npm run build

# 3. Verify tarball contents
npm pack --dry-run

# 4. Test CLI binary
node dist/cli.js --help

# 5. Verify npm auth
npm whoami
```

### Tarball Content Expectations
```
Expected files (31 total):
- package.json (version 1.0.0)
- README.md
- LICENSE
- bin/claude-auto-continue.js
- dist/*.js (9 files)
- dist/*.d.ts (9 files)
- dist/*.js.map (9 files)

Must NOT contain:
- node_modules/
- test/
- src/
- .planning/
- tsconfig.json
- .git/
```

## State of the Art

Not applicable -- standard npm verification workflow. No recent changes to npm pack behavior.

## Open Questions

1. **npm account name**
   - What we know: The user needs to be authenticated to npm
   - What's unclear: Which npm account will be used for publishing
   - Recommendation: The plan should verify `npm whoami` and display the account name for user confirmation. This is a checkpoint requiring user acknowledgment.

## Sources

### Primary (HIGH confidence)
- Direct project investigation: package.json, dist/, bin/, test output, npm pack --dry-run output
- npm CLI documentation for pack, whoami commands

## Metadata

**Confidence breakdown:**
- Verification commands: HIGH - directly tested during research
- Tarball contents: HIGH - verified via npm pack --dry-run
- Test status: HIGH - all 91 tests pass as of research time
- npm auth: MEDIUM - cannot verify user's auth state, only the command

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable tooling, no fast-moving dependencies)

---
## RESEARCH COMPLETE

**Phase:** 7 - Pre-publish Verification
**Confidence:** HIGH

### Key Findings
- All 91 tests pass across 8 test files in ~324ms
- Tarball contains 31 files: dist/, bin/, LICENSE, README.md, package.json -- no unwanted files
- CLI binary (`node dist/cli.js --help`) works correctly, prints help text
- npm auth (`npm whoami`) is the only user-dependent check
- The `prepublishOnly` script handles build automatically during `npm publish`

### File Created
`.planning/phases/07-pre-publish-verification/07-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | No new tools, all verified in-project |
| Architecture | HIGH | Simple command sequence, no complexity |
| Pitfalls | HIGH | Directly observed during research |

### Open Questions
- npm account authentication status (user-dependent)

### Ready for Planning
Research complete. Planner can now create PLAN.md files.
