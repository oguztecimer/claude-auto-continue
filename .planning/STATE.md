# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-27)

**Core value:** Unattended Claude Code sessions that automatically resume after usage limits reset — no manual babysitting
**Current focus:** Phase 1 - Detection Engine

## Current Position

Phase: 1 of 4 (Detection Engine)
Plan: 2 of 3 in current phase
Status: In progress
Last activity: 2026-02-27 — Completed 01-02 (PatternDetector TDD — 15 tests, all passing)

Progress: [██░░░░░░░░] 17% (2/12 estimated total plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: 3 min
- Total execution time: 6 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-detection-engine | 2/3 | 6 min | 3 min |

**Recent Trend:**
- Last 5 plans: 2 min, 4 min
- Trend: slight increase

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: node-pty is non-negotiable for Claude Code PTY spawning (hangs without real TTY)
- [Roadmap]: CommonJS over ESM to avoid node-pty native module interop friction
- [Roadmap]: PatternDetector and Scheduler built as pure logic modules (no I/O) so they can be unit-tested before any PTY work
- [01-01]: strip-ansi@6 pinned (not v7) — v7 is ESM-only, incompatible with this CJS project
- [01-01]: loadConfig() never throws — any error silently returns {} to prevent config issues crashing the process
- [01-01]: CONFIG_PATH uses os.homedir() — cross-platform Linux/macOS support, never hardcode paths
- [01-02]: Human-time parsing ignores IANA timezone — parse hour/minute/meridiem only, trust local clock; avoids tz-data dependency
- [01-02]: reset() clears buffer AND #detected flag — intentional re-arm semantics for retry cycles
- [01-02]: rawMatch is last 500 chars of buffer — provides context without exposing full history

### Pending Todos

None.

### Blockers/Concerns

- [Phase 2]: Exact resume command sequence uncertain — send `continue\r` directly vs Escape-first. Needs hands-on verification against real Claude Code before StdinWriter is finalized
- [Phase 2]: Post-resume false positive risk — `/rate-limit-options` re-execution bug (issue #14129) may cause immediate re-detection after resume. Cooldown duration (30s? 60s?) needs empirical measurement
- [Phase 1]: Rate-limit message format has two variants (pipe-delimited unix timestamp vs human-readable time). Which appears under which conditions needs verification

## Session Continuity

Last session: 2026-02-27
Stopped at: Completed 01-02-PLAN.md (PatternDetector TDD, 2 tasks, 22 tests passing)
Resume file: None
