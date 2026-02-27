---
phase: 01-detection-engine
plan: 02
subsystem: core-detection
tags: [typescript, vitest, tdd, eventemitter, ansi, regex, timestamp-parsing]

# Dependency graph
requires:
  - "src/config.ts (loadConfig, ToolConfig) from plan 01-01"
  - "strip-ansi@6 installed"
provides:
  - "PatternDetector EventEmitter subclass detecting all three rate-limit message formats"
  - "LimitEvent interface with resetTime (Date|null) and rawMatch string"
  - "Rolling 4KB buffer with ANSI stripping for PTY stream input"
  - "Configurable pattern: constructor > config file > built-in default"
affects: [01-03, 02-stdin-writer, 03-process-supervisor]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "EventEmitter subclass with private class fields (#buffer, #detected, #pattern, #debug)"
    - "satisfies operator for type-safe event payload construction"
    - "Rolling buffer trim: slice(length - MAX_BUFFER) keeps last 4KB"
    - "ANSI stripping via stripAnsi() before buffer append"
    - "Human-time parsing: hour/minute/meridiem extraction with tomorrow rollover"
    - "vi.mock('../src/config.js') with vi.mocked() for CJS module mocking in vitest"

key-files:
  created:
    - "src/PatternDetector.ts — EventEmitter subclass, rolling buffer, 3-format regex, timestamp parsing"
    - "test/PatternDetector.test.ts — 15 unit tests covering all formats, edge cases, guards"
  modified: []

key-decisions:
  - "Human-time parsing ignores IANA timezone: parse hour/minute/meridiem only, trust local clock — avoids tz-data dependency"
  - "reset() clears buffer AND #detected flag: intentional re-arm semantics, not just buffer wipe"
  - "rawMatch is last 500 chars of buffer: provides context without exposing full possibly-trimmed history"
  - "HUMAN_TIME_PATTERN uses reset(?:s)? with optional 'at': handles both 'reset at 3pm' (Format B) and 'resets 4pm' (Format C)"
  - "DEFAULT_PATTERN matches pipe character as separator for Format A (not end-of-string): |1760000400 suffix enables unix-ts parse"

# Metrics
duration: 4min
completed: 2026-02-27
---

# Phase 1 Plan 02: PatternDetector Rate-Limit Detection Engine Summary

**EventEmitter subclass with 4KB rolling buffer, ANSI stripping, three-format regex, and timestamp parsing (unix epoch + human-readable) — TDD with 15 passing tests**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-27T09:18:26Z
- **Completed:** 2026-02-27T09:20:04Z
- **Tasks:** 2 (RED test file + GREEN implementation)
- **Files modified:** 2

## TDD Cycle

### RED Phase
Wrote `test/PatternDetector.test.ts` with 15 failing tests covering:
- All 3 format variants (legacy pipe, mid-era reset-at, current dot-resets)
- Unix epoch and human-readable timestamp parsing
- Custom pattern override (constructor and config file)
- ANSI stripping, chunk splitting, buffer overflow (4KB trim)
- Double-emit guard, reset/re-arm, debug mode stderr logging

Tests failed as expected: `PatternDetector` did not exist.

### GREEN Phase
Implemented `src/PatternDetector.ts`:
1. `EventEmitter` subclass with private class fields
2. Constructor: `loadConfig()` → merge with options, priority: constructor > config > default
3. `feed()`: `stripAnsi()` → append → trim to 4096 → test regex → emit
4. Timestamp parsing: unix epoch via `|(\d{10,})`, then human-readable via `reset(?:s)?\s+(?:at\s+)?...(\d{1,2}...[ap]m)`
5. Human-time parser: extract h/m/meridiem, build Date, roll to tomorrow if past
6. `#detected` guard: set on first match, early return until `reset()`
7. `reset()`: clears both `#buffer` and `#detected`
8. Debug mode: `process.stderr.write(...)` on every `feed()` call

One fix applied during GREEN: `HUMAN_TIME_PATTERN` initially used `resets?` which didn't match Format B's "reset at 3pm". Changed to `reset(?:s)?\s+(?:at\s+)?` to handle both forms.

### REFACTOR Phase
No changes — code was clean with no duplication. Tests confirmed still passing.

## Accomplishments
- PatternDetector detects all three known rate-limit message formats
- ANSI escape codes stripped before matching (handles colored/bold terminal output)
- Rolling buffer correctly joins chunks split across multiple `feed()` calls
- Unix timestamp (10+ digit) parsed to exact Date: `new Date(seconds * 1000)`
- Human-readable time (3pm, Feb 20 5pm) parsed with tomorrow-rollover logic
- Custom pattern overrides default (constructor wins over config file)
- Config file pattern used when no constructor option provided
- No double-emission after first detection (#detected private flag)
- `reset()` re-arms for next detection cycle (used by cooldown/retry logic in Phase 3)
- Null resetTime returned for custom pattern matches that embed no timestamp info
- All 22 tests across both test files pass; `tsc --noEmit` clean

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| RED | Add failing PatternDetector tests | `3955336` | test/PatternDetector.test.ts |
| GREEN | Implement PatternDetector | `f2f5faa` | src/PatternDetector.ts |

## Files Created/Modified
- `src/PatternDetector.ts` — EventEmitter subclass with rolling buffer, ANSI stripping, regex matching, timestamp parsing (163 lines)
- `test/PatternDetector.test.ts` — 15 unit tests for all detection scenarios (231 lines)

## Decisions Made
- **No IANA timezone resolution:** Parsing hour/minute/meridiem without tz-data library. Timezone label (e.g., "Europe/Berlin") is discarded — local clock is used. This is intentional per project decision: accuracy good enough for ~1h reset windows
- **reset(?:s)? with optional 'at':** Unified HUMAN_TIME_PATTERN covers Format B ("reset at 3pm") and Format C ("resets 4pm") with one regex
- **rawMatch = last 500 chars:** Provides enough context for debugging/logging without exposing potentially-trimmed historical buffer content

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] HUMAN_TIME_PATTERN didn't match Format B "reset at" phrasing**
- **Found during:** GREEN phase, after initial implementation
- **Issue:** Initial `HUMAN_TIME_PATTERN` used `resets?` which matched "reset " and "resets " but not "reset at " (Format B: "Your limit will reset at 3pm")
- **Fix:** Changed to `reset(?:s)?\s+(?:at\s+)?` to accept both "resets 4pm" and "reset at 3pm"
- **Files modified:** `src/PatternDetector.ts`
- **Commit:** `f2f5faa` (fixed inline before GREEN commit)

## Next Phase Readiness
- `PatternDetector` and `LimitEvent` are ready for import by the PTY spawner in Phase 2
- `reset()` method is ready for the cooldown/retry scheduler in Phase 3
- All test patterns cover the detection scenarios identified in RESEARCH.md
- Zero external dependencies added (strip-ansi was already installed in Plan 01)

## Self-Check: PASSED

- src/PatternDetector.ts: FOUND (163 lines, min 80 required)
- test/PatternDetector.test.ts: FOUND (231 lines, min 100 required)
- .planning/phases/01-detection-engine/01-02-SUMMARY.md: FOUND
- Commit 3955336 (RED phase): FOUND
- Commit f2f5faa (GREEN phase): FOUND

---
*Phase: 01-detection-engine*
*Completed: 2026-02-27*
