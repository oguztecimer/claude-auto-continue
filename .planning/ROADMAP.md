# Roadmap: Claude Auto-Continue

## Overview

Build a Node.js CLI tool that keeps unattended Claude Code sessions alive across usage-limit pauses. The work proceeds in four dependency-ordered phases: pure detection logic first (testable without any PTY), single-session PTY integration second (the hardest technical layer), multi-session coordination third (the core user requirement), and CLI packaging last (makes it installable). Each phase delivers something independently verifiable before the next is started.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Detection Engine** - Configurable rate-limit pattern detection with rolling buffer, ANSI stripping, and timestamp parsing — fully unit-tested with no PTY dependency (3/3 plans complete, DONE 2026-02-27)
- [x] **Phase 2: Single-Session PTY Wrapper** - One Claude Code session spawned in a real PTY, detected, waited on, and resumed automatically with EPIPE-safe stdin writing (completed 2026-02-27)
- [ ] **Phase 3: Multi-Session and Status Display** - 2-5 concurrent sessions monitored simultaneously, each with independent state and a live per-session status display
- [ ] **Phase 4: CLI Packaging and Distribution** - Installable npm package with a runnable CLI command and clean user-facing help

## Phase Details

### Phase 1: Detection Engine
**Goal**: Users have a tested, configurable engine that reliably detects rate-limit messages and parses reset timestamps from buffered, ANSI-stripped PTY output
**Depends on**: Nothing (first phase)
**Requirements**: DETC-01, DETC-02, DETC-03, DETC-04, DETC-05
**Success Criteria** (what must be TRUE):
  1. Given PTY output containing the rate-limit message (split across multiple data chunks), the detector identifies the hit and returns the parsed reset timestamp
  2. Given PTY output with ANSI escape codes wrapping the rate-limit text, the detector still matches correctly (raw output does not match; stripped output does)
  3. Given a custom detection regex set via config, the detector uses that pattern instead of the default, allowing format changes to be handled without code edits
  4. The PatternDetector and Scheduler modules have unit tests that pass without spawning any real process or PTY
**Plans**: 3 plans
- [x] 01-01-PLAN.md — Project bootstrap + config loader (Wave 1) — DONE 2026-02-27
- [x] 01-02-PLAN.md — PatternDetector TDD (Wave 2) — DONE 2026-02-27
- [x] 01-03-PLAN.md — Scheduler TDD (Wave 2) — DONE 2026-02-27

### Phase 2: Single-Session PTY Wrapper
**Goal**: A single Claude Code session runs inside a real PTY, transparently passes I/O to the user's terminal, auto-detects the rate-limit hit, waits until reset, and sends "continue" — surviving unexpected Claude Code exits without crashing
**Depends on**: Phase 1
**Requirements**: INFR-01, INFR-02, RESM-01, RESM-02, RESM-04
**Success Criteria** (what must be TRUE):
  1. Running the tool wraps a Claude Code session in a PTY and all Claude Code output appears in the user's terminal exactly as if Claude Code were run directly
  2. When Claude Code hits the rate limit, the tool waits until the parsed reset time and then sends "continue" to resume the paused session without user intervention
  3. If Claude Code exits unexpectedly during the wait window, the tool catches the EPIPE error gracefully and exits cleanly rather than crashing with an unhandled exception
  4. The four-state machine (RUNNING, LIMIT_DETECTED, WAITING, RESUMING) transitions correctly and the current state is visible in output
**Plans**: 2 plans
- [x] 02-01-PLAN.md — StdinWriter TDD + node-pty install (Wave 1) — DONE 2026-02-27
- [x] 02-02-PLAN.md — ProcessSupervisor TDD — four-state PTY orchestrator (Wave 2) — DONE 2026-02-27

### Phase 3: Multi-Session and Status Display
**Goal**: Users can run 2-5 Claude Code sessions simultaneously, each monitored independently, with a live status display showing per-session state and countdown — dead sessions removed without affecting running ones
**Depends on**: Phase 2
**Requirements**: MULT-01, MULT-02, MULT-03, MULT-04, RESM-03
**Success Criteria** (what must be TRUE):
  1. Starting the tool with N sessions (2-5) spawns N independent Claude Code PTY processes, each monitored in isolation with its own state machine
  2. The status display shows each session's current state (running / waiting / resuming / dead) and, for waiting sessions, a live countdown to the reset time
  3. When one session hits the rate limit, the others continue running unaffected — limit detection in one session does not block or disturb any other
  4. When a Claude Code process exits unexpectedly, its session is removed from the display and monitoring continues for the remaining sessions without a crash
**Plans**: TBD

### Phase 4: CLI Packaging and Distribution
**Goal**: The tool is installable from npm as a global CLI command that users can invoke directly, with helpful usage output for bad invocations
**Depends on**: Phase 3
**Requirements**: INFR-03
**Success Criteria** (what must be TRUE):
  1. After `npm install -g claude-auto-continue`, running `claude-auto-continue --help` prints usage instructions without error
  2. Running `claude-auto-continue` (or its short alias) starts the tool the same way as running it via `node dist/cli.js` directly
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Detection Engine | 3/3 | Complete | 2026-02-27 |
| 2. Single-Session PTY Wrapper | 2/2 | Complete   | 2026-02-27 |
| 3. Multi-Session and Status Display | 0/? | Not started | - |
| 4. CLI Packaging and Distribution | 0/? | Not started | - |
