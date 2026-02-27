---
phase: 02-single-session-pty-wrapper
verified: 2026-02-27T12:51:30Z
status: passed
score: 12/12 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Run the tool against a real Claude Code session approaching rate limit"
    expected: "Output appears identically to running Claude Code directly; after rate limit hit the terminal shows 'continue' being typed automatically at reset time"
    why_human: "PTY passthrough transparency and real-time auto-resume require a live Claude Code session to validate end-to-end"
  - test: "Let Claude Code exit unexpectedly during the WAITING window (kill the process manually)"
    expected: "Tool exits cleanly with no unhandled exception or crash output on stderr"
    why_human: "EPIPE race condition on real PTY requires live process interaction to trigger"
---

# Phase 2: Single-Session PTY Wrapper — Verification Report

**Phase Goal:** A single Claude Code session runs inside a real PTY, transparently passes I/O to the user's terminal, auto-detects the rate-limit hit, waits until reset, and sends "continue" — surviving unexpected Claude Code exits without crashing

**Verified:** 2026-02-27T12:51:30Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

All truths are derived from the four Phase 2 Success Criteria in ROADMAP.md, plus plan-level must_haves in 02-01-PLAN.md and 02-02-PLAN.md.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Claude Code spawned in real PTY via node-pty with correct options (TERM, cols, rows, cwd, env) | VERIFIED | `ProcessSupervisor.spawn()` calls `this.#spawnFn(command, args, { name: TERM, cols, rows, cwd, env })` at lines 75-81 |
| 2 | All PTY output written to process.stdout unconditionally in all states | VERIFIED | `process.stdout.write(data)` at line 87, outside any state guard; confirmed by test "PTY output is written to process.stdout" |
| 3 | User keystrokes forwarded to PTY in RUNNING state; discarded in other states | VERIFIED | `stdin.on('data')` handler at line 109 with `if (this.#state === SessionState.RUNNING)` guard; isTTY guard prevents crash in test env |
| 4 | Rate limit detected via PatternDetector; transitions RUNNING -> LIMIT_DETECTED -> WAITING | VERIFIED | `#detector.on('limit', ...)` wired in constructor; `#onLimitDetected` sets states at lines 134+142; test confirms WAITING state after detection |
| 5 | Scheduler called with parsed reset time on limit detection | VERIFIED | `this.#scheduler.scheduleAt(event.resetTime, callback)` at line 140 in `#onLimitDetected` |
| 6 | Resume sequence (Escape + "continue\r") sent to PTY when Scheduler fires | VERIFIED | `this.#writer!.write('\x1b')` at line 155, `this.#writer!.write('continue\r')` at line 157; test verifies ordering (escIdx < contIdx) |
| 7 | Full state machine RUNNING -> LIMIT_DETECTED -> WAITING -> RESUMING -> RUNNING transitions correctly | VERIFIED | `#onLimitDetected` and `#onResumeReady` implement all four transitions; 10 tests cover all paths including transient states |
| 8 | Post-resume cooldown suppresses false-positive re-detections for 30 seconds | VERIFIED | `#cooldownUntil = Date.now() + this.#cooldownMs` at line 161; guard `Date.now() < this.#cooldownUntil` at line 130; test confirms suppression |
| 9 | Terminal resize events forwarded to PTY | VERIFIED | `process.stdout.on('resize', () => ptyProcess.resize(...))` at lines 119-121 |
| 10 | On PTY exit: StdinWriter.markDead() called, Scheduler cancelled, process.stdin.unref() called | VERIFIED | `onExit` handler at lines 95-103: `markDead()`, `scheduler.cancel()`, `process.stdin.unref()` all present |
| 11 | EPIPE errors from pty.write() caught silently; non-EPIPE errors logged to stderr; post-markDead writes are no-ops | VERIFIED | `StdinWriter.write()` at lines 11-21: dead-flag check, try/catch, EPIPE discrimination, stderr log; all 5 StdinWriter tests pass |
| 12 | Claude Code exiting during wait window does not crash the process | VERIFIED | `markDead()` sets dead flag before `#writer.write()` can be called; EPIPE in write() is caught; `onExit` callback injectable to prevent test runner death |

**Score:** 12/12 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/StdinWriter.ts` | EPIPE-safe PTY write wrapper, exports StdinWriter | VERIFIED | 31 lines (min_lines: 15). Exports `StdinWriter` class. Private fields `#pty`, `#dead`. Methods: `write()`, `markDead()`, getter `isDead`. |
| `test/StdinWriter.test.ts` | Unit tests for EPIPE guard behavior | VERIFIED | 65 lines (min_lines: 40). 5 tests: forwards writes, no-op after markDead, catches EPIPE, logs non-EPIPE to stderr, isDead getter. All pass. |
| `src/ProcessSupervisor.ts` | Four-state PTY orchestrator, exports ProcessSupervisor + SessionState | VERIFIED | 179 lines (min_lines: 80). Exports `ProcessSupervisor` class and `const enum SessionState`. All four states implemented. |
| `test/ProcessSupervisor.test.ts` | State machine unit tests with mocked node-pty | VERIFIED | 229 lines (min_lines: 100). 10 tests covering all state transitions, resume sequence ordering, cooldown, WAITING detector bypass, and clean exit. All pass. |

---

## Key Link Verification

### Plan 02-01 Key Links (StdinWriter)

| From | To | Via | Status | Evidence |
|------|----|-----|--------|----------|
| `src/StdinWriter.ts` | `node-pty IPty.write()` | `try/catch` wrapper around `this.#pty.write(data)` | WIRED | Line 14: `this.#pty.write(data)` inside `try` block at lines 13-21; EPIPE caught at line 17 |

### Plan 02-02 Key Links (ProcessSupervisor)

| From | To | Via | Status | Evidence |
|------|----|-----|--------|----------|
| `src/ProcessSupervisor.ts` | `src/PatternDetector.ts` | `detector.on('limit', handler)` + `detector.feed(data)` + `detector.reset()` | WIRED | Line 60: `on('limit', ...)`, line 90: `feed(data)`, line 164: `reset()` |
| `src/ProcessSupervisor.ts` | `src/Scheduler.ts` | `scheduler.scheduleAt(resetTime, callback)` + `scheduler.cancel()` | WIRED | Line 140: `scheduleAt(event.resetTime, ...)`, lines 97 and 174: `cancel()` |
| `src/ProcessSupervisor.ts` | `src/StdinWriter.ts` | `writer.write(data)` for resume + `writer.markDead()` on exit | WIRED | Lines 155-157: `write('\x1b')` and `write('continue\r')` in `#onResumeReady`; line 96: `markDead()` in `onExit` handler; line 112: `write()` in stdin forwarding |
| `src/ProcessSupervisor.ts` | `node-pty` | `this.#spawnFn(...)` call to create IPty instance | WIRED | Line 75: `this.#spawnFn(command, args, { ... })` with correct options object |

---

## Requirements Coverage

All five requirement IDs declared across both plans are accounted for.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| RESM-04 | 02-01-PLAN.md | Tool handles EPIPE errors gracefully if Claude Code dies during wait | SATISFIED | `StdinWriter.write()` try/catch silences EPIPE; `markDead()` makes all post-exit writes no-ops; 5 tests verify all error paths |
| INFR-01 | 02-02-PLAN.md | Tool spawns Claude Code via node-pty (required — Claude Code hangs without real TTY) | SATISFIED | `ProcessSupervisor.spawn()` calls `this.#spawnFn(command, args, ptyOptions)` where spawnFn defaults to `pty.spawn` from node-pty; node-pty in production dependencies |
| INFR-02 | 02-02-PLAN.md | Tool passes through Claude Code I/O transparently to the user's terminal | SATISFIED | `ptyProcess.onData(data => process.stdout.write(data))` unconditional at line 87; stdin forwarding via StdinWriter in RUNNING state at line 112 |
| RESM-01 | 02-02-PLAN.md | Tool waits until the parsed reset time before attempting to resume | SATISFIED | `this.#scheduler.scheduleAt(event.resetTime, callback)` at line 140 delegates timing to Scheduler (verified in Phase 1) |
| RESM-02 | 02-02-PLAN.md | Tool sends "continue" to the paused Claude Code session at reset time | SATISFIED | `#onResumeReady()` sends `'\x1b'` then `'continue\r'` via StdinWriter at lines 155-157; test verifies ordering and content |

**Orphaned requirements check:** REQUIREMENTS.md traceability table assigns RESM-01, RESM-02, RESM-04, INFR-01, INFR-02 to Phase 2. All five appear in plan frontmatter. No orphaned requirements.

---

## Anti-Patterns Found

No blocker or warning anti-patterns found.

Scan of `src/StdinWriter.ts` and `src/ProcessSupervisor.ts`:
- No TODO/FIXME/XXX/HACK/PLACEHOLDER comments
- No stub return patterns (`return null`, `return {}`, `return []`)
- No empty handler implementations
- `process.stderr.write()` used for diagnostics (correct — not console.log which would pollute PTY stdout)

---

## Human Verification Required

### 1. Live PTY Passthrough Transparency

**Test:** Run `node dist/ProcessSupervisor.js` (or invoke it via a small integration shim) against a real Claude Code binary and observe terminal output during a normal session.

**Expected:** Claude Code's UI, colors, interactive prompts, and cursor behavior appear identically to running `claude` directly — no garbled output, no missing escape sequences, no terminal state corruption.

**Why human:** PTY fidelity for arbitrary ANSI sequences and interactive TUI behavior cannot be verified by grep or static analysis. Requires a live terminal session.

### 2. Auto-Resume at Rate Limit (End-to-End)

**Test:** Let a Claude Code session hit the usage limit through normal use (or simulate it). Observe the tool behavior from limit detection through resume.

**Expected:** Tool logs `[SessionState] LIMIT_DETECTED`, `WAITING`, then at reset time logs `RESUMING` and `RUNNING`; Claude Code session continues without user intervention.

**Why human:** Requires a real rate-limit event from Claude Code's API. The exact output format of the rate-limit message in the wild may differ subtly from test fixtures.

### 3. EPIPE Survival on Unexpected Claude Code Exit

**Test:** During the WAITING window, kill the Claude Code process externally (`kill -9 <pid>`).

**Expected:** Tool exits cleanly with exit code 0 (or the Claude Code exit code), no `UnhandledPromiseRejection`, no `ERR_EPIPE` crash on stderr.

**Why human:** The EPIPE race condition — between the dead-flag check in `markDead()` and an in-flight `pty.write()` call — requires a real PTY process to trigger reliably. Unit tests mock the race but cannot reproduce real kernel-level EPIPE timing.

---

## Verified Commits

All four commits documented in SUMMARYs exist in git history:

| Commit | Message | Verified |
|--------|---------|---------|
| `ff63587` | test(02-01): add failing StdinWriter tests | Yes |
| `ee595b7` | feat(02-01): implement StdinWriter EPIPE-safe write wrapper | Yes |
| `2ad82a2` | test(02-02): add failing ProcessSupervisor state machine tests | Yes |
| `6bcfb51` | feat(02-02): implement ProcessSupervisor four-state PTY orchestrator | Yes |

---

## Test Suite Results

```
 Test Files  5 passed (5)
      Tests  45 passed (45)
   Duration  277ms
```

- Phase 1 tests (PatternDetector 15 + Scheduler 8 + config 7): 30 passing — no regressions
- Phase 2 Plan 01 (StdinWriter): 5 passing
- Phase 2 Plan 02 (ProcessSupervisor): 10 passing

TypeScript: `npx tsc --noEmit` exits clean (0 errors).

---

## Gaps Summary

No gaps. All automated verifications pass:

- Both source artifacts exist, are substantive (31 and 179 lines respectively), and are fully wired
- Both test artifacts exist, are substantive (65 and 229 lines respectively), and test the correct units
- All five key links (StdinWriter -> pty.write, ProcessSupervisor -> PatternDetector/Scheduler/StdinWriter/node-pty) are confirmed wired with concrete line references
- All five requirement IDs (INFR-01, INFR-02, RESM-01, RESM-02, RESM-04) are fully satisfied with implementation evidence
- node-pty installed as production dependency in package.json and present in node_modules
- All four TDD commits (RED + GREEN for each plan) exist in git history
- Zero anti-patterns found in source files
- 45/45 tests pass; TypeScript compiles cleanly

Three items flagged for human verification (live PTY fidelity, real rate-limit auto-resume, EPIPE race on real PTY) — these are inherently runtime behaviors that cannot be verified statically.

---

_Verified: 2026-02-27T12:51:30Z_
_Verifier: Claude (gsd-verifier)_
