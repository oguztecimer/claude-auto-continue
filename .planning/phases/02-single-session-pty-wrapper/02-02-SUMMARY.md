---
phase: 02-single-session-pty-wrapper
plan: "02"
subsystem: infra
tags: [node-pty, state-machine, pty, tdd, vitest, process-supervisor]

# Dependency graph
requires:
  - phase: 02-01
    provides: StdinWriter EPIPE-safe write wrapper for PTY processes
  - phase: 01-detection-engine
    provides: PatternDetector (EventEmitter, feeds rate-limit events), Scheduler (scheduleAt/cancel)
provides:
  - ProcessSupervisor class: four-state PTY orchestrator (RUNNING/LIMIT_DETECTED/WAITING/RESUMING)
  - SessionState const enum exported for Phase 3 status display
  - Dependency-injectable spawnFn constructor option for unit testing without vi.mock()
affects: [03-status-display, 04-multi-session]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Four-state machine with transient states (LIMIT_DETECTED, RESUMING are synchronous transitions)"
    - "Dependency injection via constructor option (spawnFn) avoids module-level mocking"
    - "Cooldown guard (Date.now() < cooldownUntil) prevents false-positive re-detection post-resume"
    - "isTTY guard prevents setRawMode crash in test environments"
    - "onExit callback override enables process.exit isolation in tests"

key-files:
  created:
    - src/ProcessSupervisor.ts
    - test/ProcessSupervisor.test.ts
  modified: []

key-decisions:
  - "const enum SessionState (not regular enum) — TypeScript inlines values, no runtime object"
  - "spawnFn injected via constructor option — avoids vi.mock() module-level magic in tests"
  - "onExit callback injectable — prevents actual process.exit() from killing test runner"
  - "LIMIT_DETECTED and RESUMING are transient synchronous states — no timer or await between them and their successor state"
  - "Cooldown uses Date.now() comparison not a separate timer — simpler, no cancel needed"
  - "detector.feed() gated on RUNNING state check — WAITING/RESUMING/LIMIT_DETECTED all suppress detection"

patterns-established:
  - "Pattern: Constructor options bag with optional overrides for all side effects (spawnFn, onExit, cooldownMs, safetyMs)"
  - "Pattern: Private class fields (#field) for all internal state — prevents accidental mutation in tests"
  - "Pattern: process.stderr.write() for all diagnostic output — never console.log which pollutes stdout/PTY"

requirements-completed: [INFR-01, INFR-02, RESM-01, RESM-02]

# Metrics
duration: 2min
completed: 2026-02-27
---

# Phase 2 Plan 02: ProcessSupervisor Summary

**Four-state PTY orchestrator with dependency-injected node-pty spawn, rate-limit auto-detection via PatternDetector, timed resume via Scheduler, and 30s cooldown suppression — 45 tests passing**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-27T09:46:50Z
- **Completed:** 2026-02-27T09:48:42Z
- **Tasks:** 2 (TDD: RED then GREEN)
- **Files modified:** 2

## Accomplishments

- ProcessSupervisor class implementing the complete RUNNING -> LIMIT_DETECTED -> WAITING -> RESUMING -> RUNNING state machine
- Ten unit tests covering all state transitions, resume sequence ordering, cooldown suppression, and WAITING-state detector bypass
- TypeScript const enum SessionState exported for Phase 3 status display integration
- All 45 tests passing (35 pre-existing + 10 new ProcessSupervisor tests), zero TypeScript errors

## Task Commits

1. **Task 1: Create failing ProcessSupervisor tests (RED)** - `2ad82a2` (test)
2. **Task 2: Implement ProcessSupervisor to pass all tests (GREEN)** - `6bcfb51` (feat)

_Note: TDD plan — RED commit then GREEN commit as separate atomic steps._

## Files Created/Modified

- `src/ProcessSupervisor.ts` — Four-state PTY orchestrator: 179 lines; exports ProcessSupervisor class and SessionState const enum
- `test/ProcessSupervisor.test.ts` — State machine unit tests with mocked node-pty: 229 lines; 10 tests

## Decisions Made

- **const enum SessionState** — TypeScript inlines values at compile time; no runtime object allocation. String values (not numeric) for readable stderr logs.
- **spawnFn dependency injection** — Constructor option `spawnFn?: typeof pty.spawn` allows tests to pass a `vi.fn().mockReturnValue(mockPty)` without `vi.mock()` module magic. Avoids ESM/CJS module mock pitfalls.
- **onExit callback injectable** — `onExit?: (code: number) => void` defaults to `process.exit`. Tests pass `vi.fn()` to prevent the test runner from dying.
- **LIMIT_DETECTED and RESUMING are synchronous/transient** — No `await` or timer between seeing the limit event and entering WAITING; no gap between writing resume keys and returning to RUNNING. This means state reads in tests are deterministic.
- **Cooldown via Date.now() comparison** — `this.#cooldownUntil = Date.now() + cooldownMs` set at resume time; detection guard checks `Date.now() < this.#cooldownUntil`. No extra timer to cancel. Works correctly with `vi.useFakeTimers()` because `vi.runAllTimers()` advances Date.now() in the fake timer environment.
- **detector.feed() gated on RUNNING** — The `if (this.#state === SessionState.RUNNING)` check in the onData handler means all other states transparently pass output to stdout but never trigger detection.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ProcessSupervisor is complete and fully tested — ready for Phase 3 (status display / TUI overlay)
- SessionState enum exported and accessible for Phase 3 status rendering
- Blockers noted in STATE.md remain theoretical until hands-on verification:
  - Exact resume sequence (ESC + "continue\r") needs live Claude Code validation
  - Cooldown duration (30s) may need empirical adjustment based on false-positive frequency

---
*Phase: 02-single-session-pty-wrapper*
*Completed: 2026-02-27*

## Self-Check: PASSED

- FOUND: src/ProcessSupervisor.ts
- FOUND: test/ProcessSupervisor.test.ts
- FOUND: .planning/phases/02-single-session-pty-wrapper/02-02-SUMMARY.md
- FOUND commit: 2ad82a2 (test RED)
- FOUND commit: 6bcfb51 (feat GREEN)
