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

- [x] **RESM-01**: Tool waits until the parsed reset time before attempting to resume
- [x] **RESM-02**: Tool sends "continue" to the paused Claude Code session at reset time
- [x] **RESM-03**: Tool displays a visible countdown timer while waiting for reset
- [x] **RESM-04**: Tool handles EPIPE errors gracefully if Claude Code process dies during wait

### Multi-Session

~~Moved to Out of Scope — user prefers one session per terminal window.~~

### Infrastructure

- [x] **INFR-01**: Tool spawns Claude Code via node-pty (required — Claude Code hangs without real TTY)
- [x] **INFR-02**: Tool passes through Claude Code I/O transparently to the user's terminal
- [x] **INFR-03**: Tool is installable via npm and runnable as a CLI command

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
| Multi-session orchestration (MULT-01 through MULT-04) | User prefers one session per terminal window — separate instances |
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
| DETC-02 | Phase 1 | Done (01-02, 01-03) |
| DETC-03 | Phase 1 | Done (01-02) |
| DETC-04 | Phase 1 | Done (01-02) |
| DETC-05 | Phase 1 | Done (01-01) |
| RESM-01 | Phase 2 | Complete |
| RESM-02 | Phase 2 | Complete |
| RESM-03 | Phase 3 | Complete |
| RESM-04 | Phase 2 | Complete |
| MULT-01 | — | Out of Scope |
| MULT-02 | — | Out of Scope |
| MULT-03 | — | Out of Scope |
| MULT-04 | — | Out of Scope |
| INFR-01 | Phase 2 | Complete |
| INFR-02 | Phase 2 | Complete |
| INFR-03 | Phase 4 | Complete |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-27 after 01-03 completion — Phase 1 (Detection Engine) complete; DETC-02 covered by Scheduler (timestamp to timed callback bridge)*
