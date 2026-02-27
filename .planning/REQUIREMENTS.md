# Requirements: Claude Auto-Continue

**Defined:** 2026-02-27
**Core Value:** Unattended Claude Code sessions that automatically resume after usage limits reset

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Detection

- [x] **DETC-01**: Tool detects "Claude usage limit reached" message in Claude Code terminal output
- [x] **DETC-02**: Tool parses the reset timestamp from the rate-limit message
- [x] **DETC-03**: Tool strips ANSI escape codes before pattern matching to handle colored/styled output
- [x] **DETC-04**: Tool uses a rolling buffer to handle chunk boundary splitting (message split across data events)
- [x] **DETC-05**: Detection pattern is configurable to handle future Claude Code format changes

### Resume

- [ ] **RESM-01**: Tool waits until the parsed reset time before attempting to resume
- [ ] **RESM-02**: Tool sends "continue" to the paused Claude Code session at reset time
- [ ] **RESM-03**: Tool displays a visible countdown timer while waiting for reset
- [ ] **RESM-04**: Tool handles EPIPE errors gracefully if Claude Code process dies during wait

### Multi-Session

- [ ] **MULT-01**: Tool supports monitoring 2-5 concurrent Claude Code sessions simultaneously
- [ ] **MULT-02**: Tool displays per-session status (waiting/running/resumed/dead)
- [ ] **MULT-03**: Tool gracefully removes dead sessions from monitoring without crashing
- [ ] **MULT-04**: Each session has an independent write channel for sending "continue"

### Infrastructure

- [ ] **INFR-01**: Tool spawns Claude Code via node-pty (required — Claude Code hangs without real TTY)
- [ ] **INFR-02**: Tool passes through Claude Code I/O transparently to the user's terminal
- [ ] **INFR-03**: Tool is installable via npm and runnable as a CLI command

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhancements

- **ENHC-01**: Desktop notification when a session resumes
- **ENHC-02**: Configurable resume prompt text (beyond bare "continue")
- **ENHC-03**: Log of resume events to local file
- **ENHC-04**: Per-terminal session identity tracking to prevent wrong-session resume
- **ENHC-05**: Human-readable smart time formatting ("3 hours 22 minutes" vs seconds)

## Out of Scope

| Feature | Reason |
|---------|--------|
| `--dangerously-skip-permissions` passthrough | Security risk in unattended tool |
| GUI / web dashboard | Scope creep; terminal-native tool |
| Cross-tool migration (Claude → Gemini) | Fundamentally different product |
| Multi-agent orchestration (20+ agents) | Different product category entirely |
| Rate limit prediction / avoidance | Claude Code doesn't expose token usage data |
| Cloud sync / remote notifications | Requires server infrastructure; 10x complexity |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DETC-01 | Phase 1 | Done (01-02) |
| DETC-02 | Phase 1 | Done (01-02) |
| DETC-03 | Phase 1 | Done (01-02) |
| DETC-04 | Phase 1 | Done (01-02) |
| DETC-05 | Phase 1 | Done (01-01) |
| RESM-01 | Phase 2 | Pending |
| RESM-02 | Phase 2 | Pending |
| RESM-03 | Phase 3 | Pending |
| RESM-04 | Phase 2 | Pending |
| MULT-01 | Phase 3 | Pending |
| MULT-02 | Phase 3 | Pending |
| MULT-03 | Phase 3 | Pending |
| MULT-04 | Phase 3 | Pending |
| INFR-01 | Phase 2 | Pending |
| INFR-02 | Phase 2 | Pending |
| INFR-03 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-27 after 01-02 completion — DETC-01 through DETC-04 marked complete*
