# Phase 3: Single-Session Status Display - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a visible status display to the single-session PTY wrapper. When the session hits a rate limit, show a live countdown timer to the reset time. Show state transitions (running/waiting/resuming) with color-coded feedback. The tool remains a single-session-per-terminal-window design — multi-session orchestration is out of scope.

**Scope change from original ROADMAP:** Multi-session support (MULT-01 through MULT-04) moved to Out of Scope. User runs multiple terminal windows independently, each with its own `claude-auto-continue` instance. Phase 3 now focuses solely on the status display for a single session (RESM-03).

</domain>

<decisions>
## Implementation Decisions

### Status display position and visibility
- Status bar at the **top** of the terminal, always visible
- Session output flows below the status bar — full PTY experience preserved
- Status bar shows: session state (Running/Waiting/Resuming), countdown timer when waiting, working directory

### State visual feedback
- **Color-coded** states: green for running, yellow for waiting, red for dead
- Countdown timer updates **every second** while waiting — feels responsive and confirms the tool is working

### All-waiting countdown view
- When the session is waiting, show a **centered countdown card** with:
  - Session name/working directory
  - Live countdown to reset time
  - Absolute reset time (e.g., "at 2:45 PM")

### Dead session handling
- When the session dies, show "Dead" in red briefly (~5 seconds), then the tool exits automatically

### Session initialization
- Default (no args) = **single session** in current directory — backward compatible with Phase 2
- Claude Code arguments passed through after `--` separator (e.g., `claude-auto-continue -- --continue`)
- Auto-exit when the session exits, with a brief summary

### Claude's Discretion
- Status bar exact styling and border characters
- Countdown card layout details
- How to handle terminal resize with the status bar
- Whether to use a TUI library (blessed, ink) or raw ANSI escape codes

</decisions>

<specifics>
## Specific Ideas

- Status bar should feel like tmux's status line — compact, informative, not intrusive
- The countdown timer should tick every second so it's clear the tool is alive and working
- User explicitly does NOT want session switching, multi-session focus management, or hotkeys — one session per terminal window

</specifics>

<deferred>
## Deferred Ideas

- Multi-session orchestration within one process (MULT-01 through MULT-04) — moved to Out of Scope. User prefers separate terminal windows.
- Dynamic session adding/removing — not needed with single-session model
- Session scrollback management — not needed with single-session (PTY scrollback handled by terminal emulator)

</deferred>

---

*Phase: 03-single-session-status-display*
*Context gathered: 2026-02-27*
