# Phase 8: Publish - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Publish `claude-auto-continue@1.0.0` to the npm registry and verify it installs and works correctly for any Node.js >=18 user. Covers npm account creation, publishing, and post-publish smoke testing. Pre-publish verification is Phase 7's responsibility.

</domain>

<decisions>
## Implementation Decisions

### Smoke test scope
- Full functional test: install globally in a clean environment, run against a real Claude Code session, verify the complete auto-continue cycle triggers (rate limit detection, countdown, auto-resume)
- Test in a clean environment (fresh directory, no local node_modules) simulating a real user's first install
- Wait a few minutes between publishing and smoke testing to allow npm registry propagation

### Publish procedure
- Step-by-step checklist format (not just a command to copy-paste)
- Includes npm account creation — user does not have an npm account yet
- Skip 2FA setup for now — can add later
- Unscoped package name: `claude-auto-continue` (not @dakmor/claude-auto-continue)
- Verify package name availability on npm before attempting to publish
- Trust Phase 7's pre-publish verification (no redundant dry-run before publish)

### Post-publish actions
- No announcement needed — just publish and verify
- Clean up `.planning/` directory after successful publish

### Recovery plan
- Patch release (1.0.1) for critical bugs — do not use npm unpublish
- Handle runtime debug steps ad-hoc if needed

### Claude's Discretion
- Node.js version testing strategy for smoke test
- Whether to create a GitHub release/tag for v1.0.0
- Whether to add npm badges to README as part of this phase or defer
- Whether to include pre-planned debug steps for common failure modes (node-pty build issues, permissions, etc.)

</decisions>

<specifics>
## Specific Ideas

- User needs npm account created as part of the procedure — this is a first-time publish
- Checklist should be walkable step-by-step, with verification at each stage
- Smoke test must prove the full loop works: launch tool, hit a rate limit, see countdown, watch it auto-resume

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-publish*
*Context gathered: 2026-02-27*
