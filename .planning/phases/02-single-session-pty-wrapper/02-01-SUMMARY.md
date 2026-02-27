---
phase: 02-single-session-pty-wrapper
plan: "01"
subsystem: pty
tags: [node-pty, epipe, tdd, typescript, pty-wrapper]

# Dependency graph
requires:
  - phase: 01-detection-engine
    provides: PatternDetector and Scheduler as pure logic modules; CJS project structure established
provides:
  - StdinWriter class: EPIPE-safe wrapper around IPty.write() with markDead() dead-flag pattern
  - node-pty installed as production dependency
affects:
  - 02-02 (ProcessSupervisor will import StdinWriter and call markDead() from onExit handler)
  - 02-03 (SessionManager uses ProcessSupervisor which uses StdinWriter)

# Tech tracking
tech-stack:
  added: [node-pty@1.1.0]
  patterns:
    - EPIPE-safe PTY write wrapper using try/catch with error code discrimination
    - Private class fields (#pty, #dead) for encapsulation — consistent with Phase 1 pattern
    - Dead-flag pattern: markDead() called from supervisor's onExit, write() becomes no-op

key-files:
  created:
    - src/StdinWriter.ts
    - test/StdinWriter.test.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "EPIPE silently swallowed: race condition between dead-check and pty.write() is expected, not an error"
  - "Non-EPIPE errors logged to stderr but not rethrown: prevents unhandled exception crashes while preserving observability"
  - "type-only import of node-pty: import type * as pty avoids runtime load in StdinWriter itself"

patterns-established:
  - "Dead-flag pattern: markDead() + isDead getter — ProcessSupervisor will call markDead() from onExit handler"
  - "Constructor injection of IPty: enables test mocking without dynamic import tricks"

requirements-completed: [RESM-04]

# Metrics
duration: 1min
completed: 2026-02-27
---

# Phase 2 Plan 01: StdinWriter Summary

**EPIPE-safe PTY write wrapper using try/catch with dead-flag pattern, enabling ProcessSupervisor to write to PTY without crashing on post-exit EPIPE races**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-02-27T09:43:39Z
- **Completed:** 2026-02-27T09:44:27Z
- **Tasks:** 2 (RED + GREEN TDD cycle)
- **Files modified:** 4

## Accomplishments

- Installed node-pty@^1.1.0 as production dependency
- Implemented StdinWriter with EPIPE-safe write wrapper (20-line class, exactly as planned)
- 5 unit tests covering: write forwarding, dead no-op, EPIPE catch, non-EPIPE stderr log, isDead getter
- All 35 tests pass (30 Phase 1 + 5 StdinWriter), TypeScript clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Install node-pty and create failing StdinWriter tests (RED)** - `ff63587` (test)
2. **Task 2: Implement StdinWriter to pass all tests (GREEN)** - `ee595b7` (feat)

_Note: TDD tasks have two commits (test RED -> feat GREEN)_

## Files Created/Modified

- `src/StdinWriter.ts` - EPIPE-safe IPty.write() wrapper with markDead()/isDead dead-flag
- `test/StdinWriter.test.ts` - 5 unit tests covering all StdinWriter behaviors
- `package.json` - Added node-pty@^1.1.0 to dependencies
- `package-lock.json` - Updated lockfile for node-pty

## Decisions Made

- EPIPE silently swallowed: the race between dead-flag check and pty.write() is an expected condition when PTY exits mid-write, not a bug
- Non-EPIPE errors (e.g., EBADF) logged to stderr but not rethrown: avoids crashes while preserving observability
- `import type * as pty` (type-only): keeps node-pty as a type-level dependency in StdinWriter.ts, avoiding any runtime import side-effects in this file

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- StdinWriter is ready for import by ProcessSupervisor (Plan 02-02)
- ProcessSupervisor will call `writer.markDead()` from PTY's onExit handler
- ProcessSupervisor will call `writer.write()` to send keystrokes to Claude Code PTY
- Blocker noted in STATE.md remains: exact resume command sequence (continue\\r vs Escape-first) needs empirical verification

---
*Phase: 02-single-session-pty-wrapper*
*Completed: 2026-02-27*

## Self-Check: PASSED

- src/StdinWriter.ts: FOUND
- test/StdinWriter.test.ts: FOUND
- 02-01-SUMMARY.md: FOUND
- commit ff63587 (RED): FOUND
- commit ee595b7 (GREEN): FOUND
